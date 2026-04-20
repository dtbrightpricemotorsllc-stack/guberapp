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

/** Cookie name used for the session-independent OAuth state fallback. */
const OAUTH_STATE_COOKIE = "guber_oauth_state";

export function handleGoogleAuthStart(req: Request, res: Response): void {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ message: "Google Sign-In not configured" });
    return;
  }
  const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
  const state = randomBytes(16).toString("hex");
  (req.session as any).oauthState = state;

  const returnTo = req.query.returnTo as string | undefined;
  if (returnTo && isAllowedReturnTo(returnTo)) {
    (req.session as any).oauthReturnTo = returnTo;
  } else {
    delete (req.session as any).oauthReturnTo;
  }

  const isNative = req.query.source === "native";
  (req.session as any).oauthIsNative = isNative;

  // Set a backup cookie so the state survives even if the session cookie is
  // not forwarded by the browser during Google's cross-site redirect
  // (observed on Samsung Internet and some Android PWA contexts).
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60 * 1000, // 10 minutes — OAuth flows should complete quickly
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
 * Validates the OAuth state parameter against what was stored at auth start.
 *
 * Primary source: express-session (req.session.oauthState).
 * Fallback source: guber_oauth_state cookie — used when the session cookie is
 *   lost during the Google redirect (observed on Samsung Internet, some Android
 *   PWA contexts). The fallback provides equivalent CSRF protection because the
 *   state value is 128-bit random and unpredictable.
 *
 * @param req  - Express request from the Google callback route.
 * @param res  - Optional Express response; if provided, the state cookie is
 *               cleared after validation (recommended for production use).
 */
export function validateOAuthState(req: Request, res?: Response): StateValidationResult {
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code) {
    console.log(`[GUBER auth] Google callback — user cancelled or error param present (error=${error || "none"})`);
    return { valid: false, reason: "cancelled" };
  }

  // Primary: session-based state
  const sessionState = (req.session as any).oauthState as string | undefined;
  delete (req.session as any).oauthState;

  // Fallback: cookie-based state (for browsers that drop session during OAuth redirect)
  const cookieState = parseCookieValue(req.headers.cookie, OAUTH_STATE_COOKIE);

  const expectedState = sessionState || cookieState || null;
  const stateSource = sessionState ? "session" : cookieState ? "cookie-fallback" : "missing";

  // Always clear the state cookie (one-time use)
  if (res) {
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
  }

  if (!state || !expectedState || state !== expectedState) {
    console.warn(
      `[GUBER auth] Google callback — invalid_state (source=${stateSource}, ` +
      `received=${state ? state.slice(0, 8) + "..." : "none"}, ` +
      `expected=${expectedState ? expectedState.slice(0, 8) + "..." : "none"})`
    );
    return { valid: false, reason: "invalid_state" };
  }

  console.log(`[GUBER auth] Google callback — state valid (source=${stateSource})`);

  const returnTo = (req.session as any).oauthReturnTo ?? null;
  delete (req.session as any).oauthReturnTo;

  const isNative = (req.session as any).oauthIsNative === true;
  delete (req.session as any).oauthIsNative;

  return { valid: true, code, returnTo, isNative };
}
