import type { Request, Response } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { signupSchema, loginSchema } from "../shared/schema";
import { generateJWT } from "./jwt";

const scryptAsync = promisify(scrypt);

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one capital letter";
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password))
    return "Password must contain at least one symbol";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashedPassword, salt] = stored.split(".");
  const buf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(hashedPassword, "hex"), buf);
}

export function contactInfoPattern(): RegExp {
  return /(\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b)|(\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b)|(@\w{2,})|((facebook|instagram|snapchat|twitter|tiktok|linkedin|whatsapp|telegram|signal|venmo|cashapp|zelle)[\s.:\/]*\w*)/gi;
}

export function filterContactInfo(text: string): { clean: string; blocked: boolean } {
  if (!text) return { clean: text, blocked: false };
  const pattern = contactInfoPattern();
  if (pattern.test(text)) {
    return { clean: text.replace(pattern, "[blocked]"), blocked: true };
  }
  return { clean: text, blocked: false };
}

export function sanitizeUser(user: any) {
  const { password, ...safe } = user;
  return safe;
}

export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    const prevData: Record<string, any> = {};
    const keysToPreserve = ["pendingReferralCode", "oauthState"];
    for (const key of keysToPreserve) {
      if ((req.session as any)[key] !== undefined) {
        prevData[key] = (req.session as any)[key];
      }
    }
    req.session.regenerate((err) => {
      if (err) return reject(err);
      for (const [key, value] of Object.entries(prevData)) {
        (req.session as any)[key] = value;
      }
      resolve();
    });
  });
}

export interface AuthStorage {
  getUserByEmail(email: string): Promise<any>;
  getUserByUsername(username: string): Promise<any>;
  createUser(data: any): Promise<any>;
  getUser(id: number): Promise<any>;
  updateUser(id: number, data: any): Promise<any>;
  createPasswordResetToken(userId: number, token: string, expiresAt: Date): Promise<void>;
  getPasswordResetToken(token: string): Promise<{ userId: number; expiresAt: Date; used: boolean } | undefined>;
  invalidatePasswordResetToken(token: string): Promise<void>;
}

export function handleLogin(storage: AuthStorage) {
  return async (req: Request, res: Response) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      const { email, password } = parsed.data;

      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(401).json({ message: "Invalid credentials" });
      if (user.banned) return res.status(403).json({ message: "Account permanently banned" });
      if (user.suspended) return res.status(403).json({ message: "Account suspended" });

      if (!user.password || !user.password.includes(".")) {
        if (user.authProvider === "google") {
          return res.status(401).json({ message: "This account was created with Google Sign-In. Please tap 'Sign in with Google', or use 'Forgot Password' to set an email/password login." });
        }
        return res.status(401).json({ message: "Password not set. Please use 'Forgot Password' to reset your account." });
      }

      const valid = await comparePasswords(password, user.password);
      if (!valid) {
        if (user.authProvider === "google") {
          return res.status(401).json({ message: "Incorrect password. If you usually sign in with Google, try 'Sign in with Google' instead, or use 'Forgot Password' to set a new password." });
        }
        return res.status(401).json({ message: "Invalid credentials" });
      }

      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Session error" });
        res.json({ ...sanitizeUser(user), token: generateJWT(user) });
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  };
}

export function handleSignup(storage: AuthStorage) {
  return async (req: Request, res: Response) => {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const { email, username, fullName, password } = parsed.data;

      const pwError = validatePasswordStrength(password);
      if (pwError) return res.status(400).json({ message: pwError });

      const bioCheck = filterContactInfo(fullName);
      if (bioCheck.blocked) {
        return res.status(400).json({ message: "Contact info not allowed in names" });
      }

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) return res.status(400).json({ message: "Email already in use" });

      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) return res.status(400).json({ message: "Username already taken" });

      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        email,
        username,
        fullName,
        password: hashedPassword,
      });

      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Session error" });
        res.status(201).json({ ...sanitizeUser(user), token: generateJWT(user) });
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  };
}

export function handleForgotPassword(storage: AuthStorage) {
  return async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });
      const user = await storage.getUserByEmail(email);
      if (!user)
        return res.json({ message: "If that email exists, a reset link has been sent." });
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await storage.createPasswordResetToken(user.id, token, expiresAt);
      const baseUrl = process.env.APP_BASE_URL
        ? process.env.APP_BASE_URL.replace(/\/$/, "")
        : `${req.protocol}://${req.get("host")}`;
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;
      console.log(`[GUBER] Password reset link for ${email}: ${resetUrl}`);
      res.json({
        message: "If that email exists, a reset link has been sent.",
        resetUrl: process.env.NODE_ENV !== "production" ? resetUrl : undefined,
      });
    } catch (err: any) {
      console.error("[GUBER] forgot-password error:", err);
      res.status(500).json({ message: "Error processing request" });
    }
  };
}

export function handleResetPassword(storage: AuthStorage) {
  return async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      if (!token || !password)
        return res.status(400).json({ message: "Token and password required" });
      const pwError = validatePasswordStrength(password);
      if (pwError) return res.status(400).json({ message: pwError });
      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken)
        return res.status(400).json({ message: "Invalid or expired reset link" });
      if (resetToken.used)
        return res.status(400).json({ message: "This reset link has already been used" });
      if (new Date() > resetToken.expiresAt)
        return res.status(400).json({ message: "Reset link has expired" });
      const hashedPassword = await hashPassword(password);
      await storage.updateUser(resetToken.userId, { password: hashedPassword });
      await storage.invalidatePasswordResetToken(token);
      res.json({ message: "Password updated successfully" });
    } catch (err: any) {
      res.status(500).json({ message: "Error resetting password" });
    }
  };
}

export function handleMe(storage: AuthStorage) {
  return async (req: Request, res: Response) => {
    if (!req.session.userId)
      return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    res.json(sanitizeUser(user));
  };
}

export function handleLogout() {
  return (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
  };
}
