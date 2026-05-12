import webpush from "web-push";
import apn from "@parse/node-apn";
import admin from "firebase-admin";
import { db } from "./db";
import { pushSubscriptions, apnsDeviceTokens, fcmDeviceTokens, pushSendLog } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

/**
 * Append a row to push_send_log. Errors swallowed — logging must never
 * break a push delivery. One row per (user, channel, attempt).
 */
async function logSend(
  userId: number,
  channel: "apns" | "fcm" | "webpush",
  success: boolean,
  errorCode: string | null,
  title: string,
  tag: string | undefined,
): Promise<void> {
  try {
    await db.insert(pushSendLog).values({
      userId,
      channel,
      success,
      errorCode: errorCode || null,
      title: title.slice(0, 200),
      tag: tag ? tag.slice(0, 100) : null,
    });
  } catch {
    /* swallow */
  }
}

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
const APNS_PRIVATE_KEY_RAW = process.env.APNS_PRIVATE_KEY || "";

/**
 * Normalize an APNs `.p8` private key into a strict PEM string that the
 * jsonwebtoken library will accept as an ES256 signing key.
 *
 * Apple ships the key as a small PEM file:
 *   -----BEGIN PRIVATE KEY-----
 *   <base64 body, line-wrapped at 64 chars>
 *   -----END PRIVATE KEY-----
 *
 * In practice users paste this into a single-line secret store, which
 * loses the real newlines. We accept any of the following input shapes
 * and rebuild a valid PEM:
 *   • Already valid (real \n line breaks preserved)
 *   • Escaped newlines (\\n)
 *   • All-on-one-line with spaces between sections
 *   • All-on-one-line with NO whitespace at all
 */
function normalizeApnsKey(raw: string): string {
  if (!raw) return raw;
  // First, convert any escaped \n into real newlines.
  let s = raw.replace(/\\n/g, "\n").trim();
  const begin = "-----BEGIN PRIVATE KEY-----";
  const end = "-----END PRIVATE KEY-----";
  if (!s.includes(begin) || !s.includes(end)) {
    // Not a PEM — return as-is and let the apn library surface the error.
    return s;
  }
  // Pull out the body between the markers, strip ALL whitespace (spaces,
  // tabs, newlines, carriage returns), then re-wrap at 64 cols per RFC 7468.
  const bodyStart = s.indexOf(begin) + begin.length;
  const bodyEnd = s.indexOf(end);
  const body = s.slice(bodyStart, bodyEnd).replace(/\s+/g, "");
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `${begin}\n${wrapped}\n${end}\n`;
}

const APNS_PRIVATE_KEY = normalizeApnsKey(APNS_PRIVATE_KEY_RAW);

