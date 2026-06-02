/**
 * server/os/health-checks.ts
 * Real health checks for every GUBER technical service.
 * In-memory history (lastSuccess / lastFailure) persists for the server session;
 * it resets on restart, which is acceptable for Phase 1.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export type CheckStatus = "healthy" | "warning" | "critical" | "unknown";

export interface CheckResult {
  key: string;
  name: string;
  status: CheckStatus;
  value: string | number | null;
  detail: string;
  lastSuccess: string | null;
  lastFailure: string | null;
  failureReason: string | null;
  recommendedAction: string | null;
}

// ── In-memory history ─────────────────────────────────────────────────────────
interface HistoryEntry {
  lastSuccess: Date | null;
  lastFailure: Date | null;
  failureReason: string | null;
}
const mem = new Map<string, HistoryEntry>();

function mark(key: string, ok: boolean, reason?: string) {
  const e = mem.get(key) ?? { lastSuccess: null, lastFailure: null, failureReason: null };
  if (ok) {
    mem.set(key, { ...e, lastSuccess: new Date() });
  } else {
    mem.set(key, { ...e, lastFailure: new Date(), failureReason: reason ?? "Check failed" });
  }
}

function hist(key: string) {
  const e = mem.get(key);
  return {
    lastSuccess: e?.lastSuccess?.toISOString() ?? null,
    lastFailure: e?.lastFailure?.toISOString() ?? null,
    failureReason: e?.failureReason ?? null,
  };
}

function ok(key: string, name: string, value: string | number | null, detail: string): CheckResult {
  mark(key, true);
  return { key, name, status: "healthy", value, detail, ...hist(key), recommendedAction: null };
}

function warn(key: string, name: string, value: string | number | null, detail: string, action: string | null, reason?: string): CheckResult {
  if (reason) mark(key, false, reason);
  return { key, name, status: "warning", value, detail, ...hist(key), recommendedAction: action };
}

function crit(key: string, name: string, value: string | number | null, detail: string, action: string, reason: string): CheckResult {
  mark(key, false, reason);
  return { key, name, status: "critical", value, detail, ...hist(key), recommendedAction: action };
}

function unk(key: string, name: string, detail: string): CheckResult {
  return { key, name, status: "unknown", value: null, detail, ...hist(key), recommendedAction: null };
}

// ── Individual checks ─────────────────────────────────────────────────────────

async function checkDatabase(): Promise<CheckResult> {
  const key = "database";
  try {
    await db.execute(sql`SELECT 1`);
    return ok(key, "Database", "Online", "Connection and query successful");
  } catch (e: any) {
    const reason = e?.message ?? "Query failed";
    return crit(key, "Database", "Offline", reason, "Check DATABASE_URL env var and connection pool.", reason);
  }
}

async function checkGoogleLogin(): Promise<CheckResult> {
  const key = "google_login";
  const hasSecret = !!process.env.GOOGLE_CLIENT_SECRET;
  if (!hasSecret) {
    return crit(key, "Google Login", null,
      "GOOGLE_CLIENT_SECRET not set",
      "Add GOOGLE_CLIENT_SECRET to environment secrets.",
      "GOOGLE_CLIENT_SECRET missing");
  }
  try {
    const resp = await fetch("https://accounts.google.com/.well-known/openid-configuration", {
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) return ok(key, "Google Login", "Reachable", "Google OIDC discovery endpoint responded 200");
    const reason = `Google OIDC returned ${resp.status}`;
    return warn(key, "Google Login", `HTTP ${resp.status}`, reason, "Monitor status.google.com.", reason);
  } catch (e: any) {
    const reason = e?.message ?? "Network error";
    return warn(key, "Google Login", "Unreachable", reason, "Check outbound connectivity to accounts.google.com.", reason);
  }
}

async function checkAppleLogin(): Promise<CheckResult> {
  const key = "apple_login";
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const pk = process.env.APNS_PRIVATE_KEY;
  if (!keyId || !teamId || !pk) {
    const missing = [!keyId && "APNS_KEY_ID", !teamId && "APNS_TEAM_ID", !pk && "APNS_PRIVATE_KEY"]
      .filter(Boolean).join(", ");
    return crit(key, "Apple Login", null,
      `Missing: ${missing}`,
      "Set all APNS_* secrets in environment.",
      `Missing env vars: ${missing}`);
  }
  return ok(key, "Apple Login", "Configured", "APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY all present");
}

async function checkGoogleMaps(): Promise<CheckResult> {
  const key = "google_maps";
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return unk(key, "Google Maps", "No server-side Maps key set (GOOGLE_GEOCODING_API_KEY or GOOGLE_MAPS_API_KEY)");
  }
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=New+York&key=${apiKey}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(7000) });
    const data: any = await resp.json();
    if (data.status === "OK" || data.status === "ZERO_RESULTS") {
      return ok(key, "Google Maps", "Healthy", `Geocoding API responded: ${data.status}`);
    }
    if (data.status === "REQUEST_DENIED") {
      const reason = `API key rejected: ${data.error_message ?? data.status}`;
      return crit(key, "Google Maps", "Denied", reason,
        "Check key restrictions and ensure Geocoding API is enabled in Google Cloud Console.", reason);
    }
    const reason = `Unexpected status: ${data.status}`;
    return warn(key, "Google Maps", data.status, reason, "Review Google Maps API quotas.", reason);
  } catch (e: any) {
    const reason = e?.message ?? "Network error";
    return warn(key, "Google Maps", "Unreachable", reason, "Check connectivity to maps.googleapis.com.", reason);
  }
}

async function checkStripe(): Promise<CheckResult> {
  const key = "stripe";
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return crit(key, "Stripe", null, "STRIPE_SECRET_KEY not set",
      "Set STRIPE_SECRET_KEY in environment.", "STRIPE_SECRET_KEY missing");
  }
  try {
    const resp = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${stripeKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (resp.ok) {
      const data: any = await resp.json();
      const available = data?.available?.[0];
      const bal = available ? `$${((available.amount ?? 0) / 100).toFixed(2)}` : "Connected";
      return ok(key, "Stripe", bal, "Balance API responded OK — Stripe account live");
    }
    const body: any = await resp.json().catch(() => ({}));
    const reason = body?.error?.message ?? `HTTP ${resp.status}`;
    return crit(key, "Stripe", `HTTP ${resp.status}`, reason,
      "Check Stripe secret key and account status at dashboard.stripe.com.", reason);
  } catch (e: any) {
    const reason = e?.message ?? "Network error";
    return warn(key, "Stripe", "Unreachable", reason, "Check outbound connectivity to api.stripe.com.", reason);
  }
}

async function checkPushNotifications(): Promise<CheckResult> {
  const key = "push_notifications";
  const vapidPub = process.env.VAPID_PUBLIC_KEY;
  const vapidPriv = process.env.VAPID_PRIVATE_KEY;
  const apnsKey = process.env.APNS_KEY_ID;
  const apnsTeam = process.env.APNS_TEAM_ID;
  const apnsPk = process.env.APNS_PRIVATE_KEY;
  const webOk = !!(vapidPub && vapidPriv);
  const iosOk = !!(apnsKey && apnsTeam && apnsPk);
  if (webOk && iosOk) {
    return ok(key, "Push Notifications", "Web + iOS", "VAPID (web) and APNs (iOS) both configured");
  }
  if (webOk) {
    return warn(key, "Push Notifications", "Web only",
      "VAPID configured, APNs keys missing — iOS push will not work",
      "Set APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY.", "APNs keys missing");
  }
  if (iosOk) {
    return warn(key, "Push Notifications", "iOS only",
      "APNs configured, VAPID keys missing — web push will not work",
      "Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.", "VAPID keys missing");
  }
  return crit(key, "Push Notifications", null,
    "Neither VAPID nor APNs credentials configured",
    "Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY.",
    "All push credentials missing");
}

async function checkCloudinary(): Promise<CheckResult> {
  const key = "cloudinary";
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName) {
    return crit(key, "Cloudinary", null,
      "CLOUDINARY_CLOUD_NAME not set — media uploads will fail",
      "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.",
      "CLOUDINARY_CLOUD_NAME missing");
  }
  if (cloudName && apiKey && apiSecret) {
    try {
      const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
      const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/usage`, {
        headers: { Authorization: `Basic ${credentials}` },
        signal: AbortSignal.timeout(7000),
      });
      if (resp.ok) {
        const data: any = await resp.json();
        const usedGb = data?.storage?.used_percent != null
          ? `${data.storage.used_percent.toFixed(1)}% storage used` : "Usage retrieved";
        return ok(key, "Cloudinary", "Connected", usedGb);
      }
      const reason = `HTTP ${resp.status}`;
      return warn(key, "Cloudinary", `HTTP ${resp.status}`, reason,
        "Check API key/secret at console.cloudinary.com.", reason);
    } catch (e: any) {
      const reason = e?.message ?? "Network error";
      return warn(key, "Cloudinary", "Unreachable", reason, "Check connectivity to api.cloudinary.com.", reason);
    }
  }
  // Cloud name set but no API keys for live check
  mark(key, true);
  return { key, name: "Cloudinary", status: "healthy", value: "Configured",
    detail: "CLOUDINARY_CLOUD_NAME set (add API_KEY + API_SECRET for live check)",
    ...hist(key), recommendedAction: null };
}

async function checkR2Storage(): Promise<CheckResult> {
  const key = "r2_storage";
  // Try multiple common naming conventions
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? process.env.R2_ACCOUNT_ID;
  const accessKey = process.env.R2_ACCESS_KEY_ID ?? process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY ?? process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  if (!accountId && !accessKey) {
    return unk(key, "R2 Storage",
      "No R2 credentials detected (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY). Set if R2 is in use.");
  }
  return ok(key, "R2 Storage", "Configured", "R2 credentials present");
}

async function checkGuberStudio(): Promise<CheckResult> {
  const key = "guber_studio";
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return crit(key, "GUBER Studio", null,
      "FAL_KEY not set — all /api/studio/generate/* endpoints return 503",
      "Set FAL_KEY in environment. No generation of any kind works without it.",
      "FAL_KEY missing");
  }
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*)::int AS sessions_24h,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_now,
        COALESCE(SUM(credits_used),0)::int AS credits_24h
      FROM studio_sessions
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
    const row = r.rows[0] as any;
    return ok(key, "GUBER Studio", `${row.sessions_24h ?? 0} sessions`,
      `${row.sessions_24h ?? 0} sessions (24h) · ${row.active_now ?? 0} active · ${row.credits_24h ?? 0} credits used`);
  } catch (e: any) {
    return warn(key, "GUBER Studio", "DB error", "FAL_KEY set but studio_sessions query failed",
      "Check studio_sessions table.", e?.message);
  }
}

async function checkMarketplace(): Promise<CheckResult> {
  const key = "marketplace";
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'available')::int AS active,
        COUNT(*) FILTER (WHERE status = 'sold')::int AS sold,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS new_today
      FROM marketplace_items
    `);
    const row = r.rows[0] as any;
    return ok(key, "Marketplace", `${row.active ?? 0} active`,
      `${row.active ?? 0} active listings · ${row.sold ?? 0} sold · ${row.new_today ?? 0} new today`);
  } catch (e: any) {
    const reason = e?.message ?? "DB query failed";
    return warn(key, "Marketplace", null, reason, "Check marketplace_items table.", reason);
  }
}

async function checkVerifyInspect(): Promise<CheckResult> {
  const key = "verify_inspect";
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE category = 'Verify & Inspect'
          AND status IN ('posted_public','helper_confirmed'))::int AS active,
        COUNT(*) FILTER (WHERE category = 'Verify & Inspect' AND status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE category = 'Verify & Inspect' AND status = 'disputed')::int AS disputed
      FROM jobs WHERE is_test_job = false
    `);
    const row = r.rows[0] as any;
    return ok(key, "Verify & Inspect", `${row.active ?? 0} active`,
      `${row.active ?? 0} active · ${row.completed ?? 0} completed · ${row.disputed ?? 0} disputed`);
  } catch (e: any) {
    const reason = e?.message ?? "DB query failed";
    return warn(key, "Verify & Inspect", null, reason, "Check jobs table.", reason);
  }
}

async function checkLoadBoard(): Promise<CheckResult> {
  const key = "load_board";
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'posted')::int AS open,
        COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS new_today
      FROM load_board_listings
    `);
    const row = r.rows[0] as any;
    return ok(key, "Load Board", `${row.open ?? 0} open`,
      `${row.open ?? 0} open · ${row.accepted ?? 0} accepted · ${row.new_today ?? 0} posted today`);
  } catch (e: any) {
    const reason = e?.message ?? "DB query failed";
    return warn(key, "Load Board", null, reason, "Check load_board_listings table.", reason);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runAllHealthChecks(): Promise<CheckResult[]> {
  const settled = await Promise.allSettled([
    checkDatabase(),
    checkGoogleLogin(),
    checkAppleLogin(),
    checkGoogleMaps(),
    checkStripe(),
    checkPushNotifications(),
    checkCloudinary(),
    checkR2Storage(),
    checkGuberStudio(),
    checkMarketplace(),
    checkVerifyInspect(),
    checkLoadBoard(),
  ]);
  return settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const key = ["database","google_login","apple_login","google_maps","stripe",
      "push_notifications","cloudinary","r2_storage","guber_studio","marketplace",
      "verify_inspect","load_board"][i];
    return {
      key: key ?? "unknown", name: key ?? "Unknown", status: "critical" as CheckStatus,
      value: null, detail: String(r.reason),
      lastSuccess: null, lastFailure: new Date().toISOString(),
      failureReason: String(r.reason), recommendedAction: "Check server logs.",
    };
  });
}
