import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import { ALLOWED_RETURN_TO_PREFIXES } from "../shared/oauth-config";

export { ALLOWED_RETURN_TO_PREFIXES };

export function isAllowedReturnTo(value: string): boolean {
  if (!value || !value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;

  const lowerValue = value.toLowerCase();
  if (
    lowerValue.includes("/..") ||
    lowerValue.includes("%2e") ||
    lowerValue.includes("%2f")
  ) {
    return false;
  }

  let normalized: string;
  try {
    const url = new URL(value, "https://example.com");
    if (url.hostname !== "example.com") return false;
    normalized = url.pathname;
  } catch {
    return false;
  }

  return ALLOWED_RETURN_TO_PREFIXES.some((prefix) => {
    if (prefix.endsWith("/")) {
      return normalized === prefix.slice(0, -1) || normalized.startsWith(prefix);
    }
    return normalized === prefix || normalized.startsWith(prefix + "/");
  });
}

export function getBaseUrl(req: Request): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const scheme = proto === "https" || process.env.NODE_ENV === "production" ? "https" : "http";
  return `${scheme}://${req.get("host")}`;
}

/**
 * Parse a single cookie value from the raw Cookie header without requiring
 * cookie-parser middleware. Used as a fallback for OAuth state validation.
 */
function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (key === name) {
      try {
        return decodeURIComponent(trimmed.slice(eqIdx + 1));
      } catch {
        return trimmed.slice(eqIdx + 1);
      }
    }
  }
  return null;
}

/** Cookie name for the CSRF nonce fallback (session-independent). */
const OAUTH_STATE_COOKIE = "guber_oauth_state";

/**
 * Lifetime of the OAuth state cookie and the server-side consumed-nonce entries.
 * Keeping both on a single constant prevents the two from drifting apart.
 */
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Consumed-nonce store — pluggable for durability across restarts / instances
// ---------------------------------------------------------------------------

/**
 * Interface for the server-side consumed-nonce registry.
 *
 * The default implementation (`InMemoryNonceStore`) is process-local and
 * used in tests and development. For production, call `setNonceStore` with a
 * `PgNonceStore` instance so that nonces survive server restarts and are
 * visible across all instances in a load-balanced fleet.
 */
export interface NonceStore {
  /**
   * Atomically marks `nonce` as consumed for `ttlMs` milliseconds.
   *
   * Returns `true` when the nonce was fresh (first use) and has now been
   * recorded; returns `false` when the nonce was already present (replay).
   */
  consumeIfFresh(nonce: string, ttlMs: number): Promise<boolean>;
}

/**
 * In-memory nonce store — default, process-local.
 *
 * Works correctly in a single-process deployment and in automated tests.
 * Consumed nonces are lost on restart and not shared across instances.
 */
class InMemoryNonceStore implements NonceStore {
  private readonly map = new Map<string, number>(); // nonce → expiry timestamp

  async consumeIfFresh(nonce: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    // Lazy pruning of expired entries.
    for (const [k, exp] of this.map) {
      if (now >= exp) this.map.delete(k);
    }
    if (this.map.has(nonce)) return false; // already consumed → replay
    this.map.set(nonce, now + ttlMs);
    return true; // fresh
  }
}

/**
 * Minimal Pool-like interface so oauth.ts does not depend on the `pg` module
 * directly. `pg.Pool` satisfies this interface.
 */
export interface DbPool {
  query(sql: string, values?: unknown[]): Promise<{ rowCount: number | null }>;
}

/**
 * PostgreSQL-backed nonce store.
 *
 * Uses an `oauth_used_nonces` table with an `INSERT … ON CONFLICT DO NOTHING`
 * to atomically mark a nonce as consumed (equivalent to Redis SETNX). If two
 * requests race with the same nonce, only one INSERT succeeds; the other gets
 * `rowCount = 0` and is rejected as a replay.
 *
 * The table must be created before this store is used (see server/index.ts).
 * An index on `expires_at` allows cheap periodic cleanup; `consumeIfFresh`
 * itself does not prune expired rows — that is handled by a scheduled DELETE
 * or Postgres TTL, keeping the hot path fast.
 */
export class PgNonceStore implements NonceStore {
  constructor(private readonly pool: DbPool) {}

