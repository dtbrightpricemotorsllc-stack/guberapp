import { isIOS, isNativeApp } from "@/lib/platform";

// Cache the current APNs device token so unsubscribeFromPush() can remove it.
let currentApnsToken: string | null = null;

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

// ── Native iOS Capacitor push (APNs direct — supports custom sounds) ─────────

/**
 * Register for push notifications via the Capacitor native plugin.
 * This is the only path that delivers custom sounds on iOS because it
 * talks directly to APNs instead of going through Apple's Web Push Gateway.
 */
async function subscribeNativeIOS(userId: number): Promise<void> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    // Request permission
    const { receive } = await PushNotifications.requestPermissions();
    if (receive !== "granted") return;

    // Attach listeners BEFORE calling register() so the token event is never missed.
    PushNotifications.addListener("registration", async (token) => {
      currentApnsToken = token.value;
      try {
        await fetch("/api/push/apns-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceToken: token.value }),
          credentials: "include",
        });
      } catch (err) {
        console.warn("[push/apns] token upload failed:", err);
      }
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.warn("[push/apns] registration error:", err);
    });

    // Register with APNs — fires the 'registration' listener with the device token.
    await PushNotifications.register();
  } catch (err) {
    console.warn("[push/native] native push setup failed:", err);
  }
}

// ── Web-push VAPID (non-iOS browsers) ────────────────────────────────────────

export async function subscribeToPush(userId: number): Promise<void> {
  // Native iOS — use Capacitor plugin for APNs direct delivery with custom sounds
  if (isNativeApp && isIOS) {
    await subscribeNativeIOS(userId);
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
  // Native iOS — remove APNs token from both the plugin and the server
  if (isNativeApp && isIOS) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await PushNotifications.removeAllListeners();
      if (currentApnsToken) {
        await fetch("/api/push/apns-token", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceToken: currentApnsToken }),
          credentials: "include",
        });
        currentApnsToken = null;
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
