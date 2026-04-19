import type { Request, Response } from "express";
import { randomBytes } from "crypto";

export const ALLOWED_RETURN_TO_PREFIXES: readonly string[] = [
  "/dashboard",
  "/biz/",
  "/browse-jobs",
  "/jobs/",
  "/post-job",
  "/my-jobs",
  "/profile",
  "/account-settings",
  "/notifications",
  "/admin",
  "/ai-or-not",
  "/verify-inspect",
  "/wallet",
  "/job-payment-success",
  "/og-success",
  "/worker-clipboard/",
  "/vi-requests",
  "/marketplace",
  "/marketplace-preview",
  "/map",
  "/cash-drop/",
  "/business-onboarding",
  "/resume",
  "/submit-observation",
  "/observations",
];

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
  | { valid: true; code: string; returnTo: string | null; isNative: boolean }
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

  const returnTo = (req.session as any).oauthReturnTo ?? null;
  delete (req.session as any).oauthReturnTo;

  const isNative = (req.session as any).oauthIsNative === true;
  delete (req.session as any).oauthIsNative;

  return { valid: true, code, returnTo, isNative };
}
