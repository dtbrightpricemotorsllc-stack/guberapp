import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { ALL_GAME_IMAGES } from "./game-images";
import { storage } from "./storage";
import { signupSchema, loginSchema, businessSignupSchema, businessAccessRequestSchema, businessVerificationSchema, businessOfferSchema } from "@shared/schema";
import { scrypt, randomBytes, timingSafeEqual, createHmac } from "crypto";
import { promisify } from "util";
import Stripe from "stripe";
import express from "express";
import { computeGraceEndsAt, computeExpiresAt } from "./rules";
import { sendPushToUser } from "./push";
import { demoGuard, getDemoUserIds, isDemoUser } from "./demo-guard";
import { db } from "./db";
import { sql, eq, eq as sqlEq, desc as sqlDesc, desc, and, or, isNotNull, inArray } from "drizzle-orm";
import { auditLogs as auditLogsTable, users as usersTable, jobs as jobsTable, insertJobSchema, referrals, platformSettings, walletTransactions, userFeedback, observations as observationsTable, guberDisputes, type User } from "@shared/schema";
import {
  calculateJobPricing,
  getTrustInfo,
  getTrustLevel,
  adjustTrustScore,
  checkPayoutEligibility,
  loadFeeConfig,
  TRUST_ADJUSTMENTS,
  DEFAULT_FEE_CONFIG,
  type PlatformFeeConfig,
  type TrustLevel,
} from "./pricing";

/** Create an in-app notification AND fire a background push alert to the user's device(s). */
async function notify(
  userId: number,
  data: { title: string; body: string; type?: string; jobId?: number; tag?: string; priority?: "high" | "normal" },
  pushUrl?: string
): Promise<void> {
  await storage.createNotification({
    userId,
    title: data.title,
    body: data.body,
    type: data.type || "job",
    jobId: data.jobId ?? null,
  } as any);
  const tag = data.tag || (data.jobId ? `job-status-${data.jobId}` : undefined);
  sendPushToUser(userId, {
    title: data.title,
    body: data.body,
    url: pushUrl || (data.jobId ? `/jobs/${data.jobId}` : "/notifications"),
    tag,
    priority: data.priority,
  }).catch(() => {});
}

const scryptAsync = promisify(scrypt);
const stripe = new Stripe(process.env.STRIPE_CONNECT_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" as any });
const stripeMain = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" as any });

const POSTER_FEE_PCT = 0.10;
const POSTER_FEE_PCT_OG = 0.08;
const WORKER_FEE_PCT = 0.10;
const WORKER_FEE_PCT_OG = 0.05;
const URGENT_FEE = 10;
const STRIPE_PCT = 0.029;
const STRIPE_FIXED = 0.30;

function grossUpForStripe(netNeeded: number): { gross: number; stripeFee: number } {
  const gross = Math.ceil((netNeeded + STRIPE_FIXED) / (1 - STRIPE_PCT) * 100) / 100;
  const stripeFee = Math.round((gross - netNeeded) * 100) / 100;
  return { gross, stripeFee };
}

async function getSetting(key: string): Promise<string | null> {
  try {
    const result = await db.select().from(platformSettings).where(eq(platformSettings.key, key)).limit(1);
    return result.length > 0 ? result[0].value : null;
  } catch { return null; }
}

async function getActiveFeeConfig(): Promise<PlatformFeeConfig> {
  return loadFeeConfig(getSetting);
}
const TRUST_BOX_PRICE_ID = "price_1T1ToIRAzmUydsE3myv4vG3Z";

const REFERRAL_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += REFERRAL_CHARS[Math.floor(Math.random() * REFERRAL_CHARS.length)];
  return code;
}

async function creditReferrer(referredUserId: number) {
  try {
    const ref = await db.select().from(referrals).where(sqlEq(referrals.referredId, referredUserId)).limit(1);
    if (!ref.length || ref[0].status === "verified") return;
    await db.update(referrals).set({ status: "verified" }).where(sqlEq(referrals.id, ref[0].id));
    const referrer = await storage.getUser(ref[0].referrerId);
    if (!referrer) return;
    const newCount = ((referrer as any).referralCount || 0) + 1;
    const newFeePct = Math.min(Math.floor(newCount / 10) * 0.05, 0.15);
    const hitMilestone = newCount % 10 === 0;
    const updates: Record<string, any> = { referralCount: newCount, referralFeePct: newFeePct };
    if (hitMilestone) {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await db.execute(sql`UPDATE users SET referral_discount_expires_at = ${expiresAt.toISOString()} WHERE id = ${referrer.id}`);
    }
    await storage.updateUser(referrer.id, updates as any);
    await storage.createNotification({
      userId: referrer.id,
      title: "Referral Reward!",
      body: hitMilestone
        ? `You hit ${newCount} referrals! Your −${newFeePct * 100}% fee discount is active for 30 days.`
        : `A user you referred just completed setup. ${newCount} verified referral${newCount !== 1 ? "s" : ""} total.`,
      type: "system",
    });
  } catch (e: any) {
    console.error("[referral] creditReferrer error:", e.message);
  }
}

import { notifyNearbyAvailableWorkers } from "./notify-helpers";

function computeProofConfidence(user: any): { score: number; level: string } {
  const completed = Math.max(user.jobsCompleted || 0, 1);
  const gps = user.gpsVerifiedJobs || 0;
  const reports = user.proofReportsSubmitted || 0;
  const confirmed = user.jobsConfirmed || 0;
  const raw = ((gps + reports + confirmed) / (completed * 3)) * 100;
  const score = Math.min(Math.round(raw * 10) / 10, 100);
  let level = "BASIC";
  if (score >= 95) level = "VERIFIED";
  else if (score >= 85) level = "HIGH";
  else if (score >= 70) level = "GOOD";
  return { score, level };
}

function computeReliability(user: any): number {
  const accepted = Math.max(user.jobsAccepted || 0, 1);
  const completed = user.jobsCompleted || 0;
  const cancelled = user.canceledCount || 0;
  const disputed = user.jobsDisputed || 0;
  const raw = ((completed) / accepted) * 100 - (cancelled * 3) - (disputed * 5);
  return Math.max(0, Math.min(Math.round(raw * 10) / 10, 100));
}

function categorizeCategoryExperience(job: any): string | null {
  const cat = (job.category || "").toLowerCase();
  const viCat = (job.verifyInspectCategory || "").toLowerCase();
  const jType = (job.jobType || "").toLowerCase();
  if (cat === "verify & inspect" || jType.includes("vehicle") || viCat.includes("vehicle")) return "vehicleInspections";
  if (jType.includes("property") || viCat.includes("property") || viCat.includes("real estate")) return "propertyChecks";
  if (cat === "marketplace" || jType.includes("marketplace") || viCat.includes("marketplace") || viCat.includes("online")) return "marketplaceVerifications";
  if (jType.includes("salvage") || viCat.includes("salvage") || viCat.includes("auction")) return "salvageChecks";
  return null;
}

async function retryPendingPayoutsForUser(userId: number, stripeAccountId: string): Promise<{ retried: number; failed: number; errors: string[] }> {
  const txns = await storage.getWalletByUser(userId);
  // Only "available" earnings without a stripeTransferId are truly stuck and retriable.
  // "pending" earnings represent jobs whose Stripe PI hasn't been captured yet — they must
  // NOT be manually transferred, because GUBER has not received those funds from the poster.
  // Exception: "pending" earnings for non-Stripe jobs (barter/cash, no stripePaymentIntentId)
  // can be manually paid out since there's no PI to wait for.
  const pending = txns.filter((t: any) => t.type === "earning" && t.status === "available" && !t.stripeTransferId);
  console.log(`[GUBER] retryPendingPayouts: userId=${userId}, found ${pending.length} available-unsent transactions`);
  let retried = 0, failed = 0;
  const errors: string[] = [];
  for (const txn of pending) {
    try {
      if (txn.jobId) {
        const job = await storage.getJob(txn.jobId);
        if (!job || !job.helperPayout || job.helperPayout <= 0) {
          console.log(`[GUBER] retryPendingPayouts: skipping txn ${txn.id} — job missing or zero payout`);
          continue;
        }
        if ((job as any).payoutStatus === "sent") {
          console.log(`[GUBER] retryPendingPayouts: skipping txn ${txn.id} — already sent`);
          await storage.updateWalletTransaction(txn.id, { status: "available" } as any);
          continue;
        }
        // Safety gate: if this job has a Stripe PI but it hasn't been captured yet (no chargedAt),
        // the funds are still held. Skip — we must not transfer money we don't have.
        if ((job as any).stripePaymentIntentId && !(job as any).chargedAt) {
          console.log(`[GUBER] retryPendingPayouts: skipping txn ${txn.id} — Stripe capture not yet settled for job ${job.id}`);
          continue;
        }
        console.log(`[GUBER] retryPendingPayouts: creating job transfer $${job.helperPayout} to ${stripeAccountId}`);
        const transfer = await stripe.transfers.create({
          amount: Math.round(job.helperPayout * 100),
          currency: "usd",
          destination: stripeAccountId,
          transfer_group: `job_${job.id}`,
          description: `GUBER payout: ${job.title}`,
          metadata: { jobId: String(job.id), userId: String(userId) },
        });
        console.log(`[GUBER] retryPendingPayouts: job transfer created ${transfer.id}`);
        await storage.updateWalletTransaction(txn.id, {
          status: "available",
          stripeTransferId: transfer.id,
          description: `Payout sent: $${job.helperPayout.toFixed(2)} for "${job.title}"`,
        } as any);
        await storage.updateJob(job.id, { payoutStatus: "sent", stripeTransferId: transfer.id, paidOutAt: new Date() } as any);
      } else {
        console.log(`[GUBER] retryPendingPayouts: creating non-job transfer $${txn.amount} to ${stripeAccountId}`);
        const transfer = await stripe.transfers.create({
          amount: Math.round(txn.amount * 100),
          currency: "usd",
          destination: stripeAccountId,
          description: txn.description || "GUBER earnings payout",
          metadata: { walletTxnId: String(txn.id), userId: String(userId) },
        });
        console.log(`[GUBER] retryPendingPayouts: non-job transfer created ${transfer.id}`);
        await storage.updateWalletTransaction(txn.id, {
          status: "available",
          stripeTransferId: transfer.id,
          description: `Payout sent: ${txn.description || "earnings"}`,
        } as any);
      }
      retried++;
    } catch (err: any) {
      const raw = err?.raw?.message || err?.message || "Unknown error";
      console.error(`[GUBER] retryPendingPayouts FAILED for txn ${txn.id}:`, raw);
      // Return a clean code instead of raw Stripe API text
      if (raw.toLowerCase().includes("insufficient funds") || raw.toLowerCase().includes("balance")) {
        errors.push("INSUFFICIENT_FUNDS");
      } else if (raw.toLowerCase().includes("account") || raw.toLowerCase().includes("destination")) {
        errors.push("ACCOUNT_ISSUE");
      } else {
        errors.push("TRANSFER_FAILED");
      }
      failed++;
    }
  }
  return { retried, failed, errors };
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const TEN_MILES_METERS = 16093;

async function notifyCashDropLive(drop: { id: number; title: string; description?: string | null; gpsLat?: number | null; gpsLng?: number | null; gpsRadius?: number | null }) {
  try {
    const notifTitle = "Cash Drop is LIVE!";
    const notifBody = `"${drop.title}" — A Cash Drop just went active near you. Check the map now!`;
    const notifiedIds = new Set<number>();

    const ogRows = await db.execute(sql`SELECT id FROM users WHERE day1_og = true AND notif_cash_drops = true`);
    for (const u of ogRows.rows as { id: number }[]) {
      notifiedIds.add(u.id);
      await storage.createNotification({ userId: u.id, title: notifTitle, body: notifBody, type: "cash_drop", jobId: null, cashDropId: drop.id });
      sendPushToUser(u.id, { title: notifTitle, body: notifBody, url: `/cash-drops`, tag: `cashdrop-${drop.id}` }).catch(() => {});
    }

    if (drop.gpsLat != null && drop.gpsLng != null) {
      const radiusMiles = Math.max((drop.gpsRadius || 200) / 1609.34, 15);
      const latRange = radiusMiles / 69.0;
      const lngRange = radiusMiles / (69.0 * Math.cos((drop.gpsLat * Math.PI) / 180));
      const localRows = await db.execute(sql`
        SELECT DISTINCT u.id FROM users u
        INNER JOIN jobs j ON j.posted_by_id = u.id OR j.assigned_helper_id = u.id
        WHERE u.notif_cash_drops = true
          AND j.lat IS NOT NULL AND j.lng IS NOT NULL
          AND j.lat BETWEEN ${drop.gpsLat - latRange} AND ${drop.gpsLat + latRange}
          AND j.lng BETWEEN ${drop.gpsLng - lngRange} AND ${drop.gpsLng + lngRange}
        LIMIT 500
      `);
      for (const u of localRows.rows as { id: number }[]) {
        if (notifiedIds.has(u.id)) continue;
        notifiedIds.add(u.id);
        await storage.createNotification({ userId: u.id, title: notifTitle, body: notifBody, type: "cash_drop", jobId: null, cashDropId: drop.id });
        sendPushToUser(u.id, { title: notifTitle, body: notifBody, url: `/cash-drops`, tag: `cashdrop-${drop.id}` }).catch(() => {});
      }
    }

    console.log(`[GUBER] Notified ${notifiedIds.size} users about Cash Drop #${drop.id} (${ogRows.rows.length} OG + ${notifiedIds.size - ogRows.rows.length} local)`);
  } catch (e: any) {
    console.error("[GUBER] notifyCashDropLive error:", e.message);
  }
}

async function checkStripeForOGStatus(email: string): Promise<{ isOG: boolean; hasTrustBox: boolean }> {
  try {
    const customers = await stripeMain.customers.list({ email: email.toLowerCase(), limit: 10 });
    let isOG = false;
    let hasTrustBox = false;
    for (const customer of customers.data) {
      if (!isOG) {
        const sessions = await stripeMain.checkout.sessions.list({ customer: customer.id, limit: 100 });
        for (const s of sessions.data) {
          if (s.payment_status === "paid" && s.metadata?.type === "day1og") { isOG = true; break; }
        }
      }
      if (!hasTrustBox) {
        const subs = await stripeMain.subscriptions.list({ customer: customer.id, status: "active", limit: 20 });
        for (const sub of subs.data) {
          if (sub.items.data.some(i => i.price.id === TRUST_BOX_PRICE_ID)) { hasTrustBox = true; break; }
        }
      }
      if (isOG && hasTrustBox) break;
    }
    return { isOG, hasTrustBox };
  } catch (err) {
    console.error("[GUBER] checkStripeForOGStatus error:", err);
    return { isOG: false, hasTrustBox: false };
  }
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null;

  // Always try Google Maps first — it returns exact street-level coordinates
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:US&region=us&key=${apiKey}`;
      const resp = await fetch(url);
      const data = await resp.json() as any;
      if (data.status === "OK" && data.results?.[0]) {
        const loc = data.results[0].geometry.location;
        return { lat: loc.lat, lng: loc.lng };
      }
    } catch {}
  }

  // Fallback: use Nominatim (OpenStreetMap) — exact address geocoding, no API key required
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`;
    const nomResp = await fetch(nomUrl, { headers: { "User-Agent": "GUBER-App/1.0 contact@guberapp.app" } });
    if (nomResp.ok) {
      const nomData = await nomResp.json() as any[];
      if (nomData?.[0]?.lat && nomData?.[0]?.lon) {
        return { lat: parseFloat(nomData[0].lat), lng: parseFloat(nomData[0].lon) };
      }
    }
  } catch {}

  // Last resort: ZIP centroid from zippopotam.us
  const zipMatch = address.match(/\b(\d{5})\b/);
  if (zipMatch) {
    try {
      const resp = await fetch(`https://api.zippopotam.us/us/${zipMatch[1]}`, {
        headers: { "User-Agent": "GUBER-App/1.0" },
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        const place = data.places?.[0];
        if (place?.latitude && place?.longitude) {
          return { lat: parseFloat(place.latitude), lng: parseFloat(place.longitude) };
        }
      }
    } catch {}
  }

  return null;
}

const PREDEFINED_SERVICES: Record<string, string[]> = {
  "On-Demand Help": ["Pet Care", "Errand Running", "Delivery", "Personal Assistant", "Tutoring", "Tech Support", "Event Help", "House Sitting"],
  "General Labor": ["Moving", "Lawn Care", "Cleaning", "Hauling", "Assembly", "Demolition", "Pressure Washing", "Junk Removal"],
  "Skilled Labor": ["Plumbing", "Electrical", "HVAC", "Carpentry", "Drywall", "Painting", "Welding", "Auto Repair", "Roofing", "Flooring"],
  "Barter Labor": ["Trade Services", "Skill Exchange", "Item Exchange"],
  "Marketplace": ["Buy/Sell", "Rent", "Free Items"],
};

const TIER_ORDER = ["community", "verified", "credentialed", "elite"];

function contactInfoPattern(): RegExp {
  return /(\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b)|(\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b)|(@\w{2,})|((facebook|instagram|snapchat|twitter|tiktok|linkedin|whatsapp|telegram|signal|venmo|cashapp|zelle)[\s.:\/]*\w*)/gi;
}

function filterContactInfo(text: string): { clean: string; blocked: boolean } {
  if (!text) return { clean: text, blocked: false };
  const pattern = contactInfoPattern();
  if (pattern.test(text)) {
    return { clean: text.replace(pattern, "[blocked]"), blocked: true };
  }
  return { clean: text, blocked: false };
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashedPassword, salt] = stored.split(".");
  const buf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(hashedPassword, "hex"), buf);
}

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

function sanitizeUser(user: any) {
  const { password, ...safe } = user;
  return safe;
}

function generateGuberId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "GUB-";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

const PUBLIC_USERNAME_BLOCKED_PATTERNS: RegExp[] = [
  /\d{7,}/,
  /(\d[\s\-.()+]{0,3}){7,}/,
  /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i,
  /https?:\/\//i,
  /www\./i,
  /\.(com|net|org|io|app|co|me|info|biz|us|tv|cc)\b/i,
  /\b(facebook|fb\.com|instagram|insta|snapchat|snap|telegram|tg|whatsapp|wa\.me|twitter|tiktok|signal|wechat|kik|viber|line|discord)\b/i,
  /\b(call\s?me|text\s?me|dm\s?me|message\s?me|reach\s?me|contact\s?me|hit\s?me|msg\s?me|find\s?me|follow\s?me|add\s?me)\b/i,
];

function validatePublicUsername(value: string): string | null {
  if (!value || value.trim().length === 0) return null;
  const v = value.trim();
  if (v.length < 3) return "Username must be at least 3 characters";
  if (v.length > 20) return "Username must be 20 characters or less";
  if (!/^[a-zA-Z0-9_\-]+$/.test(v)) return "Username may only contain letters, numbers, underscores, and hyphens";
  for (const pattern of PUBLIC_USERNAME_BLOCKED_PATTERNS) {
    if (pattern.test(v)) return "Username may not contain contact info, social handles, or links";
  }
  return null;
}

function fuzzCoordinate(coord: number | null, seed: number = 0): number | null {
  if (coord === null || coord === undefined) return null;
  // Deterministic offset per user so the pin stays in one consistent spot
  // across map refreshes. Uses a simple LCG seeded by user ID.
  const lcg = ((seed * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff;
  return coord + (lcg - 0.5) * 0.003; // ±0.0015° ≈ ±0.1 mi — protects home address, avoids water displacement
}

function sanitizeJobForPublic(job: any, viewerId: number | undefined) {
  const isOwner = viewerId === job.postedById;
  const isHelper = viewerId === job.assignedHelperId;
  const isLocked = ["funded", "active", "in_progress", "completion_submitted", "proof_submitted"].includes(job.status);

  const { platformFee, ...publicJob } = job;

  // Expose helperPayout to owner and assigned helper so UI can show accurate breakdown
  if (isOwner || isHelper) {
    if (isLocked && (isOwner || isHelper)) return publicJob;
    const fuzzedLat = fuzzCoordinate(job.lat);
    const fuzzedLng = fuzzCoordinate(job.lng);
    return { ...publicJob, lat: fuzzedLat, lng: fuzzedLng };
  }
  
  const fuzzedLat = fuzzCoordinate(job.lat);
  const fuzzedLng = fuzzCoordinate(job.lng);
  return {
    ...publicJob,
    helperPayout: undefined,
    location: job.locationApprox || "Approximate location",
    lat: fuzzedLat,
    lng: fuzzedLng,
  };
}

const CATEGORY_COLORS: Record<string, string> = {
  "On-Demand Help":  "#F97316",  // orange
  "Verify & Inspect":"#8B5CF6",  // purple (locked)
  "Skilled Labor":   "#DC2626",  // red
  "General Labor":   "#16A34A",  // green
  "Barter Labor":    "#0EA5E9",  // blue
  "Marketplace":     "#FACC15",  // gold/yellow
  "Workers":         "#EC4899",  // pink
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const PgSession = connectPgSimple(session);

  app.set("trust proxy", 1);
  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "user_sessions",
      }),
      secret: process.env.SESSION_SECRET || "guber-fallback-secret-change-in-production",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    })
  );

  await pool.query(`CREATE TABLE IF NOT EXISTS login_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at BIGINT NOT NULL
  )`);
  setInterval(() => {
    pool.query(`DELETE FROM login_tokens WHERE expires_at < $1`, [Date.now()]).catch(() => {});
  }, 60_000);

  function requireAuth(req: Request, res: Response, next: Function) {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  }

  async function requireAdmin(req: Request, res: Response, next: Function) {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  }

  async function checkSuspended(req: Request, res: Response, next: Function) {
    if (!req.session.userId) return next();
    const user = await storage.getUser(req.session.userId);
    if (user?.suspended || user?.banned) {
      return res.status(403).json({ message: "Account suspended" });
    }
    next();
  }

  app.get("/api/config", (_req: Request, res: Response) => {
    res.json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "" });
  });

  app.get("/api/places/autocomplete", async (req: Request, res: Response) => {
    const input = typeof req.query.input === "string" ? req.query.input.trim() : "";
    if (!input || input.length < 2) return res.json({ results: [] });
    const lat = typeof req.query.lat === "string" ? parseFloat(req.query.lat) : null;
    const lng = typeof req.query.lng === "string" ? parseFloat(req.query.lng) : null;
    const headers = { "User-Agent": "GUBER-App/1.0 contact@guberapp.app", "Accept-Language": "en-US,en" };

    function viewboxParam(latV: number, lngV: number, deg = 0.7) {
      return `&viewbox=${lngV - deg},${latV + deg},${lngV + deg},${latV - deg}&bounded=0`;
    }

    async function nominatimSearch(q: string): Promise<any[]> {
      let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=8&dedupe=1&countrycodes=us`;
      if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) url += viewboxParam(lat, lng);
      try {
        const r = await fetch(url, { headers });
        return await r.json() as any[];
      } catch { return []; }
    }

    try {
      let results = await nominatimSearch(input);

      // Retry 1: strip trailing US zip code (5 digits) — helps "3926 Main St Mobile AL 36618"
      if (results.length === 0) {
        const noZip = input.replace(/\s+\d{5}(-\d{4})?$/, "").trim();
        if (noZip !== input) results = await nominatimSearch(noZip);
      }

      // Retry 2: drop last token (zip or extra word) — broader fallback
      if (results.length === 0) {
        const parts = input.split(/\s+/);
        if (parts.length > 3) results = await nominatimSearch(parts.slice(0, -1).join(" "));
      }

      // Retry 3: global search without viewbox constraint
      if (results.length === 0) {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input)}&format=json&addressdetails=1&limit=6&countrycodes=us`;
        const r = await fetch(url, { headers });
        results = await r.json() as any[];
      }

      res.json({
        results: results.map((item: any) => ({
          place_id: item.place_id,
          display_name: item.display_name,
          name: item.name || null,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          zip: item.address?.postcode || null,
          type: item.type,
          category: item.category,
        })),
      });
    } catch {
      res.json({ results: [] });
    }
  });

  // ─────────────────────────────────────────────
  // PUBLIC API — no auth required
  // Used by the guberapp.com GitHub homepage to show live job previews
  // Response shape: JobPreview[] (plain JSON array)
  // ─────────────────────────────────────────────
  const PUBLIC_CORS_ORIGINS = ["https://guberapp.com", "https://www.guberapp.com"];

  function setPublicCors(req: Request, res: Response) {
    const origin = req.headers.origin;
    if (origin && PUBLIC_CORS_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Vary", "Origin");
    }
  }

  app.options("/api/public/jobs", (req: Request, res: Response) => {
    setPublicCors(req, res);
    res.sendStatus(204);
  });

  app.get("/api/public/jobs", async (req: Request, res: Response) => {
    setPublicCors(req, res);
    try {
      const { zip, search, category, limit: limitParam } = req.query as Record<string, string | undefined>;
      const limitVal = Math.min(50, Math.max(1, parseInt(limitParam || '50', 10) || 50));

      const conditions = [
        eq(jobsTable.status, "posted_public"),
        or(sql`${jobsTable.expiresAt} IS NULL`, sql`${jobsTable.expiresAt} > NOW()`),
        ...(zip ? [eq(jobsTable.zip, zip)] : []),
        ...(search ? [sql`lower(${jobsTable.title}) LIKE ${"%" + search.toLowerCase() + "%"}`] : []),
        ...(category ? [eq(jobsTable.category, category)] : []),
      ];

      const rows = await db
        .select({
          id: jobsTable.id,
          title: jobsTable.title,
          description: jobsTable.description,
          category: jobsTable.category,
          budget: jobsTable.budget,
          locationApprox: jobsTable.locationApprox,
          zip: jobsTable.zip,
          lat: jobsTable.lat,
          lng: jobsTable.lng,
          urgentSwitch: jobsTable.urgentSwitch,
          payType: jobsTable.payType,
          jobType: jobsTable.jobType,
          proofRequired: jobsTable.proofRequired,
          serviceType: jobsTable.serviceType,
          verifyInspectCategory: jobsTable.verifyInspectCategory,
          jobImage: jobsTable.jobImage,
          expiresAt: jobsTable.expiresAt,
          createdAt: jobsTable.createdAt,
        })
        .from(jobsTable)
        .where(and(...conditions))
        .orderBy(desc(jobsTable.createdAt))
        .limit(limitVal);

      const FALLBACK_JOBS = [
        { id: -1, title: "Property Walk-Through", category: "Verify & Inspect", budget: 45, locationApprox: "Mobile, AL area", zip: "36606", lat: 30.698, lng: -88.043, urgentSwitch: false, payType: "fixed", jobType: "in-person", proofRequired: true, serviceType: null, verifyInspectCategory: "property", jobImage: null, createdAt: new Date().toISOString(), appUrl: "https://guberapp.app/browse-jobs" },
        { id: -2, title: "Furniture Move — 2BR Apt", category: "Moving Help", budget: 80, locationApprox: "Daphne, AL area", zip: "36526", lat: 30.604, lng: -87.904, urgentSwitch: true, payType: "fixed", jobType: "in-person", proofRequired: false, serviceType: null, verifyInspectCategory: null, jobImage: null, createdAt: new Date().toISOString(), appUrl: "https://guberapp.app/browse-jobs" },
        { id: -3, title: "Yard Cleanup & Bag Clippings", category: "Lawn & Yard", budget: 55, locationApprox: "Saraland, AL area", zip: "36571", lat: 30.820, lng: -88.073, urgentSwitch: false, payType: "fixed", jobType: "in-person", proofRequired: false, serviceType: null, verifyInspectCategory: null, jobImage: null, createdAt: new Date().toISOString(), appUrl: "https://guberapp.app/browse-jobs" },
        { id: -4, title: "Same-Day Grocery Run", category: "Errands", budget: 25, locationApprox: "Chickasaw, AL area", zip: "36611", lat: 30.768, lng: -88.075, urgentSwitch: true, payType: "fixed", jobType: "in-person", proofRequired: false, serviceType: null, verifyInspectCategory: null, jobImage: null, createdAt: new Date().toISOString(), appUrl: "https://guberapp.app/browse-jobs" },
        { id: -5, title: "Handyman Pre-Sale Inspection", category: "Verify & Inspect", budget: 65, locationApprox: "Satsuma, AL area", zip: "36572", lat: 30.856, lng: -88.071, urgentSwitch: false, payType: "fixed", jobType: "in-person", proofRequired: true, serviceType: null, verifyInspectCategory: "property", jobImage: null, createdAt: new Date().toISOString(), appUrl: "https://guberapp.app/browse-jobs" },
        { id: -6, title: "Office Deep Clean — After Hours", category: "Cleaning", budget: 90, locationApprox: "Prichard, AL area", zip: "36610", lat: 30.747, lng: -88.084, urgentSwitch: false, payType: "fixed", jobType: "in-person", proofRequired: false, serviceType: null, verifyInspectCategory: null, jobImage: null, createdAt: new Date().toISOString(), appUrl: "https://guberapp.app/browse-jobs" },
      ];

      const sanitizeDesc = (d: string | null) => d ? filterContactInfo(d).clean.substring(0, 500) : null;
      const jobs = rows.length > 0
        ? rows.map((j) => ({ ...j, description: sanitizeDesc(j.description), appUrl: `https://guberapp.app/jobs/${j.id}` }))
        : FALLBACK_JOBS;

      res.json(jobs);
    } catch (err) {
      console.error("[public/jobs] error:", err);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  app.options("/api/public/jobs/:id", (req: Request, res: Response) => {
    setPublicCors(req, res);
    res.sendStatus(204);
  });

  app.get("/api/public/jobs/:id", async (req: Request, res: Response) => {
    setPublicCors(req, res);
    try {
      const jobId = parseInt(req.params.id, 10);
      if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job ID" });

      const rows = await db
        .select({
          id: jobsTable.id,
          title: jobsTable.title,
          description: jobsTable.description,
          category: jobsTable.category,
          budget: jobsTable.budget,
          locationApprox: jobsTable.locationApprox,
          zip: jobsTable.zip,
          urgentSwitch: jobsTable.urgentSwitch,
          payType: jobsTable.payType,
          jobType: jobsTable.jobType,
          proofRequired: jobsTable.proofRequired,
          serviceType: jobsTable.serviceType,
          verifyInspectCategory: jobsTable.verifyInspectCategory,
          jobImage: jobsTable.jobImage,
          expiresAt: jobsTable.expiresAt,
          status: jobsTable.status,
          createdAt: jobsTable.createdAt,
        })
        .from(jobsTable)
        .where(eq(jobsTable.id, jobId))
        .limit(1);

      if (!rows.length) return res.status(404).json({ error: "Job not found" });
      const job = rows[0];
      if (job.status !== "posted_public") return res.status(404).json({ error: "Job not found" });
      if (job.expiresAt && new Date(job.expiresAt) < new Date()) return res.status(404).json({ error: "Job expired" });

      const desc = job.description ? filterContactInfo(job.description).clean.substring(0, 1000) : null;
      res.json({
        ...job,
        description: desc,
        location: undefined,
        appUrl: `https://guberapp.app/jobs/${job.id}`,
      });
    } catch (err) {
      console.error("[public/jobs/:id] error:", err);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  app.options("/api/public/cash-drops", (req: Request, res: Response) => {
    setPublicCors(req, res);
    res.sendStatus(204);
  });

  app.get("/api/public/cash-drops", async (req: Request, res: Response) => {
    setPublicCors(req, res);
    try {
      const allDrops = await storage.getActiveCashDrops();
      const sanitized = allDrops.map((d) => ({
        id: d.id,
        title: d.title,
        rewardPerWinner: d.rewardPerWinner,
        winnerLimit: d.winnerLimit,
        winnersFound: d.winnersFound,
        gpsLat: d.gpsLat,
        gpsLng: d.gpsLng,
        status: d.status,
        startTime: d.startTime,
        endTime: d.endTime,
        rewardType: d.rewardType,
        isSponsored: d.isSponsored,
        sponsorName: d.sponsorName?.startsWith("DEMO_") ? null : (d.sponsorName ?? null),
      }));
      res.json(sanitized);
    } catch (err) {
      console.error("[public/cash-drops] error:", err);
      res.status(500).json({ error: "Failed to fetch cash drops" });
    }
  });
  // ─────────────────────────────────────────────

  app.get("/api/geocode", async (req: Request, res: Response) => {
    const address = typeof req.query.address === "string" ? req.query.address : "";
    if (!address) return res.status(400).json({ error: "address required" });
    try {
      const coords = await geocodeAddress(address);
      if (!coords) return res.status(404).json({ error: "Address not found" });
      res.json(coords);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/places/reverse-geocode", async (req: Request, res: Response) => {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: "lat and lng required" });
    try {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (apiKey) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
        const resp = await fetch(url);
        const data = await resp.json() as any;
        if (data.status === "OK" && data.results?.[0]) {
          const result = data.results[0];
          const address = result.formatted_address as string;
          const zipComp = result.address_components?.find((c: any) => c.types.includes("postal_code"));
          const zip = zipComp?.short_name || null;
          return res.json({ address, zip });
        }
      }
      // Nominatim fallback
      const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
      const nomResp = await fetch(nomUrl, { headers: { "User-Agent": "GUBER/1.0 contact@guberapp.app" } });
      const nomData = await nomResp.json() as any;
      if (nomData?.display_name) {
        const zip = nomData.address?.postcode || null;
        return res.json({ address: nomData.display_name, zip });
      }
      return res.status(404).json({ error: "Address not found" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // AUTH
  function validatePasswordStrength(password: string): string | null {
    if (password.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(password)) return "Password must contain at least one capital letter";
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return "Password must contain at least one symbol";
    return null;
  }

  async function runNSOPWBackgroundCheck(userId: number, fullName: string): Promise<void> {
    try {
      const parts = (fullName || "").trim().split(/\s+/);
      const firstName = parts[0] ?? "";
      const lastName = parts.slice(1).join(" ") || parts[0] || "";
      if (!firstName) return;

      const apiRes = await fetch(
        `https://www.nsopw.gov/api/search/sexoffender?q=${encodeURIComponent(firstName + " " + lastName)}&r=json`,
        { headers: { "User-Agent": "GuberAdmin/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(8000) }
      );

      if (!apiRes.ok) return;

      const data = await apiRes.json() as Record<string, unknown>;
      const records = (data.records ?? data.results ?? data.offenders ?? []) as unknown[];

      if (records.length > 0) {
        await storage.updateUser(userId, { backgroundCheckStatus: "flagged" });
        await storage.createAuditLog({
          userId: null,
          action: "auto_nsopw_flagged",
          details: `Auto NSOPW check flagged user ${userId} (${fullName}): ${records.length} registry match(es) found.`,
        });
      } else {
        await storage.updateUser(userId, { backgroundCheckStatus: "clear" });
      }
    } catch {
      // Silently fail — user stays "none" and appears in Safety Queue for manual review
    }
  }

  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const { email, username, fullName, password, zipcode } = parsed.data;
      const incomingRefCode = (req.body.referralCode || "").toString().trim().toUpperCase() || null;

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
      let newGuberId = generateGuberId();
      while (await storage.getUserByGuberId(newGuberId)) { newGuberId = generateGuberId(); }

      let newRefCode = generateReferralCode();
      while (true) {
        const clash = await db.execute(sql`SELECT 1 FROM users WHERE referral_code = ${newRefCode} LIMIT 1`);
        if (!clash.rows.length) break;
        newRefCode = generateReferralCode();
      }

      let referrerId: number | null = null;
      if (incomingRefCode) {
        const refOwner = await db.execute(sql`SELECT id FROM users WHERE referral_code = ${incomingRefCode} LIMIT 1`);
        if (refOwner.rows.length) referrerId = (refOwner.rows[0] as any).id;
      }

      const user = await storage.createUser({
        email,
        username,
        fullName,
        password: hashedPassword,
        zipcode: zipcode || null,
        role: "buyer",
        tier: "community",
        day1OG: false,
        guberId: newGuberId,
        referralCode: newRefCode,
        referredBy: referrerId,
        termsAcceptedAt: new Date(),
      } as any);

      if (referrerId) {
        await db.insert(referrals).values({ referrerId, referredId: user.id, status: "pending" }).onConflictDoNothing();
      }

      const ogCheck = await db.execute(sql`SELECT 1 FROM og_preapproved_emails WHERE email = ${email.toLowerCase()} LIMIT 1`);
      const tbCheck = await db.execute(sql`SELECT 1 FROM trust_box_preapproved_emails WHERE LOWER(email) = ${email.toLowerCase()} LIMIT 1`);
      const stripeStatus = await checkStripeForOGStatus(email);

      const updates: Record<string, any> = {};
      const isOG = ogCheck.rows.length > 0 || stripeStatus.isOG;
      const hasTB = tbCheck.rows.length > 0 || stripeStatus.hasTrustBox;
      if (isOG) { updates.day1OG = true; if (!user.aiOrNotCredits || user.aiOrNotCredits < 5) updates.aiOrNotCredits = 5; }
      if (hasTB) { updates.trustBoxPurchased = true; updates.aiOrNotUnlimitedText = true; if ((user.aiOrNotCredits || 0) < 5) updates.aiOrNotCredits = (user.aiOrNotCredits || 0) + 5; }
      if (Object.keys(updates).length > 0) await storage.updateUser(user.id, updates);
      if (stripeStatus.isOG && ogCheck.rows.length === 0) {
        await db.execute(sql`INSERT INTO og_preapproved_emails (email) VALUES (${email.toLowerCase()}) ON CONFLICT DO NOTHING`);
      }
      if (stripeStatus.hasTrustBox && tbCheck.rows.length === 0) {
        await db.execute(sql`INSERT INTO trust_box_preapproved_emails (email) VALUES (${email.toLowerCase()}) ON CONFLICT DO NOTHING`);
      }

      if (isOG && hasTB) {
        await storage.createNotification({ userId: user.id, title: "Welcome, OG + Trust Box!", body: "Day-1 OG status and Trust Box are both active. Thanks for your early support!", type: "system" });
      } else if (isOG) {
        await storage.createNotification({ userId: user.id, title: "Welcome, Day-1 OG!", body: "You're a Day-1 OG member — your perks are already active. Thank you for your early support!", type: "system" });
      } else if (hasTB) {
        await storage.createNotification({ userId: user.id, title: "Trust Box Activated!", body: "Your AI or Not premium access is ready. Thanks for subscribing!", type: "system" });
      } else {
        await storage.createNotification({ userId: user.id, title: "Welcome to GUBER!", body: "Your account has been created. Complete your profile to start posting and accepting jobs.", type: "system" });
      }

      req.session.userId = user.id;

      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Session error" });
        res.status(201).json(sanitizeUser(user));
        runNSOPWBackgroundCheck(user.id, fullName).catch(() => {});
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/auth/business-signup", async (req: Request, res: Response) => {
    try {
      const parsed = businessSignupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const { ein, legalBusinessName, email, username, fullName, password, industry, contactPhone, billingEmail, description } = parsed.data;

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
      let newGuberId = generateGuberId();
      while (await storage.getUserByGuberId(newGuberId)) { newGuberId = generateGuberId(); }

      let newRefCode = generateReferralCode();
      while (true) {
        const clash = await db.execute(sql`SELECT 1 FROM users WHERE referral_code = ${newRefCode} LIMIT 1`);
        if (!clash.rows.length) break;
        newRefCode = generateReferralCode();
      }

      let user: Awaited<ReturnType<typeof storage.createUser>>;
      let businessProfile: Awaited<ReturnType<typeof storage.createBusinessProfile>>;

      try {
        await db.execute(sql`BEGIN`);

        user = await storage.createUser({
          email,
          username,
          fullName,
          password: hashedPassword,
          role: "buyer",
          tier: "community",
          day1OG: false,
          guberId: newGuberId,
          referralCode: newRefCode,
          accountType: "business",
          termsAcceptedAt: new Date(),
        });

        businessProfile = await storage.createBusinessProfile({
          userId: user.id,
          companyName: legalBusinessName.trim(),
          ein,
          legalBusinessName: legalBusinessName.trim(),
          industry: industry || null,
          contactPhone: contactPhone || null,
          billingEmail: billingEmail || null,
          description: description || null,
        });

        await db.execute(sql`COMMIT`);
      } catch (txErr) {
        await db.execute(sql`ROLLBACK`).catch(() => {});
        throw txErr;
      }

      await storage.createNotification({
        userId: user.id,
        title: "Welcome to GUBER Business!",
        body: "Your business account has been created. Complete your profile and start posting jobs.",
        type: "system",
      });

      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Session error" });
        res.status(201).json(sanitizeUser(user));
        runNSOPWBackgroundCheck(user.id, fullName).catch(() => {});
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/auth/business-access-request", async (req: Request, res: Response) => {
    try {
      const parsed = businessAccessRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const { businessName, workEmail, phone, industry, companyNeedsSummary, fullName, username, password } = parsed.data;

      const pwError = validatePasswordStrength(password);
      if (pwError) return res.status(400).json({ message: pwError });

      const existingEmail = await storage.getUserByEmail(workEmail);
      if (existingEmail) return res.status(400).json({ message: "Email already in use" });

      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) return res.status(400).json({ message: "Username already taken" });

      const hashedPassword = await hashPassword(password);
      let newGuberId = generateGuberId();
      while (await storage.getUserByGuberId(newGuberId)) { newGuberId = generateGuberId(); }

      let newRefCode = generateReferralCode();
      while (true) {
        const clash = await db.execute(sql`SELECT 1 FROM users WHERE referral_code = ${newRefCode} LIMIT 1`);
        if (!clash.rows.length) break;
        newRefCode = generateReferralCode();
      }

      let user: any;
      let bizAccount: any;

      try {
        await db.execute(sql`BEGIN`);

        user = await storage.createUser({
          email: workEmail,
          username,
          fullName,
          password: hashedPassword,
          role: "buyer",
          tier: "community",
          day1OG: false,
          guberId: newGuberId,
          referralCode: newRefCode,
          accountType: "business",
          termsAcceptedAt: new Date(),
        });

        bizAccount = await storage.createBusinessAccount({
          ownerUserId: user.id,
          businessName: businessName.trim(),
          workEmail,
          phone: phone || null,
          industry,
          companyNeedsSummary: companyNeedsSummary || null,
          status: "pending_business",
        });

        await storage.createBusinessProfile({
          userId: user.id,
          companyName: businessName.trim(),
          industry,
          contactPhone: phone || null,
        });

        await storage.createLegalAcceptance({
          actorType: "business",
          actorId: user.id,
          documentType: "business_terms",
          documentVersion: "1.0",
          ipAddress: req.ip || null,
          userAgent: req.headers["user-agent"] || null,
        });

        await db.execute(sql`COMMIT`);
      } catch (txErr) {
        await db.execute(sql`ROLLBACK`).catch(() => {});
        throw txErr;
      }

      await notify(user.id, {
        title: "Welcome to GUBER Business",
        body: "Your access request is being reviewed. You can explore the dashboard while we verify your account.",
        type: "system",
      });

      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Session error" });
        res.status(201).json({ user: sanitizeUser(user), businessAccount: bizAccount });
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/business/account", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const acct = await storage.getBusinessAccount(req.session.userId);
    if (!acct) return res.status(404).json({ message: "No business account found" });
    const plan = await storage.getBusinessPlan(acct.id);
    res.json({
      ...acct,
      planActive: plan?.status === "active",
      unlockBalance: plan?.currentUnlockBalance || 0,
      planType: plan?.planType || null,
    });
  });

  app.patch("/api/business/account", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const acct = await storage.getBusinessAccount(req.session.userId);
    if (!acct) return res.status(404).json({ message: "No business account found" });
    const updated = await storage.updateBusinessAccount(acct.id, req.body);
    res.json(updated);
  });

  app.post("/api/business/verify", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const acct = await storage.getBusinessAccount(req.session.userId);
    if (!acct) return res.status(404).json({ message: "No business account found" });
    if (!acct.verificationFeePaid) return res.status(403).json({ message: "Verification fee required before submitting EIN" });

    const parsed = businessVerificationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });

    const { ein, businessAddress, billingEmail, authorizedContactName } = parsed.data;
    const einLast4 = ein.slice(-4);

    const updated = await storage.updateBusinessAccount(acct.id, {
      einEncrypted: ein,
      einLast4,
      businessAddress,
      billingEmail,
      authorizedContactName,
      verificationSubmittedAt: new Date(),
      status: "verified_business",
      verifiedAt: new Date(),
    });

    await notify(req.session.userId, {
      title: "Business Verified",
      body: "Your business has been verified. You now have full access to the Talent Explorer.",
      type: "system",
    });

    res.json(updated);
  });

  app.post("/api/business/create-verification-checkout", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const acct = await storage.getBusinessAccount(req.session.userId);
    if (!acct) return res.status(404).json({ message: "No business account found" });

    let customerId = acct.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeMain.customers.create({
        email: acct.workEmail,
        name: acct.businessName,
        metadata: { businessAccountId: String(acct.id), userId: String(req.session.userId) },
      });
      customerId = customer.id;
      await storage.updateBusinessAccount(acct.id, { stripeCustomerId: customerId });
    }

    const session = await stripeMain.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: "GUBER Business Verification", description: "One-time business verification fee" },
          unit_amount: 4900,
        },
        quantity: 1,
      }],
      metadata: { type: "business_verification", businessAccountId: String(acct.id) },
      success_url: `${req.headers.origin || req.protocol + "://" + req.get("host")}/biz/dashboard?verified=true`,
      cancel_url: `${req.headers.origin || req.protocol + "://" + req.get("host")}/biz/dashboard`,
    });

    res.json({ url: session.url });
  });

  app.post("/api/business/create-scout-subscription", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const acct = await storage.getBusinessAccount(req.session.userId);
    if (!acct) return res.status(404).json({ message: "No business account found" });

    let customerId = acct.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeMain.customers.create({
        email: acct.workEmail,
        name: acct.businessName,
        metadata: { businessAccountId: String(acct.id), userId: String(req.session.userId) },
      });
      customerId = customer.id;
      await storage.updateBusinessAccount(acct.id, { stripeCustomerId: customerId });
    }

    const session = await stripeMain.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: "GUBER Business Scout Plan", description: "Full Talent Explorer access, 20 profile unlocks/month, offer sending" },
          unit_amount: 9900,
          recurring: { interval: "month" },
        },
        quantity: 1,
      }],
      metadata: { type: "business_scout_plan", businessAccountId: String(acct.id) },
      success_url: `${req.headers.origin || req.protocol + "://" + req.get("host")}/biz/dashboard?subscribed=true`,
      cancel_url: `${req.headers.origin || req.protocol + "://" + req.get("host")}/biz/dashboard`,
    });

    res.json({ url: session.url });
  });

  app.post("/api/business/purchase-unlocks", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const acct = await storage.getBusinessAccount(req.session.userId);
    if (!acct) return res.status(404).json({ message: "No business account found" });

    const qty = Math.max(1, Math.min(50, parseInt(req.body.quantity) || 1));

    let customerId = acct.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeMain.customers.create({
        email: acct.workEmail,
        name: acct.businessName,
        metadata: { businessAccountId: String(acct.id) },
      });
      customerId = customer.id;
      await storage.updateBusinessAccount(acct.id, { stripeCustomerId: customerId });
    }

    const session = await stripeMain.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: "Additional Profile Unlocks", description: `${qty} additional profile unlock(s) for Talent Explorer` },
          unit_amount: 700,
        },
        quantity: qty,
      }],
      metadata: { type: "business_extra_unlocks", businessAccountId: String(acct.id), quantity: String(qty) },
      success_url: `${req.headers.origin || req.protocol + "://" + req.get("host")}/biz/talent-explorer?unlocks_purchased=true`,
      cancel_url: `${req.headers.origin || req.protocol + "://" + req.get("host")}/biz/talent-explorer`,
    });

    res.json({ url: session.url });
  });

  app.get("/api/business/plan", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const acct = await storage.getBusinessAccount(req.session.userId);
    if (!acct) return res.status(404).json({ message: "No business account found" });
    const plan = await storage.getBusinessPlan(acct.id);
    res.json(plan || null);
  });

  app.get("/api/business/billing-events", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const acct = await storage.getBusinessAccount(req.session.userId);
    if (!acct) return res.status(404).json({ message: "No business account found" });
    const events = await storage.getBillingEvents(acct.id);
    res.json(events);
  });

  app.get("/api/business/talent-explorer", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const acct = await storage.getBusinessAccount(req.session.userId);
    if (!acct) return res.status(404).json({ message: "No business account found" });

    const filters: any = {};
    if (req.query.lat) filters.lat = parseFloat(req.query.lat as string);
    if (req.query.lng) filters.lng = parseFloat(req.query.lng as string);
    if (req.query.radius) filters.radiusMiles = parseFloat(req.query.radius as string);
    if (req.query.category) filters.category = req.query.category as string;
    if (req.query.minJobs) filters.minJobs = parseInt(req.query.minJobs as string);
    if (req.query.minRating) filters.minRating = parseFloat(req.query.minRating as string);
    if (req.query.minCompletionRate) filters.minCompletionRate = parseFloat(req.query.minCompletionRate as string);
    if (req.query.mobilityType) filters.mobilityType = req.query.mobilityType as string;
    if (req.query.idVerified === "true") filters.idVerified = true;
    if (req.query.backgroundVerified === "true") filters.backgroundVerified = true;
    if (req.query.availability) filters.availability = req.query.availability as string;
    if (req.query.recentActivity === "true") filters.recentActivity = true;
    if (req.query.limit) filters.limit = parseInt(req.query.limit as string);
    if (req.query.offset) filters.offset = parseInt(req.query.offset as string);

    const isLimited = acct.status === "pending_business";
    if (isLimited) {
      filters.limit = Math.min(filters.limit || 10, 10);
    }

    const results = await storage.searchWorkerProjections(filters);

    const plan = await storage.getBusinessPlan(acct.id);
    const unlocks = await storage.getBusinessUnlocks(acct.id);
    const unlockedUserIds = new Set(unlocks.map(u => u.userId));

    const candidates = results.map(proj => {
      const isUnlocked = unlockedUserIds.has(proj.userId);
      return {
        ...proj,
        isUnlocked,
        isLimitedView: isLimited,
      };
    });

    res.json({
      candidates,
      totalUnlocks: unlocks.length,
      unlockBalance: plan?.currentUnlockBalance || 0,
      planActive: plan?.status === "active",
      accountStatus: acct.status,
    });
  });

  app.post("/api/business/unlock-candidate", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const acct = await storage.getBusinessAccount(req.session.userId);
    if (!acct) return res.status(404).json({ message: "No business account found" });

    if (acct.status !== "verified_business") {
      return res.status(403).json({ message: "Business verification required to unlock profiles" });
    }

    const plan = await storage.getBusinessPlan(acct.id);
    if (!plan || plan.status !== "active") {
      return res.status(403).json({ message: "Active Scout Plan required to unlock profiles" });
    }

    const targetUserId = parseInt(req.body.userId);
    if (!targetUserId) return res.status(400).json({ message: "User ID required" });

    const existing = await storage.getBusinessUnlock(acct.id, targetUserId);
    if (existing) return res.json({ message: "Already unlocked", unlock: existing });

    if (plan.currentUnlockBalance <= 0) {
      return res.status(403).json({ message: "No unlocks remaining. Purchase additional unlocks.", requirePurchase: true });
    }

    await storage.updateBusinessPlan(plan.id, { currentUnlockBalance: plan.currentUnlockBalance - 1 });

    const unlock = await storage.createBusinessUnlock({
      businessAccountId: acct.id,
      userId: targetUserId,
      unlockSource: "plan",
    });

    res.json({ message: "Profile unlocked", unlock, remainingUnlocks: plan.currentUnlockBalance - 1 });
  });

  app.get("/api/business/candidate/:userId", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const acct = await storage.getBusinessAccount(req.session.userId);
    if (!acct) return res.status(404).json({ message: "No business account found" });

    const targetUserId = parseInt(req.params.userId);
    const projection = await storage.getWorkerProjection(targetUserId);
    if (!projection) return res.status(404).json({ message: "Candidate not found" });

    const isUnlocked = !!(await storage.getBusinessUnlock(acct.id, targetUserId));

    let detailedUser: any = null;
    if (isUnlocked) {
      const user = await storage.getUser(targetUserId);
      if (user) {
        detailedUser = {
          fullName: user.fullName,
          email: user.email,
          profilePhoto: user.profilePhoto,
          zipcode: user.zipcode,
          skills: user.skills,
          userBio: user.userBio,
        };
      }
    }

    res.json({
      projection,
      isUnlocked,
      detailedUser,
    });
  });

  app.get("/api/business/saved-candidates", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const acct = await storage.getBusinessAccount(req.session.userId);
    if (!acct) return res.status(404).json({ message: "No business account found" });
    const unlocks = await storage.getBusinessUnlocks(acct.id);
    const projections = await Promise.all(
      unlocks.map(async u => {
        const proj = await storage.getWorkerProjection(u.userId);
        return proj ? { ...proj, isUnlocked: true, unlockedAt: u.createdAt } : null;
      })
    );
    res.json(projections.filter(Boolean));
  });

  app.post("/api/business/send-offer", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const acct = await storage.getBusinessAccount(req.session.userId);
    if (!acct) return res.status(404).json({ message: "No business account found" });
    if (acct.status !== "verified_business") return res.status(403).json({ message: "Business verification required" });

    const plan = await storage.getBusinessPlan(acct.id);
    if (!plan || plan.status !== "active") return res.status(403).json({ message: "Active Scout Plan required" });

    const parsed = businessOfferSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });

    const isUnlocked = await storage.getBusinessUnlock(acct.id, parsed.data.userId);
    if (!isUnlocked) return res.status(403).json({ message: "You must unlock this candidate before sending an offer" });

    const offer = await storage.createBusinessOffer({
      businessAccountId: acct.id,
      userId: parsed.data.userId,
      offerType: parsed.data.offerType,
      subject: parsed.data.subject,
      message: parsed.data.message || null,
    });

    await notify(parsed.data.userId, {
      title: "New Business Offer",
      body: `A verified company has sent you an opportunity: ${parsed.data.subject}`,
      type: "business_offer",
    });

    res.json(offer);
  });

  app.get("/api/business/offers", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const acct = await storage.getBusinessAccount(req.session.userId);
    if (!acct) return res.status(404).json({ message: "No business account found" });
    const offers = await storage.getBusinessOffers(acct.id);
    res.json(offers);
  });

  app.get("/api/user/business-offers", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const offers = await storage.getBusinessOffersByUser(req.session.userId);
    const enriched = await Promise.all(offers.map(async o => {
      const bizAcct = await storage.getBusinessAccountById(o.businessAccountId);
      return { ...o, businessName: bizAcct?.businessName || "Company" };
    }));
    res.json(enriched);
  });

  app.post("/api/user/respond-offer/:offerId", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const offer = await storage.getBusinessOffer(parseInt(req.params.offerId));
    if (!offer || offer.userId !== req.session.userId) return res.status(404).json({ message: "Offer not found" });

    const { response } = req.body;
    if (response === "accept") {
      await storage.updateBusinessOffer(offer.id, { acceptedAt: new Date(), status: "accepted" });
    } else if (response === "decline") {
      await storage.updateBusinessOffer(offer.id, { declinedAt: new Date(), status: "declined" });
    } else {
      return res.status(400).json({ message: "Invalid response" });
    }

    res.json({ message: `Offer ${response}ed` });
  });

  app.post("/api/business/refresh-projections", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });

    const allUsers = await storage.getAllUsers();
    let count = 0;
    for (const u of allUsers) {
      if (u.accountType === "business") continue;
      if ((u.jobsCompleted || 0) < 1 && !u.isAvailable) continue;

      const reviews = await storage.getReviewsByUser(u.id);
      const jobs = await storage.getJobsByUser(u.id);
      const completedJobs = jobs.filter(j => ["completion_submitted", "completed_paid"].includes(j.status));

      const categories = [...new Set(completedJobs.map(j => j.category).filter(Boolean))];
      const avgRating = u.rating || 0;
      const completionRate = u.jobsCompleted ? ((u.jobsCompleted - (u.canceledCount || 0)) / u.jobsCompleted) * 100 : 100;

      const recentActivity = completedJobs.some(j => j.completedAt && (Date.now() - new Date(j.completedAt).getTime()) < 30 * 24 * 60 * 60 * 1000);

      const walletTxns = await storage.getWalletByUser(u.id);
      const totalEarned = walletTxns.filter(t => t.type === "earning" && t.status === "completed").reduce((sum, t) => sum + t.amount, 0);

      const badges: string[] = [];
      if (u.badgeTier === "reliable") badges.push("reliable");
      if ((u.jobsCompleted || 0) >= 50) badges.push("frequent_worker");
      if ((u.proofQualityScore || 0) >= 80) badges.push("strong_proof");
      if ((u.onTimePct || 0) >= 95) badges.push("fast_response");
      if (avgRating >= 4.8 && (u.jobsCompleted || 0) >= 20) badges.push("elite_reliability");

      await storage.upsertWorkerProjection({
        userId: u.id,
        guberId: u.guberId || null,
        primaryCategories: categories.length > 0 ? categories : null,
        currentRegion: u.zipcode || null,
        mobilityType: "local_only",
        jobsCompleted: u.jobsCompleted || 0,
        completionRate: Math.round(completionRate * 10) / 10,
        averageRating: Math.round(avgRating * 10) / 10,
        responseSpeedScore: u.onTimePct || 0,
        proofStrengthScore: u.proofQualityScore || 0,
        recentActivityFlag: recentActivity,
        idVerified: u.idVerified || false,
        backgroundVerified: u.backgroundCheckStatus === "passed",
        eliteBadgesJson: badges.length > 0 ? badges : null,
        revenueEarned: totalEarned,
        availabilityStatus: u.isAvailable ? "available" : "unavailable",
        businessVisibilityStatus: u.resumeVisibleToCompanies !== false ? "visible" : "hidden",
        reviewCount: u.reviewCount || 0,
        reliabilityScore: u.reliabilityScore || 100,
        lat: u.lat || null,
        lng: u.lng || null,
      });

      if (totalEarned >= 1000) {
        const existing = await storage.getBackgroundCheckEligibility(u.id);
        if (!existing) {
          await storage.createBackgroundCheckEligibility({
            userId: u.id,
            eligibilitySource: "revenue_milestone",
            thresholdAmount: 1000,
            unlockedAt: new Date(),
            notificationSentAt: new Date(),
          });
          await notify(u.id, {
            title: "Background Check Available",
            body: "You've reached a milestone on GUBER. A voluntary background check is now available to enhance your profile credibility.",
            type: "system",
          });
          console.log(`[GUBER][bg-check] User ${u.id} now eligible for background check (earned $${totalEarned})`);
        }
      }

      count++;
    }

    res.json({ message: `Refreshed ${count} projections` });
  });

  app.get("/api/admin/business-accounts", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });

    const status = req.query.status as string | undefined;
    const accounts = await storage.getAllBusinessAccounts(status || undefined);
    res.json(accounts);
  });

  app.patch("/api/admin/business-account/:id/status", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });

    const id = parseInt(req.params.id);
    const { status } = req.body;
    const validStatuses = ["pending_business", "approved_limited", "verified_business", "suspended"];
    if (!validStatuses.includes(status)) return res.status(400).json({ message: "Invalid status" });

    const updated = await storage.updateBusinessAccount(id, { status });
    if (!updated) return res.status(404).json({ message: "Account not found" });

    if (updated.ownerUserId) {
      await notify(updated.ownerUserId, {
        title: "Business Account Update",
        body: `Your business account status has been updated to: ${status.replace(/_/g, " ")}`,
        type: "system",
      });
    }

    res.json(updated);
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      const { email, password } = parsed.data;

      let user = await storage.getUserByEmail(email);
      if (!user) return res.status(401).json({ message: "Invalid credentials" });
      if (user.banned) return res.status(403).json({ message: "Account permanently banned" });
      if (user.suspended) return res.status(403).json({ message: "Account suspended" });

      // Guard: if password is null/missing (shouldn't happen but protect against it)
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

      // Sync OG / TrustBox on every login — check both local table and Stripe directly
      if (!user.day1OG || !user.trustBoxPurchased) {
        const [loginOgCheck, loginTbCheck, stripeCheck] = await Promise.all([
          db.execute(sql`SELECT 1 FROM og_preapproved_emails WHERE email = ${email.toLowerCase()} LIMIT 1`),
          db.execute(sql`SELECT 1 FROM trust_box_preapproved_emails WHERE LOWER(email) = ${email.toLowerCase()} LIMIT 1`),
          checkStripeForOGStatus(email),
        ]);
        const loginUpdates: Record<string, any> = {};
        if (!user.day1OG && (loginOgCheck.rows.length > 0 || stripeCheck.isOG)) {
          loginUpdates.day1OG = true;
          if (!user.aiOrNotCredits || user.aiOrNotCredits < 5) loginUpdates.aiOrNotCredits = 5;
        }
        if (!user.trustBoxPurchased && (loginTbCheck.rows.length > 0 || stripeCheck.hasTrustBox)) {
          loginUpdates.trustBoxPurchased = true;
          loginUpdates.aiOrNotUnlimitedText = true;
          if ((user.aiOrNotCredits || 0) < 5) loginUpdates.aiOrNotCredits = (user.aiOrNotCredits || 0) + 5;
        }
        if (Object.keys(loginUpdates).length > 0) {
          await storage.updateUser(user.id, loginUpdates);
          user = (await storage.getUser(user.id))!;
          if (loginUpdates.day1OG) {
            await storage.createNotification({ userId: user.id, title: "Day-1 OG Activated!", body: "You're a Day-1 OG member — your perks are now active.", type: "system" });
          }
          if (loginUpdates.trustBoxPurchased) {
            await storage.createNotification({ userId: user.id, title: "Trust Box Activated!", body: "Your AI or Not premium access is now active.", type: "system" });
          }
        }
      }

      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Session error" });
        res.json(sanitizeUser(user));
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => { res.json({ message: "Logged out" }); });
  });

  // ── Demo login — for App Store / Play Store reviewers only ─────────────────
  // Hidden behind 5-taps on the logo in the login UI. Never shown to regular users.
  app.post("/api/demo-login", async (req: Request, res: Response) => {
    try {
      const type = req.body.type as string;
      if (type !== "consumer" && type !== "business") {
        return res.status(400).json({ message: "Invalid demo type" });
      }
      const { DEMO_CONSUMER_EMAIL, DEMO_BUSINESS_EMAIL } = await import("./seed-demo");
      const email = type === "consumer" ? DEMO_CONSUMER_EMAIL : DEMO_BUSINESS_EMAIL;
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(404).json({ message: "Demo account not found. Please contact support." });
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Session error" });
        const redirectTo = type === "business" ? "/biz/dashboard" : "/dashboard";
        res.json({ redirectTo, user: sanitizeUser(user) });
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
  // ───────────────────────────────────────────────────────────────────────────

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    res.json(sanitizeUser(user));
  });

  const getBaseUrl = (req: Request) => {
    if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
    const scheme = proto === "https" || process.env.NODE_ENV === "production" ? "https" : "http";
    return `${scheme}://${req.get("host")}`;
  };

  app.post("/api/auth/store-ref", (req: Request, res: Response) => {
    const { ref } = req.body;
    if (ref && typeof ref === "string") (req.session as any).pendingReferralCode = ref.toUpperCase();
    res.json({ ok: true });
  });

  app.get("/api/auth/google", (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(503).json({ message: "Google Sign-In not configured" });
    const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
    const state = randomBytes(16).toString("hex");
    (req.session as any).oauthState = state;
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
      if (err) return res.redirect("/login?error=google_failed");
      res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    });
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string>;
    if (error || !code) return res.redirect("/login?error=google_cancelled");
    const expectedState = (req.session as any).oauthState;
    delete (req.session as any).oauthState;
    if (!state || !expectedState || state !== expectedState) {
      return res.redirect("/login?error=invalid_state");
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.redirect("/login?error=not_configured");
    try {
      const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      });
      const tokens = await tokenRes.json() as any;
      if (!tokens.access_token) return res.redirect("/login?error=token_failed");
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      const googleUser = await userInfoRes.json() as any;
      if (!googleUser.sub || !googleUser.email) return res.redirect("/login?error=no_user_info");
      let user = await storage.getUserByGoogleSub(googleUser.sub);
      if (!user) {
        user = await storage.getUserByEmail(googleUser.email);
        if (user) {
          await storage.updateUser(user.id, { googleSub: googleUser.sub, authProvider: "google" });
          user = (await storage.getUser(user.id))!;
        }
      }
      if (!user) {
        const baseUsername = (googleUser.email.split("@")[0] || "user").replace(/[^a-z0-9_]/gi, "").toLowerCase();
        let username = baseUsername;
        let suffix = 1;
        while (await storage.getUserByUsername(username)) { username = `${baseUsername}${suffix++}`; }
        let googleGuberId = generateGuberId();
        while (await storage.getUserByGuberId(googleGuberId)) { googleGuberId = generateGuberId(); }
        let googleRefCode = generateReferralCode();
        while ((await db.execute(sql`SELECT 1 FROM users WHERE referral_code = ${googleRefCode} LIMIT 1`)).rows.length) { googleRefCode = generateReferralCode(); }
        const googleIncomingRef = (req.session as any).pendingReferralCode || null;
        let googleReferrerId: number | null = null;
        if (googleIncomingRef) {
          const ro = await db.execute(sql`SELECT id FROM users WHERE referral_code = ${googleIncomingRef} LIMIT 1`);
          if (ro.rows.length) googleReferrerId = (ro.rows[0] as any).id;
        }
        user = await storage.createUser({
          email: googleUser.email,
          username,
          fullName: googleUser.name || googleUser.email.split("@")[0],
          password: await hashPassword(randomBytes(32).toString("hex")),
          googleSub: googleUser.sub,
          authProvider: "google",
          emailVerified: true,
          profilePhoto: googleUser.picture || null,
          role: "buyer",
          tier: "community",
          day1OG: false,
          guberId: googleGuberId,
          referralCode: googleRefCode,
          referredBy: googleReferrerId,
        } as any);
        if (googleReferrerId) {
          await db.insert(referrals).values({ referrerId: googleReferrerId, referredId: user.id, status: "pending" }).onConflictDoNothing();
        }
        const ogCheckG = await db.execute(sql`SELECT 1 FROM og_preapproved_emails WHERE email = ${googleUser.email.toLowerCase()} LIMIT 1`);
        const tbCheckG = await db.execute(sql`SELECT 1 FROM trust_box_preapproved_emails WHERE LOWER(email) = ${googleUser.email.toLowerCase()} LIMIT 1`);
        const stripeG = await checkStripeForOGStatus(googleUser.email);
        const gIsOG = ogCheckG.rows.length > 0 || stripeG.isOG;
        const gHasTB = tbCheckG.rows.length > 0 || stripeG.hasTrustBox;
        const gUpdates: Record<string, any> = {};
        if (gIsOG) { gUpdates.day1OG = true; gUpdates.aiOrNotCredits = 5; }
        if (gHasTB) { gUpdates.trustBoxPurchased = true; gUpdates.aiOrNotUnlimitedText = true; if ((user.aiOrNotCredits || 0) < 5) gUpdates.aiOrNotCredits = (user.aiOrNotCredits || 0) + 5; }
        if (Object.keys(gUpdates).length > 0) await storage.updateUser(user.id, gUpdates);
        if (stripeG.isOG && ogCheckG.rows.length === 0) {
          await db.execute(sql`INSERT INTO og_preapproved_emails (email) VALUES (${googleUser.email.toLowerCase()}) ON CONFLICT DO NOTHING`);
        }
        if (stripeG.hasTrustBox && tbCheckG.rows.length === 0) {
          await db.execute(sql`INSERT INTO trust_box_preapproved_emails (email) VALUES (${googleUser.email.toLowerCase()}) ON CONFLICT DO NOTHING`);
        }
        if (gIsOG && gHasTB) {
          await storage.createNotification({ userId: user.id, title: "Welcome, OG + Trust Box!", body: "Day-1 OG status and Trust Box are both active. Thanks for your early support!", type: "system" });
        } else if (gIsOG) {
          await storage.createNotification({ userId: user.id, title: "Welcome, Day-1 OG!", body: "You're a Day-1 OG member — your perks are already active. Thank you for your early support!", type: "system" });
        } else if (gHasTB) {
          await storage.createNotification({ userId: user.id, title: "Trust Box Activated!", body: "Your AI or Not premium access is ready. Thanks for subscribing!", type: "system" });
        } else {
          await storage.createNotification({ userId: user.id, title: "Welcome to GUBER!", body: "Your account has been created via Google. Complete your profile to get started.", type: "system" });
        }
      }
      // Sync OG / TrustBox on every Google login for existing users
      if (!user.day1OG || !user.trustBoxPurchased) {
        const gLoginOgCheck = await db.execute(sql`SELECT 1 FROM og_preapproved_emails WHERE email = ${googleUser.email.toLowerCase()} LIMIT 1`);
        const gLoginTbCheck = await db.execute(sql`SELECT 1 FROM trust_box_preapproved_emails WHERE LOWER(email) = ${googleUser.email.toLowerCase()} LIMIT 1`);
        const stripeLogin = await checkStripeForOGStatus(googleUser.email);
        const gLoginUpdates: Record<string, any> = {};
        if (!user.day1OG && (gLoginOgCheck.rows.length > 0 || stripeLogin.isOG)) {
          gLoginUpdates.day1OG = true;
          if (!user.aiOrNotCredits || user.aiOrNotCredits < 5) gLoginUpdates.aiOrNotCredits = 5;
        }
        if (!user.trustBoxPurchased && (gLoginTbCheck.rows.length > 0 || stripeLogin.hasTrustBox)) {
          gLoginUpdates.trustBoxPurchased = true;
          gLoginUpdates.aiOrNotUnlimitedText = true;
          if ((user.aiOrNotCredits || 0) < 5) gLoginUpdates.aiOrNotCredits = (user.aiOrNotCredits || 0) + 5;
        }
        if (Object.keys(gLoginUpdates).length > 0) {
          await storage.updateUser(user.id, gLoginUpdates);
          user = (await storage.getUser(user.id))!;
          if (gLoginUpdates.day1OG) {
            await storage.createNotification({ userId: user.id, title: "Day-1 OG Activated!", body: "You're a Day-1 OG member — your perks are now active.", type: "system" });
          }
          if (gLoginUpdates.trustBoxPurchased) {
            await storage.createNotification({ userId: user.id, title: "Trust Box Activated!", body: "Your AI or Not premium access is now active.", type: "system" });
          }
        }
      }

      if (user.banned) return res.redirect("/login?error=banned");
      if (user.suspended) return res.redirect("/login?error=suspended");
      const loginToken = randomBytes(24).toString("hex");
      const expiresAt = Date.now() + 60_000;
      await pool.query(`INSERT INTO login_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`, [loginToken, user.id, expiresAt]);
      res.redirect(`/oauth-landing?t=${loginToken}`);
    } catch (err: any) {
      console.error("Google OAuth error:", err);
      res.redirect("/login?error=google_failed");
    }
  });

  // Deep link support for iOS Universal Links and Android App Links
  app.get("/.well-known/apple-app-site-association", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/json");
    // appID format is TEAM_ID.BUNDLE_ID — replace XXXXXXXXXX with actual Apple Team ID before App Store submission
    res.json({
      applinks: {
        apps: [],
        details: [
          {
            appID: `${process.env.APPLE_TEAM_ID || "XXXXXXXXXX"}.com.guber.app`,
            paths: ["/login", "/oauth-complete", "/join/*", "/dashboard", "/biz/*"],
          },
        ],
      },
    });
  });

  app.get("/.well-known/assetlinks.json", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/json");
    res.json([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.guber.app",
          sha256_cert_fingerprints: ["3E:7D:66:29:CF:7F:F0:38:57:64:1D:D1:61:3C:0E:C6:2A:7A:0B:E5:B9:6C:F9:71:76:9E:6F:1B:C8:0C:E1:0B"],
        },
      },
    ]);
  });

  app.get("/api/auth/exchange-token", async (req: Request, res: Response) => {
    const token = req.query.t as string;
    if (!token) return res.status(400).json({ message: "Missing token" });
    try {
      const result = await pool.query<{ user_id: number }>(`DELETE FROM login_tokens WHERE token = $1 AND expires_at >= $2 RETURNING user_id`, [token, Date.now()]);
      if (!result.rows.length) {
        return res.status(401).json({ message: "Token expired or invalid" });
      }
      req.session.userId = result.rows[0].user_id;
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Session error" });
        res.json({ ok: true });
      });
    } catch (err) {
      console.error("[GUBER] Token exchange DB error:", err);
      return res.status(500).json({ message: "Internal error" });
    }
  });

  app.get("/oauth-landing", (req: Request, res: Response) => {
    const token = req.query.t as string;
    if (!token) return res.redirect("/login");
    const ua = (req.headers["user-agent"] || "").toLowerCase();
    const isAndroid = ua.includes("android");
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const base = getBaseUrl(req);
    const loginUrl = `${base}/login?t=${encodeURIComponent(token)}`;
    const host = new URL(base).host;
    const intentUrl = `intent://${host}/login?t=${encodeURIComponent(token)}#Intent;scheme=https;package=com.guber.app;S.browser_fallback_url=${encodeURIComponent(loginUrl)};end`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.send(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Signing in to GUBER...</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0a0e14;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
  .c{padding:2rem}
  .logo{font-size:2rem;font-weight:900;letter-spacing:0.1em;color:#00e5e5;margin-bottom:1rem}
  .msg{font-size:1rem;color:#94a3b8;margin-bottom:2rem}
  .spinner{width:32px;height:32px;border:3px solid #1e293b;border-top-color:#00e5e5;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 1.5rem}
  @keyframes spin{to{transform:rotate(360deg)}}
  .btn{display:none;background:#00e5e5;color:#0a0e14;border:none;padding:14px 32px;border-radius:12px;font-size:1rem;font-weight:700;cursor:pointer;text-decoration:none;margin-top:1rem}
  .btn.show{display:inline-block}
  .sub{font-size:0.75rem;color:#475569;margin-top:1rem}
</style>
</head><body>
<div class="c">
  <div class="logo">GUBER</div>
  <div class="spinner"></div>
  <div class="msg">Signing you in...</div>
  <a id="fallback" class="btn" href="${loginUrl}">Open GUBER</a>
  <p class="sub">If the app doesn't open automatically, tap the button above.</p>
</div>
<script>
(function(){
  var isAndroid = ${isAndroid};
  var isIOS = ${isIOS};
  var loginUrl = ${JSON.stringify(loginUrl)};
  var intentUrl = ${JSON.stringify(intentUrl)};

  if (isAndroid) {
    window.location.href = intentUrl;
  } else if (isIOS) {
    window.location.href = loginUrl;
  } else {
    window.location.href = loginUrl;
    return;
  }
  setTimeout(function(){
    document.getElementById('fallback').classList.add('show');
  }, 3000);
})();
</script>
</body></html>`);
  });

  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });
      const user = await storage.getUserByEmail(email);
      if (!user) return res.json({ message: "If that email exists, a reset link has been sent." });
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await storage.createPasswordResetToken(user.id, token, expiresAt);
      const resetUrl = `${getBaseUrl(req)}/reset-password?token=${token}`;
      console.log(`[GUBER] Password reset link for ${email}: ${resetUrl}`);
      if (process.env.RESEND_API_KEY) {
        try {
          const { Resend } = await import("resend");
          const resend = new Resend(process.env.RESEND_API_KEY);
          const fromDomain = process.env.RESEND_FROM_DOMAIN || "guberapp.app";
          const { data, error } = await resend.emails.send({
            from: `GUBER <noreply@${fromDomain}>`,
            to: email,
            subject: "Reset your GUBER password",
            html: `
              <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; background: #0a0a0a; color: #ffffff; padding: 40px 32px; border-radius: 16px;">
                <h1 style="font-size: 28px; font-weight: 800; color: #22c55e; letter-spacing: -0.5px; margin: 0 0 8px;">GUBER</h1>
                <p style="font-size: 11px; color: #666; letter-spacing: 0.2em; text-transform: uppercase; margin: 0 0 32px;">RESET YOUR PASSWORD</p>
                <p style="font-size: 15px; color: #ccc; line-height: 1.6; margin: 0 0 24px;">
                  Hi ${user.fullName || user.username},<br><br>
                  Someone requested a password reset for your GUBER account. Click the button below to set a new password. This link expires in <strong style="color: #fff;">1 hour</strong>.
                </p>
                <a href="${resetUrl}" style="display: inline-block; background: #22c55e; color: #000; font-weight: 700; font-size: 14px; letter-spacing: 0.15em; text-transform: uppercase; text-decoration: none; padding: 14px 32px; border-radius: 10px; margin-bottom: 24px;">Reset Password</a>
                <p style="font-size: 12px; color: #555; line-height: 1.5; margin: 0;">
                  If you didn't request this, ignore this email — your password won't change.<br><br>
                  Or copy this link: <a href="${resetUrl}" style="color: #22c55e; word-break: break-all;">${resetUrl}</a>
                </p>
              </div>
            `,
          });
          if (error) console.error("[GUBER] Resend error:", error.message);
          else console.log("[GUBER] Reset email sent, id:", data?.id);
        } catch (emailErr: any) {
          console.error("[GUBER] Failed to send reset email:", emailErr.message);
        }
      }
      res.json({ message: "If that email exists, a reset link has been sent.", resetUrl: process.env.NODE_ENV !== "production" ? resetUrl : undefined });
    } catch (err: any) {
      console.error("[GUBER] forgot-password error:", err);
      res.status(500).json({ message: "Error processing request" });
    }
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ message: "Token and password required" });
      const pwError = validatePasswordStrength(password);
      if (pwError) return res.status(400).json({ message: pwError });
      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken) return res.status(400).json({ message: "Invalid or expired reset link" });
      if (resetToken.used) return res.status(400).json({ message: "This reset link has already been used" });
      if (new Date() > resetToken.expiresAt) return res.status(400).json({ message: "Reset link has expired" });
      const hashedPassword = await hashPassword(password);
      await storage.updateUser(resetToken.userId, { password: hashedPassword });
      await storage.invalidatePasswordResetToken(token);
      res.json({ message: "Password updated successfully" });
    } catch (err: any) {
      res.status(500).json({ message: "Error resetting password" });
    }
  });

  // Change password (authenticated user, requires current password)
  app.post("/api/auth/change-password", requireAuth, async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) return res.status(400).json({ message: "Current and new password required" });
      const pwError = validatePasswordStrength(newPassword);
      if (pwError) return res.status(400).json({ message: pwError });
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.authProvider === "google") return res.status(400).json({ message: "Google accounts cannot set a password" });
      const valid = await comparePasswords(currentPassword, user.password);
      if (!valid) return res.status(401).json({ message: "Current password is incorrect" });
      const hashed = await hashPassword(newPassword);
      await storage.updateUser(user.id, { password: hashed });
      res.json({ message: "Password updated successfully" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // USERS - specific routes MUST come before /:id parameterized route
  app.patch("/api/users/me/public-username", requireAuth, async (req: Request, res: Response) => {
    try {
      const { publicUsername } = req.body;
      if (publicUsername === undefined) {
        return res.status(400).json({ message: "publicUsername field required" });
      }
      const trimmed = (publicUsername as string).trim();
      if (trimmed === "") {
        await storage.updateUser(req.session.userId!, { publicUsername: null } as any);
        return res.json({ success: true, publicUsername: null });
      }
      const validationError = validatePublicUsername(trimmed);
      if (validationError) return res.status(400).json({ message: validationError });
      const existing = await storage.getUserByPublicUsername(trimmed);
      if (existing && existing.id !== req.session.userId) {
        return res.status(409).json({ message: "That username is already taken" });
      }
      await storage.updateUser(req.session.userId!, { publicUsername: trimmed } as any);
      res.json({ success: true, publicUsername: trimmed });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/users/me/notification-preferences", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({
        notifNearbyJobs: user.notifNearbyJobs ?? true,
        notifMessages: user.notifMessages ?? true,
        notifJobUpdates: user.notifJobUpdates ?? true,
        notifCashDrops: user.notifCashDrops ?? true,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/users/me/notification-preferences", requireAuth, async (req: Request, res: Response) => {
    try {
      const { notifNearbyJobs, notifMessages, notifJobUpdates, notifCashDrops } = req.body;
      const updates: Record<string, boolean> = {};
      if (typeof notifNearbyJobs === "boolean") updates.notifNearbyJobs = notifNearbyJobs;
      if (typeof notifMessages === "boolean") updates.notifMessages = notifMessages;
      if (typeof notifJobUpdates === "boolean") updates.notifJobUpdates = notifJobUpdates;
      if (typeof notifCashDrops === "boolean") updates.notifCashDrops = notifCashDrops;
      await storage.updateUser(req.session.userId!, updates as any);
      res.json({ success: true, ...updates });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/users/me/validate-username", requireAuth, async (req: Request, res: Response) => {
    const value = (req.query.value as string) || "";
    const validationError = validatePublicUsername(value.trim());
    if (validationError) return res.json({ valid: false, message: validationError });
    const existing = await storage.getUserByPublicUsername(value.trim());
    if (existing && existing.id !== req.session.userId) {
      return res.json({ valid: false, message: "That username is already taken" });
    }
    res.json({ valid: true });
  });

  app.get("/api/users/:id", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser(parseInt(req.params.id));
    if (!user) return res.status(404).json({ message: "User not found" });

    // Block non-admins from viewing admin profiles
    const requester = await storage.getUser(req.session.userId!);
    if (user.role === "admin" && requester?.role !== "admin") {
      return res.status(404).json({ message: "User not found" });
    }

    const safe = sanitizeUser(user);
    if (safe.userBio) safe.userBio = filterContactInfo(safe.userBio as string).clean;
    if (safe.skills) safe.skills = filterContactInfo(safe.skills as string).clean;

    const isOwn = req.session.userId === user.id;
    const isAdmin = requester?.role === "admin";

    if (!isOwn) {
      delete safe.email;
      delete safe.stripeCustomerId;
      delete safe.stripeAccountId;
      delete safe.stripeAccountStatus;
      delete safe.fullName;
      delete safe.username;
      delete safe.zipcode;
      delete safe.lat;
      delete safe.lng;
      delete safe.password;
    }

    res.json(safe);
  });

  app.patch("/api/users/set-public-username", requireAuth, async (req: Request, res: Response) => {
    try {
      const { publicUsername } = req.body;
      if (!publicUsername && publicUsername !== "") {
        return res.status(400).json({ message: "publicUsername field required" });
      }
      const trimmed = (publicUsername as string).trim();
      if (trimmed === "") {
        await storage.updateUser(req.session.userId!, { publicUsername: null } as any);
        return res.json({ success: true, publicUsername: null });
      }
      const validationError = validatePublicUsername(trimmed);
      if (validationError) return res.status(400).json({ message: validationError });
      const existing = await storage.getUserByPublicUsername(trimmed);
      if (existing && existing.id !== req.session.userId) {
        return res.status(409).json({ message: "That username is already taken" });
      }
      await storage.updateUser(req.session.userId!, { publicUsername: trimmed } as any);
      res.json({ success: true, publicUsername: trimmed });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/users/validate-public-username", requireAuth, async (req: Request, res: Response) => {
    const value = (req.query.value as string) || "";
    const validationError = validatePublicUsername(value.trim());
    if (validationError) return res.json({ valid: false, message: validationError });
    const existing = await storage.getUserByPublicUsername(value.trim());
    if (existing && existing.id !== req.session.userId) {
      return res.json({ valid: false, message: "That username is already taken" });
    }
    res.json({ valid: true });
  });

  app.post("/api/users/credential-upload", requireAuth, async (req, res) => {
    try {
      const { fileBase64, fileName, fileType } = req.body;
      if (!fileBase64) return res.status(400).json({ message: "File is required" });

      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const uploadType = req.body.uploadType || "credential";
      const auditAction = uploadType === "id" ? "id_upload" : "credential_upload";

      const actionMap: Record<string, string[]> = {
        id: ["id_upload", "verification_submitted_id"],
        credential: ["credential_upload", "verification_submitted_credential"],
      };
      const relatedActions = actionMap[uploadType] || [auditAction];
      const placeholders = relatedActions.map(a => `'${a}'`).join(",");
      const existingPending = await db.execute(sql`
        SELECT id FROM audit_logs
        WHERE user_id = ${userId}
          AND action IN (${sql.raw(placeholders)})
          AND COALESCE(review_status, 'pending') = 'pending'
        LIMIT 1
      `);
      if ((existingPending.rows as any[]).length > 0) {
        return res.status(409).json({ message: `You already have a pending ${uploadType} submission under review.` });
      }

      await storage.createAuditLog({
        userId,
        action: auditAction,
        details: JSON.stringify({ fileName: fileName || "document", mimeType: fileType || "unknown", base64: fileBase64 }),
        ipAddress: req.ip,
      });

      await storage.updateUser(userId, { credentialUploadPending: true });

      await storage.createNotification({
        userId,
        title: "Credential Uploaded",
        body: "Your document has been submitted for verification. We'll notify you once reviewed.",
        type: "system"
      });

      // Push alert to all admins
      const uploaderName = user.fullName || user.username || `User #${userId}`;
      const uploadLabel = uploadType === "id" ? "ID Document" : "Credential";
      const adminUsers = await db.select({ id: usersTable.id }).from(usersTable).where(sqlEq(usersTable.role, "admin"));
      for (const admin of adminUsers) {
        await storage.createNotification({
          userId: admin.id,
          type: "admin_alert",
          title: `Verification: ${uploadLabel}`,
          body: `${uploaderName} submitted a ${uploadLabel.toLowerCase()} for review.`,
          jobId: null,
        });
        await sendPushToUser(admin.id, {
          title: `New Verification: ${uploadLabel}`,
          body: `${uploaderName} submitted a ${uploadLabel.toLowerCase()}. Open admin panel to review.`,
          url: "/admin",
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/users/:id", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (req.session.userId !== id) return res.status(403).json({ message: "Forbidden" });

      const { fullName, userBio, zipcode, profilePhoto, skills, isAvailable } = req.body;
      const updates: any = {};
      if (fullName !== undefined) {
        const check = filterContactInfo(fullName as string);
        if (check.blocked) return res.status(400).json({ message: "Contact info not allowed in names" });
        updates.fullName = check.clean;
      }
      if (userBio !== undefined) {
        const check = filterContactInfo(userBio as string);
        if (check.blocked) return res.status(400).json({ message: "Contact info not allowed in bio" });
        updates.userBio = check.clean;
      }
      if (skills !== undefined) {
        const check = filterContactInfo(skills as string);
        if (check.blocked) return res.status(400).json({ message: "Contact info not allowed in skills" });
        updates.skills = check.clean;
      }
      if (zipcode !== undefined) updates.zipcode = zipcode;
      if (isAvailable !== undefined) updates.isAvailable = !!isAvailable;
      if (profilePhoto !== undefined) {
        let photo = profilePhoto;
        if (typeof photo === "object" && photo.base64) {
          photo = photo.base64;
        } else if (typeof photo === "string") {
          if (!photo.startsWith("data:image/") && !photo.startsWith("http")) {
            return res.status(400).json({ message: "Profile photo must be a valid image." });
          }
        }
        if (typeof photo === "string" && photo.startsWith("data:") && photo.length > 4 * 1024 * 1024) {
          return res.status(413).json({ message: "Photo is too large. Please use an image under 3MB." });
        }
        updates.profilePhoto = photo;
      }

      const user = await storage.updateUser(id, updates);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(sanitizeUser(user));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/heat-map", async (_req: Request, res: Response) => {
    try {
      const data = await storage.getJobCountsByZip();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/map-jobs", async (req: Request, res: Response) => {
    try {
      let mapJobs = await storage.getOpenJobsForMap();

      const demoIds = await getDemoUserIds();
      const callerIsDemoUser = req.session?.userId ? demoIds.has(req.session.userId) : false;
      if (!callerIsDemoUser && demoIds.size > 0) {
        mapJobs = mapJobs.filter(j => !demoIds.has(j.postedById));
      }

      // Geocode any jobs missing lat/lng — prefer zip over vague location strings.
      // A real address contains digits (e.g. "123 Main St"). Descriptions like
      // "Front/back yard" are not geocodable so fall back to zip.
      const geocodePromises = mapJobs
        .filter(j => (!j.lat || !j.lng) && (j.location || j.zip))
        .map(async j => {
          const locationLooksLikeAddress = j.location && /\d/.test(j.location);
          const addr = locationLooksLikeAddress ? j.location! : (j.zip ? `${j.zip}, USA` : j.location!);
          const coords = await geocodeAddress(addr);
          if (coords) {
            await storage.updateJob(j.id, { lat: coords.lat, lng: coords.lng });
            j.lat = coords.lat;
            j.lng = coords.lng;
          }
        });
      if (geocodePromises.length) await Promise.allSettled(geocodePromises);

      const pins = mapJobs
        .filter(j => j.lat && j.lng)
        .map(j => ({
          id: j.id,
          title: j.title,
          category: j.category,
          serviceType: j.serviceType,
          budget: j.budget,
          status: j.status,
          urgentSwitch: j.urgentSwitch,
          lat: fuzzCoordinate(j.lat),
          lng: fuzzCoordinate(j.lng),
          locationApprox: j.locationApprox || (j.zip ? `${j.zip} area` : null),
          color: CATEGORY_COLORS[j.category] || "#6B7280",
          createdAt: j.createdAt,
        }));
      res.json(pins);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/map-jobs/by-zip", async (req: Request, res: Response) => {
    try {
      let mapJobs = await storage.getOpenJobsForMap();

      const demoIds = await getDemoUserIds();
      const callerIsDemoUser = req.session?.userId ? demoIds.has(req.session.userId) : false;
      if (!callerIsDemoUser && demoIds.size > 0) {
        mapJobs = mapJobs.filter(j => !demoIds.has(j.postedById));
      }

      // Geocode missing lat/lng — prefer zip over vague location strings
      const geocodePromises = mapJobs
        .filter(j => (!j.lat || !j.lng) && (j.location || j.zip))
        .map(async j => {
          const locationLooksLikeAddress = j.location && /\d/.test(j.location);
          const addr = locationLooksLikeAddress ? j.location! : (j.zip ? `${j.zip}, USA` : j.location!);
          const coords = await geocodeAddress(addr);
          if (coords) {
            await storage.updateJob(j.id, { lat: coords.lat, lng: coords.lng });
            j.lat = coords.lat;
            j.lng = coords.lng;
          }
        });
      if (geocodePromises.length) await Promise.allSettled(geocodePromises);

      const jobsWithCoords = mapJobs.filter(j => j.lat && j.lng && j.zip);

      const byZipCat: Record<string, {
        zip: string;
        category: string;
        lats: number[];
        lngs: number[];
        jobs: any[];
        urgentCount: number;
      }> = {};

      for (const j of jobsWithCoords) {
        const key = `${j.zip!}::${j.category}`;
        if (!byZipCat[key]) {
          byZipCat[key] = { zip: j.zip!, category: j.category, lats: [], lngs: [], jobs: [], urgentCount: 0 };
        }
        byZipCat[key].lats.push(j.lat!);
        byZipCat[key].lngs.push(j.lng!);
        if (j.urgentSwitch) byZipCat[key].urgentCount++;
        byZipCat[key].jobs.push({
          id: j.id,
          title: j.title,
          category: j.category,
          serviceType: j.serviceType,
          budget: j.budget,
          urgentSwitch: j.urgentSwitch,
          locationApprox: j.locationApprox || `${j.zip} area`,
          color: CATEGORY_COLORS[j.category] || "#6B7280",
        });
      }

      const result = Object.values(byZipCat).map(group => {
        const avgLat = group.lats.reduce((a, b) => a + b, 0) / group.lats.length;
        const avgLng = group.lngs.reduce((a, b) => a + b, 0) / group.lngs.length;

        const lat = avgLat + (Math.random() - 0.5) * 0.01;
        const lng = avgLng + (Math.random() - 0.5) * 0.01;

        return {
          zip: group.zip,
          lat,
          lng,
          total: group.jobs.length,
          urgentCount: group.urgentCount,
          dominantCategory: group.category,
          dominantColor: CATEGORY_COLORS[group.category] || "#6B7280",
          categoryBreakdown: { [group.category]: group.jobs.length },
          jobs: group.jobs,
        };
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/workers/map", requireAuth, async (req: Request, res: Response) => {
    try {
      const currentUserId = req.session.userId!;
      const workers = await storage.getClockedInWorkers();

      // Geocode workers who have a zipcode but no lat/lng
      const geocodePromises = workers
        .filter(w => (!w.lat || !w.lng) && w.zipcode)
        .map(async w => {
          const coords = await geocodeAddress(`${w.zipcode}, USA`);
          if (coords) {
            await storage.updateUser(w.id, { lat: coords.lat, lng: coords.lng });
            w.lat = coords.lat;
            w.lng = coords.lng;
          }
        });
      if (geocodePromises.length) await Promise.allSettled(geocodePromises);

      const demoIds = await getDemoUserIds();
      const callerIsDemoUser = demoIds.has(currentUserId);

      const pins = workers
        .filter(w => w.lat && w.lng && w.id !== currentUserId && (w as any).role !== "admin")
        .filter(w => callerIsDemoUser || !demoIds.has(w.id))
        .map(w => ({
          id: w.id,
          publicUsername: (w as any).publicUsername || null,
          guberId: (w as any).guberId || null,
          displayName: (w as any).publicUsername ? `@${(w as any).publicUsername}` : ((w as any).guberId || "GUBER Member"),
          tier: w.tier,
          avatar: w.profilePhoto,
          lat: fuzzCoordinate(w.lat, w.id),
          lng: fuzzCoordinate(w.lng, w.id + 1000000),
          bio: filterContactInfo(w.userBio || "").clean,
          skills: filterContactInfo(w.skills || "").clean,
          rating: w.rating,
          reviewCount: w.reviewCount,
          color: "#EC4899",
        }));
      res.json(pins);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/users/location", requireAuth, async (req: Request, res: Response) => {
    try {
      const { lat, lng } = req.body;
      if (typeof lat !== "number" || typeof lng !== "number") {
        return res.status(400).json({ message: "Invalid coordinates" });
      }
      await storage.updateUser(req.session.userId!, { lat, lng });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── MAIN STRIPE WEBHOOK (main account: Day-1 OG, Trust Box, marketplace) ──
  app.post("/api/webhooks/stripe", async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("[GUBER][webhook/main] STRIPE_WEBHOOK_SECRET is not configured — rejecting request");
      return res.status(400).json({ message: "Webhook not configured" });
    }
    if (!sig) {
      console.error("[GUBER][webhook/main] Missing stripe-signature header — rejecting request");
      return res.status(400).json({ message: "Missing stripe-signature" });
    }

    let event: Stripe.Event;

    try {
      event = stripeMain.webhooks.constructEvent(req.body as Buffer, sig as string, webhookSecret);
    } catch (err: any) {
      console.error("[GUBER][webhook/main] Signature verification failed:", err.message);
      return res.status(400).json({ message: "Webhook signature verification failed" });
    }

    console.log(`[GUBER][webhook/main] Received event: ${event.type} (id: ${event.id})`);

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata;

        if (metadata?.type === "day1og") {
          let ogUser: Awaited<ReturnType<typeof storage.getUser>> | undefined;

          if (metadata?.userId) {
            ogUser = await storage.getUser(parseInt(metadata.userId)) ?? undefined;
          }

          if (!ogUser) {
            const emailToCheck = metadata?.userEmail || (session as any).customer_email || null;
            if (emailToCheck) {
              const allUsers = await storage.getAllUsers();
              ogUser = allUsers.find((u) => u.email?.toLowerCase() === emailToCheck.toLowerCase()) ?? undefined;
            }
          }

          if (!ogUser) {
            const fallbackEmail = metadata?.userEmail || (session as any).customer_email;
            if (fallbackEmail) {
              await db.execute(sql`INSERT INTO og_preapproved_emails (email) VALUES (${fallbackEmail.toLowerCase()}) ON CONFLICT DO NOTHING`);
              console.log(`[GUBER][webhook/main] day1og: OG pre-approved email saved for future signup: ${fallbackEmail}`);
            }
          }

          if (ogUser && !ogUser.day1OG) {
            await storage.updateUser(ogUser.id, {
              day1OG: true,
              aiOrNotCredits: (ogUser.aiOrNotCredits || 0) + 5,
              aiOrNotUnlimitedText: true,
              trustScore: adjustTrustScore(ogUser.trustScore ?? 50, TRUST_ADJUSTMENTS.OG_STARTING_BONUS),
            });
            await storage.createAuditLog({
              userId: ogUser.id,
              action: "day1og_activated",
              details: `Day-1 OG activated via Stripe main account. Email: ${ogUser.email}. Session: ${session.id}`,
            });
            await storage.createNotification({
              userId: ogUser.id,
              title: "Day-1 OG Activated!",
              body: "You are now a Day-1 OG! Perks: free urgent toggle, 15% service fee, 5 AI or Not credits, unlimited text verification.",
              type: "system",
            });
            console.log(`[GUBER][webhook/main] day1og: user ${ogUser.id} (${ogUser.email}) updated → day1OG=true`);
            if (ogUser.email) {
              try {
                const { Resend } = await import("resend");
                const resend = new Resend(process.env.RESEND_API_KEY);
                const fromDomain = process.env.RESEND_FROM_DOMAIN || "guberapp.app";
                await resend.emails.send({
                  from: `GUBER <noreply@${fromDomain}>`,
                  to: ogUser.email,
                  subject: "You're officially a GUBER Day-1 OG 🔥",
                  html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#000;color:#fff;border-radius:16px;">
  <h1 style="font-size:22px;font-weight:900;letter-spacing:-0.5px;margin-bottom:8px;">Welcome to the OG circle, ${ogUser.fullName?.split(" ")[0] || "friend"}.</h1>
  <p style="color:#aaa;font-size:14px;margin-bottom:24px;">Your Day-1 OG status is now active on GUBER.</p>
  <div style="background:#111;border-radius:12px;padding:20px;margin-bottom:24px;">
    <p style="font-size:13px;color:#22c55e;font-weight:700;margin:0 0 12px;">YOUR PERKS</p>
    <ul style="font-size:13px;color:#eee;padding-left:16px;margin:0;line-height:2;">
      <li>15% platform fee on every job (vs 20% standard)</li>
      <li>Free urgent toggle on every post, forever</li>
      <li>5 AI or Not credits to start</li>
      <li>Unlimited text verification</li>
    </ul>
  </div>
  <a href="https://guberapp.app/dashboard" style="display:inline-block;background:#22c55e;color:#000;font-weight:800;font-size:13px;letter-spacing:0.1em;text-transform:uppercase;text-decoration:none;padding:14px 28px;border-radius:10px;">Open GUBER</a>
  <p style="font-size:11px;color:#555;margin-top:24px;">This is a no-reply message. Questions? Visit guberapp.app.</p>
</div>`,
                });
              } catch (emailErr: any) {
                console.error("[GUBER][webhook/main] OG activation email failed:", emailErr.message);
              }
            }
          } else if (ogUser?.day1OG) {
            console.log(`[GUBER][webhook/main] day1og: user ${ogUser.id} already has day1OG — skipped`);
          }

        } else if (metadata?.type === "trust_box" && metadata?.userId) {
          const userId = parseInt(metadata.userId);
          const tbUser = await storage.getUser(userId);
          if (tbUser) {
            const subscriptionId = session.subscription as string | undefined;
            const alreadyActive = tbUser.trustBoxPurchased;
            await storage.updateUser(userId, {
              trustBoxPurchased: true,
              aiOrNotCredits: (tbUser.aiOrNotCredits || 0) + 5,
              aiOrNotUnlimitedText: true,
              ...(subscriptionId ? { trustBoxSubscriptionId: subscriptionId } : {}),
            });
            await storage.createAuditLog({
              userId,
              action: "trust_box_purchased",
              details: `Trust Box subscription activated via main account checkout. Email: ${tbUser.email}. Sub: ${subscriptionId || "n/a"}. Session: ${session.id}`,
            });
            if (!alreadyActive) {
              await storage.createNotification({
                userId,
                title: "Trust Box Active!",
                body: "Your AI or Not premium subscription is live. Unlimited detections, text analysis, and more — $4.99/month.",
                type: "system",
              });
            }
            console.log(`[GUBER][webhook/main] trust_box: user ${userId} updated → trustBoxPurchased=true, sub=${subscriptionId || "n/a"}`);
          }

        } else if (metadata?.type === "marketplace_boost" && metadata?.itemId) {
          const itemId = parseInt(metadata.itemId);
          const boostedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          await storage.updateMarketplaceItem(itemId, { boosted: true, boostedUntil });
          await storage.createNotification({
            userId: parseInt(metadata.userId),
            title: "Listing Boosted!",
            body: "Your listing is now featured at the top of the Marketplace for 7 days.",
            type: "system",
          });
          console.log(`[GUBER][webhook/main] marketplace_boost: item ${itemId} boosted until ${boostedUntil.toISOString()}`);

        } else if (metadata?.type === "business_verification" && metadata?.businessAccountId) {
          const bizId = parseInt(metadata.businessAccountId);
          const bizAcct = await storage.getBusinessAccountById(bizId);
          if (bizAcct) {
            await storage.updateBusinessAccount(bizId, {
              verificationFeePaid: true,
              status: bizAcct.status === "pending_business" ? "approved_limited" : bizAcct.status,
            });
            await storage.createBillingEvent({
              businessAccountId: bizId,
              stripeEventId: event.id,
              eventType: "verification_fee_paid",
              rawReference: session.id,
            });
            await notify(bizAcct.ownerUserId, {
              title: "Verification Fee Received",
              body: "Your $49 business verification fee has been processed. You can now submit your EIN to complete verification.",
              type: "system",
            });
            console.log(`[GUBER][webhook/main] business_verification: biz ${bizId} fee paid`);
          }

        } else if (metadata?.type === "business_scout_plan" && metadata?.businessAccountId) {
          const bizId = parseInt(metadata.businessAccountId);
          const bizAcct = await storage.getBusinessAccountById(bizId);
          if (bizAcct) {
            const subscriptionId = session.subscription as string | undefined;
            if (subscriptionId) {
              await storage.updateBusinessAccount(bizId, { stripeSubscriptionId: subscriptionId });
            }
            const renewsAt = new Date();
            renewsAt.setMonth(renewsAt.getMonth() + 1);
            await storage.createBusinessPlan({
              businessAccountId: bizId,
              planType: "scout",
              status: "active",
              includedUnlocksPerMonth: 20,
              currentUnlockBalance: 20,
              renewsAt,
            });
            await storage.createBillingEvent({
              businessAccountId: bizId,
              stripeEventId: event.id,
              eventType: "scout_plan_activated",
              rawReference: session.id,
            });
            await notify(bizAcct.ownerUserId, {
              title: "Scout Plan Active",
              body: "Your $99/month Business Scout Plan is now active. You have 20 profile unlocks this month.",
              type: "system",
            });
            console.log(`[GUBER][webhook/main] business_scout_plan: biz ${bizId} plan activated`);
          }

        } else if (metadata?.type === "business_extra_unlocks" && metadata?.businessAccountId) {
          const bizId = parseInt(metadata.businessAccountId);
          const qty = parseInt(metadata.quantity || "1");
          const plan = await storage.getBusinessPlan(bizId);
          if (plan) {
            await storage.updateBusinessPlan(plan.id, { currentUnlockBalance: plan.currentUnlockBalance + qty });
          }
          await storage.createBillingEvent({
            businessAccountId: bizId,
            stripeEventId: event.id,
            eventType: "extra_unlocks_purchased",
            rawReference: `${qty} unlocks`,
          });
          console.log(`[GUBER][webhook/main] business_extra_unlocks: biz ${bizId} +${qty} unlocks`);

        } else if (metadata?.type === "sponsor_drop") {
          if (session.payment_status !== "paid") {
            console.log(`[GUBER][webhook/main] sponsor_drop: session ${session.id} payment_status=${session.payment_status} — skipping (not paid)`);
            return res.json({ received: true });
          }

          const existingSponsors = await storage.getDropSponsors();
          const alreadyProcessed = existingSponsors.find((s: any) => s.stripeCheckoutSessionId === session.id);
          if (alreadyProcessed) {
            console.log(`[GUBER][webhook/main] sponsor_drop: session ${session.id} already processed as sponsor #${alreadyProcessed.id} — skipping duplicate`);
            return res.json({ received: true });
          }

          const m = metadata;
          const sponsorAmount = parseFloat(m.sponsor_amount || "0");
          const platformAmt = parseFloat(m.platform_amount || "0");
          const dropPoolAmt = parseFloat(m.drop_pool_amount || "0");
          const winnerCount = parseInt(m.winner_count || "1") || 1;
          const prizePerWinner = parseFloat(m.prize_per_winner || "0");

          const sponsor = await storage.createDropSponsor({
            businessProfileId: m.business_profile_id ? parseInt(m.business_profile_id) : null,
            businessId: m.user_id ? parseInt(m.user_id) : null,
            companyName: m.company_name || "Unknown",
            logoUrl: m.logo_url || null,
            contactEmail: m.contact_email || "",
            contactName: m.contact_name || null,
            contactPhone: m.contact_phone || null,
            businessAddress: m.business_address || null,
            websiteUrl: m.website_url || null,
            requestedDropDate: m.requested_drop_date || null,
            targetZipCode: m.target_zip_code || null,
            targetCityState: m.target_city_state || null,
            proposedBudget: m.proposed_budget ? parseFloat(m.proposed_budget) : null,
            cashContribution: sponsorAmount,
            sponsorMessage: m.sponsor_message || null,
            sponsorshipType: m.sponsorship_type || "cash",
            promotionGoal: m.promotion_goal || null,
            preferredTime: m.preferred_time || null,
            finalLocationRequested: m.final_location_requested === "true",
            brandingEnabled: m.branding_enabled === "true",
            rewardType: m.reward_type || "cash",
            rewardDescription: m.reward_description || null,
            rewardQuantity: m.reward_quantity ? parseInt(m.reward_quantity) : null,
            noPurchaseRequiredText: m.no_purchase_required_text || null,
            disclaimerText: m.disclaimer_text || null,
            finalLocationMode: m.final_location_mode || "name_only",
            redemptionType: m.redemption_type || "visit_store",
            redemptionInstructions: m.redemption_instructions || null,
            paymentStatus: "paid",
            status: "pending",
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: (session.payment_intent as string) || null,
            platformAmount: platformAmt,
            dropPoolAmount: dropPoolAmt,
            numberOfWinners: winnerCount,
            estimatedPrizePerWinner: prizePerWinner,
            paidAt: new Date(),
          });

          const allUsers = await storage.getAllUsers();
          const admins = allUsers.filter((u: any) => u.role === "admin");
          for (const admin of admins) {
            await storage.createNotification({
              userId: admin.id,
              title: "New Paid Sponsor Drop Request",
              body: `${m.company_name} paid $${sponsorAmount} for a sponsored drop. Review in Admin → Sponsors.`,
              type: "sponsor_request",
            });
          }

          console.log(`[GUBER][webhook/main] sponsor_drop: created sponsor #${sponsor.id} for ${m.company_name} ($${sponsorAmount}, platform: $${platformAmt}, pool: $${dropPoolAmt})`);

        } else {
          console.log(`[GUBER][webhook/main] checkout.session.completed: unhandled session type "${metadata?.type || "none"}" — ignored`);
        }

      } else if (event.type === "customer.subscription.created") {
        const sub = event.data.object as Stripe.Subscription;
        const subMeta = sub.metadata;
        if (subMeta?.type === "trust_box" && subMeta?.userId) {
          const userId = parseInt(subMeta.userId);
          const isActive = sub.status === "active" || sub.status === "trialing";
          if (isActive) {
            const subUser = await storage.getUser(userId);
            await storage.updateUser(userId, {
              trustBoxPurchased: true,
              trustBoxSubscriptionId: sub.id,
              aiOrNotCredits: (subUser?.aiOrNotCredits || 0) + 5,
              aiOrNotUnlimitedText: true,
            });
            await storage.createAuditLog({
              userId,
              action: "trust_box_purchased",
              details: `Trust Box subscription created. Sub: ${sub.id}. Status: ${sub.status}`,
            });
            console.log(`[GUBER][webhook/main] subscription.created: user ${userId} → trustBoxPurchased=true, sub=${sub.id}`);
          }
        } else {
          console.log(`[GUBER][webhook/main] subscription.created: unhandled type "${subMeta?.type || "none"}" — ignored`);
        }

      } else if (event.type === "customer.subscription.updated") {
        const sub = event.data.object as Stripe.Subscription;
        const subMeta = sub.metadata;
        if (subMeta?.type === "trust_box" && subMeta?.userId) {
          const userId = parseInt(subMeta.userId);
          const isActive = sub.status === "active" || sub.status === "trialing";
          await storage.updateUser(userId, {
            trustBoxPurchased: isActive,
            trustBoxSubscriptionId: isActive ? sub.id : null,
          });
          console.log(`[GUBER][webhook/main] subscription.updated: user ${userId} → trustBoxPurchased=${isActive}, status=${sub.status}`);
        } else {
          console.log(`[GUBER][webhook/main] subscription.updated: unhandled type "${subMeta?.type || "none"}" — ignored`);
        }

      } else if (event.type === "customer.subscription.deleted") {
        const sub = event.data.object as Stripe.Subscription;
        const subMeta = sub.metadata;
        if (subMeta?.type === "trust_box" && subMeta?.userId) {
          const userId = parseInt(subMeta.userId);
          await storage.updateUser(userId, { trustBoxPurchased: false, trustBoxSubscriptionId: null });
          await storage.createAuditLog({
            userId,
            action: "trust_box_cancelled",
            details: `Trust Box subscription cancelled/expired. Sub: ${sub.id}`,
          });
          await storage.createNotification({
            userId,
            title: "Trust Box Ended",
            body: "Your Trust Box subscription has ended. Resubscribe to restore AI or Not premium access.",
            type: "system",
          });
          console.log(`[GUBER][webhook/main] subscription.deleted: user ${userId} → trustBoxPurchased=false`);
        } else {
          console.log(`[GUBER][webhook/main] subscription.deleted: unhandled type "${subMeta?.type || "none"}" — ignored`);
        }

      } else if (event.type === "invoice.paid") {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : (invoice.subscription as any)?.id;
        if (subscriptionId) {
          try {
            const sub = await stripeMain.subscriptions.retrieve(subscriptionId);
            const subMeta = sub.metadata;
            if (subMeta?.type === "trust_box" && subMeta?.userId) {
              const userId = parseInt(subMeta.userId);
              await storage.updateUser(userId, { trustBoxPurchased: true, trustBoxSubscriptionId: sub.id });
              await storage.createAuditLog({
                userId,
                action: "trust_box_renewed",
                details: `Trust Box subscription renewed. Invoice: ${invoice.id}. Sub: ${sub.id}`,
              });
              console.log(`[GUBER][webhook/main] invoice.paid: user ${userId} Trust Box renewed — invoice ${invoice.id}`);
            } else {
              console.log(`[GUBER][webhook/main] invoice.paid: sub ${subscriptionId} is not a trust_box — ignored`);
            }
          } catch (subErr: any) {
            console.error(`[GUBER][webhook/main] invoice.paid: failed to retrieve sub ${subscriptionId}:`, subErr.message);
          }
        } else {
          console.log(`[GUBER][webhook/main] invoice.paid: no subscription on invoice ${invoice.id} — ignored`);
        }

      } else {
        console.log(`[GUBER][webhook/main] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err: any) {
      console.error("[GUBER][webhook/main] Processing error:", err);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  // ── CONNECT STRIPE WEBHOOK (Connect account: job payments, payouts, onboarding) ──
  app.post("/api/webhooks/stripe-connect", async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("[GUBER][webhook/connect] STRIPE_CONNECT_WEBHOOK_SECRET is not configured — rejecting request");
      return res.status(400).json({ message: "Webhook not configured" });
    }
    if (!sig) {
      console.error("[GUBER][webhook/connect] Missing stripe-signature header — rejecting request");
      return res.status(400).json({ message: "Missing stripe-signature" });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig as string, webhookSecret);
    } catch (err: any) {
      console.error("[GUBER][webhook/connect] Signature verification failed:", err.message);
      return res.status(400).json({ message: "Webhook signature verification failed" });
    }

    console.log(`[GUBER][webhook/connect] Received event: ${event.type} (id: ${event.id})`);

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata;
        const paymentIntentId = session.payment_intent as string;

        if (metadata?.type === "cash_drop_payout" && metadata?.cashDropId) {
          // Cash Drops use manual off-platform payout (Cash App, Venmo, PayPal, ACH, GUBER Credit)
          // Stripe Connect is NOT used for Cash Drop payouts — admin processes them manually via mark-paid endpoint.
          console.log(`[GUBER][webhook/connect] cash_drop_payout: ignored — Cash Drops use manual admin payout flow. attemptId=${metadata.attemptId || "n/a"}`);

        } else if (metadata?.type === "job_lock" && (metadata?.guber_job_id || metadata?.jobId)) {
          const jobId = parseInt(metadata.guber_job_id || metadata.jobId);
          const job = await storage.getJob(jobId);
          if (job && job.status === "accepted_pending_payment") {
            // With manual capture: authorization hold only — no poster service fee; budget + urgentFee authorized
            const authorizedAmount = (job.budget ?? 0) + (job.urgentFee || 0);

            let webhookChargeId: string | null = null;
            if (paymentIntentId) {
              try {
                const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
                webhookChargeId = (pi.latest_charge as string) || null;
              } catch (e) { console.error("[GUBER][webhook/connect] Failed to get charge ID:", e); }
            }

            // isPaid = true signals job is authorized (visible/locked); chargedAt set only after capture
            await storage.updateJob(jobId, {
              status: "funded",
              lockedAt: new Date(),
              isPaid: true,
              stripePaymentIntentId: paymentIntentId,
              stripeChargeId: webhookChargeId,
            } as any);
            // Wallet tx is "pending" — funds are held by Stripe, not yet settled
            await storage.createWalletTransaction({
              userId: job.postedById,
              jobId: job.id,
              type: "payment",
              amount: authorizedAmount,
              status: "pending",
              description: `Payment authorized (held by Stripe) for "${job.title}" — $${authorizedAmount.toFixed(2)}`,
            });
            if (job.assignedHelperId) {
              await notify(job.assignedHelperId, {
                title: "Job Locked! 💰",
                body: `Payment confirmed! You're locked in for "${job.title}". Address and details are now available.`,
                type: "job",
                jobId: job.id,
              });
            }
            await notify(job.postedById, {
              title: "Payment Confirmed ✅",
              body: `Your job "${job.title}" is now locked. Your helper has been notified.`,
              type: "job",
              jobId: job.id,
            });
            console.log(`[GUBER][webhook/connect] job_lock: job ${jobId} updated → funded, chargeId=${webhookChargeId || "n/a"}`);
          } else {
            console.log(`[GUBER][webhook/connect] job_lock: job ${metadata.jobId} skipped (status=${job?.status || "not found"})`);
          }

        } else if (metadata?.type === "direct_offer_payment" && metadata?.offerId) {
          const offerId = parseInt(metadata.offerId);
          const offer = await storage.getDirectOffer(offerId);
          if (offer && (offer.status === "agreed_payment_pending" || offer.status === "payment_pending" || offer.status === "funded")) {
            if (!offer.fundedAt) {
              const feeConfig = await getActiveFeeConfig();
              const offerAmount = offer.currentOfferAmount;
              const workerShare = Math.round(offerAmount * (1 - feeConfig.platformFeeRate) * 100) / 100;
              const platformFee = Math.round(offerAmount * feeConfig.platformFeeRate * 100) / 100;
              const { gross: grossCharge, stripeFee } = grossUpForStripe(offerAmount);

              let webhookChargeId: string | null = null;
              if (paymentIntentId) {
                try {
                  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
                  webhookChargeId = (pi.latest_charge as string) || null;
                } catch (e) { console.error("[GUBER][webhook/connect] Failed to get offer charge ID:", e); }
              }

              const now = new Date();
              await storage.updateDirectOffer(offerId, {
                status: "funded",
                paidAt: now,
                fundedAt: now,
                stripePaymentIntentId: paymentIntentId,
              });

              const payment = await storage.createGuberPayment({
                offerId,
                jobId: offer.jobId || null,
                payerUserId: offer.hirerUserId,
                payeeUserId: offer.workerUserId,
                grossAmount: grossCharge,
                platformFeeAmount: platformFee,
                stripeFeeEstimate: stripeFee,
                netToWorker: workerShare,
                currency: "usd",
                stripePaymentIntentId: paymentIntentId,
                stripeChargeId: webhookChargeId,
                stripeCheckoutSessionId: session.id,
                paymentStatus: "funded",
                fundedAt: now,
              });

              await storage.createMoneyLedgerEntry({
                paymentId: payment.id,
                jobId: offer.jobId || null,
                userIdOwner: offer.hirerUserId,
                userIdCounterparty: offer.workerUserId,
                ledgerType: "offer_funded",
                amount: -grossCharge,
                currency: "usd",
                sourceSystem: "stripe",
                sourceReferenceId: paymentIntentId,
                stripeObjectType: "payment_intent",
                stripeObjectId: paymentIntentId,
                description: `[webhook] Hirer funded direct offer #${offerId}: $${grossCharge.toFixed(2)} charged`,
                metadataJson: { offerId, offerAmount, grossCharge, workerShare, platformFee, stripeFee, flowType: "direct_offer" },
                eventTime: now,
              });

              await storage.createMoneyLedgerEntry({
                paymentId: payment.id,
                jobId: offer.jobId || null,
                userIdOwner: offer.workerUserId,
                userIdCounterparty: offer.hirerUserId,
                ledgerType: "offer_earned",
                amount: workerShare,
                currency: "usd",
                sourceSystem: "stripe",
                sourceReferenceId: paymentIntentId,
                stripeObjectType: "payment_intent",
                stripeObjectId: paymentIntentId,
                description: `[webhook] Worker earned $${workerShare.toFixed(2)} from direct offer #${offerId}`,
                metadataJson: { offerId, offerAmount, workerShare, flowType: "direct_offer" },
                eventTime: now,
              });

              await notify(offer.workerUserId, {
                title: "Offer Funded!",
                body: `Payment of $${offerAmount.toFixed(2)} confirmed. Full job details are now unlocked.`,
                type: "offer_funded",
                jobId: null,
              });
              await notify(offer.hirerUserId, {
                title: "Payment Confirmed",
                body: `$${grossCharge.toFixed(2)} charged. Worker details unlocked. Job is now active.`,
                type: "offer_funded",
                jobId: null,
              });
              console.log(`[GUBER][webhook/connect] direct_offer_payment: offer ${offerId} → funded, payment #${payment.id}`);
            } else {
              console.log(`[GUBER][webhook/connect] direct_offer_payment: offer ${offerId} already funded — skipped`);
            }
          } else {
            console.log(`[GUBER][webhook/connect] direct_offer_payment: offer ${metadata.offerId} skipped (status=${offer?.status || "not found"})`);
          }

        } else if (metadata?.jobId) {
          const jobId = parseInt(metadata.jobId);
          const job = await storage.getJob(jobId);
          if (job && job.status === "draft" && !job.isPaid) {
            await storage.updateJob(jobId, {
              status: "posted_public",
              isPaid: true,
              isPublished: true,
              stripePaymentIntentId: paymentIntentId,
            });
            await notify(job.postedById, {
              title: "Job Posted! 🎉",
              body: `Your job "${job.title}" is now live and visible to helpers.`,
              type: "job",
              jobId: job.id,
            });
            notifyNearbyAvailableWorkers(job).catch(() => {});
            console.log(`[GUBER][webhook/connect] job_post: job ${jobId} updated → posted_public`);
          }
        } else {
          console.log(`[GUBER][webhook/connect] checkout.session.completed: unhandled type "${metadata?.type || "none"}" — ignored`);
        }

      } else if (event.type === "payment_intent.payment_failed") {
        const intent = event.data.object as Stripe.PaymentIntent;
        const metadata = intent.metadata;
        if (metadata?.flowType === "direct_offer" && metadata?.offerId) {
          const offerId = parseInt(metadata.offerId);
          const hirerId = parseInt(metadata.hirerUserId || "0");
          const workerId = parseInt(metadata.workerUserId || "0");
          await storage.createAuditLog({
            userId: hirerId,
            action: "offer_payment_failed",
            details: `Direct offer #${offerId} payment failed. Intent: ${intent.id}. Reason: ${intent.last_payment_error?.message || "unknown"}`,
          });
          await storage.createNotification({
            userId: hirerId,
            title: "Payment Failed",
            body: `Your payment for the direct offer could not be processed. Please try again before the offer expires.`,
            type: "offer_payment_failed",
            jobId: null,
          });
          if (workerId) {
            await storage.createNotification({
              userId: workerId,
              title: "Payment Pending",
              body: `The hirer's payment attempt failed. The offer remains active — waiting for payment to complete.`,
              type: "offer_payment_pending",
              jobId: null,
            });
          }
          console.log(`[GUBER][webhook/connect] payment_failed: direct offer #${offerId}, hirer=${hirerId}, intent ${intent.id}`);
        } else if (metadata?.userId) {
          const userId = parseInt(metadata.userId);
          await storage.createAuditLog({
            userId,
            action: "payment_failed",
            details: `Payment failed. Intent: ${intent.id}. Reason: ${intent.last_payment_error?.message || "unknown"}`,
          });
          await storage.createNotification({
            userId,
            title: "Payment Failed",
            body: "Your payment could not be processed. Please check your payment method and try again.",
            type: "system",
          });
          if (metadata?.jobId) {
            await storage.createAuditLog({
              userId,
              action: "job_payment_failed",
              details: `Job ${metadata.jobId} payment failed — job remains in draft.`,
            });
          }
          console.log(`[GUBER][webhook/connect] payment_failed: user ${userId}, intent ${intent.id}`);
        }

      } else if (event.type === "account.updated") {
        const account = event.data.object as Stripe.Account;
        const chargesEnabled = account.charges_enabled;
        const payoutsEnabled = account.payouts_enabled;
        const detailsSubmitted = account.details_submitted;
        const newStatus = (chargesEnabled && payoutsEnabled && detailsSubmitted) ? "active" : "pending";

        const allUsers = await storage.getAllUsers();
        const matchedUser = allUsers.find((u: any) => u.stripeAccountId === account.id);
        if (matchedUser) {
          const wasActive = (matchedUser as any).stripeAccountStatus === "active";
          await storage.updateUser(matchedUser.id, { stripeAccountStatus: newStatus } as any);
          console.log(`[GUBER][webhook/connect] account.updated: user ${matchedUser.id} → stripeAccountStatus=${newStatus}`);
          if (newStatus === "active" && !wasActive) {
            // Only send the one-time welcome notification if not already sent (dedup by type tag)
            const existingNotifs = await storage.getNotificationsByUser(matchedUser.id);
            const alreadySentWelcome = existingNotifs.some((n: any) => n.type === "stripe_account_active_welcome");
            if (!alreadySentWelcome) {
              const welcomeBody = "Payout account ready! Your first payout may take 2–7 days to reach your bank — this is normal for new accounts and is handled entirely by Stripe. After that, payouts typically arrive faster.";
              await notify(matchedUser.id, {
                title: "Payout Account Ready! 🏦",
                body: welcomeBody,
                type: "stripe_account_active_welcome",
              }, "/wallet");
              // Send welcome email with bank delay info
              try {
                const { Resend } = await import("resend");
                const resend = new Resend(process.env.RESEND_API_KEY);
                if ((matchedUser as any).email) {
                  await resend.emails.send({
                    from: "GUBER <no-reply@guberapp.app>",
                    to: (matchedUser as any).email,
                    subject: "Your GUBER payout account is active!",
                    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
                      <h2 style="color:#22C55E">Payout account ready!</h2>
                      <p>Hi ${(matchedUser as any).firstName || "there"},</p>
                      <p>${welcomeBody}</p>
                      <p>If you have any questions, reach us at <a href="mailto:support@guberapp.com">support@guberapp.com</a>.</p>
                      <p style="color:#888;font-size:12px">GUBER GLOBAL LLC · Greensboro, NC · <a href="https://guberapp.app">guberapp.app</a></p>
                    </div>`,
                  });
                }
              } catch (emailErr: any) {
                console.error("[GUBER][webhook] payout welcome email failed:", emailErr.message);
              }
            }
            await creditReferrer(matchedUser.id);
            const { retried } = await retryPendingPayoutsForUser(matchedUser.id, account.id);
            if (retried > 0) {
              await notify(matchedUser.id, {
                title: "Pending Earnings Released! 💸",
                body: `${retried} pending payout${retried > 1 ? "s have" : " has"} been released to your payout account. Allow 2–7 business days for your first deposit.`,
                type: "system",
              }, "/wallet");
            }
          }
        } else {
          console.log(`[GUBER][webhook/connect] account.updated: no GUBER user found for Stripe account ${account.id}`);
        }

      } else {
        console.log(`[GUBER][webhook/connect] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err: any) {
      console.error("[GUBER][webhook/connect] Processing error:", err);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  // ── Stripe Connect (helper payouts) ────────────────────────────────────
  app.post("/api/stripe/connect/onboard", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const forwardedHost = req.headers["x-forwarded-host"] as string | undefined;
      const host = forwardedHost || req.get("host") || "localhost:5000";
      const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() || req.protocol || "https";
      const appBase = process.env.APP_URL || `${proto}://${host}`;

      // Infer Stripe profile type from GUBER account data
      const bodyOverride = req.body?.stripeProfileType;
      const isValidOverride = bodyOverride === "individual" || bodyOverride === "company";

      const inferredType: "individual" | "company" =
        (user as any).accountType === "business" || (user as any).companyVerified === true
          ? "company"
          : "individual";

      const stripeProfileType: "individual" | "company" = isValidOverride ? bodyOverride : inferredType;

      let accountId = (user as any).stripeAccountId;

      if (!accountId) {
        const createParams: Stripe.AccountCreateParams = {
          type: "express",
          country: "US",
          email: user.email,
          capabilities: { transfers: { requested: true } },
          business_type: stripeProfileType,
          metadata: { userId: String(userId) },
          business_profile: {
            url: "https://guberapp.app",
            product_description: stripeProfileType === "individual"
              ? "Independent contractor providing local services through the GUBER platform"
              : "Business providing local services through the GUBER platform",
          },
        };

        if (stripeProfileType === "individual" && user.fullName) {
          const nameParts = user.fullName.trim().split(" ");
          const firstName = nameParts[0];
          const lastName = nameParts.slice(1).join(" ") || nameParts[0];
          (createParams as any).individual = {
            first_name: firstName,
            last_name: lastName,
            email: user.email,
          };
        }

        const account = await stripe.accounts.create(createParams);
        accountId = account.id;
        await storage.updateUser(userId, {
          stripeAccountId: accountId,
          stripeAccountStatus: "pending",
          stripeProfileType,
        } as any);
      } else {
        // Existing account — patch business_profile so website/product screens are pre-filled
        try {
          await stripe.accounts.update(accountId, {
            business_profile: {
              url: "https://guberapp.app",
              product_description: stripeProfileType === "individual"
                ? "Independent contractor providing local services through the GUBER platform"
                : "Business providing local services through the GUBER platform",
            },
          });
        } catch (_) {}
        if (!(user as any).stripeProfileType) {
          await storage.updateUser(userId, { stripeProfileType } as any);
        }
      }

      console.log(`[GUBER][stripe/onboard] userId=${userId} role=${(user as any).role || "user"} stripeProfileType=${stripeProfileType} accountId=${accountId}`);

      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${appBase}/profile?connect=refresh`,
        return_url: `${appBase}/profile?connect=success`,
        type: "account_onboarding",
        collection_options: { fields: "eventually_due" },
      });

      res.json({ url: link.url });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/stripe/connect/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });

      const accountId = (user as any).stripeAccountId;
      const accountStatus = (user as any).stripeAccountStatus || "none";

      if (accountId && accountStatus !== "active") {
        // Re-check live with Stripe in case webhook was missed
        try {
          const account = await stripe.accounts.retrieve(accountId);
          if (account.charges_enabled && account.payouts_enabled && account.details_submitted) {
            await storage.updateUser(user.id, { stripeAccountStatus: "active" } as any);
            await creditReferrer(user.id);
            return res.json({ status: "active", accountId });
          }
        } catch (_) {}
      }

      res.json({ status: accountStatus, accountId: accountId || null });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/wallet/payout-debug", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const accountId = (user as any).stripeAccountId;
      const accountStatus = (user as any).stripeAccountStatus;
      const txns = await storage.getWalletByUser(userId);
      const pending = txns.filter((t: any) => t.type === "earning" && t.status === "pending");
      let stripeAccount: any = null;
      let stripeError: string | null = null;
      if (accountId) {
        try {
          stripeAccount = await stripe.accounts.retrieve(accountId);
        } catch (e: any) {
          stripeError = e.message;
        }
      }
      res.json({
        hasStripeAccount: !!accountId,
        dbAccountStatus: accountStatus || "none",
        stripeChargesEnabled: stripeAccount?.charges_enabled ?? null,
        stripePayoutsEnabled: stripeAccount?.payouts_enabled ?? null,
        stripeDetailsSubmitted: stripeAccount?.details_submitted ?? null,
        stripeError,
        pendingTransactions: pending.length,
        pendingTotal: pending.reduce((s: number, t: any) => s + t.amount, 0),
        pendingList: pending.map((t: any) => ({ id: t.id, amount: t.amount, description: t.description, jobId: t.jobId })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wallet/claim-pending-payouts", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const accountId = (user as any).stripeAccountId;
      let accountStatus = (user as any).stripeAccountStatus;

      // Re-verify with Stripe live in case DB is stale
      if (accountId && accountStatus !== "active") {
        try {
          const acct = await stripe.accounts.retrieve(accountId);
          if (acct.charges_enabled && acct.payouts_enabled && acct.details_submitted) {
            accountStatus = "active";
            await storage.updateUser(userId, { stripeAccountStatus: "active" } as any);
          }
        } catch (_) {}
      }

      if (!accountId) {
        return res.status(400).json({ message: "No payout account found. Set one up in your Profile." });
      }
      if (accountStatus !== "active") {
        return res.status(400).json({ message: "Your payout account is still being verified by Stripe. This usually takes a few minutes." });
      }

      const { retried, failed, errors } = await retryPendingPayoutsForUser(userId, accountId);
      console.log(`[GUBER] claim-pending-payouts: userId=${userId} retried=${retried} failed=${failed} errors=${JSON.stringify(errors)}`);

      if (retried === 0 && failed === 0) {
        return res.json({ message: "No pending payouts found.", retried: 0, failed: 0 });
      }
      if (retried > 0) {
        await storage.createNotification({
          userId,
          title: "Earnings Claimed!",
          body: `${retried} payout${retried > 1 ? "s" : ""} ha${retried > 1 ? "ve" : "s"} been sent to your payout account.`,
          type: "system",
        });
      }
      res.json({ retried, failed, errors });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/stripe/connect/dashboard-link", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });

      const accountId = (user as any).stripeAccountId;
      if (!accountId) return res.status(400).json({ message: "No Connect account found" });

      const loginLink = await stripe.accounts.createLoginLink(accountId);
      res.json({ url: loginLink.url });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Referral System ──────────────────────────────────────────────────────
  app.get("/api/users/me/referral", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      let user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      let code = (user as any).referralCode as string | null;
      if (!code) {
        let newCode = generateReferralCode();
        while ((await db.execute(sql`SELECT 1 FROM users WHERE referral_code = ${newCode} LIMIT 1`)).rows.length) {
          newCode = generateReferralCode();
        }
        await storage.updateUser(userId, { referralCode: newCode } as any);
        code = newCode;
      }

      const appBase = process.env.APP_URL || "https://guberapp.app";
      const link = `${appBase}/join/${code}`;
      const count = (user as any).referralCount || 0;
      const feePct = (user as any).referralFeePct || 0;
      const progress = count % 10;
      const nextThreshold = (Math.floor(count / 10) + (progress > 0 ? 1 : 0)) * 10 || 10;
      const atMax = feePct >= 0.15;
      const rawExpiry = (user as any).referralDiscountExpiresAt;
      const expiresAt: string | null = rawExpiry ? new Date(rawExpiry).toISOString() : null;
      const discountActive = feePct > 0 && expiresAt !== null && new Date(expiresAt) > new Date();
      const msLeft = discountActive && expiresAt ? new Date(expiresAt).getTime() - Date.now() : 0;
      const daysRemaining = discountActive ? Math.ceil(msLeft / (1000 * 60 * 60 * 24)) : null;

      res.json({ code, link, count, feePct, progress, nextThreshold, atMax, expiresAt, discountActive, daysRemaining });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/verifications", requireAdmin, async (req, res) => {
    try {
      const statusFilter = (req.query.status as string) || "pending";
      let statusCondition = sql`AND COALESCE(audit_logs.review_status, 'pending') = 'pending'`;
      if (statusFilter === "approved") statusCondition = sql`AND audit_logs.review_status = 'approved'`;
      else if (statusFilter === "rejected") statusCondition = sql`AND audit_logs.review_status = 'rejected'`;
      else if (statusFilter === "all") statusCondition = sql``;

      const logs = await db.select({
        id: auditLogsTable.id,
        userId: auditLogsTable.userId,
        action: auditLogsTable.action,
        details: auditLogsTable.details,
        createdAt: auditLogsTable.createdAt,
        reviewStatus: auditLogsTable.reviewStatus,
        reviewedAt: auditLogsTable.reviewedAt,
        username: usersTable.username,
        email: usersTable.email,
        tier: usersTable.tier,
        fullName: usersTable.fullName,
        trustScore: usersTable.trustScore,
        userBio: usersTable.userBio,
        zipcode: usersTable.zipcode,
        profilePhoto: usersTable.profilePhoto,
        idVerified: usersTable.idVerified,
        selfieVerified: usersTable.selfieVerified,
        credentialVerified: usersTable.credentialVerified,
        day1OG: usersTable.day1OG,
        userCreatedAt: usersTable.createdAt,
      })
      .from(auditLogsTable)
      .leftJoin(usersTable, sqlEq(auditLogsTable.userId, usersTable.id))
      .where(sql`(audit_logs.action = 'credential_upload' OR audit_logs.action = 'id_upload' OR audit_logs.action LIKE 'verification_submitted_%') ${statusCondition}`)
      .orderBy(sqlDesc(auditLogsTable.createdAt));

      const submissionCounts = await db.execute(sql`
        SELECT user_id, COUNT(*) as count
        FROM audit_logs
        WHERE action IN ('credential_upload','id_upload') OR action LIKE 'verification_submitted_%'
        GROUP BY user_id
      `);
      const countMap: Record<number, number> = {};
      for (const row of submissionCounts.rows as any[]) {
        countMap[row.user_id] = parseInt(row.count);
      }

      const verifications = logs.map(log => {
        let parsedDetails: any = {};
        try {
          if (log.details?.trim().startsWith("{")) {
            parsedDetails = JSON.parse(log.details);
          }
        } catch (e) {}
        return { ...log, parsedDetails, totalSubmissions: countMap[log.userId!] || 1 };
      });

      res.json(verifications);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/verifications/:logId/ai-check", requireAdmin, async (req, res) => {
    try {
      const logId = parseInt(req.params.logId);
      const [log] = await db.select().from(auditLogsTable).where(sqlEq(auditLogsTable.id, logId));
      if (!log || !log.userId) return res.status(404).json({ message: "Log not found" });

      const user = await storage.getUser(log.userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      let parsedDetails: any = {};
      try { parsedDetails = JSON.parse(log.details || "{}"); } catch (e) {}

      const flags: string[] = [];
      let riskScore = 0;

      // Account age check
      const accountAgeDays = user.createdAt
        ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000)
        : 0;
      if (accountAgeDays < 3) { flags.push("Account created less than 3 days ago"); riskScore += 30; }
      else if (accountAgeDays < 14) { flags.push("Account is less than 2 weeks old"); riskScore += 10; }

      // Multiple submission check
      const [{ count }] = await db.execute(sql`
        SELECT COUNT(*) as count FROM audit_logs
        WHERE user_id = ${log.userId}
        AND (action IN ('credential_upload','id_upload') OR action LIKE 'verification_submitted_%')
      `).then(r => r.rows as any[]);
      const submissions = parseInt(count || "1");
      if (submissions > 3) { flags.push(`${submissions} total verification submissions (resubmissions detected)`); riskScore += 20; }
      else if (submissions > 1) { flags.push(`${submissions} total submissions`); riskScore += 5; }

      // Name completeness check
      if (!user.fullName || user.fullName.trim().split(" ").length < 2) {
        flags.push("Profile name is incomplete or single-word"); riskScore += 25;
      }

      // Bio/profile completeness
      if (!user.userBio) { flags.push("No bio on profile"); riskScore += 5; }
      if (!user.zipcode) { flags.push("No zip code on profile"); riskScore += 5; }
      if (!user.profilePhoto) { flags.push("No profile photo"); riskScore += 10; }

      // Trust score context
      if (user.trustScore !== null && user.trustScore !== undefined) {
        if (user.trustScore < 30) { flags.push(`Low trust score (${user.trustScore})`); riskScore += 15; }
      }

      // Name match in document type metadata
      const docType = parsedDetails.documentType || "";
      const hasDocType = docType.length > 0;
      if (!hasDocType) { flags.push("No document type specified by user"); riskScore += 10; }

      const clampedRisk = Math.min(100, riskScore);
      let recommendation: "approve" | "review" | "reject";
      if (clampedRisk <= 20) recommendation = "approve";
      else if (clampedRisk <= 50) recommendation = "review";
      else recommendation = "reject";

      const trustLevel =
        (user.trustScore ?? 50) >= 80 ? "Trusted" :
        (user.trustScore ?? 50) >= 60 ? "Verified" : "New";

      res.json({
        riskScore: clampedRisk,
        recommendation,
        trustLevel,
        accountAgeDays,
        totalSubmissions: submissions,
        registeredName: user.fullName || user.username,
        flags,
        checkedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/verifications/:logId/approve", requireAdmin, async (req, res) => {
    try {
      const { logId } = req.params;
      const [log] = await db.select().from(auditLogsTable).where(sqlEq(auditLogsTable.id, parseInt(logId)));
      if (!log || !log.userId) return res.status(404).json({ message: "Verification log not found" });

      const isId = log.action === "id_upload" || log.action === "verification_submitted_id";
      const isSelfie = log.action === "verification_submitted_selfie";
      const updates: any = {};
      
      if (isId) {
        updates.idVerified = true;
        try {
          const details = JSON.parse(log.details || "{}");
          if (details.documentType) updates.idDocumentType = details.documentType;
        } catch (e) {}
      } else if (isSelfie) {
        updates.selfieVerified = true;
      } else {
        updates.credentialVerified = true;
        updates.credentialUploadPending = false;
      }

      await storage.updateUser(log.userId, updates);
      await db.update(auditLogsTable).set({ reviewStatus: "approved", reviewedAt: new Date() }).where(sqlEq(auditLogsTable.id, parseInt(logId)));
      await notify(log.userId, {
        title: "Verification Approved ✅",
        body: `Your ${isId ? "ID" : isSelfie ? "selfie" : "credential"} verification has been approved.`,
        type: "system",
      }, "/profile");

      res.json({ message: "Verification approved" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/verifications/:logId/reject", requireAdmin, async (req, res) => {
    try {
      const { logId } = req.params;
      const { reason } = req.body;
      const [log] = await db.select().from(auditLogsTable).where(sqlEq(auditLogsTable.id, parseInt(logId)));
      if (!log || !log.userId) return res.status(404).json({ message: "Verification log not found" });

      const isId = log.action === "id_upload" || log.action === "verification_submitted_id";
      const isSelfie = log.action === "verification_submitted_selfie";
      const isCredential = !isId && !isSelfie;

      if (isCredential) await storage.updateUser(log.userId, { credentialUploadPending: false });
      await db.update(auditLogsTable).set({ reviewStatus: "rejected", reviewedAt: new Date() }).where(sqlEq(auditLogsTable.id, parseInt(logId)));

      await notify(log.userId, {
        title: "Verification Rejected ❌",
        body: `Your ${isId ? "ID" : isSelfie ? "selfie" : "credential"} verification was rejected. Reason: ${reason || "Information provided was insufficient or incorrect."}`,
        type: "system",
      }, "/profile");

      res.json({ message: "Verification rejected" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/user-verifications/:userId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const targetUserId = parseInt(req.params.userId);
      const logs = await db.select({
        id: auditLogsTable.id,
        action: auditLogsTable.action,
        details: auditLogsTable.details,
        reviewStatus: auditLogsTable.reviewStatus,
        reviewedAt: auditLogsTable.reviewedAt,
        createdAt: auditLogsTable.createdAt,
      })
      .from(auditLogsTable)
      .where(sql`audit_logs.user_id = ${targetUserId} AND (audit_logs.action IN ('credential_upload','id_upload') OR audit_logs.action LIKE 'verification_submitted_%')`)
      .orderBy(sqlDesc(auditLogsTable.createdAt));

      const results = logs.map(log => {
        let parsedDetails: any = {};
        try {
          if (log.details?.trim().startsWith("{")) {
            parsedDetails = JSON.parse(log.details);
          }
        } catch (e) {}
        return { ...log, parsedDetails };
      });
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/verifications/:logId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const logId = parseInt(req.params.logId);
      const [log] = await db.select({ action: auditLogsTable.action }).from(auditLogsTable).where(sqlEq(auditLogsTable.id, logId));
      if (!log) return res.status(404).json({ message: "Log entry not found" });
      const verificationActions = ["id_upload", "credential_upload", "verification_submitted_id", "verification_submitted_selfie", "verification_submitted_credential"];
      if (!verificationActions.includes(log.action)) {
        return res.status(403).json({ message: "Cannot delete non-verification audit log entries" });
      }
      await db.delete(auditLogsTable).where(sqlEq(auditLogsTable.id, logId));
      res.json({ message: "Verification entry deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/audit-logs", requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const logs = await db
        .select({
          id: auditLogsTable.id,
          userId: auditLogsTable.userId,
          action: auditLogsTable.action,
          details: auditLogsTable.details,
          ipAddress: auditLogsTable.ipAddress,
          createdAt: auditLogsTable.createdAt,
          username: usersTable.username,
        })
        .from(auditLogsTable)
        .leftJoin(usersTable, sqlEq(auditLogsTable.userId, usersTable.id))
        .orderBy(sqlDesc(auditLogsTable.createdAt))
        .limit(limit);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/users/:id/tier", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { tier } = req.body;
      if (!TIER_ORDER.includes(tier)) {
        return res.status(400).json({ message: "Invalid tier" });
      }
      const user = await storage.updateUser(id, { tier });
      if (!user) return res.status(404).json({ message: "User not found" });

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "admin_tier_change",
        details: `Admin changed user ${id} tier to ${tier}`,
      });

      await notify(id, {
        title: "Trust Tier Updated 🏅",
        body: `Your trust tier has been updated to ${tier}.`,
        type: "system",
      }, "/profile");

      res.json(sanitizeUser(user));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/nsopw-search", requireAdmin, async (req: Request, res: Response) => {
    const { firstName, lastName } = req.query as { firstName?: string; lastName?: string };
    if (!firstName || !lastName) return res.status(400).json({ message: "firstName and lastName required" });
    const searchUrl = `https://www.nsopw.gov/Search/Verify?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}&stateCode=`;
    try {
      const apiRes = await fetch(
        `https://www.nsopw.gov/api/search/sexoffender?q=${encodeURIComponent(firstName + " " + lastName)}&r=json`,
        { headers: { "User-Agent": "GuberAdmin/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(8000) }
      );
      if (apiRes.ok) {
        const data = await apiRes.json() as Record<string, unknown>;
        const records = (data.records ?? data.results ?? data.offenders ?? []) as unknown[];
        return res.json({ results: records, searchUrl, source: "api" });
      }
      return res.json({ results: [], searchUrl, source: "fallback" });
    } catch {
      return res.json({ results: [], searchUrl, source: "fallback" });
    }
  });

  app.patch("/api/admin/users/:id/background-check", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { status, restrictions } = req.body;
      const update: any = { backgroundCheckStatus: status };
      if (restrictions) update.backgroundCheckRestrictions = restrictions;
      const user = await storage.updateUser(id, update);
      if (!user) return res.status(404).json({ message: "User not found" });

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "admin_background_check",
        details: `Background check for user ${id}: ${status}. Restrictions: ${JSON.stringify(restrictions || [])}`,
      });

      res.json(sanitizeUser(user));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/proof-template/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const pt = await storage.getProofTemplate(id);
      if (!pt) return res.status(404).json({ message: "Template not found" });

      const updated = await storage.updateProofTemplate(id, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // MARKETPLACE ROUTES
  app.get("/api/marketplace", async (req: Request, res: Response) => {
    try {
      const category = req.query.category as string | undefined;
      const items = await storage.getMarketplaceItems({ category });
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/marketplace/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const item = await storage.getMarketplaceItem(id);
      if (!item) return res.status(404).json({ message: "Item not found" });
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/marketplace", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "User not found" });
      const { title, description, category, condition, price, askingType, photos, zipcode, locationApprox, viJobId } = req.body;
      if (!title || !category) return res.status(400).json({ message: "Title and category are required" });

      let guberVerified = false;
      let verificationDate: Date | null = null;
      let verifiedByUserId: number | null = null;
      let verifiedByName: string | null = null;
      let verificationNotes: string | null = null;

      if (viJobId) {
        const viJob = await storage.getJob(parseInt(viJobId));
        if (viJob && ["completion_submitted", "completed_paid"].includes(viJob.status) && viJob.jobType === "vi") {
          guberVerified = true;
          verificationDate = viJob.completedAt || new Date();
          if (viJob.assignedHelperId) {
            const inspector = await storage.getUser(viJob.assignedHelperId);
            if (inspector) {
              verifiedByUserId = inspector.id;
              verifiedByName = inspector.fullName;
            }
          }
          verificationNotes = viJob.description || null;
        }
      }

      const item = await storage.createMarketplaceItem({
        sellerId: userId,
        sellerName: user.fullName,
        title,
        description,
        category,
        condition,
        price: price ? parseFloat(price) : null,
        askingType: askingType || "fixed",
        photos: photos || [],
        zipcode: zipcode || user.zipcode,
        locationApprox: locationApprox || (user.zipcode ? `${user.zipcode} area` : null),
        status: "active",
        guberVerified,
        verificationDate,
        verifiedByUserId,
        verifiedByName,
        viJobId: viJobId ? parseInt(viJobId) : null,
        verificationNotes,
      });
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/marketplace/:id/boost-checkout", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      const item = await storage.getMarketplaceItem(itemId);
      if (!item) return res.status(404).json({ message: "Item not found" });
      if (item.sellerId !== req.session.userId) return res.status(403).json({ message: "Not your listing" });

      const host = req.get("host") || "localhost:5000";
      const protocol = req.get("x-forwarded-proto") || "http";
      const baseUrl = `${protocol}://${host}`;

      const session = await stripeMain.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: "GUBER Marketplace Featured Boost",
              description: `7-day featured placement for: ${item.title}`,
            },
            unit_amount: 499,
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${baseUrl}/marketplace?boost_success=1&item=${itemId}`,
        cancel_url: `${baseUrl}/marketplace`,
        metadata: { userId: String(req.session.userId), itemId: String(itemId), type: "marketplace_boost" },
      });

      res.json({ checkoutUrl: session.url });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/my-jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobs = await storage.getUserJobs(req.session.userId!);
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const job = await storage.getJob(parseInt(req.params.id));
      if (!job) return res.status(404).json({ message: "Job not found" });
      res.json(sanitizeJobForPublic(job, req.session.userId));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = insertJobSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      
      const jobData = {
        ...parsed.data,
        postedById: req.session.userId!,
        status: "draft",
        isPaid: false,
        isPublished: false,
      };

      if (!jobData.lat || !jobData.lng) {
        const coords = await geocodeAddress(jobData.location || `${jobData.zip}, USA`);
        if (coords) {
          jobData.lat = coords.lat;
          jobData.lng = coords.lng;
        }
      }

      const job = await storage.createJob(jobData);
      res.status(201).json(job);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/jobs/:id", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const job = await storage.getJob(id);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      if (!["posted_public", "draft"].includes(job.status)) {
        return res.status(400).json({ message: "Jobs can only be edited before a worker accepts. This job is no longer editable." });
      }

      const { title, description, budget, location, zip, lat: rawLat, lng: rawLng } = req.body;
      const allowedUpdate: any = {};
      if (title !== undefined) allowedUpdate.title = title;
      if (description !== undefined) allowedUpdate.description = description;
      if (budget !== undefined) allowedUpdate.budget = parseFloat(budget);
      if (location !== undefined) allowedUpdate.location = location;
      if (zip !== undefined) allowedUpdate.zip = zip;

      // Use exact coordinates from Places Autocomplete if provided, otherwise geocode from text
      const exactLat = rawLat != null && !isNaN(parseFloat(rawLat)) ? parseFloat(rawLat) : null;
      const exactLng = rawLng != null && !isNaN(parseFloat(rawLng)) ? parseFloat(rawLng) : null;
      if (exactLat !== null && exactLng !== null) {
        allowedUpdate.lat = exactLat;
        allowedUpdate.lng = exactLng;
      } else if (location || zip) {
        const geocodeTarget = [location, zip].filter(Boolean).join(", ");
        try {
          const coords = await geocodeAddress(geocodeTarget);
          if (coords) { allowedUpdate.lat = coords.lat; allowedUpdate.lng = coords.lng; }
        } catch {}
      }

      const updated = await storage.updateJob(id, allowedUpdate);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/jobs/:id", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const job = await storage.getJob(id);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      if (!["posted_public", "draft", "accepted_pending_payment"].includes(job.status)) {
        return res.status(400).json({ message: "Cannot delete a job that is funded or completed" });
      }
      await storage.deleteJob(id);
      res.json({ message: "Job deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/notifications", requireAuth, async (req: Request, res: Response) => {
    try {
      const notes = await storage.getNotificationsByUser(req.session.userId!);
      res.json(notes);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs/:id/escalate", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      const isPoster = job.postedById === req.session.userId;
      const isHelperUser = job.assignedHelperId === req.session.userId;
      if (!isPoster && !isHelperUser) return res.status(403).json({ message: "Not authorized to escalate this job" });

      // Poster can only dispute during the review window (helperConfirmed, buyerConfirmed=false)
      if (isPoster && !(job.helperConfirmed && !job.buyerConfirmed)) {
        return res.status(400).json({ message: "You can only dispute during the review window after the worker marks done." });
      }

      const { reason } = req.body;
      const escalatedBy = isPoster ? "poster" : "helper";

      const updated = await storage.updateJob(jobId, {
        status: "disputed",
        disputeReason: reason || (isPoster ? "Poster disputed during review window" : "Helper escalated after proof rejected"),
      } as any);

      // Notify Admins
      const admins = await db.select().from(usersTable).where(sqlEq(usersTable.role, "admin"));
      const helper = await storage.getUser(job.assignedHelperId!);
      const poster = await storage.getUser(job.postedById);
      const proofs = await storage.getProofsByJob(job.id);

      for (const admin of admins) {
        await storage.createNotification({
          userId: admin.id,
          title: "🚨 DISPUTE ESCALATED",
          body: `Job #${job.id} "${job.title}" escalated by ${escalatedBy}. Poster: ${poster?.fullName}. Helper: ${helper?.fullName}. Budget: $${job.budget}. ${proofs.length} proof photos.${reason ? ` Reason: ${reason}` : ""} Review in admin panel.`,
          type: "system",
          jobId: job.id,
        });
      }

      // Cross-notify the other party
      if (isPoster && job.assignedHelperId) {
        await notify(job.assignedHelperId, {
          title: "Dispute Filed",
          body: `The poster disputed "${job.title}" during the review window. GUBER admin will review and resolve.`,
          jobId,
        });
      } else if (isHelperUser && job.postedById) {
        await notify(job.postedById, {
          title: "Dispute Escalated",
          body: `The helper has escalated "${job.title}" to admin review. GUBER will review.`,
          jobId,
        });
      }

      await storage.createAuditLog({
        userId: req.session.userId,
        action: `dispute_escalated_by_${escalatedBy}`,
        details: `${escalatedBy} escalated job ${jobId} to admin review.${reason ? ` Reason: ${reason}` : ""}`,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/notifications/read-all", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.markAllNotificationsRead(req.session.userId!);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });



  app.delete("/api/users/:id", requireAuth, demoGuard, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (req.session.userId !== id) return res.status(403).json({ message: "Can only delete your own account" });
    await storage.deleteUser(id);
    req.session.destroy(() => { res.json({ message: "Account deleted" }); });
  });

  app.get("/api/user/verification-status", requireAuth, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    try {
      const actionMap: Record<string, string[]> = {
        id: ["id_upload", "verification_submitted_id"],
        selfie: ["verification_submitted_selfie"],
        credential: ["credential_upload", "verification_submitted_credential"],
      };
      const pending: Record<string, boolean> = { id: false, selfie: false, credential: false };
      for (const [docType, actions] of Object.entries(actionMap)) {
        const placeholders = actions.map(a => `'${a}'`).join(",");
        const rows = await db.execute(sql`
          SELECT id FROM audit_logs
          WHERE user_id = ${userId}
            AND action IN (${sql.raw(placeholders)})
            AND COALESCE(review_status, 'pending') = 'pending'
          LIMIT 1
        `);
        pending[docType] = (rows.rows as any[]).length > 0;
      }
      res.json(pending);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/user/submit-verification", requireAuth, demoGuard, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const { type, imageBase64, documentType } = req.body;
    if (!["id", "selfie", "credential"].includes(type)) {
      return res.status(400).json({ message: "Invalid verification type" });
    }
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ message: "Image data required" });
    }

    const actionMap: Record<string, string[]> = {
      id: ["id_upload", "verification_submitted_id"],
      selfie: ["verification_submitted_selfie"],
      credential: ["credential_upload", "verification_submitted_credential"],
    };
    const actions = actionMap[type];
    const placeholders = actions.map(a => `'${a}'`).join(",");
    const existingPending = await db.execute(sql`
      SELECT id FROM audit_logs
      WHERE user_id = ${userId}
        AND action IN (${sql.raw(placeholders)})
        AND COALESCE(review_status, 'pending') = 'pending'
      LIMIT 1
    `);
    if ((existingPending.rows as any[]).length > 0) {
      return res.status(409).json({ message: `You already have a pending ${type === "id" ? "ID" : type === "selfie" ? "selfie" : "credential"} submission under review.` });
    }

    await storage.createAuditLog({
      userId,
      action: `verification_submitted_${type}`,
      details: JSON.stringify({
        message: `User submitted ${type} verification document for review`,
        documentType: documentType || null,
        imageBase64,
      }),
    });

    const submitter = await storage.getUser(userId);
    const submitterName = submitter?.fullName || submitter?.username || `User #${userId}`;
    const typeLabel = type === "id" ? "ID Document" : type === "selfie" ? "Selfie/Liveness" : "Credential";

    const adminUsers = await db.select({ id: usersTable.id }).from(usersTable).where(sqlEq(usersTable.role, "admin"));
    for (const admin of adminUsers) {
      await storage.createNotification({
        userId: admin.id,
        type: "admin_alert",
        title: `Verification: ${typeLabel}`,
        body: `${submitterName} submitted a ${typeLabel.toLowerCase()} for review. Tap to open admin panel.`,
        jobId: null,
      });
      await sendPushToUser(admin.id, {
        title: `New Verification Request`,
        body: `${submitterName} submitted a ${typeLabel.toLowerCase()}. Open admin panel to review.`,
        url: "/admin",
      });
    }

    res.json({ message: "Verification submitted. Admin will review within 24-48 hours." });
  });

  // SERVICE CATALOG (V&I DROPDOWN TREE)
  app.get("/api/catalog/vi-categories", async (_req: Request, res: Response) => {
    const cats = await storage.getVICategories();
    res.json(cats);
  });

  app.get("/api/catalog/use-cases/:viCategoryId", async (req: Request, res: Response) => {
    const ucs = await storage.getUseCasesByVICategory(parseInt(req.params.viCategoryId));
    res.json(ucs);
  });

  app.get("/api/catalog/service-types/:useCaseId", async (req: Request, res: Response) => {
    const sts = await storage.getCatalogServiceTypesByUseCase(parseInt(req.params.useCaseId));
    res.json(sts);
  });

  app.get("/api/catalog/detail-options/:viCategoryId", async (req: Request, res: Response) => {
    const dos = await storage.getDetailOptionSetsByVICategory(parseInt(req.params.viCategoryId));
    res.json(dos);
  });

  app.get("/api/catalog/proof-template/:id", async (req: Request, res: Response) => {
    const pt = await storage.getProofTemplate(parseInt(req.params.id));
    if (!pt) return res.status(404).json({ message: "Template not found" });
    const items = await storage.getProofChecklistItems(pt.id);
    res.json({ ...pt, checklistItems: items });
  });

  app.get("/api/catalog/all", async (_req: Request, res: Response) => {
    const [cats, ucs, sts, dos, pts] = await Promise.all([
      storage.getVICategories(),
      storage.getUseCases(),
      storage.getCatalogServiceTypes(),
      storage.getDetailOptionSets(),
      storage.getProofTemplates(),
    ]);
    res.json({ viCategories: cats, useCases: ucs, serviceTypes: sts, detailOptionSets: dos, proofTemplates: pts });
  });

  // PREDEFINED SERVICES (non-V&I categories)
  app.get("/api/services/:category", async (req: Request, res: Response) => {
    const cat = decodeURIComponent(req.params.category);
    if (cat === "Skilled Labor" || cat === "General Labor") {
      const sts = await storage.getServiceTypesByCategory(cat);
      if (sts && sts.length > 0) return res.json(sts.map((st: any) => st.name));
    }
    const services = PREDEFINED_SERVICES[cat] || [];
    res.json(services);
  });

  app.get("/api/verify-inspect-types", async (_req: Request, res: Response) => {
    const cats = await storage.getVICategories();
    const result: Record<string, any> = {};
    for (const cat of cats) {
      const ucs = await storage.getUseCasesByVICategory(cat.id);
      result[cat.name] = {
        id: cat.id,
        description: cat.description,
        icon: cat.icon,
        proofRequired: true,
        openToAll: cat.name === "Quick Check" || cat.name === "Online Items",
        minTier: ucs.length > 0 ? ucs[0].minTier : "community",
        useCases: ucs,
      };
    }
    res.json(result);
  });

  // JOBS
  app.get("/api/jobs", requireAuth, async (req: Request, res: Response) => {
    const jobsList = await storage.getJobs();
    const demoIds = await getDemoUserIds();
    const callerIsDemoUser = req.session.userId ? demoIds.has(req.session.userId) : false;
    const sanitized = jobsList
      .filter(j => j.status !== "draft" && j.isPaid)
      .filter(j => callerIsDemoUser || !demoIds.has(j.postedById))
      .map(j => sanitizeJobForPublic(j, req.session.userId));
    res.json(sanitized);
  });

  app.get("/api/my-jobs", requireAuth, async (req: Request, res: Response) => {
    const jobsList = await storage.getUserJobs(req.session.userId!);
    const sanitized = jobsList.map(j => {
      const { platformFee, helperPayout, ...pub } = j as any;
      return pub;
    });
    res.json(sanitized);
  });

  app.get("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    const job = await storage.getJob(parseInt(req.params.id as string));
    if (!job) return res.status(404).json({ message: "Job not found" });
    
    const isOwner = req.session.userId === job.postedById;
    const isHelper = req.session.userId === job.assignedHelperId;
    if (!isOwner && !isHelper && (job.status === "draft" || !job.isPaid)) {
      return res.status(403).json({ message: "Job not available" });
    }
    
    // Retroactive geocode if lat/lng still missing
    if ((!job.lat || !job.lng) && (job.location || job.zip)) {
      const addr = job.location && job.zip
        ? `${job.location.trim()}, ${job.zip}, USA`
        : job.location ? job.location.trim()
        : `${job.zip}, USA`;
      geocodeAddress(addr).then(async coords => {
        if (coords) {
          await storage.updateJob(job.id, { lat: coords.lat, lng: coords.lng });
        } else if (job.zip) {
          const zc = await geocodeAddress(`${job.zip}, USA`);
          if (zc) await storage.updateJob(job.id, { lat: zc.lat, lng: zc.lng });
        }
      }).catch(() => {});
    }

    const sanitized = sanitizeJobForPublic(job, req.session.userId);
    
    if (sanitized.description) sanitized.description = filterContactInfo(sanitized.description).clean;
    if (sanitized.jobDetails) {
      const cleanDetails: Record<string, string> = {};
      for (const [key, val] of Object.entries(sanitized.jobDetails)) {
        cleanDetails[key] = filterContactInfo(val as string).clean;
      }
      sanitized.jobDetails = cleanDetails;
    }

    if (isOwner || isHelper) {
      const jobAssignments = await storage.getAssignmentsByJob(job.id);
      const activeAssignment = jobAssignments.find(a => a.helperId === job.assignedHelperId);
      if (activeAssignment) {
        (sanitized as any).assignment = {
          workerAvailableFrom: activeAssignment.workerAvailableFrom,
          workerAvailableTo: activeAssignment.workerAvailableTo,
          confirmedStartTime: activeAssignment.confirmedStartTime,
          needMoreTimeSentAt: activeAssignment.needMoreTimeSentAt,
        };
      }
    }

    res.json(sanitized);
  });

  // PRICING SUGGESTION
  app.get("/api/pricing-suggestion", async (req: Request, res: Response) => {
    try {
      const serviceType = req.query.serviceType as string;
      const category = req.query.category as string;
      const lat = parseFloat(req.query.lat as string) || 0;
      const lng = parseFloat(req.query.lng as string) || 0;
      const urgent = req.query.urgent === "true";
      const rawMinutes = req.query.minutes ? parseInt(req.query.minutes as string) : 0;
      const userMinutes = rawMinutes > 0 ? Math.max(rawMinutes, 30) : 0;

      if (!serviceType || !category) {
        return res.status(400).json({ message: "Both serviceType and category are required" });
      }

      let pricingConfig = await storage.getServicePricingConfig(category, serviceType);

      let baseLow = pricingConfig?.suggestedRangeLow ?? 10;
      let baseHigh = pricingConfig?.suggestedRangeHigh ?? 50;
      const minPayout = pricingConfig?.minPayout ?? 5;
      const configMinutes = pricingConfig?.estimatedMinutes ?? 30;
      const estimatedMinutes = userMinutes > 0 ? userMinutes : configMinutes;
      const complexityTier = pricingConfig?.complexityTier ?? "standard";

      if (userMinutes > 0 && configMinutes > 0) {
        const timeRatio = userMinutes / configMinutes;
        baseLow = Math.round(baseLow * timeRatio);
        baseHigh = Math.round(baseHigh * timeRatio);
        baseLow = Math.max(baseLow, minPayout);
        baseHigh = Math.max(baseHigh, baseLow);
      }

      const complexityMultipliers: Record<string, number> = {
        basic: 0.85,
        standard: 1.0,
        advanced: 1.15,
        expert: 1.3,
      };
      const complexityMult = complexityMultipliers[complexityTier] ?? 1.0;
      let suggestedLow = Math.round(baseLow * complexityMult);
      let suggestedHigh = Math.round(baseHigh * complexityMult);

      let nearbyHelpers = 0;
      const workers = await storage.getAvailableWorkers();
      const activeWorkers = workers.filter(w => !w.suspended && !w.banned);

      let resolvedLat = lat;
      let resolvedLng = lng;

      if (!resolvedLat || !resolvedLng) {
        const zipParam = req.query.zip as string;
        if (zipParam) {
          const coords = await geocodeAddress(zipParam);
          if (coords) {
            resolvedLat = coords.lat;
            resolvedLng = coords.lng;
          }
        }
      }

      if (resolvedLat && resolvedLng) {
        const RADIUS_MILES = 25;
        nearbyHelpers = activeWorkers.filter(w => {
          if (!w.lat || !w.lng) return false;
          const dLat = (w.lat - resolvedLat) * Math.PI / 180;
          const dLng = (w.lng - resolvedLng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(resolvedLat * Math.PI / 180) * Math.cos(w.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
          const dist = 3959 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return dist <= RADIUS_MILES;
        }).length;
      } else {
        nearbyHelpers = activeWorkers.length;
      }

      if (nearbyHelpers <= 1) {
        suggestedLow = Math.round(suggestedLow * 1.15);
        suggestedHigh = Math.round(suggestedHigh * 1.15);
      } else if (nearbyHelpers >= 5) {
        suggestedLow = Math.round(suggestedLow * 0.95);
        suggestedHigh = Math.round(suggestedHigh * 0.95);
      }

      if (urgent) {
        suggestedLow = Math.round(suggestedLow * 1.1);
        suggestedHigh = Math.round(suggestedHigh * 1.1);
      }

      const hour = new Date().getHours();
      if (hour < 7 || hour > 21) {
        suggestedLow = Math.round(suggestedLow * 1.1);
        suggestedHigh = Math.round(suggestedHigh * 1.1);
      }

      suggestedLow = Math.max(suggestedLow, minPayout);
      suggestedHigh = Math.max(suggestedHigh, suggestedLow);

      res.json({
        suggestedRangeLow: suggestedLow,
        suggestedRangeHigh: suggestedHigh,
        minPayout,
        estimatedMinutes,
        complexityTier,
        nearbyHelpers,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/proof-requirements", async (req: Request, res: Response) => {
    try {
      const catalogServiceTypeName = req.query.catalogServiceTypeName as string;
      if (!catalogServiceTypeName) return res.status(400).json({ message: "catalogServiceTypeName required" });

      const allSTs = await storage.getCatalogServiceTypes();
      const matchedST = allSTs.find(st => st.name === catalogServiceTypeName);
      if (!matchedST || !matchedST.proofTemplateId) {
        return res.json({ items: [], template: null });
      }

      const template = await storage.getProofTemplate(matchedST.proofTemplateId);
      const items = await storage.getProofChecklistItems(matchedST.proofTemplateId);

      res.json({
        template: template ? {
          name: template.name,
          requiredPhotoCount: template.requiredPhotoCount,
          requiredVideo: template.requiredVideo,
          videoDuration: template.videoDuration,
          geoRequired: template.geoRequired,
        } : null,
        items: items.map(i => ({
          label: i.label,
          instruction: i.instruction,
          mediaType: i.mediaType,
          quantityRequired: i.quantityRequired,
          geoRequired: i.geoRequired,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // JOB CREATION (POST-FIRST, PAY-AT-LOCK)


  app.post("/api/jobs/create-checkout", requireAuth, demoGuard, checkSuspended, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "User not found" });

      if (!user.idVerified) {
        return res.status(403).json({ message: "ID_REQUIRED", needsVerification: true, detail: "You must verify your ID before posting a job. Go to Profile → Trust & Credentials." });
      }

      const { category, serviceType, budget, location, locationApprox, zip, urgentSwitch,
              verifyInspectCategory, useCaseName, catalogServiceTypeName, jobDetails, scheduledAt, isBounty,
              estimatedMinutes: rawEstimatedMinutes, barterNeed, barterOffering, barterEstimatedValue,
              autoIncreaseEnabled, autoIncreaseAmount, autoIncreaseMax, autoIncreaseIntervalMins,
              lat: rawLat, lng: rawLng } = req.body;
      const exactLat = rawLat != null && !isNaN(parseFloat(rawLat)) ? parseFloat(rawLat) : null;
      const exactLng = rawLng != null && !isNaN(parseFloat(rawLng)) ? parseFloat(rawLng) : null;

      if (!category) return res.status(400).json({ message: "Category is required" });

      let title = "";
      let description = "";
      let proofRequired = false;
      let proofTemplateId = null;

      if (category === "Verify & Inspect") {
        if (!useCaseName || !catalogServiceTypeName) {
          return res.status(400).json({ message: "Use case and service type are required for V&I jobs" });
        }
        title = `${useCaseName} - ${catalogServiceTypeName}`;

        const allSTs = await storage.getCatalogServiceTypes();
        const matchedST = allSTs.find(st => st.name === catalogServiceTypeName);
        if (matchedST) {
          description = matchedST.descriptionTemplate || matchedST.description || "";
          proofTemplateId = matchedST.proofTemplateId;
          const userTierIdx = TIER_ORDER.indexOf(user.tier);
          const reqTierIdx = TIER_ORDER.indexOf(matchedST.minTier || "community");
          if (userTierIdx < reqTierIdx) {
            return res.status(403).json({ message: `This service requires ${matchedST.minTier} tier or higher` });
          }
        }

        if (jobDetails && typeof jobDetails === "object") {
          const filteredDetails: Record<string, string> = {};
          for (const [k, v] of Object.entries(jobDetails)) {
            if (v && typeof v === "string" && v !== "") {
              const check = filterContactInfo(v);
              if (check.blocked) {
                await storage.createAuditLog({ userId: req.session.userId, action: "contact_info_blocked", details: `Contact info in V&I jobDetails field: ${k}` });
              }
              filteredDetails[k] = check.clean;
            }
          }
          const detailParts = Object.entries(filteredDetails)
            .map(([k, v]) => `${k}: ${v}`);
          if (detailParts.length > 0) {
            description += "\n\nDetails:\n" + detailParts.join("\n");
          }
          req.body.jobDetails = filteredDetails;
        }

        proofRequired = true;
      } else {
        if (!serviceType) return res.status(400).json({ message: "Service type is required" });
        const validServices = PREDEFINED_SERVICES[category];
        if (validServices && !validServices.includes(serviceType)) {
          return res.status(400).json({ message: "Invalid service type" });
        }
        title = `${serviceType} - ${category}`;
        if (req.body.description) {
          const descCheck = filterContactInfo(String(req.body.description));
          description = descCheck.clean;
          if (descCheck.blocked) {
            await storage.createAuditLog({ userId: req.session.userId, action: "contact_info_blocked", details: `Contact info in ${category} description` });
          }
        }

        if (category === "Skilled Labor") {
          const userTierIdx = TIER_ORDER.indexOf(user.tier);
          const sts = await storage.getServiceTypesByCategory("Skilled Labor");
          const st = sts.find(s => s.name === serviceType);
          const requiredTier = st?.minTier || "verified";
          const reqTierIdx = TIER_ORDER.indexOf(requiredTier);

          if (userTierIdx < reqTierIdx) {
            return res.status(403).json({ message: `Skilled Labor: ${serviceType} requires ${requiredTier} tier or higher to post` });
          }
          if (user.backgroundCheckStatus === "flagged" && user.backgroundCheckRestrictions) {
            const restrictions = user.backgroundCheckRestrictions as string[];
            if (restrictions.includes("Skilled Labor") || (serviceType && restrictions.includes(serviceType))) {
              return res.status(403).json({ message: "Your background check restricts posting in this category. Contact support for details." });
            }
          }
        }
      }

      const parsedBudget = budget ? parseFloat(budget) : 0;
      if (category !== "Barter Labor" && (!Number.isFinite(parsedBudget) || parsedBudget <= 0)) {
        return res.status(400).json({ message: "A valid budget is required" });
      }

      if (category !== "Barter Labor" && Number.isFinite(parsedBudget) && parsedBudget > 0) {
        const effectiveServiceType = serviceType || catalogServiceTypeName;
        if (effectiveServiceType) {
          const pricing = await storage.getServicePricingConfig(category, effectiveServiceType);
          if (pricing && parsedBudget < pricing.minPayout) {
            return res.status(400).json({ message: `Minimum payout for ${effectiveServiceType} is $${pricing.minPayout}` });
          }
        }
      }

      const isOG = user.day1OG === true;
      const urgentFee = urgentSwitch ? (isOG ? 0 : URGENT_FEE) : 0;

      // --- NEW DUAL-FEE MODEL ---
      // Poster pays a service fee on top of the base job price.
      // Worker's payout is reduced by a worker platform fee.
      // Referral discounts only reduce the WORKER fee, never the poster fee.
      const rawReferralDiscount = (user as any).referralFeePct || 0;
      const discountExpiry = (user as any).referralDiscountExpiresAt ? new Date((user as any).referralDiscountExpiresAt) : null;
      const referralActive = rawReferralDiscount > 0 && discountExpiry !== null && discountExpiry > new Date();
      const referralDiscount = referralActive ? rawReferralDiscount : 0;

      // Poster service fee (added on top of budget — does NOT affect worker payout)
      const posterFeePct = isOG ? POSTER_FEE_PCT_OG : POSTER_FEE_PCT;
      const posterFee = Math.round(parsedBudget * posterFeePct * 100) / 100;

      // Worker platform fee (deducted from budget — does NOT affect poster charge)
      const baseWorkerFeePct = isOG ? WORKER_FEE_PCT_OG : WORKER_FEE_PCT;
      const effectiveWorkerFeePct = Math.max(0.05, baseWorkerFeePct - referralDiscount);
      const workerFee = Math.round(parsedBudget * effectiveWorkerFeePct * 100) / 100;

      // Combined platform revenue = posterFee + workerFee (stored as platformFee for reports)
      const platformFee = posterFee + workerFee;

      // What poster is charged at lock time (budget + poster service fee + urgent fee)
      const totalCharge = parsedBudget + posterFee + urgentFee;

      // What worker receives (budget minus worker fee)
      const helperPayout = parsedBudget - workerFee;

      const derivedJobType = urgentSwitch ? "urgent" : scheduledAt ? "scheduled" : "standard";
      const parsedScheduledAt = scheduledAt ? new Date(scheduledAt) : null;
      const graceEndsAt = computeGraceEndsAt({ jobType: derivedJobType, scheduledAt: parsedScheduledAt });
      const expiresAt = computeExpiresAt({ jobType: derivedJobType, scheduledAt: parsedScheduledAt });

      const parsedEstimatedMinutes = rawEstimatedMinutes ? Math.max(parseInt(rawEstimatedMinutes), 30) : null;

      let cleanBarterNeed: string | null = null;
      let cleanBarterOffering: string | null = null;
      if (category === "Barter Labor") {
        if (barterNeed) {
          const needCheck = filterContactInfo(String(barterNeed));
          cleanBarterNeed = needCheck.clean;
          if (needCheck.blocked) {
            await storage.createAuditLog({ userId: req.session.userId, action: "contact_info_blocked", details: "Contact info in barter need" });
          }
        }
        if (barterOffering) {
          const offerCheck = filterContactInfo(String(barterOffering));
          cleanBarterOffering = offerCheck.clean;
          if (offerCheck.blocked) {
            await storage.createAuditLog({ userId: req.session.userId, action: "contact_info_blocked", details: "Contact info in barter offering" });
          }
        }
      }

      const job = await storage.createJob({
        title,
        description: description || null,
        category,
        budget: parsedBudget,
        location: location || null,
        locationApprox: locationApprox || (zip ? `${zip} area` : null),
        zip: zip || null,
        lat: exactLat ?? undefined,
        lng: exactLng ?? undefined,
        payType: "Flat Rate",
        serviceType: serviceType || catalogServiceTypeName || null,
        verifyInspectCategory: verifyInspectCategory || null,
        useCaseName: useCaseName || null,
        catalogServiceTypeName: catalogServiceTypeName || null,
        jobDetails: jobDetails || null,
        urgentSwitch: urgentSwitch || false,
        urgentFee,
        jobType: derivedJobType,
        isBounty: isBounty === true || isBounty === "true",
        scheduledAt: parsedScheduledAt,
        graceEndsAt,
        expiresAt,
        postedById: req.session.userId!,
        status: "draft",
        isPublished: false,
        platformFee,
        helperPayout,
        posterFeePct,
        workerFeePct: effectiveWorkerFeePct,
        posterFee,
        payoutStatus: "none",
        proofRequired,
        proofTemplateId,
        estimatedMinutes: parsedEstimatedMinutes,
        barterNeed: cleanBarterNeed,
        barterOffering: cleanBarterOffering,
        barterEstimatedValue: category === "Barter Labor" ? (barterEstimatedValue || null) : null,
        ...(() => {
          if (category === "Barter Labor" || !autoIncreaseEnabled) return {};
          const parsedAmount = parseFloat(autoIncreaseAmount);
          const parsedMax = parseFloat(autoIncreaseMax);
          const parsedInterval = parseInt(autoIncreaseIntervalMins);
          const allowedIntervals = [30, 60, 120, 360, 720, 1440];
          if (!parsedAmount || parsedAmount <= 0 || !parsedMax || parsedMax <= parsedBudget ||
              !parsedInterval || !allowedIntervals.includes(parsedInterval)) {
            return {};
          }
          return {
            autoIncreaseEnabled: true,
            autoIncreaseAmount: parsedAmount,
            autoIncreaseMax: parsedMax,
            autoIncreaseIntervalMins: parsedInterval,
            nextIncreaseAt: new Date(Date.now() + parsedInterval * 60 * 1000),
          };
        })(),
      });

      // Geocode address/zip in background (non-blocking)
      // Combine street + zip for best accuracy; fall back to zip alone if no street
      const buildGeocodeTarget = () => {
        if (location && zip) return `${location.trim()}, ${zip}, USA`;
        if (location) return location.trim();
        if (zip) return `${zip}, USA`;
        return null;
      };
      const geocodeTarget = buildGeocodeTarget();
      if (geocodeTarget) {
        geocodeAddress(geocodeTarget).then(async coords => {
          if (coords) {
            storage.updateJob(job.id, { lat: coords.lat, lng: coords.lng });
          } else if (zip) {
            // Retry with just zip if combined address failed
            const zipCoords = await geocodeAddress(`${zip}, USA`);
            if (zipCoords) storage.updateJob(job.id, { lat: zipCoords.lat, lng: zipCoords.lng });
          }
        }).catch(() => {});
      }

      // Barter jobs: charge $10 platform fee at posting time via Stripe
      if (category === "Barter Labor") {
        const host = req.get("host") || "localhost:5000";
        const protocol = req.get("x-forwarded-proto") || "http";
        const baseUrl = `${protocol}://${host}`;

        const { gross: barterGross, stripeFee: barterStripeFee } = grossUpForStripe(10.00);

        const barterSession = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          customer_email: user.email || undefined,
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: "GUBER: Barter Job Posting Fee",
                  description: `Platform fee to post: ${job.title}`,
                },
                unit_amount: 1000, // $10.00
              },
              quantity: 1,
            },
            {
              price_data: {
                currency: "usd",
                product_data: { name: "Payment Processing Fee", description: "Stripe card processing (2.9% + 30¢)" },
                unit_amount: Math.round(barterStripeFee * 100),
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${baseUrl}/my-jobs?barter_session_id={CHECKOUT_SESSION_ID}&barter_job_id=${job.id}`,
          cancel_url: `${baseUrl}/post-job?cancelled=true`,
          metadata: { jobId: String(job.id), userId: String(req.session.userId), type: "barter_post" },
        });

        await storage.updateJob(job.id, { stripeSessionId: barterSession.id });
        return res.json({ checkoutUrl: barterSession.url, jobId: job.id });
      }

      // Non-barter: publish immediately — payment happens when poster locks a helper
      await storage.updateJob(job.id, { status: "posted_public", isPublished: true, isPaid: true });
      const freshJob = await storage.getJob(job.id);
      if (freshJob) notifyNearbyAvailableWorkers(freshJob).catch(() => {});
      return res.json({ jobId: job.id, redirectMode: true });
    } catch (err: any) {
      console.error("Stripe checkout error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs/confirm-payment", requireAuth, async (req: Request, res: Response) => {
    try {
      const { sessionId, jobId } = req.body;
      const job = await storage.getJob(parseInt(jobId));
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId) return res.status(403).json({ message: "Not your job" });

      // If webhook already processed this, just return the job
      if (job.isPaid && job.status !== "draft") {
        return res.json(job);
      }

      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
      const sessionType = stripeSession.metadata?.type;
      if (sessionType && !["barter_post", "job_post"].includes(sessionType)) {
        return res.status(400).json({ message: "Invalid session type for payment confirmation" });
      }

      if (stripeSession.payment_status === "paid") {
        const isBarter = sessionType === "barter_post";
        const updated = await storage.updateJob(job.id, {
          status: "posted_public",
          isPaid: true,
          isPublished: true,
          stripePaymentIntentId: stripeSession.payment_intent as string,
        });

        await storage.createWalletTransaction({
          userId: job.postedById,
          jobId: job.id,
          type: "payment",
          amount: isBarter ? 10 : (job.budget! + (job.urgentFee || 0)),
          status: "completed",
          description: isBarter ? `Barter posting fee: ${job.title}` : `Payment for: ${job.title}`,
        });

        await notify(job.postedById, {
          title: isBarter ? "Barter Listing Posted! 🔄" : "Job Posted! 🎉",
          body: isBarter ? `Your barter listing "${job.title}" is now live.` : `Your job "${job.title}" is now live and visible to helpers.`,
          type: "job",
          jobId: job.id,
        });

        notifyNearbyAvailableWorkers(updated || job).catch(() => {});
        res.json(updated);
      } else {
        res.status(400).json({ message: "Payment not completed" });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // JOB FLOW
  app.post("/api/jobs/:id/accept", requireAuth, demoGuard, checkSuspended, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.status !== "posted_public") return res.status(400).json({ message: "Job is not open" });
      const isDemo = await isDemoUser(req.session.userId!);
      if (job.postedById === req.session.userId && !isDemo) return res.status(400).json({ message: "Cannot accept your own job" });

      const helper = await storage.getUser(req.session.userId!);
      if (!helper) return res.status(401).json({ message: "User not found" });

      if (job.isBounty) {
        return res.status(400).json({ message: "BOUNTY_JOB", detail: "This is a bounty job. Use Submit Proof instead of Accept." });
      }

      if (!isDemo && !helper.idVerified) {
        return res.status(403).json({ message: "ID_REQUIRED", needsVerification: true, detail: "You must verify your ID before accepting jobs. Go to Profile → Trust & Credentials." });
      }

      if (!isDemo && helper.stripeAccountStatus !== "active") {
        return res.status(403).json({ message: "STRIPE_CONNECT_REQUIRED", detail: "You must complete payment setup before accepting jobs." });
      }

      const userTierIdx = TIER_ORDER.indexOf(helper.tier);

      if (job.category === "Verify & Inspect") {
        const allSTs = await storage.getCatalogServiceTypes();
        const matchedST = allSTs.find(st => st.name === job.catalogServiceTypeName);
        if (matchedST) {
          const reqTierIdx = TIER_ORDER.indexOf(matchedST.minTier || "community");
          if (userTierIdx < reqTierIdx) {
            return res.status(403).json({ message: `Requires ${matchedST.minTier} tier or higher` });
          }
          if (matchedST.credentialRequired && !helper.credentialVerified) {
            return res.status(403).json({ message: "This service requires verified credentials" });
          }
        }
      }

      if (job.category === "Skilled Labor") {
        const sts = await storage.getServiceTypesByCategory("Skilled Labor");
        const st = sts.find(s => s.name === job.serviceType);
        const requiredTier = st?.minTier || "verified";
        const reqTierIdx = TIER_ORDER.indexOf(requiredTier);

        if (userTierIdx < reqTierIdx) {
          return res.status(403).json({ message: `Requires ${requiredTier} tier or higher` });
        }
        if (st?.requiresCredential && !helper.credentialVerified) {
          return res.status(403).json({ message: "This service requires verified credentials" });
        }
        if (helper.backgroundCheckStatus === "flagged" && helper.backgroundCheckRestrictions) {
          const restrictions = helper.backgroundCheckRestrictions as string[];
          if (restrictions.includes("Skilled Labor") || (job.serviceType && restrictions.includes(job.serviceType))) {
            return res.status(403).json({ message: "Your background check restricts this category. Contact support for details." });
          }
        }
      }

      const { availableFrom, availableTo } = req.body;
      if (!availableFrom || !availableTo) {
        return res.status(400).json({ message: "Availability window required. Please provide availableFrom and availableTo." });
      }
      const fromDate = new Date(availableFrom);
      const toDate = new Date(availableTo);
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return res.status(400).json({ message: "Invalid date format for availability window" });
      }
      if (toDate <= fromDate) {
        return res.status(400).json({ message: "availableTo must be after availableFrom" });
      }
      if (fromDate < new Date()) {
        return res.status(400).json({ message: "Availability window must be in the future" });
      }

      if (job.urgentSwitch || job.category === "On-Demand Help") {
        const now = new Date();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        if (fromDate > endOfToday) {
          return res.status(400).json({ message: "Urgent/on-demand jobs require same-day availability. Your availability window must start today." });
        }
      }

      const updated = await storage.updateJob(jobId, {
        status: "accepted_pending_payment",
        assignedHelperId: req.session.userId!,
        autoIncreaseEnabled: false,
        nextIncreaseAt: null,
      });

      await storage.updateUser(helper.id, {
        jobsAccepted: ((helper as any).jobsAccepted || 0) + 1,
      } as any);

      const waiverAccepted = req.body.waiverAccepted === true;
      const categoryWaiverAccepted = req.body.categoryWaiverAccepted === true;
      await storage.createAssignment({
        jobId,
        helperId: req.session.userId!,
        offerRate: job.budget,
        status: "pending",
        acceptedAt: new Date(),
        jobWaiverAcceptedAt: waiverAccepted ? new Date() : null,
        categoryWaiverAcceptedAt: categoryWaiverAccepted ? new Date() : null,
        workerAvailableFrom: fromDate,
        workerAvailableTo: toDate,
      });

      const availWindow = `Available: ${fromDate.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} – ${toDate.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
      await notify(job.postedById, {
        title: "Helper Applied",
        body: `${helper.fullName} wants to accept your job "${job.title}". ${availWindow}. Confirm to lock the job.`,
        jobId,
        priority: "high",
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs/:id/lock", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId) return res.status(403).json({ message: "Only the poster can lock the job" });
      if (job.status !== "accepted_pending_payment") return res.status(400).json({ message: "Job must be in accepted/pending payment status" });
      if (!job.assignedHelperId) return res.status(400).json({ message: "No helper assigned" });

      const poster = await storage.getUser(req.session.userId!);
      if (!poster) return res.status(401).json({ message: "User not found" });

      const { confirmedStartTime } = req.body;
      if (confirmedStartTime) {
        const confirmDate = new Date(confirmedStartTime);
        if (isNaN(confirmDate.getTime())) {
          return res.status(400).json({ message: "Invalid confirmedStartTime format" });
        }
        const jobAssignments = await storage.getAssignmentsByJob(jobId);
        const activeAssignment = jobAssignments.find(a => a.helperId === job.assignedHelperId);
        if (activeAssignment?.workerAvailableFrom && activeAssignment?.workerAvailableTo) {
          const from = new Date(activeAssignment.workerAvailableFrom);
          const to = new Date(activeAssignment.workerAvailableTo);
          if (confirmDate < from || confirmDate > to) {
            return res.status(400).json({ message: `Confirmed start time must be within the worker's availability window (${from.toLocaleString()} – ${to.toLocaleString()})` });
          }
        }
        if (activeAssignment) {
          await storage.updateAssignment(activeAssignment.id, { confirmedStartTime: confirmDate } as any);
        }
      }

      const budget = job.budget ?? 0;
      const urgentFee = job.urgentFee ?? 0;
      const totalCharge = budget + urgentFee;

      const isAdmin = poster.role === "admin";
      if (job.category === "Barter Labor" || budget <= 0 || isAdmin) {
        const updated = await storage.updateJob(jobId, { status: "funded", lockedAt: new Date() });
        const timeMsg = confirmedStartTime ? ` Start time: ${new Date(confirmedStartTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` : "";
        await notify(job.assignedHelperId!, {
          title: "Job Funded!",
          body: `You've been confirmed for "${job.title}".${timeMsg} Job details and address are now available.`,
          jobId,
          priority: "high",
        });
        return res.json({ locked: true, job: updated });
      }

      const helper = await storage.getUser(job.assignedHelperId);
      const helperName = helper?.fullName || "your helper";
      const helperStripeAccountId = (helper as any)?.stripeAccountId;
      const helperStripeStatus = (helper as any)?.stripeAccountStatus;

      if (!helperStripeAccountId || helperStripeStatus !== "active") {
        return res.status(400).json({ message: "Worker payment setup incomplete. Cannot process payment." });
      }

      const host = req.get("host") || "localhost:5000";
      const protocol = req.get("x-forwarded-proto") || "http";
      const baseUrl = `${protocol}://${host}`;

      const feeConfig = await getActiveFeeConfig();

      // Worker receives (1 - platformFeeRate) × budget (default 80% of the job budget amount)
      // urgentFee and Stripe processing fee are separate; they do not reduce the worker's share
      const workerShare = job.helperPayout ?? Math.round(budget * (1 - feeConfig.platformFeeRate) * 100) / 100;
      const workerShareCents = Math.round(workerShare * 100);

      // Poster pays: budget + urgentFee + Stripe processing fee (grossed-up to cover Stripe's cut)
      const { gross: grossCharge, stripeFee } = grossUpForStripe(totalCharge);
      const grossChargeCents = Math.round(grossCharge * 100);

      // application_fee_amount = grossCharge − workerShare (neutral pass-through model)
      //   GUBER keeps: (platformFeeRate × budget) + urgentFee + Stripe processing fee
      //   Worker receives: workerShareCents exactly (80% of job budget)
      //   Stripe processing is a neutral pass-through: collected from poster, paid to Stripe by platform
      const applicationFeeCents = grossChargeCents - workerShareCents;

      const lineItems: any[] = [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `GUBER: ${job.title}`,
              description: `Payment held securely by Stripe until job is confirmed complete · ${helperName} receives $${workerShare.toFixed(2)}`,
            },
            unit_amount: Math.round(budget * 100),
          },
          quantity: 1,
        },
      ];

      if (urgentFee > 0) {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: { name: "Urgent Boost Fee", description: "Priority visibility surcharge" },
            unit_amount: Math.round(urgentFee * 100),
          },
          quantity: 1,
        });
      }

      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: "Payment Processing Fee",
            description: "Stripe card processing (2.9% + 30¢) — passed through at cost",
          },
          unit_amount: Math.round(stripeFee * 100),
        },
        quantity: 1,
      });

      const stripeSession = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        customer_email: poster.email || undefined,
        line_items: lineItems,
        mode: "payment",
        payment_intent_data: {
          capture_method: "manual",
          application_fee_amount: applicationFeeCents,
          description: `GUBER Job Funding | Job #${jobId} | Public Job`,
          transfer_data: {
            destination: helperStripeAccountId,
          },
          metadata: {
            guber_job_id: String(jobId),
            hirer_user_id: String(req.session.userId),
            worker_user_id: String(job.assignedHelperId),
            flow_type: "public_job",
            payment_reason: "job_funding",
            created_at: new Date().toISOString(),
            pricingMode: (job as any).pricingMode || "standard",
            feeProfile: (job as any).feeProfile || "standard",
          },
        },
        success_url: `${baseUrl}/jobs/${jobId}?lock_session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/jobs/${jobId}`,
        metadata: { guber_job_id: String(jobId), hirer_user_id: String(req.session.userId), flow_type: "public_job", type: "job_lock", created_at: new Date().toISOString() },
      });

      await storage.updateJob(jobId, {
        stripeSessionId: stripeSession.id,
        platformFeeRate: feeConfig.platformFeeRate,
        workerGrossShare: workerShare,
        posterProcessingFee: stripeFee,
      } as any);
      res.json({ checkoutUrl: stripeSession.url, jobId, grossCharge, stripeFee });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs/:id/need-more-time", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId) return res.status(403).json({ message: "Only the hirer can send this" });
      if (job.status !== "accepted_pending_payment") return res.status(400).json({ message: "Job must be in accepted/pending payment status" });
      if (!job.assignedHelperId) return res.status(400).json({ message: "No helper assigned" });

      const jobAssignments = await storage.getAssignmentsByJob(jobId);
      const activeAssignment = jobAssignments.find(a => a.helperId === job.assignedHelperId);
      if (activeAssignment?.needMoreTimeSentAt) {
        const lastSent = new Date(activeAssignment.needMoreTimeSentAt);
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (lastSent > hourAgo) {
          return res.status(429).json({ message: "You've already notified the worker. Please wait before sending again." });
        }
      }

      if (activeAssignment) {
        await storage.updateAssignment(activeAssignment.id, { needMoreTimeSentAt: new Date() } as any);
      }

      await notify(job.assignedHelperId, {
        title: "Hirer is preparing",
        body: `The hirer is preparing for your arrival and will respond with an exact time shortly. Please be patient.`,
        jobId,
        priority: "normal",
      });

      res.json({ sent: true, message: "Worker has been notified" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs/:id/confirm-lock-payment", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ message: "sessionId required" });

      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
      const isPaid = stripeSession.payment_status === "paid" || stripeSession.status === "complete";
      if (!isPaid) return res.status(400).json({ message: "Payment not completed" });
      if (stripeSession.metadata?.type !== "job_lock") return res.status(400).json({ message: "Invalid session type" });
      const metaJobId = stripeSession.metadata?.guber_job_id || stripeSession.metadata?.jobId;
      if (metaJobId !== String(jobId)) return res.status(400).json({ message: "Session job mismatch" });

      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.status === "funded") return res.json(job);

      let chargeId: string | null = null;
      const paymentIntentId = stripeSession.payment_intent as string;
      if (paymentIntentId) {
        try {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          chargeId = (pi.latest_charge as string) || null;
        } catch (e) {
          console.error("[GUBER] Failed to retrieve charge ID:", e);
        }
      }

      // isPaid = true signals authorized/funded (for job visibility); chargedAt set only at capture
      const updated = await storage.updateJob(jobId, {
        status: "funded",
        lockedAt: new Date(),
        isPaid: true,
        stripePaymentIntentId: paymentIntentId,
        stripeChargeId: chargeId,
      } as any);

      if (job.assignedHelperId) {
        let timeMsg = "";
        const jobAssignments = await storage.getAssignmentsByJob(jobId);
        const activeAssignment = jobAssignments.find(a => a.helperId === job.assignedHelperId);
        if (activeAssignment?.confirmedStartTime) {
          timeMsg = ` Start time: ${new Date(activeAssignment.confirmedStartTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`;
        }
        await notify(job.assignedHelperId, {
          title: "Job Locked! 💰",
          body: `Payment confirmed! You're locked in for "${job.title}".${timeMsg} Address and details are now available.`,
          jobId,
          priority: "high",
        });
        await notify(job.postedById, {
          title: "Payment Confirmed",
          body: `Your job "${job.title}" is now locked. Your helper has been notified.`,
          jobId,
          priority: "high",
        });
      }

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs/:id/start-work", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.assignedHelperId !== req.session.userId) return res.status(403).json({ message: "Not assigned" });
      if (job.status !== "funded") return res.status(400).json({ message: "Job must be funded first" });

      await storage.updateJob(jobId, { status: "active" });

      const asgns = await storage.getAssignmentsByJob(jobId);
      const myAsgn = asgns.find(a => a.helperId === req.session.userId);
      if (myAsgn) {
        await storage.createTimesheet({ assignmentId: myAsgn.id, clockIn: new Date() });
      }

      await notify(job.postedById, {
        title: "Work Started",
        body: `Your helper has started working on "${job.title}"`,
        jobId,
        priority: "high",
      });

      res.json({ message: "Work started" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs/:id/milestone", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.assignedHelperId !== req.session.userId) return res.status(403).json({ message: "Not assigned" });

      const { statusType, gpsLat, gpsLng, cancelReason, cancelStage, cancelNotes, note } = req.body;
      const now = new Date();

      if (!["on_the_way", "arrived", "cancelled"].includes(statusType)) {
        return res.status(400).json({ message: "Invalid milestone type" });
      }

      await storage.createJobStatusLog({
        jobId,
        userId: req.session.userId!,
        statusType,
        gpsLat: gpsLat || null,
        gpsLng: gpsLng || null,
        note: note || null,
        cancelReason: cancelReason || null,
        cancelStage: cancelStage || null,
      });

      if (statusType === "on_the_way") {
        await storage.updateJob(jobId, {
          helperStage: "on_the_way",
          onTheWayAt: now,
          status: job.status === "funded" ? "active" : job.status,
        });

        await notify(job.postedById, {
          title: "Helper On The Way 🚗",
          body: `Your helper is on the way for "${job.title}"`,
          jobId,
        });

        const navLat = job.lat;
        const navLng = job.lng;
        const navAddress = job.location?.trim() ? encodeURIComponent(job.location.trim()) : null;
        const navDest = navAddress || (navLat && navLng ? `${navLat},${navLng}` : null);
        const mapsUrl = navDest
          ? `https://www.google.com/maps/dir/?api=1&destination=${navDest}`
          : null;
        const wazeUrl = navLat && navLng
          ? `waze://?ll=${navLat},${navLng}&navigate=yes`
          : null;

        res.json({ message: "On the way logged", navigationUrls: { google: mapsUrl, waze: wazeUrl } });

      } else if (statusType === "arrived") {
        await storage.updateJob(jobId, {
          helperStage: "arrived",
          arrivedAt: now,
        });

        await notify(job.postedById, {
          title: "Helper Arrived 📍",
          body: `Your helper has arrived for "${job.title}"`,
          jobId,
        });

        res.json({ message: "Arrival logged" });

      } else if (statusType === "cancelled") {
        if (!cancelReason) return res.status(400).json({ message: "Cancel reason is required" });

        const stage = job.helperStage
          ? (job.helperStage === "on_the_way" ? "en_route" : "after_arrived")
          : "before_start";

        await storage.updateJob(jobId, {
          status: "posted_public",
          helperStage: null,
          assignedHelperId: null,
          lockedAt: null,
          onTheWayAt: null,
          arrivedAt: null,
          cancelReason,
          cancelStage: stage,
          cancelNotes: cancelNotes || null,
        });

        await notify(job.postedById, {
          title: "Helper Cancelled",
          body: `Your helper cancelled "${job.title}". Reason: ${cancelReason}. Job is available again.`,
          jobId,
        });

        await storage.computeAndUpdateReliability(req.session.userId!);
        await storage.maybeUnderReview(req.session.userId!);

        res.json({ message: "Cancellation logged, job re-opened" });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/jobs/:id/milestones", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId && job.assignedHelperId !== req.session.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const logs = await storage.getJobStatusLogs(jobId);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs/:id/submit-proof", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.assignedHelperId !== req.session.userId) return res.status(403).json({ message: "Not assigned" });
      if (!["funded", "active", "in_progress"].includes(job.status)) {
        return res.status(400).json({ message: "Job must be funded, active, or in progress to submit proof" });
      }

      const proof = await storage.createProofSubmission({
        jobId,
        submittedBy: req.session.userId!,
        checklistItemId: req.body.checklistItemId || null,
        imageUrls: req.body.imageUrls || null,
        videoUrl: req.body.videoUrl || null,
        notes: req.body.notes || null,
        gpsLat: req.body.gpsLat || null,
        gpsLng: req.body.gpsLng || null,
        gpsTimestamp: req.body.gpsTimestamp ? new Date(req.body.gpsTimestamp) : null,
        notEncountered: req.body.notEncountered || false,
        notEncounteredReason: req.body.notEncounteredReason || null,
      });

      const proofUpdate: any = { proofStatus: req.body.notEncountered ? "not_encountered" : "submitted" };
      if (!req.body.notEncountered) {
        proofUpdate.status = "proof_submitted";
      }
      await storage.updateJob(jobId, proofUpdate);

      const proofHelper = await storage.getUser(req.session.userId!);
      if (proofHelper && !req.body.notEncountered) {
        const photoCount = Array.isArray(req.body.imageUrls) ? req.body.imageUrls.length : 0;
        const hasGps = !!(req.body.gpsLat && req.body.gpsLng);
        const resumeUpdate: any = {
          proofReportsSubmitted: ((proofHelper as any).proofReportsSubmitted || 0) + 1,
        };
        if (photoCount > 0) resumeUpdate.photosSubmitted = ((proofHelper as any).photosSubmitted || 0) + photoCount;
        if (hasGps) resumeUpdate.gpsVerifiedJobs = ((proofHelper as any).gpsVerifiedJobs || 0) + 1;
        const updatedHelper = { ...proofHelper, ...resumeUpdate };
        const pc = computeProofConfidence(updatedHelper);
        resumeUpdate.proofConfidenceScore = pc.score;
        resumeUpdate.proofConfidenceLevel = pc.level;
        await storage.updateUser(proofHelper.id, resumeUpdate);
      }

      await notify(job.postedById, {
        title: req.body.notEncountered ? "Report Submitted" : "Proof Submitted ✅",
        body: `Helper submitted ${req.body.notEncountered ? "a not-encountered report" : "proof"} for "${job.title}". Tap to review and confirm.`,
        jobId,
        priority: "high",
      });

      res.json(proof);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/jobs/:id/proof", requireAuth, async (req: Request, res: Response) => {
    const jobId = parseInt(req.params.id);
    const proofs = await storage.getProofsByJob(jobId);
    res.json(proofs);
  });

  app.get("/api/jobs/:id/proof-template", requireAuth, async (req: Request, res: Response) => {
    const jobId = parseInt(req.params.id);
    const job = await storage.getJob(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (!job.proofTemplateId) return res.json(null);
    const pt = await storage.getProofTemplate(job.proofTemplateId);
    if (!pt) return res.json(null);
    const items = await storage.getProofChecklistItems(pt.id);
    res.json({ ...pt, checklistItems: items });
  });

  app.post("/api/jobs/:id/confirm", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      if (!["in_progress", "active", "funded", "completion_submitted"].includes(job.status)) {
        return res.status(400).json({ message: "Job must be active, in progress, or completion submitted to confirm" });
      }

      const isBuyer = job.postedById === req.session.userId;
      const isHelper = job.assignedHelperId === req.session.userId;
      if (!isBuyer && !isHelper) return res.status(403).json({ message: "Not authorized" });

      // Idempotency — if already confirmed, return current state immediately
      if (isBuyer && job.buyerConfirmed) return res.json(job);
      if (isHelper && job.helperConfirmed) return res.json(job);

      // GPS gate: helper must have physically checked in ("I've Arrived") before confirming
      if (isHelper && !(job as any).arrivedAt) {
        return res.status(400).json({
          message: "You must tap 'I've Arrived' at the job location before confirming completion.",
          code: "GPS_REQUIRED",
        });
      }

      if (job.proofRequired && isHelper) {
        const proofs = await storage.getProofsByJob(jobId);
        if (proofs.length === 0) {
          return res.status(400).json({ message: "Proof submission required before confirming completion" });
        }
      }

      const update: any = {};
      if (isBuyer) update.buyerConfirmed = true;
      if (isHelper) update.helperConfirmed = true;

      const newBuyerConfirmed = isBuyer ? true : job.buyerConfirmed;
      const newHelperConfirmed = isHelper ? true : job.helperConfirmed;

      // Track which side confirmed and when
      if (isBuyer) update.confirmedAt = new Date();

      if (isHelper && !newBuyerConfirmed) {
        update.status = "completion_submitted";
        update.completedAt = new Date();
        update.helperConfirmed = true;

        const feeConfig = await getActiveFeeConfig();
        const reviewTimerDate = new Date();
        reviewTimerDate.setHours(reviewTimerDate.getHours() + feeConfig.reviewTimerHours);
        update.reviewTimerStartedAt = new Date();
        update.autoConfirmAt = reviewTimerDate;
        update.payoutStatus = "review_pending";

        await notify(job.postedById, {
          title: "Job Marked Complete — Review Now",
          body: `Your worker marked "${job.title}" done. Review and confirm within ${feeConfig.reviewTimerHours}h or it auto-confirms.`,
          jobId,
        });
      }

      // Server-side guard: buyer cannot trigger the payout block until the worker has
      // confirmed completion. The UI enforces this too, but we protect the backend directly.
      if (isBuyer && !newHelperConfirmed) {
        // Buyer confirmed before worker — save the flag but do NOT trigger payout yet.
        // Notify the worker so they know the poster is waiting.
        const updatedEarly = await storage.updateJob(jobId, { buyerConfirmed: true } as any);
        if (job.assignedHelperId) {
          await notify(job.assignedHelperId, {
            title: "Poster Confirmed Early",
            body: `The poster already confirmed "${job.title}". Tap to confirm your side and release payment.`,
            jobId,
          });
        }
        return res.json(updatedEarly);
      }

      if (newBuyerConfirmed && newHelperConfirmed) {
        update.status = "completed_paid";
        update.confirmedAt = new Date();
        if (!update.completedAt && !job.completedAt) update.completedAt = new Date();

        const proofs = await storage.getProofsByJob(jobId);
        const hasProof = proofs.length > 0;
        const hasDispute = !!(job as any).disputeReason;

        if (hasProof && !hasDispute) {
          update.payoutStatus = "payout_eligible";
        } else if (!hasProof && job.proofRequired) {
          update.payoutStatus = "proof_missing";
        } else {
          update.payoutStatus = "payout_eligible";
        }

        if (job.assignedHelperId) {
          const helper = await storage.getUser(job.assignedHelperId);
          if (helper) {
            const resumeFields: any = {
              jobsCompleted: (helper.jobsCompleted || 0) + 1,
              trustScore: adjustTrustScore(
                helper.trustScore || 50,
                TRUST_ADJUSTMENTS.JOB_COMPLETED_WITH_PROOF + TRUST_ADJUSTMENTS.POSTER_CONFIRMED
              ),
              jobsConfirmed: ((helper as any).jobsConfirmed || 0) + 1,
            };
            const catField = categorizeCategoryExperience(job);
            if (catField) {
              resumeFields[catField] = ((helper as any)[catField] || 0) + 1;
            }
            const updatedForCalc = { ...helper, ...resumeFields };
            resumeFields.reliabilityScore = computeReliability(updatedForCalc);
            const pc = computeProofConfidence(updatedForCalc);
            resumeFields.proofConfidenceScore = pc.score;
            resumeFields.proofConfidenceLevel = pc.level;
            await storage.updateUser(helper.id, resumeFields);
          }

          const workerShare = (job as any).workerGrossShare || job.helperPayout || 0;

          // Capture the PaymentIntent — funds move from poster's card into GUBER's Stripe account.
          // We then transfer the worker's share to their Stripe Connect account immediately.
          // Idempotency: skip if already paid_out or capture_expired.
          const piId = (job as any).stripePaymentIntentId;
          const currentPayoutStatus = (job as any).payoutStatus;
          if (piId && currentPayoutStatus !== "paid_out" && currentPayoutStatus !== "capture_expired") {
            try {
              const captured = await stripe.paymentIntents.capture(piId);
              const capturedAmount = (captured.amount_received || captured.amount || 0) / 100;
              update.payoutStatus = "paid_out";
              update.chargedAt = new Date();
              console.log(`[GUBER][capture] jobId=${job.id} paymentIntentId=${piId} captured=success amount=$${capturedAmount}`);

              const platformFee = (job as any).platformFeeRate ? capturedAmount * (job as any).platformFeeRate : capturedAmount - workerShare;
              await storage.createMoneyLedgerEntry({
                jobId: job.id,
                userIdOwner: job.postedById,
                userIdCounterparty: job.assignedHelperId,
                ledgerType: "job_payment_captured",
                amount: -capturedAmount,
                sourceSystem: "stripe",
                sourceReferenceId: piId,
                stripeObjectType: "payment_intent",
                stripeObjectId: piId,
                description: `Payment captured for job #${job.id}: ${job.title}`,
              });
              await storage.createMoneyLedgerEntry({
                jobId: job.id,
                userIdOwner: job.assignedHelperId,
                userIdCounterparty: job.postedById,
                ledgerType: "job_earning",
                amount: workerShare,
                sourceSystem: "stripe",
                sourceReferenceId: piId,
                stripeObjectType: "payment_intent",
                stripeObjectId: piId,
                description: `Earning for job #${job.id}: ${job.title}`,
              });
              await storage.createMoneyLedgerEntry({
                jobId: job.id,
                userIdOwner: null,
                ledgerType: "platform_fee",
                amount: platformFee,
                sourceSystem: "stripe",
                sourceReferenceId: piId,
                stripeObjectType: "payment_intent",
                stripeObjectId: piId,
                description: `Platform fee for job #${job.id}: ${job.title}`,
              });

              // Create wallet transaction as "available" — the money is confirmed captured.
              // We'll immediately attempt the Stripe transfer; if the worker has no Connect
              // account yet, the "available" status lets them claim via the wallet page.
              const walletTxn = await storage.createWalletTransaction({
                userId: job.assignedHelperId!,
                jobId: job.id,
                type: "earning",
                amount: workerShare,
                status: "available",
                description: `Payment released via Stripe for "${job.title}"`,
              });

              // Immediately attempt to transfer to worker's Stripe Connect account.
              const workerForPayout = await storage.getUser(job.assignedHelperId!);
              const workerAccountId = (workerForPayout as any)?.stripeAccountId;
              const workerAccountStatus = (workerForPayout as any)?.stripeAccountStatus;
              if (workerAccountId && workerAccountStatus === "active" && workerShare > 0) {
                try {
                  const transfer = await stripe.transfers.create({
                    amount: Math.round(workerShare * 100),
                    currency: "usd",
                    destination: workerAccountId,
                    transfer_group: `job_${job.id}`,
                    description: `GUBER payout: ${job.title}`,
                    metadata: { jobId: String(job.id), userId: String(job.assignedHelperId) },
                  });
                  await storage.updateWalletTransaction(walletTxn.id, {
                    stripeTransferId: transfer.id,
                    description: `Payout sent: $${workerShare.toFixed(2)} for "${job.title}"`,
                  } as any);
                  await storage.updateJob(job.id, { stripeTransferId: transfer.id, paidOutAt: new Date() } as any);
                  console.log(`[GUBER][transfer] jobId=${job.id} transfer=${transfer.id} amount=$${workerShare}`);
                } catch (transferErr: any) {
                  // Transfer failed (e.g. Stripe balance not yet settled) — leave as "available"
                  // so the worker can claim via the wallet page once balance settles.
                  console.error(`[GUBER][transfer] jobId=${job.id} transfer failed: ${transferErr.message}`);
                }
              }
              // If no Connect account: stays "available" → wallet shows "Claim Now" once they set up
            } catch (captureErr: any) {
              if (captureErr.code === "charge_expired_for_capture") {
                console.error(`[GUBER][capture] jobId=${job.id} EXPIRED — 7-day authorization lapsed. Admin attention needed.`);
                update.payoutStatus = "capture_expired";
                await notify(job.postedById, {
                  title: "Payment Hold Expired",
                  body: `The payment hold for "${job.title}" has expired. Please contact support to resolve.`,
                  jobId: job.id,
                });
              } else {
                console.error(`[GUBER][capture] jobId=${job.id} paymentIntentId=${piId} error: ${captureErr.message}`);
                // Leave as payout_eligible so admin or worker can retry
                if (workerShare > 0) {
                  await storage.createWalletTransaction({
                    userId: job.assignedHelperId!,
                    jobId: job.id,
                    type: "earning",
                    amount: workerShare,
                    status: "pending",
                    description: `Earnings for "${job.title}" — capture failed, awaiting resolution`,
                  });
                }
              }
            }
          } else if (!piId && workerShare > 0) {
            // No Stripe PI (e.g. barter/cash jobs) — record as available for manual payout
            await storage.createWalletTransaction({
              userId: job.assignedHelperId!,
              jobId: job.id,
              type: "earning",
              amount: workerShare,
              status: "available",
              description: `Earnings for "${job.title}" — ready to claim`,
            });
          }

          if (workerShare > 0) {
            const transferMade = !!(update as any).stripeTransferId || !!(job as any).stripeTransferId;
            await notify(job.assignedHelperId!, {
              title: "Payment Released! 💸",
              body: transferMade
                ? `$${workerShare.toFixed(2)} has been sent to your Stripe account for "${job.title}". Expect it in your bank within 2–7 business days.`
                : `$${workerShare.toFixed(2)} is ready in your GUBER wallet for "${job.title}". Set up your payout account to transfer to your bank.`,
              priority: "high",
            }, "/wallet");
          }

          try {
            const walletTxns = await storage.getWalletByUser(job.assignedHelperId!);
            const totalEarned = walletTxns.filter(t => t.type === "earning" && t.status === "completed").reduce((sum, t) => sum + t.amount, 0);
            if (totalEarned >= 1000) {
              const bgCheck = await storage.getBackgroundCheckEligibility(job.assignedHelperId!);
              if (!bgCheck) {
                await storage.createBackgroundCheckEligibility({
                  userId: job.assignedHelperId!,
                  eligibilitySource: "revenue_milestone",
                  thresholdAmount: 1000,
                  unlockedAt: new Date(),
                  notificationSentAt: new Date(),
                });
                await notify(job.assignedHelperId!, {
                  title: "Background Check Available",
                  body: "You've reached a milestone on GUBER. A voluntary background check is now available to enhance your profile credibility.",
                  type: "system",
                });
              }
            }
          } catch (bgErr: any) {
            console.error(`[GUBER][bg-check] Error checking eligibility for user ${job.assignedHelperId}: ${bgErr.message}`);
          }
        }
      } else if (isHelper && !newBuyerConfirmed) {
        // already handled above
      } else {
        const feeConfig = await getActiveFeeConfig();
        const autoConfirmDate = new Date();
        autoConfirmDate.setHours(autoConfirmDate.getHours() + feeConfig.reviewTimerHours);
        update.autoConfirmAt = autoConfirmDate;
        update.reviewTimerStartedAt = new Date();
      }

      const updated = await storage.updateJob(jobId, update);

      const notifyUserId = isBuyer ? job.assignedHelperId : job.postedById;
      if (notifyUserId) {
        await notify(notifyUserId, {
          title: newBuyerConfirmed && newHelperConfirmed ? "Job Completed! 🎉" : "Completion Confirmed",
          body: `${isBuyer ? "Poster" : "Helper"} confirmed completion of "${job.title}"`,
          jobId,
          priority: "high",
        });
      }

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs/:id/dispute", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const { reason, notes } = req.body;
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      const isBuyer = job.postedById === req.session.userId;
      const isHelper = job.assignedHelperId === req.session.userId;
      if (!isBuyer && !isHelper) return res.status(403).json({ message: "Not authorized" });

      const disputeStatuses = ["funded", "active", "in_progress", "completion_submitted", "completed_paid"];
      if (!disputeStatuses.includes(job.status)) {
        return res.status(400).json({ message: "Cannot dispute job in current status" });
      }

      const updated = await storage.updateJob(jobId, {
        status: "disputed",
        disputeReason: reason || "Dispute opened",
        disputeNotes: notes || null,
        payoutStatus: "dispute_locked",
      } as any);

      try {
        await db.insert(guberDisputes).values({
          jobId,
          openedByUserId: req.session.userId!,
          reasonCode: reason || "general_dispute",
          description: reason || "Dispute opened",
          filedByRole: isBuyer ? "hirer" : "worker",
          againstUserId: isBuyer ? job.assignedHelperId : job.postedById,
          status: "open",
          openedAt: new Date(),
        } as any);
      } catch (disputeInsertErr: any) {
        console.error(`[dispute] Failed to insert guber_disputes row for job ${jobId}:`, disputeInsertErr.message);
      }

      const buyer = await storage.getUser(job.postedById);
      if (buyer) {
        await storage.updateUser(buyer.id, { jobsDisputed: (buyer.jobsDisputed || 0) + 1 });
      }

      if (job.assignedHelperId) {
        await storage.createNotification({
          userId: job.assignedHelperId,
          title: "Dispute Opened",
          body: `A dispute has been opened on "${job.title}". Payout is locked until resolved.`,
          type: "job",
          jobId,
        });
      }

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "dispute_opened",
        details: `Dispute opened on job ${jobId}: ${reason || "No reason provided"}`,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs/:id/reject-proof", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const { feedback } = req.body;
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId) return res.status(403).json({ message: "Only the poster can reject proof" });
      if (job.status !== "proof_submitted") return res.status(400).json({ message: "Job is not in proof_submitted state" });

      const updated = await storage.updateJob(jobId, {
        status: "in_progress",
        proofStatus: "rejected",
      });

      if (job.assignedHelperId) {
        await notify(job.assignedHelperId, {
          title: "Proof Not Accepted",
          body: feedback
            ? `Poster feedback on "${job.title}": "${feedback}". Please resubmit or request admin review.`
            : `The poster wasn't satisfied with your proof for "${job.title}". Please resubmit.`,
          jobId,
          priority: "high",
        });
      }

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "proof_rejected",
        details: `Poster rejected proof for job ${jobId}. Feedback: ${feedback || "none"}`,
      });

      if (job.assignedHelperId) {
        const helperForTrust = await storage.getUser(job.assignedHelperId);
        if (helperForTrust) {
          await storage.updateUser(helperForTrust.id, {
            trustScore: adjustTrustScore(helperForTrust.trustScore ?? 50, TRUST_ADJUSTMENTS.PROOF_REJECTED),
          });
        }
      }

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });



  app.post("/api/jobs/:id/cancel", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const { note, reasonCode } = req.body;
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId) return res.status(403).json({ message: "Only the poster can cancel" });
      if (["completion_submitted", "completed_paid", "cancelled", "expired", "disputed"].includes(job.status)) {
        return res.status(400).json({ message: "Cannot cancel job in current status" });
      }

      const isFunded = ["funded", "active", "in_progress"].includes(job.status);
      const HIRER_REASON_CODES = ["changed_mind", "found_someone_else", "no_longer_needed", "scheduling_conflict", "budget_issue", "other"];
      if (isFunded && !reasonCode) {
        return res.status(400).json({ message: "reasonCode required for funded job cancellation" });
      }
      if (reasonCode && !HIRER_REASON_CODES.includes(reasonCode)) {
        return res.status(400).json({ message: `Invalid reasonCode. Must be one of: ${HIRER_REASON_CODES.join(", ")}` });
      }

      const now = new Date();
      const graceEndsAt = job.graceEndsAt ?? now;
      const hasHelper = !!job.assignedHelperId;
      const poster = await storage.getUser(req.session.userId!);
      const posterIsOG = poster?.day1OG === true;

      const cancelStatus = hasHelper ? "canceled_by_hirer" : "cancelled";
      await storage.updateJob(jobId, { status: cancelStatus, cancelReason: reasonCode || "hirer_cancel" });

      await storage.createJobStatusLog({
        jobId,
        userId: req.session.userId!,
        statusType: "cancelled_by_poster",
        note: note || null,
      });

      let refundPolicy: string;
      let feeForfeitureApplied = false;
      let stripeFeeAmount = 0;
      if (!hasHelper && now >= graceEndsAt) {
        refundPolicy = "FULL_REFUND";
      } else if (!hasHelper && now < graceEndsAt) {
        refundPolicy = posterIsOG ? "FULL_REFUND" : "EARLY_EXIT_FEE";
      } else {
        refundPolicy = posterIsOG ? "OG_CANCEL_PROTECTION" : "ACCEPTED_CANCEL_RULES";
        if (!posterIsOG && isFunded) {
          feeForfeitureApplied = true;
          stripeFeeAmount = (job as any).posterProcessingFee || 0;
        }
      }

      await storage.createCancellationLogEntry({
        jobId,
        canceledByUserId: req.session.userId!,
        canceledByRole: "hirer",
        cancelReasonCode: reasonCode || "hirer_cancel",
        freeText: note || null,
        feeForfeitureApplied,
        stripeFeeLossAmount: stripeFeeAmount,
        refundAmount: isFunded ? (job.budget || 0) : 0,
      });

      if (hasHelper && job.assignedHelperId) {
        await notify(job.assignedHelperId, {
          title: "Job Cancelled",
          body: `Job "${job.title}" has been cancelled by the poster.`,
          jobId,
        });
      }

      res.json({ message: "Job cancelled", refundPolicy, canceledBy: "hirer" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs/:id/cancel/poster", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const { note, reasonCode } = req.body;
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId) return res.status(403).json({ message: "Only the poster can cancel" });
      if (["completion_submitted", "completed_paid", "cancelled", "canceled_by_hirer", "expired", "disputed"].includes(job.status)) {
        return res.status(400).json({ message: "Cannot cancel job in current status" });
      }

      const isFunded = ["funded", "active", "in_progress"].includes(job.status);
      const now = new Date();
      const graceEndsAt = job.graceEndsAt ?? now;
      const hasHelper = !!job.assignedHelperId;

      const cancelStatus = hasHelper ? "canceled_by_hirer" : "cancelled";
      await storage.updateJob(jobId, { status: cancelStatus, cancelReason: reasonCode || "hirer_cancel" });
      await storage.createJobStatusLog({ jobId, userId: req.session.userId!, statusType: "cancelled_by_poster", note: note || null });

      let refundPolicy: string;
      let feeForfeitureApplied = false;
      if (!hasHelper && now >= graceEndsAt) {
        refundPolicy = "FULL_REFUND";
      } else if (!hasHelper && now < graceEndsAt) {
        refundPolicy = "EARLY_EXIT_FEE";
      } else {
        refundPolicy = "ACCEPTED_CANCEL_RULES";
        if (isFunded) feeForfeitureApplied = true;
      }

      await storage.createCancellationLogEntry({
        jobId,
        canceledByUserId: req.session.userId!,
        canceledByRole: "hirer",
        cancelReasonCode: reasonCode || "hirer_cancel",
        freeText: note || null,
        feeForfeitureApplied,
        refundAmount: isFunded ? (job.budget || 0) : 0,
      });

      if (hasHelper && job.assignedHelperId) {
        await notify(job.assignedHelperId, {
          title: "Job Cancelled",
          body: `Job "${job.title}" has been cancelled by the poster.`,
          jobId,
        });
        const posterUser = await storage.getUser(req.session.userId!);
        if (posterUser) {
          await storage.updateUser(posterUser.id, {
            posterCancelCount: (posterUser.posterCancelCount || 0) + 1,
          });
        }
      }

      res.json({ message: "Job cancelled", refundPolicy, canceledBy: "hirer" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs/:id/boost", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const { newBudget } = req.body;
      if (!newBudget || typeof newBudget !== "number" || !Number.isFinite(newBudget) || newBudget <= 0 || newBudget > 100000) {
        return res.status(400).json({ message: "Invalid budget amount" });
      }

      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId) return res.status(403).json({ message: "Only the poster can boost this job" });
      if (!["posted_public", "accepted_pending_payment"].includes(job.status)) {
        return res.status(400).json({ message: "Can only boost open or pending jobs that haven't been accepted yet" });
      }
      if (job.assignedHelperId) {
        return res.status(400).json({ message: "Cannot boost a job that already has a helper assigned" });
      }
      if (job.budget && newBudget <= job.budget) {
        return res.status(400).json({ message: "New budget must be higher than current budget" });
      }

      const updated = await storage.updateJob(jobId, {
        budget: newBudget,
        isBoosted: true,
        boostedAt: new Date(),
        boostSuggested: false,
        suggestedBudget: null,
      });

      await storage.createJobStatusLog({
        jobId,
        userId: req.session.userId!,
        statusType: "boosted",
        note: `Reward boosted from $${job.budget} to $${newBudget}`,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs/:id/cancel/helper", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const { cancelReason, note, gpsLat, gpsLng } = req.body;
      if (!cancelReason) return res.status(400).json({ message: "Cancel reason is required" });

      const WORKER_REASON_CODES = ["emergency", "scheduling_conflict", "unsafe_conditions", "unable_to_complete", "incorrect_job_details", "other"];
      if (!WORKER_REASON_CODES.includes(cancelReason)) {
        return res.status(400).json({ message: `Invalid cancelReason. Must be one of: ${WORKER_REASON_CODES.join(", ")}` });
      }

      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.assignedHelperId !== req.session.userId) return res.status(403).json({ message: "Only the assigned helper can cancel" });
      if (job.status === "disputed") return res.status(400).json({ message: "Cannot cancel a disputed job" });
      if (["completion_submitted", "completed_paid", "cancelled", "canceled_by_hirer", "expired"].includes(job.status)) {
        return res.status(400).json({ message: "Cannot cancel job in current status" });
      }

      const now = new Date();
      const isFundedJob = ["funded", "active", "in_progress"].includes(job.status);
      const stage = job.helperStage
        ? (job.helperStage === "on_the_way" ? "en_route" : "after_arrived")
        : "before_start";

      // Funded jobs: use canceled_by_worker (terminal for this assignment) + issue refund
      // Pre-funded (accepted_pending_payment): re-open so another worker can take it
      const stillValid = job.expiresAt ? now < new Date(job.expiresAt) : true;
      const newStatus = isFundedJob ? "canceled_by_worker" : (stillValid ? "posted_public" : "expired");

      const jobUpdate: any = {
        status: newStatus,
        assignedHelperId: null,
        helperStage: null,
        lockedAt: null,
        onTheWayAt: null,
        arrivedAt: null,
        cancelReason,
        cancelStage: stage,
        cancelNotes: note || null,
      };

      let refundIssued = false;
      if (isFundedJob && job.stripePaymentIntentId) {
        try {
          const refund = await stripe.refunds.create({
            payment_intent: job.stripePaymentIntentId,
            reason: "requested_by_customer",
            metadata: {
              guber_job_id: String(jobId),
              canceled_by: "worker",
              cancel_reason: cancelReason,
            },
          });
          jobUpdate.refundedAt = new Date();
          jobUpdate.refundAmount = job.budget || 0;
          jobUpdate.payoutStatus = "refunded";
          refundIssued = true;
          console.log(`[GUBER] Worker cancel refund issued for job #${jobId}: refund ${refund.id}`);

          await storage.createMoneyLedgerEntry({
            jobId,
            userIdOwner: job.postedById,
            userIdCounterparty: req.session.userId,
            ledgerType: "worker_cancel_refund",
            amount: job.budget || 0,
            sourceSystem: "stripe",
            description: `Worker cancelled funded job #${jobId} — full refund to hirer. Reason: ${cancelReason}`,
          });
        } catch (refundErr: any) {
          console.error(`[GUBER] Worker cancel refund failed for job #${jobId}:`, refundErr.message);
        }
      }

      await storage.updateJob(jobId, jobUpdate);

      await storage.createJobStatusLog({
        jobId,
        userId: req.session.userId!,
        statusType: "cancelled_by_worker",
        cancelReason,
        note: note || null,
        gpsLat: gpsLat ?? null,
        gpsLng: gpsLng ?? null,
      });

      await storage.createCancellationLogEntry({
        jobId,
        canceledByUserId: req.session.userId!,
        canceledByRole: "worker",
        cancelReasonCode: cancelReason,
        freeText: note || null,
        feeForfeitureApplied: false,
      });

      if (isFundedJob) {
        await notify(job.postedById, {
          title: "Helper Cancelled — Refund Issued ⚠️",
          body: `Your helper cancelled "${job.title}" after funding. Reason: ${cancelReason}. ${refundIssued ? "A full refund has been issued." : "Please contact support regarding your refund."}`,
          type: "job",
          jobId,
        });
      } else {
        await notify(job.postedById, {
          title: "Helper Cancelled ⚠️",
          body: `Your helper cancelled "${job.title}". Reason: ${cancelReason}. Job is available again.`,
          type: "job",
          jobId,
        });
      }

      await storage.computeAndUpdateReliability(req.session.userId!);
      await storage.maybeUnderReview(req.session.userId!);

      // Trust penalty for abandoning a job (especially funded ones)
      const helperUser = await storage.getUser(req.session.userId!);
      if (helperUser) {
        await storage.updateUser(helperUser.id, {
          trustScore: adjustTrustScore(helperUser.trustScore ?? 50, TRUST_ADJUSTMENTS.JOB_ABANDONED),
        });
      }

      res.json({
        message: isFundedJob ? "Cancellation logged, refund issued to hirer" : "Cancellation logged, job re-opened",
        canceledBy: "worker",
        status: newStatus,
        refundIssued,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // STRIPE - DAY-1 OG
  app.post("/api/stripe/og-checkout", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "User not found" });
      if (user.day1OG) return res.status(400).json({ message: "Already a Day-1 OG" });

      const host = req.get("host") || "localhost:5000";
      const protocol = req.get("x-forwarded-proto") || "http";
      const baseUrl = `${protocol}://${host}`;

      const stripeSession = await stripeMain.checkout.sessions.create({
        payment_method_types: ["card"],
        customer_email: user.email,
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: "GUBER Day-1 OG Lifetime Pass", description: "Permanent Day-1 OG status. Perk: free urgent toggle on all jobs." },
            unit_amount: 199,
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${baseUrl}/og-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/profile`,
        metadata: { userId: String(user.id), userEmail: user.email, type: "day1og" },
      });

      res.json({ checkoutUrl: stripeSession.url });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/stripe/confirm-og", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ message: "Missing sessionId" });
      const stripeSession = await stripeMain.checkout.sessions.retrieve(sessionId);

      if (stripeSession.payment_status === "paid" && stripeSession.metadata?.type === "day1og") {
        const userId = parseInt(stripeSession.metadata.userId);

        const existing = await storage.getUser(userId);
        await storage.updateUser(userId, {
          day1OG: true,
          aiOrNotCredits: (existing?.aiOrNotCredits || 0) + (existing?.day1OG ? 0 : 5),
          aiOrNotUnlimitedText: true,
        });

        if (!existing?.day1OG) {
          await storage.createNotification({
            userId,
            title: "Day-1 OG Activated!",
            body: "You are now a Day-1 OG! Perks: free urgent toggle, 15% service fee, 5 AI or Not credits, unlimited text verification.",
            type: "system",
          });
          if (existing?.email) {
            try {
              const { Resend } = await import("resend");
              const resend = new Resend(process.env.RESEND_API_KEY);
              const fromDomain = process.env.RESEND_FROM_DOMAIN || "guberapp.app";
              await resend.emails.send({
                from: `GUBER <noreply@${fromDomain}>`,
                to: existing.email,
                subject: "You're officially a GUBER Day-1 OG 🔥",
                html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#000;color:#fff;border-radius:16px;">
  <h1 style="font-size:22px;font-weight:900;letter-spacing:-0.5px;margin-bottom:8px;">Welcome to the OG circle, ${existing.fullName?.split(" ")[0] || "friend"}.</h1>
  <p style="color:#aaa;font-size:14px;margin-bottom:24px;">Your Day-1 OG status is now active on GUBER.</p>
  <div style="background:#111;border-radius:12px;padding:20px;margin-bottom:24px;">
    <p style="font-size:13px;color:#22c55e;font-weight:700;margin:0 0 12px;">YOUR PERKS</p>
    <ul style="font-size:13px;color:#eee;padding-left:16px;margin:0;line-height:2;">
      <li>15% platform fee on every job (vs 20% standard)</li>
      <li>Free urgent toggle on every post, forever</li>
      <li>5 AI or Not credits to start</li>
      <li>Unlimited text verification</li>
    </ul>
  </div>
  <a href="https://guberapp.app/dashboard" style="display:inline-block;background:#22c55e;color:#000;font-weight:800;font-size:13px;letter-spacing:0.1em;text-transform:uppercase;text-decoration:none;padding:14px 28px;border-radius:10px;">Open GUBER</a>
  <p style="font-size:11px;color:#555;margin-top:24px;">This is a no-reply message. Questions? Visit guberapp.app.</p>
</div>`,
              });
            } catch (emailErr: any) {
              console.error("[GUBER] OG activation email failed:", emailErr.message);
            }
          }
        }

        const user = await storage.getUser(userId);
        // Restore session so user is logged in after Stripe redirect (session may have expired)
        req.session.userId = userId;
        await new Promise<void>((resolve) => req.session.save(() => resolve()));
        res.json(sanitizeUser(user!));
      } else {
        res.status(400).json({ message: "Payment not completed" });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // TRUST BOX - $4.99 AI or Not premium access
  app.post("/api/stripe/trust-box-checkout", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "User not found" });
      if (user.trustBoxPurchased && user.trustBoxSubscriptionId) {
        return res.status(400).json({ message: "Trust Box subscription already active" });
      }

      const host = req.get("host") || "localhost:5000";
      const protocol = req.get("x-forwarded-proto") || "http";
      const baseUrl = `${protocol}://${host}`;

      const TRUST_BOX_PRICE_ID = "price_1T1ToIRAzmUydsE3myv4vG3Z";

      const stripeSession = await stripeMain.checkout.sessions.create({
        payment_method_types: ["card"],
        customer_email: user.email,
        line_items: [{ price: TRUST_BOX_PRICE_ID, quantity: 1 }],
        mode: "subscription",
        success_url: `${baseUrl}/ai-or-not?trustbox=success`,
        cancel_url: `${baseUrl}/ai-or-not`,
        subscription_data: {
          metadata: { userId: String(user.id), userEmail: user.email, type: "trust_box" },
        },
        metadata: { userId: String(user.id), userEmail: user.email, type: "trust_box" },
      });

      res.json({ checkoutUrl: stripeSession.url });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // CORS-accessible checkout — used when the AI-or-Not iframe calls directly
  // (cross-origin, so session cookie is blocked). Authenticated via HMAC sig.
  const AI_OR_NOT_ORIGIN = "https://ai-or-not-1.replit.app";
  const embedCors = (req: Request, res: Response) => {
    const origin = req.get("origin") || "";
    if (origin === AI_OR_NOT_ORIGIN) {
      res.setHeader("Access-Control-Allow-Origin", AI_OR_NOT_ORIGIN);
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Credentials", "false");
    }
  };

  app.options("/api/stripe/trust-box-checkout-embed", (req: Request, res: Response) => {
    embedCors(req, res);
    res.sendStatus(204);
  });

  app.post("/api/stripe/trust-box-checkout-embed", async (req: Request, res: Response) => {
    embedCors(req, res);
    try {
      const { uid, sig, returnUrl } = req.body;
      if (!uid || !sig) return res.status(400).json({ message: "uid and sig required" });

      const secret = process.env.GUBER_SHARED_SECRET;
      if (!secret) return res.status(503).json({ message: "Not configured" });

      const user = await storage.getUser(parseInt(String(uid), 10));
      if (!user) return res.status(404).json({ message: "User not found" });

      const isOG  = user.day1OG ? "1" : "0";
      const trustBox = (user as any).trustBoxPurchased ? "1" : "0";
      const credits = String((user as any).aiOrNotCredits ?? 0);
      const payload = `${uid}${isOG}${trustBox}${credits}`;
      const expected = createHmac("sha256", secret).update(payload).digest("hex");
      if (sig !== expected) return res.status(403).json({ message: "Invalid signature" });

      if ((user as any).trustBoxPurchased && user.trustBoxSubscriptionId) {
        return res.status(400).json({ message: "Trust Box subscription already active" });
      }

      const baseUrl = returnUrl || "https://guberapp.app";
      const TRUST_BOX_PRICE_ID_LOCAL = "price_1T1ToIRAzmUydsE3myv4vG3Z";

      const stripeSession = await stripeMain.checkout.sessions.create({
        payment_method_types: ["card"],
        customer_email: user.email,
        line_items: [{ price: TRUST_BOX_PRICE_ID_LOCAL, quantity: 1 }],
        mode: "subscription",
        success_url: `${baseUrl}/ai-or-not?trustbox=success`,
        cancel_url: `${baseUrl}/ai-or-not`,
        subscription_data: {
          metadata: { userId: String(user.id), userEmail: user.email, type: "trust_box" },
        },
        metadata: { userId: String(user.id), userEmail: user.email, type: "trust_box" },
      });

      res.json({ checkoutUrl: stripeSession.url });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/stripe/cancel-trust-box", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "User not found" });
      if (!user.trustBoxSubscriptionId) return res.status(400).json({ message: "No active Trust Box subscription" });

      await stripeMain.subscriptions.cancel(user.trustBoxSubscriptionId);
      await storage.updateUser(user.id, { trustBoxPurchased: false, trustBoxSubscriptionId: null });
      await storage.createAuditLog({ userId: user.id, action: "trust_box_cancelled", details: `Trust Box subscription cancelled by user. Sub: ${user.trustBoxSubscriptionId}` });
      res.json({ message: "Trust Box subscription cancelled" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/stripe/confirm-trust-box", requireAuth, async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.body;
      const stripeSession = await stripeMain.checkout.sessions.retrieve(sessionId);

      const isTrustBox = stripeSession.metadata?.type === "trust_box";
      const isPaidOrActive = stripeSession.payment_status === "paid" || stripeSession.status === "complete";
      if (isTrustBox && isPaidOrActive) {
        const userId = parseInt(stripeSession.metadata!.userId);
        if (userId !== req.session.userId) return res.status(403).json({ message: "Session mismatch" });

        const existing = await storage.getUser(userId);
        const subscriptionId = stripeSession.subscription as string | undefined;
        if (!existing?.trustBoxPurchased) {
          await storage.updateUser(userId, {
            trustBoxPurchased: true,
            ...(subscriptionId ? { trustBoxSubscriptionId: subscriptionId } : {}),
          });
          await storage.createNotification({
            userId,
            title: "Trust Box Active!",
            body: "Your AI or Not premium subscription is live. $4.99/month.",
            type: "system",
          });
        }

        const user = await storage.getUser(userId);
        res.json(sanitizeUser(user!));
      } else {
        res.status(400).json({ message: "Subscription not completed" });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // WALLET
  app.get("/api/wallet", requireAuth, async (req: Request, res: Response) => {
    const txns = await storage.getWalletByUser(req.session.userId!);
    res.json(txns);
  });

  // Jobs where the caller is the poster, has paid/authorized, helper confirmed, but buyer hasn't confirmed yet
  app.get("/api/wallet/pending-confirms", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const rows = await db
        .select()
        .from(jobsTable)
        .where(
          and(
            eq(jobsTable.postedById, userId),
            eq(jobsTable.isPaid, true),
            eq(jobsTable.helperConfirmed, true),
            eq(jobsTable.buyerConfirmed, false)
          )
        )
        .orderBy(desc(jobsTable.createdAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // CATEGORIES
  app.get("/api/categories", async (_req: Request, res: Response) => {
    const cats = await storage.getCategories();
    res.json(cats);
  });

  // JOB CHECKLISTS
  app.get("/api/checklist-options", async (req: Request, res: Response) => {
    try {
      const category = req.query.category as string;
      const serviceTypeName = req.query.serviceTypeName as string | undefined;
      if (!category) return res.status(400).json({ message: "Category required" });
      const options = await storage.getJobChecklists(category, serviceTypeName);
      res.json(options);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/job-checklists", requireAdmin, async (req: Request, res: Response) => {
    try {
      const item = await storage.createJobChecklist(req.body);
      res.status(201).json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/job-checklists/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const item = await storage.updateJobChecklist(parseInt(req.params.id), req.body);
      if (!item) return res.status(404).json({ message: "Not found" });
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/job-checklists/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteJobChecklist(parseInt(req.params.id));
      res.sendStatus(204);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // NOTIFICATIONS
  app.get("/api/notifications", requireAuth, async (req: Request, res: Response) => {
    const notifs = await storage.getNotificationsByUser(req.session.userId!);
    res.json(notifs);
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req: Request, res: Response) => {
    await storage.markNotificationRead(parseInt(req.params.id));
    res.json({ message: "Marked as read" });
  });

  app.post("/api/notifications/read-all", requireAuth, async (req: Request, res: Response) => {
    await storage.markAllNotificationsRead(req.session.userId!);
    res.json({ message: "All marked as read" });
  });

  // REVIEWS
  app.post("/api/reviews", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const { jobId, revieweeId, rating, comment, tags } = req.body;

      const job = await storage.getJob(jobId);
      if (!job || !["completion_submitted", "completed_paid"].includes(job.status)) {
        return res.status(400).json({ message: "Can only review completed jobs" });
      }

      const isBuyer = job.postedById === req.session.userId;
      const isHelper = job.assignedHelperId === req.session.userId;
      if (!isBuyer && !isHelper) return res.status(403).json({ message: "Not authorized" });

      // Enforce one review per reviewer per job
      const existingReviews = await storage.getReviewsByJob(jobId);
      const alreadyReviewed = existingReviews.some(r => r.reviewerId === req.session.userId);
      if (alreadyReviewed) {
        return res.status(409).json({ message: "You have already submitted a review for this job." });
      }

      let filteredComment = comment;
      if (comment) {
        const check = filterContactInfo(comment);
        if (check.blocked) {
          filteredComment = check.clean;
          await storage.createAuditLog({ userId: req.session.userId, action: "contact_info_blocked_review", details: "Contact info blocked in review comment" });
        }
      }

      const review = await storage.createReview({
        jobId,
        reviewerId: req.session.userId!,
        revieweeId,
        rating,
        comment: filteredComment,
        tags: tags || null,
      });

      const reviewee = await storage.getUser(revieweeId);
      if (reviewee) {
        const allReviews = await storage.getReviewsByUser(revieweeId);
        const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
        const ratingUpdates: Partial<User> = {
          rating: Math.round(avgRating * 10) / 10,
          reviewCount: allReviews.length,
        };
        const isRevieweeHelper = reviewee.id === job.assignedHelperId;
        if (isRevieweeHelper) {
          const trustDelta = rating >= 4 ? TRUST_ADJUSTMENTS.POSITIVE_RATING : rating <= 2 ? -TRUST_ADJUSTMENTS.POSITIVE_RATING : 0;
          if (trustDelta !== 0) ratingUpdates.trustScore = adjustTrustScore(reviewee.trustScore ?? 50, trustDelta);
        }
        await storage.updateUser(revieweeId, ratingUpdates);
      }

      res.status(201).json(review);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/reviews/user/:id", requireAuth, async (req: Request, res: Response) => {
    const revs = await storage.getReviewsByUser(parseInt(req.params.id));
    const sanitized = revs.map(r => ({
      ...r,
      comment: r.comment ? filterContactInfo(r.comment).clean : r.comment
    }));
    res.json(sanitized);
  });

  // ADMIN
  app.get("/api/admin/users", requireAdmin, async (_req: Request, res: Response) => {
    const allUsers = await storage.getAllUsers();
    res.json(allUsers.map(u => {
      const safe = sanitizeUser(u);
      // Strip email/phone from admin view too if it's supposed to be "ALL user profile API responses"
      // Wait, admin might need to see it. But "Strip email/phone from ALL user profile API responses"
      // is pretty broad. I'll stick to the public/self ones first. 
      // Actually, if I want to be safe and follow "ALL", I should do it here too.
      return safe;
    }));
  });

  app.get("/api/admin/jobs", requireAdmin, async (_req: Request, res: Response) => {
    const allJobs = await storage.getJobs(false);
    res.json(allJobs);
  });

  app.post("/api/admin/jobs/:id/remove", requireAdmin, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job ID" });
      const { reason } = req.body;
      await storage.adminRemoveJob(jobId, reason || "Removed by admin");
      res.json({ success: true });
    } catch (err) {
      console.error("Admin remove job error:", err);
      res.status(500).json({ error: "Failed to remove job" });
    }
  });

  // Sync Stripe OG payments → activate any users who paid but weren't activated
  app.post("/api/admin/sync-stripe-og", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      const activated: string[] = [];
      const alreadyActive: string[] = [];
      const preapproved: string[] = [];
      const emailMismatch: string[] = [];
      let totalScanned = 0;

      // Step 1: Paginate through ALL Stripe checkout sessions to build a complete paid-OG email set
      const paidOgEmails = new Set<string>();
      let hasMore = true;
      let startingAfter: string | undefined;
      while (hasMore) {
        const page: any = await stripeMain.checkout.sessions.list({
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });
        for (const session of page.data) {
          totalScanned++;
          if (session.metadata?.type !== "day1og" || session.payment_status !== "paid") continue;
          // Collect every email variant we can find for this payment
          const emails = [
            session.metadata?.userEmail,
            session.customer_email,
            session.customer_details?.email,
          ].filter(Boolean).map((e: string) => e.toLowerCase().trim());
          emails.forEach(e => paidOgEmails.add(e));
        }
        hasMore = page.has_more;
        if (hasMore && page.data.length > 0) {
          startingAfter = page.data[page.data.length - 1].id;
        } else {
          hasMore = false;
        }
      }

      // Step 2: For every email found in Stripe, find matching GUBER user and activate them
      const guberEmailMap = new Map(allUsers.filter(u => u.email).map(u => [u.email!.toLowerCase().trim(), u]));
      for (const email of paidOgEmails) {
        const user = guberEmailMap.get(email);
        if (!user) {
          // Not in GUBER yet — save as preapproved so they auto-activate on signup/login
          await db.execute(sql`INSERT INTO og_preapproved_emails (email) VALUES (${email}) ON CONFLICT DO NOTHING`);
          preapproved.push(email);
          continue;
        }
        if (user.day1OG) {
          alreadyActive.push(email);
          continue;
        }
        // Activate them
        await storage.updateUser(user.id, { day1OG: true, aiOrNotCredits: (user.aiOrNotCredits || 0) + 5, aiOrNotUnlimitedText: true });
        await storage.createAuditLog({ userId: user.id, action: "day1og_activated", details: `Day-1 OG activated via admin Stripe sync.` });
        await storage.createNotification({ userId: user.id, title: "Day-1 OG Activated!", body: "Your Day-1 OG status is now active. Perks: free urgent toggle, 15% service fee, 5 AI or Not credits, unlimited text verification.", type: "system" });
        await db.execute(sql`INSERT INTO og_preapproved_emails (email) VALUES (${email}) ON CONFLICT DO NOTHING`);
        activated.push(email);
      }

      // Step 3: Also check every registered non-OG user directly by email against Stripe
      // (catches cases where Stripe stored a different email than what we scraped from sessions)
      const nonOgUsers = allUsers.filter(u => !u.day1OG && u.email && !activated.includes(u.email.toLowerCase().trim()));
      const BATCH = 5;
      for (let i = 0; i < nonOgUsers.length; i += BATCH) {
        const batch = nonOgUsers.slice(i, i + BATCH);
        await Promise.all(batch.map(async (user) => {
          const { isOG } = await checkStripeForOGStatus(user.email!);
          if (!isOG) return;
          const normalEmail = user.email!.toLowerCase().trim();
          if (activated.includes(normalEmail)) return;
          await storage.updateUser(user.id, { day1OG: true, aiOrNotCredits: (user.aiOrNotCredits || 0) + 5, aiOrNotUnlimitedText: true });
          await storage.createAuditLog({ userId: user.id, action: "day1og_activated", details: `Day-1 OG activated via admin Stripe direct-check sync.` });
          await storage.createNotification({ userId: user.id, title: "Day-1 OG Activated!", body: "Your Day-1 OG status is now active.", type: "system" });
          await db.execute(sql`INSERT INTO og_preapproved_emails (email) VALUES (${normalEmail}) ON CONFLICT DO NOTHING`);
          activated.push(normalEmail);
          // Note any Stripe email that differs from GUBER email
          if (!paidOgEmails.has(normalEmail)) emailMismatch.push(user.email!);
        }));
      }

      // Collect already-active (exclude newly activated)
      allUsers.filter(u => u.day1OG && u.email && !activated.includes(u.email.toLowerCase().trim()))
        .forEach(u => alreadyActive.includes(u.email!) || alreadyActive.push(u.email!));

      res.json({ activated, alreadyActive, preapproved, emailMismatch, totalScanned, totalOgInStripe: paidOgEmails.size });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/sync-stripe-trustbox", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      const activated: string[] = [];
      const alreadyActive: string[] = [];
      const preapproved: string[] = [];
      let totalScanned = 0;

      // Check every non-Trust-Box GUBER user against Stripe
      const nonTbUsers = allUsers.filter(u => !(u as any).trustBoxPurchased && u.email);
      const BATCH = 5;
      for (let i = 0; i < nonTbUsers.length; i += BATCH) {
        const batch = nonTbUsers.slice(i, i + BATCH);
        await Promise.all(batch.map(async (user) => {
          const { hasTrustBox } = await checkStripeForOGStatus(user.email!);
          totalScanned++;
          if (!hasTrustBox) return;
          await storage.updateUser(user.id, { trustBoxPurchased: true } as any);
          await storage.createNotification({ userId: user.id, title: "Trust Box Activated!", body: "Your AI or Not premium access is now active.", type: "system" });
          await db.execute(sql`INSERT INTO trust_box_preapproved_emails (email) VALUES (${user.email!.toLowerCase()}) ON CONFLICT DO NOTHING`);
          activated.push(user.email!);
        }));
      }

      allUsers.filter(u => (u as any).trustBoxPurchased && u.email).forEach(u => alreadyActive.push(u.email!));

      // Scan recent Stripe subscriptions for unknown emails → save as preapproved
      const subs = await stripeMain.subscriptions.list({ status: "active", limit: 100 });
      for (const sub of subs.data) {
        const hasTb = sub.items.data.some(i => i.price.id === TRUST_BOX_PRICE_ID);
        if (!hasTb) continue;
        totalScanned++;
        const customer = typeof sub.customer === "string"
          ? await stripeMain.customers.retrieve(sub.customer)
          : sub.customer;
        const email = ("email" in customer ? (customer as any).email : null)?.toLowerCase().trim();
        if (!email) continue;
        const inGuber = allUsers.some(u => u.email?.toLowerCase().trim() === email);
        if (!inGuber) {
          await db.execute(sql`INSERT INTO trust_box_preapproved_emails (email) VALUES (${email}) ON CONFLICT DO NOTHING`);
          preapproved.push(email);
        }
      }

      res.json({ activated, alreadyActive, preapproved, totalScanned });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Admin: reset any user's password by email
  app.post("/api/admin/reset-user-password", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { email, newPassword } = req.body;
      if (!email || !newPassword) return res.status(400).json({ message: "email and newPassword required" });
      if (newPassword.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });
      const allUsers = await storage.getAllUsers();
      const target = allUsers.find(u => u.email?.toLowerCase().trim() === email.toLowerCase().trim());
      if (!target) return res.status(404).json({ message: "User not found" });
      const hashed = await hashPassword(newPassword);
      await storage.updateUser(target.id, { password: hashed });
      await storage.createAuditLog({ userId: target.id, action: "password_reset_by_admin", details: `Password reset by admin for ${email}` });

      // Email the user their new password
      try {
        if (process.env.RESEND_API_KEY) {
          const { Resend } = await import("resend");
          const resend = new Resend(process.env.RESEND_API_KEY);
          const fromDomain = process.env.RESEND_FROM_DOMAIN || "guberapp.app";
          await resend.emails.send({
            from: `GUBER <noreply@${fromDomain}>`,
            to: target.email!,
            subject: "Your GUBER Password Has Been Reset",
            html: `<div style="background:#000;color:#fff;font-family:sans-serif;padding:32px;max-width:480px;margin:0 auto;border-radius:12px;">
              <h2 style="color:#22C55E;font-size:28px;margin:0 0 8px;">GUBER</h2>
              <p style="color:#aaa;margin:0 0 24px;">Your account password has been reset by an admin.</p>
              <div style="background:#111;border:1px solid #222;border-radius:8px;padding:20px;margin-bottom:24px;">
                <p style="margin:0 0 8px;color:#aaa;font-size:13px;">EMAIL</p>
                <p style="margin:0 0 16px;color:#fff;font-size:15px;">${target.email}</p>
                <p style="margin:0 0 8px;color:#aaa;font-size:13px;">NEW PASSWORD</p>
                <p style="margin:0;color:#22C55E;font-size:18px;font-weight:bold;letter-spacing:1px;">${newPassword}</p>
              </div>
              <p style="color:#aaa;font-size:12px;">Log in at <a href="https://guberapp.app/login" style="color:#22C55E;">guberapp.app</a> and change your password once you're in.</p>
            </div>`,
          });
          console.log(`[GUBER] Password reset email sent to ${target.email}`);
        }
      } catch (emailErr: any) {
        console.error("[GUBER] Password reset email error:", emailErr.message);
      }

      res.json({ message: `Password reset for ${email} — notification email sent.` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Manually grant OG by email (admin override for edge cases)
  app.post("/api/admin/grant-og", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email required" });

      // Always add to preapproved list (covers future signups too)
      await db.execute(sql`INSERT INTO og_preapproved_emails (email) VALUES (${email.toLowerCase().trim()}) ON CONFLICT DO NOTHING`);

      const allUsers = await storage.getAllUsers();
      const user = allUsers.find(u => u.email?.toLowerCase().trim() === email.toLowerCase().trim());
      if (!user) return res.json({ message: "Email saved to OG preapproval list. OG will activate when they sign up or log in." });

      if (user.day1OG) return res.json({ message: "Already OG", user: sanitizeUser(user) });

      await storage.updateUser(user.id, {
        day1OG: true,
        aiOrNotCredits: (user.aiOrNotCredits || 0) + 5,
        aiOrNotUnlimitedText: true,
        trustScore: adjustTrustScore(user.trustScore ?? 50, TRUST_ADJUSTMENTS.OG_STARTING_BONUS),
      });
      await storage.createAuditLog({
        userId: user.id,
        action: "day1og_activated",
        details: `Day-1 OG manually granted by admin for email: ${email}`,
      });
      await notify(user.id, {
        title: "Day-1 OG Activated! 🔥",
        body: "Your Day-1 OG status is now active. Perks: free urgent toggle, 15% service fee, 5 AI or Not credits, unlimited text verification.",
        type: "system",
      }, "/profile");

      const updated = await storage.getUser(user.id);
      res.json({ message: "OG granted", user: sanitizeUser(updated!) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/grant-trust-box", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email required" });

      const allUsers = await storage.getAllUsers();
      const user = allUsers.find(u => u.email?.toLowerCase().trim() === email.toLowerCase().trim());
      if (!user) {
        const preapproved = await db.execute(sql`SELECT email FROM trust_box_preapproved_emails WHERE LOWER(email) = LOWER(${email.trim()})`);
        if (preapproved.rows.length === 0) {
          await db.execute(sql`INSERT INTO trust_box_preapproved_emails (email) VALUES (${email.trim().toLowerCase()}) ON CONFLICT (email) DO NOTHING`);
        }
        return res.json({ message: "User not found in GUBER yet — email added to pre-approval list. Will auto-activate on signup." });
      }

      if (user.trustBoxPurchased) {
        if (!user.aiOrNotUnlimitedText || (user.aiOrNotCredits || 0) < 5) {
          await storage.updateUser(user.id, {
            aiOrNotCredits: Math.max(user.aiOrNotCredits || 0, 5),
            aiOrNotUnlimitedText: true,
          });
        }
        const updated = await storage.getUser(user.id);
        return res.json({ message: "Already has Trust Box — AI credits ensured", user: sanitizeUser(updated!) });
      }

      await storage.updateUser(user.id, {
        trustBoxPurchased: true,
        aiOrNotCredits: (user.aiOrNotCredits || 0) + 5,
        aiOrNotUnlimitedText: true,
      });
      await storage.createAuditLog({
        userId: user.id,
        action: "trust_box_granted",
        details: `Trust Box manually granted by admin for email: ${email}`,
      });
      await notify(user.id, {
        title: "Trust Box Activated! 🔐",
        body: "Your AI or Not premium access has been activated. Enjoy unlimited detections and text analysis.",
        type: "system",
      }, "/profile");

      const updated = await storage.getUser(user.id);
      res.json({ message: "Trust Box granted", user: sanitizeUser(updated!) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/revoke-trust-box", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email required" });

      const allUsers = await storage.getAllUsers();
      const user = allUsers.find(u => u.email?.toLowerCase().trim() === email.toLowerCase().trim());
      if (!user) return res.status(404).json({ message: "User not found" });

      if (user.trustBoxSubscriptionId) {
        try {
          await stripeMain.subscriptions.cancel(user.trustBoxSubscriptionId);
        } catch {}
      }

      await storage.updateUser(user.id, { trustBoxPurchased: false, trustBoxSubscriptionId: null });
      await storage.createAuditLog({
        userId: user.id,
        action: "trust_box_revoked",
        details: `Trust Box revoked by admin for email: ${email}`,
      });

      const updated = await storage.getUser(user.id);
      res.json({ message: "Trust Box revoked", user: sanitizeUser(updated!) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/trust-box-preapproved", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`SELECT email, created_at FROM trust_box_preapproved_emails ORDER BY created_at DESC`);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/trust-box-preapproved", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email required" });
      await db.execute(sql`INSERT INTO trust_box_preapproved_emails (email) VALUES (${email.trim().toLowerCase()}) ON CONFLICT (email) DO NOTHING`);
      res.json({ message: "Email added to Trust Box pre-approval list" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/trust-box-preapproved/:email", requireAdmin, async (req: Request, res: Response) => {
    try {
      const email = decodeURIComponent(req.params.email);
      await db.execute(sql`DELETE FROM trust_box_preapproved_emails WHERE LOWER(email) = LOWER(${email})`);
      res.json({ message: "Email removed from Trust Box pre-approval list" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const adminAllowed = ["role", "tier", "trustScore", "day1OG", "aiOrNotCredits", "aiOrNotUnlimitedText",
                          "isAvailable", "fullName", "email", "username",
                          "suspended", "banned", "idVerified", "selfieVerified", "credentialVerified", "profileComplete",
                          "backgroundCheckStatus", "backgroundCheckRestrictions"];
    const data: Record<string, any> = {};
    for (const key of adminAllowed) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    const user = await storage.updateUser(id, data);
    if (!user) return res.status(404).json({ message: "User not found" });

    // If admin is granting OG status, apply the 5 AI credits immediately
    // (don't wait for next server boot's seed sync)
    let finalUser = user;
    if (data.day1OG === true && user && (!user.aiOrNotCredits || user.aiOrNotCredits < 5)) {
      finalUser = (await storage.updateUser(id, { aiOrNotCredits: 5 })) ?? user;
    }

    await storage.createAuditLog({
      userId: req.session.userId,
      action: "admin_user_update",
      details: `Admin updated user ${id}: ${JSON.stringify(data)}`,
    });

    res.json(sanitizeUser(finalUser));
  });

  app.post("/api/admin/users/:id/grant-business-access", requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const target = await storage.getUser(id);
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target.accountType === "business") {
      return res.status(400).json({ message: "User is already a business account" });
    }
    const updated = await storage.updateUser(id, { accountType: "pending_business" });
    await storage.createAuditLog({
      userId: req.session.userId,
      action: "admin_grant_business_access",
      details: `Admin granted pending_business access to user ${id}`,
    });
    res.json({ ok: true, user: sanitizeUser(updated!) });
  });

  app.post("/api/admin/strike", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { userId, reason, severity, jobId } = req.body;
      if (!userId || !reason) return res.status(400).json({ message: "userId and reason required" });

      const strike = await storage.createStrike({
        userId,
        reason,
        severity: severity || "standard",
        jobId: jobId || null,
        issuedBy: req.session.userId,
      });

      const user = await storage.getUser(userId);
      if (user) {
        const newStrikes = (user.strikes || 0) + 1;
        const update: any = { strikes: newStrikes };

        if (severity === "severe") {
          update.banned = true;
          update.suspended = true;
        } else if (newStrikes >= 3) {
          update.suspended = true;
        }

        await storage.updateUser(userId, update);

        await notify(userId, {
          title: severity === "severe" ? "🚫 Account Banned" : `⚠️ Strike ${newStrikes}/3`,
          body: `Reason: ${reason}. ${newStrikes >= 3 ? "Your account has been suspended." : ""}`,
          type: "alert",
        }, "/profile");
      }

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "admin_strike",
        details: `Strike issued to user ${userId}: ${reason} (${severity})`,
      });

      res.json(strike);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/strikes/:userId", requireAdmin, async (req: Request, res: Response) => {
    const strikes = await storage.getStrikesByUser(parseInt(req.params.userId));
    res.json(strikes);
  });

  app.get("/api/admin/jobs/:id/proof", requireAdmin, async (req: Request, res: Response) => {
    try {
      const proofs = await storage.getProofSubmissions(parseInt(req.params.id));
      res.json(proofs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/resolve-dispute", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { jobId, resolution, refundBuyer, notes } = req.body;
      const job = await storage.getJob(parseInt(jobId));
      if (!job) return res.status(404).json({ message: "Job not found" });

      const finalStatus = resolution === "completed" || resolution === "split" ? "completed" : "cancelled";
      const update: any = { status: finalStatus };
      if (finalStatus === "completed") {
        update.completedAt = new Date();
        update.buyerConfirmed = true;
        update.helperConfirmed = true;
      }

      await storage.updateJob(job.id, update);

      if (resolution === "split") {
        const splitAmt = job.budget ? Math.round((job.budget / 2) * 100) / 100 : 0;
        if (splitAmt > 0) {
          await storage.createWalletTransaction({
            userId: job.postedById,
            jobId: job.id,
            type: "refund",
            amount: splitAmt,
            status: "completed",
            description: `50/50 split refund for disputed job: ${job.title}`,
          });
        }
        if (job.assignedHelperId && job.helperPayout) {
          const helperSplit = Math.round((job.helperPayout / 2) * 100) / 100;
          await storage.createWalletTransaction({
            userId: job.assignedHelperId,
            jobId: job.id,
            type: "earning",
            amount: helperSplit,
            status: "available",
            description: `50/50 split payout for disputed job: ${job.title}`,
          });
        }
      } else {
        if (refundBuyer && job.budget) {
          await storage.createWalletTransaction({
            userId: job.postedById,
            jobId: job.id,
            type: "refund",
            amount: job.budget + (job.urgentFee || 0),
            status: "completed",
            description: `Refund for disputed job: ${job.title}`,
          });
        }

        if (resolution === "completed" && job.assignedHelperId && job.helperPayout) {
          await storage.createWalletTransaction({
            userId: job.assignedHelperId,
            jobId: job.id,
            type: "earning",
            amount: job.helperPayout,
            status: "available",
            description: `Payout for: ${job.title}`,
          });
        }
      }

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "admin_dispute_resolved",
        details: `Dispute on job ${jobId} resolved: ${resolution}. Notes: ${notes || "none"}`,
      });

      res.json({ message: "Dispute resolved" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ADMIN CATALOG MANAGEMENT
  app.post("/api/admin/catalog/vi-category", requireAdmin, async (req: Request, res: Response) => {
    try {
      const cat = await storage.createVICategory(req.body);
      res.json(cat);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/catalog/use-case", requireAdmin, async (req: Request, res: Response) => {
    try {
      const uc = await storage.createUseCase(req.body);
      res.json(uc);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/catalog/service-type", requireAdmin, async (req: Request, res: Response) => {
    try {
      const st = await storage.createCatalogServiceType(req.body);
      res.json(st);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/catalog/detail-option-set", requireAdmin, async (req: Request, res: Response) => {
    try {
      const dos = await storage.createDetailOptionSet(req.body);
      res.json(dos);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/catalog/proof-template", requireAdmin, async (req: Request, res: Response) => {
    try {
      const pt = await storage.createProofTemplate(req.body);
      res.json(pt);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/catalog/proof-checklist-item", requireAdmin, async (req: Request, res: Response) => {
    try {
      const pci = await storage.createProofChecklistItem(req.body);
      res.json(pci);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });


  // ── Admin Broadcast Email ───────────────────────────────────────────────
  app.post("/api/admin/broadcast-email", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { subject, htmlBody, audience } = req.body;
      if (!subject?.trim() || !htmlBody?.trim()) {
        return res.status(400).json({ message: "Subject and body are required" });
      }

      let users = await storage.getAllUsers();
      if (audience === "og") {
        users = users.filter((u: any) => u.day1OG);
      } else if (audience === "trustbox") {
        users = users.filter((u: any) => u.trustBoxPurchased);
      }

      const recipients = users
        .filter((u: any) => u.email && u.role !== "admin")
        .map((u: any) => u.email as string);

      if (recipients.length === 0) {
        return res.status(400).json({ message: "No recipients found for this audience" });
      }

      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromDomain = process.env.RESEND_FROM_DOMAIN || "guberapp.app";

      let sent = 0;
      let failed = 0;
      for (const email of recipients) {
        const { error } = await resend.emails.send({
          from: `GUBER <noreply@${fromDomain}>`,
          replyTo: undefined,
          to: email,
          subject,
          html: htmlBody,
          headers: { "X-No-Reply": "true" },
        });
        if (error) { failed++; } else { sent++; }
      }

      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "admin_broadcast_email",
        details: `Subject: "${subject}" | Audience: ${audience || "all"} | Sent: ${sent} | Failed: ${failed}`,
      });

      res.json({ sent, failed, total: recipients.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/broadcast-push", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { title, body, url, audience } = req.body || {};
      if (!title?.trim() || !body?.trim()) {
        return res.status(400).json({ message: "Title and body are required" });
      }
      const { sendPushBroadcast } = await import("./push");
      const result = await sendPushBroadcast(
        { title: title.trim(), body: body.trim(), url: url?.trim() || "/" },
        audience || "all"
      );
      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "admin_broadcast_push",
        details: `Title: "${title}" | Audience: ${audience || "all"} | Sent: ${result.sent} | Failed: ${result.failed}`,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── AI or Not entitlement sync (postMessage → backend) ─────────────────
  app.post("/api/guber-auth", requireAuth, async (req: Request, res: Response) => {
    try {
      const { uid, isOG, trustBox, credits, sig } = req.body;
      if (!uid) return res.status(400).json({ message: "uid required" });

      const sessionUserId = req.session.userId!;
      if (String(uid) !== String(sessionUserId)) {
        return res.status(403).json({ message: "uid mismatch" });
      }

      const secret = process.env.GUBER_SHARED_SECRET;
      if (secret) {
        if (!sig) return res.status(403).json({ message: "sig required" });
        const isOGVal  = (isOG === "1" || isOG === true || isOG === 1) ? "1" : "0";
        const tbVal    = (trustBox === "1" || trustBox === true || trustBox === 1) ? "1" : "0";
        const payload  = `${uid}${isOGVal}${tbVal}${credits ?? 0}`;
        const expected = createHmac("sha256", secret).update(payload).digest("hex");
        if (sig !== expected) return res.status(403).json({ message: "Invalid signature" });
      }

      const update: Record<string, any> = {};
      if (isOG === "1" || isOG === true || isOG === 1) update.day1OG = true;
      if (trustBox === "1" || trustBox === true || trustBox === 1) update.trustBoxPurchased = true;
      if (credits !== undefined) update.aiOrNotCredits = parseInt(String(credits), 10) || 0;

      if (Object.keys(update).length > 0) {
        await storage.updateUser(sessionUserId, update);
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── AI OR NOT — signed URL generator ──────────────────────────────────────
  app.get("/api/ai-or-not/signed-url", requireAuth, async (req: Request, res: Response) => {
    try {
      const secret = process.env.GUBER_SHARED_SECRET;
      if (!secret) return res.status(503).json({ error: "Not configured" });

      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ error: "User not found" });

      // ── Monthly upload quota: reset if new month ──────────────────────────
      const currentMonthYear = new Date().toISOString().slice(0, 7); // "2026-03"
      let imgUploads = (user as any).monthlyImageUploads ?? 0;
      let vidUploads = (user as any).monthlyVideoUploads ?? 0;
      if ((user as any).uploadMonthYear !== currentMonthYear) {
        await storage.updateUser(user.id, {
          monthlyImageUploads: 0,
          monthlyVideoUploads: 0,
          uploadMonthYear: currentMonthYear,
        });
        imgUploads = 0;
        vidUploads = 0;
      }

      const hasTrustBox = (user as any).trustBoxPurchased === true;
      const imgMax = hasTrustBox ? 50 : 0;
      const vidMax = hasTrustBox ? 10 : 0;

      const uid      = String(user.id);
      const isOG     = user.day1OG ? "1" : "0";
      const trustBox = hasTrustBox ? "1" : "0";
      const credits  = String((user as any).aiOrNotCredits ?? 0);
      const userName = user.fullName?.split(" ")[0] ?? "";

      const payload = `${uid}${isOG}${trustBox}${credits}${imgUploads}${imgMax}${vidUploads}${vidMax}`;
      const sig = createHmac("sha256", secret).update(payload).digest("hex");

      const params = new URLSearchParams({
        inGuber: "1", uid, isOG, trustBox, credits, userName, sig,
        imgUploads: String(imgUploads), imgMax: String(imgMax),
        vidUploads: String(vidUploads), vidMax: String(vidMax),
      });
      res.json({ url: `https://ai-or-not-1.replit.app/?${params.toString()}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── AI or Not upload tracking callback ────────────────────────────────────
  // Called by the external AI or Not service after each upload to increment quota.
  app.post("/api/ai-or-not/track-upload", async (req: Request, res: Response) => {
    try {
      const secret = process.env.GUBER_SHARED_SECRET;
      if (!secret) return res.status(503).json({ error: "Not configured" });

      const { uid, type, sig } = req.body;
      if (!uid || !type || !sig) return res.status(400).json({ error: "uid, type, sig required" });
      if (type !== "image" && type !== "video") return res.status(400).json({ error: "type must be image or video" });

      const expectedSig = createHmac("sha256", secret).update(`${uid}${type}`).digest("hex");
      if (sig !== expectedSig) return res.status(403).json({ error: "Invalid signature" });

      const userId = parseInt(uid);
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (!(user as any).trustBoxPurchased) return res.status(403).json({ error: "Trust Box required for uploads" });

      const currentMonthYear = new Date().toISOString().slice(0, 7);
      const sameMonth = (user as any).uploadMonthYear === currentMonthYear;
      const imgUploads = sameMonth ? ((user as any).monthlyImageUploads ?? 0) : 0;
      const vidUploads = sameMonth ? ((user as any).monthlyVideoUploads ?? 0) : 0;

      if (type === "image" && imgUploads >= 50) return res.status(429).json({ error: "Monthly image upload limit reached (50/month)" });
      if (type === "video" && vidUploads >= 10) return res.status(429).json({ error: "Monthly video upload limit reached (10/month)" });

      await storage.updateUser(userId, {
        monthlyImageUploads: type === "image" ? imgUploads + 1 : imgUploads,
        monthlyVideoUploads: type === "video" ? vidUploads + 1 : vidUploads,
        uploadMonthYear: currentMonthYear,
      });

      const newImg = type === "image" ? imgUploads + 1 : imgUploads;
      const newVid = type === "video" ? vidUploads + 1 : vidUploads;
      res.json({ ok: true, imgUploads: newImg, vidUploads: newVid, imgMax: 50, vidMax: 10 });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── AI or Not Game ─────────────────────────────────────────────────────
  const gameRounds = new Map<string, { imageId: string; isAI: boolean; description: string; tip: string; createdAt: number }>();
  setInterval(() => {
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [k, v] of gameRounds.entries()) { if (v.createdAt < cutoff) gameRounds.delete(k); }
  }, 5 * 60 * 1000);

  app.post("/api/ai-game/challenge", requireAuth, async (req: Request, res: Response) => {
    try {
      const { seenIds = [] } = req.body;
      const available = ALL_GAME_IMAGES.filter((img) => !seenIds.includes(img.id));
      const pool = available.length > 0 ? available : ALL_GAME_IMAGES;
      const image = pool[Math.floor(Math.random() * pool.length)];
      const roundId = randomBytes(16).toString("hex");
      gameRounds.set(roundId, { imageId: image.id, isAI: image.isAI, description: image.description, tip: image.tip, createdAt: Date.now() });
      res.json({ roundId, imageUrl: image.url, imageId: image.id, difficulty: image.difficulty });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/ai-game/guess", requireAuth, async (req: Request, res: Response) => {
    try {
      const { roundId, guess } = req.body;
      const round = gameRounds.get(roundId);
      if (!round) return res.status(400).json({ message: "Round not found or expired. Start a new round." });
      gameRounds.delete(roundId);
      const correct = (guess === "ai") === round.isAI;
      res.json({ correct, wasAI: round.isAI, description: round.description, tip: round.tip });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/ai-detect", requireAuth, async (req: Request, res: Response) => {
    try {
      const { image, mimeType } = req.body;
      if (!image || typeof image !== "string") {
        return res.status(400).json({ message: "No image data provided" });
      }

      const imageBuffer = Buffer.from(image, "base64");
      const contentType = mimeType || "image/jpeg";

      const hfHeaders: Record<string, string> = { "Content-Type": contentType };
      if (process.env.HF_TOKEN) hfHeaders["Authorization"] = `Bearer ${process.env.HF_TOKEN}`;
      const hfRes = await fetch(
        "https://api-inference.huggingface.co/models/Organika/sdxl-detector",
        {
          method: "POST",
          headers: hfHeaders,
          body: imageBuffer,
        }
      );

      if (!hfRes.ok) {
        const errText = await hfRes.text();
        if (hfRes.status === 503) {
          return res.status(503).json({ message: "AI model is loading, please retry in 20 seconds", loading: true });
        }
        throw new Error(`Detection service error ${hfRes.status}: ${errText.substring(0, 200)}`);
      }

      const rawResult = await hfRes.json() as Array<{ label: string; score: number }>;
      const artificial = rawResult.find((r) => r.label.toLowerCase().includes("artificial") || r.label === "LABEL_1");
      const natural = rawResult.find((r) => r.label.toLowerCase().includes("natural") || r.label === "LABEL_0");

      const aiScore = artificial?.score ?? (1 - (natural?.score ?? 0));
      const verdict = aiScore >= 0.65 ? "ai" : aiScore >= 0.35 ? "uncertain" : "human";
      const confidence = Math.round(
        verdict === "ai" ? aiScore * 100 :
        verdict === "human" ? (1 - aiScore) * 100 :
        50 + Math.abs(aiScore - 0.5) * 100
      );

      res.json({
        verdict,
        confidence: Math.min(99, Math.max(1, confidence)),
        aiScore: Math.round(aiScore * 1000) / 10,
        rawLabels: rawResult,
      });
    } catch (err: any) {
      console.error("AI detect error:", err.message);
      res.status(500).json({ message: err.message || "Detection failed" });
    }
  });

  // ── BOUNTY / PART AVAILABILITY VERIFICATION ────────────────────────────────

  app.post("/api/jobs/:id/bounty-submit", requireAuth, demoGuard, checkSuspended, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (!job.isBounty) return res.status(400).json({ message: "Not a bounty job" });
      if (!["posted_public", "proof_review"].includes(job.status)) return res.status(400).json({ message: "Bounty is not accepting submissions" });
      const isDemo = await isDemoUser(req.session.userId!);
      if (job.postedById === req.session.userId && !isDemo) return res.status(400).json({ message: "Cannot submit proof on your own job" });

      const helper = await storage.getUser(req.session.userId!);
      if (!helper) return res.status(401).json({ message: "User not found" });
      if (!helper.idVerified) return res.status(403).json({ message: "ID_REQUIRED", detail: "You must verify your ID before submitting bounty proof." });

      const existingCount = await storage.getHelperAttemptCount(jobId, req.session.userId!);
      if (existingCount >= 3) return res.status(429).json({ message: "You have reached the maximum of 3 attempts for this bounty." });

      const { proofPhotos, proofGps, partConditionTag, helperNotes } = req.body;
      if (!proofPhotos || !Array.isArray(proofPhotos) || proofPhotos.length < 3) {
        return res.status(400).json({ message: "At least 3 proof photos are required." });
      }
      if (!partConditionTag || !["Intact", "Damaged", "Missing"].includes(partConditionTag)) {
        return res.status(400).json({ message: "Part condition tag must be Intact, Damaged, or Missing." });
      }

      let filteredNotes = helperNotes || "";
      if (filteredNotes) {
        const check = filterContactInfo(filteredNotes);
        filteredNotes = check.clean;
      }

      const attempt = await storage.createBountyAttempt({
        jobId,
        helperId: req.session.userId!,
        status: "pending",
        proofPhotos,
        proofGps: proofGps || null,
        proofTimestamp: new Date(),
        partConditionTag,
        helperNotes: filteredNotes,
        attemptNumber: existingCount + 1,
      });

      await storage.updateJob(jobId, { status: "proof_review" });

      await notify(job.postedById, {
        title: "Bounty Proof Submitted 📋",
        body: `New proof submitted for your verification request: "${job.title}". Review it now.`,
        type: "job",
        jobId,
      });

      await storage.createAuditLog({ userId: req.session.userId!, action: "bounty_submit", details: `Attempt ${existingCount + 1} for job ${jobId}` });

      res.json({ message: "Proof submitted. The poster will review and notify you.", attempt });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/jobs/:id/bounty-attempts", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId) return res.status(403).json({ message: "Only the poster can view attempts" });

      const attempts = await storage.getBountyAttempts(jobId);
      const enriched = await Promise.all(attempts.map(async (a) => {
        const helper = await storage.getUser(a.helperId);
        return {
          ...a,
          helperUsername: helper?.username || "unknown",
          helperTier: helper?.tier || "community",
        };
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs/:id/bounty-approve/:attemptId", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const attemptId = parseInt(req.params.attemptId);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId) return res.status(403).json({ message: "Only the poster can approve" });

      const attempt = await storage.getBountyAttempt(attemptId);
      if (!attempt || attempt.jobId !== jobId) return res.status(404).json({ message: "Attempt not found" });

      await storage.updateBountyAttempt(attemptId, { status: "approved" });

      await storage.updateJob(jobId, {
        assignedHelperId: attempt.helperId,
        partConditionTag: attempt.partConditionTag,
        helperObservationNotes: attempt.helperNotes,
        status: "completion_submitted",
        completedAt: new Date(),
        buyerConfirmed: true,
      });

      const allAttempts = await storage.getBountyAttempts(jobId);
      for (const a of allAttempts) {
        if (a.id !== attemptId && a.status === "pending") {
          await storage.updateBountyAttempt(a.id, { status: "superseded" });
          await notify(a.helperId, {
            title: "Bounty Closed 🔒",
            body: `Another submission was accepted for "${job.title}". Thanks for participating.`,
            type: "job",
            jobId,
          });
        }
      }

      await notify(attempt.helperId, {
        title: "Bounty Won! 🏆",
        body: `Your proof for "${job.title}" was approved! Payout is being processed.`,
        type: "job",
        jobId,
      });

      if (attempt.helperId) {
        const winner = await storage.getUser(attempt.helperId);
        if (winner?.stripeAccountId && job.helperPayout) {
          try {
            await stripe.transfers.create({
              amount: Math.round(job.helperPayout * 100),
              currency: "usd",
              destination: winner.stripeAccountId,
              transfer_group: `job_${jobId}`,
            });
          } catch (payErr: any) {
            console.error("Bounty payout transfer error:", payErr.message);
          }
        }
      }

      await storage.createAuditLog({ userId: req.session.userId!, action: "bounty_approve", details: `Approved attempt ${attemptId} for job ${jobId}` });

      res.json({ message: "Proof approved. Job closed and payout initiated." });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs/:id/bounty-reject/:attemptId", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const attemptId = parseInt(req.params.attemptId);
      const { reason } = req.body;
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId) return res.status(403).json({ message: "Only the poster can reject" });

      const attempt = await storage.getBountyAttempt(attemptId);
      if (!attempt || attempt.jobId !== jobId) return res.status(404).json({ message: "Attempt not found" });

      await storage.updateBountyAttempt(attemptId, { status: "rejected", rejectionReason: reason || "Not specified" });

      await storage.createNotification({
        userId: attempt.helperId,
        title: "Bounty Proof Rejected",
        body: `Your proof for "${job.title}" was not accepted. Reason: ${reason || "Not specified"}`,
        type: "job",
        jobId,
      });

      const remaining = await storage.getBountyAttempts(jobId);
      const hasPending = remaining.some(a => a.id !== attemptId && a.status === "pending");
      if (!hasPending) {
        await storage.updateJob(jobId, { status: "posted_public" });
      }

      await storage.createAuditLog({ userId: req.session.userId!, action: "bounty_reject", details: `Rejected attempt ${attemptId} for job ${jobId}. Reason: ${reason}` });

      res.json({ message: "Proof rejected." });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const { saveSubscription, removeSubscription, VAPID_PUBLIC_KEY } = await import("./push");

  app.get("/api/push/vapid-public-key", (_req: Request, res: Response) => {
    if (!VAPID_PUBLIC_KEY) return res.status(503).json({ message: "Push not configured" });
    res.json({ publicKey: VAPID_PUBLIC_KEY });
  });

  app.post("/api/push/subscribe", requireAuth, async (req: Request, res: Response) => {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: "Invalid subscription" });
    }
    await saveSubscription(req.session.userId!, { endpoint, keys });
    res.json({ ok: true });
  });

  app.delete("/api/push/unsubscribe", requireAuth, async (req: Request, res: Response) => {
    const { endpoint } = req.body;
    if (endpoint) await removeSubscription(endpoint);
    res.json({ ok: true });
  });

  // ── BUSINESS PROFILE ──────────────────────────────────────────────────────
  app.get("/api/business/profile", requireAuth, async (req: Request, res: Response) => {
    const profile = await storage.getBusinessProfile(req.session.userId!);
    if (!profile) return res.status(404).json({ error: "No business profile" });
    res.json(profile);
  });

  app.post("/api/business/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { companyName, companyLogo, billingEmail, industry, contactPerson, contactPhone, description } = req.body;
      if (!companyName) return res.status(400).json({ error: "Company name required" });

      // Gate: only users pre-approved by admin (pending_business) or already business can create/update
      const requestingUser = await storage.getUser(userId);
      if (requestingUser && requestingUser.accountType !== "business" && requestingUser.accountType !== "pending_business") {
        return res.status(403).json({ error: "Business access not authorized. Contact GUBER support to apply." });
      }

      const profileData = { companyName, companyLogo, billingEmail, industry, contactPerson, contactPhone, description };
      const existing = await storage.getBusinessProfile(userId);
      let profile;
      if (existing) {
        profile = await storage.updateBusinessProfile(userId, profileData);
      } else {
        profile = await storage.createBusinessProfile({ userId, ...profileData });
      }
      await storage.updateUser(userId, { accountType: "business" } as any);
      res.json(profile);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── BUSINESS TEMPLATES (reuse proof_templates with businessId filter) ──────
  app.get("/api/business/templates", requireAuth, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const profile = await storage.getBusinessProfile(userId);
    if (!profile) return res.status(403).json({ error: "Business account required" });
    const rows = await db.execute(sql`SELECT pt.*, array_agg(row_to_json(pci.*)) FILTER (WHERE pci.id IS NOT NULL) as checklist_items
      FROM proof_templates pt LEFT JOIN proof_checklist_items pci ON pci.proof_template_id = pt.id
      WHERE pt.business_id = ${profile.id}
      GROUP BY pt.id ORDER BY pt.id DESC`);
    res.json(rows.rows);
  });

  app.post("/api/business/templates", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const profile = await storage.getBusinessProfile(userId);
      if (!profile) return res.status(403).json({ error: "Business account required" });
      const { name, requiredPhotoCount, requiredVideo, geoRequired, checklistItems } = req.body;

      const [template] = await db.execute(sql`
        INSERT INTO proof_templates (name, required_photo_count, required_video, geo_required, business_id)
        VALUES (${name || "Business Template"}, ${requiredPhotoCount || 1}, ${requiredVideo || false}, ${geoRequired || false}, ${profile.id})
        RETURNING *
      `);
      const tpl = (template as any).rows?.[0] || template;

      if (checklistItems?.length) {
        for (const item of checklistItems) {
          await db.execute(sql`
            INSERT INTO proof_checklist_items (proof_template_id, label, type, required)
            VALUES (${tpl.id}, ${item.label}, ${item.type || "photo"}, ${item.required !== false})
          `);
        }
      }
      res.json({ success: true, templateId: tpl.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/business/templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const profile = await storage.getBusinessProfile(userId);
      if (!profile) return res.status(403).json({ error: "Business account required" });
      const tplId = parseInt(req.params.id);
      await db.execute(sql`DELETE FROM proof_checklist_items WHERE proof_template_id = ${tplId}`);
      await db.execute(sql`DELETE FROM proof_templates WHERE id = ${tplId} AND business_id = ${profile.id}`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── BUSINESS BULK POSTING ─────────────────────────────────────────────────
  app.post("/api/business/bulk-post", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const profile = await storage.getBusinessProfile(userId);
      if (!profile) return res.status(403).json({ error: "Business account required" });

      const { templateId, jobs: jobRows } = req.body;
      if (!Array.isArray(jobRows) || jobRows.length === 0) return res.status(400).json({ error: "No jobs provided" });

      const batch = await storage.createBulkJobBatch({
        businessId: profile.id,
        templateId: templateId || null,
        totalJobs: jobRows.length,
        completedJobs: 0,
        status: "active",
      });

      const created = [];
      for (const row of jobRows) {
        const job = await storage.createJob({
          title: row.instructions ? row.instructions.substring(0, 60) : `${profile.companyName} Verification`,
          description: row.instructions || "",
          category: "Verify & Inspect",
          serviceType: "Business Inspection",
          budget: parseFloat(row.budget) || 25,
          location: row.address || "",
          zipcode: row.zipcode || "",
          postedById: userId,
          status: "posted_public",
          isPublished: true,
          isPaid: false,
          proofRequired: true,
          proofTemplateId: templateId || null,
          jobDetails: { batchId: batch.id, address: row.address, deadline: row.deadline },
        });
        created.push(job.id);
      }

      res.json({ success: true, batchId: batch.id, jobsCreated: created.length, jobIds: created });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/business/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const profile = await storage.getBusinessProfile(userId);
      if (!profile) return res.status(403).json({ error: "Business account required" });
      const allJobs = await storage.getJobsByUser(userId);
      res.json(allJobs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── WORKER RELIABILITY STATS ──────────────────────────────────────────────
  app.get("/api/users/:id/reliability", requireAuth, async (req: Request, res: Response) => {
    try {
      const helperId = parseInt(req.params.id);
      const helper = await storage.getUser(helperId);
      if (!helper) return res.status(404).json({ error: "User not found" });

      const allJobs = await db.select().from(jobsTable).where(eq(jobsTable.assignedHelperId, helperId));
      const completed = allJobs.filter((j) => ["completion_submitted", "completed_paid"].includes(j.status)).length;
      const total = allJobs.filter((j) => ["completion_submitted", "completed_paid", "cancelled", "disputed"].includes(j.status)).length;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 100;

      const reviewRows = await storage.getReviewsByUser(helperId);
      const avgRating = reviewRows.length > 0
        ? reviewRows.reduce((sum, r) => sum + (r.rating || 0), 0) / reviewRows.length
        : 0;

      const avgResponseTimeMins = 30;

      res.json({
        jobsCompleted: completed,
        completionRate,
        avgRating: Math.round(avgRating * 10) / 10,
        reviewCount: reviewRows.length,
        avgResponseTimeMins,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── JOB VERIFICATION REPORT ───────────────────────────────────────────────
  app.get("/api/jobs/:id/report", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const userId = req.session.userId!;
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (job.postedById !== userId) return res.status(403).json({ error: "Access denied" });
      if (!["completion_submitted", "completed_paid"].includes(job.status)) return res.status(400).json({ error: "Report only available for completed jobs" });

      const poster = await storage.getUser(job.postedById);
      const helper = job.assignedHelperId ? await storage.getUser(job.assignedHelperId) : null;
      const profile = await storage.getBusinessProfile(userId);
      const proofs = await storage.getProofsByJob(jobId);
      const reviews = await storage.getReviewsByJob(jobId);

      res.json({
        jobId: job.id,
        title: job.title,
        description: job.description,
        category: job.category,
        serviceType: job.serviceType,
        location: job.location,
        zip: job.zip,
        lat: job.lat,
        lng: job.lng,
        budget: job.budget,
        finalPrice: job.finalPrice,
        status: job.status,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
        jobDetails: job.jobDetails,
        taskTier: job.taskTier,
        company: profile ? {
          name: profile.companyName,
          logo: profile.companyLogo,
          industry: profile.industry,
          contactPerson: profile.contactPerson,
          verified: profile.companyVerified,
        } : null,
        poster: poster ? { id: poster.id, name: poster.fullName, guberId: poster.guberId } : null,
        helper: helper ? {
          id: helper.id,
          name: helper.fullName,
          guberId: helper.guberId,
          rating: helper.rating,
          jobsCompleted: helper.jobsCompleted,
        } : null,
        proofs,
        reviews,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── CLOUDINARY SIGNED UPLOAD TOKEN ───────────────────────────────────────
  app.post("/api/upload-photo/sign", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        return res.status(503).json({ error: "Media storage not configured. Contact support." });
      }
      const cloudinary = (await import("./cloudinary.js")).default;
      const timestamp = Math.round(Date.now() / 1000);
      const folder = "guber-proof";
      const signature = cloudinary.utils.api_sign_request(
        { timestamp, folder },
        process.env.CLOUDINARY_API_SECRET!
      );
      res.json({
        signature,
        timestamp,
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        folder,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── PHOTO / VIDEO UPLOAD → Cloudinary (fallback server-side path) ─────────
  app.post("/api/upload-photo", requireAuth, async (req: Request, res: Response) => {
    try {
      const { fileBase64 } = req.body;
      if (!fileBase64) return res.status(400).json({ error: "fileBase64 required" });

      if (!process.env.CLOUDINARY_CLOUD_NAME) {
        return res.status(503).json({ error: "Media storage not configured. Contact support." });
      }

      const cloudinary = (await import("./cloudinary.js")).default;

      const result = await cloudinary.uploader.upload(fileBase64, {
        resource_type: "auto",
        folder: "guber-proof",
        allowed_formats: ["jpg", "jpeg", "png", "gif", "webp", "mp4", "mov", "avi", "webm"],
      });

      res.json({ url: result.secure_url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── DISPUTE ROUTES ────────────────────────────────────────────────────────
  app.post("/api/jobs/:id/dispute", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const { reason, notes } = req.body;
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId) return res.status(403).json({ message: "Only poster can open dispute" });

      const disputeStatuses = ["in_progress", "active", "funded", "completion_submitted", "completed_paid", "payout_eligible"];
      if (!disputeStatuses.includes(job.status)) {
        return res.status(400).json({ message: "Cannot dispute job in current status" });
      }

      await storage.updateJob(jobId, {
        status: "disputed",
        disputeReason: reason || "Poster opened dispute",
        disputeNotes: notes || null,
        payoutStatus: "dispute_locked",
      } as any);

      try {
        await db.insert(guberDisputes).values({
          jobId,
          openedByUserId: req.session.userId!,
          reasonCode: reason || "general_dispute",
          description: reason || "Poster opened dispute",
          filedByRole: "hirer",
          againstUserId: job.assignedHelperId || null,
          status: "open",
          openedAt: new Date(),
        } as any);
      } catch (disputeInsertErr: any) {
        console.error(`[dispute] Failed to insert guber_disputes row for job ${jobId}:`, disputeInsertErr.message);
      }

      if (job.assignedHelperId) {
        const helper = await storage.getUser(job.assignedHelperId);
        if (helper) {
          await storage.updateUser(helper.id, {
            trustScore: adjustTrustScore(helper.trustScore || 50, TRUST_ADJUSTMENTS.DISPUTE_OPENED),
            jobsDisputed: (helper.jobsDisputed || 0) + 1,
          } as any);
        }
        await storage.createNotification({
          userId: job.assignedHelperId,
          title: "Dispute Opened",
          body: `The poster has opened a dispute on "${job.title}". Payout is locked until resolved.`,
          type: "job",
          jobId,
        });
      }

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "dispute_opened",
        details: `Job ${jobId}: ${reason || "No reason provided"}`,
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/jobs/:id/resolve-dispute", requireAdmin, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const { resolution, refundPoster, notes } = req.body;
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      const update: any = {
        disputeResolvedAt: new Date(),
        disputeResolvedBy: req.session.userId,
        disputeNotes: notes || (job as any).disputeNotes,
      };

      const piId = (job as any).stripePaymentIntentId;

      if (resolution === "worker_favor") {
        update.status = "completed_paid";
        update.confirmedAt = new Date();
        // Capture the held PaymentIntent — releases 80% to worker, GUBER keeps 20%
        if (piId) {
          const disputeJobPayoutStatus = (job as any).payoutStatus;
          if (disputeJobPayoutStatus === "paid_out") {
            // Already captured — preserve state, no double-capture
            update.payoutStatus = "paid_out";
            console.log(`[GUBER][capture] dispute worker_favor jobId=${jobId} skipped — already paid_out`);
          } else if (disputeJobPayoutStatus === "capture_expired") {
            update.payoutStatus = "capture_expired";
          } else {
            try {
              const captured = await stripe.paymentIntents.capture(piId);
              const capturedAmount = (captured.amount_received || captured.amount || 0) / 100;
              update.payoutStatus = "paid_out";
              update.chargedAt = new Date();
              console.log(`[GUBER][capture] dispute worker_favor jobId=${jobId} paymentIntentId=${piId} captured=success amount=$${capturedAmount}`);
            } catch (captureErr: any) {
              if (captureErr.code === "charge_expired_for_capture") {
                console.error(`[GUBER][capture] dispute worker_favor jobId=${jobId} EXPIRED — admin attention needed.`);
                update.payoutStatus = "capture_expired";
              } else {
                console.error(`[GUBER][capture] dispute worker_favor jobId=${jobId} error: ${captureErr.message}`);
                update.payoutStatus = "payout_eligible";
              }
            }
          }
        } else {
          update.payoutStatus = "payout_eligible";
        }
      } else if (resolution === "poster_favor") {
        if (refundPoster && piId) {
          try {
            // Try to cancel the uncaptured authorization first (no charge to poster)
            await stripe.paymentIntents.cancel(piId);
            update.status = "refunded";
            update.payoutStatus = "refunded";
            update.refundedAt = new Date();
            update.refundAmount = job.budget;
            console.log(`[GUBER][cancel] dispute poster_favor jobId=${jobId} paymentIntentId=${piId} cancelled`);
          } catch (cancelErr: any) {
            // PI already captured — fall back to refund
            if (cancelErr.code === "payment_intent_unexpected_state" || cancelErr.message?.includes("captured")) {
              try {
                await stripe.refunds.create({
                  payment_intent: piId,
                  reverse_transfer: true,
                  refund_application_fee: true,
                } as any);
                update.status = "refunded";
                update.payoutStatus = "refunded";
                update.refundedAt = new Date();
                update.refundAmount = job.budget;
                console.log(`[GUBER][refund] dispute poster_favor jobId=${jobId} paymentIntentId=${piId} refunded`);
              } catch (refundErr: any) {
                console.error("[GUBER] Refund failed:", refundErr.message);
                return res.status(500).json({ message: `Payment void/refund failed: ${refundErr.message}. Dispute not resolved.` });
              }
            } else {
              console.error("[GUBER] Cancel failed:", cancelErr.message);
              return res.status(500).json({ message: `Payment void failed: ${cancelErr.message}. Dispute not resolved.` });
            }
          }
        } else {
          update.status = "refunded";
          update.payoutStatus = "refunded";
        }
      } else if (resolution === "partial") {
        update.status = "completed_paid";
        update.confirmedAt = new Date();
        // Capture the full amount — admin handles any partial reimbursement outside Stripe
        if (piId) {
          const disputePartialPayoutStatus = (job as any).payoutStatus;
          if (disputePartialPayoutStatus === "paid_out") {
            // Already captured — preserve state, no double-capture
            update.payoutStatus = "paid_out";
            console.log(`[GUBER][capture] dispute partial jobId=${jobId} skipped — already paid_out`);
          } else if (disputePartialPayoutStatus === "capture_expired") {
            update.payoutStatus = "capture_expired";
          } else {
            try {
              const captured = await stripe.paymentIntents.capture(piId);
              const capturedAmount = (captured.amount_received || captured.amount || 0) / 100;
              update.payoutStatus = "paid_out";
              update.chargedAt = new Date();
              console.log(`[GUBER][capture] dispute partial jobId=${jobId} paymentIntentId=${piId} captured=success amount=$${capturedAmount}`);
            } catch (captureErr: any) {
              if (captureErr.code === "charge_expired_for_capture") {
                console.error(`[GUBER][capture] dispute partial jobId=${jobId} EXPIRED — admin attention needed.`);
                update.payoutStatus = "capture_expired";
              } else {
                console.error(`[GUBER][capture] dispute partial jobId=${jobId} error: ${captureErr.message}`);
                update.payoutStatus = "payout_eligible";
              }
            }
          }
        } else {
          update.payoutStatus = "payout_eligible";
        }
      }

      await storage.updateJob(jobId, update);

      if (resolution === "worker_favor" && update.payoutStatus === "paid_out") {
        const budgetAmount = job.budget || 0;
        const platformFee = Math.round(budgetAmount * 0.20 * 100) / 100;
        const workerEarning = budgetAmount - platformFee;
        await storage.createMoneyLedgerEntry({
          jobId, ledgerType: "dispute_resolved_worker_favor", amount: budgetAmount,
          userIdOwner: job.postedById, userIdCounterparty: job.assignedHelperId || null,
          sourceSystem: "stripe", stripeObjectType: "payment_intent", stripeObjectId: piId || null,
          description: `Dispute resolved in worker's favor — payment captured. Worker: $${workerEarning}, Platform fee: $${platformFee}`,
        });
      } else if (resolution === "poster_favor" && update.payoutStatus === "refunded") {
        await storage.createMoneyLedgerEntry({
          jobId, ledgerType: "dispute_resolved_poster_favor_refund", amount: job.budget || 0,
          userIdOwner: job.postedById, userIdCounterparty: null,
          sourceSystem: "stripe", stripeObjectType: "payment_intent", stripeObjectId: piId || null,
          description: `Dispute resolved in poster's favor — full refund issued.`,
        });
      } else if (resolution === "partial" && update.payoutStatus === "paid_out") {
        const budgetAmount = job.budget || 0;
        await storage.createMoneyLedgerEntry({
          jobId, ledgerType: "dispute_resolved_partial", amount: budgetAmount,
          userIdOwner: job.postedById, userIdCounterparty: job.assignedHelperId || null,
          sourceSystem: "stripe", stripeObjectType: "payment_intent", stripeObjectId: piId || null,
          description: `Dispute resolved with partial resolution — payment captured. Admin handles partial reimbursement separately.`,
        });
      }

      if (job.assignedHelperId) {
        await storage.createNotification({
          userId: job.assignedHelperId,
          title: "Dispute Resolved",
          body: `The dispute on "${job.title}" has been resolved. Resolution: ${resolution}.`,
          type: "job",
          jobId,
        });
      }
      await storage.createNotification({
        userId: job.postedById,
        title: "Dispute Resolved",
        body: `Your dispute on "${job.title}" has been resolved. Resolution: ${resolution}.`,
        type: "job",
        jobId,
      });

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "dispute_resolved",
        details: `Job ${jobId}: resolution=${resolution}`,
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── REFUND ROUTE ──────────────────────────────────────────────────────────
  app.post("/api/admin/jobs/:id/refund", requireAdmin, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const { refundApplicationFee } = req.body;
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      const piId = (job as any).stripePaymentIntentId;
      if (!piId) return res.status(400).json({ message: "No payment intent found for this job" });

      let refundedAmount = 0;
      let stripeRefundId: string | null = null;
      try {
        // Try cancelling uncaptured authorization first (no charge to poster at all)
        await stripe.paymentIntents.cancel(piId);
        refundedAmount = job.budget || 0;
        console.log(`[GUBER][admin-cancel] jobId=${jobId} paymentIntentId=${piId} cancelled amount=$${refundedAmount}`);
      } catch (cancelErr: any) {
        // Already captured — issue a standard refund
        const refund = await stripe.refunds.create({
          payment_intent: piId,
          reverse_transfer: true,
          refund_application_fee: refundApplicationFee !== false,
        } as any);
        refundedAmount = (refund.amount || 0) / 100;
        stripeRefundId = refund.id;
        console.log(`[GUBER][admin-refund] jobId=${jobId} paymentIntentId=${piId} refundId=${refund.id} amount=$${refundedAmount}`);
      }

      await storage.updateJob(jobId, {
        status: "refunded",
        payoutStatus: "refunded",
        refundedAt: new Date(),
        refundAmount: refundedAmount,
      } as any);

      await storage.createNotification({
        userId: job.postedById,
        title: "Refund Processed",
        body: `Your payment for "${job.title}" has been refunded.`,
        type: "job",
        jobId,
      });

      if (job.assignedHelperId) {
        await storage.createNotification({
          userId: job.assignedHelperId,
          title: "Job Refunded",
          body: `"${job.title}" has been refunded. The transfer has been reversed.`,
          type: "job",
          jobId,
        });
      }

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "job_refunded",
        details: `Job ${jobId}: ${stripeRefundId ? `refundId=${stripeRefundId}` : "authorization cancelled"} amount=$${refundedAmount}`,
      });

      res.json({ success: true, refundId: stripeRefundId, refundedAmount });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── PAYOUT ROUTES ─────────────────────────────────────────────────────────
  app.get("/api/jobs/:id/payout-options", requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.assignedHelperId !== req.session.userId) return res.status(403).json({ message: "Not your job" });

      const worker = await storage.getUser(req.session.userId!);
      if (!worker) return res.status(401).json({ message: "User not found" });

      const feeConfig = await getActiveFeeConfig();
      const proofs = await storage.getProofsByJob(jobId);
      const hasDispute = !!(job as any).disputeReason && !(job as any).disputeResolvedAt;

      const eligibility = checkPayoutEligibility(job, worker, feeConfig, proofs.length > 0, hasDispute);
      const trustInfo = getTrustInfo(worker, feeConfig);
      const workerShare = (job as any).workerGrossShare || job.helperPayout || 0;

      let standardAmount = workerShare;
      let earlyAmount = workerShare;
      let instantAmount = workerShare;

      if (eligibility.availableModes.includes("early")) {
        earlyAmount = Math.round(workerShare * (1 - feeConfig.earlyCashoutFeeRate) * 100) / 100;
      }
      if (eligibility.availableModes.includes("instant")) {
        instantAmount = Math.round(workerShare * (1 - feeConfig.instantCashoutFeeRate) * 100) / 100;
      }

      res.json({
        eligible: eligibility.eligible,
        reason: eligibility.reason,
        trustLevel: trustInfo.level,
        badges: trustInfo.badges,
        modes: eligibility.availableModes,
        amounts: {
          standard: standardAmount,
          early: earlyAmount,
          instant: instantAmount,
        },
        fees: {
          earlyCashoutFee: feeConfig.earlyCashoutFeeRate,
          instantCashoutFee: feeConfig.instantCashoutFeeRate,
        },
        payoutStatus: (job as any).payoutStatus,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs/:id/request-payout", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const { mode } = req.body;
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.assignedHelperId !== req.session.userId) return res.status(403).json({ message: "Not your job" });

      const payoutStatus = (job as any).payoutStatus;
      const piId = (job as any).stripePaymentIntentId;

      // Hard gate: Stripe PaymentIntent jobs use automatic capture — this endpoint is not used for them
      if (piId) {
        if (payoutStatus === "paid_out") {
          return res.json({ success: true, message: "Payment already released via Stripe capture." });
        }
        if (payoutStatus === "capture_expired") {
          return res.status(409).json({ message: "Payment authorization expired. Please contact GUBER support." });
        }
        // All other statuses: inform client that capture happens automatically on job confirmation
        return res.status(409).json({
          message: "Payout for this job is handled automatically when the job is confirmed. No manual action is needed."
        });
      }

      // Non-Stripe job fallback path (cash/barter jobs without a PaymentIntent)
      if (payoutStatus === "paid_out") return res.json({ message: "Already paid out" });
      if (payoutStatus !== "payout_eligible") {
        return res.status(400).json({ message: `Payout not available. Current status: ${payoutStatus}` });
      }

      // Non-Stripe job: lock the row then issue a manual payout transfer
      const lockResult = await db.update(jobs)
        .set({ payoutStatus: "payout_processing" } as any)
        .where(and(eq(jobs.id, jobId), sql`payout_status = 'payout_eligible'`))
        .returning({ id: jobs.id });
      if (!lockResult.length) {
        return res.status(409).json({ message: "Payout already being processed" });
      }

      const worker = await storage.getUser(req.session.userId!);
      if (!worker) return res.status(401).json({ message: "User not found" });

      const workerAccountId = (worker as any).stripeAccountId;
      if (!workerAccountId) {
        await db.update(jobs).set({ payoutStatus: "payout_eligible" } as any).where(eq(jobs.id, jobId));
        return res.status(400).json({ message: "No payout account configured" });
      }

      const feeConfig = await getActiveFeeConfig();
      const proofs = await storage.getProofsByJob(jobId);
      const hasDispute = !!(job as any).disputeReason && !(job as any).disputeResolvedAt;
      const eligibility = checkPayoutEligibility(job, worker, feeConfig, proofs.length > 0, hasDispute);

      if (!eligibility.eligible) {
        await db.update(jobs).set({ payoutStatus: "payout_eligible" } as any).where(eq(jobs.id, jobId));
        return res.status(400).json({ message: eligibility.reason });
      }

      const payoutMode = mode || "standard";
      if (!eligibility.availableModes.includes(payoutMode)) {
        await db.update(jobs).set({ payoutStatus: "payout_eligible" } as any).where(eq(jobs.id, jobId));
        return res.status(400).json({ message: `${payoutMode} payout not available for your trust level` });
      }

      const workerShare = (job as any).workerGrossShare || job.helperPayout || 0;
      let payoutAmount = workerShare;
      if (payoutMode === "early") {
        payoutAmount = Math.round(workerShare * (1 - feeConfig.earlyCashoutFeeRate) * 100) / 100;
      } else if (payoutMode === "instant") {
        payoutAmount = Math.round(workerShare * (1 - feeConfig.instantCashoutFeeRate) * 100) / 100;
      }

      const payoutAmountCents = Math.round(payoutAmount * 100);

      try {
        const payoutParams: any = {
          amount: payoutAmountCents,
          currency: "usd",
          metadata: { jobId: String(jobId), mode: payoutMode },
        };
        if (payoutMode === "instant") {
          payoutParams.method = "instant";
        }

        const payout = await stripe.payouts.create(payoutParams, {
          stripeAccount: workerAccountId,
        });

        await storage.updateJob(jobId, {
          payoutStatus: "paid_out",
          payoutMode,
          paidOutAt: new Date(),
        } as any);

        await storage.createWalletTransaction({
          userId: job.assignedHelperId!,
          jobId: job.id,
          type: "payout",
          amount: payoutAmount,
          status: "available",
          stripeTransferId: payout.id,
          description: `${payoutMode === "instant" ? "Instant" : payoutMode === "early" ? "Early" : "Standard"} payout: $${payoutAmount.toFixed(2)} for "${job.title}"`,
        });

        res.json({ success: true, payoutId: payout.id, amount: payoutAmount, mode: payoutMode });
      } catch (payoutErr: any) {
        console.error("[GUBER] Payout failed:", payoutErr.message);
        await db.update(jobs).set({ payoutStatus: "payout_eligible" } as any).where(eq(jobs.id, jobId));

        if (payoutMode === "instant" && payoutErr.message.includes("not supported")) {
          return res.status(400).json({
            message: "Instant payout not available for your bank. Try standard payout.",
            code: "INSTANT_NOT_SUPPORTED",
          });
        }

        res.status(500).json({ message: "Payout failed: " + payoutErr.message });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── TRUST INFO ROUTE ──────────────────────────────────────────────────────
  app.get("/api/worker/trust-info", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "User not found" });

      const feeConfig = await getActiveFeeConfig();
      const trustInfo = getTrustInfo(user, feeConfig);

      res.json({
        trustScore: trustInfo.score,
        trustLevel: trustInfo.level,
        badges: trustInfo.badges,
        canEarlyCashout: trustInfo.canEarlyCashout,
        canInstantCashout: trustInfo.canInstantCashout,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/users/:id/badges", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const feeConfig = await getActiveFeeConfig();
      const trustInfo = getTrustInfo(user, feeConfig);

      res.json({
        badges: trustInfo.badges,
        jobsCompleted: user.jobsCompleted || 0,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── PLATFORM SETTINGS ROUTES ──────────────────────────────────────────────
  app.get("/api/admin/settings", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const settings = await db.select().from(platformSettings);
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/settings", requireAdmin, async (req: Request, res: Response) => {
    try {
      const updates = req.body;
      for (const [key, value] of Object.entries(updates)) {
        await db.insert(platformSettings)
          .values({ key, value: String(value), updatedAt: new Date() })
          .onConflictDoUpdate({
            target: platformSettings.key,
            set: { value: String(value), updatedAt: new Date() },
          });
      }
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "settings_updated",
        details: `Updated keys: ${Object.keys(updates).join(", ")}`,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/settings/:key", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      await db.insert(platformSettings)
        .values({ key, value: String(value), updatedAt: new Date() })
        .onConflictDoUpdate({
          target: platformSettings.key,
          set: { value: String(value), updatedAt: new Date() },
        });
      await storage.createAuditLog({
        userId: req.session.userId,
        action: "setting_updated",
        details: `${key} = ${value}`,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── CASH DROP — USER ROUTES ───────────────────────────────────────────────
  app.get("/api/cash-drops/active", async (req: Request, res: Response) => {
    try {
      let drops = await storage.getActiveCashDrops();
      const demoIds = await getDemoUserIds();
      const callerIsDemoUser = req.session?.userId ? demoIds.has(req.session.userId) : false;
      if (!callerIsDemoUser) {
        drops = drops.filter(d => !d.sponsorName?.startsWith("DEMO_"));
      } else {
        drops = drops.map(d => d.sponsorName?.startsWith("DEMO_") ? { ...d, sponsorName: d.sponsorName.replace("DEMO_", "") } : d);
      }
      res.json(drops);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/cash-drops/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const drop = await storage.getCashDrop(parseInt(req.params.id));
      if (!drop) return res.status(404).json({ error: "Cash Drop not found" });

      const attempt = await storage.getCashDropAttemptByUser(drop.id, userId);
      const clueVisible = attempt?.status === "arrived" || attempt?.status === "submitted" || attempt?.status === "won";

      res.json({
        ...drop,
        clueText: (drop.clueRevealOnArrival && !clueVisible) ? null : drop.clueText,
        userAttempt: attempt || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cash-drops/:id/accept", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const drop = await storage.getCashDrop(parseInt(req.params.id));
      if (!drop) return res.status(404).json({ error: "Cash Drop not found" });
      if (drop.status !== "active") return res.status(400).json({ error: "Cash Drop is not active" });
      if ((drop.winnersFound || 0) >= drop.winnerLimit) return res.status(400).json({ error: "All winner slots are filled for this Cash Drop" });

      if (drop.claimCode) {
        const { claimCode } = req.body || {};
        if (!claimCode) return res.status(400).json({ error: "This Cash Drop requires a claim code" });
        if (claimCode.trim().toLowerCase() !== drop.claimCode.trim().toLowerCase()) {
          return res.status(400).json({ error: "Invalid claim code" });
        }
      }

      const existing = await storage.getCashDropAttemptByUser(drop.id, userId);
      if (existing) return res.json(existing);

      const { deviceFingerprint } = req.body || {};
      const validationLog: string[] = [];
      if (deviceFingerprint) {
        const allAttempts = await storage.getCashDropAttempts(drop.id);
        const dupeDevice = allAttempts.find(a => a.deviceFingerprint === deviceFingerprint && a.userId !== userId);
        if (dupeDevice) {
          validationLog.push(`device_fingerprint_collision:${deviceFingerprint.slice(0, 8)}`);
          await storage.createAuditLog({ userId, action: "cash_drop_device_dupe", details: `Drop ${drop.id}: fingerprint collision detected` });
        }
      }

      const attempt = await storage.createCashDropAttempt({
        cashDropId: drop.id,
        userId,
        status: "accepted",
        claimCode: drop.claimCode || null,
        deviceFingerprint: deviceFingerprint || null,
        validationLog: validationLog.length > 0 ? validationLog : null,
        fundedFromSource: drop.fundingSource || "guber_cash_app",
        rewardAmount: drop.rewardPerWinner,
        rewardType: "cash",
      });
      res.json(attempt);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  app.post("/api/cash-drops/:id/arrived", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const drop = await storage.getCashDrop(parseInt(req.params.id));
      if (!drop) return res.status(404).json({ error: "Cash Drop not found" });

      const attempt = await storage.getCashDropAttemptByUser(drop.id, userId);
      if (!attempt) return res.status(400).json({ error: "You have not accepted this Cash Drop" });
      if (attempt.status !== "accepted") return res.json({ ...attempt, clue: drop.clueRevealOnArrival ? drop.clueText : null });

      const { gpsLat, gpsLng } = req.body;
      if (!gpsLat || !gpsLng) return res.status(400).json({ error: "GPS coordinates required" });

      if (drop.gpsLat && drop.gpsLng && drop.gpsRadius) {
        const dist = haversineDistance(gpsLat, gpsLng, drop.gpsLat, drop.gpsLng);
        if (dist > drop.gpsRadius) {
          return res.status(400).json({ error: `You are ${Math.round(dist)}m away. Need to be within ${drop.gpsRadius}m.`, distance: Math.round(dist) });
        }
      }

      const updated = await storage.updateCashDropAttempt(attempt.id, {
        status: "arrived",
        arrivedAt: new Date(),
        gpsLat,
        gpsLng,
      });

      res.json({ ...updated, clue: drop.clueRevealOnArrival ? drop.clueText : null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cash-drops/:id/submit-proof", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const drop = await storage.getCashDrop(parseInt(req.params.id));
      if (!drop) return res.status(404).json({ error: "Cash Drop not found" });
      if (drop.status !== "active") return res.status(400).json({ error: "Cash Drop is not active" });
      if ((drop.winnersFound || 0) >= drop.winnerLimit) return res.status(400).json({ error: "All winner slots are filled" });

      const attempt = await storage.getCashDropAttemptByUser(drop.id, userId);
      if (!attempt) return res.status(400).json({ error: "You have not accepted this Cash Drop" });
      if (!["accepted", "arrived"].includes(attempt.status)) return res.status(400).json({ error: "Cannot submit proof at this stage" });

      const { proofUrls, videoUrl, gpsLat, gpsLng } = req.body;

      const updated = await storage.updateCashDropAttempt(attempt.id, {
        status: "submitted",
        submittedAt: new Date(),
        proofUrls: proofUrls || [],
        videoUrl: videoUrl || null,
        gpsLat: gpsLat || attempt.gpsLat,
        gpsLng: gpsLng || attempt.gpsLng,
        payoutStatus: "pending",
      });

      // Notify admin of submission
      const admins = await storage.getAllUsers();
      const adminUser = admins.find((u: any) => u.role === "admin");
      if (adminUser) {
        const submitter = await storage.getUser(userId);
        await storage.createNotification({
          userId: adminUser.id,
          title: "⚡ Cash Drop Submission",
          body: `${submitter?.fullName || "A user"} submitted proof for "${drop.title}". Review and confirm winner.`,
          type: "cash_drop",
          cashDropId: drop.id,
        });
      }

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── CASH DROP — ADMIN ROUTES ──────────────────────────────────────────────
  app.get("/api/admin/cash-drops", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const drops = await storage.getCashDrops();
      res.json(drops);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/cash-drops/:id/attempts", requireAdmin, async (req: Request, res: Response) => {
    try {
      const dropId = parseInt(req.params.id);
      const attempts = await storage.getCashDropAttempts(dropId);
      const enriched = await Promise.all(attempts.map(async (a: any) => {
        const user = await storage.getUser(a.user_id || a.userId);
        return { ...a, user_name: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username : `User #${a.user_id || a.userId}` };
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/cash-drops", requireAdmin, async (req: Request, res: Response) => {
    try {
      const {
        title, description, rewardPerWinner, winnerLimit, startTime, endTime,
        gpsLat, gpsLng, gpsRadius, clueText, clueRevealOnArrival, requireInAppCamera,
        proofItems, sponsorName, sponsorId, isSponsored, brandingEnabled,
        cashWinnerCount, rewardWinnerCount, finalLocationMode,
        rewardType, rewardDescription, rewardQuantity, rewardRedemptionType,
        redemptionType, redemptionInstructions, noPurchaseRequiredText, disclaimerText, status,
      } = req.body;
      const cashWinnersCap = cashWinnerCount ? parseInt(cashWinnerCount) : 1;
      const rewardWinnersCap = rewardWinnerCount ? parseInt(rewardWinnerCount) : 0;
      const isRewardOnly = cashWinnersCap === 0 && rewardWinnersCap > 0;
      if (!title || (isRewardOnly ? false : !rewardPerWinner)) return res.status(400).json({ error: "Title is required" });

      const finalStatus = status === "active" ? "active" : "draft";
      const drop = await storage.createCashDrop({
        title, description,
        rewardPerWinner: isRewardOnly ? 0 : (parseFloat(rewardPerWinner) || 0),
        // winnerLimit auto-synced to cashWinnersCap + rewardWinnersCap so closure logic is consistent
        winnerLimit: (cashWinnersCap + rewardWinnersCap) > 0 ? (cashWinnersCap + rewardWinnersCap) : (parseInt(winnerLimit) || 1),
        cashWinnerCount: cashWinnersCap,
        rewardWinnerCount: rewardWinnersCap,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        gpsLat: gpsLat ? parseFloat(gpsLat) : null,
        gpsLng: gpsLng ? parseFloat(gpsLng) : null,
        gpsRadius: gpsRadius ? parseInt(gpsRadius) : 200,
        clueText, clueRevealOnArrival: !!clueRevealOnArrival, requireInAppCamera: requireInAppCamera !== false,
        proofItems: proofItems || [],
        sponsorName: sponsorName || null,
        sponsorId: sponsorId ? parseInt(sponsorId) : null,
        isSponsored: !!isSponsored,
        brandingEnabled: !!brandingEnabled,
        finalLocationMode: finalLocationMode || "name_only",
        rewardType: rewardType || "cash",
        rewardDescription: rewardDescription || null,
        rewardQuantity: rewardQuantity ? parseInt(rewardQuantity) : null,
        rewardRedemptionType: rewardRedemptionType || null,
        redemptionType: redemptionType || null,
        redemptionInstructions: redemptionInstructions || null,
        noPurchaseRequiredText: noPurchaseRequiredText || null,
        disclaimerText: disclaimerText || null,
        status: finalStatus,
      });
      if (finalStatus === "active") notifyCashDropLive(drop).catch(() => {});
      res.json(drop);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/cash-drops/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const previousDrop = await storage.getCashDrop(id);
      const drop = await storage.updateCashDrop(id, req.body);
      if (drop && req.body.status === "active" && previousDrop?.status !== "active") {
        notifyCashDropLive(drop).catch(() => {});
      }
      res.json(drop);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/cash-drops/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteCashDrop(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/cash-drops/:id/confirm-winner/:attemptId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const dropId = parseInt(req.params.id);
      const attemptId = parseInt(req.params.attemptId);

      const drop = await storage.getCashDrop(dropId);
      if (!drop) return res.status(404).json({ error: "Cash Drop not found" });

      const attempt = await storage.getCashDropAttempt(attemptId);
      if (!attempt) return res.status(404).json({ error: "Attempt not found" });
      if (attempt.status === "won") return res.status(400).json({ error: "Already confirmed as winner" });

      const winner = await storage.getUser(attempt.userId);
      if (!winner) return res.status(404).json({ error: "User not found" });

      // Count existing confirmed cash and reward winners
      const allAttempts = await storage.getCashDropAttempts(dropId);
      const wonAttempts = allAttempts.filter((a) => a.status === "won");
      const confirmedCashWinners = wonAttempts.filter((a) => !a.isRewardWinner).length;
      const confirmedRewardWinners = wonAttempts.filter((a) => a.isRewardWinner).length;

      // cashWinnerCount = cap for cash winners, rewardWinnerCount = cap for reward winners
      const cashCap = drop.cashWinnerCount ?? 1;
      const rewardCap = drop.rewardWinnerCount ?? 0;
      const dropRewardType = drop.rewardType ?? "cash";

      let totalWinnersFound = drop.winnersFound || 0;
      let isRewardWinner = false;
      let autoRewardWinners: typeof allAttempts = [];

      if (confirmedCashWinners < cashCap) {
        // Path A: Cash cap not yet full — confirm this attempt as a cash winner
        await storage.updateCashDropAttempt(attemptId, {
          status: "won",
          isRewardWinner: false,
          payoutStatus: "approved",
          rewardAmount: drop.rewardPerWinner,
          rewardType: "cash",
          payoutApprovedBy: req.session.userId ?? null,
          fundedFromSource: drop.fundingSource ?? "guber_cash_app",
        });
        totalWinnersFound += 1;
        const newConfirmedCash = confirmedCashWinners + 1;

        // If cash cap just reached, batch-auto-select already-submitted attempts as reward winners
        if (newConfirmedCash >= cashCap && rewardCap > 0) {
          const remaining = rewardCap - confirmedRewardWinners;
          if (remaining > 0) {
            // Eligible: proof submitted (status=submitted), not already won, sorted by arrivedAt asc
            const eligible = allAttempts
              .filter((a) => a.id !== attemptId && a.status === "submitted" && a.arrivedAt)
              .sort((a, b) => new Date(a.arrivedAt!).getTime() - new Date(b.arrivedAt!).getTime())
              .slice(0, remaining);
            autoRewardWinners = eligible;
            for (const ra of eligible) {
              await storage.updateCashDropAttempt(ra.id, {
                status: "won",
                isRewardWinner: true,
                payoutStatus: "reward",
                rewardType: dropRewardType,
                rewardAmount: 0,
                payoutApprovedBy: req.session.userId ?? null,
              });
              totalWinnersFound += 1;
              const raUser = await storage.getUser(ra.userId);
              if (raUser) {
                await storage.createNotification({
                  userId: raUser.id,
                  title: "You Won a Sponsored Drop Reward!",
                  body: `You won "${drop.rewardDescription || "a reward"}" in "${drop.title}"! Check the drop for redemption details.`,
                  type: "cash_drop_win",
                  cashDropId: dropId,
                });
              }
            }
          }
        }

        await storage.createNotification({
          userId: winner.id,
          title: "You Won a Cash Drop!",
          body: `You won $${drop.rewardPerWinner.toFixed(2)} in "${drop.title}"! Choose how you'd like to receive your reward.`,
          type: "cash_drop_win",
          cashDropId: dropId,
        });
      } else if (rewardCap > 0 && confirmedRewardWinners < rewardCap) {
        // Path B: Cash cap full, reward slots still open — auto-select next eligible by arrivedAt order
        // Enforce strict arrivedAt ordering: pick earliest submitted attempt (ignoring admin's arbitrary choice)
        const remaining = rewardCap - confirmedRewardWinners;
        const eligible = allAttempts
          .filter((a) => a.status === "submitted" && a.arrivedAt)
          .sort((a, b) => new Date(a.arrivedAt!).getTime() - new Date(b.arrivedAt!).getTime())
          .slice(0, remaining);

        if (eligible.length === 0) {
          return res.status(400).json({ error: "No submitted proof attempts available for reward assignment" });
        }

        isRewardWinner = true;
        for (const ra of eligible) {
          await storage.updateCashDropAttempt(ra.id, {
            status: "won",
            isRewardWinner: true,
            payoutStatus: "reward",
            rewardType: dropRewardType,
            rewardAmount: 0,
            payoutApprovedBy: req.session.userId ?? null,
          });
          totalWinnersFound += 1;
          const raUser = await storage.getUser(ra.userId);
          if (raUser) {
            await storage.createNotification({
              userId: raUser.id,
              title: "You Won a Sponsored Drop Reward!",
              body: `You won "${drop.rewardDescription || "a reward"}" in "${drop.title}"! Check the drop for redemption details.`,
              type: "cash_drop_win",
              cashDropId: dropId,
            });
          }
        }
      } else {
        return res.status(400).json({ error: "All winner slots (cash and reward) are filled for this Cash Drop" });
      }

      // For sponsored drops, derive closure from actual winner caps (not legacy winnerLimit)
      const effectiveLimit = (cashCap + rewardCap > 0) ? (cashCap + rewardCap) : (drop.winnerLimit || 1);
      const newConfirmedCash2 = confirmedCashWinners + (isRewardWinner ? 0 : 1);
      const newConfirmedReward2 = confirmedRewardWinners + (isRewardWinner ? 1 : 0) + autoRewardWinners.length;
      const allSlotsFilled = newConfirmedCash2 >= cashCap && (rewardCap === 0 || newConfirmedReward2 >= rewardCap);
      const newStatus = (allSlotsFilled || totalWinnersFound >= effectiveLimit) ? "closed" : drop.status;
      await storage.updateCashDrop(dropId, { winnersFound: totalWinnersFound, status: newStatus });

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "cash_drop_winner_confirmed",
        details: `Drop ${dropId}, attempt ${attemptId}, ${isRewardWinner ? "reward" : "cash"} winner ${winner.id}${!isRewardWinner ? `, amount $${drop.rewardPerWinner}` : ""}${autoRewardWinners.length > 0 ? `, auto-assigned ${autoRewardWinners.length} reward winner(s)` : ""}`,
      });

      res.json({ success: true, winnersFound: totalWinnersFound, isRewardWinner, autoRewardWinnerCount: autoRewardWinners.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cash-drops/:id/select-payout-method", requireAuth, async (req: Request, res: Response) => {
    try {
      const dropId = parseInt(req.params.id);
      const userId = req.session.userId!;
      const { payoutMethod, payoutHandle, bankName, routingNumber, accountNumber, accountType } = req.body;

      const attempt = await storage.getCashDropAttemptByUser(dropId, userId);
      if (!attempt) return res.status(404).json({ error: "No claim found" });
      if (attempt.status !== "won") return res.status(400).json({ error: "Not a confirmed winner" });

      const currentPayoutStatus = (attempt as any).payoutStatus;
      if (currentPayoutStatus && !["approved", "none"].includes(currentPayoutStatus)) {
        return res.status(400).json({ error: "Payout method already selected" });
      }

      const validMethods = ["cash_app", "venmo", "paypal", "ach", "guber_credit"];
      if (!validMethods.includes(payoutMethod)) {
        return res.status(400).json({ error: "Invalid payout method" });
      }

      const updateData: any = {
        payoutMethod,
        payoutStatus: "payout_method_selected",
      };

      if (payoutMethod === "cash_app") {
        if (!payoutHandle || !payoutHandle.startsWith("$")) {
          return res.status(400).json({ error: "Invalid $Cashtag format" });
        }
        updateData.payoutHandle = payoutHandle;
      } else if (payoutMethod === "venmo") {
        if (!payoutHandle) return res.status(400).json({ error: "Venmo username required" });
        updateData.payoutHandle = payoutHandle;
      } else if (payoutMethod === "paypal") {
        if (!payoutHandle || !payoutHandle.includes("@")) {
          return res.status(400).json({ error: "PayPal email required" });
        }
        updateData.payoutHandle = payoutHandle;
      } else if (payoutMethod === "ach") {
        if (!routingNumber || !accountNumber) {
          return res.status(400).json({ error: "Routing and account numbers required" });
        }
        updateData.payoutBankName = bankName || null;
        updateData.payoutRoutingNumber = routingNumber;
        updateData.payoutAccountNumber = accountNumber;
        updateData.payoutAccountType = accountType || "checking";
      } else if (payoutMethod === "guber_credit") {
        const drop = await storage.getCashDrop(dropId);
        const bonusMultiplier = parseFloat(await getSetting("cash_drop_credit_bonus") || "1.2");
        const creditAmount = Math.round((attempt as any).rewardAmount * bonusMultiplier * 100) / 100;
        updateData.guberCreditAmount = creditAmount;
        updateData.payoutStatus = "paid";
        updateData.payoutSentAt = new Date();
        updateData.fundedFromSource = "internal_credit";

        await storage.createWalletTransaction({
          userId,
          type: "credit",
          amount: creditAmount,
          status: "available",
          description: `GUBER Credit from Cash Drop: ${drop?.title || "reward"} ($${(attempt as any).rewardAmount} + bonus)`,
        });
      }

      await storage.updateCashDropAttempt(attempt.id, updateData);

      res.json({ success: true, payoutMethod });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/cash-drops/mark-paid/:attemptId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const attemptId = parseInt(req.params.attemptId);
      const { payoutReference, fundedFromSource } = req.body;

      const attempt = await storage.getCashDropAttempt(attemptId);
      if (!attempt) return res.status(404).json({ error: "Attempt not found" });

      await storage.updateCashDropAttempt(attemptId, {
        payoutStatus: "paid",
        payoutSentAt: new Date(),
        payoutReference: payoutReference || null,
        fundedFromSource: fundedFromSource || (attempt as any).fundedFromSource || "guber_cash_app",
      } as any);

      await storage.createNotification({
        userId: attempt.userId,
        title: "Cash Drop Payout Sent!",
        body: `Your Cash Drop reward has been sent via ${(attempt as any).payoutMethod || "your chosen method"}. ${payoutReference ? `Reference: ${payoutReference}` : ""}`,
        type: "cash_drop",
        cashDropId: attempt.cashDropId,
      });

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "cash_drop_payout_sent",
        details: `Attempt ${attemptId}, ref: ${payoutReference || "none"}, source: ${fundedFromSource || "unknown"}`,
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/cash-drops/:id/reject-attempt/:attemptId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      const attemptId = parseInt(req.params.attemptId);
      const attempt = await storage.getCashDropAttempt(attemptId);
      if (!attempt) return res.status(404).json({ error: "Attempt not found" });

      await storage.updateCashDropAttempt(attemptId, {
        status: "rejected",
        payoutStatus: "none",
        rejectionReason: reason || "Proof did not meet requirements",
      });

      await storage.createNotification({
        userId: attempt.userId,
        title: "Cash Drop Submission Rejected",
        body: reason || "Your submission was reviewed and did not meet the requirements. You may try again if slots are still open.",
        type: "cash_drop",
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== SPONSORED CASH DROPS ====================

  // ==================== SPONSOR DROP STRIPE CHECKOUT ====================

  app.post("/api/stripe/create-sponsor-drop-session", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user || user.accountType !== "business") {
        return res.status(403).json({ error: "Business account required" });
      }
      const bizProfile = await storage.getBusinessProfile(userId);

      const {
        companyName, contactEmail, contactName, contactPhone, businessAddress, websiteUrl,
        requestedDropDate, targetZipCode, targetCityState, proposedBudget, cashContribution,
        sponsorMessage, sponsorshipType, promotionGoal, preferredTime,
        finalLocationRequested, brandingEnabled,
        rewardType, rewardDescription, rewardQuantity, noPurchaseRequiredText,
        disclaimerText, finalLocationMode, redemptionType, redemptionInstructions,
        numberOfWinners,
      } = req.body;

      if (!companyName || !contactEmail) {
        return res.status(400).json({ error: "Company name and contact email are required" });
      }

      const sponsorAmount = parseFloat(cashContribution);
      if (!sponsorAmount || sponsorAmount < 100) {
        return res.status(400).json({ error: "Minimum sponsor amount is $100" });
      }

      const winnersCount = Math.max(1, parseInt(numberOfWinners) || 1);
      const totalCents = Math.round(sponsorAmount * 100);
      const platformAmountDollars = Math.round(sponsorAmount * 0.35 * 100) / 100;
      const dropPoolAmountDollars = Math.round(sponsorAmount * 0.65 * 100) / 100;
      const estimatedPrizePerWinner = Math.round((dropPoolAmountDollars / winnersCount) * 100) / 100;

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.host}`;

      const session = await stripeMain.checkout.sessions.create({
        mode: "payment",
        success_url: `${baseUrl}/biz/sponsor-drop/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/biz/sponsor-drop/cancel`,
        customer_email: contactEmail || undefined,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "GUBER Sponsor a Drop",
                description: "Sponsor a local GUBER cash drop",
              },
              unit_amount: totalCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: "sponsor_drop",
          user_id: String(userId),
          business_profile_id: String(bizProfile?.id || ""),
          company_name: companyName || bizProfile?.companyName || "",
          logo_url: bizProfile?.companyLogo || "",
          contact_email: contactEmail,
          contact_name: contactName || "",
          contact_phone: contactPhone || "",
          business_address: businessAddress || "",
          website_url: websiteUrl || "",
          requested_drop_date: requestedDropDate || "",
          target_zip_code: targetZipCode || "",
          target_city_state: targetCityState || "",
          proposed_budget: String(proposedBudget || ""),
          sponsor_amount: String(sponsorAmount),
          platform_amount: String(platformAmountDollars),
          drop_pool_amount: String(dropPoolAmountDollars),
          winner_count: String(winnersCount),
          prize_per_winner: String(estimatedPrizePerWinner),
          sponsorship_type: sponsorshipType || "cash",
          sponsor_message: (sponsorMessage || "").substring(0, 500),
          promotion_goal: (promotionGoal || "").substring(0, 500),
          preferred_time: preferredTime || "",
          final_location_requested: finalLocationRequested ? "true" : "false",
          branding_enabled: brandingEnabled ? "true" : "false",
          reward_type: rewardType || "cash",
          reward_description: (rewardDescription || "").substring(0, 500),
          reward_quantity: String(rewardQuantity || ""),
          final_location_mode: finalLocationMode || "name_only",
          redemption_type: redemptionType || "visit_store",
          redemption_instructions: (redemptionInstructions || "").substring(0, 500),
          no_purchase_required_text: (noPurchaseRequiredText || "").substring(0, 500),
          disclaimer_text: (disclaimerText || "").substring(0, 500),
        },
        payment_intent_data: {
          metadata: {
            type: "sponsor_drop",
            user_id: String(userId),
            company_name: companyName || bizProfile?.companyName || "",
            sponsor_amount: String(sponsorAmount),
            platform_amount: String(platformAmountDollars),
            drop_pool_amount: String(dropPoolAmountDollars),
            winner_count: String(winnersCount),
            prize_per_winner: String(estimatedPrizePerWinner),
          },
        },
      });

      console.log(`[GUBER] Sponsor drop checkout session created: ${session.id} for ${companyName} ($${sponsorAmount})`);
      res.json({ checkoutUrl: session.url });
    } catch (err: any) {
      console.error("[GUBER] Sponsor drop checkout session error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/business/sponsor-drop", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user || user.accountType !== "business") {
        return res.status(403).json({ error: "Business account required" });
      }

      if (user.role !== "admin") {
        return res.status(400).json({ error: "Please use the Stripe payment flow to submit a sponsor request. This endpoint is reserved for admin use." });
      }
      const bizProfile = await storage.getBusinessProfile(userId);

      const {
        companyName, contactEmail, contactName, contactPhone, businessAddress, websiteUrl,
        requestedDropDate, targetZipCode, targetCityState, proposedBudget, cashContribution,
        sponsorMessage, sponsorshipType, promotionGoal, preferredTime,
        finalLocationRequested, brandingEnabled,
        rewardType, rewardDescription, rewardQuantity, noPurchaseRequiredText,
        disclaimerText, finalLocationMode, redemptionType, redemptionInstructions,
      } = req.body;

      if (!companyName || !contactEmail) {
        return res.status(400).json({ error: "Company name and contact email are required" });
      }

      const sponsor = await storage.createDropSponsor({
        businessProfileId: bizProfile?.id || null,
        businessId: userId,
        companyName: companyName || bizProfile?.companyName,
        logoUrl: bizProfile?.companyLogo || null,
        contactEmail,
        contactName: contactName || null,
        contactPhone: contactPhone || null,
        businessAddress: businessAddress || null,
        websiteUrl: websiteUrl || null,
        requestedDropDate: requestedDropDate || null,
        targetZipCode: targetZipCode || null,
        targetCityState: targetCityState || null,
        proposedBudget: proposedBudget ? parseFloat(proposedBudget) : null,
        cashContribution: cashContribution ? parseFloat(cashContribution) : null,
        sponsorMessage: sponsorMessage || null,
        sponsorshipType: sponsorshipType || "cash",
        promotionGoal: promotionGoal || null,
        preferredTime: preferredTime || null,
        finalLocationRequested: !!finalLocationRequested,
        brandingEnabled: !!brandingEnabled,
        paymentStatus: "pending",
        rewardType: rewardType || "cash",
        rewardDescription: rewardDescription || null,
        rewardQuantity: rewardQuantity ? parseInt(rewardQuantity) : null,
        noPurchaseRequiredText: noPurchaseRequiredText || null,
        disclaimerText: disclaimerText || null,
        finalLocationMode: finalLocationMode || "name_only",
        redemptionType: redemptionType || "visit_store",
        redemptionInstructions: redemptionInstructions || null,
        status: "pending",
      });

      // Notify all admin accounts
      const allUsers = await storage.getAllUsers();
      const admins = allUsers.filter((u) => u.role === "admin");
      for (const admin of admins) {
        await storage.createNotification({
          userId: admin.id,
          title: "New Cash Drop Sponsor Request",
          body: `${companyName} submitted a sponsored drop request. Review in Admin → Sponsors.`,
          type: "sponsor_request",
        });
      }

      res.json({ success: true, sponsorId: sponsor.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/drop-sponsors", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status } = req.query as { status?: string };
      const sponsors = await storage.getDropSponsors(status);
      res.json(sponsors);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/drop-sponsors/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const sponsor = await storage.getDropSponsor(id);
      if (!sponsor) return res.status(404).json({ error: "Sponsor not found" });
      res.json(sponsor);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/drop-sponsors/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const body = req.body as Record<string, unknown>;

      const updateData: Record<string, unknown> = {};

      const textFields = [
        "companyName", "logoUrl", "contactEmail", "contactName", "contactPhone",
        "businessAddress", "websiteUrl", "requestedDropDate", "targetZipCode",
        "targetCityState", "sponsorMessage", "sponsorshipType", "paymentStatus",
        "rewardType", "rewardDescription", "noPurchaseRequiredText", "disclaimerText",
        "finalLocationMode", "redemptionType", "redemptionInstructions", "adminNotes",
        "promotionGoal", "preferredTime",
      ] as const;
      for (const f of textFields) {
        if (body[f] !== undefined) updateData[f] = body[f] || null;
      }

      const numberFields = ["proposedBudget", "cashContribution", "rewardQuantity", "businessProfileId", "businessId", "approvedBy"] as const;
      for (const f of numberFields) {
        if (body[f] !== undefined) updateData[f] = body[f] ? Number(body[f]) : null;
      }

      if (body.finalLocationRequested !== undefined) updateData.finalLocationRequested = !!body.finalLocationRequested;
      if (body.brandingEnabled !== undefined) updateData.brandingEnabled = !!body.brandingEnabled;

      if (body.linkedDropId !== undefined) {
        updateData.linkedDropId = body.linkedDropId ? parseInt(String(body.linkedDropId)) : null;
      }

      if (body.status) {
        updateData.status = body.status as string;
        if (body.status === "approved") {
          updateData.approvedAt = new Date();
          updateData.approvedBy = req.session.userId;
        } else if (body.status === "rejected") {
          updateData.rejectedAt = new Date();
        }
      }

      const sponsor = await storage.updateDropSponsor(id, updateData);
      res.json(sponsor);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== GUBER RESUME API ====================

  function buildResumeData(user: any) {
    const memberSince = user.createdAt ? new Date(user.createdAt) : new Date();
    const monthsDiff = Math.max(0, Math.floor((Date.now() - memberSince.getTime()) / (1000 * 60 * 60 * 24 * 30)));
    let memberForDisplay: string;
    if (monthsDiff < 1) memberForDisplay = "Less than 1 month";
    else if (monthsDiff < 12) memberForDisplay = `${monthsDiff} month${monthsDiff !== 1 ? "s" : ""}`;
    else {
      const years = Math.floor(monthsDiff / 12);
      const rem = monthsDiff % 12;
      memberForDisplay = `${years} year${years !== 1 ? "s" : ""}${rem > 0 ? `, ${rem} month${rem !== 1 ? "s" : ""}` : ""}`;
    }

    const badges: string[] = [];
    if (user.day1OG) badges.push("Day-1 OG");
    const jc = user.jobsCompleted || 0;
    if (jc >= 100) badges.push("100 Jobs Completed");
    else if (jc >= 50) badges.push("50 Jobs Completed");
    else if (jc >= 10) badges.push("10 Jobs Completed");
    if ((user.reliabilityScore ?? 0) >= 95) badges.push("High Reliability");
    if ((user.proofConfidenceLevel || "") === "VERIFIED") badges.push("Proof Strong");

    return {
      userId: user.id,
      guberId: user.guberId,
      fullName: user.fullName,
      profilePhoto: user.profilePhoto,
      memberSince: memberSince.toISOString(),
      memberForDisplay,
      jobsCompleted: user.jobsCompleted || 0,
      jobsAccepted: user.jobsAccepted || 0,
      jobsConfirmed: user.jobsConfirmed || 0,
      canceledCount: user.canceledCount || 0,
      jobsDisputed: user.jobsDisputed || 0,
      averageRating: user.rating || 0,
      totalRatings: user.reviewCount || 0,
      reliabilityScore: user.reliabilityScore ?? 100,
      proofConfidenceScore: user.proofConfidenceScore ?? 0,
      proofConfidenceLevel: user.proofConfidenceLevel || "BASIC",
      categoryExperience: {
        vehicleInspections: user.vehicleInspections || 0,
        propertyChecks: user.propertyChecks || 0,
        marketplaceVerifications: user.marketplaceVerifications || 0,
        salvageChecks: user.salvageChecks || 0,
      },
      proofHistory: {
        reportsSubmitted: user.proofReportsSubmitted || 0,
        photosUploaded: user.photosSubmitted || 0,
        gpsVerifiedJobs: user.gpsVerifiedJobs || 0,
      },
      capabilitiesDescription: user.capabilitiesDescription || "",
      badges,
      successRate: user.jobsAccepted ? Math.round(((user.jobsCompleted || 0) / Math.max(user.jobsAccepted, 1)) * 100) : 100,
    };
  }

  app.get("/api/resume/me", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "User not found" });
      const resume = buildResumeData(user);
      const qualifications = await storage.getWorkerQualifications(user.id);
      res.json({ ...resume, qualifications });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/resume/:userId", requireAuth, async (req: Request, res: Response) => {
    try {
      const viewer = await storage.getUser(req.session.userId!);
      if (!viewer) return res.status(401).json({ message: "User not found" });
      const isAdmin = viewer.role === "admin";
      const isCompany = (viewer as any).accountType === "company" && (viewer as any).companyVerified === true;
      const targetId = parseInt(req.params.userId);

      let isBizUnlocked = false;
      let isBizViewer = false;
      if ((viewer as any).accountType === "business") {
        isBizViewer = true;
        const bizAcct = await storage.getBusinessAccount(viewer.id);
        if (bizAcct) {
          const unlocks = await storage.getBusinessUnlocks(bizAcct.id);
          isBizUnlocked = unlocks.some(u => u.userId === targetId);
        }
      }

      if (!isAdmin && !isCompany && !isBizViewer) {
        return res.status(403).json({ message: "Only verified company accounts and admins can view worker resumes" });
      }

      const target = await storage.getUser(targetId);
      if (!target) return res.status(404).json({ message: "User not found" });
      if (!(target as any).resumeVisibleToCompanies && !isAdmin) {
        return res.status(403).json({ message: "This worker's resume is not available" });
      }

      const resume = buildResumeData(target);
      const allQuals = await storage.getWorkerQualifications(targetId);
      const qualifications = isAdmin
        ? allQuals
        : allQuals
            .filter((q) => q.verificationStatus === "verified")
            .map(({ adminNotes, ...rest }) => rest);

      if (isBizViewer && !isBizUnlocked && !isAdmin) {
        const anonymized = {
          ...resume,
          fullName: undefined,
          name: undefined,
          email: undefined,
          phone: undefined,
          zipcode: undefined,
          profileImage: undefined,
          qualifications: qualifications.map(({ ...q }) => ({ ...q })),
          anonymized: true,
        };
        return res.json(anonymized);
      }

      res.json({ ...resume, qualifications });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/resume/me", requireAuth, async (req: Request, res: Response) => {
    try {
      const updates: any = {};
      if (typeof req.body.capabilitiesDescription === "string") {
        const { clean, blocked } = filterContactInfo(req.body.capabilitiesDescription);
        if (blocked) return res.status(400).json({ message: "Contact info not allowed in capabilities description" });
        updates.capabilitiesDescription = clean.slice(0, 1000);
      }
      if (typeof req.body.resumeVisibleToCompanies === "boolean") {
        updates.resumeVisibleToCompanies = req.body.resumeVisibleToCompanies;
      }
      if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No valid fields to update" });
      const updated = await storage.updateUser(req.session.userId!, updates);
      res.json({ capabilitiesDescription: (updated as any)?.capabilitiesDescription, resumeVisibleToCompanies: (updated as any)?.resumeVisibleToCompanies });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/resume/qualifications", requireAuth, async (req: Request, res: Response) => {
    try {
      const { qualificationName, documentUrl } = req.body;
      if (!qualificationName || typeof qualificationName !== "string") {
        return res.status(400).json({ message: "qualificationName is required" });
      }
      let safeDocUrl: string | null = null;
      if (documentUrl && typeof documentUrl === "string") {
        try {
          const parsed = new URL(documentUrl);
          if (parsed.protocol !== "https:") {
            return res.status(400).json({ message: "Document URL must use https" });
          }
          safeDocUrl = parsed.toString();
        } catch {
          return res.status(400).json({ message: "Invalid document URL" });
        }
      }
      const q = await storage.createQualification({
        userId: req.session.userId!,
        qualificationName: qualificationName.trim().slice(0, 200),
        documentUrl: safeDocUrl,
        verificationStatus: "pending",
      });
      res.status(201).json(q);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/resume/qualifications/:id/review", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { verificationStatus, adminNotes } = req.body;
      if (!["verified", "rejected", "pending"].includes(verificationStatus)) {
        return res.status(400).json({ message: "verificationStatus must be verified, rejected, or pending" });
      }
      const updated = await storage.updateQualification(id, {
        verificationStatus,
        adminNotes: adminNotes || null,
        reviewedAt: new Date(),
      } as any);
      if (!updated) return res.status(404).json({ message: "Qualification not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/resume/qualifications/pending", requireAdmin, async (req: Request, res: Response) => {
    try {
      const pending = await storage.getAllPendingQualifications();
      const enriched = await Promise.all(pending.map(async (q) => {
        const user = await storage.getUser(q.userId);
        return { ...q, workerName: user?.fullName || "Unknown", workerGuberId: (user as any)?.guberId || "" };
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/resume/:userId/company-verify", requireAdmin, async (req: Request, res: Response) => {
    try {
      const targetId = parseInt(req.params.userId);
      const target = await storage.getUser(targetId);
      if (!target) return res.status(404).json({ message: "User not found" });
      const { companyVerified, companyVerificationStatus, companyLegalName, companyEntityType } = req.body;
      const updates: any = {};
      if (typeof companyVerified === "boolean") updates.companyVerified = companyVerified;
      if (companyVerificationStatus) updates.companyVerificationStatus = companyVerificationStatus;
      if (companyLegalName) updates.companyLegalName = companyLegalName;
      if (companyEntityType) updates.companyEntityType = companyEntityType;
      if (companyVerified === true) updates.accountType = "company";
      const updated = await storage.updateUser(targetId, updates);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/wallet-transactions/:userId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (!userId || isNaN(userId)) return res.status(400).json({ error: "userId required" });
      const txns = await db.select().from(walletTransactions)
        .where(eq(walletTransactions.userId, userId))
        .orderBy(desc(walletTransactions.createdAt));
      res.json(txns);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/wallet-transactions/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      await db.delete(walletTransactions).where(eq(walletTransactions.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── ADMIN PAYOUT CONTROL ──────────────────────────────────────────────────

  // Find all jobs where Stripe capture happened but the worker transfer was never sent
  app.get("/api/admin/payout/missed", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const rows = await db.execute(sql`
        SELECT j.id, j.title, j.assigned_helper_id, j.stripe_payment_intent_id,
               j.payout_status, j.confirmed_at, j.charged_at,
               j.worker_gross_share, j.helper_payout,
               u.full_name AS worker_name, u.email AS worker_email,
               u.stripe_account_id, u.stripe_account_status
        FROM jobs j
        JOIN users u ON u.id = j.assigned_helper_id
        WHERE j.payout_status = 'paid_out'
          AND j.stripe_payment_intent_id IS NOT NULL
          AND j.stripe_transfer_id IS NULL
          AND j.assigned_helper_id IS NOT NULL
        ORDER BY j.confirmed_at DESC
      `);
      res.json(rows.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Force-transfer for a specific job
  app.post("/api/admin/payout/force-transfer/:jobId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (!job.assignedHelperId) return res.status(400).json({ error: "Job has no assigned worker" });

      const worker = await storage.getUser(job.assignedHelperId);
      if (!worker) return res.status(404).json({ error: "Worker not found" });

      const workerAccountId = (req.body.stripeAccountId) || (worker as any).stripeAccountId;
      if (!workerAccountId) return res.status(400).json({ error: "Worker has no Stripe Connect account. Provide stripeAccountId in body to override." });

      const workerShare = (job as any).workerGrossShare || job.helperPayout || 0;
      if (workerShare <= 0) return res.status(400).json({ error: "Worker share is $0" });

      // Check for existing transfer to prevent double-pay
      if ((job as any).stripeTransferId) {
        return res.status(409).json({ error: `Transfer already exists: ${(job as any).stripeTransferId}` });
      }

      const transfer = await stripe.transfers.create({
        amount: Math.round(workerShare * 100),
        currency: "usd",
        destination: workerAccountId,
        transfer_group: `job_${job.id}`,
        description: `GUBER admin payout: ${job.title}`,
        metadata: { jobId: String(job.id), userId: String(job.assignedHelperId), admin: "true" },
      });

      await storage.updateJob(job.id, { stripeTransferId: transfer.id, paidOutAt: new Date() } as any);

      // Update or create wallet transaction
      const existingTxns = await storage.getWalletByUser(job.assignedHelperId);
      const jobTxn = existingTxns.find((t) => t.jobId === job.id && t.type === "earning");
      if (jobTxn) {
        await storage.updateWalletTransaction(jobTxn.id, {
          stripeTransferId: transfer.id,
          status: "available",
          description: `Payout sent (admin forced): $${workerShare.toFixed(2)} for "${job.title}"`,
        } as any);
      } else {
        await storage.createWalletTransaction({
          userId: job.assignedHelperId,
          jobId: job.id,
          type: "earning",
          amount: workerShare,
          status: "available",
          stripeTransferId: transfer.id,
          description: `Payout sent (admin forced): $${workerShare.toFixed(2)} for "${job.title}"`,
        });
      }

      await notify(job.assignedHelperId, {
        title: "Payment Sent",
        body: `$${workerShare.toFixed(2)} for "${job.title}" has been sent to your Stripe account. Expect it in your bank within 2–7 business days.`,
      }, "/wallet");

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "admin_force_transfer",
        details: `Job ${jobId} transfer=${transfer.id} amount=$${workerShare} destination=${workerAccountId}`,
      });

      res.json({ success: true, transferId: transfer.id, amount: workerShare });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sweep all missed payouts (all captured jobs with no transfer)
  app.post("/api/admin/payout/sweep", requireAdmin, async (req: Request, res: Response) => {
    try {
      const rows = await db.execute(sql`
        SELECT j.id, j.title, j.assigned_helper_id,
               j.worker_gross_share, j.helper_payout,
               u.stripe_account_id, u.stripe_account_status
        FROM jobs j
        JOIN users u ON u.id = j.assigned_helper_id
        WHERE j.payout_status = 'paid_out'
          AND j.stripe_payment_intent_id IS NOT NULL
          AND j.stripe_transfer_id IS NULL
          AND j.assigned_helper_id IS NOT NULL
          AND u.stripe_account_id IS NOT NULL
          AND u.stripe_account_status = 'active'
      `);

      const results: { jobId: number; title: string; status: string; transferId?: string; error?: string; amount: number }[] = [];

      for (const row of rows.rows as any[]) {
        const workerShare = parseFloat(row.worker_gross_share || row.helper_payout || 0);
        if (workerShare <= 0) {
          results.push({ jobId: row.id, title: row.title, status: "skipped", error: "amount is $0", amount: 0 });
          continue;
        }
        try {
          const transfer = await stripe.transfers.create({
            amount: Math.round(workerShare * 100),
            currency: "usd",
            destination: row.stripe_account_id,
            transfer_group: `job_${row.id}`,
            description: `GUBER admin sweep: ${row.title}`,
            metadata: { jobId: String(row.id), userId: String(row.assigned_helper_id), admin: "sweep" },
          });

          await storage.updateJob(row.id, { stripeTransferId: transfer.id, paidOutAt: new Date() } as any);

          const existingTxns = await storage.getWalletByUser(row.assigned_helper_id);
          const jobTxn = existingTxns.find((t: any) => t.jobId === row.id && t.type === "earning");
          if (jobTxn) {
            await storage.updateWalletTransaction(jobTxn.id, {
              stripeTransferId: transfer.id,
              status: "available",
              description: `Payout sent (sweep): $${workerShare.toFixed(2)} for "${row.title}"`,
            } as any);
          } else {
            await storage.createWalletTransaction({
              userId: row.assigned_helper_id,
              jobId: row.id,
              type: "earning",
              amount: workerShare,
              status: "available",
              stripeTransferId: transfer.id,
              description: `Payout sent (sweep): $${workerShare.toFixed(2)} for "${row.title}"`,
            });
          }

          await notify(row.assigned_helper_id, {
            title: "Payment Sent",
            body: `$${workerShare.toFixed(2)} for "${row.title}" has been transferred to your Stripe account.`,
          }, "/wallet");

          results.push({ jobId: row.id, title: row.title, status: "success", transferId: transfer.id, amount: workerShare });
        } catch (e: any) {
          results.push({ jobId: row.id, title: row.title, status: "failed", error: e.message, amount: workerShare });
        }
      }

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "admin_payout_sweep",
        details: `Swept ${results.length} jobs: ${results.filter((r) => r.status === "success").length} succeeded, ${results.filter((r) => r.status === "failed").length} failed`,
      });

      res.json({ results, total: results.length, succeeded: results.filter((r) => r.status === "success").length, failed: results.filter((r) => r.status === "failed").length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Manually create a wallet transaction for any user
  app.post("/api/admin/wallet-transactions/manual", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { userId, type, amount, description, status, jobId } = req.body;
      if (!userId || !type || amount === undefined) return res.status(400).json({ error: "userId, type, amount required" });
      if (isNaN(parseFloat(amount)) || parseFloat(amount) === 0) return res.status(400).json({ error: "amount must be a non-zero number" });

      const txn = await storage.createWalletTransaction({
        userId: parseInt(userId),
        jobId: jobId ? parseInt(jobId) : null,
        type,
        amount: parseFloat(amount),
        status: status || "available",
        description: description || `Manual admin adjustment`,
      });

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "admin_manual_wallet_txn",
        details: `userId=${userId} type=${type} amount=${amount} status=${status || "available"} desc="${description}"`,
      });

      res.json(txn);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update status (and optionally description/amount) on an existing wallet transaction
  app.patch("/api/admin/wallet-transactions/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const { status, description, amount } = req.body;
      const updates: any = {};
      if (status) updates.status = status;
      if (description !== undefined) updates.description = description;
      if (amount !== undefined) updates.amount = parseFloat(amount);
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "Nothing to update" });

      const updated = await storage.updateWalletTransaction(id, updates);

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "admin_edit_wallet_txn",
        details: `txnId=${id} changes=${JSON.stringify(updates)}`,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── USER FEEDBACK ─────────────────────────────────────────────────────────
  app.post("/api/feedback", requireAuth, async (req: Request, res: Response) => {
    try {
      const { category = "general", subject, message } = req.body;
      if (!message?.trim()) return res.status(400).json({ message: "Feedback message is required" });
      if (message.trim().length > 1000) return res.status(400).json({ message: "Feedback must be 1000 characters or less" });

      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "User not found" });

      // Save the feedback
      await db.insert(userFeedback).values({
        userId: req.session.userId!,
        category,
        subject: subject?.trim() || null,
        message: message.trim(),
      });

      // Auto-response in-app notification
      const autoResponse = "Thank you for your feedback! We take every submission into consideration to make GUBER the world's greatest economic platform. We're nothing without you. 💚";
      await storage.createNotification({
        userId: req.session.userId!,
        title: "Feedback Received!",
        body: autoResponse,
        type: "system",
      });

      // Auto-response email
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        if (user.email) {
          await resend.emails.send({
            from: "GUBER <no-reply@guberapp.app>",
            to: user.email,
            subject: "Thanks for your feedback, " + (user.firstName || "there") + " 💚",
            html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
              <h2 style="color:#22C55E">We got your feedback!</h2>
              <p>${autoResponse}</p>
              <p style="color:#888;font-size:12px;margin-top:24px">GUBER GLOBAL LLC · Greensboro, NC · <a href="https://guberapp.app">guberapp.app</a></p>
            </div>`,
          });
        }
      } catch (emailErr: any) {
        console.error("[GUBER][feedback] email failed:", emailErr.message);
      }

      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "feedback_submitted",
        details: `Category: ${category}. Subject: ${subject || "none"}`,
      });

      res.status(201).json({ success: true, message: autoResponse });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/feedback", requireAdmin, async (req: Request, res: Response) => {
    try {
      const statusFilter = req.query.status as string | undefined;
      const conditions = [];
      if (statusFilter && ["new", "read", "addressed"].includes(statusFilter)) {
        conditions.push(eq(userFeedback.status, statusFilter));
      }
      const rows = await db.select({
        id: userFeedback.id,
        userId: userFeedback.userId,
        category: userFeedback.category,
        subject: userFeedback.subject,
        message: userFeedback.message,
        status: userFeedback.status,
        adminNote: userFeedback.adminNote,
        createdAt: userFeedback.createdAt,
        userName: usersTable.username,
        userEmail: usersTable.email,
      })
        .from(userFeedback)
        .leftJoin(usersTable, eq(userFeedback.userId, usersTable.id))
        .where(conditions.length > 0 ? conditions[0] : undefined)
        .orderBy(desc(userFeedback.createdAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/feedback/unread-count", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await db.select({ count: sql<number>`count(*)::int` })
        .from(userFeedback)
        .where(eq(userFeedback.status, "new"));
      res.json({ count: result[0]?.count ?? 0 });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/feedback/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const feedbackId = parseInt(req.params.id);
      const { status, adminNote } = req.body;
      const validStatuses = ["new", "read", "addressed"];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const update: any = {};
      if (status) update.status = status;
      if (adminNote !== undefined) update.adminNote = adminNote;
      await db.update(userFeedback).set(update).where(eq(userFeedback.id, feedbackId));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── OBSERVATION MARKETPLACE ───────────────────────────────────────────────

  app.post("/api/observations", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const submitter = await storage.getUser(userId);
      if (submitter?.accountType === "business") {
        return res.status(403).json({ error: "Business accounts cannot submit observations. Only individual helper accounts can submit." });
      }
      const { observationType, locationLat, locationLng, address, photoURLs, notes, tags } = req.body;
      if (!observationType) return res.status(400).json({ error: "observationType required" });
      if (locationLat === undefined || locationLat === null || locationLng === undefined || locationLng === null) {
        return res.status(400).json({ error: "GPS location required" });
      }
      if (!address) return res.status(400).json({ error: "Address required" });
      if (!photoURLs || !Array.isArray(photoURLs) || photoURLs.length < 1) {
        return res.status(400).json({ error: "At least one photo required" });
      }
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const obs = await storage.createObservation({
        helperId: userId,
        observationType,
        locationLat,
        locationLng,
        address,
        photoURLs,
        notes: notes || null,
        tags: tags || [],
        status: "open",
        expiresAt,
      });
      res.json(obs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/observations", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const profile = await storage.getBusinessProfile(userId);
      const isCompanyUser = profile || user?.accountType === "business";
      if (!isCompanyUser) return res.status(403).json({ error: "Business account required" });

      const { type, city, state, zip, lat, lng, radius } = req.query as any;
      const latNum = lat ? parseFloat(lat) : undefined;
      const lngNum = lng ? parseFloat(lng) : undefined;
      const radiusNum = radius ? parseFloat(radius) : undefined;
      const obs = await storage.getObservations({ type, city, state, zip, lat: latNum, lng: lngNum, radius: radiusNum });

      const result = obs.map((o) => {
        const isPurchased = o.purchasedByCompanyId === profile?.id;
        if (isPurchased) return { ...o, _purchased: true };
        return {
          ...o,
          address: o.address.replace(/\d+\s+[\w\s]+,/, "[Address Hidden],"),
          photoURLs: o.photoURLs.map((_: string) => "blurred"),
          notes: null,
          _purchased: false,
        };
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/observations/my", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const obs = await storage.getObservationsByHelper(userId);
      res.json(obs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/observations/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const obs = await storage.getObservation(parseInt(req.params.id));
      if (!obs) return res.status(404).json({ error: "Observation not found" });

      const profile = await storage.getBusinessProfile(userId);
      const isHelper = obs.helperId === userId;
      const isPurchaser = obs.purchasedByCompanyId === profile?.id;
      const isAdmin = (await storage.getUser(userId))?.role === "admin";

      if (!isHelper && !isPurchaser && !isAdmin && !profile) {
        return res.status(403).json({ error: "Business account required" });
      }
      if (!isHelper && !isPurchaser && !isAdmin) {
        return res.json({
          ...obs,
          address: obs.address.replace(/\d+\s+[\w\s]+,/, "[Address Hidden],"),
          photoURLs: obs.photoURLs.map((_: string) => "blurred"),
          notes: null,
          _purchased: false,
        });
      }
      res.json({ ...obs, _purchased: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/observations/:id/purchase", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const obsId = parseInt(req.params.id);
      const { price } = req.body;
      if (![5, 10, 20].includes(price)) return res.status(400).json({ error: "Price must be 5, 10, or 20" });

      const profile = await storage.getBusinessProfile(userId);
      if (!profile) return res.status(403).json({ error: "Business account required" });

      const obs = await storage.getObservation(obsId);
      if (!obs) return res.status(404).json({ error: "Observation not found" });

      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) return res.status(400).json({ error: "No payment method on file" });

      const claimed = await storage.claimObservationForPurchase(obsId, profile.id, price);
      if (!claimed) {
        return res.status(409).json({ error: "Observation is no longer available for purchase" });
      }

      let paymentIntent;
      try {
        paymentIntent = await stripeMain.paymentIntents.create(
          {
            amount: price * 100,
            currency: "usd",
            customer: user.stripeCustomerId,
            confirm: true,
            payment_method_types: ["card"],
            description: `Observation #${obsId} purchase`,
            metadata: { observationId: String(obsId), buyerUserId: String(userId) },
            off_session: true,
          },
          { idempotencyKey: `obs-purchase-${obsId}-${profile.id}` }
        );
      } catch (stripeErr: any) {
        await storage.updateObservation(obsId, { status: "open", purchasedByCompanyId: null, purchasePrice: null, purchasedAt: null });
        return res.status(402).json({ error: stripeErr.message || "Payment failed" });
      }

      if (paymentIntent.status !== "succeeded") {
        await storage.updateObservation(obsId, { status: "open", purchasedByCompanyId: null, purchasePrice: null, purchasedAt: null });
        return res.status(402).json({ error: "Payment failed" });
      }

      await storage.updateObservation(obsId, { status: "purchased" });

      try {
        await storage.createWalletTransaction({
          userId: obs.helperId,
          type: "observation_sale",
          amount: price * 0.8,
          status: "completed",
          description: `Observation #${obsId} sold for $${price} — 80% payout`,
        });
      } catch (walletErr) {
        console.error(`[obs] WARN: wallet credit failed for observation #${obsId} helper ${obs.helperId}:`, walletErr);
      }

      try {
        await storage.createNotification({
          userId: obs.helperId,
          title: "Observation Sold!",
          body: `Your observation was purchased for $${price}. $${(price * 0.8).toFixed(2)} credited to your wallet.`,
          type: "observation",
        });
      } catch (notifErr) {
        console.error(`[obs] WARN: notification failed for observation #${obsId} helper ${obs.helperId}:`, notifErr);
      }

      const updated = await storage.getObservation(obsId);
      res.json({ success: true, observation: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/observations/:id/convert-to-job", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const obsId = parseInt(req.params.id);

      const profile = await storage.getBusinessProfile(userId);
      if (!profile) return res.status(403).json({ error: "Business account required" });

      const obs = await storage.getObservation(obsId);
      if (!obs) return res.status(404).json({ error: "Observation not found" });
      if (obs.status !== "purchased" || obs.purchasedByCompanyId !== profile.id) {
        return res.status(403).json({ error: "You must purchase this observation before converting it to a job" });
      }

      const job = await storage.createJob({
        title: `${obs.observationType} — ${obs.address.split(",")[0]}`,
        description: obs.notes || `Observation of type: ${obs.observationType}`,
        category: "Verify & Inspect",
        serviceType: obs.observationType,
        location: obs.address,
        lat: obs.locationLat,
        lng: obs.locationLng,
        postedById: userId,
        status: "draft",
        isPublished: false,
        isPaid: false,
        jobImage: obs.photoURLs[0] || null,
        jobDetails: { fromObservationId: String(obsId), observationType: obs.observationType },
      });

      await storage.updateObservation(obsId, {
        status: "converted_to_job",
        convertedToJobId: job.id,
      });

      res.json({ success: true, jobId: job.id, job });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/workers/clock-in", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      await storage.updateUser(userId, { isAvailable: true, clockedInAt: new Date(), clockedOutAt: null });
      res.json({ success: true, clockedInAt: new Date() });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/workers/clock-out", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      await storage.updateUser(userId, { isAvailable: false, clockedInAt: null, clockedOutAt: new Date() });
      res.json({ success: true, clockedOutAt: new Date() });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/direct-offers", requireAuth, async (req: Request, res: Response) => {
    try {
      const hirerUserId = req.session!.userId!;
      const { workerUserId, offerAmount, category, jobSummary, jobType, startTiming, estimatedMinutes, estimatedDistance, location, zip, lat, lng } = req.body;

      if (!workerUserId || !offerAmount || !category || !jobSummary) {
        return res.status(400).json({ message: "workerUserId, offerAmount, category, and jobSummary are required" });
      }
      if (offerAmount < 5) {
        return res.status(400).json({ message: "Minimum offer amount is $5" });
      }

      const worker = await storage.getUser(workerUserId);
      if (!worker) return res.status(404).json({ message: "Worker not found" });
      if (!worker.isAvailable || !worker.clockedInAt) {
        return res.status(400).json({ message: "Worker is not currently clocked in" });
      }

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      const offer = await storage.createDirectOffer({
        hirerUserId,
        workerUserId,
        initialOfferAmount: offerAmount,
        currentOfferAmount: offerAmount,
        category,
        jobSummary,
        jobType: jobType || "direct",
        startTiming: startTiming || "asap",
        estimatedMinutes: estimatedMinutes || null,
        estimatedDistance: estimatedDistance || null,
        location: location || null,
        zip: zip || null,
        lat: lat || null,
        lng: lng || null,
        status: "sent",
        expiresAt,
      });

      await storage.createNotification({
        userId: workerUserId,
        title: "New Job Offer",
        body: `You received a $${offerAmount} offer for ${category}. Tap to review.`,
        type: "direct_offer",
        jobId: null,
      });

      res.json(offer);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/direct-offers/sent", requireAuth, async (req: Request, res: Response) => {
    try {
      const offers = await storage.getDirectOffersByHirer(req.session!.userId!);
      res.json(offers);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/direct-offers/received", requireAuth, async (req: Request, res: Response) => {
    try {
      const offers = await storage.getDirectOffersByWorker(req.session!.userId!);
      const sanitized = offers.map(o => {
        if (!o.fundedAt) {
          return { ...o, hirerUserId: undefined, location: undefined };
        }
        return o;
      });
      res.json(sanitized);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/direct-offers/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const offer = await storage.getDirectOffer(parseInt(req.params.id));
      if (!offer) return res.status(404).json({ message: "Offer not found" });

      const userId = req.session!.userId!;
      if (offer.hirerUserId !== userId && offer.workerUserId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      let responseData: any = { ...offer };
      const isUnlocked = !!offer.fundedAt;

      if (!isUnlocked) {
        if (userId === offer.workerUserId) {
          const hirer = await storage.getUser(offer.hirerUserId);
          responseData.hirerInfo = hirer ? {
            rating: hirer.rating,
            reviewCount: hirer.reviewCount,
            trustScore: hirer.trustScore,
            jobsCompleted: hirer.jobsCompleted,
          } : null;
          responseData.hirerUserId = undefined;
          responseData.location = undefined;
        }
      } else {
        if (userId === offer.workerUserId) {
          const hirer = await storage.getUser(offer.hirerUserId);
          responseData.hirerProfile = hirer ? {
            id: hirer.id,
            fullName: hirer.fullName,
            profilePhoto: hirer.profilePhoto,
            rating: hirer.rating,
            reviewCount: hirer.reviewCount,
            guberId: hirer.guberId,
          } : null;
        }
        if (userId === offer.hirerUserId) {
          const worker = await storage.getUser(offer.workerUserId);
          responseData.workerProfile = worker ? {
            id: worker.id,
            fullName: worker.fullName,
            profilePhoto: worker.profilePhoto,
            rating: worker.rating,
            reviewCount: worker.reviewCount,
            guberId: worker.guberId,
          } : null;
        }
      }

      res.json(responseData);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/direct-offers/:id/counter", requireAuth, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      const userId = req.session!.userId!;
      const { counterPct } = req.body;

      if (![5, 10, 15].includes(counterPct)) {
        return res.status(400).json({ message: "Counter must be 5%, 10%, or 15%" });
      }

      const offer = await storage.getDirectOffer(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      const counterableStatuses = ["sent", "countered_by_worker", "countered_by_hirer"];
      if (!counterableStatuses.includes(offer.status)) return res.status(400).json({ message: "Offer cannot be countered in current state" });
      if (new Date() > offer.expiresAt) return res.status(400).json({ message: "Offer has expired" });

      const isWorker = userId === offer.workerUserId;
      const isHirer = userId === offer.hirerUserId;
      if (!isWorker && !isHirer) return res.status(403).json({ message: "Not authorized" });

      if (offer.lastCounterBy === (isWorker ? "worker" : "hirer")) {
        return res.status(400).json({ message: "Waiting for the other party to respond" });
      }

      const myCounterCount = isWorker ? (offer.counterCountWorker || 0) : (offer.counterCountHirer || 0);
      if (myCounterCount >= 2) {
        return res.status(400).json({ message: "Counter limit reached. You may only Accept or Decline." });
      }

      let increase = Math.round(offer.currentOfferAmount * (counterPct / 100) * 100) / 100;
      if (increase < 2) increase = 2;
      const newAmount = Math.round((offer.currentOfferAmount + increase) * 100) / 100;

      const updateData: any = {
        currentOfferAmount: newAmount,
        lastCounterBy: isWorker ? "worker" : "hirer",
        lastCounterPct: counterPct,
        status: isWorker ? "countered_by_worker" : "countered_by_hirer",
      };
      if (isWorker) updateData.counterCountWorker = (offer.counterCountWorker || 0) + 1;
      else updateData.counterCountHirer = (offer.counterCountHirer || 0) + 1;

      const updated = await storage.updateDirectOffer(offerId, updateData);

      const otherUserId = isWorker ? offer.hirerUserId : offer.workerUserId;
      await storage.createNotification({
        userId: otherUserId,
        title: "Counter Offer Received",
        body: `${isWorker ? "Worker" : "Hirer"} countered with +${counterPct}% ($${newAmount.toFixed(2)}). Tap to respond.`,
        type: "offer_counter",
        jobId: null,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/direct-offers/:id/accept", requireAuth, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      const userId = req.session!.userId!;
      const offer = await storage.getDirectOffer(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      if (offer.workerUserId !== userId) return res.status(403).json({ message: "Only the worker can accept" });
      const acceptableStatuses = ["sent", "countered_by_worker", "countered_by_hirer"];
      if (!acceptableStatuses.includes(offer.status)) return res.status(400).json({ message: "Offer cannot be accepted in current state" });
      if (new Date() > offer.expiresAt) return res.status(400).json({ message: "Offer has expired" });

      const updated = await storage.updateDirectOffer(offerId, {
        status: "agreed_payment_pending",
        acceptedAt: new Date(),
        agreedAt: new Date(),
      });

      await storage.createNotification({
        userId: offer.hirerUserId,
        title: "Offer Accepted",
        body: `Worker accepted your $${offer.currentOfferAmount.toFixed(2)} offer. Complete payment to confirm.`,
        type: "offer_accepted",
        jobId: null,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/direct-offers/:id/decline", requireAuth, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      const userId = req.session!.userId!;
      const offer = await storage.getDirectOffer(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      if (offer.workerUserId !== userId && offer.hirerUserId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const declinableStatuses = ["sent", "countered_by_worker", "countered_by_hirer"];
      if (!declinableStatuses.includes(offer.status)) return res.status(400).json({ message: "Offer cannot be declined in current state" });

      const updated = await storage.updateDirectOffer(offerId, {
        status: "declined",
        declinedAt: new Date(),
      });

      const otherUserId = userId === offer.workerUserId ? offer.hirerUserId : offer.workerUserId;
      await storage.createNotification({
        userId: otherUserId,
        title: "Offer Declined",
        body: `The offer for $${offer.currentOfferAmount.toFixed(2)} was declined.`,
        type: "offer_declined",
        jobId: null,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/direct-offers/:id/create-payment", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      const userId = req.session!.userId!;
      const offer = await storage.getDirectOffer(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      if (offer.hirerUserId !== userId) return res.status(403).json({ message: "Only the hirer can pay" });
      if (offer.status !== "agreed_payment_pending" && offer.status !== "payment_pending") return res.status(400).json({ message: "Offer must be accepted by worker before payment" });
      if (offer.fundedAt) return res.status(400).json({ message: "Already funded" });
      if (new Date() > offer.expiresAt) return res.status(400).json({ message: "Offer has expired" });

      const worker = await storage.getUser(offer.workerUserId);
      if (!worker) return res.status(400).json({ message: "Worker not found" });
      const workerStripeAccountId = (worker as any)?.stripeAccountId;
      const workerStripeStatus = (worker as any)?.stripeAccountStatus;
      if (!workerStripeAccountId || workerStripeStatus !== "active") {
        return res.status(400).json({ message: "Worker payment setup incomplete. Cannot process payment." });
      }

      const host = req.get("host") || "localhost:5000";
      const protocol = req.get("x-forwarded-proto") || "http";
      const baseUrl = `${protocol}://${host}`;

      const feeConfig = await getActiveFeeConfig();

      const offerAmount = offer.currentOfferAmount;
      const workerShare = Math.round(offerAmount * (1 - feeConfig.platformFeeRate) * 100) / 100;
      const workerShareCents = Math.round(workerShare * 100);

      const { gross: grossCharge, stripeFee } = grossUpForStripe(offerAmount);
      const grossChargeCents = Math.round(grossCharge * 100);

      const applicationFeeCents = grossChargeCents - workerShareCents;

      const hirer = await storage.getUser(userId);
      const workerName = worker.fullName || "worker";

      const lineItems: any[] = [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `GUBER Direct Offer: ${offer.jobSummary.substring(0, 60)}`,
              description: `Payment captured immediately · ${workerName} receives $${workerShare.toFixed(2)}`,
            },
            unit_amount: Math.round(offerAmount * 100),
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Payment Processing Fee",
              description: "Stripe card processing (2.9% + 30¢) — passed through at cost",
            },
            unit_amount: Math.round(stripeFee * 100),
          },
          quantity: 1,
        },
      ];

      const stripeSession = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        customer_email: hirer?.email || undefined,
        line_items: lineItems,
        mode: "payment",
        payment_intent_data: {
          description: `GUBER Direct Offer #${offerId} | ${offer.jobSummary.substring(0, 60)}`,
          application_fee_amount: applicationFeeCents,
          transfer_data: {
            destination: workerStripeAccountId,
          },
          metadata: {
            offerId: String(offerId),
            hirerUserId: String(userId),
            workerUserId: String(offer.workerUserId),
            flowType: "direct_offer",
            offerAmount: String(offerAmount),
            jobSummary: offer.jobSummary.substring(0, 200),
          },
        },
        success_url: `${baseUrl}/direct-offers/${offerId}?payment_session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/direct-offers/${offerId}`,
        metadata: {
          offerId: String(offerId),
          hirerUserId: String(userId),
          workerUserId: String(offer.workerUserId),
          type: "direct_offer_payment",
        },
      });

      await storage.updateDirectOffer(offerId, {
        stripeSessionId: stripeSession.id,
        status: "payment_pending",
      });

      console.log(`[GUBER] Direct offer #${offerId} payment session created: ${stripeSession.id}, gross=$${grossCharge}, workerShare=$${workerShare}, fee=$${(grossCharge - workerShare).toFixed(2)}`);

      res.json({
        checkoutUrl: stripeSession.url,
        offerId,
        grossCharge,
        stripeFee,
        workerShare,
        platformFee: Math.round((offerAmount * feeConfig.platformFeeRate) * 100) / 100,
      });
    } catch (err: any) {
      console.error("[GUBER] direct offer create-payment error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/direct-offers/:id/confirm-payment", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      const userId = req.session!.userId!;
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ message: "sessionId required" });

      const offer = await storage.getDirectOffer(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      if (offer.hirerUserId !== userId) return res.status(403).json({ message: "Only the hirer can confirm payment" });
      if (offer.fundedAt) return res.json(offer);

      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
      const isPaid = stripeSession.payment_status === "paid" || stripeSession.status === "complete";
      if (!isPaid) return res.status(400).json({ message: "Payment not completed" });
      if (stripeSession.metadata?.type !== "direct_offer_payment") return res.status(400).json({ message: "Invalid session type" });
      if (stripeSession.metadata?.offerId !== String(offerId)) return res.status(400).json({ message: "Session offer mismatch" });

      const paymentIntentId = stripeSession.payment_intent as string;
      let chargeId: string | null = null;
      if (paymentIntentId) {
        try {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          chargeId = (pi.latest_charge as string) || null;
        } catch (e) {
          console.error("[GUBER] Failed to retrieve charge ID for offer:", e);
        }
      }

      const feeConfig = await getActiveFeeConfig();
      const offerAmount = offer.currentOfferAmount;
      const workerShare = Math.round(offerAmount * (1 - feeConfig.platformFeeRate) * 100) / 100;
      const platformFee = Math.round(offerAmount * feeConfig.platformFeeRate * 100) / 100;
      const { gross: grossCharge, stripeFee } = grossUpForStripe(offerAmount);

      const now = new Date();

      const updated = await storage.updateDirectOffer(offerId, {
        status: "funded",
        paidAt: now,
        fundedAt: now,
        stripePaymentIntentId: paymentIntentId,
      });

      const payment = await storage.createGuberPayment({
        offerId,
        jobId: offer.jobId || null,
        payerUserId: offer.hirerUserId,
        payeeUserId: offer.workerUserId,
        grossAmount: grossCharge,
        platformFeeAmount: platformFee,
        stripeFeeEstimate: stripeFee,
        netToWorker: workerShare,
        currency: "usd",
        stripePaymentIntentId: paymentIntentId,
        stripeChargeId: chargeId,
        stripeCheckoutSessionId: sessionId,
        paymentStatus: "funded",
        fundedAt: now,
      });

      await storage.createMoneyLedgerEntry({
        paymentId: payment.id,
        jobId: offer.jobId || null,
        userIdOwner: offer.hirerUserId,
        userIdCounterparty: offer.workerUserId,
        ledgerType: "offer_funded",
        amount: -grossCharge,
        currency: "usd",
        sourceSystem: "stripe",
        sourceReferenceId: paymentIntentId,
        stripeObjectType: "payment_intent",
        stripeObjectId: paymentIntentId,
        description: `Hirer funded direct offer #${offerId}: $${grossCharge.toFixed(2)} charged (worker receives $${workerShare.toFixed(2)}, platform fee $${platformFee.toFixed(2)}, Stripe fee ~$${stripeFee.toFixed(2)})`,
        metadataJson: {
          offerId,
          offerAmount,
          grossCharge,
          workerShare,
          platformFee,
          stripeFee,
          flowType: "direct_offer",
        },
        eventTime: now,
      });

      await storage.createMoneyLedgerEntry({
        paymentId: payment.id,
        jobId: offer.jobId || null,
        userIdOwner: offer.workerUserId,
        userIdCounterparty: offer.hirerUserId,
        ledgerType: "offer_earned",
        amount: workerShare,
        currency: "usd",
        sourceSystem: "stripe",
        sourceReferenceId: paymentIntentId,
        stripeObjectType: "payment_intent",
        stripeObjectId: paymentIntentId,
        description: `Worker earned $${workerShare.toFixed(2)} from direct offer #${offerId} (captured immediately)`,
        metadataJson: {
          offerId,
          offerAmount,
          workerShare,
          flowType: "direct_offer",
        },
        eventTime: now,
      });

      await storage.createNotification({
        userId: offer.workerUserId,
        title: "Offer Funded!",
        body: `Payment of $${offerAmount.toFixed(2)} confirmed. Full job details are now unlocked.`,
        type: "offer_funded",
        jobId: null,
      });

      await storage.createNotification({
        userId: offer.hirerUserId,
        title: "Payment Confirmed",
        body: `$${grossCharge.toFixed(2)} charged. Worker details unlocked. Job is now active.`,
        type: "offer_funded",
        jobId: null,
      });

      console.log(`[GUBER] Direct offer #${offerId} FUNDED — payment #${payment.id}, PI=${paymentIntentId}, gross=$${grossCharge}, worker=$${workerShare}`);

      res.json({ funded: true, offer: updated, paymentId: payment.id });
    } catch (err: any) {
      console.error("[GUBER] direct offer confirm-payment error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/direct-offers/:id/cancel", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      const userId = req.session!.userId!;
      const { reasonCode, freeText } = req.body;

      const offer = await storage.getDirectOffer(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      if (offer.hirerUserId !== userId && offer.workerUserId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const closedStatuses = ["canceled_by_hirer", "canceled_by_worker", "expired_unanswered", "expired_unpaid", "declined", "completed", "resolved"];
      if (closedStatuses.includes(offer.status)) {
        return res.status(400).json({ message: "Offer already closed" });
      }
      if (offer.status === "disputed") {
        return res.status(400).json({ message: "Cannot cancel a disputed offer. Wait for admin resolution." });
      }

      const validReasonCodes = ["emergency", "incorrect_job_details", "no_longer_needed", "unavailable", "other"];
      if (!reasonCode || !validReasonCodes.includes(reasonCode)) {
        return res.status(400).json({ message: `reasonCode is required. Must be one of: ${validReasonCodes.join(", ")}` });
      }

      const canceledByRole = userId === offer.hirerUserId ? "hirer" : "worker";
      const cancelStatus = canceledByRole === "hirer" ? "canceled_by_hirer" : "canceled_by_worker";
      const now = new Date();

      if ((offer.status === "funded" || offer.status === "active" || offer.status === "in_progress" || offer.status === "proof_submitted") && offer.stripePaymentIntentId) {
        const refundApplicationFee = canceledByRole === "worker";
        try {
          const pi = await stripe.paymentIntents.retrieve(offer.stripePaymentIntentId);
          const chargeId = pi.latest_charge as string;
          if (chargeId && pi.status === "succeeded") {
            await stripe.refunds.create({
              charge: chargeId,
              refund_application_fee: refundApplicationFee,
              reason: "requested_by_customer",
              metadata: {
                offerId: String(offerId),
                canceledBy: canceledByRole,
                reasonCode,
                feeForfeited: String(!refundApplicationFee),
              },
            });
            console.log(`[GUBER] Direct offer #${offerId} — charge ${chargeId} refunded (refund_app_fee=${refundApplicationFee})`);
          }
        } catch (refundErr: any) {
          console.error(`[GUBER] Direct offer #${offerId} refund error:`, refundErr.message);
        }

        const existingPayment = await storage.getGuberPaymentByOffer(offerId);
        if (existingPayment) {
          const refundAmount = existingPayment.grossAmount;
          await storage.updateGuberPayment(existingPayment.id, {
            paymentStatus: "refunded",
            refundedAt: now,
          });

          await storage.createMoneyLedgerEntry({
            paymentId: existingPayment.id,
            jobId: offer.jobId || null,
            userIdOwner: offer.hirerUserId,
            userIdCounterparty: offer.workerUserId,
            ledgerType: "offer_refund",
            amount: refundAmount,
            currency: "usd",
            sourceSystem: "stripe",
            sourceReferenceId: offer.stripePaymentIntentId,
            stripeObjectType: "refund",
            stripeObjectId: offer.stripePaymentIntentId,
            description: `Refund of $${refundAmount.toFixed(2)} for canceled direct offer #${offerId} (${canceledByRole} canceled: ${reasonCode})`,
            metadataJson: {
              offerId,
              canceledByRole,
              canceledByUserId: userId,
              reasonCode,
              flowType: "direct_offer_refund",
            },
            eventTime: now,
          });

          await storage.createMoneyLedgerEntry({
            paymentId: existingPayment.id,
            jobId: offer.jobId || null,
            userIdOwner: offer.workerUserId,
            userIdCounterparty: offer.hirerUserId,
            ledgerType: "offer_earning_reversed",
            amount: -existingPayment.netToWorker,
            currency: "usd",
            sourceSystem: "stripe",
            sourceReferenceId: offer.stripePaymentIntentId,
            stripeObjectType: "refund",
            stripeObjectId: offer.stripePaymentIntentId,
            description: `Earning reversed: -$${existingPayment.netToWorker.toFixed(2)} for canceled direct offer #${offerId}`,
            metadataJson: {
              offerId,
              canceledByRole,
              flowType: "direct_offer_refund",
            },
            eventTime: now,
          });

          if (!refundApplicationFee && existingPayment) {
            await storage.createMoneyLedgerEntry({
              paymentId: existingPayment.id,
              jobId: offer.jobId || null,
              userIdOwner: offer.hirerUserId,
              userIdCounterparty: offer.workerUserId,
              ledgerType: "hirer_cancel_fee_forfeited",
              amount: -existingPayment.platformFeeAmount,
              currency: "usd",
              sourceSystem: "platform",
              description: `Hirer canceled offer #${offerId} — platform fee of $${existingPayment.platformFeeAmount.toFixed(2)} forfeited (reason: ${reasonCode})`,
              metadataJson: {
                offerId,
                canceledByRole,
                reasonCode,
                flowType: "hirer_cancel_fee_forfeiture",
              },
              eventTime: now,
            });
          }
        }
      }

      const updated = await storage.updateDirectOffer(offerId, {
        status: cancelStatus,
        canceledAt: now,
        cancelReasonCode: reasonCode,
      });

      const existingPayment = await storage.getGuberPaymentByOffer(offerId);
      await storage.createCancellationLogEntry({
        jobId: offer.jobId || 0,
        paymentId: existingPayment?.id || null,
        canceledByUserId: userId,
        canceledByRole,
        cancelReasonCode: reasonCode,
        freeText: freeText || null,
        refundAmount: existingPayment?.grossAmount || 0,
      });

      if (canceledByRole === "worker" && (offer.status === "funded" || offer.status === "active" || offer.status === "in_progress" || offer.status === "proof_submitted")) {
        const worker = await storage.getUser(offer.workerUserId);
        if (worker) {
          const currentFlags = worker.reputationFlags || 0;
          await storage.updateUser(offer.workerUserId, { reputationFlags: currentFlags + 1 });
        }
        await storage.createMoneyLedgerEntry({
          paymentId: existingPayment?.id || null,
          jobId: offer.jobId || null,
          userIdOwner: offer.workerUserId,
          userIdCounterparty: offer.hirerUserId,
          ledgerType: "worker_cancel_penalty",
          amount: 0,
          currency: "usd",
          sourceSystem: "platform",
          description: `Worker canceled funded offer #${offerId} — reputation flag added (reason: ${reasonCode})`,
          eventTime: now,
        });
      }

      const otherUserId = userId === offer.workerUserId ? offer.hirerUserId : offer.workerUserId;
      await storage.createNotification({
        userId: otherUserId,
        title: "Offer Canceled",
        body: `The direct offer for $${offer.currentOfferAmount.toFixed(2)} was canceled${offer.fundedAt ? " — refund initiated" : ""}.`,
        type: "offer_canceled",
        jobId: null,
      });

      console.log(`[GUBER] Direct offer #${offerId} CANCELED by ${canceledByRole} (userId=${userId}), reason=${reasonCode}`);

      res.json(updated);
    } catch (err: any) {
      console.error("[GUBER] direct offer cancel error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/direct-offers/:id/payment-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      const userId = req.session!.userId!;
      const offer = await storage.getDirectOffer(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      if (offer.hirerUserId !== userId && offer.workerUserId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const payment = await storage.getGuberPaymentByOffer(offerId);
      const ledger = payment ? await storage.getMoneyLedgerByPayment(payment.id) : [];

      res.json({
        offerId,
        offerStatus: offer.status,
        funded: !!offer.fundedAt,
        fundedAt: offer.fundedAt,
        payment: payment ? {
          id: payment.id,
          grossAmount: payment.grossAmount,
          platformFeeAmount: payment.platformFeeAmount,
          netToWorker: payment.netToWorker,
          paymentStatus: payment.paymentStatus,
          fundedAt: payment.fundedAt,
          refundedAt: payment.refundedAt,
        } : null,
        ledgerEntries: ledger.map(e => ({
          id: e.id,
          ledgerType: e.ledgerType,
          amount: e.amount,
          description: e.description,
          eventTime: e.eventTime,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/direct-offers/:id/start", requireAuth, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      const userId = req.session!.userId!;
      const offer = await storage.getDirectOffer(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      if (offer.hirerUserId !== userId) return res.status(403).json({ message: "Only the hirer can start the job" });
      if (offer.status === "active") return res.json(offer);
      if (offer.status !== "funded") return res.status(400).json({ message: "Offer must be funded before starting" });

      const updated = await storage.updateDirectOffer(offerId, {
        status: "active",
        activatedAt: new Date(),
      });

      await storage.createNotification({
        userId: offer.workerUserId,
        title: "Job Started",
        body: `The hirer has started the job. You can now begin work.`,
        type: "direct_offer",
        jobId: null,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/direct-offers/:id/begin-work", requireAuth, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      const userId = req.session!.userId!;
      const offer = await storage.getDirectOffer(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      if (offer.workerUserId !== userId) return res.status(403).json({ message: "Only the worker can begin work" });
      if (offer.status !== "active") return res.status(400).json({ message: "Job must be active before beginning work" });

      const updated = await storage.updateDirectOffer(offerId, {
        status: "in_progress",
        inProgressAt: new Date(),
      });

      await storage.createNotification({
        userId: offer.hirerUserId,
        title: "Worker Started",
        body: `The worker has begun working on your job.`,
        type: "direct_offer",
        jobId: null,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/direct-offers/:id/submit-proof", requireAuth, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      const userId = req.session!.userId!;
      const { proofText, proofPhotos } = req.body;
      const offer = await storage.getDirectOffer(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      if (offer.workerUserId !== userId) return res.status(403).json({ message: "Only the worker can submit proof" });
      if (offer.status !== "in_progress") return res.status(400).json({ message: "Job must be in progress to submit proof" });
      if (!proofText && (!proofPhotos || proofPhotos.length === 0)) {
        return res.status(400).json({ message: "Proof text or photos required" });
      }

      const updated = await storage.updateDirectOffer(offerId, {
        status: "proof_submitted",
        proofText: proofText || null,
        proofPhotos: proofPhotos || null,
        proofSubmittedAt: new Date(),
      });

      await storage.createNotification({
        userId: offer.hirerUserId,
        title: "Proof of Completion",
        body: `The worker has submitted proof of completion. Please review and confirm.`,
        type: "direct_offer",
        jobId: null,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/direct-offers/:id/confirm-complete", requireAuth, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      const userId = req.session!.userId!;
      const offer = await storage.getDirectOffer(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      if (offer.hirerUserId !== userId) return res.status(403).json({ message: "Only the hirer can confirm completion" });
      if (offer.status !== "proof_submitted") return res.status(400).json({ message: "Worker must submit proof before confirming completion" });

      const now = new Date();

      const existingPayment = await storage.getGuberPaymentByOffer(offerId);
      if (existingPayment) {
        await storage.updateGuberPayment(existingPayment.id, {
          paymentStatus: "released",
        });
      }

      await storage.createMoneyLedgerEntry({
        paymentId: existingPayment?.id || null,
        jobId: offer.jobId || null,
        userIdOwner: offer.workerUserId,
        userIdCounterparty: offer.hirerUserId,
        ledgerType: "offer_payout_released",
        amount: existingPayment?.netToWorker || offer.currentOfferAmount,
        currency: "usd",
        sourceSystem: "stripe",
        description: `Payout released to worker — offer #${offerId} completed`,
        eventTime: now,
      });

      await storage.createMoneyLedgerEntry({
        paymentId: existingPayment?.id || null,
        jobId: offer.jobId || null,
        userIdOwner: offer.hirerUserId,
        userIdCounterparty: offer.workerUserId,
        ledgerType: "offer_completed",
        amount: -(existingPayment?.grossAmount || offer.currentOfferAmount),
        currency: "usd",
        sourceSystem: "platform",
        description: `Job completed — funds finalized for offer #${offerId}`,
        eventTime: now,
      });

      const updated = await storage.updateDirectOffer(offerId, {
        status: "completed",
        completedAt: now,
      });

      await storage.createNotification({
        userId: offer.workerUserId,
        title: "Job Completed",
        body: `The hirer confirmed completion. Payment of $${(existingPayment?.netToWorker || offer.currentOfferAmount).toFixed(2)} has been released.`,
        type: "direct_offer",
        jobId: null,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/direct-offers/:id/dispute", requireAuth, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      const userId = req.session!.userId!;
      const { reason, description } = req.body;
      const offer = await storage.getDirectOffer(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      if (offer.hirerUserId !== userId && offer.workerUserId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const disputeableStatuses = ["active", "in_progress", "proof_submitted"];
      if (!disputeableStatuses.includes(offer.status)) {
        return res.status(400).json({ message: "Cannot dispute offer in current state" });
      }
      if (!reason) return res.status(400).json({ message: "Reason is required" });

      const filedByRole = userId === offer.hirerUserId ? "hirer" : "worker";
      const now = new Date();

      const dispute = await storage.createGuberDispute({
        offerId,
        jobId: offer.jobId || 0,
        openedByUserId: userId,
        filedByRole,
        againstUserId: filedByRole === "hirer" ? offer.workerUserId : offer.hirerUserId,
        reasonCode: reason,
        description: description || null,
        status: "open",
      });

      await storage.updateDirectOffer(offerId, {
        status: "disputed",
        disputeId: dispute.id,
      });

      const otherUserId = filedByRole === "hirer" ? offer.workerUserId : offer.hirerUserId;
      await storage.createNotification({
        userId: otherUserId,
        title: "Dispute Filed",
        body: `A dispute has been filed on offer #${offerId}. An admin will review.`,
        type: "dispute",
        jobId: null,
      });

      res.json(dispute);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/direct-offers/:id/resolve-dispute", requireAuth, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      const userId = req.session!.userId!;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });

      const { resolution, outcome, splitPercentWorker, notes } = req.body;
      const offer = await storage.getDirectOffer(offerId);
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      if (offer.status !== "disputed") return res.status(400).json({ message: "Offer is not disputed" });
      if (!resolution) return res.status(400).json({ message: "Resolution is required" });

      const validOutcomes = ["full_refund", "full_payout", "partial_split"];
      const finalOutcome = outcome || "full_payout";
      if (!validOutcomes.includes(finalOutcome)) {
        return res.status(400).json({ message: `outcome must be one of: ${validOutcomes.join(", ")}` });
      }
      if (finalOutcome === "partial_split") {
        const pct = Number(splitPercentWorker);
        if (isNaN(pct) || pct < 0 || pct > 100) {
          return res.status(400).json({ message: "splitPercentWorker must be 0-100 for partial_split" });
        }
      }

      const now = new Date();

      if (offer.disputeId) {
        await storage.updateGuberDispute(offer.disputeId, {
          status: "resolved",
          resolution,
          resolvedByUserId: userId,
          resolvedAt: now,
          adminNotes: notes || null,
        });
      }

      if (finalOutcome === "full_refund" && offer.stripePaymentIntentId) {
        try {
          const pi = await stripe.paymentIntents.retrieve(offer.stripePaymentIntentId);
          const chargeId = pi.latest_charge as string;
          if (chargeId && pi.status === "succeeded") {
            await stripe.refunds.create({
              charge: chargeId,
              refund_application_fee: true,
              reason: "requested_by_customer",
              metadata: { offerId: String(offerId), resolvedBy: "admin", resolution, outcome: finalOutcome },
            });
          }

          await storage.createMoneyLedgerEntry({
            paymentId: null,
            jobId: offer.jobId || null,
            userIdOwner: offer.hirerUserId,
            userIdCounterparty: offer.workerUserId,
            ledgerType: "dispute_refund",
            amount: offer.currentOfferAmount,
            currency: "usd",
            sourceSystem: "stripe",
            description: `Dispute resolved (full_refund) — refund to hirer for offer #${offerId}`,
            eventTime: now,
          });
        } catch (refundErr: any) {
          console.error(`[GUBER] Dispute refund error for offer #${offerId}:`, refundErr.message);
        }
      } else if (finalOutcome === "partial_split" && offer.stripePaymentIntentId) {
        const workerPct = Number(splitPercentWorker) / 100;
        const workerAmount = Math.round(offer.currentOfferAmount * workerPct * 100) / 100;
        const hirerRefundAmount = Math.round(offer.currentOfferAmount * (1 - workerPct) * 100) / 100;

        if (hirerRefundAmount > 0) {
          try {
            const pi = await stripe.paymentIntents.retrieve(offer.stripePaymentIntentId);
            const chargeId = pi.latest_charge as string;
            if (chargeId && pi.status === "succeeded") {
              const { gross: grossRefund } = grossUpForStripe(hirerRefundAmount);
              await stripe.refunds.create({
                charge: chargeId,
                amount: Math.round(grossRefund * 100),
                metadata: { offerId: String(offerId), resolvedBy: "admin", resolution, outcome: "partial_split" },
              });
            }
          } catch (refundErr: any) {
            console.error(`[GUBER] Partial dispute refund error for offer #${offerId}:`, refundErr.message);
          }
        }

        await storage.createMoneyLedgerEntry({
          paymentId: null,
          jobId: offer.jobId || null,
          userIdOwner: offer.hirerUserId,
          userIdCounterparty: offer.workerUserId,
          ledgerType: "dispute_partial_refund",
          amount: hirerRefundAmount,
          currency: "usd",
          sourceSystem: "stripe",
          description: `Dispute resolved (partial_split ${splitPercentWorker}% worker) — $${hirerRefundAmount.toFixed(2)} refund to hirer for offer #${offerId}`,
          eventTime: now,
        });
        await storage.createMoneyLedgerEntry({
          paymentId: null,
          jobId: offer.jobId || null,
          userIdOwner: offer.workerUserId,
          userIdCounterparty: offer.hirerUserId,
          ledgerType: "dispute_partial_payout",
          amount: workerAmount,
          currency: "usd",
          sourceSystem: "platform",
          description: `Dispute resolved (partial_split ${splitPercentWorker}% worker) — $${workerAmount.toFixed(2)} paid to worker for offer #${offerId}`,
          eventTime: now,
        });
      } else {
        await storage.createMoneyLedgerEntry({
          paymentId: null,
          jobId: offer.jobId || null,
          userIdOwner: offer.workerUserId,
          userIdCounterparty: offer.hirerUserId,
          ledgerType: "dispute_resolved_pay_worker",
          amount: offer.currentOfferAmount,
          currency: "usd",
          sourceSystem: "platform",
          description: `Dispute resolved (full_payout) — worker paid for offer #${offerId}`,
          eventTime: now,
        });
      }

      const updated = await storage.updateDirectOffer(offerId, {
        status: "resolved",
        resolvedAt: now,
      });

      await storage.createNotification({
        userId: offer.hirerUserId,
        title: "Dispute Resolved",
        body: `The dispute on offer #${offerId} has been resolved: ${resolution}`,
        type: "dispute",
        jobId: null,
      });
      await storage.createNotification({
        userId: offer.workerUserId,
        title: "Dispute Resolved",
        body: `The dispute on offer #${offerId} has been resolved: ${resolution}`,
        type: "dispute",
        jobId: null,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  setInterval(async () => {
    try {
      const expired = await storage.getExpiredOffers();
      for (const offer of expired) {
        const paymentStatuses = ["agreed_payment_pending", "payment_pending"];
        const newStatus = paymentStatuses.includes(offer.status) ? "expired_unpaid" : "expired_unanswered";
        await storage.updateDirectOffer(offer.id, { status: newStatus });
        await storage.createNotification({
          userId: offer.workerUserId,
          title: "Offer Expired",
          body: paymentStatuses.includes(offer.status)
            ? "An accepted offer expired because payment was not completed in time."
            : "A job offer expired before a response was received.",
          type: "offer_expired",
          jobId: null,
        });
        await storage.createNotification({
          userId: offer.hirerUserId,
          title: "Offer Expired",
          body: paymentStatuses.includes(offer.status)
            ? "Your accepted offer expired because payment was not completed within the 60-minute window."
            : "Your job offer expired without a response.",
          type: "offer_expired",
          jobId: null,
        });
      }

      const disputedOffers = await storage.getDirectOffersByStatus("disputed");
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      for (const offer of disputedOffers) {
        if (offer.disputeId) {
          const dispute = await storage.getGuberDispute(offer.disputeId);
          if (!dispute || !dispute.openedAt) continue;
          const disputeAge = new Date(dispute.openedAt);

          if (disputeAge < fiveDaysAgo) {
            const now = new Date();
            await storage.updateGuberDispute(dispute.id, {
              status: "resolved",
              resolution: "Auto-resolved: 5-day SLA exceeded. Full refund to hirer.",
              resolutionType: "sla_auto_refund",
              resolvedAt: now,
              adminNotes: "Automatically resolved due to 5-day SLA expiration.",
            });

            if (offer.stripePaymentIntentId) {
              try {
                const pi = await stripe.paymentIntents.retrieve(offer.stripePaymentIntentId);
                const chargeId = pi.latest_charge as string;
                if (chargeId && pi.status === "succeeded") {
                  await stripe.refunds.create({
                    charge: chargeId,
                    refund_application_fee: true,
                    reason: "requested_by_customer",
                    metadata: { offerId: String(offer.id), resolution: "sla_auto_refund" },
                  });
                }
              } catch (e: any) {
                console.error(`[cron] SLA auto-refund error for offer #${offer.id}:`, e.message);
              }
            }

            await storage.createMoneyLedgerEntry({
              paymentId: null,
              jobId: offer.jobId || null,
              userIdOwner: offer.hirerUserId,
              userIdCounterparty: offer.workerUserId,
              ledgerType: "dispute_sla_auto_refund",
              amount: offer.currentOfferAmount,
              currency: "usd",
              sourceSystem: "platform",
              description: `Dispute auto-resolved (5-day SLA) — full refund to hirer for offer #${offer.id}`,
              eventTime: now,
            });

            await storage.updateDirectOffer(offer.id, { status: "resolved", resolvedAt: now });

            await storage.createNotification({
              userId: offer.hirerUserId,
              title: "Dispute Auto-Resolved",
              body: `Dispute on offer #${offer.id} was auto-resolved after 5 days. Full refund issued.`,
              type: "dispute",
              jobId: null,
            });
            await storage.createNotification({
              userId: offer.workerUserId,
              title: "Dispute Auto-Resolved",
              body: `Dispute on offer #${offer.id} was auto-resolved after 5 days. Funds returned to hirer.`,
              type: "dispute",
              jobId: null,
            });
          } else if (disputeAge < fourDaysAgo && !dispute.slaWarningSentAt) {
            await storage.createNotification({
              userId: offer.hirerUserId,
              title: "Dispute SLA Warning",
              body: `Dispute on offer #${offer.id} will be auto-resolved in ~1 day if not addressed by admin.`,
              type: "dispute",
              jobId: null,
            });
            await storage.createNotification({
              userId: offer.workerUserId,
              title: "Dispute SLA Warning",
              body: `Dispute on offer #${offer.id} will be auto-resolved in ~1 day if not addressed by admin.`,
              type: "dispute",
              jobId: null,
            });
            await storage.updateGuberDispute(dispute.id, { slaWarningSentAt: new Date() });
          }
        }
      }

      const soonExpiring = await storage.getSoonExpiringOffers();
      for (const offer of soonExpiring) {
        await storage.createNotification({
          userId: offer.workerUserId,
          title: "Offer Expiring Soon",
          body: "A job offer will expire in about 10 minutes. Respond now to avoid missing it.",
          type: "offer_expiring",
          jobId: null,
        });
        await storage.createNotification({
          userId: offer.hirerUserId,
          title: "Offer Expiring Soon",
          body: "Your job offer will expire in about 10 minutes.",
          type: "offer_expiring",
          jobId: null,
        });
        await storage.updateDirectOffer(offer.id, { expiryWarningSentAt: new Date() });
      }
    } catch (err) {
      console.error("[cron] offer expiration error:", err);
    }
  }, 60 * 1000);

  return httpServer;
}