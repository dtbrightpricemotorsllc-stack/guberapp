import crypto from "crypto";

const TTL_MS = 15 * 60 * 1000;

const VALID_PRODUCTS = [
  "studio_credits",
  "studio_subscription",
  "day1og",
  "trust_box",
  "business_scout",
] as const;

export type MobileCheckoutProduct = (typeof VALID_PRODUCTS)[number];

export interface MobileCheckoutPayload {
  userId: number;
  product: MobileCheckoutProduct;
  options: Record<string, string>;
  exp: number;
  nonce: string;
}

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET required for mobile checkout token");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signMobileCheckoutToken(
  userId: number,
  product: MobileCheckoutProduct,
  options: Record<string, string>,
): string {
  const payload: MobileCheckoutPayload = {
    userId,
    product,
    options,
    exp: Date.now() + TTL_MS,
    nonce: crypto.randomBytes(8).toString("hex"),
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(crypto.createHmac("sha256", getSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyMobileCheckoutToken(token: string): MobileCheckoutPayload | null {
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
    const payload = JSON.parse(unb64url(body).toString("utf8")) as MobileCheckoutPayload;
    if (typeof payload.userId !== "number") return null;
    if (!VALID_PRODUCTS.includes(payload.product)) return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function isValidProduct(s: string): s is MobileCheckoutProduct {
  return (VALID_PRODUCTS as readonly string[]).includes(s);
}