  async consumeIfFresh(nonce: string, ttlMs: number): Promise<boolean> {
    const expiresAt = new Date(Date.now() + ttlMs);
    // Atomically claim the nonce:
    //   - INSERT on a fresh nonce (never seen)     → rowCount = 1  (fresh)
    //   - Conflict + existing row already EXPIRED  → UPDATE wins   → rowCount = 1  (fresh — expired entry recycled)
    //   - Conflict + existing row still valid      → DO NOTHING    → rowCount = 0  (replay)
    // The DO UPDATE … WHERE clause makes the conditional upsert entirely atomic
    // in one round-trip, so two concurrent requests with the same nonce cannot
    // both succeed.
    const result = await this.pool.query(
      `INSERT INTO oauth_used_nonces (nonce, expires_at)
       VALUES ($1, $2)
       ON CONFLICT (nonce) DO UPDATE
         SET expires_at = EXCLUDED.expires_at
         WHERE oauth_used_nonces.expires_at < NOW()`,
      [nonce, expiresAt],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

/** Active nonce store — defaults to in-memory; replaced with PgNonceStore at startup. */
let activeNonceStore: NonceStore = new InMemoryNonceStore();

/**
 * Replace the active nonce store.
 *
 * Call this once at application startup (after the database table is ready)
 * to switch from the default in-memory store to a durable, shared store.
 */
export function setNonceStore(store: NonceStore): void {
  activeNonceStore = store;
}

// ---------------------------------------------------------------------------
// OAuth state helpers
// ---------------------------------------------------------------------------

/**
 * OAuth state payload — encoded as base64url JSON and sent to Google as the
 * `state` parameter. This lets `native` and `returnTo` survive the round-trip
 * without depending on the session, which may be lost when Chrome Custom Tab
 * (used for Android native OAuth) has a separate cookie jar from the WebView.
 *
 * The `n` nonce is 128-bit random and is the CSRF token. It is also stored
 * server-side (session primary, cookie fallback) so it can be verified on
 * callback without trusting the client's claim alone.
 */
interface OAuthStatePayload {
  n: string;             // CSRF nonce — 128-bit hex
  native: boolean;       // true when triggered from the native mobile app
  returnTo: string | null; // validated return path, or null
  pollKey?: string;      // correlation key for polling-based token retrieval (no deep link required)
}

function encodeOAuthState(payload: OAuthStatePayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeOAuthState(state: string): OAuthStatePayload | null {
  try {
    const json = Buffer.from(state, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (
      typeof parsed.n === "string" &&
      parsed.n.length >= 32 &&
      typeof parsed.native === "boolean"
    ) {
      return {
        n: parsed.n,
        native: parsed.native,
        returnTo: typeof parsed.returnTo === "string" ? parsed.returnTo : null,
        pollKey: typeof parsed.pollKey === "string" && parsed.pollKey.length > 0 ? parsed.pollKey : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function handleGoogleAuthStart(req: Request, res: Response): void {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_WEB_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ message: "Google Sign-In not configured" });
    return;
  }
  const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;

  const nonce = randomBytes(16).toString("hex"); // 128-bit CSRF nonce

  const rawReturnTo = req.query.returnTo as string | undefined;
  const returnTo = rawReturnTo && isAllowedReturnTo(rawReturnTo) ? rawReturnTo : null;

  const isNative = req.query.source === "native";

  // pollKey: opaque correlation ID supplied by the native app; lets the app
  // retrieve the JWT via polling (/api/auth/google/poll) without needing a
  // registered custom URI scheme or deep link. Max 64 hex chars to prevent abuse.
  const rawPollKey = req.query.pollKey as string | undefined;
  const pollKey = rawPollKey && /^[a-f0-9]{8,64}$/.test(rawPollKey) ? rawPollKey : undefined;

  // Encode the full OAuth context in the state parameter so native/returnTo
  // survive the round-trip even when the session is lost (Chrome Custom Tab
  // on Android has an isolated cookie jar from the Capacitor WebView).
  const statePayload: OAuthStatePayload = { n: nonce, native: isNative, returnTo, pollKey };
  const state = encodeOAuthState(statePayload);

  // Session stores only the nonce — one-time-use CSRF verification.
  (req.session as any).oauthState = nonce;

  // Cookie fallback: stores the FULL encoded state so that if the session is
  // lost, the fallback path can verify the entire payload (nonce + native +
  // returnTo) via full-string equality, cryptographically binding all fields
  // to the server-generated state rather than just the nonce.
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: OAUTH_STATE_TTL_MS,
    path: "/",
  });

  console.log(`[GUBER auth] Google auth start — redirectUri=${redirectUri} returnTo=${returnTo || "none"} native=${isNative}`);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });
  req.session.save((err) => {
    if (err) {
      console.error("[GUBER auth] Google auth start — session save failed:", err);
      res.redirect("/login?error=google_failed");
      return;
    }
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });
}

export type StateValidationResult =
  | { valid: true; code: string; returnTo: string | null; isNative: boolean; pollKey?: string }
  | { valid: false; reason: "cancelled" | "invalid_state" };

/**
 * Validates the OAuth state parameter on the Google callback.
 *
 * The `state` is a base64url-encoded JSON payload containing:
 *   - `n`       — the CSRF nonce, verified against the session or cookie
 *   - `native`  — whether the flow was triggered from a native app
 *   - `returnTo`— the validated post-auth redirect path (or null)
 *
 * Nonce verification sources (in priority order):
 *   1. Express session (`oauthState`) — present when session cookie survives the
 *      Google redirect (standard web + PWA case).
 *   2. `guber_oauth_state` cookie — fallback for when the session is dropped
 *      (observed on Samsung Internet and Android Chrome Custom Tab contexts).
 *
 * After a successful validation the nonce is atomically written to the active
 * `NonceStore` (see `setNonceStore`). If the nonce is already present the
 * request is rejected as a replay. Using an atomic INSERT ON CONFLICT in the
 * PostgreSQL-backed store ensures replay protection is durable across server
 * restarts and load-balanced instances.
 *
 * @param req - Express request from the Google callback route.
 * @param res - Optional Express response; pass to clear the nonce cookie after
 *              reading (recommended for production — makes nonce truly one-time).
 */
export async function validateOAuthState(req: Request, res?: Response): Promise<StateValidationResult> {
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code) {
    console.log(`[GUBER auth] Google callback — user cancelled or error param present (error=${error || "none"})`);
    return { valid: false, reason: "cancelled" };
  }

  // Decode the state payload — carries native + returnTo without session dependency.
  const payload = state ? decodeOAuthState(state) : null;
  if (!payload) {
    console.warn(
      `[GUBER auth] Google callback — invalid_state: state param is missing or not a valid encoded payload ` +
      `(received=${state ? state.slice(0, 16) + "..." : "none"})`
    );
    // Clean up any leftover session/cookie state before rejecting.
    delete (req.session as any).oauthState;
    if (res) res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
    return { valid: false, reason: "invalid_state" };
  }

  // Verify the state — primary: session nonce, fallback: full cookie state.
  //
  // Primary path (session nonce): the session stores only the 128-bit nonce
  // from auth-start. Compare payload.n against it. If they match the nonce is
  // valid; native/returnTo come from the decoded payload.
  //
  // Fallback path (cookie full state): the cookie stores the complete encoded
  // state string. Compare the full received state string against it for
  // full-integrity verification — this cryptographically binds native and
  // returnTo to the server-generated value, not just the nonce.
  const sessionNonce = (req.session as any).oauthState as string | undefined;
  delete (req.session as any).oauthState; // always clear (one-time use)

  const cookieState = parseCookieValue(req.headers.cookie, OAUTH_STATE_COOKIE);

  // Always clear the state cookie (one-time use).
  if (res) {
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
  }

  let stateSource: string;
  let stateValid = false;

  if (sessionNonce) {
    // Primary: nonce from session vs nonce in decoded payload
    stateSource = "session";
    stateValid = !!(payload.n && payload.n === sessionNonce);
  } else if (cookieState) {
    // Fallback: full encoded state in cookie vs full received state string
    stateSource = "cookie-fallback";
    stateValid = !!(state && state === cookieState);
  } else {
    stateSource = "missing";
    stateValid = false;
  }

  // On any successful state verification, atomically mark the nonce as
  // consumed in the shared store.  consumeIfFresh returns false when the
  // nonce is already present (replay), in which case we reject even though
  // the state string itself matched.
  //
  // Using an atomic INSERT ON CONFLICT (PgNonceStore) ensures that two
  // concurrent requests carrying the same nonce cannot both succeed, and
  // that consumed nonces survive server restarts and are visible across all
  // instances in a load-balanced fleet.
  if (stateValid) {
    const fresh = await activeNonceStore.consumeIfFresh(payload.n, OAUTH_STATE_TTL_MS);
    if (!fresh) {
      stateSource = "replay";
      stateValid = false;
    }
  }

  if (!stateValid) {
    console.warn(
      `[GUBER auth] Google callback — invalid_state (source=${stateSource}, ` +
      `received=${state ? state.slice(0, 16) + "..." : "none"})`
    );
    return { valid: false, reason: "invalid_state" };
  }

  console.log(`[GUBER auth] Google callback — state valid (source=${stateSource} native=${payload.native} returnTo=${payload.returnTo || "none"} pollKey=${payload.pollKey ? "present" : "none"})`);

  return {
    valid: true,
    code,
    returnTo: payload.returnTo,
    isNative: payload.native,
    pollKey: payload.pollKey,
  };
}
