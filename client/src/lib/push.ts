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
  // Native iOS / Android Capacitor app — permissions handled natively by the
  // @capacitor/push-notifications plugin, so we always report "default" so that
  // the UI prompt flows trigger subscribeNative() instead of bailing out as
  // "unsupported" (the WebView lacks PushManager).
  if (isNativeApp && (isIOS || isAndroid)) {
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
async function subscribeNative(_userId: number, opts?: { promptIfNeeded?: boolean }): Promise<boolean> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const route: "/api/push/apns-token" | "/api/push/fcm-token" = isIOS
      ? "/api/push/apns-token"
      : "/api/push/fcm-token";
    const platformLabel = isIOS ? "apns" : "fcm";

    // Apple Guideline 4.5.4 / Android 13 POST_NOTIFICATIONS: never trigger the
    // OS permission dialog from a non-user-initiated path. Check current state
    // first; if the user hasn't been asked yet ("prompt") and this call is the
    // automatic on-login subscriber, bail out quietly. The contextual in-app
    // prompts (dashboard / browse-jobs) call us with promptIfNeeded:true after
    // explaining why notifications are useful, which then drives the OS dialog.
    const current = await PushNotifications.checkPermissions();
    if (current.receive === "denied") return false;
    if (current.receive !== "granted") {
      if (opts?.promptIfNeeded === false) return false;
      const { receive } = await PushNotifications.requestPermissions();
      if (receive !== "granted") return false;
    }

    // Android 8+: notification channels MUST exist before FCM messages that
    // reference them are delivered — messages targeting a missing channel are
    // silently discarded by the OS. Create (or update) the "guber_default"
    // channel here so it exists before we call register(). createChannel() is
    // idempotent — calling it multiple times with the same ID is safe.
    if (isAndroid) {
      try {
        await PushNotifications.createChannel({
          id: "guber_default",
          name: "GUBER Alerts",
          description: "Job updates, payments, and nearby activity",
          importance: 4,           // IMPORTANCE_HIGH — shows heads-up banner
          visibility: 1,           // VISIBILITY_PUBLIC
          sound: "guber_default",  // matches guber_default.wav in res/raw/
          vibration: true,
          lights: true,
          lightColor: "#00E676",   // GUBER green
        });
      } catch (e) {
        console.warn("[push/fcm] createChannel failed:", e);
      }
    }

    // Remove any stale listeners from previous sessions before adding new ones.
    // Without this, every app open stacks an additional listener — on the 5th
    // launch you'd have 5 registration handlers all trying to upload the token.
    await PushNotifications.removeAllListeners();

    // Attach listeners BEFORE calling register() so the token event is never missed.
    PushNotifications.addListener("registration", async (token) => {
      currentNativeToken = { value: token.value, route };
      try {
        const res = await fetch(route, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceToken: token.value }),
          credentials: "include",
        });
        if (!res.ok) {
          // Retry once after a short delay — the session cookie may not yet be
          // flushed when the registration event fires on cold app launch.
          await new Promise((r) => setTimeout(r, 1500));
          await fetch(route, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceToken: token.value }),
            credentials: "include",
          });
        }
      } catch (err) {
        console.warn(`[push/${platformLabel}] token upload failed:`, err);
      }
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.warn(`[push/${platformLabel}] registration error:`, err);
    });

    // Deep-link handler: fired when the user TAPS a notification from the
    // background or the app is launched from a closed state via a push.
    // Without this listener, tapping a notification opens the app at the
    // home screen and the URL in the payload is never acted on.
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      try {
        const url: string | undefined =
          (action.notification.data as any)?.url ||
          (action.notification as any)?.data?.url;
        if (url && url !== "/" && typeof window !== "undefined") {
          // Give the React router a tick to mount before navigating.
          setTimeout(() => { window.location.href = url; }, 100);
        }
      } catch {}
    });

    // Foreground handler: belt-and-suspenders alongside presentationOptions.
    // presentationOptions: ['alert','badge','sound'] in capacitor.config.ts
    // already shows foreground banners on iOS 10+; this handler fires too but
    // we don't need to do anything extra — the OS shows the banner itself.
    PushNotifications.addListener("pushNotificationReceived", (_notification) => {
      // No-op: the OS presents the alert via presentationOptions config.
      // Add custom in-app logic here if needed in future (e.g. toast overlay).
    });

    // Register — fires the 'registration' listener with the device/registration token.
    await PushNotifications.register();
    return true;
  } catch (err) {
    console.warn("[push/native] native push setup failed:", err);
    return false;
  }
}

// ── Web-push VAPID (non-native browsers) ─────────────────────────────────────

/**
 * Subscribe the user to push. Returns true if permission was granted and the
 * registration call succeeded; false if denied, dismissed, or otherwise blocked.
 * Callers (modals, prompts) use the return value to decide whether to show
 * success UI — `getPushStatus()` is unreliable on native (always returns
 * "default" because the WebView can't read the OS permission directly).
 */
export async function subscribeToPush(
  userId: number,
  opts?: { promptIfNeeded?: boolean },
): Promise<boolean> {
  // Native iOS / Android — use Capacitor plugin for direct APNs / FCM delivery
  // with custom GUBER sounds.
  if (isNativeApp && (isIOS || isAndroid)) {
    return await subscribeNative(userId, opts);
  }

  // All other platforms — standard Web Push via VAPID
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await sendSubscriptionToServer(existing);
      return true;
    }

    const keyRes = await fetch(PUBLIC_KEY_URL);
    if (!keyRes.ok) return false;
    const { publicKey } = await keyRes.json();

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await sendSubscriptionToServer(subscription);
    return true;
  } catch (err) {
    console.warn("[push] subscription failed:", err);
    return false;
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
