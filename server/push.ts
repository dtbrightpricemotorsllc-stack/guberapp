import webpush from "web-push";
import apn from "@parse/node-apn";
import { db } from "./db";
import { pushSubscriptions, apnsDeviceTokens } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:noreply@guberapp.app";

let vapidConfigured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
    console.log("[push] VAPID configured — web push notifications active");
  } catch (e) {
    console.warn("[push] VAPID config failed:", e);
  }
} else {
  console.warn("[push] VAPID keys missing — web push notifications disabled");
}

// ── APNs direct (native iOS Capacitor) ────────────────────────────────────────
//
// When the app runs as a native iOS Capacitor app the @capacitor/push-notifications
// plugin registers directly with APNs and gives us a raw device token. We send
// pushes to those tokens via the @parse/node-apn library which connects directly
// to api.push.apple.com — bypassing Apple's Web Push Gateway — so we can include
// aps.sound with a custom WAV filename.
//
// Required environment variables:
//   APNS_KEY_ID       — 10-char Key ID from Apple Developer portal
//   APNS_TEAM_ID      — 10-char Team ID from Apple Developer portal
//   APNS_BUNDLE_ID    — iOS bundle ID (defaults to com.guber.app)
//   APNS_PRIVATE_KEY  — contents of the .p8 auth key file (newlines as \n or literal)

const APNS_KEY_ID = process.env.APNS_KEY_ID || "";
const APNS_TEAM_ID = process.env.APNS_TEAM_ID || "";
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || "com.guber.app";
const APNS_PRIVATE_KEY = process.env.APNS_PRIVATE_KEY || "";

