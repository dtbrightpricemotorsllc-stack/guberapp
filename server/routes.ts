import type { Express, Request, Response } from "express";
import { lookupZip, geocodeZip, geocodeZipFull, lookupZipsByCity, flushZipGeocodeCache } from "./zip-geocode";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { ALL_GAME_IMAGES } from "./game-images";
import { storage } from "./storage";
import { signupSchema, loginSchema, businessSignupSchema, businessAccessRequestSchema, businessVerificationSchema, businessOfferSchema } from "@shared/schema";
import { randomBytes, createHmac } from "crypto";
import Stripe from "stripe";
import express from "express";
import { computeGraceEndsAt, computeExpiresAt } from "./rules";
import { sendPushToUser } from "./push";
import { awardReferralRewardForJob, voidReferralRewardForJob } from "./referral-reward";
import { handleGoogleAuthStart, validateOAuthState } from "./oauth";
import { demoGuard, getDemoUserIds, isDemoUser, viewerCanSeeJobSync } from "./demo-guard";
import { validatePasswordStrength, hashPassword, comparePasswords, filterContactInfo, sanitizeUser, regenerateSession, contactInfoPattern, handleMe, handleLogout, handleResetPassword, handleLogin, handleSignup, handleForgotPassword, handleBusinessSignup, handleNativeGoogleAuth } from "./auth";
import { detectDisallowedJobContent, detectOffPlatformPhrase, detectViLanguageHit, replaceViLanguage } from "@shared/liability";
import { generateJWT, verifyJWT } from "./jwt";
import { db } from "./db";
import { sql, eq, eq as sqlEq, desc as sqlDesc, desc, and, or, isNotNull, inArray, ilike, gte, lte, type SQL } from "drizzle-orm";
import { auditLogs as auditLogsTable, users as usersTable, jobs as jobsTable, insertJobSchema, referrals, platformSettings, walletTransactions, userFeedback, observations as observationsTable, guberDisputes, cashDrops, type User, type CashDrop } from "@shared/schema";
import {
  DISPUTE_ISSUE_TYPES,
  ADMIN_DISPUTE_DECISIONS,
  HELPER_RESPONSE_WINDOW_HOURS,
  RISK_WATCH_THRESHOLDS,
  autoConfirmHoursFor,
  type DisputeIssueType,
  type AdminDisputeDecision,
  type InternalPayoutStatus,
} from "@shared/dispute";
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
import { sanitizeJobForPublic } from "./sanitize-job";
import {
  validateAvailabilityWindows,
  isInsideAnyWindow,
  windowToDateRange,
  computeProofWindow,
  parseTimeSelection,
  TIMING as COORDINATION_TIMING,
  SCHEDULE_STATUS,
} from "./coordination";
import { claimReminder, clearReminder, scheduleSnooze, isUserInQuietHours } from "./reminders";

/** Create an in-app notification AND fire a background push alert to the user's device(s). */
function getSoundForNotificationType(type?: string): string {
  switch (type) {
    case "offer_funded":
    case "payment":
    case "cash_drop":
      return "guber_money.wav";
    case "offer_payment_pending":
      return "guber_action.wav";
    case "closed":
    case "offer_payment_failed":
      return "guber_closed.wav";
    case "job":
      return "guber_action.wav";
    case "nearby":
      // Nearby alerts intentionally use the default chime — no dedicated sound.
      return "guber_default.wav";
    default:
      return "guber_default.wav";
  }
}

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
    sound: getSoundForNotificationType(data.type),
  }).catch(() => {});
}

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
const TRUST_BOX_PRICE_ID = "price_1T1ToIRAzmUydsE3myv4vG3Z"; // old Stripe account — legacy member verification only
const TRUST_BOX_PAYROLL_PRICE_ID = process.env.STRIPE_PAYROLL_TRUST_BOX_PRICE_ID || "";
const TRUST_BOX_PAYROLL_PRODUCT_ID = "prod_UPe4IX8VqvQklQ";

const REFERRAL_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += REFERRAL_CHARS[Math.floor(Math.random() * REFERRAL_CHARS.length)];
  return code;
}

/**
 * Mark a referrals row as verified once the referred user passes a key
 * milestone (currently: Stripe Connect activation).
 *
 * NOTE — Performance Shares migration:
 * The previous version also handed out a "−5% per 10 referrals" fee discount
 * via referralCount / referralFeePct / referralDiscountExpiresAt. Those columns
 * remain on `users` for backwards compatibility but are NO LONGER updated.
 * The actual referrer reward is now paid as cash on each completed-paid job
 * via `awardReferralRewardForJob` (see server/referral-reward.ts).
 */
async function creditReferrer(referredUserId: number) {
  try {
    const ref = await db.select().from(referrals).where(sqlEq(referrals.referredId, referredUserId)).limit(1);
    if (!ref.length || ref[0].status === "verified") return;
    await db.update(referrals).set({ status: "verified" }).where(sqlEq(referrals.id, ref[0].id));
    const referrer = await storage.getUser(ref[0].referrerId);
    if (!referrer) return;
    await storage.createNotification({
      userId: referrer.id,
      title: "Referral verified",
      body: `Someone you referred just activated their account. You'll earn a share of GUBER's platform fee on their completed jobs for the next 30 days.`,
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
      sendPushToUser(u.id, { title: notifTitle, body: notifBody, url: `/cash-drops`, tag: `cashdrop-${drop.id}`, sound: "guber_money.wav" }).catch(() => {});
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
        sendPushToUser(u.id, { title: notifTitle, body: notifBody, url: `/cash-drops`, tag: `cashdrop-${drop.id}`, sound: "guber_money.wav" }).catch(() => {});
      }
    }

    console.log(`[GUBER] Notified ${notifiedIds.size} users about Cash Drop #${drop.id} (${ogRows.rows.length} OG + ${notifiedIds.size - ogRows.rows.length} local)`);
  } catch (e: any) {
    console.error("[GUBER] notifyCashDropLive error:", e.message);
  }
}

async function notifyCashDropClaimed(dropId: number, dropTitle: string, winnerUserId: number) {
  try {
    const allAttempts = await storage.getCashDropAttempts(dropId);
    const notifyUserIds = [...new Set(
      allAttempts
        .filter((a) => a.userId !== winnerUserId && a.status !== "won")
        .map((a) => a.userId)
    )];
    const notifTitle = "Cash Drop Has Been Claimed";
    const notifBody = `Someone snagged the "${dropTitle}" drop! Keep an eye out for the next one.`;
    for (const uid of notifyUserIds) {
      await storage.createNotification({ userId: uid, title: notifTitle, body: notifBody, type: "cash_drop", cashDropId: dropId, jobId: null });
      sendPushToUser(uid, { title: notifTitle, body: notifBody, url: `/cash-drops`, tag: `cashdrop-claimed-${dropId}`, sound: "guber_closed.wav" }).catch(() => {});
    }
    console.log(`[GUBER] Notified ${notifyUserIds.length} participants that Cash Drop #${dropId} was claimed`);
  } catch (e: any) {
    console.error("[GUBER] notifyCashDropClaimed error:", e.message);
  }
}

