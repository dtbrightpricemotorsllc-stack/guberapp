// Extracted live/sandbox guards so the production middleware itself is what's
// covered by tests (server/tests/admin-qa-safety.test.ts). Keeping these in
// their own module ensures the test imports the same code that runs in prod.
import type { Request, Response } from "express";

export function requireStripeTestMode(_req: Request, res: Response, next: Function) {
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_CONNECT_SECRET_KEY || "";
  if (key.startsWith("sk_live_")) {
    return res.status(403).json({ message: "Sandbox endpoints refuse to run while a live Stripe key is loaded." });
  }
  next();
}

export function requireLiveConfirmation(req: Request, res: Response, next: Function) {
  // Defense in depth: only allow live (real-money) admin actions in production
  // builds AND only when the human typed the magic confirmation header. Either
  // missing → 403 / 412, never silent. Body fallback is intentionally not
  // accepted — real-money confirmations must be CSRF-resistant and impossible
  // to trigger from a forged JSON form post.
  if (process.env.NODE_ENV !== "production") {
    return res.status(403).json({
      message: "Live admin actions are only available in NODE_ENV=production builds. End-test refunds are gated.",
    });
  }
  const conf = (req.headers["x-live-confirm"] || "") as string;
  if (conf !== "LIVE") {
    return res.status(412).json({ message: "Live action requires header x-live-confirm: LIVE" });
  }
  next();
}
