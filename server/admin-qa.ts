// Admin QA Dashboard endpoints (task-462). All routes are admin-gated and
// audit-logged. Mounted from server/routes.ts.

import type { Express, Request, Response } from "express";
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
} from "@shared/schema";
import { storage } from "./storage";
import { sanitizeJobForPublic } from "./sanitize-job";
import { toCloudinaryAttachmentUrl, classifyMedia } from "./media-download";
import { recordCashDropEvent, getCashDropEvents } from "./cash-drop-events";
import { listAllFlags, updateFlag, ensureFlagsSeeded, invalidateFlagCache } from "./feature-flags";
import { FEATURE_FLAGS, isKnownFlag, type FeatureFlagKey } from "@shared/feature-flags";
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

function requireStripeTestMode(_req: Request, res: Response, next: Function) {
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_CONNECT_SECRET_KEY || "";
  if (key.startsWith("sk_live_")) {
    return res.status(403).json({ message: "Sandbox endpoints refuse to run while a live Stripe key is loaded." });
  }
  next();
}

function requireLiveConfirmation(req: Request, res: Response, next: Function) {
  const conf = (req.headers["x-live-confirm"] || req.body?.confirm || "") as string;
  if (conf !== "LIVE") {
    return res.status(412).json({ message: "Live action requires header x-live-confirm: LIVE" });
  }
  next();
}

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
    } as any);
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
    if (!posterId) return res.status(400).json({ message: "posterId required" });
    const poster = await storage.getUser(posterId);
    if (!poster?.isTestUser) return res.status(400).json({ message: "posterId must be a test user" });
    const [j] = await db.insert(jobs).values({
      title: `QA test job — ${category} ${Date.now()}`,
      description: "Auto-created by /admin/qa sandbox.",
      category, budget: 25, location: "QA Lab, CA", locationApprox: "QA Lab, CA", zip: "90210",
      lat: 34.0522, lng: -118.2437,
      status: "posted_public", postedById: posterId,
      isPublished: true, isPaid: true, payType: "fixed",
      isTestJob: true, visibility: "public",
    } as any).returning();
    await audit(req, "qa_create_test_job", { jobId: j.id, category, posterId });
    res.json(j);
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

  app.post("/api/admin/qa/allowlist/:itemType/:itemId", requireAdmin, async (req, res) => {
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

  app.delete("/api/admin/qa/allowlist/:id", requireAdmin, async (req, res) => {
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
    if (itemType === "job") {
      await db.update(jobs).set({ visibility: "public", status: "cancelled" }).where(eq(jobs.id, itemIdN));
    } else if (itemType === "cash_drop") {
      await db.update(cashDrops).set({ visibility: "public", status: "cancelled", closedAt: new Date() }).where(eq(cashDrops.id, itemIdN));
      await recordCashDropEvent({ cashDropId: itemIdN, eventType: "cancelled", reasonCode: "qa_end_live_test", actorUserId: req.session?.userId ?? null, source: "route" });
    } else {
      return res.status(400).json({ message: "itemType must be job|cash_drop" });
    }
    await db.delete(testerAllowlist).where(and(eq(testerAllowlist.itemType, itemType), eq(testerAllowlist.itemId, itemIdN)));
    await audit(req, "qa_end_live_test", { itemType, itemId: itemIdN });
    res.json({ ok: true });
  });

  // ── Inspector ────────────────────────────────────────────────────────────
  app.get("/api/admin/qa/inspect/job/:id", requireAdmin, async (req, res) => {
    const job = await storage.getJob(parseInt(req.params.id));
    if (!job) return res.status(404).json({ message: "job not found" });

    // Render the same job through every viewer perspective using the real
    // sanitizer so admins see exactly what each role would receive.
    const personas = [
      { key: "loggedOut", viewerId: undefined, isAdmin: false },
      { key: "stranger", viewerId: -1, isAdmin: false },
      { key: "helperUnassigned", viewerId: -2, isAdmin: false },
      { key: "helperAssigned", viewerId: job.assignedHelperId ?? -2, isAdmin: false },
      { key: "hirer", viewerId: job.postedById, isAdmin: false },
      { key: "admin", viewerId: req.session?.userId, isAdmin: true },
    ];
    const renders: Record<string, any> = {};
    for (const p of personas) {
      renders[p.key] = sanitizeJobForPublic(job as any, p.viewerId as any, p.isAdmin);
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

  app.post("/api/admin/qa/cashdrops/:id/replay/:tool", requireAdmin, async (req, res) => {
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

  // Boot-time seed call so the table is populated before first admin visit.
  ensureFlagsSeeded().catch(() => {});
  invalidateFlagCache();
}