async function checkStripeForOGStatus(email: string): Promise<{ isOG: boolean; hasTrustBox: boolean }> {
  try {
    let isOG = false;
    let hasTrustBox = false;

    // Check old account (legacy members)
    const customers = await stripeMain.customers.list({ email: email.toLowerCase(), limit: 10 });
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

    // Also check payroll account (new members, in-app purchases)
    if (!isOG || !hasTrustBox) {
      const payrollCustomers = await stripe.customers.list({ email: email.toLowerCase(), limit: 10 });
      for (const customer of payrollCustomers.data) {
        if (!isOG) {
          const sessions = await stripe.checkout.sessions.list({ customer: customer.id, limit: 100 });
          for (const s of sessions.data) {
            if (s.payment_status === "paid" && s.metadata?.type === "day1og") { isOG = true; break; }
          }
        }
        if (!hasTrustBox) {
          const subs = await stripe.subscriptions.list({ customer: customer.id, status: "active", limit: 20 });
          for (const sub of subs.data) {
            if (sub.items.data.some(i => (i.price.product as string) === TRUST_BOX_PAYROLL_PRODUCT_ID)) { hasTrustBox = true; break; }
          }
        }
        if (isOG && hasTrustBox) break;
      }
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
  "On-Demand Help": ["Pet Care", "Errand Running", "Delivery", "Personal Assistant", "Tutoring", "Tech Support", "Event Help", "House Sitting", "Jump Start", "Lockout Service", "Vehicle Transport", "Roadside Assistance"],
  "General Labor": ["Moving", "Lawn Care", "Cleaning", "Hauling", "Assembly", "Demolition", "Pressure Washing", "Junk Removal", "Vehicle Detailing", "Boat Cleaning", "RV Cleaning"],
  "Skilled Labor": ["Plumbing", "Electrical", "HVAC", "Carpentry", "Drywall", "Painting", "Welding", "Auto Repair", "Roofing", "Flooring", "Marine / Boat Repair", "Towing / Hauling"],
  "Barter Labor": ["Trade Services", "Skill Exchange", "Item Exchange"],
  "Marketplace": ["Buy/Sell", "Rent", "Free Items"],
};

// Service types added by Task #319 (vehicle/boat/RV/automotive). These are
// merged on top of any DB-backed service types returned for Skilled / General /
// On-Demand Help so existing seeded environments still surface the new items.
export const TASK_319_AUTOMOTIVE_SERVICES: Record<string, string[]> = {
  "On-Demand Help": ["Jump Start", "Lockout Service", "Vehicle Transport", "Roadside Assistance"],
  "General Labor": ["Vehicle Detailing", "Boat Cleaning", "RV Cleaning"],
  "Skilled Labor": ["Marine / Boat Repair", "Towing / Hauling"],
};

const TIER_ORDER = ["community", "verified", "credentialed", "elite"];


declare module "express-session" {
  interface SessionData {
    userId: number;
  }
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

// Wrap a job-returning response so mutation endpoints don't accidentally
// leak poster-only fields (auto-increase config, suggested boost, internal
// admin notes) to assigned helpers or other viewers. Admins always receive
// the full unsanitized object so admin tools can show the real state.
async function respondJob(req: Request, res: Response, job: any, extra?: Record<string, any>) {
  if (!job) return res.json(job);
  const isAdmin = await viewerIsAdmin(req);
  const sanitized = sanitizeJobForPublic(job, req.session.userId, isAdmin);
  if (extra) return res.json({ ...sanitized, ...extra });
  return res.json(sanitized);
}

// ── Risk-signal helpers (Task #317) ─────────────────────────────────────
// Bumps a single signal counter for a user and (if normal-level) auto-promotes
// them to "watch" once any threshold is crossed. Higher tiers (restricted /
// suspended) only ever come from explicit admin action.
async function bumpRiskSignal(userId: number, signal: keyof typeof RISK_WATCH_THRESHOLDS): Promise<void> {
  try {
    const u = await storage.getUser(userId);
    if (!u) return;
    const fieldMap: Record<keyof typeof RISK_WATCH_THRESHOLDS, string> = {
      jobsDisputed: "jobsDisputed",
      noShowCount: "noShowCount",
      missingProofCount: "missingProofCount",
      bypassAttemptCount: "bypassAttemptCount",
      falseClaimFlagCount: "falseClaimFlagCount",
    };
    const field = fieldMap[signal];
    const next = ((u as any)[field] || 0) + 1;
    const updates: any = { [field]: next };
    const currentLevel = (u as any).riskLevel || "normal";
    if (currentLevel === "normal" && next >= RISK_WATCH_THRESHOLDS[signal]) {
      updates.riskLevel = "watch";
    }
    await storage.updateUser(userId, updates);
  } catch (err: any) {
    console.error(`[risk] bumpRiskSignal failed userId=${userId} signal=${signal}:`, err.message);
  }
}

// Re-evaluates risk level after a dispute event; opens dispute against this user.
async function maybeBumpRiskWatch(userId: number): Promise<void> {
  await bumpRiskSignal(userId, "jobsDisputed");
}

async function viewerIsAdmin(req: Request): Promise<boolean> {
  const viewerId = req.session?.userId;
  if (!viewerId) return false;
  try {
    const u = await storage.getUser(viewerId);
    return u?.role === "admin";
  } catch {
    return false;
  }
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

/**
 * Builds the HTML bridge page served to native Android clients after Google auth.
 * Chrome Custom Tab (Android 83+) blocks intent:// and custom-scheme navigation
 * initiated by JavaScript without a user gesture. When intent:// with
 * S.browser_fallback_url is blocked, Chrome immediately follows the fallback URL
 * — which is why users were being sent to the Play Store even with the app installed.
 *
 * Solution: use guber:// only (no intent://), show the "Open GUBER" button
 * immediately (not after a delay), and rely on the button click (user gesture)
 * to guarantee the navigation works in all Chrome versions. An auto-attempt is
 * also fired on load for Chrome versions that allow it without a gesture.
 *
 * Extracted into a standalone function so the e2e test suite can verify the
 * exact same template without duplicating it.
 */
export function buildNativeBounceHtml(guberUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Opening Guber\u2026</title>
  <style>
    html,body{margin:0;padding:0;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;height:100%;display:flex;align-items:center;justify-content:center}
    .wrap{display:flex;flex-direction:column;align-items:center;padding:40px 24px;text-align:center;max-width:360px;width:100%;box-sizing:border-box}
    h1{font-size:21px;font-weight:700;margin:0 0 10px;letter-spacing:-0.3px}
    p{font-size:14px;color:#888;margin:0 0 28px;line-height:1.5}
    #open-btn{display:block;width:100%;background:#fff;color:#000;font-weight:700;font-size:16px;padding:16px;border-radius:999px;border:none;cursor:pointer;letter-spacing:0.2px;box-sizing:border-box}
    #open-btn:active{opacity:.8}
    .store-link{margin-top:20px;font-size:13px;color:#555;text-decoration:none}
    .store-link:hover{color:#888}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>You\u2019re signed in!</h1>
    <p>Tap below to open the GUBER app.</p>
    <button id="open-btn">Open GUBER</button>
    <a href="https://play.google.com/store/apps/details?id=com.guber.app" class="store-link">Download GUBER on Google Play</a>
  </div>
  <script>
    (function () {
      var deepLink = ${JSON.stringify(guberUrl)};

      // Auto-attempt: works on Chrome versions that allow custom-scheme
      // navigation without a user gesture (older Chrome / some Custom Tab builds).
      window.location.replace(deepLink);

      // Button: user-gesture navigation — guaranteed to work on all Chrome versions.
      document.getElementById('open-btn').addEventListener('click', function () {
        window.location.href = deepLink;
      });
    })();
  </script>
</body>
</html>`;
}

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
      secret: process.env.NODE_ENV === "production"
        ? (process.env.SESSION_SECRET as string)
        : (process.env.SESSION_SECRET || "dev-only-insecure-session-secret"),
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

  // Bearer-token middleware: reads Authorization: Bearer <jwt>, verifies it,
  // and populates req.session.userId — keeps all downstream auth checks working.
  app.use((req: Request, _res: Response, next: Function) => {
    if (!req.session.userId) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        const payload = verifyJWT(token);
        if (payload) req.session.userId = payload.sub;
      }
    }
    next();
  });

  // Global soft-delete gate: runs after session + bearer hydration so EVERY
  // authenticated route — including ones that use raw `if (!req.session.userId)`
  // checks instead of requireAuth — is protected. If the user behind the
  // current session/JWT has been soft-deleted we strip the session id so all
  // downstream auth checks naturally fail with 401, and destroy the cookie
  // session. We also cache the loaded user on req so duplicate lookups in
  // requireAuth/handleMe can be skipped.
  app.use(async (req: Request, _res: Response, next: Function) => {
    if (req.session.userId) {
      try {
        const u = await storage.getUser(req.session.userId);
        if (!u || (u as any).deletedAt) {
          req.session.userId = undefined;
          if (typeof (req.session as any).destroy === "function") {
            req.session.destroy(() => {});
          }
        } else {
          (req as any).currentUser = u;
        }
      } catch (err) {
        // Fail closed on DB errors — clear the session so we can never
        // accidentally honor a stale id for a soft-deleted account during
        // a transient outage. The user will get 401s and can retry.
        console.error("[soft-delete-gate] user lookup failed; clearing session:", err);
        req.session.userId = undefined;
      }
    }
    next();
  });

  function requireAuth(req: Request, res: Response, next: Function) {
    // The global soft-delete gate above has already stripped session.userId
    // for any deleted account, so a missing userId here is the only check
    // we need.
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

  // ── Dev/test-only: serve the native-auth bounce page with an arbitrary deep
  // link so Playwright tests can hit the real server-rendered HTML without
  // triggering a full Google OAuth round-trip.  Not reachable in production.
  if (process.env.NODE_ENV !== "production") {
    app.get("/api/test/deep-link-bounce", (req: Request, res: Response) => {
      const token = typeof req.query.token === "string" && req.query.token
        ? req.query.token
        : "e2e-test-token";
      const guberUrl = `guber://auth-success?token=${encodeURIComponent(token)}`;
      res.type("html").send(buildNativeBounceHtml(guberUrl));
    });

    app.post("/api/test/reset-liability-disclaimer", async (req: Request, res: Response) => {
      const { email } = req.body as { email?: string };
      if (!email) return res.status(400).json({ error: "email required" });
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(404).json({ error: "user not found" });
      await db.execute(sql`UPDATE users SET liability_disclaimer_accepted_at = NULL WHERE id = ${user.id}`);
      return res.json({ ok: true, userId: user.id });
    });

    app.post("/api/test/create-helper-assignment", async (req: Request, res: Response) => {
      const { helperEmail, posterEmail } = req.body as { helperEmail?: string; posterEmail?: string };
      if (!helperEmail || !posterEmail) return res.status(400).json({ error: "helperEmail and posterEmail required" });
      const helper = await storage.getUserByEmail(helperEmail);
      const poster = await storage.getUserByEmail(posterEmail);
      if (!helper || !poster) return res.status(404).json({ error: "user not found" });
      const rows = await db.execute(sql`
        INSERT INTO jobs (
          title, description, category, budget, location, location_approx,
          zip, lat, lng, status, posted_by_id, assigned_helper_id,
          is_published, is_paid, pay_type
        ) VALUES (
          'Test Helper Start Job', 'E2E test fixture job — helper start confirmation',
          'On-Demand Help', 40,
          'Los Angeles, CA', 'Los Angeles, CA',
          '90210', 34.0522, -118.2437,
          'funded', ${poster.id}, ${helper.id},
          true, true, 'fixed'
        ) RETURNING id
      `);
      const jobId = Number((rows.rows[0] as { id: number }).id);
      return res.json({ ok: true, jobId });
    });

    app.post("/api/test/create-cash-drop-fixture", async (req: Request, res: Response) => {
      const {
        userEmail,
        allSlotsTaken = false,
        createAcceptedAttempt = false,
      } = req.body as { userEmail?: string; allSlotsTaken?: boolean; createAcceptedAttempt?: boolean };
      if (!userEmail) return res.status(400).json({ error: "userEmail required" });
      const user = await storage.getUserByEmail(userEmail);
      if (!user) return res.status(404).json({ error: "user not found" });

      const winnerLimit = 1;
      const winnersFound = allSlotsTaken ? winnerLimit : 0;

      const dropRows = await db.execute(sql`
        INSERT INTO cash_drops (
          title, description, reward_per_winner, winner_limit, winners_found,
          status, gps_lat, gps_lng, gps_radius
        ) VALUES (
          'E2E Test Cash Drop', 'Playwright fixture cash drop', 20,
          ${winnerLimit}, ${winnersFound},
          'active', 34.0522, -118.2437, 200
        ) RETURNING id
      `);
      const dropId = Number((dropRows.rows[0] as { id: number }).id);

      if (createAcceptedAttempt) {
        await db.execute(sql`
          INSERT INTO cash_drop_attempts (cash_drop_id, user_id, status)
          VALUES (${dropId}, ${user.id}, 'accepted')
        `);
      }

      return res.json({ ok: true, dropId, userId: user.id });
    });

    app.post("/api/test/cleanup-cash-drop-fixture", async (req: Request, res: Response) => {
      const { dropId } = req.body as { dropId?: number };
      if (!dropId) return res.status(400).json({ error: "dropId required" });
      await db.execute(sql`DELETE FROM cash_drop_attempts WHERE cash_drop_id = ${dropId}`);
      await db.execute(sql`DELETE FROM cash_drops WHERE id = ${dropId}`);
      return res.json({ ok: true });
    });
  }

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

      // Public/anonymous endpoint — exclude demo posters so seeded fake jobs
      // never leak to embed widgets / external scrapers.
      const demoIdsSet = await getDemoUserIds();
      const demoIdArr = Array.from(demoIdsSet);

      const conditions = [
        eq(jobsTable.status, "posted_public"),
        or(sql`${jobsTable.expiresAt} IS NULL`, sql`${jobsTable.expiresAt} > NOW()`),
        ...(demoIdArr.length > 0 ? [sql`${jobsTable.postedById} NOT IN (${sql.join(demoIdArr.map(id => sql`${id}`), sql`, `)})`] : []),
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
          postedById: jobsTable.postedById,
        })
        .from(jobsTable)
        .where(eq(jobsTable.id, jobId))
        .limit(1);

      if (!rows.length) return res.status(404).json({ error: "Job not found" });
      const job = rows[0];
      if (job.status !== "posted_public") return res.status(404).json({ error: "Job not found" });
      if (job.expiresAt && new Date(job.expiresAt) < new Date()) return res.status(404).json({ error: "Job expired" });
      // Public anonymous endpoint — never reveal demo-seeded jobs to outside scrapers/embeds.
      const demoIdsPub = await getDemoUserIds();
      if (demoIdsPub.has(job.postedById)) return res.status(404).json({ error: "Job not found" });

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
        try {
          const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
          const resp = await fetch(url);
          const contentType = resp.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const data = await resp.json() as any;
            if (data.status === "OK" && data.results?.[0]) {
              const result = data.results[0];
              const address = result.formatted_address as string;
              const zipComp = result.address_components?.find((c: any) => c.types.includes("postal_code"));
              const zip = zipComp?.short_name || null;
              return res.json({ address, zip });
            }
          }
        } catch {
          // Google Maps unavailable — fall through to Nominatim
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

  app.post("/api/auth/signup", handleSignup(storage, {
    generateGuberId,
    isGuberIdTaken: async (id) => !!(await storage.getUserByGuberId(id)),
    generateReferralCode,
    isReferralCodeTaken: async (code) => {
      const clash = await db.execute(sql`SELECT 1 FROM users WHERE referral_code = ${code} LIMIT 1`);
      return clash.rows.length > 0;
    },
    findUserIdByReferralCode: async (code) => {
      const refOwner = await db.execute(sql`SELECT id FROM users WHERE referral_code = ${code} LIMIT 1`);
      return refOwner.rows.length ? (refOwner.rows[0] as any).id : null;
    },
    recordReferral: async (referrerId, referredId) => {
      await db.insert(referrals).values({ referrerId, referredId, status: "pending" }).onConflictDoNothing();
    },
    checkPreapprovedStatus: async (email) => {
      const ogCheck = await db.execute(sql`SELECT 1 FROM og_preapproved_emails WHERE email = ${email.toLowerCase()} LIMIT 1`);
      const tbCheck = await db.execute(sql`SELECT 1 FROM trust_box_preapproved_emails WHERE LOWER(email) = ${email.toLowerCase()} LIMIT 1`);
      const stripeStatus = await checkStripeForOGStatus(email);
      return {
        isOG: ogCheck.rows.length > 0 || stripeStatus.isOG,
        hasTrustBox: tbCheck.rows.length > 0 || stripeStatus.hasTrustBox,
        ogTablePresent: ogCheck.rows.length > 0,
        tbTablePresent: tbCheck.rows.length > 0,
      };
    },
    recordPreapproved: async (email, opts) => {
      if (opts.og) {
        await db.execute(sql`INSERT INTO og_preapproved_emails (email) VALUES (${email.toLowerCase()}) ON CONFLICT DO NOTHING`);
      }
      if (opts.tb) {
        await db.execute(sql`INSERT INTO trust_box_preapproved_emails (email) VALUES (${email.toLowerCase()}) ON CONFLICT DO NOTHING`);
      }
    },
    sendWelcomeNotification: async (userId, kind) => {
      if (kind === "og+tb") {
        await storage.createNotification({ userId, title: "Welcome, OG + Trust Box!", body: "Day-1 OG status and Trust Box are both active. Thanks for your early support!", type: "system" });
      } else if (kind === "og") {
        await storage.createNotification({ userId, title: "Welcome, Day-1 OG!", body: "You're a Day-1 OG member — your perks are already active. Thank you for your early support!", type: "system" });
      } else if (kind === "tb") {
        await storage.createNotification({ userId, title: "Trust Box Activated!", body: "Your AI or Not premium access is ready. Thanks for subscribing!", type: "system" });
      } else {
        await storage.createNotification({ userId, title: "Welcome to GUBER!", body: "Your account has been created. Complete your profile to start posting and accepting jobs.", type: "system" });
      }
    },
    runBackgroundCheck: (userId, fullName) => {
      runNSOPWBackgroundCheck(userId, fullName).catch(() => {});
    },
  }));

  app.post("/api/auth/business-signup", handleBusinessSignup(storage, {
    generateGuberId,
    isGuberIdTaken: async (id) => !!(await storage.getUserByGuberId(id)),
    generateReferralCode,
    isReferralCodeTaken: async (code) => {
      const clash = await db.execute(sql`SELECT 1 FROM users WHERE referral_code = ${code} LIMIT 1`);
      return clash.rows.length > 0;
    },
    isEinAvailable: async (ein) => {
      const existing = await db.execute(sql`SELECT 1 FROM business_profiles WHERE ein = ${ein} LIMIT 1`);
      return existing.rows.length === 0;
    },
    runTransaction: async (fn) => {
      try {
        await db.execute(sql`BEGIN`);
        await fn();
        await db.execute(sql`COMMIT`);
      } catch (txErr) {
        await db.execute(sql`ROLLBACK`).catch(() => {});
        throw txErr;
      }
    },
    sendWelcomeNotification: async (userId) => {
      await storage.createNotification({
        userId,
        title: "Welcome to GUBER Business!",
        body: "Your business account has been created. Complete your profile and start posting jobs.",
        type: "system",
      });
    },
    runBackgroundCheck: (userId, fullName) => {
      runNSOPWBackgroundCheck(userId, fullName).catch(() => {});
    },
  }));

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

      await regenerateSession(req);
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

    // Pull verified credentials for every candidate in a single batched
    // query (Task #372). Limit to the top 4 per worker to keep payload small.
    const credsByUser = await storage.getApprovedQualificationsForUsers(
      results.map((p) => p.userId),
    );
    const verifiedCredsByUser = new Map<number, any[]>();
    for (const proj of results) {
      const creds = credsByUser.get(proj.userId) || [];
      verifiedCredsByUser.set(proj.userId, creds.slice(0, 4).map((c) => ({
        id: c.id,
        qualificationName: c.qualificationName,
        credentialType: (c as any).credentialType || null,
        issuingAuthority: (c as any).issuingAuthority || null,
        expirationDate: (c as any).expirationDate || null,
      })));
    }

    const candidates = results.map(proj => {
      const isUnlocked = unlockedUserIds.has(proj.userId);
      return {
        ...proj,
        isUnlocked,
        isLimitedView: isLimited,
        verifiedCredentials: verifiedCredsByUser.get(proj.userId) || [],
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
      // Skip soft-deleted users — and force any existing projection row hidden
      // so a previously-published worker disappears from talent search even
      // if their account was deleted between rebuild runs.
      if ((u as any).deletedAt) {
        await storage.upsertWorkerProjection({
          userId: u.id,
          businessVisibilityStatus: "hidden",
          availabilityStatus: "unavailable",
        } as any);
        continue;
      }
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

  app.post("/api/auth/login", handleLogin(storage, {
    syncPreapprovedStatus: async (user, email) => {
      if (user.day1OG && user.trustBoxPurchased) return user;
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
      if (Object.keys(loginUpdates).length === 0) return user;
      await storage.updateUser(user.id, loginUpdates);
      const refreshed = (await storage.getUser(user.id))!;
      if (loginUpdates.day1OG) {
        await storage.createNotification({ userId: refreshed.id, title: "Day-1 OG Activated!", body: "You're a Day-1 OG member — your perks are now active.", type: "system" });
      }
      if (loginUpdates.trustBoxPurchased) {
        await storage.createNotification({ userId: refreshed.id, title: "Trust Box Activated!", body: "Your AI or Not premium access is now active.", type: "system" });
      }
      return refreshed;
    },
  }));

  app.post("/api/auth/logout", handleLogout());

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
      await regenerateSession(req);
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

  app.get("/api/auth/me", handleMe(storage));

  const getBaseUrl = (req: Request) => {
    if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
    const scheme = proto === "https" || process.env.NODE_ENV === "production" ? "https" : "http";
    return `${scheme}://${req.get("host")}`;
  };

  // ---------------------------------------------------------------------------
  // Shared Google user upsert helper (web callback + native endpoint both use this)
  // ---------------------------------------------------------------------------
  async function upsertGoogleUser(
    googleUser: { sub: string; email: string; name: string; picture: string | null },
    pendingReferralCode: string | null,
  ) {
    let user = await storage.getUserByGoogleSub(googleUser.sub);
    if (!user) {
      user = await storage.getUserByEmail(googleUser.email);
      if (user) {
        // Defensive: refuse to re-link a soft-deleted account via Google. The
        // anonymised tombstone email also won't match googleUser.email so this
        // branch is normally unreachable, but check explicitly for clarity.
        if ((user as any).deletedAt) {
          throw new Error("This account has been deleted.");
        }
        console.log(`[GUBER auth] Google upsert — linking existing email account (userId=${user.id})`);
        await storage.updateUser(user.id, { googleSub: googleUser.sub, authProvider: "google" });
        user = (await storage.getUser(user.id))!;
      }
    } else {
      if ((user as any).deletedAt) {
        throw new Error("This account has been deleted.");
      }
      console.log(`[GUBER auth] Google upsert — returning user (userId=${user.id})`);
    }

    if (!user) {
      console.log(`[GUBER auth] Google upsert — creating new account for email=${googleUser.email}`);
      const baseUsername = (googleUser.email.split("@")[0] || "user").replace(/[^a-z0-9_]/gi, "").toLowerCase();
      let username = baseUsername;
      let suffix = 1;
      while (await storage.getUserByUsername(username)) { username = `${baseUsername}${suffix++}`; }

      let newGuberId = generateGuberId();
      while (await storage.getUserByGuberId(newGuberId)) { newGuberId = generateGuberId(); }

      let newRefCode = generateReferralCode();
      while ((await db.execute(sql`SELECT 1 FROM users WHERE referral_code = ${newRefCode} LIMIT 1`)).rows.length) {
        newRefCode = generateReferralCode();
      }

      let referrerId: number | null = null;
      if (pendingReferralCode) {
        const ro = await db.execute(sql`SELECT id FROM users WHERE referral_code = ${pendingReferralCode} LIMIT 1`);
        if (ro.rows.length) referrerId = (ro.rows[0] as any).id;
      }

      // GUBER Performance Shares attribution: window starts at signup.
      const psNow = new Date();
      const psWindowEnd = referrerId
        ? new Date(psNow.getTime() + 30 * 24 * 60 * 60 * 1000)
        : null;

      user = await storage.createUser({
        email: googleUser.email,
        username,
        fullName: googleUser.name,
        password: await hashPassword(randomBytes(32).toString("hex")),
        googleSub: googleUser.sub,
        authProvider: "google",
        emailVerified: true,
        profilePhoto: googleUser.picture,
        role: "buyer",
        tier: "community",
        day1OG: false,
        guberId: newGuberId,
        referralCode: newRefCode,
        referredBy: referrerId,
        referredAt: referrerId ? psNow : null,
        performanceShareWindowEndsAt: psWindowEnd,
        performanceShareEligible: !!referrerId,
      } as any);

      if (referrerId) {
        await db.insert(referrals).values({ referrerId, referredId: user.id, status: "pending" }).onConflictDoNothing();
      }

      const ogCheck = await db.execute(sql`SELECT 1 FROM og_preapproved_emails WHERE email = ${googleUser.email.toLowerCase()} LIMIT 1`);
      const tbCheck = await db.execute(sql`SELECT 1 FROM trust_box_preapproved_emails WHERE LOWER(email) = ${googleUser.email.toLowerCase()} LIMIT 1`);
      const stripe = await checkStripeForOGStatus(googleUser.email);
      const isOG = ogCheck.rows.length > 0 || stripe.isOG;
      const hasTB = tbCheck.rows.length > 0 || stripe.hasTrustBox;

      const updates: Record<string, any> = {};
      if (isOG) { updates.day1OG = true; updates.aiOrNotCredits = 5; }
      if (hasTB) { updates.trustBoxPurchased = true; updates.aiOrNotUnlimitedText = true; if ((user.aiOrNotCredits || 0) < 5) updates.aiOrNotCredits = (user.aiOrNotCredits || 0) + 5; }
      if (Object.keys(updates).length > 0) await storage.updateUser(user.id, updates);

      // Persist Stripe-derived status into preapproved tables for future logins
      if (stripe.isOG && ogCheck.rows.length === 0) {
        await db.execute(sql`INSERT INTO og_preapproved_emails (email) VALUES (${googleUser.email.toLowerCase()}) ON CONFLICT DO NOTHING`);
      }
      if (stripe.hasTrustBox && tbCheck.rows.length === 0) {
        await db.execute(sql`INSERT INTO trust_box_preapproved_emails (email) VALUES (${googleUser.email.toLowerCase()}) ON CONFLICT DO NOTHING`);
      }

      if (isOG && hasTB) {
        await storage.createNotification({ userId: user.id, title: "Welcome, OG + Trust Box!", body: "Day-1 OG status and Trust Box are both active. Thanks for your early support!", type: "system" });
      } else if (isOG) {
        await storage.createNotification({ userId: user.id, title: "Welcome, Day-1 OG!", body: "You're a Day-1 OG member — your perks are already active. Thank you for your early support!", type: "system" });
      } else if (hasTB) {
        await storage.createNotification({ userId: user.id, title: "Trust Box Activated!", body: "Your AI or Not premium access is ready. Thanks for subscribing!", type: "system" });
      } else {
        await storage.createNotification({ userId: user.id, title: "Welcome to GUBER!", body: "Your account has been created via Google. Complete your profile to get started.", type: "system" });
      }
    }

    // Sync OG / TrustBox on every Google login for existing users
    if (!user.day1OG || !user.trustBoxPurchased) {
      const loginOgCheck = await db.execute(sql`SELECT 1 FROM og_preapproved_emails WHERE email = ${googleUser.email.toLowerCase()} LIMIT 1`);
      const loginTbCheck = await db.execute(sql`SELECT 1 FROM trust_box_preapproved_emails WHERE LOWER(email) = ${googleUser.email.toLowerCase()} LIMIT 1`);
      const stripeLogin = await checkStripeForOGStatus(googleUser.email);
      const loginUpdates: Record<string, any> = {};
      if (!user.day1OG && (loginOgCheck.rows.length > 0 || stripeLogin.isOG)) {
        loginUpdates.day1OG = true;
        if (!user.aiOrNotCredits || user.aiOrNotCredits < 5) loginUpdates.aiOrNotCredits = 5;
      }
      if (!user.trustBoxPurchased && (loginTbCheck.rows.length > 0 || stripeLogin.hasTrustBox)) {
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

    return user;
  }

  app.post("/api/auth/store-ref", (req: Request, res: Response) => {
    const { ref } = req.body;
    if (ref && typeof ref === "string") (req.session as any).pendingReferralCode = ref.toUpperCase();
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // Poll-token store for Chrome Custom Tab OAuth flow (no deep link required)
  // The app supplies a random pollKey before opening the browser. After OAuth
  // completes, the server stores the JWT here. The app retrieves it by polling
  // /api/auth/google/poll — one-time use, 5-minute TTL.
  // ---------------------------------------------------------------------------
  const pollTokenStore = new Map<string, { jwt: string; accountType: string; expiresAt: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of pollTokenStore) {
      if (now >= v.expiresAt) pollTokenStore.delete(k);
    }
  }, 60_000);

  app.get("/api/auth/google", handleGoogleAuthStart);

  app.get("/api/auth/google/poll", (req: Request, res: Response) => {
    const key = req.query.key as string | undefined;
    if (!key || !/^[a-f0-9]{8,64}$/.test(key)) {
      return res.status(400).json({ message: "invalid key" });
    }
    const entry = pollTokenStore.get(key);
    if (!entry || Date.now() >= entry.expiresAt) {
      return res.status(202).json({ pending: true });
    }
    pollTokenStore.delete(key); // one-time use
    return res.json({ token: entry.jwt, user: { accountType: entry.accountType } });
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    console.log(`[GUBER auth] Google callback received — query keys: ${Object.keys(req.query).join(", ")}`);
    const stateResult = await validateOAuthState(req, res); // pass res so cookie is cleared
    if (!stateResult.valid) {
      console.warn(`[GUBER auth] Google callback rejected: ${stateResult.reason}`);
      return res.redirect(`/login?error=${stateResult.reason === "invalid_state" ? "invalid_state" : "google_cancelled"}`);
    }
    const code = stateResult.code;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.error("[GUBER auth] Google callback — GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured");
      return res.redirect("/login?error=not_configured");
    }
    try {
      const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
      console.log(`[GUBER auth] Google token exchange — redirectUri=${redirectUri}`);
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      });
      const tokens = await tokenRes.json() as any;
      if (!tokens.access_token) {
        console.error("[GUBER auth] Google token exchange failed — no access_token in response:", JSON.stringify(tokens).slice(0, 200));
        return res.redirect("/login?error=token_failed");
      }
      console.log("[GUBER auth] Google token exchange succeeded");
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      const googleUser = await userInfoRes.json() as any;
      if (!googleUser.sub || !googleUser.email) {
        console.error("[GUBER auth] Google userinfo missing sub or email:", JSON.stringify(googleUser).slice(0, 200));
        return res.redirect("/login?error=no_user_info");
      }
      console.log(`[GUBER auth] Google userinfo received — email=${googleUser.email}`);
      let user = await upsertGoogleUser(
        {
          sub: googleUser.sub,
          email: googleUser.email,
          name: googleUser.name || googleUser.email.split("@")[0],
          picture: googleUser.picture || null,
        },
        (req.session as any).pendingReferralCode || null,
      );

      if (user.banned) {
        console.warn(`[GUBER auth] Google login blocked — user ${user.id} is banned`);
        return res.redirect("/login?error=banned");
      }
      if (user.suspended) {
        console.warn(`[GUBER auth] Google login blocked — user ${user.id} is suspended`);
        return res.redirect("/login?error=suspended");
      }
      const jwtToken = generateJWT(user);
      const returnTo = stateResult.returnTo;
      if (stateResult.isNative) {
        const pollKey = stateResult.pollKey;
        if (pollKey) {
          // Polling flow: store JWT for the app to retrieve; return a self-contained
          // success page that closes the Chrome Custom Tab automatically.
          pollTokenStore.set(pollKey, {
            jwt: jwtToken,
            accountType: user.accountType || "worker",
            expiresAt: Date.now() + 5 * 60 * 1000,
          });
          console.log(`[GUBER auth] Google auth complete (native/poll) — userId=${user.id} pollKey=${pollKey.slice(0, 8)}…`);
          return res.type("html").send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#0a0a0a">
  <title>Signed in — GUBER</title>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;height:100%;width:100%;overflow:hidden}
    body{display:flex;align-items:center;justify-content:center;padding:env(safe-area-inset-top,0) 24px env(safe-area-inset-bottom,0)}
    .glow-a{position:fixed;top:50%;left:50%;width:600px;height:600px;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle,rgba(0,224,124,0.08),transparent 65%);pointer-events:none}
    .glow-b{position:fixed;bottom:18%;right:8%;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle,rgba(168,85,247,0.05),transparent 65%);pointer-events:none}
    .card{position:relative;z-index:1;max-width:320px;text-align:center}
    .brand{font-family:'Oxanium','Inter',-apple-system,sans-serif;font-weight:800;letter-spacing:.18em;font-size:30px;color:#fff;margin:0 0 28px;text-transform:uppercase}
    .brand span{color:#00e07c}
    .check{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:rgba(0,224,124,0.12);border:1px solid rgba(0,224,124,0.35);margin-bottom:20px}
    .check svg{width:28px;height:28px;color:#00e07c}
    h1{font-family:'Oxanium','Inter',-apple-system,sans-serif;font-size:18px;font-weight:600;letter-spacing:.05em;margin:0 0 10px;color:#fff}
    p{font-size:13px;color:#9a9a9a;margin:0 0 24px;line-height:1.5;letter-spacing:.02em}
    .spinner{width:18px;height:18px;border:2px solid rgba(0,224,124,0.2);border-top-color:rgba(0,224,124,0.6);border-radius:50%;margin:0 auto;animation:spin 0.9s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <div class="glow-a"></div>
  <div class="glow-b"></div>
  <div class="card">
    <div class="brand">G<span>U</span>BER</div>
    <div class="check">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 13 10 18 19 7"/></svg>
    </div>
    <h1>Signed in!</h1>
    <p>Returning to GUBER…</p>
    <div class="spinner"></div>
  </div>
  <script>
    (function () {
      // Aggressively try to dismiss the system browser tab so the user lands
      // back inside the GUBER app within ~300ms instead of staring at this page.
      function tryClose() {
        try { window.close(); } catch (e) {}
        // Capacitor Browser plugin (in-app browser variant) listens for this
        // postMessage and will close the tab if it owns the window.
        try { window.parent && window.parent.postMessage({ type: 'guber-auth-complete' }, '*'); } catch (e) {}
        try { window.opener && window.opener.postMessage({ type: 'guber-auth-complete' }, '*'); } catch (e) {}
      }
      tryClose();
      setTimeout(tryClose, 100);
      setTimeout(tryClose, 400);
      // Final safety net: if the tab is still open after a couple of seconds
      // (some Chrome Custom Tab builds refuse window.close), bounce to the
      // app's home so the user at least sees the dark GUBER shell.
      setTimeout(function () {
        if (!window.closed) { window.location.replace('/'); }
      }, 2200);
    })();
  </script>
</body>
</html>`);
        }

        // Deep-link flow (requires registered guber:// scheme in the APK).
        // guber:// custom URI — handled by the Android/iOS app's intent filter.
        // Chrome Custom Tab (Android 83+) blocks intent:// JS navigation without a
        // user gesture and immediately follows S.browser_fallback_url (→ Play Store).
        // Using guber:// only avoids that redirect; the bounce page button (user gesture)
        // guarantees navigation works on all Chrome versions.
        const guberUrl = returnTo
          ? `guber://auth-success?token=${encodeURIComponent(jwtToken)}&returnTo=${encodeURIComponent(returnTo)}`
          : `guber://auth-success?token=${encodeURIComponent(jwtToken)}`;

        console.log(`[GUBER auth] Google auth complete (native/deeplink) — userId=${user.id} returnTo=${returnTo || "none"}`);
        return res.type("html").send(buildNativeBounceHtml(guberUrl));
      }
      const authSuccessUrl = returnTo
        ? `/auth-success?token=${encodeURIComponent(jwtToken)}&returnTo=${encodeURIComponent(returnTo)}`
        : `/auth-success?token=${encodeURIComponent(jwtToken)}`;
      console.log(`[GUBER auth] Google auth complete (web) — userId=${user.id} destination=${authSuccessUrl.split("?")[0]} returnTo=${returnTo || "none"}`);
      res.redirect(authSuccessUrl);
    } catch (err: any) {
      console.error("[GUBER auth] Google OAuth error:", err?.message || err);
      res.redirect("/login?error=google_failed");
    }
  });

  // Native Google Sign-In — receives an ID token from the Android/iOS app
  // (no browser, no redirect — direct token verification via Google's tokeninfo API)
  app.post(
    "/api/auth/google/native",
    handleNativeGoogleAuth({
      webClientId: process.env.GOOGLE_CLIENT_ID || "",
      androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID,
      upsertGoogleUser,
      generateToken: generateJWT,
    }),
  );

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
            paths: ["/login", "/auth-success", "/join/*", "/dashboard", "/biz/*"],
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
          sha256_cert_fingerprints: [
            "3E:7D:66:29:CF:7F:F0:38:57:64:1D:D1:61:3C:0E:C6:2A:7A:0B:E5:B9:6C:F9:71:76:9E:6F:1B:C8:0C:E1:0B",
            "C4:C4:B9:0E:B5:08:EC:5F:BD:EB:B9:ED:24:9D:02:EF:E7:C9:5D:BE:A3:43:97:9F:E8:09:3E:5A:AB:79:8A:21",
          ],
        },
      },
    ]);
  });

  app.get("/api/auth/oauth-pickup", (_req: Request, res: Response) => {
    res.status(410).json({ message: "Gone — use the JWT redirect flow" });
  });

  app.get("/api/auth/exchange-token", (_req: Request, res: Response) => {
    res.status(410).json({ message: "Gone — use the JWT redirect flow" });
  });

  app.post("/api/auth/forgot-password", handleForgotPassword(storage, {
    getBaseUrl,
    sendResetEmail: async (to, resetUrl, user) => {
      if (!process.env.RESEND_API_KEY) return;
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromDomain = process.env.RESEND_FROM_DOMAIN || "guberapp.app";
      const { data, error } = await resend.emails.send({
        from: `GUBER <noreply@${fromDomain}>`,
        to,
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
    },
  }));

  app.post("/api/auth/reset-password", handleResetPassword(storage));

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
        notifReminderPreArrival: user.notifReminderPreArrival ?? true,
        notifReminderOnTheWay: user.notifReminderOnTheWay ?? true,
        notifReminderPayoutRelease: user.notifReminderPayoutRelease ?? true,
        notifReminderAtRisk: user.notifReminderAtRisk ?? true,
        notifReminderDropExpiring: user.notifReminderDropExpiring ?? true,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/users/me/notification-preferences", requireAuth, async (req: Request, res: Response) => {
    try {
      const {
        notifNearbyJobs, notifMessages, notifJobUpdates, notifCashDrops,
        notifReminderPreArrival, notifReminderOnTheWay, notifReminderPayoutRelease,
        notifReminderAtRisk, notifReminderDropExpiring,
      } = req.body;
      const updates: Partial<{
        notifNearbyJobs: boolean; notifMessages: boolean; notifJobUpdates: boolean; notifCashDrops: boolean;
        notifReminderPreArrival: boolean; notifReminderOnTheWay: boolean; notifReminderPayoutRelease: boolean;
        notifReminderAtRisk: boolean; notifReminderDropExpiring: boolean;
      }> = {};
      if (typeof notifNearbyJobs === "boolean") updates.notifNearbyJobs = notifNearbyJobs;
      if (typeof notifMessages === "boolean") updates.notifMessages = notifMessages;
      if (typeof notifJobUpdates === "boolean") updates.notifJobUpdates = notifJobUpdates;
      if (typeof notifCashDrops === "boolean") updates.notifCashDrops = notifCashDrops;
      if (typeof notifReminderPreArrival === "boolean") updates.notifReminderPreArrival = notifReminderPreArrival;
      if (typeof notifReminderOnTheWay === "boolean") updates.notifReminderOnTheWay = notifReminderOnTheWay;
      if (typeof notifReminderPayoutRelease === "boolean") updates.notifReminderPayoutRelease = notifReminderPayoutRelease;
      if (typeof notifReminderAtRisk === "boolean") updates.notifReminderAtRisk = notifReminderAtRisk;
      if (typeof notifReminderDropExpiring === "boolean") updates.notifReminderDropExpiring = notifReminderDropExpiring;
      await storage.updateUser(req.session.userId!, updates);
      // Return the full canonical preference object so the client always
      // sees authoritative server state regardless of what was patched.
      const fresh = await storage.getUser(req.session.userId!);
      res.json({
        success: true,
        notifNearbyJobs: fresh?.notifNearbyJobs ?? true,
        notifMessages: fresh?.notifMessages ?? true,
        notifJobUpdates: fresh?.notifJobUpdates ?? true,
        notifCashDrops: fresh?.notifCashDrops ?? true,
        notifReminderPreArrival: fresh?.notifReminderPreArrival ?? true,
        notifReminderOnTheWay: fresh?.notifReminderOnTheWay ?? true,
        notifReminderPayoutRelease: fresh?.notifReminderPayoutRelease ?? true,
        notifReminderAtRisk: fresh?.notifReminderAtRisk ?? true,
        notifReminderDropExpiring: fresh?.notifReminderDropExpiring ?? true,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Stores the user's preferred external map app (Apple Maps, Google Maps,
  // Waze, …) so the future GUBER navigation wrapper can hand off to the
  // right destination without asking every time. Sending null clears it.
  app.post("/api/users/me/preferred-map-app", requireAuth, async (req: Request, res: Response) => {
    try {
      const ALLOWED = new Set(["apple_maps", "google_maps", "waze", null]);
      const raw = req.body?.app;
      const value = raw === undefined ? null : raw;
      if (!ALLOWED.has(value)) {
        return res.status(400).json({ message: "app must be one of: apple_maps, google_maps, waze, null" });
      }
      await storage.updateUser(req.session.userId!, { preferredMapApp: value } as any);
      res.json({ success: true, preferredMapApp: value });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Liability protection (Task #318): record one-time global liability
  // disclaimer acknowledgement on the user. Idempotent — repeat calls are
  // a no-op once the timestamp is set.
  app.post("/api/users/me/accept-liability-disclaimer", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const existing = await storage.getUser(userId);
      if (!existing) return res.status(404).json({ message: "User not found" });
      const already = (existing as any).liabilityDisclaimerAcceptedAt;
      if (!already) {
        await storage.updateUser(userId, { liabilityDisclaimerAcceptedAt: new Date() } as any);
        await storage.createAuditLog({
          userId,
          action: "liability_disclaimer_accepted",
          details: "User accepted the global GUBER liability disclaimer (Task #318)",
          ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.ip || null,
        });
      }
      const updated = await storage.getUser(userId);
      res.json({
        success: true,
        liabilityDisclaimerAcceptedAt: (updated as any)?.liabilityDisclaimerAcceptedAt ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/users/me/review-liability-disclaimer", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user || !(user as any).liabilityDisclaimerAcceptedAt) {
        return res.status(400).json({ message: "Disclaimer has not been accepted yet" });
      }
      await storage.createAuditLog({
        userId,
        action: "liability_disclaimer_reviewed",
        details: "User re-read the global GUBER liability disclaimer from account settings",
      });
      res.json({ success: true });
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
    // Treat soft-deleted users as 404 — their profile/login data has been
    // wiped and they should not be discoverable through public lookups.
    if ((user as any).deletedAt) return res.status(404).json({ message: "User not found" });

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
          sound: "guber_action.wav",
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
      // Heat-map is a public/aggregated view — exclude demo posters so the
      // seeded demo footprint doesn't pollute real-user zip counts.
      const demoIds = await getDemoUserIds();
      const data = await storage.getJobCountsByZip(Array.from(demoIds));
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/map-jobs", async (req: Request, res: Response) => {
    try {
      let mapJobs = await storage.getOpenJobsForMap();

      const demoIds = await getDemoUserIds();
      const isAdmin = await viewerIsAdmin(req);
      mapJobs = mapJobs.filter(j => viewerCanSeeJobSync(j, req.session?.userId, isAdmin, demoIds));

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
          // Include zip so the client can render the job's local timezone
          // on map-pin "Posted" timestamps (per task #296 timezone tags).
          zip: j.zip ?? null,
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
      const isAdmin = await viewerIsAdmin(req);
      mapJobs = mapJobs.filter(j => viewerCanSeeJobSync(j, req.session?.userId, isAdmin, demoIds));

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
        } else if (metadata?.type === "day1og") {
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
              console.log(`[GUBER][webhook/connect] day1og: OG pre-approved email saved for future signup: ${fallbackEmail}`);
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
              details: `Day-1 OG activated via Stripe payroll account. Email: ${ogUser.email}. Session: ${session.id}`,
            });
            await storage.createNotification({
              userId: ogUser.id,
              title: "Day-1 OG Activated!",
              body: "You are now a Day-1 OG! Perks: free urgent toggle, 15% service fee, 5 AI or Not credits, unlimited text verification.",
              type: "system",
            });
            console.log(`[GUBER][webhook/connect] day1og: user ${ogUser.id} (${ogUser.email}) updated → day1OG=true`);
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
                console.error("[GUBER][webhook/connect] OG activation email failed:", emailErr.message);
              }
            }
          } else if (ogUser?.day1OG) {
            console.log(`[GUBER][webhook/connect] day1og: user ${ogUser.id} already has day1OG — skipped`);
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
              details: `Trust Box subscription activated via payroll account checkout. Email: ${tbUser.email}. Sub: ${subscriptionId || "n/a"}. Session: ${session.id}`,
            });
            if (!alreadyActive) {
              await storage.createNotification({
                userId,
                title: "Trust Box Active!",
                body: "Your AI or Not premium subscription is live. Unlimited detections, text analysis, and more — $4.99/month.",
                type: "system",
              });
            }
            console.log(`[GUBER][webhook/connect] trust_box: user ${userId} updated → trustBoxPurchased=true, sub=${subscriptionId || "n/a"}`);
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
              details: `Trust Box subscription created via payroll account. Sub: ${sub.id}. Status: ${sub.status}`,
            });
            console.log(`[GUBER][webhook/connect] subscription.created: user ${userId} → trustBoxPurchased=true, sub=${sub.id}`);
          }
        } else {
          console.log(`[GUBER][webhook/connect] subscription.created: unhandled type "${subMeta?.type || "none"}" — ignored`);
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
          console.log(`[GUBER][webhook/connect] subscription.updated: user ${userId} → trustBoxPurchased=${isActive}, status=${sub.status}`);
        } else {
          console.log(`[GUBER][webhook/connect] subscription.updated: unhandled type "${subMeta?.type || "none"}" — ignored`);
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
            details: `Trust Box subscription cancelled/expired via payroll account. Sub: ${sub.id}`,
          });
          await storage.createNotification({
            userId,
            title: "Trust Box Ended",
            body: "Your Trust Box subscription has ended. Resubscribe to restore AI or Not premium access.",
            type: "system",
          });
          console.log(`[GUBER][webhook/connect] subscription.deleted: user ${userId} → trustBoxPurchased=false`);
        } else {
          console.log(`[GUBER][webhook/connect] subscription.deleted: unhandled type "${subMeta?.type || "none"}" — ignored`);
        }

      } else if (event.type === "invoice.paid") {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : (invoice.subscription as any)?.id;
        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            const subMeta = sub.metadata;
            if (subMeta?.type === "trust_box" && subMeta?.userId) {
              const userId = parseInt(subMeta.userId);
              await storage.updateUser(userId, { trustBoxPurchased: true, trustBoxSubscriptionId: sub.id });
              await storage.createAuditLog({
                userId,
                action: "trust_box_renewed",
                details: `Trust Box subscription renewed via payroll account. Invoice: ${invoice.id}. Sub: ${sub.id}`,
              });
              console.log(`[GUBER][webhook/connect] invoice.paid: user ${userId} Trust Box renewed — invoice ${invoice.id}`);
            } else {
              console.log(`[GUBER][webhook/connect] invoice.paid: sub ${subscriptionId} is not a trust_box — ignored`);
            }
          } catch (subErr: any) {
            console.error(`[GUBER][webhook/connect] invoice.paid: failed to retrieve sub ${subscriptionId}:`, subErr.message);
          }
        } else {
          console.log(`[GUBER][webhook/connect] invoice.paid: no subscription on invoice ${invoice.id} — ignored`);
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

  // ── GUBER Performance Shares (referral cash rewards) ────────────────────
  // Returns the viewer's referral code/link, their reward rate (Day-1 OG vs
  // standard), totals earned/voided, recent reward rows, and — if the viewer
  // is themselves a referred user — the countdown until their referrer's
  // 30-day earning window expires.
  app.get("/api/users/me/referral", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      // Lazy-create referral code on first view.
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
      const isDay1OG = (user as any).day1OG === true;
      const ratePct = isDay1OG ? 10 : 5;

      // Count of users this person has referred (any status).
      const referredCountRow = await db.execute(
        sql`SELECT COUNT(*)::int AS n FROM users WHERE referred_by = ${userId}`,
      );
      const referredCount = ((referredCountRow.rows[0] as any)?.n as number) || 0;

      // Earned vs voided totals from the per-job snapshot.
      const totalsRow = await db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN referral_reward_status IN ('earned','paid') THEN referral_reward_amount ELSE 0 END), 0)::float AS earned,
          COALESCE(SUM(CASE WHEN referral_reward_status = 'voided' THEN referral_reward_amount ELSE 0 END), 0)::float AS voided,
          COUNT(*) FILTER (WHERE referral_reward_status IN ('earned','paid'))::int AS earned_count
        FROM jobs WHERE referral_reward_user_id = ${userId}
      `);
      const totals = (totalsRow.rows[0] as any) || {};
      const totalEarned = Number(totals.earned || 0);
      const totalVoided = Number(totals.voided || 0);
      const earnedJobsCount = Number(totals.earned_count || 0);

      // Recent rewards for the activity list (last 10).
      const recentRows = await db.execute(sql`
        SELECT id, title, referral_reward_amount, referral_reward_status,
               referral_reward_type, charged_at
        FROM jobs
        WHERE referral_reward_user_id = ${userId}
        ORDER BY COALESCE(charged_at, created_at) DESC
        LIMIT 10
      `);
      const recentRewards = recentRows.rows.map((r: any) => ({
        jobId: r.id,
        jobTitle: r.title,
        amount: Number(r.referral_reward_amount || 0),
        status: r.referral_reward_status,
        type: r.referral_reward_type,
        chargedAt: r.charged_at ? new Date(r.charged_at).toISOString() : null,
      }));

      // If the viewer themselves was referred, show their referrer's window
      // status so they understand the program from both sides.
      const wasReferred = !!(user as any).referredBy;
      const myWindowEndsAt = (user as any).performanceShareWindowEndsAt
        ? new Date((user as any).performanceShareWindowEndsAt as Date).toISOString()
        : null;
      const myWindowActive = !!myWindowEndsAt && new Date(myWindowEndsAt) > new Date();
      const myWindowDaysRemaining = myWindowActive && myWindowEndsAt
        ? Math.ceil((new Date(myWindowEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 0;

      res.json({
        code,
        link,
        // `count` is a back-compat alias for legacy clients; new code uses `referredCount`.
        count: referredCount,
        isDay1OG,
        ratePct,
        referredCount,
        earnedJobsCount,
        totalEarned: Math.round(totalEarned * 100) / 100,
        totalVoided: Math.round(totalVoided * 100) / 100,
        recentRewards,
        wasReferred,
        myWindowEndsAt,
        myWindowActive,
        myWindowDaysRemaining,
      });
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

      // Vision-based country / document analysis (ID submissions only)
      const isIdSubmission = log.action === "id_upload" || log.action === "verification_submitted_id";
      let visionResult: import("./id-vision").IdVisionResult | null = parsedDetails.aiAnalysis || null;

      if (isIdSubmission && !visionResult && parsedDetails.imageBase64) {
        const { analyzeIdImage } = await import("./id-vision");
        visionResult = await analyzeIdImage(parsedDetails.imageBase64);
        // Cache on the audit log so repeated admin clicks don't re-bill
        try {
          const merged = { ...parsedDetails, aiAnalysis: visionResult };
          await db.update(auditLogsTable)
            .set({ details: JSON.stringify(merged) })
            .where(sqlEq(auditLogsTable.id, logId));
        } catch (e) { /* non-fatal — keep going with the in-memory result */ }
      }

      if (visionResult) {
        if (visionResult.error) {
          flags.push(`ID image analysis unavailable (${visionResult.error}) — review document manually`);
        } else if (visionResult.nonUsIdDetected) {
          const country = visionResult.documentCountry || "non-US country";
          const kind = visionResult.documentKind || "identity document";
          flags.push(`Non-US identity document detected (${country} ${kind})`);
          riskScore += 80;
        } else if (visionResult.isIdentityDocument && visionResult.isUsIssued) {
          // Positive signal — slight risk reduction
          riskScore = Math.max(0, riskScore - 5);
        } else if (!visionResult.isIdentityDocument && visionResult.confidence >= 0.6) {
          flags.push(`Image does not appear to be a government photo ID (looks like: ${visionResult.documentKind})`);
          riskScore += 40;
        }
      }

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
        vision: visionResult ? {
          documentCountry: visionResult.documentCountry,
          countryCode: visionResult.countryCode,
          documentKind: visionResult.documentKind,
          isIdentityDocument: visionResult.isIdentityDocument,
          isUsIssued: visionResult.isUsIssued,
          nonUsIdDetected: visionResult.nonUsIdDetected,
          confidence: visionResult.confidence,
          reasoning: visionResult.reasoning,
          error: visionResult.error,
        } : null,
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
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const userParam = (req.query.user as string || "").trim();
      const actionParam = (req.query.action as string || "").trim();
      const detailsParam = (req.query.details as string || "").trim();
      const fromParam = (req.query.from as string || "").trim();
      const toParam = (req.query.to as string || "").trim();

      const conditions: SQL<unknown>[] = [];
      if (userParam) {
        const numericId = parseInt(userParam);
        if (!isNaN(numericId)) {
          conditions.push(or(ilike(usersTable.username, `%${userParam}%`), sqlEq(auditLogsTable.userId, numericId))!);
        } else {
          conditions.push(ilike(usersTable.username, `%${userParam}%`));
        }
      }
      if (actionParam) {
        conditions.push(sqlEq(auditLogsTable.action, actionParam));
      }
      if (detailsParam) {
        conditions.push(ilike(auditLogsTable.details, `%${detailsParam}%`));
      }
      if (fromParam) {
        const fromDate = new Date(fromParam);
        if (isNaN(fromDate.getTime())) return res.status(400).json({ message: "Invalid 'from' date" });
        conditions.push(gte(auditLogsTable.createdAt, fromDate));
      }
      if (toParam) {
        const toDate = new Date(toParam);
        if (isNaN(toDate.getTime())) return res.status(400).json({ message: "Invalid 'to' date" });
        toDate.setUTCHours(23, 59, 59, 999);
        conditions.push(lte(auditLogsTable.createdAt, toDate));
      }

      const baseQuery = db
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
        .limit(limit + 1)
        .offset(offset);

      const rows = await (conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery);
      const hasMore = rows.length > limit;
      const logs = hasMore ? rows.slice(0, limit) : rows;
      res.json({ logs, offset, limit, hasMore });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/users/:id/audit-logs", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) return res.status(400).json({ message: "Invalid user id" });
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const logs = await db
        .select({
          id: auditLogsTable.id,
          userId: auditLogsTable.userId,
          action: auditLogsTable.action,
          details: auditLogsTable.details,
          ipAddress: auditLogsTable.ipAddress,
          createdAt: auditLogsTable.createdAt,
        })
        .from(auditLogsTable)
        .where(sqlEq(auditLogsTable.userId, userId))
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
      // Sanitize each job from the viewer's perspective so workers don't see
      // the poster's auto-increase ceiling on jobs they accepted. Admins
      // bypass sanitization so support tooling sees the real state.
      const isAdmin = await viewerIsAdmin(req);
      const sanitized = jobs.map(j => sanitizeJobForPublic(j, req.session.userId, isAdmin));
      res.json(sanitized);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/jobs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const job = await storage.getJob(parseInt(req.params.id));
      if (!job) return res.status(404).json({ message: "Job not found" });

      const isOwner = req.session.userId === job.postedById;
      const isHelper = req.session.userId === job.assignedHelperId;
      const isAdmin = await viewerIsAdmin(req);
      // Strangers can't peek at unpublished/draft jobs by guessing IDs.
      // Admins are exempt so support can audit drafts/unpaid posts.
      if (!isOwner && !isHelper && !isAdmin && (job.status === "draft" || !job.isPaid)) {
        return res.status(403).json({ message: "Job not available" });
      }
      // Demo isolation: real users can't fetch demo job details by ID and
      // demo users can't fetch real job details. Owner/helper/admin paths
      // above already short-circuited so this only affects strangers.
      const demoIds = await getDemoUserIds();
      if (!viewerCanSeeJobSync(job, req.session.userId, isAdmin, demoIds)) {
        return res.status(404).json({ message: "Job not found" });
      }

      // Retroactive geocode if lat/lng still missing (fire-and-forget).
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

      const sanitized = sanitizeJobForPublic(job, req.session.userId, isAdmin);

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
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = insertJobSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });

      // Liability protection (Task #318): the global liability disclaimer
      // must be acknowledged at least once before a user can post a job.
      // Enforced server-side so direct API callers cannot bypass the
      // client modal.
      const poster = await storage.getUser(req.session.userId!);
      if (!poster?.liabilityDisclaimerAcceptedAt) {
        return res.status(412).json({
          message: "DISCLAIMER_REQUIRED",
          detail: "Please acknowledge the GUBER liability disclaimer before posting.",
        });
      }

      // Liability protection (Task #318): mirror the create-checkout guard
      // for jobs created directly (e.g. business posting flow).
      const disallowedHit = detectDisallowedJobContent({
        title: parsed.data.title || null,
        description: parsed.data.description || null,
        serviceType: (parsed.data as any).serviceType || null,
        jobDetails: (parsed.data as any).jobDetails || null,
      });
      if (disallowedHit) {
        await storage.createAuditLog({
          userId: req.session.userId,
          action: "disallowed_job_blocked",
          details: `Blocked ${disallowedHit.category} content in /api/jobs`,
        });
        return res.status(400).json({
          message: "DISALLOWED_JOB",
          detail: disallowedHit.message,
          category: disallowedHit.category,
        });
      }

      // Structured-coordination soft check: non-urgent jobs SHOULD post one or
      // more availability windows so the no-chat scheduling flow can engage.
      // We only warn (not reject) during the transition so the legacy post
      // flow keeps working until the Phase-2 UI lands.
      const isUrgent = parsed.data.urgentSwitch === true || parsed.data.category === "On-Demand Help";
      const windows = (parsed.data as any).availabilityWindows;
      if (!isUrgent && windows != null && !validateAvailabilityWindows(windows)) {
        return res.status(400).json({ message: "availabilityWindows must be an array of {date, startTime, endTime} objects" });
      }
      if (!isUrgent && (windows == null || (Array.isArray(windows) && windows.length === 0))) {
        console.warn(`[coordination] Non-urgent job posted by user ${req.session.userId} with no availabilityWindows — legacy fallback path.`);
      }

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

      // Liability protection (Task #318): edits must be held to the same
      // disallowed-content rules as create. Mirror the V&I language guard
      // when the post is a Verify & Inspect job.
      const editScreen = {
        title: title ?? job.title ?? "",
        description: description ?? (job as any).description ?? "",
        category: job.category ?? null,
        serviceType: (job as any).serviceType ?? null,
        jobDetails: (job as any).jobDetails ?? null,
      };
      const editDisallowed = detectDisallowedJobContent(editScreen as any);
      if (editDisallowed) {
        return res.status(400).json({
          message: "DISALLOWED_JOB_CONTENT",
          detail: editDisallowed.message,
        });
      }

      const allowedUpdate: any = {};
      if (title !== undefined) {
        // Liability protection (Task #318): mirror create-time filters —
        // strip phone/email/handle/off-platform mentions and apply V&I
        // language scrub when applicable.
        const cleanedTitle = filterContactInfo(String(title)).clean;
        allowedUpdate.title = job.category === "Verify & Inspect"
          ? replaceViLanguage(cleanedTitle)
          : cleanedTitle;
      }
      if (description !== undefined) {
        const cleanedDesc = filterContactInfo(String(description)).clean;
        allowedUpdate.description = job.category === "Verify & Inspect"
          ? replaceViLanguage(cleanedDesc)
          : cleanedDesc;
      }
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
      await respondJob(req, res, updated);
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

      // Helpers can hit this endpoint, so funnel the response through
      // respondJob to strip poster-only price-intent + internal fields.
      await respondJob(req, res, updated);
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

  // Phase 5 — real "Snooze 5m" handler for the missing-on-the-way push.
  // The cron sweep is dedup-gated by the reminders_sent row, so a real
  // snooze must (a) keep the dedupe row in place during the 5-minute
  // window so the 2-minute cron stays silent, (b) re-deliver the push
  // exactly once when the timer fires (if the worker still hasn't tapped
  // on-the-way), then (c) drop the dedupe row so the cron loop can pick
  // back up if the worker keeps ignoring it.
  app.post("/api/reminders/snooze", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const rawJobId = (req.body ?? {}).jobId;
      const type = (req.body ?? {}).type;
      const jobId = typeof rawJobId === "number" ? rawJobId : parseInt(String(rawJobId ?? ""), 10);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return res.status(400).json({ message: "Invalid jobId" });
      }
      // Only the missing-on-the-way reminder supports snooze today.
      if (type !== "missing_otw") {
        return res.status(400).json({ message: "Unsupported reminder type" });
      }

      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      // Only the assigned helper may snooze their own nudge.
      if (job.assignedHelperId !== userId) {
        return res.status(403).json({ message: "Not assigned to this job" });
      }
      // If the worker has already moved on (tapped on-the-way / arrived /
      // unassigned), there's nothing to snooze — just ack.
      if (job.workerOnMyWayAt || job.onTheWayAt || job.workerArrivedAt || job.arrivedAt) {
        return res.json({ snoozed: false, reason: "already_on_the_way" });
      }

      const key = { jobId, type: "missing_otw" as const };

      // Defer the next nudge by 5 minutes. If the worker taps Snooze again
      // during the wait, scheduleSnooze replaces the prior timer so we
      // never fire two pushes back-to-back.
      scheduleSnooze(key, 5, async () => {
        // The dedupe row MUST be dropped on every terminal path — including
        // job-deleted, helper-reassigned, and push-send failures — otherwise
        // the stale row will mute future cron reminders for this job (or for
        // the new helper if it was reassigned). Wrap the whole body in
        // try/finally so cleanup runs no matter what.
        try {
          // Re-check world state at fire time — the worker may have tapped
          // "On the way" between snooze and follow-up.
          const fresh = await storage.getJob(jobId);
          if (!fresh) return;
          // If the helper changed during snooze, skip the push but still
          // fall through to the finally so the dedupe row is cleared and
          // the cron sweep can re-evaluate for the new helper.
          if (fresh.assignedHelperId !== userId) return;
          if (fresh.workerOnMyWayAt || fresh.onTheWayAt || fresh.workerArrivedAt || fresh.arrivedAt) {
            return;
          }
          const helper = await storage.getUser(userId);
          if (!helper) return;
          if (helper.notifReminderOnTheWay === false) return;
          // Snooze can drift across the 10pm quiet-hours boundary
          // (snooze tapped at 9:58pm -> fire at 10:03pm). Non-at-risk
          // reminders MUST respect quiet hours per Phase 5 spec, so we
          // skip the push here. The finally block still drops the
          // dedupe row, letting the cron sweep re-pick this up at 7am.
          if (isUserInQuietHours(helper)) {
            console.log(`[reminders/snooze] suppressed for user ${helper.id} — quiet hours`);
            return;
          }

          const title = "Are you still on the way?";
          const body = `"${fresh.title}" was scheduled to start. Tap "On the way" to confirm or Dismiss to silence this reminder.`;
          await storage.createNotification({
            userId: helper.id, title, body, type: "job", jobId: fresh.id,
          });
          // Don't let a transient push failure block dedupe cleanup —
          // sendPushToUser already swallows per-subscription errors, but
          // any unexpected throw here would otherwise skip the finally's
          // intent. The catch keeps that path explicit.
          try {
            await sendPushToUser(helper.id, {
              title, body,
              url: `/jobs/${fresh.id}`,
              tag: `job-status-${fresh.id}`,
              priority: "high",
              sound: "guber_action.wav",
              actions: [
                { action: "on_the_way", title: "On the way" },
                { action: "snooze", title: "Snooze 5m" },
              ],
            });
          } catch (pushErr) {
            console.warn("[reminders/snooze] push send failed", pushErr);
          }
        } finally {
          // Drop the dedupe row so the 2-minute cron sweep can re-claim and
          // re-fire if the worker still hasn't tapped on-the-way (and we're
          // still inside the missing-on-the-way detection window). Runs on
          // every terminal path including reassignment and errors.
          try {
            await clearReminder(key);
          } catch (clearErr) {
            console.warn("[reminders/snooze] clearReminder failed", clearErr);
          }
        }
      });

      return res.json({ snoozed: true, minutes: 5 });
    } catch (err: any) {
      console.error("[reminders/snooze]", err);
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/users/:id", requireAuth, demoGuard, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (req.session.userId !== id) {
      return res.status(403).json({ message: "Can only delete your own account" });
    }
    // Soft-delete with 90-day retention window (per data-retention policy).
    // Profile, login, and public-facing data are removed/anonymised right now;
    // job history, payment records, device/IP audit logs, and verification
    // records are retained for safety, fraud-prevention, and legal compliance.
    const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
    await storage.softDeleteUser(id, { reason, retentionDays: 90 });
    await storage.createAuditLog({
      userId: id,
      action: "account_self_deleted",
      details: `User initiated soft-delete; retention window 90 days${reason ? ` — reason: ${reason}` : ""}`,
    });
    req.session.destroy(() => {
      res.json({
        message: "Account deleted",
        retentionDays: 90,
        disclaimer: "Some data may be retained for legal, safety, and fraud prevention purposes.",
      });
    });
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

    // For ID submissions, run vision pre-check and block obvious non-US IDs
    // before they ever reach the admin queue.
    let aiAnalysis: any = null;
    if (type === "id") {
      const { analyzeIdImage } = await import("./id-vision");
      aiAnalysis = await analyzeIdImage(imageBase64);
      if (aiAnalysis.nonUsIdDetected) {
        return res.status(400).json({
          message: `GUBER currently only accepts US-issued government photo IDs (driver's license, state ID, US passport, US military ID, or US permanent resident card). Your upload looks like a ${aiAnalysis.documentCountry} ${aiAnalysis.documentKind}. Please upload a US ID to continue.`,
          code: "non_us_id",
          documentCountry: aiAnalysis.documentCountry,
          documentKind: aiAnalysis.documentKind,
        });
      }
    }

    await storage.createAuditLog({
      userId,
      action: `verification_submitted_${type}`,
      details: JSON.stringify({
        message: `User submitted ${type} verification document for review`,
        documentType: documentType || null,
        imageBase64,
        ...(aiAnalysis ? { aiAnalysis } : {}),
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
        sound: "guber_action.wav",
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
    const automotiveExtras = TASK_319_AUTOMOTIVE_SERVICES[cat] || [];
    if (cat === "Skilled Labor" || cat === "General Labor") {
      const sts = await storage.getServiceTypesByCategory(cat);
      if (sts && sts.length > 0) {
        const dbNames = sts.map((st: any) => st.name);
        // Merge automotive additions on top of DB-backed lists so existing
        // seeded environments still surface the new vehicle/boat/RV types.
        const merged = [...dbNames];
        for (const name of automotiveExtras) {
          if (!merged.includes(name)) merged.push(name);
        }
        return res.json(merged);
      }
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
    const isAdmin = await viewerIsAdmin(req);
    const sanitized = jobsList
      .filter(j => j.status !== "draft" && j.isPaid)
      .filter(j => viewerCanSeeJobSync(j, req.session.userId, isAdmin, demoIds))
      .map(j => sanitizeJobForPublic(j, req.session.userId, isAdmin));
    res.json(sanitized);
  });

  // /api/my-jobs and /api/jobs/:id are registered earlier — see the
  // sanitized handlers near the top of the jobs routes block. The duplicate
  // copies that lived here previously were shadowed by Express and acted as
  // dead code; removing them prevents drift between the two implementations.

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

      // Liability protection (Task #318): the global liability disclaimer
      // must be acknowledged at least once before a user can post a job.
      // Enforced server-side so direct API callers cannot bypass the
      // client modal.
      if (!user.liabilityDisclaimerAcceptedAt) {
        return res.status(412).json({
          message: "DISCLAIMER_REQUIRED",
          detail: "Please acknowledge the GUBER liability disclaimer before posting.",
        });
      }

      if (!user.idVerified) {
        return res.status(403).json({ message: "ID_REQUIRED", needsVerification: true, detail: "You must verify your ID before posting a job. Go to Profile → Trust & Credentials." });
      }

      const { category, serviceType, budget, location, locationApprox, zip, urgentSwitch,
              verifyInspectCategory, useCaseName, catalogServiceTypeName, jobDetails, scheduledAt, isBounty,
              estimatedMinutes: rawEstimatedMinutes, barterNeed, barterOffering, barterEstimatedValue,
              autoIncreaseEnabled, autoIncreaseAmount, autoIncreaseMax, autoIncreaseIntervalMins,
              lat: rawLat, lng: rawLng, availabilityWindows: rawAvailabilityWindows } = req.body;
      const exactLat = rawLat != null && !isNaN(parseFloat(rawLat)) ? parseFloat(rawLat) : null;
      const exactLng = rawLng != null && !isNaN(parseFloat(rawLng)) ? parseFloat(rawLng) : null;

      if (!category) return res.status(400).json({ message: "Category is required" });

      // Liability protection (Task #318): block disallowed job content before
      // we ever create the row or hand off to Stripe.
      const disallowedHit = detectDisallowedJobContent({
        title: req.body?.title || null,
        description: req.body?.description || null,
        serviceType: serviceType || catalogServiceTypeName || null,
        jobDetails: jobDetails || null,
      });
      if (disallowedHit) {
        await storage.createAuditLog({
          userId: req.session.userId,
          action: "disallowed_job_blocked",
          details: `Blocked ${disallowedHit.category} content in create-checkout`,
        });
        return res.status(400).json({
          message: "DISALLOWED_JOB",
          detail: disallowedHit.message,
          category: disallowedHit.category,
        });
      }

      // Liability protection (Task #318): reject off-platform payment or contact
      // phrases in the description before we touch Stripe or the DB.
      const offPlatformHit = detectOffPlatformPhrase(req.body?.description);
      if (offPlatformHit) {
        await storage.createAuditLog({
          userId: req.session.userId,
          action: "contact_block_rejected",
          details: `Off-platform phrase detected (${offPlatformHit}) in create-checkout description`,
        });
        return res.status(400).json({
          message: "CONTACT_BLOCK",
          detail: `Descriptions may not reference off-platform payment or contact methods (${offPlatformHit}).`,
        });
      }

      // Phase-2 structured coordination: posters of non-urgent jobs supply
      // one or more availability windows so the no-chat scheduling flow can
      // engage. We keep a soft fallback for legacy callers that haven't been
      // updated yet (mirrors the warning in /api/jobs).
      const isUrgentJob = urgentSwitch === true || category === "On-Demand Help";
      let cleanAvailabilityWindows: Array<{ date: string; startTime: string; endTime: string }> | null = null;
      if (rawAvailabilityWindows != null) {
        if (!validateAvailabilityWindows(rawAvailabilityWindows)) {
          return res.status(400).json({ message: "availabilityWindows must be an array of {date, startTime, endTime} objects" });
        }
        cleanAvailabilityWindows = rawAvailabilityWindows;
      }
      if (!isUrgentJob && !cleanAvailabilityWindows) {
        console.warn(`[coordination] Non-urgent job posted by user ${req.session.userId} via create-checkout with no availabilityWindows — legacy fallback path.`);
      }

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
              // Liability protection (Task #318): V&I jobs may not contain
              // certification / guarantee / professional-opinion language.
              // Apply the same guard server-side so direct API callers
              // cannot bypass the client-side hint.
              const viHit = detectViLanguageHit(check.clean);
              if (viHit) {
                await storage.createAuditLog({
                  userId: req.session.userId,
                  action: "vi_language_blocked",
                  details: `V&I forbidden word "${viHit.word}" in jobDetails field: ${k}`,
                });
              }
              filteredDetails[k] = replaceViLanguage(check.clean);
            }
          }
          const detailParts = Object.entries(filteredDetails)
            .map(([k, v]) => `${k}: ${v}`);
          if (detailParts.length > 0) {
            description += "\n\nDetails:\n" + detailParts.join("\n");
          }
          req.body.jobDetails = filteredDetails;
        }

        // Apply the V&I scrub to the auto-generated description text too
        // (which embeds the catalog template + the filtered details we
        // just appended above).
        description = replaceViLanguage(description);

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

      // --- DUAL-FEE MODEL ---
      // Poster pays a service fee on top of the base job price.
      // Worker's payout is reduced by a worker platform fee.
      //
      // NOTE: Referral rewards are now paid out as CASH on each completed-paid
      // job (GUBER Performance Shares) and no longer reduce the worker fee.
      // The legacy `referralFeePct` / `referralDiscountExpiresAt` fields are
      // intentionally not read here.
      const referralDiscount = 0;

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
        ...(cleanAvailabilityWindows ? { availabilityWindows: cleanAvailabilityWindows } : {}),
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
        return await respondJob(req, res, job);
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
        await respondJob(req, res, updated);
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

      // Liability protection (Task #318): the helper must have acknowledged
      // the GUBER liability disclaimer at least once before accepting any
      // job. Enforced server-side so the modal cannot be bypassed.
      if (!helper.liabilityDisclaimerAcceptedAt) {
        return res.status(412).json({
          message: "DISCLAIMER_REQUIRED",
          detail: "Please acknowledge the GUBER liability disclaimer before accepting jobs.",
        });
      }

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

        // Liability protection (Task #324): V&I helpers must acknowledge the
        // "I'm ready — start" confirmation before their first action on the
        // job, matching the gate used by start-work and on_the_way milestones.
        const alreadyConfirmed = !!(job as any).helperSafetyConfirmedAt;
        const safetyConfirmed = req.body?.safetyConfirmed === true;
        if (!alreadyConfirmed && !safetyConfirmed) {
          return res.status(400).json({
            message: "SAFETY_CONFIRM_REQUIRED",
            detail: "Helper must confirm the start-of-work safety acknowledgement before accepting V&I jobs.",
          });
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

      // Structured-coordination flow: if the poster supplied availability windows
      // when posting the job, the worker's accept does NOT yet pick a time —
      // instead we move into pending_worker_time so the worker calls
      // /api/jobs/:id/select-time next. Legacy posts (no windows) keep the old
      // single-window accept behavior.
      const hasStructuredWindows = validateAvailabilityWindows((job as any).availabilityWindows);
      const viSafetyConfirmed = job.category === "Verify & Inspect" && req.body?.safetyConfirmed === true && !(job as any).helperSafetyConfirmedAt;
      const updated = await storage.updateJob(jobId, {
        status: "accepted_pending_payment",
        assignedHelperId: req.session.userId!,
        autoIncreaseEnabled: false,
        nextIncreaseAt: null,
        ...(hasStructuredWindows
          ? {
              scheduleStatus: SCHEDULE_STATUS.PENDING_WORKER_TIME,
              workerAcceptedAt: new Date(),
            }
          : {}),
        ...(viSafetyConfirmed ? { helperSafetyConfirmedAt: new Date() } : {}),
      } as any);

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

      await respondJob(req, res, updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Structured "no-chat" scheduling endpoints ────────────────────────────
  // These run in parallel with the legacy accept/lock flow. The poster's
  // availabilityWindows on the job drive a state machine in `schedule_status`:
  //   pending_worker_time → pending_poster_confirmation → scheduled
  //                       ↘ poster_suggested_window ↗
  // Each endpoint is ownership-checked, demoGuard'd, and validates inputs
  // strictly so a malformed payload never corrupts state.

  // POST /api/jobs/:id/select-time  (worker)
  app.post("/api/jobs/:id/select-time", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job: any = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.assignedHelperId !== req.session.userId) {
        return res.status(403).json({ message: "Only the assigned worker can select a time" });
      }
      const allowed = new Set([SCHEDULE_STATUS.PENDING_WORKER_TIME, SCHEDULE_STATUS.POSTER_SUGGESTED_WINDOW]);
      if (!allowed.has(job.scheduleStatus)) {
        return res.status(400).json({ message: "Job is not awaiting a worker time selection" });
      }
      if (!validateAvailabilityWindows(job.availabilityWindows)) {
        return res.status(400).json({ message: "Job has no valid availability windows" });
      }
      const parsed = parseTimeSelection(req.body);
      if (!parsed.ok) return res.status(400).json({ message: parsed.error });

      const arrival = new Date(parsed.selection.arrivalTime);
      if (!isInsideAnyWindow(arrival, job.availabilityWindows)) {
        return res.status(400).json({ message: "Selected time must fall inside one of the poster's availability windows" });
      }
      const arrivalEnd = parsed.selection.mode === "window" && parsed.selection.arrivalWindowEnd
        ? new Date(parsed.selection.arrivalWindowEnd)
        : null;

      const updated = await storage.updateJob(jobId, {
        selectedWorkerTime: arrival,
        selectedArrivalWindowStart: arrival,
        selectedArrivalWindowEnd: arrivalEnd ?? arrival,
        scheduleStatus: SCHEDULE_STATUS.PENDING_POSTER_CONFIRMATION,
        lastTimeSelectionAt: new Date(),
      } as any);

      await notify(job.postedById, {
        title: "Worker picked a time",
        body: `Your worker proposed ${arrival.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${arrivalEnd ? ` – ${arrivalEnd.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""} for "${job.title}". Confirm to lock it in.`,
        jobId,
        priority: "high",
      });

      await respondJob(req, res, updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/jobs/:id/confirm-time  (poster)
  app.post("/api/jobs/:id/confirm-time", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job: any = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId) {
        return res.status(403).json({ message: "Only the poster can confirm the time" });
      }
      if (job.scheduleStatus !== SCHEDULE_STATUS.PENDING_POSTER_CONFIRMATION) {
        return res.status(400).json({ message: "No worker time selection awaiting confirmation" });
      }
      if (!job.selectedWorkerTime) {
        return res.status(400).json({ message: "Job has no selected worker time to confirm" });
      }

      const scheduledAt = new Date(job.selectedWorkerTime);
      const proofWindow = computeProofWindow(scheduledAt);

      // Address & navigation only unlock once payment is also authorized.
      // Confirming the time before payment is allowed (poster may pay after);
      // the unlock just waits until both gates pass.
      const willUnlock = !!job.paymentAuthorized;

      const updated = await storage.updateJob(jobId, {
        scheduleStatus: SCHEDULE_STATUS.SCHEDULED,
        posterConfirmedTime: new Date(),
        proofWindowStart: proofWindow.start,
        proofWindowEnd: proofWindow.end,
        ...(willUnlock ? { addressUnlocked: true, navigationUnlocked: true } : {}),
      } as any);

      if (job.assignedHelperId) {
        await notify(job.assignedHelperId, {
          title: "Time Confirmed!",
          body: `${scheduledAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} is locked in for "${job.title}".${willUnlock ? " Address and navigation are unlocked." : " Address unlocks once payment is authorized."}`,
          jobId,
          priority: "high",
        });
      }

      await respondJob(req, res, updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/jobs/:id/reject-time  (poster)
  app.post("/api/jobs/:id/reject-time", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job: any = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId) {
        return res.status(403).json({ message: "Only the poster can reject a time selection" });
      }
      if (job.scheduleStatus !== SCHEDULE_STATUS.PENDING_POSTER_CONFIRMATION) {
        return res.status(400).json({ message: "No worker time selection to reject" });
      }

      const updated = await storage.updateJob(jobId, {
        selectedWorkerTime: null,
        selectedArrivalWindowStart: null,
        selectedArrivalWindowEnd: null,
        scheduleStatus: SCHEDULE_STATUS.PENDING_WORKER_TIME,
        lastTimeSelectionAt: new Date(),
      } as any);

      if (job.assignedHelperId) {
        await notify(job.assignedHelperId, {
          title: "Time rejected — pick another slot",
          body: `The poster needs a different time for "${job.title}". Pick another slot from their availability.`,
          jobId,
          priority: "high",
        });
      }

      await respondJob(req, res, updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/jobs/:id/suggest-window  (poster)
  // Body: { date: 'YYYY-MM-DD', startTime: 'HH:MM', endTime: 'HH:MM' }
  app.post("/api/jobs/:id/suggest-window", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job: any = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.postedById !== req.session.userId) {
        return res.status(403).json({ message: "Only the poster can suggest a window" });
      }
      const allowed = new Set([SCHEDULE_STATUS.PENDING_POSTER_CONFIRMATION, SCHEDULE_STATUS.PENDING_WORKER_TIME]);
      if (!allowed.has(job.scheduleStatus)) {
        return res.status(400).json({ message: "Cannot suggest a window in the current schedule state" });
      }
      const { date, startTime, endTime } = req.body || {};
      const window = { date, startTime, endTime };
      if (!validateAvailabilityWindows([window])) {
        return res.status(400).json({ message: "Invalid window. Provide {date:YYYY-MM-DD, startTime:HH:MM, endTime:HH:MM}." });
      }
      const { start } = windowToDateRange(window);
      if (start <= new Date()) {
        return res.status(400).json({ message: "Suggested window must start in the future" });
      }

      const updated = await storage.updateJob(jobId, {
        rescheduleSuggestedWindow: window,
        rescheduleRequestedBy: "poster",
        scheduleStatus: SCHEDULE_STATUS.POSTER_SUGGESTED_WINDOW,
        // Clear any pending worker selection so the worker has to act on the suggestion.
        selectedWorkerTime: null,
        selectedArrivalWindowStart: null,
        selectedArrivalWindowEnd: null,
      } as any);

      if (job.assignedHelperId) {
        await notify(job.assignedHelperId, {
          title: "Poster suggested a new window",
          body: `Poster suggests ${window.date} ${window.startTime}–${window.endTime} for "${job.title}". Accept it or pick a different slot.`,
          jobId,
          priority: "high",
        });
      }

      await respondJob(req, res, updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/jobs/:id/respond-suggested-window  (worker)
  // Body: { accept: boolean, arrivalTime?: ISO } — when accepting, the worker
  //   must still pick a specific arrival inside the suggested window.
  app.post("/api/jobs/:id/respond-suggested-window", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job: any = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.assignedHelperId !== req.session.userId) {
        return res.status(403).json({ message: "Only the assigned worker can respond to the suggestion" });
      }
      if (job.scheduleStatus !== SCHEDULE_STATUS.POSTER_SUGGESTED_WINDOW) {
        return res.status(400).json({ message: "No suggested window to respond to" });
      }
      const accept = req.body?.accept === true;

      if (!accept) {
        // Worker rejects → fall back to picking a time inside the original windows.
        const updated = await storage.updateJob(jobId, {
          rescheduleSuggestedWindow: null,
          rescheduleRequestedBy: null,
          scheduleStatus: SCHEDULE_STATUS.PENDING_WORKER_TIME,
        } as any);
        await notify(job.postedById, {
          title: "Worker declined the suggestion",
          body: `Worker passed on your suggested window for "${job.title}". They'll pick a different time.`,
          jobId,
          priority: "high",
        });
        return await respondJob(req, res, updated);
      }

      const window = job.rescheduleSuggestedWindow;
      if (!validateAvailabilityWindows([window])) {
        return res.status(400).json({ message: "Suggested window is no longer valid" });
      }
      const arrival = req.body?.arrivalTime ? new Date(req.body.arrivalTime) : null;
      if (!arrival || isNaN(arrival.getTime()) || !isInsideAnyWindow(arrival, [window])) {
        return res.status(400).json({ message: "arrivalTime must lie inside the suggested window" });
      }

      const updated = await storage.updateJob(jobId, {
        selectedWorkerTime: arrival,
        selectedArrivalWindowStart: arrival,
        selectedArrivalWindowEnd: arrival,
        scheduleStatus: SCHEDULE_STATUS.PENDING_POSTER_CONFIRMATION,
        lastTimeSelectionAt: new Date(),
      } as any);

      await notify(job.postedById, {
        title: "Worker accepted your suggestion",
        body: `Worker picked ${arrival.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} for "${job.title}". Confirm to lock it in.`,
        jobId,
        priority: "high",
      });
      await respondJob(req, res, updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/jobs/:id/reschedule-request  (either side)
  // Body: { date, startTime, endTime } — the requester proposes a new window.
  // Each side gets a single free reschedule (TIMING.MAX_RESCHEDULES_PER_SIDE).
  app.post("/api/jobs/:id/reschedule-request", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const job: any = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      const isPoster = job.postedById === req.session.userId;
      const isWorker = job.assignedHelperId === req.session.userId;
      if (!isPoster && !isWorker) return res.status(403).json({ message: "Not a participant in this job" });
      if (job.scheduleStatus !== SCHEDULE_STATUS.SCHEDULED) {
        return res.status(400).json({ message: "Reschedule only allowed once a time is scheduled" });
      }

      const counterField = isPoster ? "rescheduleCountPoster" : "rescheduleCountWorker";
      const used = (job[counterField] ?? 0) as number;
      if (used >= COORDINATION_TIMING.MAX_RESCHEDULES_PER_SIDE) {
        return res.status(400).json({ message: "You've already used your reschedule for this job" });
      }

      const { date, startTime, endTime } = req.body || {};
      const window = { date, startTime, endTime };
      if (!validateAvailabilityWindows([window])) {
        return res.status(400).json({ message: "Invalid reschedule window" });
      }
      const { start, end } = windowToDateRange(window);
      if (start <= new Date()) {
        return res.status(400).json({ message: "Reschedule window must start in the future" });
      }

      // For worker-initiated reschedules we require a specific arrivalTime
      // inside the proposed window so the poster's existing /confirm-time
      // endpoint (which needs selectedWorkerTime to be set) can act on it
      // without a separate dead-end state.
      let workerArrivalForReschedule: Date | null = null;
      if (!isPoster) {
        const arrivalRaw = req.body?.arrivalTime;
        const arrival = arrivalRaw ? new Date(arrivalRaw) : null;
        if (!arrival || isNaN(arrival.getTime()) || arrival < start || arrival > end) {
          return res.status(400).json({ message: "arrivalTime is required and must lie inside the proposed window" });
        }
        workerArrivalForReschedule = arrival;
      }

      const updated = await storage.updateJob(jobId, {
        rescheduleSuggestedWindow: window,
        rescheduleRequestedBy: isPoster ? "poster" : "worker",
        [counterField]: used + 1,
        scheduleStatus: isPoster
          ? SCHEDULE_STATUS.POSTER_SUGGESTED_WINDOW
          : SCHEDULE_STATUS.PENDING_POSTER_CONFIRMATION,
        // Worker-initiated: keep a concrete selectedWorkerTime so /confirm-time
        // can act on it. Poster-initiated: clear so worker re-picks via
        // /respond-suggested-window.
        selectedWorkerTime: workerArrivalForReschedule,
        selectedArrivalWindowStart: workerArrivalForReschedule,
        selectedArrivalWindowEnd: workerArrivalForReschedule,
        posterConfirmedTime: null,
        proofWindowStart: null,
        proofWindowEnd: null,
        // Re-lock the address until the reschedule is reconfirmed.
        addressUnlocked: false,
        navigationUnlocked: false,
      } as any);

      const recipientId = isPoster ? job.assignedHelperId : job.postedById;
      if (recipientId) {
        await notify(recipientId, {
          title: "Reschedule requested",
          body: `${isPoster ? "Poster" : "Worker"} wants to reschedule "${job.title}" to ${window.date} ${window.startTime}–${window.endTime}.`,
          jobId,
          priority: "high",
        });
      }
      await respondJob(req, res, updated);
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
        // Compute the structured proof window if a confirmed start time exists.
        const proofWindow = confirmedStartTime
          ? computeProofWindow(new Date(confirmedStartTime))
          : null;
        // Address & nav only unlock when ALL three gates pass: payment authorized
        // + worker accepted + scheduleStatus='scheduled'. The legacy lock path
        // either pre-existed (scheduleStatus=null) — in which case the legacy
        // funded-status fallback in isAddressUnlocked() carries the load —
        // or it ran AFTER the new confirm-time set scheduleStatus='scheduled'.
        const scheduleReady = (job as any).scheduleStatus === SCHEDULE_STATUS.SCHEDULED;
        const allGatesPass = scheduleReady && !!job.assignedHelperId;
        const updated = await storage.updateJob(jobId, {
          status: "funded",
          lockedAt: new Date(),
          paymentAuthorized: true,
          ...(allGatesPass ? { addressUnlocked: true, navigationUnlocked: true } : {}),
          ...(confirmedStartTime ? { posterConfirmedTime: new Date() } : {}),
          ...(proofWindow ? { proofWindowStart: proofWindow.start, proofWindowEnd: proofWindow.end } : {}),
        } as any);
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
      // Only the poster can confirm their own job's lock payment.
      if (job.postedById !== req.session.userId) {
        return res.status(403).json({ message: "Not your job" });
      }
      if (job.status === "funded") return await respondJob(req, res, job);

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

      // Compute structured proof window from the worker's confirmed start time.
      const lockJobAssignments = await storage.getAssignmentsByJob(jobId);
      const lockActiveAssignment = lockJobAssignments.find(a => a.helperId === job.assignedHelperId);
      const confirmedStart = lockActiveAssignment?.confirmedStartTime
        ? new Date(lockActiveAssignment.confirmedStartTime)
        : (job as any).selectedWorkerTime
          ? new Date((job as any).selectedWorkerTime)
          : null;
      const lockProofWindow = confirmedStart ? computeProofWindow(confirmedStart) : null;

      // Address & nav only unlock when ALL three gates pass: payment authorized
      // + worker accepted + scheduleStatus='scheduled'. Legacy callers that
      // skipped the new flow keep working via the funded-status fallback in
      // isAddressUnlocked().
      const lockScheduleReady = (job as any).scheduleStatus === SCHEDULE_STATUS.SCHEDULED;
      const lockAllGatesPass = lockScheduleReady && !!job.assignedHelperId;
      // isPaid = true signals authorized/funded (for job visibility); chargedAt set only at capture
      const updated = await storage.updateJob(jobId, {
        status: "funded",
        lockedAt: new Date(),
        isPaid: true,
        stripePaymentIntentId: paymentIntentId,
        stripeChargeId: chargeId,
        paymentAuthorized: true,
        ...(lockAllGatesPass ? { addressUnlocked: true, navigationUnlocked: true } : {}),
        ...(confirmedStart ? { posterConfirmedTime: new Date() } : {}),
        ...(lockProofWindow ? { proofWindowStart: lockProofWindow.start, proofWindowEnd: lockProofWindow.end } : {}),
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

      await respondJob(req, res, updated);
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

      // Liability protection (Task #318): helper must tap "I'm ready — start"
      // at least once before the job moves into work. Once recorded the
      // confirmation persists for the rest of the job's lifecycle.
      const alreadyConfirmed = !!(job as any).helperSafetyConfirmedAt;
      const safetyConfirmed = req.body?.safetyConfirmed === true;
      if (!alreadyConfirmed && !safetyConfirmed) {
        return res.status(400).json({
          message: "SAFETY_CONFIRM_REQUIRED",
          detail: "Helper must confirm the start-of-work safety acknowledgement before starting.",
        });
      }
      const now = new Date();
      await storage.updateJob(jobId, {
        status: "active",
        ...(alreadyConfirmed ? {} : { helperSafetyConfirmedAt: now }),
      } as any);

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
        // Liability protection (Task #318): "on the way" is the helper's
        // first physical commitment to the job. Require the start-of-work
        // safety acknowledgement at least once before the milestone is
        // recorded; persist on the job so subsequent transitions don't
        // re-prompt.
        const alreadyConfirmed = !!(job as any).helperSafetyConfirmedAt;
        const safetyConfirmed = req.body?.safetyConfirmed === true;
        if (!alreadyConfirmed && !safetyConfirmed) {
          return res.status(400).json({
            message: "SAFETY_CONFIRM_REQUIRED",
            detail: "Helper must confirm the start-of-work safety acknowledgement before going on the way.",
          });
        }
        await storage.updateJob(jobId, {
          helperStage: "on_the_way",
          onTheWayAt: now,
          // Mirror to the structured-coordination field so the at-risk cron
          // and future Phase 2 UI both see a consistent timestamp.
          workerOnMyWayAt: now,
          status: job.status === "funded" ? "active" : job.status,
          ...(alreadyConfirmed ? {} : { helperSafetyConfirmedAt: now }),
        } as any);

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
      if (isBuyer && job.buyerConfirmed) return await respondJob(req, res, job);
      if (isHelper && job.helperConfirmed) return await respondJob(req, res, job);

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
        const tplId = job.proofTemplateId;
        if (tplId) {
          const checklistItems = await storage.getProofChecklistItems(tplId);
          const isVI = !!job.verifyInspectCategory;
          const requiredItems = checklistItems.filter(c => (c.quantityRequired ?? 1) > 0);
          for (const item of requiredItems) {
            const itemProofs = proofs.filter(p => p.checklistItemId === item.id);
            const validProofs = itemProofs.filter(p => !p.notEncountered);
            const required = item.quantityRequired ?? 1;
            if (validProofs.length >= required) continue;
            if (isVI) {
              return res.status(400).json({
                message: `Verify & Inspect requires every checklist item to have proof. Missing: "${item.label}".`,
                code: "CHECKLIST_INCOMPLETE",
                checklistItemId: item.id,
              });
            }
            const skipped = itemProofs.find(p => p.notEncountered && p.notEncounteredReason);
            if (skipped) continue;
            return res.status(400).json({
              message: `Checklist item "${item.label}" needs ${required} proof submission(s) or a reason it wasn't possible.`,
              code: "CHECKLIST_INCOMPLETE",
              checklistItemId: item.id,
            });
          }
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
        // Category-aware auto-confirm window (Task #317): simple 24h, skilled 48h,
        // V&I 24h, high-value (>=$500) 72h. Falls back to platform setting if higher.
        const windowHours = autoConfirmHoursFor(job as any, feeConfig.reviewTimerHours);
        const reviewTimerDate = new Date();
        reviewTimerDate.setHours(reviewTimerDate.getHours() + windowHours);
        update.reviewTimerStartedAt = new Date();
        update.autoConfirmAt = reviewTimerDate;
        update.payoutStatus = "review_pending";
        update.internalPayoutStatus = "pending_confirmation";

        await notify(job.postedById, {
          title: "Job Marked Complete — Review Now",
          body: `Your worker marked "${job.title}" done. Review and confirm within ${windowHours}h or it auto-confirms.`,
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

      let confirmNewBadge: string | null = null;
      if (newBuyerConfirmed && newHelperConfirmed) {
        update.status = "completed_paid";
        update.confirmedAt = new Date();
        if (!update.completedAt && !job.completedAt) update.completedAt = new Date();

        const proofs = await storage.getProofsByJob(jobId);
        const hasProof = proofs.length > 0;
        const hasDispute = !!(job as any).disputeReason;

        if (hasProof && !hasDispute) {
          update.payoutStatus = "payout_eligible";
          update.internalPayoutStatus = "approved";
        } else if (!hasProof && job.proofRequired) {
          update.payoutStatus = "proof_missing";
          update.internalPayoutStatus = "on_hold";
        } else {
          update.payoutStatus = "payout_eligible";
          update.internalPayoutStatus = "approved";
        }

        if (job.assignedHelperId) {
          const helper = await storage.getUser(job.assignedHelperId);
          if (helper) {
            const oldTrust = helper.trustScore || 50;
            const newTrust = adjustTrustScore(
              oldTrust,
              TRUST_ADJUSTMENTS.JOB_COMPLETED_WITH_PROOF + TRUST_ADJUSTMENTS.POSTER_CONFIRMED
            );
            const resumeFields: any = {
              jobsCompleted: (helper.jobsCompleted || 0) + 1,
              trustScore: newTrust,
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

            // Grant milestone badges if trust score crossed thresholds for the first time.
            // Both badges can be awarded in one update if trust jumps past 60 and 80 together.
            const existingBadges: string[] = (helper as any).milestoneBadges || [];
            const newBadges: string[] = [];
            if (newTrust >= 60 && oldTrust < 60 && !existingBadges.includes("verified_worker")) {
              newBadges.push("verified_worker");
            }
            if (newTrust >= 80 && oldTrust < 80 && !existingBadges.includes("trusted_worker")) {
              newBadges.push("trusted_worker");
            }
            if (newBadges.length > 0) {
              // Surface the highest-tier badge for the toast
              confirmNewBadge = newBadges.includes("trusted_worker") ? "trusted_worker" : "verified_worker";
              resumeFields.milestoneBadges = [...existingBadges, ...newBadges];
            }

            await storage.updateUser(helper.id, resumeFields);

            // Notify the worker of their badge regardless of who triggered final confirm
            if (confirmNewBadge) {
              const badgeLabel = confirmNewBadge === "trusted_worker" ? "Trusted Worker" : "Verified Worker";
              const badgeBody = confirmNewBadge === "trusted_worker"
                ? "You've reached the highest trust tier. Instant payouts are now unlocked!"
                : "Your trust has grown. Early payouts are now available to you.";
              await notify(helper.id, {
                title: `🏆 You leveled up to ${badgeLabel}!`,
                body: badgeBody,
                jobId,
                priority: "high",
              }, "/profile");
            }
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
              update.internalPayoutStatus = "released";
              update.payoutAmount = workerShare;
              update.chargedAt = new Date();
              console.log(`[GUBER][capture] jobId=${job.id} paymentIntentId=${piId} captured=success amount=$${capturedAmount}`);

              // GUBER Performance Shares — referrer's cash share of platform fee.
              await awardReferralRewardForJob(job.id, capturedAmount);

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
                update.internalPayoutStatus = "on_hold";
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
        const windowHoursElse = autoConfirmHoursFor(job as any, feeConfig.reviewTimerHours);
        const autoConfirmDate = new Date();
        autoConfirmDate.setHours(autoConfirmDate.getHours() + windowHoursElse);
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

      await respondJob(req, res, updated, confirmNewBadge ? { newBadge: confirmNewBadge } : undefined);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── DISPUTE: open ──────────────────────────────────────────────────────
  // Unified handler (Task #317). Accepts the new structured fields:
  //   issueType  (one of DISPUTE_ISSUE_TYPES)
  //   evidenceUrls (string[] — already-uploaded photo/video/screenshot URLs)
  //   notes       (free-text description)
  //   reason      (legacy alias for issueType / general label)
  app.post("/api/jobs/:id/dispute", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const { reason, notes, issueType, evidenceUrls } = req.body || {};
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      const isBuyer = job.postedById === req.session.userId;
      const isHelper = job.assignedHelperId === req.session.userId;
      if (!isBuyer && !isHelper) return res.status(403).json({ message: "Not authorized" });

      const disputeStatuses = ["funded", "active", "in_progress", "completion_submitted", "completed_paid", "payout_eligible"];
      if (!disputeStatuses.includes(job.status)) {
        return res.status(400).json({ message: "Cannot dispute job in current status" });
      }

      // Structured fields are required (Task #317): the API enforces the same
      // contract as the frontend so callers can't bypass the taxonomy.
      if (!issueType || typeof issueType !== "string") {
        return res.status(400).json({ message: "issueType is required", code: "ISSUE_TYPE_REQUIRED" });
      }
      if (!(DISPUTE_ISSUE_TYPES as readonly string[]).includes(issueType)) {
        return res.status(400).json({ message: "Invalid issueType", code: "ISSUE_TYPE_INVALID" });
      }
      const normalizedIssueType: DisputeIssueType = issueType as DisputeIssueType;
      const trimmedNotes = typeof notes === "string" ? notes.trim() : "";
      if (trimmedNotes.length === 0) {
        return res.status(400).json({ message: "A written explanation is required", code: "NOTES_REQUIRED" });
      }

      const cleanEvidence: string[] = Array.isArray(evidenceUrls)
        ? evidenceUrls.filter((u: any) => typeof u === "string" && u.length > 0).slice(0, 10)
        : [];

      const now = new Date();
      const helperDeadline = new Date(now.getTime() + HELPER_RESPONSE_WINDOW_HOURS * 60 * 60 * 1000);

      // Snapshot the prior status before flipping to "disputed" so
      // close_no_action can restore the exact state deterministically.
      const priorJobStatus = job.status;
      const updated = await storage.updateJob(jobId, {
        status: "disputed",
        preDisputeStatus: priorJobStatus,
        disputeReason: reason || normalizedIssueType || "Dispute opened",
        disputeNotes: trimmedNotes,
        payoutStatus: "dispute_locked",
        internalPayoutStatus: "on_hold",
        disputeStatus: "open",
        disputeIssueType: normalizedIssueType,
        disputeEvidenceUrls: cleanEvidence,
        disputeOpenedAt: now,
        helperResponseDeadline: helperDeadline,
      } as any);

      try {
        await db.insert(guberDisputes).values({
          jobId,
          openedByUserId: req.session.userId!,
          reasonCode: normalizedIssueType,
          description: trimmedNotes,
          filedByRole: isBuyer ? "hirer" : "worker",
          againstUserId: isBuyer ? job.assignedHelperId : job.postedById,
          status: "open",
          openedAt: now,
          issueType: normalizedIssueType,
          evidenceUrls: cleanEvidence,
          helperResponseDeadline: helperDeadline,
        } as any);
      } catch (disputeInsertErr: any) {
        console.error(`[dispute] Failed to insert guber_disputes row for job ${jobId}:`, disputeInsertErr.message);
      }

      const buyer = await storage.getUser(job.postedById);
      if (buyer) {
        await storage.updateUser(buyer.id, { jobsDisputed: (buyer.jobsDisputed || 0) + 1 });
      }
      // Risk-signal bump on the party being disputed against.
      const targetUserId = isBuyer ? job.assignedHelperId : job.postedById;
      if (targetUserId) {
        await maybeBumpRiskWatch(targetUserId);
      }

      if (job.assignedHelperId && isBuyer) {
        await notify(job.assignedHelperId, {
          title: "An issue was reported on this job",
          body: `The poster reported an issue with "${job.title}". You have ${HELPER_RESPONSE_WINDOW_HOURS}h to respond before GUBER reviews.`,
          jobId,
          priority: "high",
        });
      } else if (isHelper) {
        await notify(job.postedById, {
          title: "Dispute Opened by Worker",
          body: `The worker opened a dispute on "${job.title}". Payout is on hold.`,
          jobId,
        });
      }

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "dispute_opened",
        details: `Dispute opened on job ${jobId}: issueType=${normalizedIssueType || "n/a"} reason=${reason || "n/a"}`,
      });

      await respondJob(req, res, updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── DISPUTE: helper response window ────────────────────────────────────
  // Helper has HELPER_RESPONSE_WINDOW_HOURS to add their side of the story
  // and additional evidence. After the deadline this returns a 410-style
  // window-passed message and admin reviews on existing proof.
  app.post("/api/jobs/:id/dispute/helper-response", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const { response, evidenceUrls } = req.body || {};
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.assignedHelperId !== req.session.userId) {
        return res.status(403).json({ message: "Only the assigned worker can respond to this dispute" });
      }
      if (job.status !== "disputed") {
        return res.status(400).json({ message: "Job is not in a disputed state" });
      }
      // Single-submit guard (Task #317): once a response is on file the
      // helper cannot overwrite or amend it. Admin can still request more
      // info via /resolve-dispute which clears these fields and resets the
      // deadline.
      if ((job as any).helperResponseAt || (job as any).helperResponse) {
        return res.status(409).json({ message: "You have already responded to this dispute", code: "HELPER_RESPONSE_ALREADY_SUBMITTED" });
      }
      const deadline = (job as any).helperResponseDeadline as Date | null;
      if (deadline && new Date(deadline).getTime() < Date.now()) {
        return res.status(400).json({ message: "Response window has passed", code: "HELPER_RESPONSE_WINDOW_PASSED" });
      }
      if (!response || typeof response !== "string" || response.trim().length === 0) {
        return res.status(400).json({ message: "Response text is required" });
      }

      const cleanEvidence: string[] = Array.isArray(evidenceUrls)
        ? evidenceUrls.filter((u: any) => typeof u === "string" && u.length > 0).slice(0, 10)
        : [];
      const now = new Date();

      const updated = await storage.updateJob(jobId, {
        helperResponse: response.trim(),
        helperResponseEvidenceUrls: cleanEvidence,
        helperResponseAt: now,
      } as any);

      try {
        // Mirror onto the most-recent active dispute row for this job —
        // either initial "open" or the admin-driven "needs_more_info" state.
        const rows = await db.select({ id: guberDisputes.id })
          .from(guberDisputes)
          .where(and(eq(guberDisputes.jobId, jobId), inArray(guberDisputes.status, ["open", "needs_more_info"])))
          .orderBy(desc(guberDisputes.openedAt))
          .limit(1);
        if (rows[0]) {
          await db.update(guberDisputes).set({
            helperResponse: response.trim(),
            helperResponseEvidenceUrls: cleanEvidence,
            helperResponseAt: now,
            status: "open",
          } as any).where(eq(guberDisputes.id, rows[0].id));
        }
      } catch (mirrorErr: any) {
        console.error(`[dispute] helper-response mirror failed for job ${jobId}:`, mirrorErr.message);
      }

      await notify(job.postedById, {
        title: "Worker responded to your dispute",
        body: `The worker added their side of the story for "${job.title}". GUBER will review.`,
        jobId,
      });

      await storage.createAuditLog({
        userId: req.session.userId,
        action: "dispute_helper_response",
        details: `Job ${jobId}: helper added response (${cleanEvidence.length} evidence file(s))`,
      });

      await respondJob(req, res, updated);
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

      await respondJob(req, res, updated);
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

      await respondJob(req, res, updated);
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

      const stripeSession = await stripe.checkout.sessions.create({
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
      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);

      if (stripeSession.payment_status === "paid" && stripeSession.metadata?.type === "day1og") {
        const userId = parseInt(stripeSession.metadata.userId);

        const existing = await storage.getUser(userId);
        // Refuse to re-establish a session for, or grant perks to, a deleted
        // account — this endpoint is unauthenticated and accepts a userId
        // straight from Stripe metadata, so it's the one path that can wake
        // up a deleted account if not gated here.
        if (!existing || (existing as any).deletedAt) {
          return res.status(404).json({ message: "Account no longer active" });
        }
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
        await regenerateSession(req);
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

      if (!TRUST_BOX_PAYROLL_PRICE_ID) {
        return res.status(503).json({ message: "Trust Box checkout not configured. Contact support@guberapp.com." });
      }

      const stripeSession = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        customer_email: user.email,
        line_items: [{ price: TRUST_BOX_PAYROLL_PRICE_ID, quantity: 1 }],
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

      if (!TRUST_BOX_PAYROLL_PRICE_ID) {
        return res.status(503).json({ message: "Trust Box checkout not configured. Contact support@guberapp.com." });
      }

      const stripeSession = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        customer_email: user.email,
        line_items: [{ price: TRUST_BOX_PAYROLL_PRICE_ID, quantity: 1 }],
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

      try {
        await stripe.subscriptions.cancel(user.trustBoxSubscriptionId);
      } catch (cancelErr: any) {
        // If not found on payroll account, try the old account (legacy members)
        if (cancelErr?.statusCode === 404 || cancelErr?.raw?.code === "resource_missing") {
          await stripeMain.subscriptions.cancel(user.trustBoxSubscriptionId);
        } else {
          throw cancelErr;
        }
      }
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
      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);

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

  app.delete("/api/notifications/:id", requireAuth, async (req: Request, res: Response) => {
    await storage.deleteNotification(parseInt(req.params.id), req.session.userId!);
    res.json({ message: "Deleted" });
  });

  app.delete("/api/notifications", requireAuth, async (req: Request, res: Response) => {
    await storage.deleteAllNotifications(req.session.userId!);
    res.json({ message: "All deleted" });
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
  app.get("/api/admin/users", requireAdmin, async (req: Request, res: Response) => {
    const allUsers = await storage.getAllUsers();
    const includeDemo = req.query.includeDemo === "1" || req.query.includeDemo === "true";
    const filtered = includeDemo
      ? allUsers
      : allUsers.filter(u => !(u.email && u.email.toLowerCase().endsWith("@guberapp.internal")));
    res.json(filtered.map(u => sanitizeUser(u)));
  });

  app.get("/api/admin/jobs", requireAdmin, async (req: Request, res: Response) => {
    const allJobs = await storage.getJobs(false);
    const includeDemo = req.query.includeDemo === "1" || req.query.includeDemo === "true";
    if (includeDemo) {
      return res.json(allJobs);
    }
    const demoIds = await getDemoUserIds();
    res.json(allJobs.filter(j => !demoIds.has(j.postedById)));
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

  // Mark a stuck job as acknowledged so it no longer appears in diagnostic scans
  app.patch("/api/admin/jobs/:id/acknowledge-stuck", requireAdmin, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job ID" });
      const adminId = req.session.userId;
      if (!adminId) return res.status(401).json({ error: "Unauthorized" });
      const job = await storage.acknowledgeStuckJob(jobId, adminId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      res.json({ success: true, job });
    } catch (err) {
      console.error("Acknowledge stuck job error:", err);
      res.status(500).json({ error: "Failed to acknowledge job" });
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
    const adminAllowed = ["role", "accountType", "tier", "trustScore", "day1OG", "aiOrNotCredits", "aiOrNotUnlimitedText",
                          "isAvailable", "fullName", "email", "username",
                          "suspended", "banned", "idVerified", "selfieVerified", "credentialVerified", "profileComplete",
                          "backgroundCheckStatus", "backgroundCheckRestrictions", "cashDropHostEnabled"];
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

    // If admin is force-activating a business account, ensure a stub profile exists
    // so the user lands on onboarding rather than a broken/empty dashboard
    if (data.accountType === "business") {
      const existingProfile = await storage.getBusinessProfile(id);
      if (!existingProfile) {
        await storage.createBusinessProfile({ userId: id, companyName: "" });
      }
    }

    await storage.createAuditLog({
      userId: req.session.userId,
      action: "admin_user_update",
      details: `Admin updated user ${id}: ${JSON.stringify(data)}`,
    });

    res.json(sanitizeUser(finalUser));
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const target = await storage.getUser(id);
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target.role === "admin") return res.status(403).json({ message: "Cannot delete admin accounts" });
    await storage.deleteUser(id);
    await storage.createAuditLog({ userId: req.session.userId, action: "admin_delete_user", details: `Admin deleted user ${id} (${target.email})` });
    res.json({ ok: true });
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

  // ── CASH DROP HOST LOGO — Admin routes ──────────────────────────────────
  // NOTE: /active must be registered before /:slot to avoid Express matching "active" as a slot number
  // ── CASH DROP HOST LOGO — Admin routes ──────────────────────────────────
  app.patch("/api/admin/users/:id/cash-drop-logo/active", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { slot } = req.body;
      if (slot !== 1 && slot !== 2) return res.status(400).json({ error: "slot must be 1 or 2" });
      const target = await storage.getUser(id);
      if (!target) return res.status(404).json({ error: "User not found" });
      const updated = await storage.updateUser(id, { cashDropActiveLogo: slot } as any);
      res.json({ ok: true, user: sanitizeUser(updated!) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/users/:id/cash-drop-logo", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { slot, imageBase64 } = req.body;
      if (slot !== 1 && slot !== 2) return res.status(400).json({ error: "slot must be 1 or 2" });
      if (!imageBase64 || typeof imageBase64 !== "string") return res.status(400).json({ error: "imageBase64 required" });
      const target = await storage.getUser(id);
      if (!target) return res.status(404).json({ error: "User not found" });
      if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(503).json({ error: "Media storage not configured" });
      const cloudinary = (await import("./cloudinary.js")).default;
      const result = await cloudinary.uploader.upload(imageBase64, {
        resource_type: "image",
        folder: "guber-host-logos",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
      });
      const url = result.secure_url;
      const field = slot === 1
        ? { cashDropBrandLogo: url, cashDropLogo1AdminUploaded: true }
        : { cashDropLogo2: url, cashDropLogo2AdminUploaded: true };
      const updated = await storage.updateUser(id, field as any);
      res.json({ ok: true, url, user: sanitizeUser(updated!) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/users/:id/cash-drop-logo/:slot", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const slot = parseInt(req.params.slot);
      if (slot !== 1 && slot !== 2) return res.status(400).json({ error: "slot must be 1 or 2" });
      const target = await storage.getUser(id);
      if (!target) return res.status(404).json({ error: "User not found" });
      const field = slot === 1
        ? { cashDropBrandLogo: null, cashDropLogo1AdminUploaded: false }
        : { cashDropLogo2: null, cashDropLogo2AdminUploaded: false };
      const updated = await storage.updateUser(id, field as any);
      res.json({ ok: true, user: sanitizeUser(updated!) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── CASH DROP HOST LOGO — User self-service routes ───────────────────────
  app.patch("/api/users/me/cash-drop-logo/active", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { slot } = req.body;
      if (slot !== 1 && slot !== 2) return res.status(400).json({ error: "slot must be 1 or 2" });
      const user = await storage.getUser(userId);
      if (!user?.cashDropHostEnabled) return res.status(403).json({ error: "Host drops not enabled" });
      const updated = await storage.updateUser(userId, { cashDropActiveLogo: slot } as any);
      res.json({ ok: true, user: sanitizeUser(updated!) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/users/me/cash-drop-logo", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { slot, imageBase64 } = req.body;
      if (slot !== 1 && slot !== 2) return res.status(400).json({ error: "slot must be 1 or 2" });
      if (!imageBase64 || typeof imageBase64 !== "string") return res.status(400).json({ error: "imageBase64 required" });
      const user = await storage.getUser(userId);
      if (!user?.cashDropHostEnabled) return res.status(403).json({ error: "Host drops not enabled" });
      if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(503).json({ error: "Media storage not configured" });
      const cloudinary = (await import("./cloudinary.js")).default;
      const result = await cloudinary.uploader.upload(imageBase64, {
        resource_type: "image",
        folder: "guber-host-logos",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
      });
      const url = result.secure_url;
      const field = slot === 1
        ? { cashDropBrandLogo: url, cashDropLogo1AdminUploaded: false }
        : { cashDropLogo2: url, cashDropLogo2AdminUploaded: false };
      const updated = await storage.updateUser(userId, field as any);
      res.json({ ok: true, url, user: sanitizeUser(updated!) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/users/me/cash-drop-logo/:slot", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const slot = parseInt(req.params.slot);
      if (slot !== 1 && slot !== 2) return res.status(400).json({ error: "slot must be 1 or 2" });
      const user = await storage.getUser(userId);
      if (!user?.cashDropHostEnabled) return res.status(403).json({ error: "Host drops not enabled" });
      const isAdminUploaded = slot === 1 ? (user as any).cashDropLogo1AdminUploaded : (user as any).cashDropLogo2AdminUploaded;
      if (isAdminUploaded) return res.status(403).json({ error: "Cannot delete a logo uploaded by an admin" });
      const field = slot === 1
        ? { cashDropBrandLogo: null, cashDropLogo1AdminUploaded: false }
        : { cashDropLogo2: null, cashDropLogo2AdminUploaded: false };
      const updated = await storage.updateUser(userId, field as any);
      res.json({ ok: true, user: sanitizeUser(updated!) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
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
      } else if (audience === "non_og") {
        users = users.filter((u: any) => !u.day1OG);
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

  // ── Admin Test Push (targeted single-user, typed notification) ──────────
  app.post("/api/admin/test-push", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { userId, type } = req.body || {};
      if (!userId || !type) {
        return res.status(400).json({ message: "userId and type are required" });
      }
      const numericUserId = Number(userId);
      if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
        return res.status(400).json({ message: "userId must be a positive integer" });
      }
      const validTypes = ["offer_funded", "job", "cash_drop", "nearby", "closed"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ message: `type must be one of: ${validTypes.join(", ")}` });
      }
      const sound = getSoundForNotificationType(type);
      const { sendPushToUser } = await import("./push");
      const delivery = await sendPushToUser(numericUserId, {
        title: `[TEST] ${type}`,
        body: `Admin test push — type: ${type} | sound: ${sound}`,
        sound,
        tag: `test-push-${type}`,
      });
      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "admin_test_push",
        details: `Target userId: ${numericUserId} | Type: ${type} | Sound: ${sound} | APNs: ${delivery.apnsSent} | Web: ${delivery.webPushSent}`,
      });
      res.json({ success: true, userId: numericUserId, type, sound, webPushSent: delivery.webPushSent, apnsSent: delivery.apnsSent, hasTokens: delivery.hasTokens });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Admin In-App Popup Broadcast ────────────────────────────────────────
  app.post("/api/admin/broadcast-popup", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { title, body, ctaUrl, ctaLabel, audience } = req.body || {};
      if (!title?.trim() || !body?.trim()) {
        return res.status(400).json({ message: "Title and body are required" });
      }

      let users = await storage.getAllUsers();
      if (audience === "og") {
        users = users.filter((u: any) => u.day1OG);
      } else if (audience === "non_og") {
        users = users.filter((u: any) => !u.day1OG);
      } else if (audience === "trustbox") {
        users = users.filter((u: any) => u.trustBoxPurchased);
      }

      users = users.filter((u: any) => u.role !== "admin");

      let created = 0;
      for (const u of users) {
        try {
          await storage.createNotification({
            userId: u.id,
            title: title.trim(),
            body: body.trim(),
            type: "announcement",
            displayMode: "modal",
            ctaUrl: ctaUrl?.trim() || null,
            ctaLabel: ctaLabel?.trim() || null,
            read: false,
          });
          created++;
        } catch {}
      }

      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "admin_broadcast_popup",
        details: `Title: "${title}" | Audience: ${audience || "all"} | Created: ${created}`,
      });

      res.json({ created, total: users.length, audience: audience || "all" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Current user's pending in-app popup ─────────────────────────────────
  app.get("/api/me/popup", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const all = await storage.getNotificationsByUser(userId);
      const popup = all
        .filter((n: any) => !n.read && n.displayMode === "modal" && n.type === "announcement")
        .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
      if (!popup) return res.json(null);
      res.json({
        id: popup.id,
        title: popup.title,
        body: popup.body,
        ctaUrl: (popup as any).ctaUrl || null,
        ctaLabel: (popup as any).ctaLabel || null,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/ai-polish-broadcast", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { title, body } = req.body || {};
      if (!title?.trim() && !body?.trim()) {
        return res.status(400).json({ message: "Title or body required" });
      }
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });
      const prompt = `You are a professional copywriter for GUBER, a local gig-work and cash-drop app. The admin wants to send a push notification announcement to all users. Fix any spelling, grammar, or punctuation errors. Make the tone friendly, energetic, and professional — like a short text from a trusted app. Keep the same meaning and approximate length. Do NOT change proper nouns like "GUBER", "Cash Drop", "Day-1 OG", "Verify & Inspect". Return ONLY a JSON object with exactly these two keys: "title" and "body". No markdown, no extra text.

Input title: ${JSON.stringify((title || "").trim())}
Input body: ${JSON.stringify((body || "").trim())}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.3,
      });

      const raw = completion.choices[0]?.message?.content?.trim() || "";
      let parsed: { title: string; body: string };
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch?.[0] || raw);
      } catch {
        return res.status(500).json({ message: "AI returned unexpected format. Try again." });
      }

      if (typeof parsed.title !== "string" || typeof parsed.body !== "string") {
        return res.status(500).json({ message: "AI response missing title or body." });
      }

      res.json({ title: parsed.title.trim(), body: parsed.body.trim() });
    } catch (err: any) {
      console.error("[ai-polish-broadcast] error:", err);
      res.status(500).json({ message: "AI polish failed: " + err.message });
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

  // ── GUBER AI ASSISTANT ────────────────────────────────────────────────────

  app.post("/api/ai/guber-assist", requireAuth, async (req: Request, res: Response) => {
    try {
      const sessionUser = req.session?.userId ? await storage.getUser(req.session.userId) : null;
      if (!sessionUser || sessionUser.role === "business") {
        return res.status(403).json({ message: "GUBER Assistant is only available to consumer accounts." });
      }

      const { messages } = req.body;
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: "messages must be a non-empty array" });
      }

      const ALLOWED_ROLES = new Set(["user", "assistant"]);
      const sanitized: Array<{ role: "user" | "assistant"; content: string }> = [];
      for (const msg of messages.slice(-20)) {
        if (!msg || typeof msg !== "object") continue;
        if (!ALLOWED_ROLES.has(msg.role)) continue;
        const content = typeof msg.content === "string" ? msg.content.slice(0, 1000).trim() : "";
        if (!content) continue;
        sanitized.push({ role: msg.role as "user" | "assistant", content });
      }
      if (sanitized.length === 0) {
        return res.status(400).json({ message: "No valid messages provided" });
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const systemPrompt = `You are the GUBER Assistant — a friendly, concise AI support bot built directly into the GUBER app.

CRITICAL CONTEXT: The person you are talking to is ALREADY logged into the GUBER app. They have an account. NEVER tell them to "download the app", "sign up", "create an account", "log in", or "open the app" — they are already inside it. Treat them as an active member navigating the platform right now.

ABOUT THIS USER:
- Name: ${sessionUser.fullName || sessionUser.username || "Member"}
- Account type: ${sessionUser.accountType || "consumer"}
- Role: ${sessionUser.role || "buyer"}
- Day-1 OG member: ${sessionUser.day1OG ? "YES — they already have OG perks" : "NO — not yet an OG member"}
- Jobs completed: ${(sessionUser as any).jobsCompleted || 0}
- Trust score: ${(sessionUser as any).trustScore || 50}
- Trust milestone badges: ${((sessionUser as any).milestoneBadges || []).length > 0 ? ((sessionUser as any).milestoneBadges || []).join(", ") : "none yet"}
- AI or Not credits: ${(sessionUser as any).aiOrNotCredits || 0}
- Trust Box (unlimited AI or Not): ${(sessionUser as any).aiOrNotUnlimitedText ? "YES — active" : "NO"}

KEY PLATFORM KNOWLEDGE:

**What GUBER Is**
GUBER is a US-based on-demand labor marketplace where workers ("helpers") browse jobs, apply, complete work, and get paid. Individuals and businesses post jobs. All payments flow through GUBER's secure wallet system.

**Cash Drops**
Cash Drops are bonus reward events GUBER releases to the community. They appear on the map and in-app. Members race to claim them by tapping first. Day-1 OG members get priority notifications and first access.

**Day-1 OG Membership (Founding Member Perks)**
Day-1 OG is GUBER's founding membership — locked in early before the platform fully launches. Perks:
- Reduced fees: 5% worker fee vs 10% standard (saves real money on every payout)
- Priority Cash Drop notifications (first access)
- Exclusive OG badge on profile
- Early access to new features
If someone asks about fees, saving money, payouts, or how to earn more — proactively mention that Day-1 OG membership cuts their worker fee in half (5% vs 10%). Example: "By the way, if you're not already a Day-1 OG member, it's worth checking out — OG members only pay a 5% fee instead of 10% on every payout, which adds up fast."

**AI or Not — The Game**
AI or Not is a fun mini-game inside GUBER where users look at images and guess whether they were made by a human or AI. It's accessible from the main menu or dashboard. Users get credits to play — Day-1 OG members receive 5 free credits. The Trust Box subscription gives unlimited plays. If this user asks about AI or Not, tell them they currently have ${(sessionUser as any).aiOrNotCredits || 0} credit(s) remaining${(sessionUser as any).aiOrNotUnlimitedText ? " and unlimited Trust Box access" : ""}. To play more, they can earn credits through OG membership or subscribe to Trust Box.

**Trust Box**
Trust Box is a premium subscription that unlocks unlimited AI or Not gameplay and text features. It pairs with Day-1 OG membership for the full founding-member experience. Users can subscribe from the AI or Not screen inside the app.

**Verify & Inspect Jobs**
Verify & Inspect is a specialized job category where workers physically inspect items on behalf of buyers or sellers. Sub-categories include:
- Vehicle inspections (cars, trucks, motorcycles before purchase)
- Property walk-throughs (homes, rentals, commercial spaces)
- Marketplace item verification (Facebook Marketplace, eBay, auction goods)
- Salvage/auction lot inspections
Workers travel to the item's location, inspect it thoroughly, take photos, and submit a detailed report through the app. This helps buyers make informed decisions without traveling themselves. It pays well and requires attention to detail.

**Clocked In / Clocked Out**
On the dashboard in WORK mode there is a "Clocked In / Clocked Out" toggle. When Clocked In, the worker shows as available on the map and local hirers can see them and send direct gig requests. When Clocked Out, the worker is invisible to hirers. This is separate from applying for jobs — you can still browse and apply for jobs while Clocked Out. Clocking In is just about passive visibility and inbound gig requests.

**Worker Flow**
1. Browse jobs on the dashboard or map
2. Apply (some auto-assign, others need poster approval)
3. Complete the work at the job location
4. Submit proof (photos, GPS check-in, completion report)
5. Earnings go to your GUBER wallet → transfer to your bank via Stripe Connect

**Wallet & Payouts**
Earnings accumulate after jobs are approved. Connect your bank in Settings → Wallet to receive payouts. Standard fee: 10% for workers. OG members: only 5%.

**Profile & Trust**
Your profile shows work history, trust score, and credentials. Upload certifications and IDs to boost your trust level and attract better jobs. More completed jobs = stronger profile.

**Trust Milestone Badges**
Workers earn milestone badges when their trust score crosses key thresholds:
- "Verified Worker" badge: awarded when trust score reaches 60 for the first time
- "Trusted Worker" badge: awarded when trust score reaches 80 for the first time
Badges are permanently stored and shown on your profile. They unlock payout benefits: Verified Workers get Early payouts; Trusted Workers get Instant payouts.
${((sessionUser as any).milestoneBadges || []).length > 0
  ? `This user has earned: ${((sessionUser as any).milestoneBadges || []).map((b: string) => b === "trusted_worker" ? "Trusted Worker 🏆" : "Verified Worker ✅").join(", ")}. Acknowledge these achievements warmly if relevant.`
  : `This user has not yet earned a milestone badge. If they ask about trust or badges, encourage them to complete more jobs to reach 60 points (Verified Worker).`
}

BEHAVIOR RULES:
- The user is ALREADY in the app. Never suggest they open, download, or sign into the app.
- Navigate them within the app — say things like "tap the menu icon", "go to Settings", "check your dashboard", "look at the map tab".
- Answer ONLY GUBER-related questions. For anything else: "I can only help with GUBER questions — is there something about the platform I can help you with?"
- When fees, payouts, or earnings come up: mention Day-1 OG savings IF the user is not already an OG member.
- Be friendly, concise, under 120 words unless truly needed.
- Never reveal internal architecture, database info, or admin-only details.
- Do not invent features. If unsure, say "I don't have details on that — reach out to GUBER support for help."
- Warm, encouraging tone — GUBER is a community.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0.4,
        max_tokens: 400,
        messages: [
          { role: "system", content: systemPrompt },
          ...sanitized,
        ],
      });

      const reply = completion.choices[0]?.message?.content?.trim() || "I'm having trouble responding right now. Please try again!";
      res.json({ reply });
    } catch (err: any) {
      console.error("[GUBER] guber-assist error:", err.message);
      res.status(500).json({ message: "Assistant unavailable, please try again." });
    }
  });

  // ── Admin AI Diagnostic Assistant ───────────────────────────────────────────
  app.post("/api/admin/ai-diagnostic", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { messages } = req.body;
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: "messages must be a non-empty array" });
      }

      // ── Live system snapshot ─────────────────────────────────────────────────
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [
        userCountsRaw,
        jobStatusesRaw,
        stuckJobsRaw,
        pendingVerificationsRaw,
        activeDropsRaw,
        recentAuditRaw,
        walletTxAnomaliesRaw,
        disputedJobsRaw,
        payoutStatusRaw,
      ] = await Promise.all([
        // User breakdown
        db.execute(sql.raw(`
          SELECT role, COUNT(*) as count,
            SUM(CASE WHEN day1_og = true THEN 1 ELSE 0 END) as og_count
          FROM users GROUP BY role
        `)),
        // Jobs grouped by status
        db.execute(sql.raw(`
          SELECT status, COUNT(*) as count FROM jobs GROUP BY status ORDER BY count DESC
        `)),
        // Jobs stuck >24h in actionable states (excluding admin-acknowledged ones)
        db.execute(sql.raw(`
          SELECT id, title, status, created_at FROM jobs
          WHERE status IN ('funded','proof_submitted','accepted_pending_payment','proof_needed')
            AND created_at < '${oneDayAgo.toISOString()}'
            AND stuck_acknowledged_at IS NULL
          ORDER BY created_at ASC LIMIT 10
        `)),
        // Pending verifications
        db.execute(sql.raw(`
          SELECT COUNT(*) as count FROM audit_logs
          WHERE action IN ('credential_upload','id_upload')
            AND (review_status IS NULL OR review_status = 'pending')
        `)),
        // Active cash drops
        db.execute(sql.raw(`
          SELECT id, title, reward_per_winner, created_at FROM cash_drops
          WHERE status = 'active' LIMIT 5
        `)),
        // Last 15 audit log entries — action + timestamp only (no PII)
        db.execute(sql.raw(`
          SELECT action, created_at FROM audit_logs
          ORDER BY created_at DESC LIMIT 15
        `)),
        // Wallet transaction anomalies: failed payouts and stuck pending transfers
        db.execute(sql.raw(`
          SELECT status, COUNT(*) as count, SUM(amount) as total_amount
          FROM wallet_transactions
          WHERE status IN ('failed','pending')
            AND created_at < '${oneDayAgo.toISOString()}'
          GROUP BY status
        `)),
        // Disputed jobs detail
        db.execute(sql.raw(`
          SELECT id, title, budget, created_at FROM jobs WHERE status = 'disputed' ORDER BY created_at DESC LIMIT 5
        `)),
        // Payout status breakdown from jobs
        db.execute(sql.raw(`
          SELECT payout_status, COUNT(*) as count FROM jobs
          WHERE payout_status IS NOT NULL AND payout_status != 'none'
          GROUP BY payout_status ORDER BY count DESC
        `)),
      ]);

      const pendingVerifCount = Number((pendingVerificationsRaw.rows[0] as Record<string, unknown>)?.count ?? 0);

      const snapshot = {
        timestamp: now.toISOString(),
        users: userCountsRaw.rows,
        jobStatuses: jobStatusesRaw.rows,
        stuckJobs: stuckJobsRaw.rows,
        pendingVerifications: pendingVerifCount,
        activeDrops: activeDropsRaw.rows,
        recentAuditActions: recentAuditRaw.rows,
        walletTransactionAnomalies: walletTxAnomaliesRaw.rows,
        disputedJobs: disputedJobsRaw.rows,
        payoutStatusBreakdown: payoutStatusRaw.rows,
      };

      const ALLOWED_ROLES = new Set(["user", "assistant"]);
      const sanitized: Array<{ role: "user" | "assistant"; content: string }> = [];
      for (const msg of messages.slice(-20)) {
        if (!msg || typeof msg !== "object") continue;
        if (!ALLOWED_ROLES.has(msg.role)) continue;
        const content = typeof msg.content === "string" ? msg.content.slice(0, 2000).trim() : "";
        if (!content) continue;
        sanitized.push({ role: msg.role as "user" | "assistant", content });
      }
      if (sanitized.length === 0) {
        return res.status(400).json({ message: "No valid messages provided" });
      }

      const aiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      const aiBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
      if (!aiApiKey) {
        console.error("[GUBER] admin diagnostic error: AI_INTEGRATIONS_OPENAI_API_KEY not set in this environment");
        return res.status(503).json({ message: "AI service not configured in this environment", detail: "Missing API key" });
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: aiApiKey,
        baseURL: aiBaseURL,
      });

      const systemPrompt = `You are an AI system diagnostic assistant for GUBER — an on-demand labor platform. You are speaking directly to the platform admin (non-technical). Your job is to analyze live system data and surface problems, anomalies, or things that need attention in plain English.

LIVE SYSTEM SNAPSHOT (as of ${now.toISOString()}):
${JSON.stringify(snapshot, null, 2)}

WHAT THE DATA MEANS:
- users: breakdown by role (consumer, admin, business) and how many are Day-1 OG members
- jobStatuses: jobs grouped by their current status. Key statuses: posted_public (open), funded (worker assigned, payment held), proof_submitted (worker submitted proof, awaiting approval), disputed (in dispute), completed
- stuckJobs: jobs that have been in an actionable state (funded/proof_submitted/etc.) for over 24 hours without moving — these may indicate admin action needed or a bug
- pendingVerifications: credential/ID uploads waiting for admin review
- activeDrops: currently live cash drop events
- recentAuditActions: the last 15 recorded system action types with timestamps (no user data)
- walletTransactionAnomalies: wallet_transactions that are 'failed' or 'pending' for over 24h — indicates stuck payments or payout failures
- disputedJobs: jobs currently in dispute that may need admin attention
- payoutStatusBreakdown: breakdown of job payout_status values (e.g. 'pending','paid','failed') — key signal for payment health

YOUR BEHAVIOR:
- Proactively flag anything that looks wrong or needs attention — don't wait to be asked
- Explain issues in plain English that a non-technical business owner can understand
- For each problem you find, briefly suggest what action should be taken
- Be concise but complete — use bullet points for clarity
- If everything looks healthy, say so clearly
- Do NOT reveal raw database IDs in bulk — only mention specific IDs if they're directly relevant to an issue
- Never make up data — only reference what's in the snapshot above`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0.3,
        max_tokens: 600,
        messages: [
          { role: "system", content: systemPrompt },
          ...sanitized,
        ],
      });

      const reply = completion.choices[0]?.message?.content?.trim() || "Unable to generate diagnostic. Please try again.";
      res.json({ reply });
    } catch (err: any) {
      console.error("[GUBER] admin diagnostic error:", err?.status, err?.code, err?.message, err?.stack?.split("\n")[1]);
      res.status(500).json({ message: "Diagnostic unavailable, please try again.", detail: err?.message });
    }
  });

  // ── Admin Pinned Findings ────────────────────────────────────────────────────
  app.get("/api/admin/pinned-findings", requireAdmin, async (req: Request, res: Response) => {
    try {
      const findings = await storage.getPinnedFindings(req.session.userId!);
      res.json(findings);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch pinned findings" });
    }
  });

  app.post("/api/admin/pinned-findings", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { content, note, assignee, category } = req.body;
      if (!content || typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ message: "content is required" });
      }
      const existing = await storage.getPinnedFindings(req.session.userId!);
      if (existing.length >= 50) {
        return res.status(400).json({ message: "Maximum of 50 pinned findings reached. Remove one before adding another." });
      }
      const finding = await storage.createPinnedFinding(
        req.session.userId!,
        content.trim(),
        typeof note === "string" ? note.trim() : "",
        typeof assignee === "string" ? assignee.trim() : "",
        typeof category === "string" && category.trim() ? category.trim() : null,
      );
      res.status(201).json(finding);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to save pinned finding" });
    }
  });

  app.patch("/api/admin/pinned-findings/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const { note, assignee, category } = req.body;
      if (typeof note !== "string") return res.status(400).json({ message: "note must be a string" });
      const categoryValue = "category" in req.body
        ? (typeof category === "string" && category.trim() ? category.trim() : null)
        : undefined;
      const finding = await storage.updatePinnedFinding(
        id,
        req.session.userId!,
        note.trim(),
        typeof assignee === "string" ? assignee.trim() : "",
        categoryValue,
      );
      if (!finding) return res.status(404).json({ message: "Finding not found" });
      res.json(finding);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update finding" });
    }
  });

  app.delete("/api/admin/pinned-findings/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      await storage.deletePinnedFinding(id, req.session.userId!);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete pinned finding" });
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

  const { saveSubscription, removeSubscription, saveApnsToken, removeApnsToken, saveFcmToken, removeFcmToken, VAPID_PUBLIC_KEY } = await import("./push");

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

  // ── Native iOS APNs token routes (Capacitor @capacitor/push-notifications) ─
  // These store the raw APNs device token obtained by the native plugin so the
  // server can deliver pushes directly to APNs with a custom aps.sound field.

  app.post("/api/push/apns-token", requireAuth, async (req: Request, res: Response) => {
    const { deviceToken } = req.body;
    if (!deviceToken || typeof deviceToken !== "string") {
      return res.status(400).json({ message: "deviceToken is required" });
    }
    await saveApnsToken(req.session.userId!, deviceToken);
    res.json({ ok: true });
  });

  app.delete("/api/push/apns-token", requireAuth, async (req: Request, res: Response) => {
    const { deviceToken } = req.body;
    if (deviceToken) await removeApnsToken(deviceToken, req.session.userId!);
    res.json({ ok: true });
  });

  // ── Native Android FCM token routes (Capacitor @capacitor/push-notifications) ─
  // The plugin registers with Firebase Cloud Messaging on Android and emits the
  // same `registration` event used for iOS, but with an FCM registration token
  // instead of an APNs device token. We persist them in fcm_device_tokens so the
  // server can deliver pushes via firebase-admin with custom GUBER channel sounds.

  app.post("/api/push/fcm-token", requireAuth, async (req: Request, res: Response) => {
    const { deviceToken } = req.body;
    if (!deviceToken || typeof deviceToken !== "string") {
      return res.status(400).json({ message: "deviceToken is required" });
    }
    await saveFcmToken(req.session.userId!, deviceToken);
    res.json({ ok: true });
  });

  app.delete("/api/push/fcm-token", requireAuth, async (req: Request, res: Response) => {
    const { deviceToken } = req.body;
    if (deviceToken) await removeFcmToken(deviceToken, req.session.userId!);
    res.json({ ok: true });
  });

  // ── BUSINESS PROFILE ──────────────────────────────────────────────────────
  app.get("/api/business/profile", requireAuth, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    let profile = await storage.getBusinessProfile(userId);
    if (!profile) {
      // For business accounts with no profile yet (e.g. admin force-activated),
      // auto-create a stub so the frontend always gets valid data to redirect on
      const requestingUser = await storage.getUser(userId);
      if (requestingUser?.accountType === "business") {
        profile = await storage.createBusinessProfile({ userId, companyName: "" });
      } else {
        return res.status(404).json({ error: "No business profile" });
      }
    }
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
      if ((helper as any).deletedAt) return res.status(404).json({ error: "User not found" });

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
  // (Open + helper-response handlers live earlier in this file with the
  // confirm flow — Task #317.)

  app.post("/api/admin/jobs/:id/resolve-dispute", requireAdmin, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const { resolution: rawResolution, refundPoster, notes, partialAmount } = req.body;
      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      // Normalize Task #317 action aliases onto the existing branches.
      const aliasMap: Record<string, string> = {
        release_payout: "worker_favor",
        refund_poster: "poster_favor",
        partial: "partial",
      };
      const resolution = aliasMap[rawResolution] || rawResolution;
      const adminDecisionLabel: AdminDisputeDecision | string = (ADMIN_DISPUTE_DECISIONS as readonly string[]).includes(rawResolution)
        ? rawResolution
        : (rawResolution === "worker_favor" ? "release_payout" : rawResolution === "poster_favor" ? "refund_poster" : rawResolution);

      const now = new Date();
      const update: any = {
        disputeResolvedAt: now,
        disputeResolvedBy: req.session.userId,
        disputeNotes: notes || (job as any).disputeNotes,
        adminDecision: adminDecisionLabel,
        adminDecisionNotes: notes || null,
        adminReviewedAt: now,
        adminReviewedBy: req.session.userId,
      };

      // ── Admin-only actions that don't touch Stripe (Task #317) ────────
      if (rawResolution === "request_more_info") {
        // Sub-state: keep job in "disputed" but reset helper response so the
        // worker (and poster) can submit fresh information.
        const newDeadline = new Date(Date.now() + HELPER_RESPONSE_WINDOW_HOURS * 3600 * 1000);
        update.disputeStatus = "needs_more_info";
        update.helperResponse = null;
        update.helperResponseEvidenceUrls = null;
        update.helperResponseAt = null;
        update.helperResponseDeadline = newDeadline;
        await storage.updateJob(jobId, update);
        try {
          await db.update(guberDisputes).set({
            status: "needs_more_info",
            adminDecision: adminDecisionLabel,
            adminDecisionNotes: notes || null,
            adminReviewedAt: now,
            adminReviewedBy: req.session.userId,
            helperResponse: null,
            helperResponseEvidenceUrls: null,
            helperResponseAt: null,
          } as any).where(and(eq(guberDisputes.jobId, jobId), inArray(guberDisputes.status, ["open", "needs_more_info"])));
        } catch {}
        if (job.assignedHelperId) await notify(job.assignedHelperId, { title: "Admin needs more info", body: `GUBER needs more details about the dispute on "${job.title}". You have ${HELPER_RESPONSE_WINDOW_HOURS}h to respond.`, jobId });
        await notify(job.postedById, { title: "Admin needs more info", body: `GUBER needs more details about the dispute on "${job.title}".`, jobId });
        await storage.createAuditLog({ userId: req.session.userId, action: "dispute_request_more_info", details: `Job ${jobId}: ${notes || "no notes"} | new deadline ${newDeadline.toISOString()}` });
        return res.json({ success: true, action: "request_more_info", helperResponseDeadline: newDeadline });
      }
      if (rawResolution === "close_no_action") {
        const VALID_RESUME_STATUSES = new Set([
          "funded", "active", "in_progress",
          "completion_submitted", "completed_paid", "payout_eligible",
        ]);
        const snapshot = (job as any).preDisputeStatus as string | null | undefined;
        const priorStatus = snapshot && VALID_RESUME_STATUSES.has(snapshot)
          ? snapshot
          : ((job as any).helperConfirmed ? "completion_submitted" : "in_progress");
        update.disputeStatus = "resolved";
        update.status = priorStatus;
        update.internalPayoutStatus = (job as any).buyerConfirmed && (job as any).helperConfirmed
          ? "approved"
          : "pending_confirmation";
        // Re-arm the auto-confirm window so the held PI can still capture/expire normally.
        if (!(job as any).buyerConfirmed && (priorStatus === "completion_submitted" || priorStatus === "completed_paid")) {
          const feeConfig = await getActiveFeeConfig();
          const winHours = autoConfirmHoursFor(job as any, feeConfig.reviewTimerHours);
          update.autoConfirmAt = new Date(Date.now() + winHours * 3600 * 1000);
        }
        const bothConfirmed = (job as any).buyerConfirmed && (job as any).helperConfirmed;
        if (bothConfirmed || priorStatus === "completed_paid" || priorStatus === "payout_eligible") {
          update.payoutStatus = "payout_eligible";
        } else if (priorStatus === "completion_submitted") {
          update.payoutStatus = "review_pending";
        } else {
          update.payoutStatus = "none";
        }
        await storage.updateJob(jobId, update);
        try {
          await db.update(guberDisputes).set({
            status: "resolved", resolution: "close_no_action", resolutionType: "no_action",
            resolvedAt: now, resolvedByUserId: req.session.userId,
            adminDecision: adminDecisionLabel, adminDecisionNotes: notes || null, adminReviewedAt: now, adminReviewedBy: req.session.userId,
          } as any).where(and(eq(guberDisputes.jobId, jobId), inArray(guberDisputes.status, ["open", "needs_more_info"])));
        } catch {}
        if (job.assignedHelperId) await notify(job.assignedHelperId, { title: "Dispute closed — no action", body: `The dispute on "${job.title}" was closed. Normal payout flow resumes.`, jobId });
        await notify(job.postedById, { title: "Dispute closed — no action", body: `The dispute on "${job.title}" was closed. Normal payout flow resumes.`, jobId });
        await storage.createAuditLog({ userId: req.session.userId, action: "dispute_close_no_action", details: `Job ${jobId}: resumed status=${priorStatus}` });
        return res.json({ success: true, action: "close_no_action", resumedStatus: priorStatus });
      }
      if (rawResolution === "flag_user" || rawResolution === "suspend_user") {
        const targetUserId = req.body.targetUserId || job.assignedHelperId;
        if (!targetUserId) return res.status(400).json({ message: "targetUserId required" });
        const targetUpdates: any = {};
        const isSuspend = rawResolution === "suspend_user";
        if (isSuspend) {
          targetUpdates.riskLevel = "suspended";
          targetUpdates.suspended = true;
          targetUpdates.suspendedAt = now;
          targetUpdates.suspensionReason = notes || `Dispute on job #${jobId}`;
        } else {
          targetUpdates.riskLevel = "restricted";
          targetUpdates.falseClaimFlagCount = sql`COALESCE(false_claim_flag_count, 0) + 1`;
        }
        await storage.updateUser(targetUserId, targetUpdates);

        // suspend_user is terminal — close the dispute and unwind the payout
        // hold so the job no longer sits in disputed/dispute_locked. flag_user
        // is non-terminal — record the admin review on the dispute row but
        // leave it open for a follow-up resolution.
        if (isSuspend) {
          update.disputeStatus = "resolved";
          update.status = "refunded";
          update.payoutStatus = "refunded";
          update.internalPayoutStatus = "refunded";
          if ((job as any).stripePaymentIntentId) {
            try { await stripe.paymentIntents.cancel((job as any).stripePaymentIntentId); } catch {}
          }
          // GUBER Performance Shares — reverse any reward already credited.
          await voidReferralRewardForJob(jobId, "dispute_suspend_user");
        } else {
          update.disputeStatus = "needs_more_info";
        }
        await storage.updateJob(jobId, update);

        try {
          await db.update(guberDisputes).set({
            status: isSuspend ? "resolved" : "needs_more_info",
            resolution: isSuspend ? "suspend_user" : "flag_user",
            resolutionType: isSuspend ? "user_suspended" : "user_flagged",
            resolvedAt: isSuspend ? now : null,
            resolvedByUserId: isSuspend ? req.session.userId : null,
            adminDecision: adminDecisionLabel,
            adminDecisionNotes: notes || null,
            adminReviewedAt: now,
            adminReviewedBy: req.session.userId,
          } as any).where(and(eq(guberDisputes.jobId, jobId), inArray(guberDisputes.status, ["open", "needs_more_info"])));
        } catch {}

        await storage.createAuditLog({ userId: req.session.userId, action: rawResolution, details: `Job ${jobId} target=${targetUserId} notes=${notes || ""}` });
        await notify(targetUserId, {
          title: isSuspend ? "Account suspended" : "Account flagged",
          body: isSuspend
            ? "Your account has been suspended pending review by GUBER."
            : "Your account has been flagged for review based on a recent dispute.",
          priority: "high",
        });
        return res.json({ success: true, action: rawResolution, terminal: isSuspend });
      }

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
            update.internalPayoutStatus = "released";
            console.log(`[GUBER][capture] dispute worker_favor jobId=${jobId} skipped — already paid_out`);
          } else if (disputeJobPayoutStatus === "capture_expired") {
            update.payoutStatus = "capture_expired";
            update.internalPayoutStatus = "on_hold";
          } else {
            try {
              const captured = await stripe.paymentIntents.capture(piId);
              const capturedAmount = (captured.amount_received || captured.amount || 0) / 100;
              update.payoutStatus = "paid_out";
              update.internalPayoutStatus = "released";
              update.payoutAmount = (job as any).workerGrossShare || job.helperPayout || capturedAmount;
              update.chargedAt = new Date();
              console.log(`[GUBER][capture] dispute worker_favor jobId=${jobId} paymentIntentId=${piId} captured=success amount=$${capturedAmount}`);
              // GUBER Performance Shares — referrer's cash share of platform fee.
              await awardReferralRewardForJob(jobId, capturedAmount);
            } catch (captureErr: any) {
              if (captureErr.code === "charge_expired_for_capture") {
                console.error(`[GUBER][capture] dispute worker_favor jobId=${jobId} EXPIRED — admin attention needed.`);
                update.payoutStatus = "capture_expired";
                update.internalPayoutStatus = "on_hold";
              } else {
                console.error(`[GUBER][capture] dispute worker_favor jobId=${jobId} error: ${captureErr.message}`);
                update.payoutStatus = "payout_eligible";
                update.internalPayoutStatus = "approved";
              }
            }
          }
        } else {
          update.payoutStatus = "payout_eligible";
          update.internalPayoutStatus = "approved";
        }
      } else if (resolution === "poster_favor") {
        if (refundPoster && piId) {
          try {
            // Try to cancel the uncaptured authorization first (no charge to poster)
            await stripe.paymentIntents.cancel(piId);
            update.status = "refunded";
            update.payoutStatus = "refunded";
            update.internalPayoutStatus = "refunded";
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
                update.internalPayoutStatus = "refunded";
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
          // GUBER Performance Shares — reverse any reward already credited.
          await voidReferralRewardForJob(jobId, "dispute_poster_favor");
        } else {
          update.status = "refunded";
          update.payoutStatus = "refunded";
          update.internalPayoutStatus = "refunded";
          await voidReferralRewardForJob(jobId, "dispute_poster_favor");
        }
      } else if (resolution === "partial") {
        // Partial decision: admin pays the worker `partialAmount` (custom
        // amount they entered), and the remainder of the budget is treated
        // as a refund to the poster. We capture in Stripe (Stripe-safe path
        // — auth must be captured before refund), then record the split on
        // the job so reporting and the ledger reflect the actual decision.
        update.status = "completed_paid";
        update.confirmedAt = new Date();
        const helperShare = typeof partialAmount === "number" && partialAmount > 0 ? partialAmount : 0;
        const totalBudget = job.budget || 0;
        const refundShare = Math.max(0, Math.round((totalBudget - helperShare) * 100) / 100);
        if (piId) {
          const disputePartialPayoutStatus = (job as any).payoutStatus;
          if (disputePartialPayoutStatus === "paid_out") {
            update.payoutStatus = "paid_out";
            update.internalPayoutStatus = "partial_release";
            // Already captured — issue the refund slice directly against the PI.
            if (refundShare > 0) {
              try {
                await stripe.refunds.create({ payment_intent: piId, amount: Math.round(refundShare * 100) });
                console.log(`[GUBER][refund] dispute partial jobId=${jobId} refundShare=$${refundShare} (post-capture)`);
              } catch (refundErr: any) {
                console.error(`[GUBER][refund] dispute partial jobId=${jobId} post-capture refund error: ${refundErr.message}`);
              }
            }
          } else if (disputePartialPayoutStatus === "capture_expired") {
            update.payoutStatus = "capture_expired";
            update.internalPayoutStatus = "on_hold";
          } else {
            try {
              const captured = await stripe.paymentIntents.capture(piId);
              const capturedAmount = (captured.amount_received || captured.amount || 0) / 100;
              update.payoutStatus = "paid_out";
              update.internalPayoutStatus = "partial_release";
              update.payoutAmount = helperShare;
              update.chargedAt = new Date();
              console.log(`[GUBER][capture] dispute partial jobId=${jobId} paymentIntentId=${piId} captured=$${capturedAmount} helperShare=$${helperShare} refundShare=$${refundShare}`);
              // GUBER Performance Shares — referrer's cash share of platform fee.
              await awardReferralRewardForJob(jobId, capturedAmount);
              // Stripe-safe partial refund: capture full auth, then refund
              // the poster slice via the existing Stripe refund path.
              if (refundShare > 0) {
                try {
                  await stripe.refunds.create({ payment_intent: piId, amount: Math.round(refundShare * 100) });
                  update.refundedAt = new Date();
                  console.log(`[GUBER][refund] dispute partial jobId=${jobId} refundShare=$${refundShare}`);
                } catch (refundErr: any) {
                  console.error(`[GUBER][refund] dispute partial jobId=${jobId} refund error: ${refundErr.message}`);
                }
              }
            } catch (captureErr: any) {
              if (captureErr.code === "charge_expired_for_capture") {
                console.error(`[GUBER][capture] dispute partial jobId=${jobId} EXPIRED — admin attention needed.`);
                update.payoutStatus = "capture_expired";
                update.internalPayoutStatus = "on_hold";
              } else {
                console.error(`[GUBER][capture] dispute partial jobId=${jobId} error: ${captureErr.message}`);
                update.payoutStatus = "payout_eligible";
                update.internalPayoutStatus = "approved";
              }
            }
          }
        } else {
          update.payoutStatus = "payout_eligible";
          update.internalPayoutStatus = "partial_release";
          update.payoutAmount = helperShare;
        }
        update.partialRefundAmount = refundShare;
      }

      await storage.updateJob(jobId, update);

      // Wire risk signals based on the issue type + admin's decision so the
      // operational counters (missing-proof, no-show, false-claim) climb
      // alongside jobsDisputed when admin actions confirm a pattern.
      // NOTE: `resolution` is normalised to legacy values (poster_favor /
      // worker_favor); use `rawResolution` to match the spec action names.
      try {
        const issueType = (job as any).disputeIssueType as DisputeIssueType | null;
        const helperId = job.assignedHelperId as number | null;
        const posterId = job.postedById as number;
        const helperLost = rawResolution === "refund_poster" || rawResolution === "partial";
        const posterLost = rawResolution === "release_payout";
        if (issueType && helperId && helperLost) {
          if (issueType === "missing_proof") {
            await bumpRiskSignal(helperId, "missingProofCount");
          } else if (issueType === "job_not_completed") {
            await bumpRiskSignal(helperId, "noShowCount");
          }
        }
        if (issueType && posterLost) {
          // Poster's claim was rejected outright — count toward false-claim
          // signal so repeat false-reporters get auto-bumped to "watch".
          await bumpRiskSignal(posterId, "falseClaimFlagCount");
        }
      } catch (signalErr: any) {
        console.error(`[risk] resolve-dispute signal wiring failed jobId=${jobId}:`, signalErr.message);
      }

      // Mirror final admin decision onto the open guber_disputes row.
      try {
        await db.update(guberDisputes).set({
          status: "resolved",
          resolution,
          resolutionType: resolution,
          resolvedAt: now,
          resolvedByUserId: req.session.userId,
          adminDecision: adminDecisionLabel,
          adminDecisionNotes: notes || null,
          adminReviewedAt: now,
          adminReviewedBy: req.session.userId,
        } as any).where(and(eq(guberDisputes.jobId, jobId), inArray(guberDisputes.status, ["open", "needs_more_info"])));
      } catch (mirrorErr: any) {
        console.error(`[dispute] resolve mirror failed for job ${jobId}:`, mirrorErr.message);
      }

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
        const helperShare = (update.payoutAmount as number) || 0;
        const refundShare = (update.partialRefundAmount as number) || Math.max(0, budgetAmount - helperShare);
        await storage.createMoneyLedgerEntry({
          jobId, ledgerType: "dispute_resolved_partial", amount: budgetAmount,
          userIdOwner: job.postedById, userIdCounterparty: job.assignedHelperId || null,
          sourceSystem: "stripe", stripeObjectType: "payment_intent", stripeObjectId: piId || null,
          description: `Dispute resolved with partial split — worker $${helperShare.toFixed(2)}, poster refund $${refundShare.toFixed(2)} (handled outside Stripe per spec).`,
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

      // GUBER Performance Shares — reverse any referral reward already credited.
      await voidReferralRewardForJob(jobId, "admin_refund");

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
      if ((user as any).deletedAt) return res.status(404).json({ message: "User not found" });

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
      const includeDemo = req.query.includeDemo === "1" || req.query.includeDemo === "true";
      const attempts = await storage.getCashDropAttempts(dropId);
      const demoIds = includeDemo ? new Set<number>() : await getDemoUserIds();
      const enriched = await Promise.all(attempts.map(async (a: any) => {
        const uid = a.user_id || a.userId;
        const user = await storage.getUser(uid);
        return { ...a, user_name: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username : `User #${uid}` };
      }));
      const filtered = includeDemo
        ? enriched
        : enriched.filter((a: any) => !demoIds.has(a.user_id || a.userId));
      res.json(filtered);
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
        physicalCashDrop,
      } = req.body;
      const cashWinnersCap = cashWinnerCount ? parseInt(cashWinnerCount) : 1;
      const rewardWinnersCap = rewardWinnerCount ? parseInt(rewardWinnerCount) : 0;
      const isRewardOnly = cashWinnersCap === 0 && rewardWinnersCap > 0;
      const isPhysical = !!physicalCashDrop;
      if (!title) return res.status(400).json({ error: "Title is required" });
      if (!isPhysical && !isRewardOnly && !rewardPerWinner) return res.status(400).json({ error: "Reward amount is required (or use Physical Cash Drop)" });

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
      // Sanitize: convert date strings to Date objects and strip non-schema fields
      const { startTime, endTime, physicalCashDrop, winnerProofRequirement, ...rest } = req.body;
      const patchData: Record<string, any> = { ...rest };
      if (startTime !== undefined) patchData.startTime = startTime ? new Date(startTime) : null;
      if (endTime !== undefined) patchData.endTime = endTime ? new Date(endTime) : null;
      // Parse numeric strings that Drizzle needs as numbers
      if (patchData.rewardPerWinner !== undefined) patchData.rewardPerWinner = parseFloat(patchData.rewardPerWinner) || 0;
      if (patchData.winnerLimit !== undefined) patchData.winnerLimit = parseInt(patchData.winnerLimit) || 1;
      if (patchData.cashWinnerCount !== undefined) patchData.cashWinnerCount = parseInt(patchData.cashWinnerCount) || 0;
      if (patchData.rewardWinnerCount !== undefined) patchData.rewardWinnerCount = parseInt(patchData.rewardWinnerCount) || 0;
      if (patchData.gpsLat !== undefined) patchData.gpsLat = patchData.gpsLat ? parseFloat(patchData.gpsLat) : null;
      if (patchData.gpsLng !== undefined) patchData.gpsLng = patchData.gpsLng ? parseFloat(patchData.gpsLng) : null;
      if (patchData.gpsRadius !== undefined) patchData.gpsRadius = parseInt(patchData.gpsRadius) || 200;
      if (patchData.rewardQuantity !== undefined) patchData.rewardQuantity = patchData.rewardQuantity ? parseInt(patchData.rewardQuantity) : null;
      if (patchData.sponsorId !== undefined) patchData.sponsorId = patchData.sponsorId ? parseInt(patchData.sponsorId) : null;
      if (
        (patchData.status === "closed" || patchData.status === "expired") &&
        previousDrop?.status !== patchData.status &&
        !patchData.closedAt
      ) {
        patchData.closedAt = new Date();
      }
      const drop = await storage.updateCashDrop(id, patchData);
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
      const closureUpdate: Partial<CashDrop> = { winnersFound: totalWinnersFound, status: newStatus };
      if (newStatus === "closed" && drop.status !== "closed") closureUpdate.closedAt = new Date();
      await storage.updateCashDrop(dropId, closureUpdate);

      // Notify all non-winning participants when the drop is now fully claimed
      if (newStatus === "closed") {
        notifyCashDropClaimed(dropId, drop.title, winner.id).catch(() => {});
      }

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

      try {
        const drop = await storage.getCashDrop(dropId);
        const submitter = await storage.getUser(userId);
        const admins = await storage.getAllUsers();
        const adminUser = admins.find((u: any) => u.role === "admin");
        if (adminUser && payoutMethod !== "guber_credit") {
          const methodLabel = payoutMethod.replace(/_/g, " ");
          const handleLabel = updateData.payoutHandle ? ` (${updateData.payoutHandle})` : "";
          await storage.createNotification({
            userId: adminUser.id,
            title: "💸 Winner Chose Payout Method",
            body: `${submitter?.fullName || "Winner"} picked ${methodLabel}${handleLabel} for "${drop?.title || "Cash Drop"}". Ready to mark paid.`,
            type: "cash_drop",
            cashDropId: dropId,
          });
          try {
            const { sendPushToUser } = await import("./push");
            await sendPushToUser(adminUser.id, {
              title: "💸 Winner Chose Payout Method",
              body: `${submitter?.fullName || "Winner"} picked ${methodLabel} for "${drop?.title || "Cash Drop"}".`,
              data: { type: "cash_drop", cashDropId: String(dropId) },
            });
          } catch (e) { /* push optional */ }
        }
      } catch (e) {
        console.error("[cash-drop] admin notify failed", e);
      }

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

  // ==================== HOST DROP PERMISSION ====================

  app.get(["/api/users/me/host-drop-status", "/api/user/host-drop-status"], requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const [u] = await db
        .select({
          cashDropHostEnabled: usersTable.cashDropHostEnabled,
          cashDropHostStatus: usersTable.cashDropHostStatus,
          cashDropApprovalRequired: usersTable.cashDropApprovalRequired,
          cashDropBrandName: usersTable.cashDropBrandName,
          cashDropBrandLogo: usersTable.cashDropBrandLogo,
        })
        .from(usersTable)
        .where(eq(usersTable.id, userId));
      res.json(u || {});
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/host/drops", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser?.cashDropHostEnabled) {
        return res.status(403).json({ error: "Host drop access required" });
      }
      const result = await db.execute(sql`
        SELECT * FROM cash_drops WHERE host_user_id = ${userId} ORDER BY created_at DESC
      `);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/host-drop-users", requireAdmin, async (req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          id: usersTable.id,
          username: usersTable.username,
          fullName: usersTable.fullName,
          email: usersTable.email,
          profilePhoto: usersTable.profilePhoto,
          cashDropHostEnabled: usersTable.cashDropHostEnabled,
          cashDropApprovalRequired: usersTable.cashDropApprovalRequired,
          cashDropBrandName: usersTable.cashDropBrandName,
          cashDropBrandLogo: usersTable.cashDropBrandLogo,
        })
        .from(usersTable)
        .where(eq(usersTable.cashDropHostEnabled, true))
        .orderBy(usersTable.fullName);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/host-drops/pending", requireAdmin, async (req: Request, res: Response) => {
    try {
      const drops = await db.execute(sql`
        SELECT cd.*, u.full_name as host_full_name, u.username as host_username, u.profile_photo as host_profile_photo
        FROM cash_drops cd
        LEFT JOIN users u ON u.id = cd.host_user_id
        WHERE cd.is_host_drop = true AND cd.approval_status = 'pending'
        ORDER BY cd.created_at DESC
      `);
      res.json(drops.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/host-drops/:id/approve", requireAdmin, async (req: Request, res: Response) => {
    try {
      const dropId = parseInt(req.params.id);
      const { action, reason } = req.body; // action: "approve" | "reject"
      if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({ error: "action must be 'approve' or 'reject'" });
      }
      const newApprovalStatus = action === "approve" ? "approved" : "rejected";
      const newStatus = action === "approve" ? "active" : "draft";
      await db.execute(sql`
        UPDATE cash_drops
        SET approval_status = ${newApprovalStatus}, status = ${newStatus}
        WHERE id = ${dropId} AND is_host_drop = true
      `);
      // Notify host
      const [drop] = await db.execute(sql`SELECT host_user_id, title FROM cash_drops WHERE id = ${dropId}`).then(r => r.rows);
      if (drop?.host_user_id) {
        await storage.createNotification({
          userId: drop.host_user_id as number,
          title: action === "approve" ? "GUBER Drop Approved!" : "GUBER Drop Not Approved",
          body: action === "approve"
            ? `Your drop "${drop.title}" has been approved and is now live.`
            : `Your drop "${drop.title}" was not approved. ${reason || "Please contact admin for details."}`,
          type: "cash_drop",
        });
      }
      await storage.createAuditLog({
        action: `host_drop_${action}d`,
        userId: req.session.userId,
        details: `Drop ${dropId} ${action}d by admin`,
      });
      res.json({ success: true, approvalStatus: newApprovalStatus });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/users/:id/host-drop", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const { enabled, brandName, brandLogo, approvalRequired } = req.body;
      await db.execute(sql`
        UPDATE users SET
          cash_drop_host_enabled = ${!!enabled},
          cash_drop_host_status = ${enabled ? 'active' : 'inactive'},
          cash_drop_approval_required = ${!!approvalRequired},
          cash_drop_brand_name = ${brandName || null},
          cash_drop_brand_logo = ${brandLogo || null}
        WHERE id = ${userId}
      `);
      const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  app.post("/api/admin/zip-geocode-cache/flush", requireAdmin, async (req: Request, res: Response) => {
    try {
      const deleted = await flushZipGeocodeCache();
      res.json({ ok: true, deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/user-density/zip/:zipcode", requireAdmin, async (req: Request, res: Response) => {
    try {
      const zipcode = (req.params.zipcode || "").trim();
      const filter = ((req.query.filter as string) || "all").trim();

      if (!zipcode) return res.status(400).json({ error: "zipcode required" });

      const whereFilter =
        filter === "recent"   ? sql` AND GREATEST(u.created_at, COALESCE(u.clocked_in_at, u.created_at), COALESCE(u.clocked_out_at, u.created_at)) > NOW() - INTERVAL '30 days'` :
        filter === "og"       ? sql` AND u.day1_og = true` :
        filter === "helper"   ? sql` AND (u.jobs_completed > 0 OR u.role = 'helper')` :
        filter === "business" ? sql` AND u.account_type = 'business'` :
        filter === "cash_drop" ? sql` AND EXISTS (SELECT 1 FROM cash_drop_attempts cda WHERE cda.user_id = u.id)` :
        sql``;

      const result = await db.execute(sql`
        SELECT
          u.id,
          u.full_name,
          u.username,
          u.account_type,
          u.day1_og,
          u.jobs_completed,
          u.role
        FROM users u
        WHERE u.zipcode = ${zipcode} ${whereFilter}
        ORDER BY u.full_name ASC
      `);

      type UserRow = { id: number; full_name: string; username: string; account_type: string; day1_og: boolean; jobs_completed: number; role: string };
      const users = (result.rows as UserRow[]).map(r => ({
        id: Number(r.id),
        fullName: r.full_name || r.username || "Unknown",
        username: r.username,
        accountType: r.account_type,
        isOg: Boolean(r.day1_og),
        jobsCompleted: Number(r.jobs_completed) || 0,
        role: r.role,
      }));

      res.json({ users, total: users.length });
    } catch (err: any) {
      console.error("[GUBER] /api/admin/user-density/zip error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── AREA DENSITY — city/county/state breakdown ──────────────────────────
  // Per-filter server-side cache: keyed by filter, TTL 5 minutes
  const areaByFilterCache = new Map<string, { data: object; expiresAt: number }>();

  app.get("/api/admin/user-density/by-area", requireAdmin, async (req: Request, res: Response) => {
    try {
      const validFilters = ["all", "recent", "og", "helper", "business", "cash_drop"];
      const filter = validFilters.includes(req.query.filter as string) ? (req.query.filter as string) : "all";

      const cached = areaByFilterCache.get(filter);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.data);
      }

      const recentExpr = `(
        u.clocked_in_at > NOW() - INTERVAL '30 days'
        OR u.clocked_out_at > NOW() - INTERVAL '30 days'
        OR (u.clocked_in_at IS NULL AND u.clocked_out_at IS NULL AND u.created_at > NOW() - INTERVAL '30 days')
      )`;

      let queryText: string;
      if (filter === "cash_drop") {
        queryText = `
          WITH participants AS (SELECT DISTINCT user_id FROM cash_drop_attempts),
          base AS (
            SELECT u.* FROM users u
            INNER JOIN participants p ON p.user_id = u.id
            WHERE u.zipcode IS NOT NULL AND u.zipcode != ''
              AND (u.banned IS NULL OR u.banned = false)
          )
          SELECT b.zipcode, COUNT(*) AS total,
            SUM(CASE WHEN ${recentExpr.replace(/u\./g, "b.")} THEN 1 ELSE 0 END) AS recently_active,
            SUM(CASE WHEN b.day1_og = true THEN 1 ELSE 0 END) AS day1_og,
            SUM(CASE WHEN b.account_type IS NOT NULL AND b.account_type != 'personal' THEN 1 ELSE 0 END) AS business,
            SUM(CASE WHEN b.role IN ('helper', 'both') THEN 1 ELSE 0 END) AS helpers
          FROM base b GROUP BY b.zipcode ORDER BY total DESC`;
      } else {
        let whereExtra = "";
        if (filter === "recent") whereExtra = `AND ${recentExpr}`;
        else if (filter === "og") whereExtra = `AND u.day1_og = true`;
        else if (filter === "helper") whereExtra = `AND u.role IN ('helper', 'both')`;
        else if (filter === "business") whereExtra = `AND u.account_type IS NOT NULL AND u.account_type != 'personal'`;
        queryText = `
          SELECT u.zipcode, COUNT(*) AS total,
            SUM(CASE WHEN ${recentExpr} THEN 1 ELSE 0 END) AS recently_active,
            SUM(CASE WHEN u.day1_og = true THEN 1 ELSE 0 END) AS day1_og,
            SUM(CASE WHEN u.account_type IS NOT NULL AND u.account_type != 'personal' THEN 1 ELSE 0 END) AS business,
            SUM(CASE WHEN u.role IN ('helper', 'both') THEN 1 ELSE 0 END) AS helpers
          FROM users u
          WHERE u.zipcode IS NOT NULL AND u.zipcode != ''
            AND (u.banned IS NULL OR u.banned = false) ${whereExtra}
          GROUP BY u.zipcode ORDER BY total DESC`;
      }

      const result = await pool.query(queryText);

      // Geocode each zip and aggregate by city+state
      const areaMap = new Map<string, {
        city: string; state: string; county: string;
        total: number; recentlyActive: number; day1OgCount: number; businessCount: number; helperCount: number;
        zips: string[];
      }>();

      await Promise.all(result.rows.map(async (r: any) => {
        const info = await geocodeZipFull(r.zipcode);
        if (!info) return;
        const key = `${info.city}|${info.state}`;
        const existing = areaMap.get(key);
        if (existing) {
          existing.total += parseInt(r.total, 10);
          existing.recentlyActive += parseInt(r.recently_active, 10);
          existing.day1OgCount += parseInt(r.day1_og, 10);
          existing.businessCount += parseInt(r.business, 10);
          existing.helperCount += parseInt(r.helpers, 10);
          existing.zips.push(r.zipcode);
        } else {
          areaMap.set(key, {
            city: info.city,
            state: info.state,
            county: info.county,
            total: parseInt(r.total, 10),
            recentlyActive: parseInt(r.recently_active, 10),
            day1OgCount: parseInt(r.day1_og, 10),
            businessCount: parseInt(r.business, 10),
            helperCount: parseInt(r.helpers, 10),
            zips: [r.zipcode],
          });
        }
      }));

      const areas = Array.from(areaMap.values())
        .filter(a => a.total > 0)
        .sort((a, b) => b.total - a.total);

      const userTotal = areas.reduce((s, a) => s + a.total, 0);
      const responseData = { areas, areaCount: areas.length, userTotal };
      areaByFilterCache.set(filter, { data: responseData, expiresAt: Date.now() + 5 * 60 * 1000 });
      res.json(responseData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/user-density/area", requireAdmin, async (req: Request, res: Response) => {
    try {
      const city = ((req.query.city as string) || "").trim();
      const state = ((req.query.state as string) || "").trim();
      const filter = ((req.query.filter as string) || "all").trim();

      if (!city || !state) return res.status(400).json({ error: "city and state required" });

      const filterClause =
        filter === "recent"    ? `AND (u.clocked_in_at > NOW() - INTERVAL '30 days' OR u.clocked_out_at > NOW() - INTERVAL '30 days' OR (u.clocked_in_at IS NULL AND u.clocked_out_at IS NULL AND u.created_at > NOW() - INTERVAL '30 days'))` :
        filter === "og"        ? `AND u.day1_og = true` :
        filter === "helper"    ? `AND u.role IN ('helper', 'both')` :
        filter === "business"  ? `AND u.account_type IS NOT NULL AND u.account_type != 'personal'` :
        filter === "cash_drop" ? `AND EXISTS (SELECT 1 FROM cash_drop_attempts cda WHERE cda.user_id = u.id)` :
        "";

      // Prefer the exact zip set from the /by-area aggregation if provided by the client.
      // This ensures drill-down totals are consistent with the selected area row.
      const zipsParam = ((req.query.zips as string) || "").trim();
      const allZips: string[] = zipsParam
        ? zipsParam.split(",").map(s => s.trim()).filter(Boolean)
        : lookupZipsByCity(city, state);

      if (allZips.length === 0) {
        return res.json({ users: [], total: 0 });
      }

      const placeholders = allZips.map((_, i) => `$${i + 1}`).join(",");
      const queryText = `
        SELECT u.id, u.full_name, u.username, u.account_type, u.day1_og, u.jobs_completed, u.role
        FROM users u
        WHERE u.zipcode IN (${placeholders})
          AND (u.banned IS NULL OR u.banned = false)
          ${filterClause}
        ORDER BY u.full_name ASC
      `;
      const result = await pool.query(queryText, allZips);

      type UserRow = { id: string | number; full_name: string; username: string; account_type: string; day1_og: boolean; jobs_completed: string | number; role: string };
      const users = (result.rows as UserRow[]).map(r => ({
        id: Number(r.id),
        fullName: r.full_name || r.username || "Unknown",
        username: r.username,
        accountType: r.account_type,
        isOg: Boolean(r.day1_og),
        jobsCompleted: Number(r.jobs_completed) || 0,
        role: r.role,
      }));

      res.json({ users, total: users.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(["/api/cash-drops/host/create", "/api/host/drops"], requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser?.cashDropHostEnabled) {
        return res.status(403).json({ error: "You do not have host drop permission" });
      }
      const {
        title, description, rewardPerWinner, winnerLimit, startTime, endTime,
        gpsLat, gpsLng, gpsRadius, clueText, clueMediaUrls, hostLogo,
        physicalCashDrop, finalLocationMode, address,
      } = req.body;
      if (!title) return res.status(400).json({ error: "Title is required" });
      if (!physicalCashDrop && !rewardPerWinner) return res.status(400).json({ error: "Reward amount is required" });
      if (!gpsLat || !gpsLng) return res.status(400).json({ error: "A drop address is required" });

      const needsApproval = !!currentUser.cashDropApprovalRequired;
      const activeLogo = (currentUser as any).cashDropActiveLogo === 2 ? (currentUser as any).cashDropLogo2 : currentUser.cashDropBrandLogo;
      const resolvedLogo = hostLogo || activeLogo || currentUser.cashDropBrandLogo || null;
      if (!resolvedLogo) return res.status(400).json({ error: "A brand logo is required for host drops. Please upload a logo image." });

      const validLocationModes = ["none", "name_only", "destination"];
      const locMode = validLocationModes.includes(finalLocationMode) ? finalLocationMode : "name_only";
      const isPhysical = !!physicalCashDrop;

      const drop = await storage.createCashDrop({
        title,
        description: description || null,
        rewardPerWinner: isPhysical ? 0 : parseFloat(rewardPerWinner),
        winnerLimit: parseInt(winnerLimit) || 1,
        cashWinnerCount: parseInt(winnerLimit) || 1,
        rewardWinnerCount: 0,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        gpsLat: gpsLat ? parseFloat(gpsLat) : null,
        gpsLng: gpsLng ? parseFloat(gpsLng) : null,
        gpsRadius: gpsRadius ? parseInt(gpsRadius) : 200,
        clueText: clueText || null,
        clueMediaUrls: Array.isArray(clueMediaUrls)
          ? clueMediaUrls.filter((u: any) => typeof u === "string" && u.trim()).slice(0, 5)
          : null,
        clueRevealOnArrival: false,
        requireInAppCamera: true,
        proofItems: [],
        sponsorName: currentUser.cashDropBrandName || currentUser.fullName,
        sponsorLogo: resolvedLogo,
        sponsorId: null,
        isSponsored: false,
        brandingEnabled: !!(currentUser.cashDropBrandName || resolvedLogo),
        finalLocationMode: locMode,
        rewardType: isPhysical ? "physical" : "cash",
        fundingSource: "host_user",
        status: needsApproval ? "draft" : "active",
        isHostDrop: true,
        hostUserId: currentUser.id,
        hostLogo: resolvedLogo,
        approvalStatus: needsApproval ? "pending" : "approved",
      });

      await storage.createAuditLog({
        action: "host_drop_created",
        userId: currentUser.id,
        details: `Host drop "${title}" created by user ${currentUser.id}, approvalRequired=${needsApproval}`,
      });

      res.json({ ...drop, needsApproval });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────────────────── HOST DROP MANAGEMENT ────────────────────────
  // Returns the user's manageable drops (anything not yet expired/cleaned up so
  // the host can still cancel a freshly-closed one). Most-recent first; the
  // dashboard uses the first entry to swap the CTA into "Manage" mode.
  app.get("/api/cash-drops/host/mine", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const rows = await db.select().from(cashDrops).where(
        and(
          eq(cashDrops.isHostDrop, true),
          eq(cashDrops.hostUserId, userId),
          inArray(cashDrops.status, ["draft", "active"]),
        )
      ).orderBy(desc(cashDrops.createdAt));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Helper used by the host edit/cancel/delete handlers to load the drop and
  // confirm the caller actually owns it. Returns the drop or sends the error
  // response and returns null.
  async function loadOwnedHostDrop(req: Request, res: Response) {
    const userId = req.session.userId!;
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid drop id" });
      return null;
    }
    const drop = await storage.getCashDrop(id);
    if (!drop) {
      res.status(404).json({ error: "Cash Drop not found" });
      return null;
    }
    if (!drop.isHostDrop || drop.hostUserId !== userId) {
      res.status(403).json({ error: "You do not own this drop" });
      return null;
    }
    return drop;
  }

  // Single-drop fetch so the edit page can prefill its form.
  app.get("/api/cash-drops/host/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const drop = await loadOwnedHostDrop(req, res);
      if (!drop) return;
      res.json(drop);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Edit own drop. Mirrors the admin patch's sanitization but is restricted to
  // a whitelist of fields so users can't promote a draft past approval, change
  // ownership, or otherwise escalate. Inputs are strictly validated — a
  // malformed number/date returns 400 instead of being silently coerced to 0.
  app.patch("/api/cash-drops/host/:id", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const drop = await loadOwnedHostDrop(req, res);
      if (!drop) return;

      const {
        title, description, rewardPerWinner, winnerLimit,
        startTime, endTime, gpsLat, gpsLng, gpsRadius,
        clueText, clueMediaUrls, physicalCashDrop, finalLocationMode,
      } = req.body;

      // ── Strict parsers — reject garbage instead of coercing to 0/NaN. ──
      const parseFiniteFloat = (raw: any, field: string): number | null | undefined => {
        if (raw === undefined) return undefined;
        if (raw === null || raw === "") return null;
        const n = typeof raw === "number" ? raw : parseFloat(String(raw));
        if (!Number.isFinite(n)) {
          res.status(400).json({ error: `Invalid value for ${field}` });
          return undefined;
        }
        return n;
      };
      const parseFinitePositiveInt = (raw: any, field: string, fallback?: number): number | undefined => {
        if (raw === undefined) return undefined;
        if (raw === null || raw === "") return fallback;
        const n = typeof raw === "number" ? Math.floor(raw) : parseInt(String(raw), 10);
        if (!Number.isFinite(n) || n < 1) {
          res.status(400).json({ error: `Invalid value for ${field}` });
          return undefined;
        }
        return n;
      };
      const parseDateOrNull = (raw: any, field: string): Date | null | undefined => {
        if (raw === undefined) return undefined;
        if (raw === null || raw === "") return null;
        const d = new Date(raw);
        if (isNaN(d.getTime())) {
          res.status(400).json({ error: `Invalid value for ${field}` });
          return undefined;
        }
        return d;
      };

      const patchData: Record<string, any> = {};
      if (title !== undefined) {
        if (typeof title !== "string" || !title.trim()) {
          return res.status(400).json({ error: "Title cannot be empty" });
        }
        patchData.title = title.trim();
      }
      if (description !== undefined) patchData.description = description || null;
      if (clueText !== undefined) patchData.clueText = clueText || null;
      if (clueMediaUrls !== undefined) {
        patchData.clueMediaUrls = Array.isArray(clueMediaUrls)
          ? clueMediaUrls.filter((u: any) => typeof u === "string" && u.trim()).slice(0, 5)
          : null;
      }

      if (winnerLimit !== undefined) {
        const n = parseFinitePositiveInt(winnerLimit, "winnerLimit");
        if (res.headersSent) return;
        if (n !== undefined) {
          patchData.winnerLimit = n;
          patchData.cashWinnerCount = n;
        }
      }

      if (startTime !== undefined) {
        const v = parseDateOrNull(startTime, "startTime");
        if (res.headersSent) return;
        patchData.startTime = v;
      }
      if (endTime !== undefined) {
        const v = parseDateOrNull(endTime, "endTime");
        if (res.headersSent) return;
        patchData.endTime = v;
      }

      if (gpsLat !== undefined) {
        const v = parseFiniteFloat(gpsLat, "gpsLat");
        if (res.headersSent) return;
        if (v !== null && v !== undefined && (v < -90 || v > 90)) {
          return res.status(400).json({ error: "gpsLat out of range" });
        }
        patchData.gpsLat = v;
      }
      if (gpsLng !== undefined) {
        const v = parseFiniteFloat(gpsLng, "gpsLng");
        if (res.headersSent) return;
        if (v !== null && v !== undefined && (v < -180 || v > 180)) {
          return res.status(400).json({ error: "gpsLng out of range" });
        }
        patchData.gpsLng = v;
      }
      if (gpsRadius !== undefined) {
        const v = parseFinitePositiveInt(gpsRadius, "gpsRadius", 200);
        if (res.headersSent) return;
        if (v !== undefined) patchData.gpsRadius = v;
      }

      if (finalLocationMode !== undefined) {
        const validLocationModes = ["none", "name_only", "destination"];
        if (!validLocationModes.includes(finalLocationMode)) {
          return res.status(400).json({ error: "Invalid finalLocationMode" });
        }
        patchData.finalLocationMode = finalLocationMode;
      }

      if (physicalCashDrop !== undefined) {
        const isPhysical = !!physicalCashDrop;
        patchData.rewardType = isPhysical ? "physical" : "cash";
        if (isPhysical) {
          patchData.rewardPerWinner = 0;
        } else if (rewardPerWinner !== undefined) {
          const v = parseFiniteFloat(rewardPerWinner, "rewardPerWinner");
          if (res.headersSent) return;
          if (v === null || v === undefined || v < 0) {
            return res.status(400).json({ error: "rewardPerWinner must be a non-negative number" });
          }
          patchData.rewardPerWinner = v;
        }
      } else if (rewardPerWinner !== undefined) {
        const v = parseFiniteFloat(rewardPerWinner, "rewardPerWinner");
        if (res.headersSent) return;
        if (v === null || v === undefined || v < 0) {
          return res.status(400).json({ error: "rewardPerWinner must be a non-negative number" });
        }
        patchData.rewardPerWinner = v;
      }

      const updated = await storage.updateCashDrop(drop.id, patchData);
      await storage.createAuditLog({
        action: "host_drop_edited",
        userId: req.session.userId!,
        details: `Host drop ${drop.id} edited by owner`,
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Cancel = soft-stop (status:closed, closedAt:now) so the drop disappears
  // from active listings but stays around for audit/history.
  app.post("/api/cash-drops/host/:id/cancel", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const drop = await loadOwnedHostDrop(req, res);
      if (!drop) return;
      if (drop.status === "closed" || drop.status === "expired") {
        return res.status(400).json({ error: "Drop is already closed" });
      }
      const updated = await storage.updateCashDrop(drop.id, {
        status: "closed",
        closedAt: new Date(),
      });
      await storage.createAuditLog({
        action: "host_drop_cancelled",
        userId: req.session.userId!,
        details: `Host drop ${drop.id} cancelled by owner`,
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Hard delete. Only allowed once the drop is no longer active so a host
  // can't yank a drop out from under participants who might already be on
  // their way. To remove an active drop, the host cancels first.
  app.delete("/api/cash-drops/host/:id", requireAuth, demoGuard, async (req: Request, res: Response) => {
    try {
      const drop = await loadOwnedHostDrop(req, res);
      if (!drop) return;
      if (drop.status === "active") {
        return res.status(400).json({ error: "Cancel the drop before deleting it." });
      }
      await storage.deleteCashDrop(drop.id);
      await storage.createAuditLog({
        action: "host_drop_deleted",
        userId: req.session.userId!,
        details: `Host drop ${drop.id} deleted by owner`,
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

  app.get("/api/users/me/qualifications", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const quals = await storage.getWorkerQualifications(userId);
      res.json(quals.map(q => ({
        id: q.id,
        qualificationName: q.qualificationName,
        verificationStatus: q.verificationStatus,
        adminNotes: q.adminNotes,
        createdAt: q.createdAt,
        reviewedAt: q.reviewedAt,
      })));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/users/:id/certifications", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) return res.status(400).json({ message: "Invalid user id" });
      const target = await storage.getUser(userId);
      if (!target) return res.status(404).json({ message: "User not found" });
      if ((target as any).deletedAt) return res.status(404).json({ message: "User not found" });
      const certs = await storage.getApprovedQualifications(userId);
      // Public endpoint — only expose safe credential-card fields. Never leak
      // adminNotes, document URLs, timestamps, or aiExtracted internals.
      const safe = certs.map((c) => ({
        id: c.id,
        qualificationName: c.qualificationName,
        credentialType: (c as any).credentialType || null,
        issuingAuthority: (c as any).issuingAuthority || null,
        expirationDate: (c as any).expirationDate || null,
      }));
      res.json(safe);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Scan-only endpoint (Task #372): worker uploads a credential image, we run
  // AI extraction and return the proposed credential card fields. Worker can
  // edit them and then call POST /api/resume/qualifications to actually save.
  app.post("/api/resume/qualifications/scan", requireAuth, async (req: Request, res: Response) => {
    try {
      const { fileBase64, documentUrl } = req.body;
      if (!fileBase64 && !documentUrl) {
        return res.status(400).json({ message: "fileBase64 or documentUrl is required" });
      }

      let uploadedUrl: string | null = null;
      let scanInput: string;

      if (fileBase64 && typeof fileBase64 === "string") {
        // Upload first so the same URL can be persisted later.
        if (!process.env.CLOUDINARY_CLOUD_NAME) {
          return res.status(503).json({ message: "Media storage not configured." });
        }
        const cloudinary = (await import("./cloudinary.js")).default;
        const result = await cloudinary.uploader.upload(fileBase64, {
          resource_type: "auto",
          folder: "guber-certifications",
          allowed_formats: ["jpg", "jpeg", "png", "gif", "webp", "pdf"],
          public_id: `cert_${req.session.userId}_${Date.now()}`,
        });
        uploadedUrl = result.secure_url;
        scanInput = uploadedUrl;
      } else {
        try {
          const parsed = new URL(String(documentUrl));
          if (parsed.protocol !== "https:") {
            return res.status(400).json({ message: "Document URL must use https" });
          }
          uploadedUrl = parsed.toString();
          scanInput = uploadedUrl;
        } catch {
          return res.status(400).json({ message: "Invalid document URL" });
        }
      }

      const { analyzeCredentialImage } = await import("./id-vision");
      const extracted = await analyzeCredentialImage(scanInput);

      res.json({ documentUrl: uploadedUrl, extracted });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/certifications/submit", requireAuth, async (req: Request, res: Response) => {
    try {
      const { qualificationName, fileBase64, fileName } = req.body;
      if (!qualificationName || typeof qualificationName !== "string" || !qualificationName.trim()) {
        return res.status(400).json({ message: "Certification name is required" });
      }
      if (!fileBase64) {
        return res.status(400).json({ message: "Proof document is required" });
      }

      let documentUrl: string | null = null;
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        const cloudinary = (await import("./cloudinary.js")).default;
        const result = await cloudinary.uploader.upload(fileBase64, {
          resource_type: "auto",
          folder: "guber-certifications",
          allowed_formats: ["jpg", "jpeg", "png", "gif", "webp", "pdf"],
          public_id: `cert_${req.session.userId}_${Date.now()}`,
        });
        documentUrl = result.secure_url;
      } else {
        return res.status(503).json({ message: "Media storage not configured." });
      }

      // Run AI extraction so the saved record carries pre-filled card fields.
      let issuingAuthority: string | null = null;
      let credentialType: string | null = null;
      let expirationDate: Date | null = null;
      let aiExtracted = false;
      try {
        const { analyzeCredentialImage } = await import("./id-vision");
        const extracted = await analyzeCredentialImage(documentUrl);
        if (!extracted.error) {
          aiExtracted = true;
          if (extracted.issuingAuthority) issuingAuthority = extracted.issuingAuthority;
          if (extracted.credentialType) credentialType = extracted.credentialType;
          if (extracted.expirationDate) expirationDate = new Date(`${extracted.expirationDate}T00:00:00Z`);
        }
      } catch (e: any) {
        console.error("[GUBER] credential AI extraction failed:", e?.message);
      }

      const q = await storage.createQualification({
        userId: req.session.userId!,
        qualificationName: qualificationName.trim().slice(0, 200),
        documentUrl,
        verificationStatus: "pending",
        issuingAuthority,
        credentialType,
        expirationDate,
        aiExtracted,
      });
      res.status(201).json(q);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/resume/qualifications", requireAuth, async (req: Request, res: Response) => {
    try {
      const { qualificationName, documentUrl, issuingAuthority, credentialType, expirationDate, aiExtracted } = req.body;
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

      // Optional credential card fields (worker may have edited the AI preview).
      const cleanIssuing = typeof issuingAuthority === "string" ? issuingAuthority.trim().slice(0, 200) : null;
      const cleanType = typeof credentialType === "string" ? credentialType.trim().slice(0, 80) : null;
      let cleanExp: Date | null = null;
      if (expirationDate && typeof expirationDate === "string") {
        const m = expirationDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) {
          const d = new Date(`${expirationDate}T00:00:00Z`);
          if (!isNaN(d.getTime())) cleanExp = d;
        }
      }

      // If a fresh document was provided but no AI fields were sent in,
      // run extraction server-side so the record always carries best-effort
      // metadata (e.g. when uploaded via a third-party flow).
      let didAi = !!aiExtracted;
      if (safeDocUrl && !cleanIssuing && !cleanType && !cleanExp && !aiExtracted) {
        try {
          const { analyzeCredentialImage } = await import("./id-vision");
          const ex = await analyzeCredentialImage(safeDocUrl);
          if (!ex.error) {
            didAi = true;
            const q = await storage.createQualification({
              userId: req.session.userId!,
              qualificationName: qualificationName.trim().slice(0, 200),
              documentUrl: safeDocUrl,
              verificationStatus: "pending",
              issuingAuthority: ex.issuingAuthority || null,
              credentialType: ex.credentialType || null,
              expirationDate: ex.expirationDate ? new Date(`${ex.expirationDate}T00:00:00Z`) : null,
              aiExtracted: true,
            });
            return res.status(201).json(q);
          }
        } catch {}
      }

      const q = await storage.createQualification({
        userId: req.session.userId!,
        qualificationName: qualificationName.trim().slice(0, 200),
        documentUrl: safeDocUrl,
        verificationStatus: "pending",
        issuingAuthority: cleanIssuing || null,
        credentialType: cleanType || null,
        expirationDate: cleanExp,
        aiExtracted: didAi,
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

      // Auto-promote the worker to the credentialed (Skilled) tier when any
      // qualification is verified. Never silently demote on rejection — admins
      // can always do that manually if a credential is later revoked. (Task #372)
      if (verificationStatus === "verified") {
        try {
          const target = await storage.getUser(updated.userId);
          if (target) {
            const updates: any = {
              credentialVerified: true,
              credentialUploadPending: false,
            };
            const currentTier = String((target as any).tier || "community");
            const currentRank = TIER_ORDER.indexOf(currentTier);
            const credentialedRank = TIER_ORDER.indexOf("credentialed");
            // Only bump up — never demote a worker who is already elite.
            if (currentRank < credentialedRank) {
              updates.tier = "credentialed";
            }
            await storage.updateUser(target.id, updates);
            await storage.createNotification({
              userId: target.id,
              title: "Credential approved",
              body: `Your "${updated.qualificationName}" credential is verified. You're now in the Skilled (credentialed) tier.`,
              type: "system",
            } as any);
          }
        } catch (e: any) {
          console.error("[GUBER] credential auto-promotion failed:", e?.message);
        }
      }

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

  // ── ACTIVE AREAS — Admin User Density Map ─────────────────────────────────

  app.get("/api/admin/user-density", requireAdmin, async (req: Request, res: Response) => {
    try {
      const validFilters = ["all", "recent", "og", "helper", "business", "cash_drop"];
      const filter = validFilters.includes(req.query.filter as string) ? (req.query.filter as string) : "all";

      // recent = clocked in/out within 30 days, or newly created (createdAt fallback)
      const recentExpr = `(
        u.clocked_in_at > NOW() - INTERVAL '30 days'
        OR u.clocked_out_at > NOW() - INTERVAL '30 days'
        OR (u.clocked_in_at IS NULL AND u.clocked_out_at IS NULL AND u.created_at > NOW() - INTERVAL '30 days')
      )`;

      let queryText: string;

      if (filter === "cash_drop") {
        // Deduplicate users via CTE before aggregating to avoid inflated counts from multiple attempts
        queryText = `
          WITH participants AS (
            SELECT DISTINCT user_id FROM cash_drop_attempts
          ),
          base AS (
            SELECT u.*
            FROM users u
            INNER JOIN participants p ON p.user_id = u.id
            WHERE u.zipcode IS NOT NULL AND u.zipcode != ''
              AND (u.banned IS NULL OR u.banned = false)
          )
          SELECT
            b.zipcode,
            COUNT(*) AS total,
            SUM(CASE WHEN ${recentExpr.replace(/u\./g, "b.")} THEN 1 ELSE 0 END) AS recently_active,
            SUM(CASE WHEN b.day1_og = true THEN 1 ELSE 0 END) AS day1_og,
            SUM(CASE WHEN b.account_type IS NOT NULL AND b.account_type != 'personal' THEN 1 ELSE 0 END) AS business,
            SUM(CASE WHEN b.role IN ('helper', 'both') THEN 1 ELSE 0 END) AS helpers
          FROM base b
          GROUP BY b.zipcode
          ORDER BY total DESC
        `;
      } else {
        let whereExtra = "";
        if (filter === "recent") whereExtra = `AND ${recentExpr}`;
        else if (filter === "og") whereExtra = `AND u.day1_og = true`;
        else if (filter === "helper") whereExtra = `AND u.role IN ('helper', 'both')`;
        else if (filter === "business") whereExtra = `AND u.account_type IS NOT NULL AND u.account_type != 'personal'`;

        queryText = `
          SELECT
            u.zipcode,
            COUNT(*) AS total,
            SUM(CASE WHEN ${recentExpr} THEN 1 ELSE 0 END) AS recently_active,
            SUM(CASE WHEN u.day1_og = true THEN 1 ELSE 0 END) AS day1_og,
            SUM(CASE WHEN u.account_type IS NOT NULL AND u.account_type != 'personal' THEN 1 ELSE 0 END) AS business,
            SUM(CASE WHEN u.role IN ('helper', 'both') THEN 1 ELSE 0 END) AS helpers
          FROM users u
          WHERE u.zipcode IS NOT NULL AND u.zipcode != ''
            AND (u.banned IS NULL OR u.banned = false)
            ${whereExtra}
          GROUP BY u.zipcode
          ORDER BY total DESC
        `;
      }

      const result = await pool.query(queryText);

      type DensityRow2 = {
        zip: string; lat: number; lng: number; total: number;
        recentlyActive: number; day1OgCount: number; businessCount: number; helperCount: number;
      };

      const rows: DensityRow2[] = (
        await Promise.all(result.rows.map(async (r: any) => {
          const geo = await geocodeZip(r.zipcode);
          if (!geo) return null;
          return {
            zip: r.zipcode,
            lat: geo.lat,
            lng: geo.lng,
            total: parseInt(r.total, 10),
            recentlyActive: parseInt(r.recently_active, 10),
            day1OgCount: parseInt(r.day1_og, 10),
            businessCount: parseInt(r.business, 10),
            helperCount: parseInt(r.helpers, 10),
          } satisfies DensityRow2;
        }))
      ).filter((r): r is DensityRow2 => r !== null);

      const userTotal = rows.reduce((s, r) => s + r.total, 0);
      res.json({ zips: rows, zipCount: rows.length, userTotal });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
      // Liability protection (Task #318): observations are V&I content. We
      // strip diagnostic / opinion language from notes server-side so the
      // record stays "visual documentation only" even if a helper bypasses
      // the client-side sanitizer.
      const sanitizedNotes = notes ? replaceViLanguage(String(notes)) : null;

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const obs = await storage.createObservation({
        helperId: userId,
        observationType,
        locationLat,
        locationLng,
        address,
        photoURLs,
        notes: sanitizedNotes,
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

  app.patch("/api/workers/clock-in", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const { isAvailable } = req.body;
      if (typeof isAvailable !== "boolean") {
        return res.status(400).json({ message: "isAvailable (boolean) is required" });
      }
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const now = new Date();
      if (isAvailable) {
        await storage.updateUser(userId, { isAvailable: true, clockedInAt: now, clockedOutAt: null });
        res.json({ success: true, isAvailable: true, clockedInAt: now });
      } else {
        await storage.updateUser(userId, { isAvailable: false, clockedInAt: null, clockedOutAt: now });
        res.json({ success: true, isAvailable: false, clockedOutAt: now });
      }
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

  // ── Coordination timeouts cron ───────────────────────────────────────────
  // Runs every 2 minutes. Three sweeps:
  //   1. pending_poster_confirmation older than 30 min → revert to
  //      pending_worker_time so the worker can re-pick (prevents zombie
  //      pending selections holding the job hostage).
  //   2. pending_worker_time older than 15 min after worker accept → revert
  //      assignment so the job re-opens to other workers.
  //   3. scheduled but past arrival time and worker has not pinged
  //      worker_on_my_way_at → set job_at_risk=true and notify the poster.
  // All sweeps are no-ops on empty result sets and never throw past the
  // catch boundary.
  setInterval(async () => {
    try {
      const now = new Date();
      const posterDeadline = new Date(now.getTime() - COORDINATION_TIMING.POSTER_CONFIRM_TIMEOUT_MIN * 60_000);
      const workerDeadline = new Date(now.getTime() - COORDINATION_TIMING.WORKER_PICK_TIMEOUT_MIN * 60_000);

      // Sweep 1: poster sat on a worker time pick > 30 min.
      const stalePosterConfirms = await db
        .select()
        .from(jobsTable)
        .where(and(
          eq(jobsTable.scheduleStatus, SCHEDULE_STATUS.PENDING_POSTER_CONFIRMATION),
          sql`${jobsTable.lastTimeSelectionAt} IS NOT NULL`,
          sql`${jobsTable.lastTimeSelectionAt} < ${posterDeadline}`,
        ));
      for (const j of stalePosterConfirms) {
        await storage.updateJob(j.id, {
          scheduleStatus: SCHEDULE_STATUS.PENDING_WORKER_TIME,
          selectedWorkerTime: null,
          selectedArrivalWindowStart: null,
          selectedArrivalWindowEnd: null,
        } as any);
        if (j.assignedHelperId) {
          await notify(j.assignedHelperId, {
            title: "Poster didn't confirm — pick again",
            body: `The poster didn't confirm your time for "${j.title}" within 30 minutes. Choose another slot or cancel without penalty.`,
            jobId: j.id,
            priority: "high",
          });
        }
      }

      // Sweep 2: worker accepted but never picked a time within 15 min.
      // Note: we intentionally do NOT filter on isPaid — the post-publish
      // flow flips isPaid=true the moment the job hits posted_public (the
      // poster paid the posting fee), so requiring isPaid=false would skip
      // every accepted job. The status='accepted_pending_payment' check is
      // the actual gate (job hasn't been locked/funded yet).
      const staleWorkerPicks = await db
        .select()
        .from(jobsTable)
        .where(and(
          eq(jobsTable.scheduleStatus, SCHEDULE_STATUS.PENDING_WORKER_TIME),
          sql`${jobsTable.workerAcceptedAt} IS NOT NULL`,
          sql`${jobsTable.workerAcceptedAt} < ${workerDeadline}`,
          sql`${jobsTable.assignedHelperId} IS NOT NULL`,
          eq(jobsTable.status, "accepted_pending_payment"),
        ));
      for (const j of staleWorkerPicks) {
        const formerHelperId = j.assignedHelperId;
        await storage.updateJob(j.id, {
          status: "posted_public",
          assignedHelperId: null,
          scheduleStatus: null,
          workerAcceptedAt: null,
          selectedWorkerTime: null,
          selectedArrivalWindowStart: null,
          selectedArrivalWindowEnd: null,
        } as any);
        if (formerHelperId) {
          await notify(formerHelperId, {
            title: "Job re-opened",
            body: `You didn't pick a time for "${j.title}" within 15 minutes, so it's back in the open queue.`,
            jobId: j.id,
            priority: "normal",
          });
        }
        await notify(j.postedById, {
          title: "Worker timed out",
          body: `Worker didn't pick a time for "${j.title}" — it's back in the open queue.`,
          jobId: j.id,
          priority: "normal",
        });
      }

      // Sweep 3: scheduled jobs past their arrival window with no on-my-way ping.
      // We accept either the new structured `worker_on_my_way_at` field or the
      // legacy `on_the_way_at` field (set by the existing milestone endpoint)
      // so a worker who used the legacy "On the way" button isn't falsely
      // flagged at-risk.
      const atRiskJobs = await db
        .select()
        .from(jobsTable)
        .where(and(
          eq(jobsTable.scheduleStatus, SCHEDULE_STATUS.SCHEDULED),
          sql`${jobsTable.selectedWorkerTime} IS NOT NULL`,
          sql`${jobsTable.selectedWorkerTime} < ${now}`,
          sql`${jobsTable.workerOnMyWayAt} IS NULL`,
          sql`${jobsTable.onTheWayAt} IS NULL`,
          sql`(${jobsTable.jobAtRisk} IS NULL OR ${jobsTable.jobAtRisk} = false)`,
        ));
      for (const j of atRiskJobs) {
        await storage.updateJob(j.id, { jobAtRisk: true } as any);

        // Phase 5 — push to BOTH parties (poster + worker) when at-risk
        // flips. At-risk pushes intentionally bypass quiet hours (it's
        // urgent) but are gated by the dedicated notifReminderAtRisk
        // pref so users can still mute them if they want. Atomically
        // deduped via reminders_sent so we never re-fire on cron loops.
        const poster = await storage.getUser(j.postedById);
        if (poster && poster.notifReminderAtRisk !== false) {
          if (await claimReminder({ jobId: j.id, type: "at_risk_poster" })) {
            await notify(j.postedById, {
              title: "Worker hasn't started yet",
              body: `Your worker for "${j.title}" hasn't tapped "On my way" past their scheduled time. We're flagging this job at-risk.`,
              jobId: j.id,
              priority: "high",
            });
          }
        }

        if (j.assignedHelperId) {
          const worker = await storage.getUser(j.assignedHelperId);
          if (worker && worker.notifReminderAtRisk !== false) {
            if (await claimReminder({ jobId: j.id, type: "at_risk_worker" })) {
              await notify(j.assignedHelperId, {
                title: "Job is at risk — head out now",
                body: `"${j.title}" is past its scheduled start time. Tap "On my way" or cancel to release the job.`,
                jobId: j.id,
                priority: "high",
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("[cron] coordination timeouts error:", err);
    }
  }, 2 * 60 * 1000);

  return httpServer;
}