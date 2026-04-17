import type { Request, Response } from "express";
import { randomBytes } from "crypto";

export function getBaseUrl(req: Request): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const scheme = proto === "https" || process.env.NODE_ENV === "production" ? "https" : "http";
  return `${scheme}://${req.get("host")}`;
}

export function handleGoogleAuthStart(req: Request, res: Response): void {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ message: "Google Sign-In not configured" });
    return;
  }
  const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
  const state = randomBytes(16).toString("hex");
  (req.session as any).oauthState = state;
  // Native pickup sid: when the native app opens OAuth in an in-app browser
  // (separate cookie jar), it passes ?sid=XYZ. After OAuth completes we stash
  // the login token keyed by sid so the native app can poll for it.
  const sid = (req.query.sid as string | undefined)?.trim();
  if (sid && /^[a-zA-Z0-9_-]{8,128}$/.test(sid)) {
    (req.session as any).oauthPickupSid = sid;
  } else {
    delete (req.session as any).oauthPickupSid;
  }
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
      res.redirect("/login?error=google_failed");
      return;
    }
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });
}

export type StateValidationResult =
  | { valid: true; code: string }
  | { valid: false; reason: "cancelled" | "invalid_state" };

export function validateOAuthState(req: Request): StateValidationResult {
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code) {
    return { valid: false, reason: "cancelled" };
  }

  const expectedState = (req.session as any).oauthState;
  delete (req.session as any).oauthState;

  if (!state || !expectedState || state !== expectedState) {
    return { valid: false, reason: "invalid_state" };
  }

  return { valid: true, code };
}
