import { isAndroid, isIOS, isNativeApp } from "@/lib/platform";

// Cache the current native device token so unsubscribeFromPush() can remove it.
// On iOS this is an APNs hex token; on Android it is an FCM registration token.
// We track the route alongside the value so unsubscribe hits the right endpoint.
let currentNativeToken: { value: string; route: "/api/push/apns-token" | "/api/push/fcm-token" } | null = null;

const PUBLIC_KEY_URL = "/api/push/vapid-public-key";

// ── Push status helpers ───────────────────────────────────────────────────────

function isIOSDevice(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isRunningStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export type PushStatus =
  | "unsupported"        // browser has no PushManager
  | "ios-needs-install"  // iOS Safari, not installed as PWA
  | "denied"             // user blocked notifications
  | "granted"            // active push subscription
  | "default";           // permission not yet asked

export function getPushStatus(): PushStatus {
  // Native iOS Capacitor app — permissions handled natively
  if (isNativeApp && isIOS) {
    return "default";
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    if (isIOSDevice() && !isRunningStandalone()) return "ios-needs-install";
    return "unsupported";
  }
  if (isIOSDevice() && !isRunningStandalone()) return "ios-needs-install";
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "granted") return "granted";
  return "default";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ── Native Capacitor push (iOS APNs / Android FCM — supports custom sounds) ──

/**
 * Register for push notifications via the Capacitor native plugin.
 *
 * The same plugin (@capacitor/push-notifications) handles both platforms but
 * emits different token shapes:
 *   - iOS:     APNs hex device token (delivered server-side via @parse/node-apn)
 *   - Android: FCM registration token (delivered server-side via firebase-admin)
 *
 * We detect the platform and post the token to the appropriate endpoint.
 * This is the only delivery path that supports custom GUBER sounds on native;
 * the web-push VAPID gateway strips aps.sound on iOS Safari.
 */
async function subscribeNative(_userId: number): Promise<void> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const route: "/api/push/apns-token" | "/api/push/fcm-token" = isIOS
      ? "/api/push/apns-token"
      : "/api/push/fcm-token";
    const platformLabel = isIOS ? "apns" : "fcm";

    // Request permission
    const { receive } = await PushNotifications.requestPermissions();
    if (receive !== "granted") return;

    // Attach listeners BEFORE calling register() so the token event is never missed.
    PushNotifications.addListener("registration", async (token) => {
      currentNativeToken = { value: token.value, route };
      try {
        await fetch(route, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceToken: token.value }),
          credentials: "include",
        });
      } catch (err) {
        console.warn(`[push/${platformLabel}] token upload failed:`, err);
      }
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.warn(`[push/${platformLabel}] registration error:`, err);
    });

    // Register — fires the 'registration' listener with the device/registration token.
    await PushNotifications.register();
  } catch (err) {
    console.warn("[push/native] native push setup failed:", err);
  }
}

// ── Web-push VAPID (non-native browsers) ─────────────────────────────────────

export async function subscribeToPush(userId: number): Promise<void> {
  // Native iOS / Android — use Capacitor plugin for direct APNs / FCM delivery
  // with custom GUBER sounds.
  if (isNativeApp && (isIOS || isAndroid)) {
    await subscribeNative(userId);
    return;
  }

  // All other platforms — standard Web Push via VAPID
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await sendSubscriptionToServer(existing);
      return;
    }

    const keyRes = await fetch(PUBLIC_KEY_URL);
    if (!keyRes.ok) return;
    const { publicKey } = await keyRes.json();

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await sendSubscriptionToServer(subscription);
  } catch (err) {
    console.warn("[push] subscription failed:", err);
  }
}

async function sendSubscriptionToServer(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    }),
    credentials: "include",
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  // Native iOS / Android — remove the cached token from both the plugin and the server.
  if (isNativeApp && (isIOS || isAndroid)) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await PushNotifications.removeAllListeners();
      if (currentNativeToken) {
        await fetch(currentNativeToken.route, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceToken: currentNativeToken.value }),
          credentials: "include",
        });
        currentNativeToken = null;
      }
    } catch (err) {
      console.warn("[push/native] unsubscribe failed:", err);
    }
    return;
  }

  // Web push path
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch("/api/push/unsubscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
      credentials: "include",
    });
  } catch (err) {
    console.warn("[push] unsubscribe failed:", err);
  }
}
