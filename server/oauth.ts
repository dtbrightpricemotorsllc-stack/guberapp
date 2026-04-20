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

/**
 * Server-side consumed-nonce registry for the cookie-fallback path.
 *
 * When a callback is validated via the `guber_oauth_state` cookie (i.e. the
 * session was lost — common in Android Chrome Custom Tab flows), we record the
 * nonce here so that a second request carrying the same cookie is rejected even
 * if the client ignored the `clearCookie` Set-Cookie directive.
 *
 * The session path does NOT need this: it deletes `req.session.oauthState`
 * immediately, so any replay has nothing to compare against.
 *
 * Entries expire after the same 10-minute window used for the cookie itself and
 * are pruned lazily on each `validateOAuthState` call to avoid unbounded growth.
 *
 * OPERATIONAL NOTE — this store is process-local (in-memory). It works correctly
 * for single-instance deployments. If the app is ever run behind a load balancer
 * with multiple server instances, a replay request that lands on a different
 * instance than the first callback will not be detected. In that scenario,
 * migrate this store to a shared TTL-key store (e.g. Redis SETNX) to make
 * replay protection durable across the fleet.
 */
const usedCookieFallbackNonces = new Map<string, number>();

function pruneExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, expiry] of usedCookieFallbackNonces) {
    if (now >= expiry) {
      usedCookieFallbackNonces.delete(nonce);
    }
  }
}

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
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function handleGoogleAuthStart(req: Request, res: Response): void {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ message: "Google Sign-In not configured" });
    return;
  }
  const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;

  const nonce = randomBytes(16).toString("hex"); // 128-bit CSRF nonce

  const rawReturnTo = req.query.returnTo as string | undefined;
  const returnTo = rawReturnTo && isAllowedReturnTo(rawReturnTo) ? rawReturnTo : null;

  const isNative = req.query.source === "native";

  // Encode the full OAuth context in the state parameter so native/returnTo
  // survive the round-trip even when the session is lost (Chrome Custom Tab
  // on Android has an isolated cookie jar from the Capacitor WebView).
  const statePayload: OAuthStatePayload = { n: nonce, native: isNative, returnTo };
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
  | { valid: true; code: string; returnTo: string | null; isNative: boolean }
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
 * By embedding `native` and `returnTo` in the state parameter, the server can
 * always emit the correct `guber://` deep link for native flows regardless of
 * whether the session survived.
 *
 * @param req - Express request from the Google callback route.
 * @param res - Optional Express response; pass to clear the nonce cookie after
 *              reading (recommended for production — makes nonce truly one-time).
 */
export function validateOAuthState(req: Request, res?: Response): StateValidationResult {
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

  // Always prune expired entries and check the consumed-nonce store before
  // source branching.  This closes the session-first-then-cookie-replay gap:
  // if a client that received a session-based callback keeps the
  // guber_oauth_state cookie and re-sends it, the nonce will already be in the
  // store (recorded when the session callback succeeded) and the replay is
  // rejected before we even look at the cookie value.
  pruneExpiredNonces();

  if (usedCookieFallbackNonces.has(payload.n)) {
    stateSource = "replay";
    stateValid = false;
  } else if (sessionNonce) {
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

  // On any successful validation, record the nonce as consumed so the
  // guber_oauth_state cookie cannot be replayed — even if the client ignores
  // the clearCookie directive and re-sends the cookie on a later request.
  // The TTL mirrors OAUTH_STATE_TTL_MS (same as the cookie maxAge) so entries
  // expire naturally at the same time the original cookie would have.
  if (stateValid) {
    usedCookieFallbackNonces.set(payload.n, Date.now() + OAUTH_STATE_TTL_MS);
  }

  if (!stateValid) {
    console.warn(
      `[GUBER auth] Google callback — invalid_state (source=${stateSource}, ` +
      `received=${state ? state.slice(0, 16) + "..." : "none"})`
    );
    return { valid: false, reason: "invalid_state" };
  }

  console.log(`[GUBER auth] Google callback — state valid (source=${stateSource} native=${payload.native} returnTo=${payload.returnTo || "none"})`);

  return {
    valid: true,
    code,
    returnTo: payload.returnTo,
    isNative: payload.native,
  };
}
