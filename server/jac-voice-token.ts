/**
 * JAC Voice — per-conversation identity token.
 *
 * ElevenLabs Conversational AI (custom LLM) calls our adapter endpoint with NO
 * user session. To act as the correct user we mint a short-lived, HMAC-signed
 * token at conversation start (server-side, from the authenticated request) and
 * pass it to the agent as a dynamic variable. The adapter derives the userId
 * ONLY from this token — never from any model- or ElevenLabs-supplied field.
 *
 * Mirrors server/mobile-checkout-token.ts (same SESSION_SECRET HMAC + b64url).
 * Anonymous callers (logged-out onboarding) get userId = null; the adapter must
 * refuse any auth-requiring action for an anonymous token.
 */
import crypto from "crypto";

// A voice conversation can run a while; keep the token valid for a full session
// but short enough that a leaked token isn't useful for long.
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export type JacVoicePlatform = "web" | "ios" | "android";
export type JacVoiceRole = "admin" | "user" | "anon";

export interface JacVoiceTokenPayload {
  /** Authenticated user id, or null for anonymous (onboarding) conversations. */
  userId: number | null;
  role: JacVoiceRole;
  platform: JacVoicePlatform;
  /** Stable per-conversation id (for dedupe / spend accounting). */
  cid: string;
  exp: number;
  nonce: string;
  ver: 1;
}

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET required for JAC voice token");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signJacVoiceToken(input: {
  userId: number | null;
  role: JacVoiceRole;
  platform: JacVoicePlatform;
  cid?: string;
}): string {
  const payload: JacVoiceTokenPayload = {
    userId: input.userId ?? null,
    role: input.role,
    platform: input.platform,
    cid: input.cid || crypto.randomBytes(8).toString("hex"),
    exp: Date.now() + TTL_MS,
    nonce: crypto.randomBytes(8).toString("hex"),
    ver: 1,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(crypto.createHmac("sha256", getSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyJacVoiceToken(token: string): JacVoiceTokenPayload | null {
  if (!token || typeof token !== "string") return null;
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const body = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expected = b64url(crypto.createHmac("sha256", getSecret()).update(body).digest());
  const aBuf = Buffer.from(sig);
  const bBuf = Buffer.from(expected);
  if (aBuf.length !== bBuf.length) return null;
  if (!crypto.timingSafeEqual(aBuf, bBuf)) return null;
  try {
    const payload = JSON.parse(unb64url(body).toString("utf8")) as JacVoiceTokenPayload;
    if (payload.ver !== 1) return null;
    if (!(payload.userId === null || typeof payload.userId === "number")) return null;
    if (!["admin", "user", "anon"].includes(payload.role)) return null;
    if (!["web", "ios", "android"].includes(payload.platform)) return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
