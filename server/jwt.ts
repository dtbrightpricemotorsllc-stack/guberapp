import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "guber-jwt-fallback-change-in-production";
const JWT_EXPIRY = "7d";

export interface JwtPayload {
  sub: number;
  email: string;
}

export function generateJWT(user: { id: number; email: string }): string {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyJWT(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (typeof payload?.sub !== "number" || typeof payload?.email !== "string") return null;
    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
