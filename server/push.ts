import webpush from "web-push";
import { db } from "./db";
import { pushSubscriptions } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:noreply@guberapp.app";

let vapidConfigured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
    console.log("[push] VAPID configured — push notifications active");
  } catch (e) {
    console.warn("[push] VAPID config failed:", e);
  }
} else {
  console.warn("[push] VAPID keys missing — push notifications disabled");
}

export type PushAction = { action: string; title: string };

/**
 * Returns APNs-specific HTTP headers when the push endpoint is Apple's Web Push
 * gateway (web.push.apple.com). These headers must be present so that iOS 16.4+
 * treats the notification as a visible alert rather than a silent background push.
 *
 * References:
 *   https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
 *   https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns#2947607
 *   web-push options.headers: https://github.com/web-push-libs/web-push#sendnotificationpushsubscription-payload-options
 *
 * Research note on custom sounds:
 * VAPID web-push to Apple's gateway does NOT support custom sounds via the
 * aps.sound field. Apple's gateway translates the encrypted web-push payload to
 * APNs internally without exposing aps.sound to callers. The system default
 * notification sound is always used. Custom sounds require a native Capacitor
 * push plugin (APNs direct) instead of the VAPID web-push path.
 * See also: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
 */
function apnsHeaders(endpoint: string): Record<string, string> {
  if (!endpoint.includes("web.push.apple.com")) return {};
  return {
    "apns-push-type": "alert",
    "apns-priority": "10",
  };
}

export async function sendPushToUser(
  userId: number,
  payload: {
    title: string;
    body: string;
    url?: string;
    icon?: string;
    tag?: string;
    priority?: "high" | "normal";
    sound?: string;
    // Phase 5 — optional action buttons rendered by the service worker.
    // The SW routes taps by event.action via a deep-link query param.
    actions?: PushAction[];
  }
): Promise<void> {
  if (!vapidConfigured) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (!subs.length) return;

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/",
    icon: payload.icon || "/favicon.png",
    badge: "/favicon.png",
    tag: payload.tag,
    priority: payload.priority || "normal",
    sound: payload.sound || "guber_default.wav",
    actions: payload.actions || undefined,
  });

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          pushPayload,
          { headers: apnsHeaders(sub.endpoint) }
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.endpoint, sub.endpoint));
        } else {
          console.warn("[push] send failed:", err.message);
        }
      }
    })
  );
}

export async function saveSubscription(
  userId: number,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
  // Delete all OTHER subscriptions for this user first — one active subscription
  // per user prevents duplicate push notifications when the browser creates a new
  // endpoint (e.g. after clearing storage or reinstalling the PWA).
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        sql`${pushSubscriptions.endpoint} != ${subscription.endpoint}`
      )
    );

  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function sendPushBroadcast(
  payload: { title: string; body: string; url?: string },
  audience: "all" | "og" | "non_og" | "trustbox" = "all"
): Promise<{ sent: number; failed: number; total: number }> {
  if (!vapidConfigured) return { sent: 0, failed: 0, total: 0 };

  let query = `
    SELECT DISTINCT ON (ps.user_id) ps.endpoint, ps.p256dh, ps.auth
    FROM push_subscriptions ps
    JOIN users u ON u.id = ps.user_id
    WHERE u.role != 'admin'
  `;
  if (audience === "og") query += ` AND u.day1_og = TRUE`;
  if (audience === "non_og") query += ` AND (u.day1_og = FALSE OR u.day1_og IS NULL)`;
  if (audience === "trustbox") query += ` AND u.trust_box_purchased = TRUE`;

  const result = await db.execute(sql.raw(query));
  const subs = result.rows as { endpoint: string; p256dh: string; auth: string }[];

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/",
    icon: "/favicon.png",
    badge: "/favicon.png",
  });

  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          pushPayload,
          { headers: apnsHeaders(sub.endpoint) }
        );
        sent++;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
        }
        failed++;
      }
    })
  );

  return { sent, failed, total: subs.length };
}

export { VAPID_PUBLIC_KEY };
