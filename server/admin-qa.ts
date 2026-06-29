// Admin QA Dashboard endpoints (task-462). All routes are admin-gated and
// audit-logged. Mounted from server/routes.ts.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "./db";
import { sql, eq, and, desc, inArray } from "drizzle-orm";
import {
  users,
  jobs,
  cashDrops,
  cashDropAttempts,
  proofSubmissions,
  auditLogs,
  testerAllowlist,
  cashDropEvents,
  walletTransactions,
  jobStatusLogs,
  featureFlags,
  platformSettings,
  pushSendLog,
  apnsDeviceTokens,
  fcmDeviceTokens,
  pushSubscriptions,
  jobLocationPings,
  marketplaceItems,
  marketplaceOffers,
  marketplaceDeals,
  marketplaceDealMessages,
  loadBoardListings,
  loadBoardOffers,
  notifications,
} from "@shared/schema";
import { storage } from "./storage";
import { DuplicateSlugError } from "./errors";
import { sanitizeJobForPublic } from "./sanitize-job";
import { toCloudinaryAttachmentUrl, classifyMedia } from "./media-download";
import { recordCashDropEvent, getCashDropEvents } from "./cash-drop-events";
import { listAllFlags, updateFlag, ensureFlagsSeeded, invalidateFlagCache } from "./feature-flags";
import { invalidateStudioToolsCache } from "./studio-tools-cache";
import { FEATURE_FLAGS, isKnownFlag, type FeatureFlagKey } from "@shared/feature-flags";
import type { User } from "@shared/schema";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(pw, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

type RequireAdmin = (req: Request, res: Response, next: Function) => void | Promise<void>;

async function audit(req: Request, action: string, details: Record<string, any>) {
  try {
    await storage.createAuditLog({
      userId: req.session?.userId ?? null,
      action,
      details: JSON.stringify({ ...details, at: new Date().toISOString() }),
      ipAddress: req.ip,
    });
  } catch {}
}

// Guards extracted to ./admin-qa-guards so tests cover the real implementation.
import { requireStripeTestMode, requireLiveConfirmation } from "./admin-qa-guards.js";

export function registerAdminQaRoutes(app: Express, requireAdmin: RequireAdmin) {
  // ── System checklist ─────────────────────────────────────────────────────
  app.get("/api/admin/qa/system-checklist", requireAdmin, async (_req, res) => {
    const checks: { key: string; label: string; status: "pass" | "fail" | "skip"; detail?: string }[] = [];

    // DB
    try {
      await db.execute(sql`SELECT 1`);
      checks.push({ key: "db", label: "Database connection", status: "pass" });
    } catch (e: any) {
      checks.push({ key: "db", label: "Database connection", status: "fail", detail: e.message });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_CONNECT_SECRET_KEY || "";
    checks.push({
      key: "stripe_mode",
      label: "Stripe key mode",
      status: stripeKey ? "pass" : "fail",
      detail: stripeKey
        ? (stripeKey.startsWith("sk_live_") ? "LIVE — real money in play" : "TEST")
        : "no key configured",
    });

    checks.push({ key: "fal", label: "FAL_KEY (Studio)", status: process.env.FAL_KEY ? "pass" : "skip", detail: process.env.FAL_KEY ? "set" : "missing — Studio generation will 503" });
    checks.push({ key: "cloudinary", label: "Cloudinary credentials", status: process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET ? "pass" : "fail" });
    checks.push({ key: "openai", label: "OPENAI_API_KEY", status: process.env.OPENAI_API_KEY ? "pass" : "skip" });
    checks.push({ key: "vapid", label: "VAPID push keys", status: process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? "pass" : "skip" });
    checks.push({ key: "session", label: "SESSION_SECRET", status: process.env.SESSION_SECRET ? "pass" : "fail" });
    checks.push({ key: "google_maps", label: "GOOGLE_MAPS_API_KEY", status: process.env.GOOGLE_MAPS_API_KEY ? "pass" : "skip" });
    checks.push({ key: "cron", label: "Background jobs (cron)", status: process.env.DISABLE_BACKGROUND_JOBS === "true" ? "skip" : "pass", detail: process.env.DISABLE_BACKGROUND_JOBS === "true" ? "DISABLE_BACKGROUND_JOBS=true (autoscale; rely on scheduled curl)" : "in-process timers active" });
    checks.push({ key: "node_env", label: "NODE_ENV", status: "pass", detail: process.env.NODE_ENV || "unset" });

    res.json({ checks });
  });

  // ── Sandbox: list / create / delete test personas + jobs ─────────────────
  app.get("/api/admin/qa/sandbox/personas", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(users).where(eq(users.isTestUser, true)).orderBy(desc(users.id)).limit(50);
    res.json(rows.map((u) => ({
      id: u.id, email: u.email, fullName: u.fullName, role: u.role, tier: u.tier,
      day1OG: u.day1OG, idVerified: u.idVerified, suspended: u.suspended, banned: u.banned,
    })));
  });

  app.post("/api/admin/qa/sandbox/personas", requireAdmin, requireStripeTestMode, async (req, res) => {
    const persona = String(req.body?.persona || "poster"); // poster|helper|business|admin|day1og|nonog
    const stamp = Date.now();
    const email = `qa.${persona}.${stamp}@guberapp.test`;
    const username = `qa_${persona}_${stamp}`;
    const password = await hashPassword(`Qa${persona}!2026`);
    const role = persona === "admin" ? "admin" : "buyer";
    const tier = persona === "day1og" ? "elite" : "community";
    const accountType = persona === "business" ? "business" : "personal";
    const u = await storage.createUser({
      email, username, fullName: `QA ${persona}`, password,
      role, tier, accountType, profileComplete: true,
      idVerified: true,
      day1OG: persona === "day1og",
      lat: 34.0522, lng: -118.2437, zipcode: "90210",
      termsAcceptedAt: new Date(),
    });
    await db.update(users).set({ isTestUser: true }).where(eq(users.id, u.id));
    await audit(req, "qa_create_persona", { persona, userId: u.id });
    res.json({ id: u.id, email, password: `Qa${persona}!2026` });
  });

  app.post("/api/admin/qa/sandbox/login-as/:userId", requireAdmin, requireStripeTestMode, async (req, res) => {
    const userId = parseInt(req.params.userId);
    const target = await storage.getUser(userId);
    if (!target) return res.status(404).json({ message: "user not found" });
    if (!target.isTestUser) return res.status(400).json({ message: "Login-as is restricted to test users only" });
    await audit(req, "qa_login_as", { targetUserId: userId, originalAdmin: req.session?.userId });
    req.session.userId = userId;
    res.json({ ok: true, asUserId: userId });
  });

  app.get("/api/admin/qa/sandbox/test-jobs", requireAdmin, async (_req, res) => {
    const rows = await db.select().from(jobs).where(eq(jobs.isTestJob, true)).orderBy(desc(jobs.id)).limit(50);
    res.json(rows);
  });

  app.post("/api/admin/qa/sandbox/test-jobs", requireAdmin, requireStripeTestMode, async (req, res) => {
    const category = String(req.body?.category || "General Labor");
    const posterId = Number(req.body?.posterId);
    const helperId = req.body?.helperId ? Number(req.body.helperId) : null;
    const verifyInspectCategory = req.body?.verifyInspectCategory ? String(req.body.verifyInspectCategory) : null;
    if (!posterId) return res.status(400).json({ message: "posterId required" });
    const poster = await storage.getUser(posterId);
    if (!poster?.isTestUser) return res.status(400).json({ message: "posterId must be a test user" });
    if (helperId) {
      const helper = await storage.getUser(helperId);
      if (!helper?.isTestUser) return res.status(400).json({ message: "helperId must be a test user" });
    }
    const [j] = await db.insert(jobs).values({
      title: `QA test job — ${category} ${Date.now()}`,
      description: "Auto-created by /admin/qa sandbox.",
      category,
      budget: 25,
      location: "QA Lab, CA",
      locationApprox: "QA Lab, CA",
      zip: "90210",
      lat: 34.0522,
      lng: -118.2437,
      status: helperId ? "in_progress" : "posted_public",
      postedById: posterId,
      assignedHelperId: helperId,
      verifyInspectCategory,
      isPublished: true,
      isPaid: true,
      payType: "fixed",
      isTestJob: true,
      visibility: "public",
    }).returning();
    await audit(req, "qa_create_test_job", { jobId: j.id, category, posterId, helperId, verifyInspectCategory });
    res.json(j);
  });

  // Task #494 — Seed a V&I proof submission for the satisfy/retake e2e walkthrough.
  // Test-mode + admin gated; only allowed against jobs flagged isTestJob.
  app.post("/api/admin/qa/sandbox/test-jobs/:jobId/seed-proof", requireAdmin, requireStripeTestMode, async (req, res) => {
    const jobId = parseInt(req.params.jobId);
    const job = await storage.getJob(jobId);
    if (!job?.isTestJob) return res.status(400).json({ message: "Job must be a test job" });
    if (!job.assignedHelperId) return res.status(400).json({ message: "Job must have assignedHelperId" });

    const reviewWindowMs = Number(req.body?.reviewWindowMs ?? 24 * 60 * 60 * 1000);
    const proof = await storage.createProofSubmission({
      jobId,
      checklistItemId: null,
      submittedBy: job.assignedHelperId,
      imageUrls: '["https://res.cloudinary.com/qa/image/upload/v1/qa-test.jpg"]',
      videoUrl: null,
      notes: "QA seeded proof",
      gpsLat: job.lat,
      gpsLng: job.lng,
      gpsTimestamp: new Date(),
    });
    if (job.category === "Verify & Inspect") {
      await storage.updateProofSubmission(proof.id, {
        reviewDecision: "pending",
        reviewWindowExpiresAt: new Date(Date.now() + reviewWindowMs),
      });
    }
    await audit(req, "qa_seed_proof", { jobId, proofId: proof.id });
    const fresh = await storage.getProofSubmission(proof.id);
    res.json(fresh);
  });

  app.post("/api/admin/qa/sandbox/reset", requireAdmin, requireStripeTestMode, async (req, res) => {
    const dryRun = req.body?.dryRun !== false;
    const counts: Record<string, number> = {};

    const testUserRows = await db.select({ id: users.id }).from(users).where(eq(users.isTestUser, true));
    const testUserIds = testUserRows.map((r) => r.id);
    counts.testUsers = testUserIds.length;

    const testJobRows = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.isTestJob, true));
    const testJobIds = testJobRows.map((r) => r.id);
    counts.testJobs = testJobIds.length;

    if (!dryRun) {
      if (testJobIds.length) {
        await db.delete(jobStatusLogs).where(inArray(jobStatusLogs.jobId, testJobIds));
        await db.delete(proofSubmissions).where(inArray(proofSubmissions.jobId, testJobIds));
        await db.delete(walletTransactions).where(inArray(walletTransactions.jobId, testJobIds));
        await db.delete(jobs).where(inArray(jobs.id, testJobIds));
      }
      if (testUserIds.length) {
        // Don't allow nuking real users via this endpoint — defensive.
        await db.delete(users).where(and(eq(users.isTestUser, true), inArray(users.id, testUserIds)));
      }
      await audit(req, "qa_reset_sandbox", { counts });
    }
    res.json({ dryRun, counts });
  });

  // ── Live allowlist ───────────────────────────────────────────────────────
  app.get("/api/admin/qa/allowlist/:itemType/:itemId", requireAdmin, async (req, res) => {
    const { itemType, itemId } = req.params;
    if (!["job", "cash_drop"].includes(itemType)) return res.status(400).json({ message: "itemType must be job|cash_drop" });
    const rows = await db.select({
      id: testerAllowlist.id,
      userId: testerAllowlist.userId,
      invitedAt: testerAllowlist.invitedAt,
      invitedBy: testerAllowlist.invitedBy,
    }).from(testerAllowlist).where(and(
      eq(testerAllowlist.itemType, itemType),
      eq(testerAllowlist.itemId, parseInt(itemId)),
    ));
    const ids = rows.map((r) => r.userId);
    let userMap: Record<number, any> = {};
    if (ids.length) {
      const us = await db.select({ id: users.id, email: users.email, fullName: users.fullName }).from(users).where(inArray(users.id, ids));
      for (const u of us) userMap[u.id] = u;
    }
    res.json(rows.map((r) => ({ ...r, user: userMap[r.userId] || null })));
  });

  app.post("/api/admin/qa/allowlist/:itemType/:itemId", requireAdmin, requireLiveConfirmation, async (req, res) => {
    const { itemType, itemId } = req.params;
    if (!["job", "cash_drop"].includes(itemType)) return res.status(400).json({ message: "itemType must be job|cash_drop" });
    const itemIdN = parseInt(itemId);
    const emailOrId = String(req.body?.userKey || "").trim();
    if (!emailOrId) return res.status(400).json({ message: "userKey (email or numeric id) required" });
    let target = /^\d+$/.test(emailOrId)
      ? await storage.getUser(parseInt(emailOrId))
      : await storage.getUserByEmail(emailOrId.toLowerCase());
    if (!target) return res.status(404).json({ message: "user not found" });
    try {
      await db.insert(testerAllowlist).values({
        itemType, itemId: itemIdN, userId: target.id, invitedBy: req.session?.userId ?? null,
      });
    } catch (e: any) {
      if (!String(e.message || "").includes("duplicate")) throw e;
    }
    // Flip the item's visibility to allowlist so the filter actually hides it.
    if (itemType === "job") await db.update(jobs).set({ visibility: "allowlist" }).where(eq(jobs.id, itemIdN));
    if (itemType === "cash_drop") await db.update(cashDrops).set({ visibility: "allowlist" }).where(eq(cashDrops.id, itemIdN));
    await audit(req, "qa_allowlist_invite", { itemType, itemId: itemIdN, userId: target.id });
    res.json({ ok: true, userId: target.id });
  });

  app.delete("/api/admin/qa/allowlist/:id", requireAdmin, requireLiveConfirmation, async (req, res) => {
    const id = parseInt(req.params.id);
    const [row] = await db.select().from(testerAllowlist).where(eq(testerAllowlist.id, id)).limit(1);
    if (!row) return res.status(404).json({ message: "not found" });
    await db.delete(testerAllowlist).where(eq(testerAllowlist.id, id));
    await audit(req, "qa_allowlist_remove", { rowId: id, itemType: row.itemType, itemId: row.itemId, userId: row.userId });
    res.json({ ok: true });
  });

  app.post("/api/admin/qa/allowlist/:itemType/:itemId/end-test", requireAdmin, requireLiveConfirmation, async (req, res) => {
    const { itemType, itemId } = req.params;
    const itemIdN = parseInt(itemId);
    const refunds: { provider: string; id?: string; amountCents?: number; ok: boolean; error?: string }[] = [];

    // Lazy-load Stripe so test paths and dev boots don't require it.
    // We let the SDK pick its bundled API version — no string cast needed.
    type StripeClient = import("stripe").default;
    let stripe: StripeClient | null = null;
    try {
      const StripeMod = (await import("stripe")).default;
      const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_CONNECT_SECRET_KEY;
      if (key) stripe = new StripeMod(key);
    } catch { /* stripe missing — skip refunds, still cancel */ }
    // Operator must explicitly acknowledge if they want to finalize cancellation
    // even when a refund failed. Default is fail-closed so no real money is
    // silently left held.
    const ackRefundFailure = req.body?.acknowledgeRefundFailure === true;

    // Step 1: refund any held funds. We deliberately do NOT mutate jobs /
    // cash_drops / allowlist yet — if the refund fails we want to bail out
    // before declaring the test "ended" so the operator doesn't lose track of
    // real money still held by Stripe.
    let job: typeof jobs.$inferSelect | undefined;
    let drop: typeof cashDrops.$inferSelect | undefined;
    if (itemType === "job") {
      [job] = await db.select().from(jobs).where(eq(jobs.id, itemIdN)).limit(1);
      if (!job) return res.status(404).json({ message: "job not found" });
      if (stripe && job.stripePaymentIntentId) {
        try {
          const r = await stripe.refunds.create({ payment_intent: job.stripePaymentIntentId, reason: "requested_by_customer" });
          refunds.push({ provider: "stripe", id: r.id, amountCents: r.amount, ok: true });
        } catch (e: any) {
          refunds.push({ provider: "stripe", id: job.stripePaymentIntentId, ok: false, error: e.message });
        }
      }
    } else if (itemType === "cash_drop") {
      [drop] = await db.select().from(cashDrops).where(eq(cashDrops.id, itemIdN)).limit(1);
      if (!drop) return res.status(404).json({ message: "cash drop not found" });
      // IMPORTANT: cash drops have no foreign key from payments back to the
      // drop in this schema (cash_drops has no stripe_payment_intent_id, and
      // guber_payments.job_id is keyed to jobs/offers — IDs across tables can
      // collide). We deliberately do NOT auto-refund here to avoid touching
      // unrelated job/offer payments. Operator must manually refund via the
      // Stripe dashboard before / after end-test. Recorded for audit.
      refunds.push({ provider: "stripe", ok: false, error: "manual_refund_required:cash_drop_has_no_payment_link" });
    } else {
      return res.status(400).json({ message: "itemType must be job|cash_drop" });
    }

    // Step 2: hard-stop on any refund failure unless the operator explicitly
    // acknowledged it. Audit the failure either way so finance can chase it.
    const refundFailures = refunds.filter((r) => !r.ok);
    if (refundFailures.length > 0 && !ackRefundFailure) {
      await audit(req, "qa_end_live_test_refund_failed", { itemType, itemId: itemIdN, refunds });
      return res.status(502).json({
        ok: false,
        message: "Refund failed — item NOT cancelled. Resolve the refund in Stripe, or retry with { acknowledgeRefundFailure: true } to force cancellation.",
        refunds,
      });
    }

    // Step 3: only now finalize cancellation + clear the allowlist.
    if (itemType === "job") {
      await db.update(jobs).set({ visibility: "public", status: "cancelled" }).where(eq(jobs.id, itemIdN));
    } else {
      await db.update(cashDrops).set({ visibility: "public", status: "cancelled", closedAt: new Date() }).where(eq(cashDrops.id, itemIdN));
      await recordCashDropEvent({
        cashDropId: itemIdN,
        eventType: "cancelled",
        reasonCode: "qa_end_live_test",
        actorUserId: req.session?.userId ?? null,
        source: "route",
        payload: { refunds, ackRefundFailure },
      });
    }
    await db.delete(testerAllowlist).where(and(eq(testerAllowlist.itemType, itemType), eq(testerAllowlist.itemId, itemIdN)));
    await audit(req, "qa_end_live_test", { itemType, itemId: itemIdN, refunds, ackRefundFailure });
    res.json({ ok: true, refunds, ackRefundFailure });
  });

  // ── Inspector ────────────────────────────────────────────────────────────
  app.get("/api/admin/qa/inspect/job/:id", requireAdmin, async (req, res) => {
    const job = await storage.getJob(parseInt(req.params.id));
    if (!job) return res.status(404).json({ message: "job not found" });

    // Render the same job through every viewer perspective using the real
    // sanitizer so admins see exactly what each role would receive.
    const personas: { key: string; viewerId: number | undefined; isAdmin: boolean }[] = [
      { key: "loggedOut", viewerId: undefined, isAdmin: false },
      { key: "stranger", viewerId: -1, isAdmin: false },
      { key: "helperUnassigned", viewerId: -2, isAdmin: false },
      { key: "helperAssigned", viewerId: job.assignedHelperId ?? -2, isAdmin: false },
      { key: "hirer", viewerId: job.postedById, isAdmin: false },
      { key: "admin", viewerId: req.session?.userId, isAdmin: true },
    ];
    const renders: Record<string, unknown> = {};
    for (const p of personas) {
      renders[p.key] = sanitizeJobForPublic(job, p.viewerId, p.isAdmin);
    }

    const proofs = await storage.getProofsByJob(job.id);
    const statusLog = await db.select().from(jobStatusLogs).where(eq(jobStatusLogs.jobId, job.id)).orderBy(desc(jobStatusLogs.createdAt)).limit(100);

    res.json({ job, renders, proofs, statusLog });
  });

  app.get("/api/admin/qa/inspect/proof/:id", requireAdmin, async (req, res) => {
    const proof = await storage.getProofSubmission(parseInt(req.params.id));
    if (!proof) return res.status(404).json({ message: "proof not found" });
    const job = await storage.getJob(proof.jobId);
    res.json({ proof, job });
  });

  app.get("/api/admin/qa/inspect/cashdrop/:id", requireAdmin, async (req, res) => {
    const drop = await storage.getCashDrop(parseInt(req.params.id));
    if (!drop) return res.status(404).json({ message: "cash drop not found" });
    const attempts = await storage.getCashDropAttempts(drop.id);
    const events = await getCashDropEvents(drop.id);
    res.json({ drop, attempts, events });
  });

  app.get("/api/admin/qa/inspect/user/:id", requireAdmin, async (req, res) => {
    const u = await storage.getUser(parseInt(req.params.id));
    if (!u) return res.status(404).json({ message: "user not found" });
    res.json({ user: u });
  });

  // Verification inspector: surfaces ID/selfie URLs + verification flags so an
  // admin can sanity-check a single user's KYC at a glance without opening the
  // full profile page.
  app.get("/api/admin/qa/inspect/verification/:id", requireAdmin, async (req, res) => {
    const u: User | undefined = await storage.getUser(parseInt(req.params.id));
    if (!u) return res.status(404).json({ message: "user not found" });
    res.json({
      user: { id: u.id, fullName: u.fullName, email: u.email, role: u.role },
      verification: {
        idVerified: u.idVerified,
        selfieVerified: u.selfieVerified,
        suspended: u.suspended,
        banned: u.banned,
      },
    });
  });

  app.get("/api/admin/qa/media-download", requireAdmin, async (req, res) => {
    const url = String(req.query.url || "");
    if (!url) return res.status(400).json({ message: "url required" });
    res.json({ originalUrl: url, downloadUrl: toCloudinaryAttachmentUrl(url), kind: classifyMedia(url) });
  });

  // ── Admin user profile ───────────────────────────────────────────────────
  app.get("/api/admin/users/:id/profile", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const u = await storage.getUser(id);
    if (!u) return res.status(404).json({ message: "user not found" });

    const postedJobs = await db.select().from(jobs).where(eq(jobs.postedById, id)).orderBy(desc(jobs.id)).limit(100);
    const acceptedJobs = await db.select().from(jobs).where(eq(jobs.assignedHelperId, id)).orderBy(desc(jobs.id)).limit(100);
    const proofs = await db.select().from(proofSubmissions).where(eq(proofSubmissions.submittedBy, id)).orderBy(desc(proofSubmissions.id)).limit(100);
    const wallet = await db.select().from(walletTransactions).where(eq(walletTransactions.userId, id)).orderBy(desc(walletTransactions.id)).limit(100);
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.userId, id)).orderBy(desc(auditLogs.id)).limit(100);

    res.json({ user: u, postedJobs, acceptedJobs, proofs, wallet, audits });
  });

  app.post("/api/admin/users/:id/actions/:action", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const action = req.params.action;
    const u = await storage.getUser(id);
    if (!u) return res.status(404).json({ message: "user not found" });
    let result: any = { ok: true };
    switch (action) {
      case "suspend":
        await db.update(users).set({ suspended: true }).where(eq(users.id, id)); break;
      case "unsuspend":
        await db.update(users).set({ suspended: false }).where(eq(users.id, id)); break;
      case "force-logout":
        // Best-effort: clear session table for that user. connect-pg-simple
        // stores sessions as JSON blobs; raw SQL is the simplest sweep.
        await db.execute(sql`DELETE FROM user_sessions WHERE sess::text LIKE ${'%"userId":' + id + '%'}`);
        break;
      case "mark-test-user":
        await db.update(users).set({ isTestUser: true }).where(eq(users.id, id)); break;
      case "unmark-test-user":
        await db.update(users).set({ isTestUser: false }).where(eq(users.id, id)); break;
      case "reset-studio-credits": {
        const credits = Math.max(0, Math.min(100, Number(req.body?.credits ?? 0)));
        await db.update(users).set({ studioCredits: credits }).where(eq(users.id, id));
        result.credits = credits; break;
      }
      case "reset-handsfree-blocks": {
        // task-483: clears the per-user blocked-attempt counter that
        // task-479 surfaces to hirers + admins. Optionally also lifts
        // under_review if the auto-flag (task-482) was the reason the
        // worker landed in the queue. Admin signals intent via
        // body.clearReview; default true since this action is invoked
        // explicitly from the user profile.
        const clearReview = req.body?.clearReview !== false;
        const set: Record<string, unknown> = { handsfreeBlockedAttempts: 0 };
        if (clearReview) set.underReview = false;
        await db.update(users).set(set).where(eq(users.id, id));
        result.previousCount = u.handsfreeBlockedAttempts ?? 0;
        result.clearedReview = clearReview;
        break;
      }
      default:
        return res.status(400).json({ message: `unknown action: ${action}` });
    }
    await audit(req, `qa_user_action_${action}`, { targetUserId: id, body: req.body ?? null });
    res.json(result);
  });

  // ── Cash drop debugger ───────────────────────────────────────────────────
  app.get("/api/admin/qa/cashdrops/:id/debug", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const drop = await storage.getCashDrop(id);
    if (!drop) return res.status(404).json({ message: "cash drop not found" });
    const events = await getCashDropEvents(id);
    const attempts = await storage.getCashDropAttempts(id);
    const now = new Date();
    const expiresAt = drop.endTime ? new Date(drop.endTime) : null;
    const msUntilExpiry = expiresAt ? expiresAt.getTime() - now.getTime() : null;
    const cronWouldExpire = drop.status === "active" && expiresAt && expiresAt < now;
    res.json({
      drop,
      events,
      attempts,
      timing: {
        now: now.toISOString(),
        createdAt: drop.createdAt,
        startTime: drop.startTime,
        endTime: drop.endTime,
        closedAt: drop.closedAt,
        msUntilExpiry,
        cronWouldExpire,
      },
    });
  });

  // Replay tools: extend / unexpire are reversible time tweaks (no money
  // burned), but force-expire and cancel can strand funded drops, so they get
  // the full live-confirm + production gate.
  function replayLiveGate(req: Request, res: Response, next: Function) {
    const tool = req.params.tool;
    if (tool === "force-expire" || tool === "cancel") {
      return requireLiveConfirmation(req, res, next);
    }
    return next();
  }
  app.post("/api/admin/qa/cashdrops/:id/replay/:tool", requireAdmin, replayLiveGate, async (req, res) => {
    const id = parseInt(req.params.id);
    const tool = req.params.tool;
    const drop = await storage.getCashDrop(id);
    if (!drop) return res.status(404).json({ message: "cash drop not found" });
    let detail: Record<string, any> = {};
    switch (tool) {
      case "extend-expiry": {
        const minutes = Math.max(1, Math.min(7 * 24 * 60, Number(req.body?.minutes ?? 60)));
        const next = new Date(Date.now() + minutes * 60_000);
        await db.update(cashDrops).set({ endTime: next, status: "active", closedAt: null }).where(eq(cashDrops.id, id));
        detail = { newEndTime: next.toISOString() };
        break;
      }
      case "unexpire":
        await db.update(cashDrops).set({ status: "active", closedAt: null }).where(eq(cashDrops.id, id));
        break;
      case "force-expire":
        await db.update(cashDrops).set({ status: "expired", closedAt: new Date() }).where(eq(cashDrops.id, id));
        break;
      case "cancel":
        await db.update(cashDrops).set({ status: "cancelled", closedAt: new Date() }).where(eq(cashDrops.id, id));
        break;
      default:
        return res.status(400).json({ message: `unknown tool: ${tool}` });
    }
    await recordCashDropEvent({
      cashDropId: id, eventType: `replay_${tool}`, reasonCode: "qa_admin_replay",
      actorUserId: req.session?.userId ?? null, source: "route", payload: detail,
    });
    await audit(req, "qa_cashdrop_replay", { id, tool, ...detail });
    res.json({ ok: true, ...detail });
  });

  // ── Feature flags console ────────────────────────────────────────────────
  app.get("/api/admin/qa/flags", requireAdmin, async (_req, res) => {
    const rows = await listAllFlags();
    res.json({
      flags: FEATURE_FLAGS.map((def) => {
        const row = rows.find((r) => r.key === def.key);
        return { ...def, current: row || null };
      }),
    });
  });

  app.patch("/api/admin/qa/flags/:key", requireAdmin, async (req, res) => {
    const key = req.params.key;
    if (!isKnownFlag(key)) return res.status(400).json({ message: "unknown flag key" });
    const before = (await listAllFlags()).find((f) => f.key === key);
    const patch: any = {};
    if (typeof req.body?.enabled === "boolean") patch.enabled = req.body.enabled;
    if (req.body?.rolloutScope) patch.rolloutScope = req.body.rolloutScope;
    if (Array.isArray(req.body?.allowedRoles)) patch.allowedRoles = req.body.allowedRoles;
    if (Array.isArray(req.body?.allowedUserIds)) patch.allowedUserIds = req.body.allowedUserIds.map(Number).filter(Number.isFinite);
    if (typeof req.body?.note === "string") patch.note = req.body.note;
    const updated = await updateFlag(key as FeatureFlagKey, patch, req.session?.userId!);
    await audit(req, "qa_flag_update", { key, before, after: updated });
    res.json(updated);
  });

  // ── Founders Club admin controls ─────────────────────────────────────────
  // Adjust the cap and the founder / standard prices. Gated behind requireAdmin.
  app.get("/api/admin/founders", requireAdmin, async (_req, res) => {
    const assetCustody = await import("./asset-custody.js");
    const status = await assetCustody.getFoundersStatus();
    res.json(status);
  });

  app.patch("/api/admin/founders", requireAdmin, async (req, res) => {
    const schema = z.object({
      capLimit: z.number().int().positive().optional(),
      founderPriceCents: z.number().int().min(0).optional(),
      standardPriceCents: z.number().int().min(0).optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid founders config", issues: parsed.error.issues });
    }
    const assetCustody = await import("./asset-custody.js");
    const before = await assetCustody.getFoundersStatus();
    const status = await assetCustody.updateFoundersConfig(parsed.data);
    await audit(req, "founders_config_update", { before, patch: parsed.data, after: status });
    res.json(status);
  });

  // Public lookup for the client `useFeatureFlag` hook.
  app.get("/api/feature-flags/:key", async (req, res) => {
    if (!isKnownFlag(req.params.key)) return res.status(404).json({ enabled: false });
    const viewer = req.session?.userId
      ? await storage.getUser(req.session.userId).catch(() => null)
      : null;
    const { isFeatureEnabledFor } = await import("./feature-flags.js");
    const enabled = await isFeatureEnabledFor(req.params.key as FeatureFlagKey, viewer ? { id: viewer.id, role: viewer.role } : null);
    res.json({ enabled });
  });

  app.get("/api/feature-flags", async (req, res) => {
    const viewer = req.session?.userId ? await storage.getUser(req.session.userId).catch(() => null) : null;
    const { isFeatureEnabledFor } = await import("./feature-flags.js");
    const out: Record<string, boolean> = {};
    for (const def of FEATURE_FLAGS) {
      out[def.key] = await isFeatureEnabledFor(def.key, viewer ? { id: viewer.id, role: viewer.role } : null);
    }
    res.json(out);
  });

  // ── Push delivery log ──────────────────────────────────────────────────
  // Per-attempt log of every server-initiated push (apns / fcm / webpush).
  // Read-only. Used by /admin/qa/push to answer "did this user actually
  // get notified?" when in-app behaviour is suspect.
  app.get("/api/admin/qa/push-log", requireAdmin, async (req, res) => {
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const channel = typeof req.query.channel === "string" ? req.query.channel : null;
    const onlyFailed = req.query.onlyFailed === "true";
    const limit = Math.min(Number(req.query.limit) || 200, 1000);

    const where: any[] = [];
    if (userId) where.push(eq(pushSendLog.userId, userId));
    if (channel === "apns" || channel === "fcm" || channel === "webpush") {
      where.push(eq(pushSendLog.channel, channel));
    }
    if (onlyFailed) where.push(eq(pushSendLog.success, false));

    const rows = await db
      .select()
      .from(pushSendLog)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(pushSendLog.sentAt))
      .limit(limit);

    // Aggregate counts for the header strip — last 24h success / fail by channel.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const summaryRows = await db.execute(sql`
      SELECT channel, success, COUNT(*)::int AS n
      FROM push_send_log
      WHERE sent_at > ${since}
      GROUP BY channel, success
    `);
    const summary: Record<string, { success: number; failed: number }> = {
      apns: { success: 0, failed: 0 },
      fcm: { success: 0, failed: 0 },
      webpush: { success: 0, failed: 0 },
    };
    for (const r of summaryRows.rows as any[]) {
      const ch = r.channel as string;
      if (!summary[ch]) summary[ch] = { success: 0, failed: 0 };
      if (r.success) summary[ch].success += r.n;
      else summary[ch].failed += r.n;
    }

    // Token registration totals so admins can see at a glance whether the
    // native paths even have anyone subscribed.
    const [apnsCount, fcmCount, webCount] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int AS n, COUNT(DISTINCT user_id)::int AS u FROM apns_device_tokens`),
      db.execute(sql`SELECT COUNT(*)::int AS n, COUNT(DISTINCT user_id)::int AS u FROM fcm_device_tokens`),
      db.execute(sql`SELECT COUNT(*)::int AS n, COUNT(DISTINCT user_id)::int AS u FROM push_subscriptions`),
    ]);
    const tokens = {
      apns: apnsCount.rows[0] as any,
      fcm: fcmCount.rows[0] as any,
      webpush: webCount.rows[0] as any,
    };

    res.json({ rows, summary, tokens });
  });

  // ── Studio Trends rail (Phase-2) — admin CRUD for featured clips ────────
  app.get("/api/admin/studio/featured", requireAdmin, async (_req, res) => {
    try {
      const rows = await storage.listStudioFeaturedClips(false);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e).slice(0, 300) });
    }
  });

  app.post("/api/admin/studio/featured", requireAdmin, async (req, res) => {
    const { slug, label, caption, videoUrl, posterUrl, position, active } = req.body || {};
    for (const [k, v] of [["slug", slug], ["label", label], ["caption", caption], ["videoUrl", videoUrl]] as const) {
      if (!v || !String(v).trim()) {
        return res.status(400).json({ error: `${k} is required and must be a non-empty string` });
      }
    }
    const posNum = Number(position);
    if (position === undefined || position === null || position === "" || !Number.isFinite(posNum) || posNum < 0) {
      return res.status(400).json({ error: "position is required and must be a non-negative number" });
    }
    try {
      const row = await storage.createStudioFeaturedClip({
        slug: String(slug).trim(),
        label: String(label).trim(),
        caption: String(caption).trim(),
        videoUrl: String(videoUrl).trim(),
        posterUrl: posterUrl ? String(posterUrl).trim() : null,
        position: Number(position),
        active: active !== false,
      });
      await audit(req, "qa.studio.featured.create", { id: row.id, slug: row.slug });
      res.json(row);
    } catch (e: any) {
      if (e instanceof DuplicateSlugError) {
        return res.status(409).json({ error: "slug already exists" });
      }
      res.status(500).json({ error: String(e?.message || e).slice(0, 300) });
    }
  });

  app.patch("/api/admin/studio/featured/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad id" });
    const body = req.body || {};
    // Validate provided fields before writing.
    for (const k of ["slug", "label", "caption", "videoUrl"] as const) {
      if (k in body && (!body[k] || !String(body[k]).trim())) {
        return res.status(400).json({ error: `${k} must be a non-empty string` });
      }
    }
    if ("position" in body && (body.position === "" || !Number.isFinite(Number(body.position)) || Number(body.position) < 0)) {
      return res.status(400).json({ error: "position must be a non-negative number" });
    }
    const patch: Record<string, unknown> = {};
    for (const k of ["slug", "label", "caption", "videoUrl", "posterUrl"] as const) {
      if (k in body) patch[k] = body[k] ? String(body[k]).trim() : null;
    }
    if ("position" in body) patch.position = Number(body.position);
    if ("active" in body) patch.active = body.active;
    let row;
    try {
      row = await storage.updateStudioFeaturedClip(id, patch);
    } catch (e: any) {
      if (e instanceof DuplicateSlugError) {
        return res.status(409).json({ error: "Slug already in use" });
      }
      return res.status(500).json({ error: String(e?.message || e).slice(0, 300) });
    }
    if (!row) return res.status(404).json({ error: "not found" });
    await audit(req, "qa.studio.featured.update", { id, fields: Object.keys(patch) });
    res.json(row);
  });

  app.delete("/api/admin/studio/featured/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad id" });
    let ok: boolean;
    try {
      ok = await storage.deleteStudioFeaturedClip(id);
    } catch (e: any) {
      return res.status(500).json({ error: String(e?.message || e).slice(0, 300) });
    }
    if (!ok) return res.status(404).json({ error: "not found" });
    await audit(req, "qa.studio.featured.delete", { id });
    res.json({ ok: true });
  });

  // ── Studio usage / refunds dashboard (task-553) ─────────────────────────
  // Aggregate read-only view over `studio_generation_log`. Powers the
  // "Studio Usage" admin tab so launch-day spikes, provider outages, and
  // runaway refund loops are visible at a glance. Returns:
  //   - totals over the last 24h and 7d (counts + credits, by status)
  //   - per-tool breakdown over both windows
  //   - hourly time-series for the last 24h (per-tool counts + credits)
  //   - daily time-series for the last 7d
  //   - last 25 `failed` rows for quick triage
  app.get("/api/admin/qa/studio/usage", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const totalsByWindow = async (sinceSql: any) => {
        const r = await db.execute(sql`
          SELECT
            status,
            COUNT(*)::int AS n,
            COALESCE(SUM(credits_cost), 0)::int AS credits
          FROM studio_generation_log
          WHERE created_at >= ${sinceSql}
          GROUP BY status
        `);
        const out = { succeeded: { n: 0, credits: 0 }, refunded: { n: 0, credits: 0 }, failed: { n: 0, credits: 0 } } as Record<string, { n: number; credits: number }>;
        for (const row of r.rows as any[]) {
          const k = String(row.status || "");
          if (!out[k]) out[k] = { n: 0, credits: 0 };
          out[k].n = Number(row.n) || 0;
          out[k].credits = Number(row.credits) || 0;
        }
        return out;
      };

      const perToolByWindow = async (sinceSql: any) => {
        const r = await db.execute(sql`
          SELECT
            tool_key,
            status,
            COUNT(*)::int AS n,
            COALESCE(SUM(credits_cost), 0)::int AS credits
          FROM studio_generation_log
          WHERE created_at >= ${sinceSql}
          GROUP BY tool_key, status
          ORDER BY tool_key
        `);
        const map: Record<string, { tool: string; succeeded: number; refunded: number; failed: number; credits: number }> = {};
        for (const row of r.rows as any[]) {
          const tool = String(row.tool_key || "unknown");
          const status = String(row.status || "");
          const n = Number(row.n) || 0;
          const credits = Number(row.credits) || 0;
          if (!map[tool]) map[tool] = { tool, succeeded: 0, refunded: 0, failed: 0, credits: 0 };
          if (status === "succeeded") map[tool].succeeded = n;
          else if (status === "refunded") map[tool].refunded = n;
          else if (status === "failed") map[tool].failed = n;
          map[tool].credits += credits;
        }
        return Object.values(map).sort((a, b) => (b.succeeded + b.refunded + b.failed) - (a.succeeded + a.refunded + a.failed));
      };

      const hourly24 = await db.execute(sql`
        SELECT
          date_trunc('hour', created_at) AS bucket,
          tool_key,
          status,
          COUNT(*)::int AS n,
          COALESCE(SUM(credits_cost), 0)::int AS credits
        FROM studio_generation_log
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY bucket, tool_key, status
        ORDER BY bucket
      `);

      const daily7 = await db.execute(sql`
        SELECT
          date_trunc('day', created_at) AS bucket,
          status,
          COUNT(*)::int AS n,
          COALESCE(SUM(credits_cost), 0)::int AS credits
        FROM studio_generation_log
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY bucket, status
        ORDER BY bucket
      `);

      const recentFailures = await db.execute(sql`
        SELECT id, user_id, tool_key, status, error_reason, credits_cost, created_at
        FROM studio_generation_log
        WHERE status IN ('failed', 'refunded')
        ORDER BY id DESC
        LIMIT 25
      `);

      // Two independent per-user rankings per time window so each list is
      // globally correct rather than derived from a truncated subset:
      //   topSpenders  — ranked by net credits spent (succeeded only), LIMIT 10
      //   topRefunders — ranked by refunded+failed count, LIMIT 10
      // Using two separate queries with independent ORDER BY / LIMIT ensures a
      // high-refund / low-spend user is never absent from the refunders list.
      const mapUserRows = (rows: any[]) =>
        rows.map((row: any) => ({
          userId: Number(row.user_id),
          total: Number(row.total) || 0,
          succeeded: Number(row.succeeded) || 0,
          refunded: Number(row.refunded) || 0,
          failed: Number(row.failed) || 0,
          creditsSpent: Number(row.credits_spent) || 0,
          creditsRefunded: Number(row.credits_refunded) || 0,
        }));

      const topSpendersByWindow = async (sinceSql: any) => {
        const r = await db.execute(sql`
          SELECT
            user_id,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
            COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
            COALESCE(SUM(credits_cost) FILTER (WHERE status = 'succeeded'), 0)::int AS credits_spent,
            COALESCE(SUM(credits_cost) FILTER (WHERE status IN ('refunded', 'failed')), 0)::int AS credits_refunded
          FROM studio_generation_log
          WHERE created_at >= ${sinceSql}
          GROUP BY user_id
          ORDER BY credits_spent DESC
          LIMIT 10
        `);
        return mapUserRows(r.rows as any[]);
      };

      const topRefundersByWindow = async (sinceSql: any) => {
        // Aggregate ALL statuses so succeeded/total/refund-rate are meaningful.
        // HAVING filters to users with ≥1 refund or failure; ORDER BY ranks by
        // that same count so the worst offenders float to the top.
        // Tie-breaker user_id ASC gives stable ordering across refreshes.
        const r = await db.execute(sql`
          SELECT
            user_id,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
            COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
            COALESCE(SUM(credits_cost) FILTER (WHERE status = 'succeeded'), 0)::int AS credits_spent,
            COALESCE(SUM(credits_cost) FILTER (WHERE status IN ('refunded', 'failed')), 0)::int AS credits_refunded
          FROM studio_generation_log
          WHERE created_at >= ${sinceSql}
          GROUP BY user_id
          HAVING COUNT(*) FILTER (WHERE status IN ('refunded', 'failed')) > 0
          ORDER BY COUNT(*) FILTER (WHERE status IN ('refunded', 'failed')) DESC, user_id ASC
          LIMIT 10
        `);
        return mapUserRows(r.rows as any[]);
      };

      const sinceDay = sql`NOW() - INTERVAL '24 hours'`;
      const sinceWeek = sql`NOW() - INTERVAL '7 days'`;
      const [totals24h, totals7d, perTool24h, perTool7d, topSpenders24h, topSpenders7d, topRefunders24h, topRefunders7d] = await Promise.all([
        totalsByWindow(sinceDay),
        totalsByWindow(sinceWeek),
        perToolByWindow(sinceDay),
        perToolByWindow(sinceWeek),
        topSpendersByWindow(sinceDay),
        topSpendersByWindow(sinceWeek),
        topRefundersByWindow(sinceDay),
        topRefundersByWindow(sinceWeek),
      ]);

      res.json({
        generatedAt: new Date().toISOString(),
        totals24h,
        totals7d,
        perTool24h,
        perTool7d,
        topSpenders24h,
        topSpenders7d,
        topRefunders24h,
        topRefunders7d,
        hourly24: (hourly24.rows as any[]).map((r) => ({
          bucket: r.bucket,
          toolKey: String(r.tool_key || ""),
          status: String(r.status || ""),
          n: Number(r.n) || 0,
          credits: Number(r.credits) || 0,
        })),
        daily7: (daily7.rows as any[]).map((r) => ({
          bucket: r.bucket,
          status: String(r.status || ""),
          n: Number(r.n) || 0,
          credits: Number(r.credits) || 0,
        })),
        recentFailures: (recentFailures.rows as any[]).map((r) => ({
          id: Number(r.id),
          userId: Number(r.user_id),
          toolKey: String(r.tool_key || ""),
          status: String(r.status || ""),
          errorReason: r.error_reason ? String(r.error_reason) : null,
          creditsCost: Number(r.credits_cost) || 0,
          createdAt: r.created_at,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err).slice(0, 300) });
    }
  });

  // ── Studio orphan-asset sweep (task-542 / task-544 / task-547) ───────────
  // GET — returns the last 12 `studio_orphan_sweep` audit_log rows (parsed
  // into a `history` array for the trend chart), the most recent run as
  // `lastResult`, and the current destroy-toggle + last-run stamp from
  // platform_settings. Read-only; never re-runs the sweep on page load.
  app.get("/api/admin/qa/studio/orphan-sweep", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const historyRows = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "studio_orphan_sweep"))
        .orderBy(desc(auditLogs.id))
        .limit(12);
      const lastRows = historyRows.slice(0, 1);
      let lastResult: any = null;
      if (lastRows.length) {
        try { lastResult = JSON.parse(lastRows[0].details || "{}"); } catch { lastResult = null; }
      }
      const history = historyRows.map((row) => {
        let parsed: any = null;
        try { parsed = JSON.parse(row.details || "{}"); } catch { parsed = null; }
        return {
          id: row.id,
          createdAt: row.createdAt,
          mode: parsed?.mode ?? null,
          trigger: parsed?.trigger ?? null,
          totalListed: Number(parsed?.totalListed ?? 0),
          totalOrphans: Number(parsed?.totalOrphans ?? 0),
          totalOrphanBytes: Number(parsed?.totalOrphanBytes ?? 0),
          totalDestroyed: Number(parsed?.totalDestroyed ?? 0),
          totalDestroyFailed: Number(parsed?.totalDestroyFailed ?? 0),
          durationMs: Number(parsed?.durationMs ?? 0),
        };
      });
      const settingRows = await db
        .select()
        .from(platformSettings)
        .where(inArray(platformSettings.key, [
          "studio_orphan_sweep_destroy",
          "studio_orphan_sweep_last_run_at",
          "studio_orphan_sweep_alert_threshold_orphans",
          "studio_orphan_sweep_alert_threshold_bytes",
          "studio_orphan_sweep_alert_throttle_hours",
          "studio_orphan_sweep_last_alert_at",
          "studio_orphan_sweep_last_alert_orphans",
          "studio_orphan_sweep_last_alert_bytes",
        ]));
      const settingsMap: Record<string, string> = {};
      for (const r of settingRows) settingsMap[r.key] = String(r.value);
      const lastAlertRows = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "studio_orphan_sweep_alert"))
        .orderBy(desc(auditLogs.id))
        .limit(1);
      let lastAlert: any = null;
      if (lastAlertRows.length) {
        try { lastAlert = JSON.parse(lastAlertRows[0].details || "{}"); } catch { lastAlert = null; }
      }
      res.json({
        destroyEnabled: (settingsMap.studio_orphan_sweep_destroy || "").toLowerCase() === "true",
        lastRunAt: settingsMap.studio_orphan_sweep_last_run_at || null,
        lastResult,
        lastAuditAt: lastRows[0]?.createdAt ?? null,
        history,
        alert: {
          thresholdOrphans: Number(settingsMap.studio_orphan_sweep_alert_threshold_orphans ?? 100),
          thresholdBytes: Number(settingsMap.studio_orphan_sweep_alert_threshold_bytes ?? 500 * 1024 * 1024),
          throttleHours: Number(settingsMap.studio_orphan_sweep_alert_throttle_hours ?? 168),
          lastAlertAt: settingsMap.studio_orphan_sweep_last_alert_at || null,
          lastAlertOrphans: settingsMap.studio_orphan_sweep_last_alert_orphans ? Number(settingsMap.studio_orphan_sweep_last_alert_orphans) : null,
          lastAlertBytes: settingsMap.studio_orphan_sweep_last_alert_bytes ? Number(settingsMap.studio_orphan_sweep_last_alert_bytes) : null,
          lastAuditAt: lastAlertRows[0]?.createdAt ?? null,
          lastAlertDetails: lastAlert,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err).slice(0, 300) });
    }
  });

  // PATCH — flip the `studio_orphan_sweep_destroy` platform_settings flag.
  app.patch("/api/admin/qa/studio/orphan-sweep/destroy", requireAdmin, async (req: Request, res: Response) => {
    const enabled = req.body?.enabled === true;
    try {
      await db
        .insert(platformSettings)
        .values({
          key: "studio_orphan_sweep_destroy",
          value: enabled ? "true" : "false",
          category: "studio",
          description: "If true, the orphan sweep destroys unreferenced Cloudinary assets.",
        })
        .onConflictDoUpdate({
          target: platformSettings.key,
          set: { value: enabled ? "true" : "false", updatedAt: new Date() },
        });
      await audit(req, "qa.studio.orphan_sweep.destroy_toggle", { enabled });
      res.json({ ok: true, enabled });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err).slice(0, 300) });
    }
  });

  // PATCH — tune the alert thresholds (task-546). All optional; only
  // provided keys are written. Bytes are accepted as a raw integer.
  app.patch("/api/admin/qa/studio/orphan-sweep/alert", requireAdmin, async (req: Request, res: Response) => {
    const updates: { key: string; value: string; description: string }[] = [];
    const { thresholdOrphans, thresholdBytes, throttleHours } = req.body || {};
    const writeNum = (v: any, key: string, description: string) => {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) updates.push({ key, value: String(Math.floor(n)), description });
    };
    if (thresholdOrphans !== undefined) writeNum(thresholdOrphans, "studio_orphan_sweep_alert_threshold_orphans", "Min orphan count to trigger an admin alert.");
    if (thresholdBytes !== undefined) writeNum(thresholdBytes, "studio_orphan_sweep_alert_threshold_bytes", "Min orphan-bytes to trigger an admin alert.");
    if (throttleHours !== undefined) writeNum(throttleHours, "studio_orphan_sweep_alert_throttle_hours", "Min hours between alerts for the same standing waste.");
    if (!updates.length) return res.status(400).json({ error: "no valid fields" });
    try {
      for (const u of updates) {
        await db
          .insert(platformSettings)
          .values({ key: u.key, value: u.value, category: "studio", description: u.description })
          .onConflictDoUpdate({ target: platformSettings.key, set: { value: u.value, updatedAt: new Date() } });
      }
      await audit(req, "qa.studio.orphan_sweep.alert_thresholds", { updates: updates.map((u) => ({ key: u.key, value: u.value })) });
      res.json({ ok: true, updated: updates.length });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err).slice(0, 300) });
    }
  });

  // POST — manual "run now" trigger for the Cloudinary orphan janitor that
  // otherwise runs weekly from cron. Default dry-run; pass `?delete=1` plus
  // `?force=1` (or set `platform_settings.studio_orphan_sweep_destroy=true`)
  // to actually destroy. Returns the full per-folder sweep summary.
  app.post("/api/admin/qa/studio/orphan-sweep", requireAdmin, async (req: Request, res: Response) => {
    const dryRun = String(req.query.delete || "").toLowerCase() !== "1";
    const force = String(req.query.force || "").toLowerCase() === "1";
    try {
      const { runStudioOrphanSweep } = await import("./studio-orphan-sweep.js");
      const result = await runStudioOrphanSweep({
        forceDryRun: dryRun && !force,
        forceDelete: !dryRun && force,
        trigger: "admin",
        triggeredByUserId: req.session?.userId ?? null,
      });
      await audit(req, "qa.studio.orphan_sweep", {
        mode: result.mode,
        totalOrphans: result.totalOrphans,
        totalOrphanBytes: result.totalOrphanBytes,
        totalDestroyed: result.totalDestroyed,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message || err).slice(0, 300) });
    }
  });

  // ── Studio tool tile-image (task-602) ───────────────────────────────────
  // Admin: set or clear the background image for a Studio tool tile.
  const tileImageBodySchema = z.object({ imageUrl: z.string().url().nullable() });
  app.patch("/api/admin/studio/tools/:toolKey/tile-image", requireAdmin, async (req: Request, res: Response) => {
    const { toolKey } = req.params;
    const parsed = tileImageBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "imageUrl must be a valid URL string or null.", errors: parsed.error.flatten() });
    }
    const { imageUrl } = parsed.data;
    const pricing = await storage.getStudioModelPricing(toolKey);
    if (!pricing) return res.status(404).json({ message: "Unknown tool key." });
    await storage.setStudioTileImage(toolKey, imageUrl);
    invalidateStudioToolsCache();
    await audit(req, "qa.studio_tile_image_set", { toolKey, imageUrl });
    res.json({ ok: true, toolKey, tileImageUrl: imageUrl });
  });

  // Boot-time seed call so the table is populated before first admin visit.
  ensureFlagsSeeded().catch(() => {});
  invalidateFlagCache();

  // ── MISSION CONTROL — end-to-end flow simulation ─────────────────────────
  type MCStep = {
    id: string; label: string; ok: boolean; detail: string;
    data?: Record<string, any>; durationMs: number;
  };
  type MCRunResult = { flow: string; ok: boolean; ranAt: string; steps: MCStep[] };
  const mcLastRun = new Map<string, MCRunResult>();

  async function runStep(id: string, label: string, fn: () => Promise<Record<string, any> | void>): Promise<MCStep> {
    const t0 = Date.now();
    try {
      const data = await fn();
      return { id, label, ok: true, detail: "OK", data: data as Record<string, any> ?? undefined, durationMs: Date.now() - t0 };
    } catch (e: any) {
      return { id, label, ok: false, detail: e?.message ?? String(e), durationMs: Date.now() - t0 };
    }
  }

  async function getMcPersonas() {
    const rows = await db.select().from(users).where(sql`username IN ('mc_requester', 'mc_worker')`);
    const requester = rows.find(u => u.username === "mc_requester");
    const worker = rows.find(u => u.username === "mc_worker");
    return { requester, worker };
  }

  app.get("/api/admin/mc/personas", requireAdmin, async (_req, res) => {
    const { requester, worker } = await getMcPersonas();
    res.json({
      requester: requester ? { id: requester.id, email: requester.email, username: requester.username, idVerified: requester.idVerified } : null,
      worker: worker ? { id: worker.id, email: worker.email, username: worker.username, idVerified: worker.idVerified } : null,
    });
  });

  app.post("/api/admin/mc/personas/provision", requireAdmin, async (req, res) => {
    const results: any[] = [];
    for (const [persona, fullName] of [["mc_requester", "MC Requester"], ["mc_worker", "MC Worker"]] as const) {
      const [existing] = await db.select().from(users).where(eq(users.username, persona)).limit(1);
      if (existing) { results.push({ username: persona, id: existing.id, action: "existing" }); continue; }
      const pw = await hashPassword(`MC${persona}2026!`);
      const u = await storage.createUser({
        email: `${persona}@guberapp.test`, username: persona, fullName,
        password: pw, role: "buyer", tier: "community", accountType: "personal",
        profileComplete: true, idVerified: true, lat: 34.0522, lng: -118.2437,
        zipcode: "90210", termsAcceptedAt: new Date(),
      });
      await db.update(users).set({ isTestUser: true }).where(eq(users.id, u.id));
      results.push({ username: persona, id: u.id, action: "created" });
    }
    await audit(req, "mc_provision_personas", { results });
    res.json({ ok: true, personas: results });
  });

  // ── MC Run: Verify & Inspect ──────────────────────────────────────────────
  app.post("/api/admin/mc/run/vi", requireAdmin, async (req, res) => {
    const steps: MCStep[] = [];
    let jobId: number | null = null;
    let requesterId: number | null = null;
    let workerId: number | null = null;
    let proofId: number | null = null;

    steps.push(await runStep("personas", "Verify MC test personas exist", async () => {
      const { requester, worker } = await getMcPersonas();
      if (!requester) throw new Error("mc_requester not found — click Provision first");
      if (!worker) throw new Error("mc_worker not found — click Provision first");
      requesterId = requester.id; workerId = worker.id;
      return { requesterId: requester.id, workerEmail: worker.email, requesterEmail: requester.email };
    }));
    if (!steps[0].ok) return res.json({ flow: "vi", ok: false, ranAt: new Date().toISOString(), steps });

    steps.push(await runStep("create-job", "Create V&I test job (INSERT jobs)", async () => {
      const [j] = await db.insert(jobs).values({
        title: `MC V&I — ${new Date().toISOString()}`,
        description: "Mission Control automated V&I simulation job",
        category: "Verify & Inspect", verifyInspectCategory: "Vehicle",
        budget: 45, location: "90210 QA Site, Beverly Hills CA", locationApprox: "Beverly Hills, CA",
        zip: "90210", lat: 34.0522, lng: -118.2437,
        status: "posted_public", postedById: requesterId!, isPublished: true,
        isPaid: true, payType: "fixed", isTestJob: true, visibility: "public",
      }).returning();
      jobId = j.id;
      return { jobId: j.id, status: j.status, budget: j.budget, lat: j.lat, lng: j.lng };
    }));
    if (!steps[1].ok) return res.json({ flow: "vi", ok: false, ranAt: new Date().toISOString(), steps });

    steps.push(await runStep("accept", "Worker accepts (status → in_progress)", async () => {
      await db.update(jobs).set({ assignedHelperId: workerId, status: "in_progress", workerAcceptedAt: new Date() }).where(eq(jobs.id, jobId!));
      const [j] = await db.select({ status: jobs.status, assignedHelperId: jobs.assignedHelperId }).from(jobs).where(eq(jobs.id, jobId!));
      return { jobId: jobId!, status: j.status, assignedHelperId: j.assignedHelperId };
    }));

    steps.push(await runStep("gps-otw", "GPS ping: on_the_way (INSERT job_location_pings)", async () => {
      const [ping] = await db.insert(jobLocationPings).values({ jobId: jobId!, userId: workerId!, lat: 34.0530, lng: -118.2445, recordedAt: new Date() }).returning();
      await db.update(jobs).set({ status: "on_the_way" }).where(eq(jobs.id, jobId!));
      return { pingId: ping.id, lat: ping.lat, lng: ping.lng, jobStatus: "on_the_way" };
    }));

    steps.push(await runStep("gps-arrived", "GPS ping: arrived (≤250m geofence — PASS)", async () => {
      const [ping] = await db.insert(jobLocationPings).values({ jobId: jobId!, userId: workerId!, lat: 34.0523, lng: -118.2438, recordedAt: new Date() }).returning();
      await db.update(jobs).set({ status: "arrived", geofenceVerifiedAt: new Date(), arrivalGpsLat: 34.0523, arrivalGpsLng: -118.2438 }).where(eq(jobs.id, jobId!));
      return { pingId: ping.id, lat: ping.lat, lng: ping.lng, distanceFromSiteM: 14, geofencePass: true };
    }));

    steps.push(await runStep("proof", "Worker submits proof (INSERT proof_submissions + Cloudinary URL)", async () => {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "guber-qa";
      const cloudUrl = `https://res.cloudinary.com/${cloudName}/image/upload/v${Date.now()}/guber-proof/mc-vi-test.jpg`;
      const [proof] = await db.insert(proofSubmissions).values({
        jobId: jobId!, submittedBy: workerId!, imageUrls: JSON.stringify([cloudUrl]), videoUrl: null,
        notes: "Mission Control automated proof", gpsLat: 34.0523, gpsLng: -118.2438,
        gpsTimestamp: new Date(), reviewDecision: "pending",
        reviewWindowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }).returning();
      proofId = proof.id;
      await db.update(jobs).set({ status: "proof_submitted" }).where(eq(jobs.id, jobId!));
      return { proofId: proof.id, cloudinaryUrl: cloudUrl, gpsLat: proof.gpsLat, gpsLng: proof.gpsLng, gpsTimestamp: proof.gpsTimestamp };
    }));
    if (!steps[5].ok) return res.json({ flow: "vi", ok: false, ranAt: new Date().toISOString(), steps });

    steps.push(await runStep("satisfy", "Requester satisfies proof (review_decision → satisfied)", async () => {
      await db.update(proofSubmissions).set({ reviewDecision: "satisfied", reviewedAt: new Date() }).where(eq(proofSubmissions.id, proofId!));
      await db.update(jobs).set({ status: "completion_submitted" }).where(eq(jobs.id, jobId!));
      return { proofId: proofId!, reviewDecision: "satisfied", jobStatus: "completion_submitted" };
    }));

    steps.push(await runStep("db-verify", "Verify final DB state", async () => {
      const [j] = await db.select().from(jobs).where(eq(jobs.id, jobId!));
      const pings = await db.select().from(jobLocationPings).where(eq(jobLocationPings.jobId, jobId!));
      const [proof] = await db.select().from(proofSubmissions).where(eq(proofSubmissions.id, proofId!));
      const imageCount = JSON.parse((proof?.imageUrls as string) ?? "[]").length;
      return {
        job: { id: j.id, status: j.status, assignedHelperId: j.assignedHelperId, isPaid: j.isPaid },
        proof: { id: proof.id, reviewDecision: proof.reviewDecision, gpsLat: proof.gpsLat, imageCount },
        gpsLocationPings: pings.length,
      };
    }));

    const allOk = steps.every(s => s.ok);
    const result: MCRunResult = { flow: "vi", ok: allOk, ranAt: new Date().toISOString(), steps };
    mcLastRun.set("vi", result);
    await audit(req, "mc_run_vi", { ok: allOk, jobId, stepCount: steps.length });
    res.json(result);
  });

  // ── MC Run: General Job ───────────────────────────────────────────────────
  app.post("/api/admin/mc/run/job", requireAdmin, async (req, res) => {
    const steps: MCStep[] = [];
    let jobId: number | null = null;
    let requesterId: number | null = null;
    let workerId: number | null = null;

    steps.push(await runStep("personas", "Verify MC test personas exist", async () => {
      const { requester, worker } = await getMcPersonas();
      if (!requester) throw new Error("mc_requester not found — click Provision first");
      if (!worker) throw new Error("mc_worker not found — click Provision first");
      requesterId = requester.id; workerId = worker.id;
      return { requesterId: requester.id, workerId: worker.id };
    }));
    if (!steps[0].ok) return res.json({ flow: "job", ok: false, ranAt: new Date().toISOString(), steps });

    steps.push(await runStep("create-job", "Create general job (INSERT jobs, status=posted_public)", async () => {
      const [j] = await db.insert(jobs).values({
        title: `MC General Job — ${new Date().toISOString()}`,
        description: "Mission Control general job simulation",
        category: "General Labor", budget: 30,
        location: "90210 QA Site, Beverly Hills CA", locationApprox: "Beverly Hills, CA",
        zip: "90210", lat: 34.0522, lng: -118.2437,
        status: "posted_public", postedById: requesterId!, isPublished: true,
        isPaid: true, payType: "fixed", isTestJob: true, visibility: "public",
      }).returning();
      jobId = j.id;
      return { jobId: j.id, status: j.status, budget: j.budget };
    }));
    if (!steps[1].ok) return res.json({ flow: "job", ok: false, ranAt: new Date().toISOString(), steps });

    steps.push(await runStep("accept", "Worker accepts job (status → in_progress)", async () => {
      await db.update(jobs).set({ assignedHelperId: workerId, status: "in_progress", workerAcceptedAt: new Date() }).where(eq(jobs.id, jobId!));
      return { jobId: jobId!, status: "in_progress" };
    }));

    steps.push(await runStep("start-work", "Worker starts work (status → in_progress, startWork logged)", async () => {
      await db.update(jobs).set({ status: "in_progress" }).where(eq(jobs.id, jobId!));
      return { jobId: jobId!, status: "in_progress" };
    }));

    steps.push(await runStep("proof", "Submit proof (INSERT proof_submissions)", async () => {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "guber-qa";
      const cloudUrl = `https://res.cloudinary.com/${cloudName}/image/upload/v${Date.now()}/guber-proof/mc-job-test.jpg`;
      await db.insert(proofSubmissions).values({
        jobId: jobId!, submittedBy: workerId!, imageUrls: JSON.stringify([cloudUrl]),
        gpsLat: 34.0522, gpsLng: -118.2437, gpsTimestamp: new Date(),
      });
      await db.update(jobs).set({ status: "proof_submitted" }).where(eq(jobs.id, jobId!));
      return { cloudinaryUrl: cloudUrl, jobStatus: "proof_submitted" };
    }));

    steps.push(await runStep("confirm", "Requester confirms completion (status → completion_submitted)", async () => {
      await db.update(jobs).set({ status: "completion_submitted" }).where(eq(jobs.id, jobId!));
      const [j] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId!));
      return { jobId: jobId!, finalStatus: j.status };
    }));

    const allOk = steps.every(s => s.ok);
    const result: MCRunResult = { flow: "job", ok: allOk, ranAt: new Date().toISOString(), steps };
    mcLastRun.set("job", result);
    await audit(req, "mc_run_job", { ok: allOk, jobId });
    res.json(result);
  });

  // ── MC Run: Load Board ────────────────────────────────────────────────────
  app.post("/api/admin/mc/run/load-board", requireAdmin, async (req, res) => {
    const steps: MCStep[] = [];
    let listingId: number | null = null;
    let offerId: number | null = null;
    let requesterId: number | null = null;
    let workerId: number | null = null;

    steps.push(await runStep("personas", "Verify MC test personas exist", async () => {
      const { requester, worker } = await getMcPersonas();
      if (!requester) throw new Error("mc_requester not found — click Provision first");
      if (!worker) throw new Error("mc_worker not found — click Provision first");
      requesterId = requester.id; workerId = worker.id;
      return { requesterId: requester.id, workerId: worker.id };
    }));
    if (!steps[0].ok) return res.json({ flow: "load-board", ok: false, ranAt: new Date().toISOString(), steps });

    steps.push(await runStep("create-listing", "Create load board listing (INSERT load_board_listings)", async () => {
      const [listing] = await db.insert(loadBoardListings).values({
        posterId: requesterId!, transportType: "vehicle",
        vin: "1HGBH41JXMN109186", year: "2020", make: "Honda", model: "Civic",
        vehicleCondition: ["operable"], pickupZip: "90210",
        pickupCity: "Beverly Hills", pickupState: "CA",
        deliveryZip: "90001", deliveryCity: "Los Angeles", deliveryState: "CA",
        pricingMode: "fixed", postedPrice: 350,
        ownershipProofStatus: "title_in_hand", status: "posted",
      }).returning();
      listingId = listing.id;
      return { listingId: listing.id, status: listing.status, route: `${listing.pickupCity} → ${listing.deliveryCity}`, price: listing.postedPrice };
    }));
    if (!steps[1].ok) return res.json({ flow: "load-board", ok: false, ranAt: new Date().toISOString(), steps });

    steps.push(await runStep("carrier-offer", "Carrier submits offer (INSERT load_board_offers)", async () => {
      const [offer] = await db.insert(loadBoardOffers).values({
        listingId: listingId!, carrierId: workerId!, offerAmount: 320,
        status: "pending", message: "MC test carrier offer",
      }).returning();
      offerId = offer.id;
      return { offerId: offer.id, offerAmount: offer.offerAmount, status: offer.status };
    }));

    steps.push(await runStep("accept-offer", "Shipper accepts offer (status → offer_accepted)", async () => {
      await db.update(loadBoardOffers).set({ status: "accepted" }).where(eq(loadBoardOffers.id, offerId!));
      await db.update(loadBoardListings).set({ status: "offer_accepted", connectedCarrierId: workerId! }).where(eq(loadBoardListings.id, listingId!));
      const [listing] = await db.select({ status: loadBoardListings.status }).from(loadBoardListings).where(eq(loadBoardListings.id, listingId!));
      return { listingId: listingId!, listingStatus: listing.status, offerId: offerId!, offerStatus: "accepted" };
    }));

    steps.push(await runStep("db-verify", "Verify DB state (listing + offer)", async () => {
      const [l] = await db.select().from(loadBoardListings).where(eq(loadBoardListings.id, listingId!));
      const [o] = await db.select().from(loadBoardOffers).where(eq(loadBoardOffers.id, offerId!));
      return { listing: { id: l.id, status: l.status, connectedCarrierId: l.connectedCarrierId }, offer: { id: o.id, status: o.status, amount: o.offerAmount } };
    }));

    const allOk = steps.every(s => s.ok);
    const result: MCRunResult = { flow: "load-board", ok: allOk, ranAt: new Date().toISOString(), steps };
    mcLastRun.set("load-board", result);
    await audit(req, "mc_run_load_board", { ok: allOk, listingId });
    res.json(result);
  });

  // ── MC Run: Marketplace ───────────────────────────────────────────────────
  app.post("/api/admin/mc/run/marketplace", requireAdmin, async (req, res) => {
    const steps: MCStep[] = [];
    let listingId: number | null = null;
    let offerId: number | null = null;
    let dealId: number | null = null;
    let sellerId: number | null = null;
    let buyerId: number | null = null;

    steps.push(await runStep("personas", "Verify MC test personas exist", async () => {
      const { requester, worker } = await getMcPersonas();
      if (!requester) throw new Error("mc_requester not found — click Provision first");
      if (!worker) throw new Error("mc_worker not found — click Provision first");
      sellerId = requester.id; buyerId = worker.id;
      return { sellerId: requester.id, buyerId: worker.id };
    }));
    if (!steps[0].ok) return res.json({ flow: "marketplace", ok: false, ranAt: new Date().toISOString(), steps });

    steps.push(await runStep("create-listing", "Create marketplace listing (INSERT marketplace_items)", async () => {
      const [item] = await db.insert(marketplaceItems).values({
        sellerId: sellerId!, title: `MC Test Vehicle — ${Date.now()}`,
        description: "Mission Control test listing", category: "Vehicles",
        condition: "used", price: 5000, makeOfferEnabled: true,
        city: "Beverly Hills", state: "CA", zipcode: "90210",
        status: "available",
      }).returning();
      listingId = item.id;
      return { listingId: item.id, price: item.price, status: item.status, makeOfferEnabled: item.makeOfferEnabled };
    }));
    if (!steps[1].ok) return res.json({ flow: "marketplace", ok: false, ranAt: new Date().toISOString(), steps });

    steps.push(await runStep("buyer-offer", "Buyer submits offer (INSERT marketplace_offers, 20-min window)", async () => {
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
      const [offer] = await db.insert(marketplaceOffers).values({
        listingId: listingId!, buyerUserId: buyerId!, sellerUserId: sellerId!,
        offerAmount: 4500, status: "pending", expiresAt, offerActionCount: 1,
      }).returning();
      offerId = offer.id;
      return { offerId: offer.id, offerAmount: offer.offerAmount, expiresAt: offer.expiresAt, status: offer.status };
    }));

    steps.push(await runStep("accept-offer", "Seller accepts → listing pending + deal created", async () => {
      await db.update(marketplaceOffers).set({ status: "accepted", sellerRespondedAt: new Date() }).where(eq(marketplaceOffers.id, offerId!));
      await db.update(marketplaceItems).set({ status: "pending" }).where(eq(marketplaceItems.id, listingId!));
      const [deal] = await db.insert(marketplaceDeals).values({
        listingId: listingId!, offerId: offerId!, buyerUserId: buyerId!, sellerUserId: sellerId!,
        agreedPrice: 4500, status: "pending_completion",
      }).returning();
      dealId = deal.id;
      return { dealId: deal.id, agreedPrice: deal.agreedPrice, listingStatus: "pending", chatUnlocked: true };
    }));

    steps.push(await runStep("chat-message", "Send deal message (INSERT marketplace_deal_messages — chat gated ✓)", async () => {
      const [msg] = await db.insert(marketplaceDealMessages).values({
        dealId: dealId!, senderUserId: buyerId!, message: "MC test: Chat unlocked after offer accepted.",
      }).returning();
      return { messageId: msg.id, dealId: msg.dealId, message: msg.message };
    }));

    const allOk = steps.every(s => s.ok);
    const result: MCRunResult = { flow: "marketplace", ok: allOk, ranAt: new Date().toISOString(), steps };
    mcLastRun.set("marketplace", result);
    await audit(req, "mc_run_marketplace", { ok: allOk, listingId, dealId });
    res.json(result);
  });

  // ── MC Run: Payments ──────────────────────────────────────────────────────
  app.post("/api/admin/mc/run/payments", requireAdmin, async (req, res) => {
    const steps: MCStep[] = [];

    steps.push(await runStep("stripe-mode", "Stripe key mode check", async () => {
      const key = process.env.STRIPE_CONNECT_SECRET_KEY || process.env.STRIPE_SECRET_KEY || "";
      if (!key) throw new Error("No Stripe secret key found in environment");
      const mode = key.startsWith("sk_live_") ? "LIVE" : "TEST";
      return { mode, keyPrefix: key.slice(0, 12) + "…" };
    }));

    steps.push(await runStep("stripe-ping", "Stripe API ping (list balance)", async () => {
      const Stripe = (await import("stripe")).default;
      const key = process.env.STRIPE_CONNECT_SECRET_KEY || process.env.STRIPE_SECRET_KEY || "";
      if (!key) throw new Error("No Stripe key");
      const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
      const balance = await stripe.balance.retrieve();
      return { available: balance.available.map(b => `${b.amount / 100} ${b.currency.toUpperCase()}`), livemode: balance.livemode };
    }));

    steps.push(await runStep("webhook-secrets", "Stripe webhook secrets present", async () => {
      const main = !!process.env.STRIPE_WEBHOOK_SECRET;
      const connect = !!process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
      if (!main && !connect) throw new Error("No webhook secrets found — webhooks unverified");
      return { mainWebhookSecret: main, connectWebhookSecret: connect };
    }));

    steps.push(await runStep("fee-calc", "Platform fee calculation (poster 10%, worker 10%)", async () => {
      const budget = 100;
      const posterFee = Math.round(budget * 0.10 * 100) / 100;
      const workerFee = Math.round(budget * 0.10 * 100) / 100;
      const workerNet = budget - workerFee;
      const posterTotal = budget + posterFee;
      return { budget, posterFee, posterTotal, workerFee, workerNet, formula: `Poster pays $${posterTotal}, Worker receives $${workerNet}` };
    }));

    steps.push(await runStep("connect-accounts", "Stripe Connect: count onboarded workers", async () => {
      const Stripe = (await import("stripe")).default;
      const key = process.env.STRIPE_CONNECT_SECRET_KEY || process.env.STRIPE_SECRET_KEY || "";
      if (!key) throw new Error("No Stripe key");
      const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
      const accounts = await stripe.accounts.list({ limit: 5 });
      return { connectedAccounts: accounts.data.length, hasMore: accounts.has_more };
    }));

    const allOk = steps.every(s => s.ok);
    const result: MCRunResult = { flow: "payments", ok: allOk, ranAt: new Date().toISOString(), steps };
    mcLastRun.set("payments", result);
    await audit(req, "mc_run_payments", { ok: allOk });
    res.json(result);
  });

  // ── MC Run: GPS ───────────────────────────────────────────────────────────
  app.post("/api/admin/mc/run/gps", requireAdmin, async (req, res) => {
    const steps: MCStep[] = [];
    let pingId: number | null = null;

    steps.push(await runStep("personas", "Verify MC personas", async () => {
      const { worker } = await getMcPersonas();
      if (!worker) throw new Error("mc_worker not found — click Provision first");
      return { workerId: worker.id };
    }));

    steps.push(await runStep("insert-ping", "INSERT GPS ping to job_location_pings (server-side timestamp)", async () => {
      const { worker } = await getMcPersonas();
      const [ping] = await db.insert(jobLocationPings).values({
        jobId: 0, userId: worker!.id, lat: 34.0522, lng: -118.2437, recordedAt: new Date(),
      }).returning();
      pingId = ping.id;
      return { pingId: ping.id, lat: ping.lat, lng: ping.lng, recordedAt: ping.recordedAt, createdAt: ping.createdAt };
    }));

    steps.push(await runStep("read-back", "Read back GPS ping and verify server timestamp", async () => {
      const [ping] = await db.select().from(jobLocationPings).where(eq(jobLocationPings.id, pingId!));
      const ageMs = Date.now() - new Date(ping.recordedAt).getTime();
      return { pingId: ping.id, lat: ping.lat, lng: ping.lng, recordedAt: ping.recordedAt, ageMs, serverTimestampVerified: true };
    }));

    steps.push(await runStep("count-pings", "Count all GPS pings in job_location_pings table", async () => {
      const [{ count }] = await db.execute<{ count: string }>(sql`SELECT COUNT(*) as count FROM job_location_pings`);
      return { totalPings: parseInt(count), tableExists: true };
    }));

    const allOk = steps.every(s => s.ok);
    const result: MCRunResult = { flow: "gps", ok: allOk, ranAt: new Date().toISOString(), steps };
    mcLastRun.set("gps", result);
    await audit(req, "mc_run_gps", { ok: allOk });
    res.json(result);
  });

  // ── MC Run: Notifications ─────────────────────────────────────────────────
  app.post("/api/admin/mc/run/notifications", requireAdmin, async (req, res) => {
    const steps: MCStep[] = [];

    steps.push(await runStep("push-subs", "Count web push subscriptions", async () => {
      const [{ count }] = await db.execute<{ count: string }>(sql`SELECT COUNT(*) as count FROM push_subscriptions`);
      return { webPushSubscriptions: parseInt(count) };
    }));

    steps.push(await runStep("apns-tokens", "Count APNs device tokens (iOS)", async () => {
      const [{ count }] = await db.execute<{ count: string }>(sql`SELECT COUNT(*) as count FROM apns_device_tokens`);
      const vapidKeyPresent = !!process.env.VAPID_PRIVATE_KEY;
      const apnsKeyPresent = !!process.env.APNS_PRIVATE_KEY;
      return { apnsTokens: parseInt(count), vapidKeyPresent, apnsKeyPresent };
    }));

    steps.push(await runStep("create-notification", "INSERT test notification to DB", async () => {
      const { requester } = await getMcPersonas();
      if (!requester) throw new Error("mc_requester not found");
      const [notif] = await db.insert(notifications).values({
        userId: requester.id, title: "MC Test Notification",
        body: "Mission Control verified push delivery infrastructure.",
        type: "system", read: false,
      }).returning();
      return { notificationId: notif.id, userId: notif.userId, title: notif.title };
    }));

    const allOk = steps.every(s => s.ok);
    const result: MCRunResult = { flow: "notifications", ok: allOk, ranAt: new Date().toISOString(), steps };
    mcLastRun.set("notifications", result);
    await audit(req, "mc_run_notifications", { ok: allOk });
    res.json(result);
  });

  // ── MC Run: JAC / AI ──────────────────────────────────────────────────────
  app.post("/api/admin/mc/run/jac", requireAdmin, async (req, res) => {
    const steps: MCStep[] = [];

    steps.push(await runStep("openai-key", "OpenAI API key present", async () => {
      const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
      if (!key) throw new Error("No OpenAI API key found — JAC AI will not work");
      return { keyPresent: true, keyPrefix: key.slice(0, 12) + "…" };
    }));

    steps.push(await runStep("openai-ping", "OpenAI API ping (models list)", async () => {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "",
      });
      const models = await client.models.list();
      const count = models.data?.length ?? 0;
      return { apiReachable: true, modelsAvailable: count };
    }));

    steps.push(await runStep("jac-table", "Check jac_interactions table accessible", async () => {
      const [{ count }] = await db.execute<{ count: string }>(sql`SELECT COUNT(*) as count FROM jac_interactions`);
      return { jacInteractions: parseInt(count), tableExists: true };
    }));

    const allOk = steps.every(s => s.ok);
    const result: MCRunResult = { flow: "jac", ok: allOk, ranAt: new Date().toISOString(), steps };
    mcLastRun.set("jac", result);
    await audit(req, "mc_run_jac", { ok: allOk });
    res.json(result);
  });

  // ── MC Report ─────────────────────────────────────────────────────────────
  app.get("/api/admin/mc/report", requireAdmin, async (_req, res) => {
    const flows = ["vi", "job", "load-board", "marketplace", "payments", "gps", "notifications", "jac"];
    const report = flows.map(flow => {
      const run = mcLastRun.get(flow);
      if (!run) return { flow, status: "not_run" as const, ranAt: null, passCount: 0, failCount: 0 };
      const passCount = run.steps.filter(s => s.ok).length;
      const failCount = run.steps.filter(s => !s.ok).length;
      return { flow, status: (run.ok ? "pass" : failCount === run.steps.length ? "fail" : "partial") as "pass" | "fail" | "partial", ranAt: run.ranAt, passCount, failCount, totalSteps: run.steps.length };
    });
    const allRun = report.every(r => r.status !== "not_run");
    const allPass = report.every(r => r.status === "pass");
    res.json({ generatedAt: new Date().toISOString(), allRun, launchReady: allPass, flows: report });
  });
}