let apnsProvider: apn.Provider | null = null;
if (APNS_KEY_ID && APNS_TEAM_ID && APNS_PRIVATE_KEY) {
  try {
    apnsProvider = new apn.Provider({
      token: {
        key: Buffer.from(APNS_PRIVATE_KEY),
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

// ── Firebase Cloud Messaging (native Android Capacitor) ───────────────────────
//
// On Android the @capacitor/push-notifications plugin registers with FCM and
// returns a registration token. We send pushes to those tokens via the
// firebase-admin SDK, which lets us include android.notification.sound for
// the GUBER custom WAV files (must also be packaged in android/app/src/main/res/raw/).
//
// Required environment variable:
//   FIREBASE_SERVICE_ACCOUNT  — full JSON contents of a Firebase service-account
//                                key file (Project Settings → Service accounts →
//                                "Generate new private key")

const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT || "";

let firebaseApp: admin.app.App | null = null;
if (FIREBASE_SERVICE_ACCOUNT) {
  try {
    const sa = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
    // Newlines inside the private_key field are commonly escaped as \n when
    // pasted into single-line secret stores. Normalise them so the JWT signer
    // gets a valid PEM.
    if (typeof sa.private_key === "string") {
      sa.private_key = sa.private_key.replace(/\\n/g, "\n");
    }
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(sa as admin.ServiceAccount),
    });
    console.log("[push/fcm] Firebase Admin configured — native Android push active");
  } catch (e) {
    console.warn("[push/fcm] Firebase Admin setup failed:", e);
  }
} else {
  console.warn(
    "[push/fcm] FIREBASE_SERVICE_ACCOUNT missing — native Android push disabled"
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

/** Send a notification to FCM registration tokens (native Android Capacitor path). */
async function sendToFcmTokens(
  tokens: string[],
  payload: {
    title: string;
    body: string;
    sound?: string;
    url?: string;
    tag?: string;
  },
  // Optional per-token user IDs aligned with `tokens[]`, used to write
  // per-attempt rows into push_send_log. Broadcast paths pass undefined.
  userIds?: number[],
): Promise<number> {
  if (!firebaseApp || !tokens.length) return 0;

  const messaging = admin.messaging(firebaseApp);

  // Android sound is the resource name (no .wav extension) of a file in
  // android/app/src/main/res/raw/. Channel "guber_default" is created by the
  // native side via the Capacitor push plugin's default channel config.
  const soundResource = (payload.sound || "guber_default.wav").replace(/\.wav$/i, "");

  // TTL: time-sensitive tags (nearby-jobs, cashdrop) expire in 30 min so stale
  // alerts never arrive hours late. All other notifications use 4 hours.
  // collapseKey: same-tag messages collapse to one on reconnect (no pile-up).
  const isShortLived = payload.tag === "nearby-jobs" || payload.tag?.startsWith("cashdrop");
  const ttlMs = isShortLived ? 30 * 60 * 1000 : 4 * 60 * 60 * 1000;

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: { title: payload.title, body: payload.body },
    android: {
      priority: "high",
      ttl: ttlMs,
      ...(payload.tag ? { collapseKey: payload.tag } : {}),
      notification: {
        sound: soundResource,
        channelId: "guber_default",
        ...(payload.tag ? { tag: payload.tag } : {}),
      },
    },
    data: {
      url: payload.url || "/",
      ...(payload.tag ? { tag: payload.tag } : {}),
      ...(payload.sound ? { sound: payload.sound } : {}),
    },
  };

  const result = await messaging.sendEachForMulticast(message);

  // Clean up tokens that FCM no longer recognises + log every attempt.
  await Promise.all(
    result.responses.map(async (resp, idx) => {
      const uid = userIds?.[idx];
      if (resp.success) {
        if (uid) await logSend(uid, "fcm", true, null, payload.title, payload.tag);
        return;
      }
      const code = (resp.error as any)?.code as string | undefined;
      if (uid) await logSend(uid, "fcm", false, code || "unknown", payload.title, payload.tag);
      // Only delete on token-specific failure codes. messaging/invalid-argument
      // is intentionally NOT treated as a token-invalid signal because it can
      // also fire for malformed payloads, which would wrongly evict valid tokens.
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        await db
          .delete(fcmDeviceTokens)
          .where(eq(fcmDeviceTokens.deviceToken, tokens[idx]));
      } else if (code) {
        console.warn(`[push/fcm] send failed (${code})`);
      }
    })
  );

  return result.successCount;
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
  },
  // Optional map from device token -> user ID, used to write per-attempt
  // rows into push_send_log. Broadcast paths pass undefined.
  tokenToUser?: Map<string, number>,
): Promise<void> {
  if (!apnsProvider || !tokens.length) return;

  const note = new apn.Notification();
  note.expiry = Math.floor(Date.now() / 1000) + 3600;
  note.badge = 1;
  note.alert = { title: payload.title, body: payload.body };
  note.sound = payload.sound || "guber_default.wav";
  note.topic = APNS_BUNDLE_ID;
  // Closed-app delivery hardening (push audit):
  //   - pushType "alert" is required by APNs HTTP/2 for visible alerts to
  //     wake a closed/backgrounded app reliably.
  //   - priority 10 = immediate delivery (default for alerts but explicit).
  //   - mutableContent lets the iOS Notification Service Extension
  //     (if/when added) modify the payload (rich media, decryption).
  (note as any).pushType = "alert";
  note.priority = 10;
  note.mutableContent = true;
  note.payload = {
    url: payload.url || "/",
    ...(payload.actions ? { actions: payload.actions } : {}),
  };

  const result = await apnsProvider.send(note, tokens);

  if (tokenToUser) {
    for (const ok of result.sent) {
      const uid = tokenToUser.get(ok.device);
      if (uid) await logSend(uid, "apns", true, null, payload.title, payload.tag);
    }
  }

  for (const failure of result.failed) {
    const reason = failure.response?.reason;
    if (tokenToUser) {
      const uid = tokenToUser.get(failure.device);
      if (uid) await logSend(uid, "apns", false, reason || "unknown", payload.title, payload.tag);
    }
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
): Promise<{ apnsSent: number; fcmSent: number; webPushSent: number; hasTokens: boolean }> {
  let apnsSent = 0;
  let fcmSent = 0;
  let webPushSent = 0;

  // ── 1. Native iOS path — APNs direct with custom sound ──────────────────
  const nativeTokenRows = await db
    .select()
    .from(apnsDeviceTokens)
    .where(eq(apnsDeviceTokens.userId, userId));

  if (nativeTokenRows.length) {
    const tokenToUser = new Map(nativeTokenRows.map((r) => [r.deviceToken, r.userId] as const));
    await sendToApnsTokens(
      nativeTokenRows.map((r) => r.deviceToken),
      {
        title: payload.title,
        body: payload.body,
        sound: payload.sound || "guber_default.wav",
        url: payload.url,
        tag: payload.tag,
        actions: payload.actions,
      },
      tokenToUser,
    );
    apnsSent = nativeTokenRows.length;
  }

  // ── 2. Native Android path — FCM via firebase-admin ─────────────────────
  const fcmTokenRows = await db
    .select()
    .from(fcmDeviceTokens)
    .where(eq(fcmDeviceTokens.userId, userId));

  if (fcmTokenRows.length) {
    fcmSent = await sendToFcmTokens(
      fcmTokenRows.map((r) => r.deviceToken),
      {
        title: payload.title,
        body: payload.body,
        sound: payload.sound || "guber_default.wav",
        url: payload.url,
        tag: payload.tag,
      },
      fcmTokenRows.map((r) => r.userId),
    );
  }

  // ── 3. Web-push VAPID path — for non-native browsers ────────────────────
  // Always fetch subscriptions so hasTokens reflects registration, not send success.
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  const hasTokens =
    nativeTokenRows.length > 0 || fcmTokenRows.length > 0 || subs.length > 0;

  if (!vapidConfigured || !subs.length) {
    return { apnsSent, fcmSent, webPushSent, hasTokens };
  }

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
      webPushSent++;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          pushPayload,
          { headers: apnsHeaders(sub.endpoint) }
        );
        await logSend(userId, "webpush", true, null, payload.title, payload.tag);
      } catch (err: any) {
        const code = err.statusCode ? `http_${err.statusCode}` : (err.message || "unknown").slice(0, 80);
        await logSend(userId, "webpush", false, code, payload.title, payload.tag);
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

  return { apnsSent, fcmSent, webPushSent, hasTokens };
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

/** Save an FCM registration token received from the native Capacitor push plugin (Android). */
export async function saveFcmToken(userId: number, deviceToken: string): Promise<void> {
  await db
    .insert(fcmDeviceTokens)
    .values({ userId, deviceToken })
    .onConflictDoUpdate({
      target: fcmDeviceTokens.deviceToken,
      set: { userId },
    });
}

/**
 * Remove an FCM registration token when the user unregisters or logs out.
 * Same userId-scoping rules as removeApnsToken.
 */
export async function removeFcmToken(deviceToken: string, userId?: number): Promise<void> {
  const condition =
    userId !== undefined
      ? and(eq(fcmDeviceTokens.deviceToken, deviceToken), eq(fcmDeviceTokens.userId, userId))
      : eq(fcmDeviceTokens.deviceToken, deviceToken);
  await db.delete(fcmDeviceTokens).where(condition);
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
      SELECT DISTINCT ON (adt.user_id) adt.device_token, adt.user_id
      FROM apns_device_tokens adt
      JOIN users u ON u.id = adt.user_id
      WHERE u.role != 'admin'
    `;
    if (audience === "og") apnsQuery += ` AND u.day1_og = TRUE`;
    if (audience === "non_og") apnsQuery += ` AND (u.day1_og = FALSE OR u.day1_og IS NULL)`;
    if (audience === "trustbox") apnsQuery += ` AND u.trust_box_purchased = TRUE`;

    const apnsResult = await db.execute(sql.raw(apnsQuery));
    const apnsRows = apnsResult.rows as { device_token: string; user_id: number }[];
    const apnsTokens = apnsRows.map((r) => r.device_token);
    const apnsTokenToUser = new Map(apnsRows.map((r) => [r.device_token, r.user_id] as const));

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

      for (const ok of result.sent) {
        const uid = apnsTokenToUser.get(ok.device);
        if (uid) await logSend(uid, "apns", true, null, payload.title, "broadcast");
      }
      for (const failure of result.failed) {
        const reason = failure.response?.reason;
        const uid = apnsTokenToUser.get(failure.device);
        if (uid) await logSend(uid, "apns", false, reason || "unknown", payload.title, "broadcast");
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

  // ── 2. Native Android FCM path ──────────────────────────────────────────
  if (firebaseApp) {
    let fcmQuery = `
      SELECT DISTINCT ON (fdt.user_id) fdt.device_token, fdt.user_id
      FROM fcm_device_tokens fdt
      JOIN users u ON u.id = fdt.user_id
      WHERE u.role != 'admin'
    `;
    if (audience === "og") fcmQuery += ` AND u.day1_og = TRUE`;
    if (audience === "non_og") fcmQuery += ` AND (u.day1_og = FALSE OR u.day1_og IS NULL)`;
    if (audience === "trustbox") fcmQuery += ` AND u.trust_box_purchased = TRUE`;

    const fcmResult = await db.execute(sql.raw(fcmQuery));
    const fcmRows = fcmResult.rows as { device_token: string; user_id: number }[];

    if (fcmRows.length) {
      // FCM multicast caps at 500 tokens per request.
      const CHUNK = 500;
      for (let i = 0; i < fcmRows.length; i += CHUNK) {
        const slice = fcmRows.slice(i, i + CHUNK);
        const successCount = await sendToFcmTokens(
          slice.map((r) => r.device_token),
          {
            title: payload.title,
            body: payload.body,
            sound: "guber_default.wav",
            url: payload.url,
            tag: "broadcast",
          },
          slice.map((r) => r.user_id),
        );
        sent += successCount;
        failed += slice.length - successCount;
      }
    }
  }

  // ── 3. Web-push VAPID path — for non-native browsers ────────────────────
  if (!vapidConfigured) return { sent, failed, total: sent + failed };

  let vapidQuery = `
    SELECT DISTINCT ON (ps.user_id) ps.endpoint, ps.p256dh, ps.auth, ps.user_id
    FROM push_subscriptions ps
    JOIN users u ON u.id = ps.user_id
    WHERE u.role != 'admin'
  `;
  if (audience === "og") vapidQuery += ` AND u.day1_og = TRUE`;
  if (audience === "non_og") vapidQuery += ` AND (u.day1_og = FALSE OR u.day1_og IS NULL)`;
  if (audience === "trustbox") vapidQuery += ` AND u.trust_box_purchased = TRUE`;

  const vapidResult = await db.execute(sql.raw(vapidQuery));
  const subs = vapidResult.rows as { endpoint: string; p256dh: string; auth: string; user_id: number }[];

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
        await logSend(sub.user_id, "webpush", true, null, payload.title, "broadcast");
      } catch (err: any) {
        const code = err.statusCode ? `http_${err.statusCode}` : (err.message || "unknown").slice(0, 80);
        await logSend(sub.user_id, "webpush", false, code, payload.title, "broadcast");
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
