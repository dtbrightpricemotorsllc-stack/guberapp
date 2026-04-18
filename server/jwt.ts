import jwt from "jsonwebtoken";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("[GUBER] JWT_SECRET environment variable is required but not set. Set it in Replit Secrets.");
}

const JWT_EXPIRY = "7d";

export interface JwtPayload {
  sub: number;
  email: string;
}

export function generateJWT(user: { id: number; email: string }): string {
  return jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: JWT_EXPIRY });
}

export function verifyJWT(token: string): JwtPayload | null {
  try {
    const raw = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    if (typeof raw?.sub !== "number" || typeof raw?.email !== "string") return null;
    return { sub: raw.sub as number, email: raw.email as string };
  } catch {
    return null;
  }
}
