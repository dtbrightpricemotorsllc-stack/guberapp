import type { Request, Response } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { z } from "zod";
import { signupSchema, loginSchema } from "../shared/schema";
import { generateJWT } from "./jwt";

type SignupInput = z.infer<typeof signupSchema>;

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

/**
 * Minimal user shape the auth handlers depend on. The real `User` row from
 * Drizzle has many more columns; handlers only read the fields enumerated
 * here, so this narrow type is sufficient and keeps the surface explicit.
 */
export interface AuthUser {
  id: number;
  email: string;
  username: string;
  fullName: string;
  password: string;
  authProvider?: string | null;
  banned?: boolean | null;
  suspended?: boolean | null;
  day1OG?: boolean | null;
  trustBoxPurchased?: boolean | null;
  aiOrNotCredits?: number | null;
  [key: string]: unknown;
}

export interface AuthStorage {
  getUserByEmail(email: string): Promise<AuthUser | undefined>;
  getUserByUsername(username: string): Promise<AuthUser | undefined>;
  createUser(data: Record<string, unknown>): Promise<AuthUser>;
  getUser(id: number): Promise<AuthUser | undefined>;
  updateUser(id: number, data: Record<string, unknown>): Promise<AuthUser | undefined>;
  createPasswordResetToken(userId: number, token: string, expiresAt: Date): Promise<void>;
  getPasswordResetToken(token: string): Promise<{ userId: number; expiresAt: Date; used: boolean } | undefined>;
  invalidatePasswordResetToken(token: string): Promise<void>;
}

/**
 * Optional production-only hooks. Tests typically pass none and the handler
 * runs in its minimal/portable form. routes.ts wires the production extras
 * (referrals, OG/TrustBox sync, NSOPW, email delivery, etc.). When a hook
 * throws, the error propagates to the handler's outer catch and the request
 * fails — matching the prior inline behavior in routes.ts.
 */
export interface SignupDeps {
  generateGuberId?: () => string;
  isGuberIdTaken?: (id: string) => Promise<boolean>;
  generateReferralCode?: () => string;
  isReferralCodeTaken?: (code: string) => Promise<boolean>;
  findUserIdByReferralCode?: (code: string) => Promise<number | null>;
  recordReferral?: (referrerId: number, referredId: number) => Promise<void>;
  checkPreapprovedStatus?: (email: string) => Promise<{
    isOG: boolean;
    hasTrustBox: boolean;
    ogTablePresent: boolean;
    tbTablePresent: boolean;
  }>;
  recordPreapproved?: (email: string, opts: { og: boolean; tb: boolean }) => Promise<void>;
  sendWelcomeNotification?: (
    userId: number,
    kind: "og+tb" | "og" | "tb" | "default",
  ) => Promise<void>;
  runBackgroundCheck?: (userId: number, fullName: string) => void;
}

export interface LoginDeps {
  syncPreapprovedStatus?: (user: AuthUser, email: string) => Promise<AuthUser>;
}

export interface ForgotPasswordDeps {
  getBaseUrl?: (req: Request) => string;
  sendResetEmail?: (to: string, resetUrl: string, user: AuthUser) => Promise<void>;
}

export function handleLogin(storage: AuthStorage, deps: LoginDeps = {}) {
  return async (req: Request, res: Response) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      const { email, password } = parsed.data;

      let user = await storage.getUserByEmail(email);
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

      if (deps.syncPreapprovedStatus) {
        user = await deps.syncPreapprovedStatus(user, email);
      }

      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Session error" });
        res.json({ ...sanitizeUser(user), token: generateJWT(user) });
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      res.status(500).json({ message });
    }
  };
}