let apnsProvider: apn.Provider | null = null;
if (APNS_KEY_ID && APNS_TEAM_ID && APNS_PRIVATE_KEY) {
  try {
    apnsProvider = new apn.Provider({
      token: {
        key: Buffer.from(APNS_PRIVATE_KEY.replace(/\\n/g, "\n")),
        keyId: APNS_KEY_ID,
        teamId: APNS_TEAM_ID,
      },
      production: process.env.NODE_ENV === "production",
    });
    console.log("[push/apns] APNs provider configured — native iOS push active");
  } catch (e) {
    console.warn("[push/apns] APNs provider setup failed:", e);
  }
} else {
  console.warn(
    "[push/apns] APNs credentials missing (APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY) — native iOS push disabled"
  );
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
 * Note on custom sounds:
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

/** Send a notification directly to APNs device tokens (native iOS Capacitor path). */
async function sendToApnsTokens(
  tokens: string[],
  payload: {
    title: string;
    body: string;
    sound?: string;
    url?: string;
    tag?: string;
    actions?: PushAction[];
  }
): Promise<void> {
  if (!apnsProvider || !tokens.length) return;

  const note = new apn.Notification();
  note.expiry = Math.floor(Date.now() / 1000) + 3600;
  note.badge = 1;
  note.alert = { title: payload.title, body: payload.body };
  note.sound = payload.sound || "guber_default.wav";
  note.topic = APNS_BUNDLE_ID;
  note.payload = {
    url: payload.url || "/",
    ...(payload.actions ? { actions: payload.actions } : {}),
  };

  const result = await apnsProvider.send(note, tokens);

  for (const failure of result.failed) {
    const reason = failure.response?.reason;
    if (reason === "BadDeviceToken" || reason === "Unregistered") {
      await db
        .delete(apnsDeviceTokens)
        .where(eq(apnsDeviceTokens.deviceToken, failure.device));
    } else {
      console.warn("[push/apns] send failed:", failure.response);
    }
  }
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
    actions?: PushAction[];
  }
): Promise<void> {
  // ── 1. Native iOS path — APNs direct with custom sound ──────────────────
  const nativeTokenRows = await db
    .select()
    .from(apnsDeviceTokens)
    .where(eq(apnsDeviceTokens.userId, userId));

  if (nativeTokenRows.length) {
    await sendToApnsTokens(
      nativeTokenRows.map((r) => r.deviceToken),
      {
        title: payload.title,
        body: payload.body,
        sound: payload.sound || "guber_default.wav",
        url: payload.url,
        tag: payload.tag,
        actions: payload.actions,
      }
    );
  }

  // ── 2. Web-push VAPID path — for non-iOS browsers ───────────────────────
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

/** Save an APNs device token received from the native Capacitor push plugin. */
export async function saveApnsToken(userId: number, deviceToken: string): Promise<void> {
  await db
    .insert(apnsDeviceTokens)
    .values({ userId, deviceToken })
    .onConflictDoUpdate({
      target: apnsDeviceTokens.deviceToken,
      set: { userId },
    });
}

/**
 * Remove an APNs device token when the user unregisters or logs out.
 * When userId is provided the delete is scoped to that user for least-privilege
 * behaviour — a session cannot remove another user's token.
 */
export async function removeApnsToken(deviceToken: string, userId?: number): Promise<void> {
  const condition =
    userId !== undefined
      ? and(eq(apnsDeviceTokens.deviceToken, deviceToken), eq(apnsDeviceTokens.userId, userId))
      : eq(apnsDeviceTokens.deviceToken, deviceToken);
  await db.delete(apnsDeviceTokens).where(condition);
}

export async function sendPushBroadcast(
  payload: { title: string; body: string; url?: string },
  audience: "all" | "og" | "non_og" | "trustbox" = "all"
): Promise<{ sent: number; failed: number; total: number }> {
  let sent = 0;
  let failed = 0;

  // ── 1. Native iOS APNs path ──────────────────────────────────────────────
  if (apnsProvider) {
    let apnsQuery = `
      SELECT DISTINCT ON (adt.user_id) adt.device_token
      FROM apns_device_tokens adt
      JOIN users u ON u.id = adt.user_id
      WHERE u.role != 'admin'
    `;
    if (audience === "og") apnsQuery += ` AND u.day1_og = TRUE`;
    if (audience === "non_og") apnsQuery += ` AND (u.day1_og = FALSE OR u.day1_og IS NULL)`;
    if (audience === "trustbox") apnsQuery += ` AND u.trust_box_purchased = TRUE`;

    const apnsResult = await db.execute(sql.raw(apnsQuery));
    const apnsTokens = (apnsResult.rows as { device_token: string }[]).map((r) => r.device_token);

    if (apnsTokens.length) {
      const note = new apn.Notification();
      note.expiry = Math.floor(Date.now() / 1000) + 3600;
      note.badge = 1;
      note.alert = { title: payload.title, body: payload.body };
      note.sound = "guber_default.wav";
      note.topic = APNS_BUNDLE_ID;
      note.payload = { url: payload.url || "/" };

      const result = await apnsProvider.send(note, apnsTokens);
      sent += result.sent.length;
      failed += result.failed.length;

      for (const failure of result.failed) {
        const reason = failure.response?.reason;
        if (reason === "BadDeviceToken" || reason === "Unregistered") {
          await db
            .delete(apnsDeviceTokens)
            .where(eq(apnsDeviceTokens.deviceToken, failure.device));
        } else {
          console.warn("[push/apns] broadcast send failed:", failure.response);
        }
      }
    }
  }

  // ── 2. Web-push VAPID path — for non-iOS browsers ───────────────────────
  if (!vapidConfigured) return { sent, failed, total: sent + failed };

  let vapidQuery = `
    SELECT DISTINCT ON (ps.user_id) ps.endpoint, ps.p256dh, ps.auth
    FROM push_subscriptions ps
    JOIN users u ON u.id = ps.user_id
    WHERE u.role != 'admin'
  `;
  if (audience === "og") vapidQuery += ` AND u.day1_og = TRUE`;
  if (audience === "non_og") vapidQuery += ` AND (u.day1_og = FALSE OR u.day1_og IS NULL)`;
  if (audience === "trustbox") vapidQuery += ` AND u.trust_box_purchased = TRUE`;

  const vapidResult = await db.execute(sql.raw(vapidQuery));
  const subs = vapidResult.rows as { endpoint: string; p256dh: string; auth: string }[];

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/",
    icon: "/favicon.png",
    badge: "/favicon.png",
  });

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

  return { sent, failed, total: sent + failed };
}

export { VAPID_PUBLIC_KEY };