export function handleSignup(storage: AuthStorage, deps: SignupDeps = {}) {
  const productionMode = deps.generateGuberId !== undefined;

  return async (req: Request, res: Response) => {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const { email, username, fullName, password, zipcode } = parsed.data as SignupInput;
      const rawRefCode = req.body?.referralCode;
      const incomingRefCode =
        typeof rawRefCode === "string" && rawRefCode.trim()
          ? rawRefCode.trim().toUpperCase()
          : null;

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

      // Generate unique GUBER ID (production-only)
      let newGuberId: string | undefined;
      if (deps.generateGuberId) {
        newGuberId = deps.generateGuberId();
        if (deps.isGuberIdTaken) {
          while (await deps.isGuberIdTaken(newGuberId)) {
            newGuberId = deps.generateGuberId();
          }
        }
      }

      // Generate unique referral code (production-only)
      let newRefCode: string | undefined;
      if (deps.generateReferralCode) {
        newRefCode = deps.generateReferralCode();
        if (deps.isReferralCodeTaken) {
          while (await deps.isReferralCodeTaken(newRefCode)) {
            newRefCode = deps.generateReferralCode();
          }
        }
      }

      // Resolve incoming referral (production-only)
      let referrerId: number | null = null;
      if (incomingRefCode && deps.findUserIdByReferralCode) {
        referrerId = await deps.findUserIdByReferralCode(incomingRefCode);
      }

      const createPayload: Record<string, unknown> = {
        email,
        username,
        fullName,
        password: hashedPassword,
      };
      if (newGuberId) createPayload.guberId = newGuberId;
      if (newRefCode) createPayload.referralCode = newRefCode;
      if (referrerId) createPayload.referredBy = referrerId;
      if (productionMode) {
        createPayload.zipcode = zipcode || null;
        createPayload.role = "buyer";
        createPayload.tier = "community";
        createPayload.day1OG = false;
        createPayload.termsAcceptedAt = new Date();
      } else if (zipcode !== undefined) {
        createPayload.zipcode = zipcode || null;
      }

      const user = await storage.createUser(createPayload);

      if (referrerId && deps.recordReferral) {
        await deps.recordReferral(referrerId, user.id);
      }

      // OG / TrustBox preapproval check & welcome notification (production-only)
      if (deps.checkPreapprovedStatus) {
        const status = await deps.checkPreapprovedStatus(email);
        const updates: Record<string, unknown> = {};
        if (status.isOG) {
          updates.day1OG = true;
          if (!user.aiOrNotCredits || user.aiOrNotCredits < 5) updates.aiOrNotCredits = 5;
        }
        if (status.hasTrustBox) {
          updates.trustBoxPurchased = true;
          updates.aiOrNotUnlimitedText = true;
          const credited = updates.aiOrNotCredits as number | undefined;
          const base = credited ?? user.aiOrNotCredits ?? 0;
          if (base < 5) updates.aiOrNotCredits = base + 5;
        }
        if (Object.keys(updates).length > 0) {
          await storage.updateUser(user.id, updates);
        }
        if (
          deps.recordPreapproved &&
          ((status.isOG && !status.ogTablePresent) ||
            (status.hasTrustBox && !status.tbTablePresent))
        ) {
          await deps.recordPreapproved(email, {
            og: status.isOG && !status.ogTablePresent,
            tb: status.hasTrustBox && !status.tbTablePresent,
          });
        }
        if (deps.sendWelcomeNotification) {
          const kind: "og+tb" | "og" | "tb" | "default" =
            status.isOG && status.hasTrustBox
              ? "og+tb"
              : status.isOG
                ? "og"
                : status.hasTrustBox
                  ? "tb"
                  : "default";
          await deps.sendWelcomeNotification(user.id, kind);
        }
      } else if (deps.sendWelcomeNotification) {
        await deps.sendWelcomeNotification(user.id, "default");
      }

      await regenerateSession(req);
      req.session.userId = user.id;

      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Session error" });
        res.status(201).json({ ...sanitizeUser(user), token: generateJWT(user) });
        // Background check is fire-and-forget by contract: the hook itself
        // owns its error handling (production wires `.catch(() => {})`).
        if (deps.runBackgroundCheck) {
          deps.runBackgroundCheck(user.id, fullName);
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Signup failed";
      res.status(500).json({ message });
    }
  };
}

export function handleForgotPassword(storage: AuthStorage, deps: ForgotPasswordDeps = {}) {
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

      const baseUrl = deps.getBaseUrl
        ? deps.getBaseUrl(req)
        : (process.env.APP_BASE_URL
            ? process.env.APP_BASE_URL.replace(/\/$/, "")
            : `${req.protocol}://${req.get("host")}`);
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;
      console.log(`[GUBER] Password reset link for ${email}: ${resetUrl}`);

      if (deps.sendResetEmail) {
        // Email delivery failures are logged but do not fail the request —
        // matching the original inline behavior in routes.ts. The reset
        // token is still created and the dev-mode resetUrl is still returned.
        try {
          await deps.sendResetEmail(email, resetUrl, user);
        } catch (emailErr) {
          const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
          console.error("[GUBER] Failed to send reset email:", msg);
        }
      }

      res.json({
        message: "If that email exists, a reset link has been sent.",
        resetUrl: process.env.NODE_ENV !== "production" ? resetUrl : undefined,
      });
    } catch (err) {
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
    } catch (err) {
      console.error("[GUBER] reset-password error:", err);
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
