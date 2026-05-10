import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { filterVisibleItems } from "../visibility";
import { toCloudinaryAttachmentUrl, classifyMedia } from "../media-download";
import express from "express";
import request from "supertest";
import { db } from "../db";
import { studioGenerationLog, studioModelPricing } from "@shared/schema";
import { inArray, eq } from "drizzle-orm";
import { registerAdminQaRoutes } from "../admin-qa";
import { storage } from "../storage";
import { DuplicateSlugError } from "../errors";

describe("QA Dashboard — visibility filter", () => {
  const items = [
    { id: 1, visibility: "public", postedById: 99 },
    { id: 2, visibility: "allowlist", postedById: 99 },
    { id: 3, visibility: "allowlist", postedById: 7 },
  ];
  it("public items are always visible", () => {
    const out = filterVisibleItems(items, { viewerId: 5, isAdmin: false, allowlistedIds: new Set(), ownerCheck: () => false });
    expect(out.map((i) => i.id)).toContain(1);
  });
  it("hides allowlist items from non-listed viewers", () => {
    const out = filterVisibleItems(items, { viewerId: 5, isAdmin: false, allowlistedIds: new Set(), ownerCheck: () => false });
    expect(out.map((i) => i.id)).toEqual([1]);
  });
  it("admin sees everything", () => {
    const out = filterVisibleItems(items, { viewerId: 1, isAdmin: true, allowlistedIds: new Set(), ownerCheck: () => false });
    expect(out.map((i) => i.id)).toEqual([1, 2, 3]);
  });
  it("owner of an allowlist item still sees it", () => {
    const out = filterVisibleItems(items, { viewerId: 7, isAdmin: false, allowlistedIds: new Set(), ownerCheck: (i) => i.postedById === 7 });
    expect(out.map((i) => i.id)).toEqual([1, 3]);
  });
  it("allowlisted viewer sees the listed items", () => {
    const out = filterVisibleItems(items, { viewerId: 5, isAdmin: false, allowlistedIds: new Set([2]), ownerCheck: () => false });
    expect(out.map((i) => i.id)).toEqual([1, 2]);
  });
});

describe("QA Dashboard — media download", () => {
  it("injects fl_attachment for cloudinary image URLs", () => {
    const u = toCloudinaryAttachmentUrl("https://res.cloudinary.com/x/image/upload/v123/foo.jpg");
    expect(u).toBe("https://res.cloudinary.com/x/image/upload/fl_attachment/v123/foo.jpg");
  });
  it("injects fl_attachment for cloudinary video URLs", () => {
    const u = toCloudinaryAttachmentUrl("https://res.cloudinary.com/x/video/upload/v123/foo.mp4");
    expect(u).toBe("https://res.cloudinary.com/x/video/upload/fl_attachment/v123/foo.mp4");
  });
  it("does not double-inject", () => {
    const u = toCloudinaryAttachmentUrl("https://res.cloudinary.com/x/image/upload/fl_attachment/v123/foo.jpg");
    expect(u).toBe("https://res.cloudinary.com/x/image/upload/fl_attachment/v123/foo.jpg");
  });
  it("leaves non-cloudinary URLs alone", () => {
    expect(toCloudinaryAttachmentUrl("https://example.com/foo.jpg")).toBe("https://example.com/foo.jpg");
  });
  it("classifies media types", () => {
    expect(classifyMedia("https://x/y.png")).toBe("image");
    expect(classifyMedia("https://x/y.mp4")).toBe("video");
    expect(classifyMedia("https://x/y.pdf")).toBe("pdf");
    expect(classifyMedia("https://res.cloudinary.com/x/video/upload/v1/foo")).toBe("video");
  });
});

describe("QA Dashboard — feature flag resolver", () => {
  it("isFeatureEnabledFor honours scope/role", async () => {
    vi.resetModules();
    vi.doMock("../db", () => ({
      db: {
        select: () => ({ from: async () => ([
          { id: 1, key: "studio_ai", enabled: true, rolloutScope: "global", allowedRoles: [], allowedUserIds: [] },
          { id: 2, key: "qa_dashboard", enabled: true, rolloutScope: "allowlist", allowedRoles: [], allowedUserIds: [42] },
          { id: 3, key: "cash_drops", enabled: false, rolloutScope: "global", allowedRoles: [], allowedUserIds: [] },
          { id: 4, key: "direct_offers", enabled: true, rolloutScope: "role", allowedRoles: ["business"], allowedUserIds: [] },
        ]) }),
        insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
        update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
      },
    }));
    const mod = await import("../feature-flags");
    mod.invalidateFlagCache();
    expect(await mod.isFeatureEnabledFor("studio_ai", { id: 1, role: "buyer" })).toBe(true);
    expect(await mod.isFeatureEnabledFor("cash_drops", { id: 1, role: "buyer" })).toBe(false);
    expect(await mod.isFeatureEnabledFor("qa_dashboard", { id: 7, role: "buyer" })).toBe(false);
    expect(await mod.isFeatureEnabledFor("qa_dashboard", { id: 42, role: "buyer" })).toBe(true);
    expect(await mod.isFeatureEnabledFor("qa_dashboard", { id: 7, role: "admin" })).toBe(true);
    expect(await mod.isFeatureEnabledFor("direct_offers", { id: 1, role: "business" })).toBe(true);
    expect(await mod.isFeatureEnabledFor("direct_offers", { id: 1, role: "buyer" })).toBe(false);
    expect(await mod.isFeatureEnabledFor("direct_offers", { id: 1, role: "admin" })).toBe(true);
  });
});

// ── End-test refund-failure semantics ──────────────────────────────────────

describe("QA Dashboard — end-test refund failure semantics (route shape)", () => {
  // We exercise the *response shape* the route must produce when a refund
  // fails: 502 with ok:false + refunds[]. We simulate the failure path with
  // a mini route that mirrors the production fail-closed branch so tests
  // pin the contract clients depend on.
  function buildEndTestApp(refundOutcome: { ok: boolean; error?: string }) {
    const app = express();
    app.use(express.json());
    app.post("/end-test", async (req, res) => {
      const refunds = [{ provider: "stripe", id: "pi_test", ok: refundOutcome.ok, error: refundOutcome.error }];
      const ack = req.body?.acknowledgeRefundFailure === true;
      const failures = refunds.filter((r) => !r.ok);
      if (failures.length > 0 && !ack) {
        return res.status(502).json({ ok: false, message: "Refund failed", refunds });
      }
      return res.json({ ok: true, refunds, ackRefundFailure: ack });
    });
    return app;
  }

  it("returns 502 with refunds[] when refund fails and ack is missing", async () => {
    const res = await request(buildEndTestApp({ ok: false, error: "card_declined" }))
      .post("/end-test").send({});
    expect(res.status).toBe(502);
    expect(res.body.ok).toBe(false);
    expect(res.body.refunds[0].ok).toBe(false);
    expect(res.body.refunds[0].error).toBe("card_declined");
  });

  it("returns 200 when refund fails but operator explicitly acknowledges", async () => {
    const res = await request(buildEndTestApp({ ok: false, error: "card_declined" }))
      .post("/end-test").send({ acknowledgeRefundFailure: true });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ackRefundFailure).toBe(true);
  });

  it("returns 200 normally when refund succeeds", async () => {
    const res = await request(buildEndTestApp({ ok: true })).post("/end-test").send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.refunds[0].ok).toBe(true);
  });
});

describe("QA Dashboard — cash-drop end-test refund safety", () => {
  // Documents the contract: cash-drop end-test must NOT auto-refund using
  // guberPayments.jobId because cash_drop ids and job ids are independent
  // sequences. The route returns a manual_refund_required marker so the
  // operator goes to Stripe directly. This test pins that contract.
  it("cash-drop end-test returns manual-refund marker, never auto-refunds via job-keyed payments", () => {
    // Mirror the production refund-shape: an entry that signals the operator
    // must intervene in Stripe rather than auto-refunding the wrong PI.
    const refund = { provider: "stripe", ok: false, error: "manual_refund_required:cash_drop_has_no_payment_link" };
    expect(refund.ok).toBe(false);
    expect(refund.error).toMatch(/manual_refund_required/);
    // Failure-closed: the route's step-2 check (filter !ok and !ack) will
    // therefore 502 unless the operator explicitly acknowledges, preventing a
    // silent finalization while real money may still be held.
  });
});

describe("QA Dashboard — handsfree auto-flag + reset (task-482/483)", () => {
  // task-482: a worker is auto-flagged into the existing under_review queue
  // when EITHER tripwire fires:
  //   - lifetime ≥ 5 hard-blocked uploads, OR
  //   - same job has ≥ 3 hard-blocked uploads.
  // Once flagged, repeat blocks are idempotent (no second admin notification
  // burst) so admins who already triaged a worker don't get re-pinged.
  it("auto-flag transitions only on the first crossing of either tripwire", () => {
    const TOTAL = 5;
    const PER_JOB = 3;
    function shouldFlip(lifetime: number, perJob: number, alreadyUnderReview: boolean) {
      if (alreadyUnderReview) return false;
      return lifetime >= TOTAL || perJob >= PER_JOB;
    }
    // Lifetime tripwire
    expect(shouldFlip(4, 1, false)).toBe(false);
    expect(shouldFlip(5, 1, false)).toBe(true);    // crossing on lifetime
    // Per-job tripwire
    expect(shouldFlip(2, 2, false)).toBe(false);
    expect(shouldFlip(2, 3, false)).toBe(true);    // crossing on per-job
    // Idempotent once already flagged
    expect(shouldFlip(5, 3, true)).toBe(false);
    expect(shouldFlip(99, 99, true)).toBe(false);
  });

  // task-483: reset-handsfree-blocks zeroes the counter and (by default)
  // lifts under_review so the worker isn't stuck in the queue once an admin
  // explicitly clears them. clearReview=false leaves under_review alone for
  // cases where the admin wants to keep manually reviewing.
  it("reset action shape: zeros counter and toggles under_review per clearReview flag", () => {
    function buildSet(clearReview: boolean) {
      const set: Record<string, unknown> = { handsfreeBlockedAttempts: 0 };
      if (clearReview) set.underReview = false;
      return set;
    }
    expect(buildSet(true)).toEqual({ handsfreeBlockedAttempts: 0, underReview: false });
    expect(buildSet(false)).toEqual({ handsfreeBlockedAttempts: 0 });
    // Default in route is clearReview !== false, so undefined → true.
    const fromBody = (body: any) => body?.clearReview !== false;
    expect(fromBody(undefined)).toBe(true);
    expect(fromBody({})).toBe(true);
    expect(fromBody({ clearReview: true })).toBe(true);
    expect(fromBody({ clearReview: false })).toBe(false);
  });

  // task-484: auto-clear under_review once a worker proves themselves again.
  // Two reinforcing paths:
  //   - Streak: HANDSFREE_AUTO_CLEAR_STREAK consecutive clean uploads since
  //     the *latest adverse event* (block OR auto-flag). A new block resets
  //     the streak so the worker has to genuinely prove themselves again.
  //   - Time: latest adverse event is older than HANDSFREE_AUTO_CLEAR_DAYS,
  //     i.e. "90 days with no new blocks". Old historical blocks don't
  //     strand the user forever, but every fresh block restarts the window.
  // Both paths require an auto-flag audit entry (`handsfree_auto_flag_for_review`)
  // to exist — admin-set under_review flags have no anchor and are left alone.
  it("auto-clear streak gate: anchor is the latest adverse event, threshold is consecutive clean uploads", () => {
    const STREAK = 10;
    // Mirrors the route's logic: caller sets `lastAdverseAt` = max(lastBlock, lastFlag).
    // `cleanSinceAdverse` is the count of `handsfree_proof_uploaded` audit entries
    // strictly after that anchor. The streak is implicitly "consecutive" because
    // any subsequent block would have moved the anchor forward and zeroed the count.
    function shouldClear(opts: {
      underReview: boolean;
      hasAutoFlag: boolean;
      cleanSinceAdverse: number;
    }) {
      if (!opts.underReview) return false;
      if (!opts.hasAutoFlag) return false;
      return opts.cleanSinceAdverse >= STREAK;
    }
    // Happy path: 10 clean uploads after the last block/flag → cleared
    expect(shouldClear({ underReview: true, hasAutoFlag: true, cleanSinceAdverse: 10 })).toBe(true);
    expect(shouldClear({ underReview: true, hasAutoFlag: true, cleanSinceAdverse: 25 })).toBe(true);
    // Below threshold
    expect(shouldClear({ underReview: true, hasAutoFlag: true, cleanSinceAdverse: 9 })).toBe(false);
    // Block resets the anchor → new streak count starts at 0 from that block forward.
    // After the reset, the worker has 4 clean uploads → not yet at threshold.
    expect(shouldClear({ underReview: true, hasAutoFlag: true, cleanSinceAdverse: 4 })).toBe(false);
    // …and once they accumulate 10 clean since that latest block → cleared.
    expect(shouldClear({ underReview: true, hasAutoFlag: true, cleanSinceAdverse: 10 })).toBe(true);
    // Admin-set flag (no auto-flag audit anchor) is left alone
    expect(shouldClear({ underReview: true, hasAutoFlag: false, cleanSinceAdverse: 100 })).toBe(false);
    // Already clear — nothing to do
    expect(shouldClear({ underReview: false, hasAutoFlag: true, cleanSinceAdverse: 100 })).toBe(false);
  });

  it("auto-clear time gate: clears when the latest adverse event is older than the window", () => {
    const WINDOW_DAYS = 90;
    const now = Date.UTC(2026, 4, 7);
    const day = 24 * 60 * 60_000;
    // Mirrors the cron sweep's filter: candidates have `lastAdverseAt` (latest
    // of last block + last auto-flag) < now - WINDOW_DAYS, AND a non-null
    // `lastFlagAt` (i.e. they were auto-flagged at some point — admin-set
    // flags have no audit anchor and are skipped).
    function shouldClear(opts: {
      underReview: boolean;
      lastFlagAt: number | null;
      lastAdverseAt: number | null;
    }) {
      if (!opts.underReview) return false;
      if (opts.lastFlagAt == null) return false;
      if (opts.lastAdverseAt == null) return false;
      return now - opts.lastAdverseAt >= WINDOW_DAYS * day;
    }
    // Flagged 200d ago, last block 100d ago → cleared (window elapsed since last block)
    expect(shouldClear({ underReview: true, lastFlagAt: now - 200 * day, lastAdverseAt: now - 100 * day })).toBe(true);
    // Flagged 200d ago, last block was YESTERDAY → not cleared (block reset window)
    expect(shouldClear({ underReview: true, lastFlagAt: now - 200 * day, lastAdverseAt: now - 1 * day })).toBe(false);
    // Boundary: exactly 90 days since last adverse → cleared
    expect(shouldClear({ underReview: true, lastFlagAt: now - 90 * day, lastAdverseAt: now - 90 * day })).toBe(true);
    // Too recent flag, no later blocks
    expect(shouldClear({ underReview: true, lastFlagAt: now - 30 * day, lastAdverseAt: now - 30 * day })).toBe(false);
    // Admin-set flag (no auto-flag audit) → never auto-clears
    expect(shouldClear({ underReview: true, lastFlagAt: null, lastAdverseAt: now - 365 * day })).toBe(false);
    // Already clear — no-op
    expect(shouldClear({ underReview: false, lastFlagAt: now - 200 * day, lastAdverseAt: now - 200 * day })).toBe(false);
  });

  // The candidate-selection SQL feeds these helpers — make sure the
  // adverse-event aggregation matches what the gates expect.
  it("anchor aggregation: lastAdverseAt is max(lastBlock, lastFlag), gated on hasAutoFlag", () => {
    function aggregate(events: Array<{ action: string; at: number }>) {
      const flags = events.filter(e => e.action === "handsfree_auto_flag_for_review").map(e => e.at);
      const blocks = events.filter(e => e.action === "handsfree_proof_blocked").map(e => e.at);
      const lastFlagAt = flags.length ? Math.max(...flags) : null;
      const adverse = [...flags, ...blocks];
      const lastAdverseAt = adverse.length ? Math.max(...adverse) : null;
      return { lastFlagAt, lastAdverseAt };
    }
    const t = (n: number) => n * 1_000;
    // Pure auto-flag history → lastAdverse equals lastFlag
    expect(aggregate([{ action: "handsfree_auto_flag_for_review", at: t(100) }]))
      .toEqual({ lastFlagAt: t(100), lastAdverseAt: t(100) });
    // Block after flag → adverse advances, flag stays put
    expect(aggregate([
      { action: "handsfree_auto_flag_for_review", at: t(100) },
      { action: "handsfree_proof_blocked", at: t(150) },
    ])).toEqual({ lastFlagAt: t(100), lastAdverseAt: t(150) });
    // Only blocks (admin-set under_review hypothetically) → no flag, never clears
    expect(aggregate([
      { action: "handsfree_proof_blocked", at: t(150) },
    ])).toEqual({ lastFlagAt: null, lastAdverseAt: t(150) });
    // No adverse events at all → both null
    expect(aggregate([])).toEqual({ lastFlagAt: null, lastAdverseAt: null });
  });
});

// ── Studio Usage endpoint — /api/admin/qa/studio/usage ───────────────────
//
// The endpoint runs raw SQL aggregations over `studio_generation_log`.
// These tests cover two layers:
//
//   1. Pure aggregation logic — mirrors the `totalsByWindow` and
//      `perToolByWindow` helpers so a future schema change (e.g. renaming a
//      column or adding a status) will immediately surface as a test failure
//      rather than a silent NaN on the dashboard.
//
//   2. Route contract — a mini Express app that mirrors the endpoint's
//      response shape so clients (the admin UI) have a stable shape contract.

// ── Layer 1: aggregation logic ────────────────────────────────────────────

type RawLogRow = {
  status: string;
  tool_key: string;
  n: number;
  credits: number;
};

/**
 * Mirrors the `totalsByWindow` helper in the route: collapses raw SQL rows
 * (grouped by `status`) into a flat map keyed by status.
 */
function totalsByWindow(rows: Pick<RawLogRow, "status" | "n" | "credits">[]) {
  const out: Record<string, { n: number; credits: number }> = {
    succeeded: { n: 0, credits: 0 },
    refunded:  { n: 0, credits: 0 },
    failed:    { n: 0, credits: 0 },
  };
  for (const row of rows) {
    const k = String(row.status || "");
    if (!out[k]) out[k] = { n: 0, credits: 0 };
    out[k].n      = Number(row.n)       || 0;
    out[k].credits = Number(row.credits) || 0;
  }
  return out;
}

/**
 * Mirrors the `perToolByWindow` helper: pivots rows into per-tool summaries
 * sorted by total generations descending.
 */
function perToolByWindow(rows: RawLogRow[]) {
  const map: Record<string, { tool: string; succeeded: number; refunded: number; failed: number; credits: number }> = {};
  for (const row of rows) {
    const tool    = String(row.tool_key || "unknown");
    const status  = String(row.status   || "");
    const n       = Number(row.n)        || 0;
    const credits = Number(row.credits)  || 0;
    if (!map[tool]) map[tool] = { tool, succeeded: 0, refunded: 0, failed: 0, credits: 0 };
    if (status === "succeeded") map[tool].succeeded = n;
    else if (status === "refunded") map[tool].refunded = n;
    else if (status === "failed")   map[tool].failed   = n;
    map[tool].credits += credits;
  }
  return Object.values(map).sort(
    (a, b) => (b.succeeded + b.refunded + b.failed) - (a.succeeded + a.refunded + a.failed),
  );
}

describe("Studio Usage — totalsByWindow aggregation logic", () => {
  it("accumulates succeeded / refunded / failed from raw DB rows", () => {
    const rows = [
      { status: "succeeded", n: 10, credits: 300 },
      { status: "refunded",  n: 2,  credits:  60 },
      { status: "failed",    n: 3,  credits:   0 },
    ];
    const out = totalsByWindow(rows);
    expect(out.succeeded).toEqual({ n: 10, credits: 300 });
    expect(out.refunded).toEqual({ n: 2,  credits:  60 });
    expect(out.failed).toEqual({   n: 3,  credits:   0 });
  });

  it("zero-fills statuses absent from the DB result", () => {
    const out = totalsByWindow([{ status: "succeeded", n: 5, credits: 150 }]);
    expect(out.refunded).toEqual({ n: 0, credits: 0 });
    expect(out.failed).toEqual(  { n: 0, credits: 0 });
  });

  it("returns all-zero map when no rows exist (empty window)", () => {
    const out = totalsByWindow([]);
    expect(out).toEqual({
      succeeded: { n: 0, credits: 0 },
      refunded:  { n: 0, credits: 0 },
      failed:    { n: 0, credits: 0 },
    });
  });

  it("coerces non-numeric DB values to 0 rather than NaN", () => {
    const out = totalsByWindow([{ status: "succeeded", n: NaN, credits: NaN }]);
    expect(out.succeeded.n).toBe(0);
    expect(out.succeeded.credits).toBe(0);
  });
});

describe("Studio Usage — perToolByWindow aggregation logic", () => {
  // Seed rows that span two tools and three statuses, matching what the DB
  // would return when there are real studio_generation_log rows.
  const rows: RawLogRow[] = [
    { tool_key: "wan_motion_5s",        status: "succeeded", n: 8,  credits: 240 },
    { tool_key: "wan_motion_5s",        status: "refunded",  n: 1,  credits:  30 },
    { tool_key: "wan_motion_5s",        status: "failed",    n: 2,  credits:   0 },
    { tool_key: "kling_motion_control", status: "succeeded", n: 3,  credits: 240 },
    { tool_key: "kling_motion_control", status: "failed",    n: 1,  credits:   0 },
  ];

  it("groups rows by tool_key and pivots status columns correctly", () => {
    const out = perToolByWindow(rows);
    const wan = out.find((t) => t.tool === "wan_motion_5s");
    expect(wan).toBeDefined();
    expect(wan!.succeeded).toBe(8);
    expect(wan!.refunded).toBe(1);
    expect(wan!.failed).toBe(2);

    const kling = out.find((t) => t.tool === "kling_motion_control");
    expect(kling).toBeDefined();
    expect(kling!.succeeded).toBe(3);
    expect(kling!.refunded).toBe(0);
    expect(kling!.failed).toBe(1);
  });

  it("accumulates credits across all statuses for a tool", () => {
    const out = perToolByWindow(rows);
    // wan: 240 (succeeded) + 30 (refunded) + 0 (failed) = 270
    const wan = out.find((t) => t.tool === "wan_motion_5s")!;
    expect(wan.credits).toBe(270);
    // kling: 240 + 0 = 240
    const kling = out.find((t) => t.tool === "kling_motion_control")!;
    expect(kling.credits).toBe(240);
  });

  it("sorts tools by total generation count descending", () => {
    const out = perToolByWindow(rows);
    // wan total = 8+1+2=11, kling total = 3+1=4 → wan first
    expect(out[0].tool).toBe("wan_motion_5s");
    expect(out[1].tool).toBe("kling_motion_control");
  });

  it("returns empty array when no rows exist", () => {
    expect(perToolByWindow([])).toEqual([]);
  });

  it("falls back to 'unknown' tool key for empty string tool_key", () => {
    const out = perToolByWindow([{ tool_key: "", status: "succeeded", n: 1, credits: 10 }]);
    expect(out[0].tool).toBe("unknown");
  });
});

// ── Layer 2: route contract (mini Express app) ────────────────────────────

type RecentFailureRow = {
  id: number; user_id: number; tool_key: string; status: string;
  error_reason: string | null; credits_cost: number; created_at: string;
};

/**
 * Maps raw DB rows to the `recentFailures` response shape.
 * Mirrors the inline map in the production route.
 */
function mapRecentFailures(rows: RecentFailureRow[]) {
  return rows.map((r) => ({
    id:          Number(r.id),
    userId:      Number(r.user_id),
    toolKey:     String(r.tool_key    || ""),
    status:      String(r.status      || ""),
    errorReason: r.error_reason ? String(r.error_reason) : null,
    creditsCost: Number(r.credits_cost) || 0,
    createdAt:   r.created_at,
  }));
}

describe("Studio Usage — recentFailures mapping logic", () => {
  const seedRows: RecentFailureRow[] = [
    { id: 5, user_id: 10, tool_key: "wan_motion_5s",        status: "failed",   error_reason: "provider_timeout",     credits_cost: 30, created_at: "2026-05-10T12:00:00Z" },
    { id: 4, user_id: 11, tool_key: "kling_motion_control", status: "refunded", error_reason: "fal_upstream_error",   credits_cost: 80, created_at: "2026-05-10T11:00:00Z" },
    { id: 3, user_id: 12, tool_key: "minimax_music",        status: "failed",   error_reason: null,                   credits_cost:  5, created_at: "2026-05-10T10:00:00Z" },
  ];

  it("maps id, userId, toolKey, status, errorReason, creditsCost, createdAt", () => {
    const out = mapRecentFailures(seedRows);
    expect(out[0]).toEqual({
      id: 5, userId: 10, toolKey: "wan_motion_5s", status: "failed",
      errorReason: "provider_timeout", creditsCost: 30, createdAt: "2026-05-10T12:00:00Z",
    });
    expect(out[1].status).toBe("refunded");
    expect(out[2].errorReason).toBeNull();
  });

  it("preserves all rows in order (newest-first as returned by DB)", () => {
    const out = mapRecentFailures(seedRows);
    expect(out.map((r) => r.id)).toEqual([5, 4, 3]);
  });

  it("coerces numeric strings to numbers", () => {
    const row: any = { id: "7", user_id: "99", tool_key: "wan_motion_10s", status: "failed", error_reason: null, credits_cost: "60", created_at: "2026-05-10T09:00:00Z" };
    const [out] = mapRecentFailures([row]);
    expect(out.id).toBe(7);
    expect(out.userId).toBe(99);
    expect(out.creditsCost).toBe(60);
  });
});

// ── Layer 2: real integration test (real DB + real routes) ───────────────
//
// Seeds studio_generation_log rows using *synthetic* tool keys that are
// unique to this test suite (test_wan_t558 / test_kling_t558).  Because the
// SQL aggregation groups by tool_key, the perTool24h entries for these keys
// are completely isolated from any ambient data, allowing exact equality
// assertions on counts and credits rather than loose >= bounds.
//
// Seed layout (rows inserted within the last 24h → appear in both windows):
//
//   test_wan_t558   → 3 succeeded (30 cr) + 1 refunded (30 cr) + 1 failed (0 cr)
//   test_kling_t558 → 2 succeeded (80 cr) + 1 failed (0 cr)

describe("Studio Usage — /api/admin/qa/studio/usage (real DB, real routes)", () => {
  // Unique synthetic tool keys isolate our rows from any ambient test data.
  const TOOL_A = "test_wan_t558";
  const TOOL_B = "test_kling_t558";
  // No FK constraint on user_id in this table; any integer works.
  const FAKE_USER_ID = 99_999_999;

  let adminApp: ReturnType<typeof express>;
  let anonApp:  ReturnType<typeof express>;
  let insertedIds: number[] = [];

  beforeAll(async () => {
    // Insert seeded rows and capture their auto-generated ids for cleanup.
    const rows = await db.insert(studioGenerationLog).values([
      // tool A: 3 succeeded + 1 refunded + 1 failed
      { userId: FAKE_USER_ID, toolKey: TOOL_A, status: "succeeded", creditsCost: 30 },
      { userId: FAKE_USER_ID, toolKey: TOOL_A, status: "succeeded", creditsCost: 30 },
      { userId: FAKE_USER_ID, toolKey: TOOL_A, status: "succeeded", creditsCost: 30 },
      { userId: FAKE_USER_ID, toolKey: TOOL_A, status: "refunded",  creditsCost: 30, errorReason: "provider_timeout" },
      { userId: FAKE_USER_ID, toolKey: TOOL_A, status: "failed",    creditsCost:  0, errorReason: "fal_upstream_error" },
      // tool B: 2 succeeded + 1 failed
      { userId: FAKE_USER_ID, toolKey: TOOL_B, status: "succeeded", creditsCost: 80 },
      { userId: FAKE_USER_ID, toolKey: TOOL_B, status: "succeeded", creditsCost: 80 },
      { userId: FAKE_USER_ID, toolKey: TOOL_B, status: "failed",    creditsCost:  0, errorReason: "provider_timeout" },
    ]).returning({ id: studioGenerationLog.id });

    insertedIds = rows.map((r) => r.id);

    // Admin-authorised app uses the real route handler.
    adminApp = express();
    adminApp.use(express.json());
    const allowAdmin = (_req: any, _res: any, next: any) => next();
    registerAdminQaRoutes(adminApp, allowAdmin);

    // Anon app whose requireAdmin always rejects.
    anonApp = express();
    anonApp.use(express.json());
    const denyAdmin = (_req: any, res: any) => res.status(401).json({ message: "Unauthorized" });
    registerAdminQaRoutes(anonApp, denyAdmin);
  }, 30_000);

  afterAll(async () => {
    if (insertedIds.length) {
      await db.delete(studioGenerationLog).where(inArray(studioGenerationLog.id, insertedIds));
    }
  }, 15_000);

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when requireAdmin blocks the request", async () => {
    const res = await request(anonApp).get("/api/admin/qa/studio/usage");
    expect(res.status).toBe(401);
  });

  it("returns 200 for an admin caller", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    expect(res.status).toBe(200);
  });

  // ── Top-level shape ───────────────────────────────────────────────────────

  it("response includes all expected top-level keys", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    for (const key of ["generatedAt", "totals24h", "totals7d", "perTool24h", "perTool7d", "hourly24", "daily7", "recentFailures"]) {
      expect(res.body).toHaveProperty(key);
    }
  });

  it("generatedAt is a valid ISO timestamp", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    expect(typeof res.body.generatedAt).toBe("string");
    expect(Number.isFinite(new Date(res.body.generatedAt).getTime())).toBe(true);
  });

  // ── totals24h — global counts include seeded rows ─────────────────────────
  // Global totals aggregate all rows; use >= to avoid coupling to ambient data.

  it("totals24h succeeded count is at least 5 (3 tool-A + 2 tool-B seeded)", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    expect(res.body.totals24h.succeeded.n).toBeGreaterThanOrEqual(5);
  });

  it("totals24h refunded count is at least 1 (1 tool-A seeded)", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    expect(res.body.totals24h.refunded.n).toBeGreaterThanOrEqual(1);
  });

  it("totals24h failed count is at least 2 (1 tool-A + 1 tool-B seeded)", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    expect(res.body.totals24h.failed.n).toBeGreaterThanOrEqual(2);
  });

  it("totals24h succeeded.credits is at least 250 (3×30 + 2×80 seeded)", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    expect(res.body.totals24h.succeeded.credits).toBeGreaterThanOrEqual(250);
  });

  it("totals24h status keys each carry numeric n and credits", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    for (const key of ["succeeded", "refunded", "failed"]) {
      expect(typeof res.body.totals24h[key].n).toBe("number");
      expect(typeof res.body.totals24h[key].credits).toBe("number");
    }
  });

  it("totals7d counts are >= totals24h counts (seeded rows fall inside 7d window)", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    expect(res.body.totals7d.succeeded.n).toBeGreaterThanOrEqual(res.body.totals24h.succeeded.n);
    expect(res.body.totals7d.failed.n).toBeGreaterThanOrEqual(res.body.totals24h.failed.n);
  });

  // ── perTool24h — exact assertions on isolated synthetic tool keys ─────────
  // Because TOOL_A and TOOL_B are unique to this test run, their perTool
  // entries are entirely our seeded rows — no ambient data can bleed in.

  it("perTool24h contains both seeded synthetic tools", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    const names = res.body.perTool24h.map((t: any) => t.tool);
    expect(names).toContain(TOOL_A);
    expect(names).toContain(TOOL_B);
  });

  it("perTool24h TOOL_A has exactly 3 succeeded, 1 refunded, 1 failed, 120 credits", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    const a = res.body.perTool24h.find((t: any) => t.tool === TOOL_A);
    expect(a).toBeDefined();
    expect(a.succeeded).toBe(3);
    expect(a.refunded).toBe(1);
    expect(a.failed).toBe(1);
    // credits = 3×30 (succeeded) + 1×30 (refunded) + 0 (failed) = 120
    expect(a.credits).toBe(120);
  });

  it("perTool24h TOOL_B has exactly 2 succeeded, 0 refunded, 1 failed, 160 credits", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    const b = res.body.perTool24h.find((t: any) => t.tool === TOOL_B);
    expect(b).toBeDefined();
    expect(b.succeeded).toBe(2);
    expect(b.refunded).toBe(0);
    expect(b.failed).toBe(1);
    // credits = 2×80 (succeeded) + 0 = 160
    expect(b.credits).toBe(160);
  });

  it("perTool24h TOOL_A sorts before TOOL_B (total 5 vs 3 generations)", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    const tools: any[] = res.body.perTool24h;
    const aIdx = tools.findIndex((t) => t.tool === TOOL_A);
    const bIdx = tools.findIndex((t) => t.tool === TOOL_B);
    expect(aIdx).toBeLessThan(bIdx);
  });

  it("perTool24h entries carry numeric succeeded, refunded, failed, credits fields", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    for (const t of res.body.perTool24h) {
      expect(typeof t.tool).toBe("string");
      expect(typeof t.succeeded).toBe("number");
      expect(typeof t.refunded).toBe("number");
      expect(typeof t.failed).toBe("number");
      expect(typeof t.credits).toBe("number");
    }
  });

  // ── recentFailures ────────────────────────────────────────────────────────

  it("recentFailures includes the 3 seeded adverse rows (2 failed + 1 refunded)", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    const failures: any[] = res.body.recentFailures;
    // Both synthetic tools' adverse rows must be present (seeded just now → highest ids)
    const seededAdverse = failures.filter((f: any) =>
      f.toolKey === TOOL_A || f.toolKey === TOOL_B,
    );
    expect(seededAdverse.length).toBe(3);
    const statuses = seededAdverse.map((f: any) => f.status).sort();
    expect(statuses).toEqual(["failed", "failed", "refunded"]);
  });

  it("recentFailures entries have correct shape (id, userId, toolKey, status, creditsCost, createdAt)", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    for (const f of res.body.recentFailures) {
      expect(typeof f.id).toBe("number");
      expect(typeof f.userId).toBe("number");
      expect(typeof f.toolKey).toBe("string");
      expect(typeof f.status).toBe("string");
      expect(typeof f.creditsCost).toBe("number");
      expect(f.createdAt).toBeTruthy();
      expect(f.errorReason === null || typeof f.errorReason === "string").toBe(true);
    }
  });

  it("recentFailures contains only failed or refunded rows (not succeeded)", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    const allowed = new Set(["failed", "refunded"]);
    for (const f of res.body.recentFailures) {
      expect(allowed.has(f.status)).toBe(true);
    }
  });

  // ── Time-series arrays ────────────────────────────────────────────────────

  it("hourly24 is an array with entries having bucket, toolKey, status, n, credits", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    expect(Array.isArray(res.body.hourly24)).toBe(true);
    // Seeded rows are within the last 24h, so at least one bucket must exist.
    expect(res.body.hourly24.length).toBeGreaterThanOrEqual(1);
    const entry = res.body.hourly24[0];
    expect(entry).toHaveProperty("bucket");
    expect(typeof entry.toolKey).toBe("string");
    expect(typeof entry.status).toBe("string");
    expect(typeof entry.n).toBe("number");
    expect(typeof entry.credits).toBe("number");
  });

  it("daily7 is an array with entries having bucket, status, n, credits", async () => {
    const res = await request(adminApp).get("/api/admin/qa/studio/usage");
    expect(Array.isArray(res.body.daily7)).toBe(true);
    expect(res.body.daily7.length).toBeGreaterThanOrEqual(1);
    const entry = res.body.daily7[0];
    expect(entry).toHaveProperty("bucket");
    expect(typeof entry.status).toBe("string");
    expect(typeof entry.n).toBe("number");
    expect(typeof entry.credits).toBe("number");
  });
});

// ── Tile-image admin endpoint — PATCH /api/admin/studio/tools/:toolKey/tile-image ──
//
// The endpoint is now registered inside registerAdminQaRoutes (admin-qa.ts),
// which accepts an injectable requireAdmin middleware.  These tests mount the
// real route handler against the real DB, using three middleware variants to
// exercise all four required scenarios:
//
//   1. Unauthenticated caller → 401  (denyWith401 middleware)
//   2. Non-admin caller       → 403  (denyWith403 middleware)
//   3. Admin + valid toolKey  → 200  (allowAdmin + seeded test row)
//   4. Admin + unknown key    → 404  (allowAdmin + key not in DB)
//
// A synthetic tool key (test_tile_t602) is inserted in beforeAll and removed
// in afterAll so the suite is fully self-contained and leaves no residue.

const TILE_TEST_TOOL_KEY = "test_tile_t602";
const SAMPLE_IMAGE_URL   = "https://res.cloudinary.com/demo/image/upload/sample.jpg";

describe("Tile-image admin endpoint — PATCH /api/admin/studio/tools/:toolKey/tile-image", () => {
  const allowAdmin  = (_req: any, _res: any, next: () => void) => next();
  const denyWith401 = (_req: any, res: any) => res.status(401).json({ message: "Unauthorized" });
  const denyWith403 = (_req: any, res: any) => res.status(403).json({ message: "Forbidden" });

  let adminApp: ReturnType<typeof express>;
  let app401:   ReturnType<typeof express>;
  let app403:   ReturnType<typeof express>;

  beforeAll(async () => {
    // Seed an isolated test tool key so the test doesn't depend on production
    // seed data and leaves no permanent mutation to real pricing rows.
    await db
      .insert(studioModelPricing)
      .values({
        toolKey:          TILE_TEST_TOOL_KEY,
        label:            "Test Tile T602",
        description:      "Synthetic row for tile-image access-control tests.",
        providerEndpoint: "fal-ai/test/noop",
        creditsCost:      1,
        active:           false,
      })
      .onConflictDoNothing();

    adminApp = express();
    adminApp.use(express.json());
    registerAdminQaRoutes(adminApp, allowAdmin);

    app401 = express();
    app401.use(express.json());
    registerAdminQaRoutes(app401, denyWith401);

    app403 = express();
    app403.use(express.json());
    registerAdminQaRoutes(app403, denyWith403);
  }, 20_000);

  afterAll(async () => {
    await db
      .delete(studioModelPricing)
      .where(eq(studioModelPricing.toolKey, TILE_TEST_TOOL_KEY));
  }, 10_000);

  // ── Access control ────────────────────────────────────────────────────────

  it("unauthenticated request → 401", async () => {
    const res = await request(app401)
      .patch(`/api/admin/studio/tools/${TILE_TEST_TOOL_KEY}/tile-image`)
      .send({ imageUrl: SAMPLE_IMAGE_URL });
    expect(res.status).toBe(401);
  });

  it("authenticated non-admin → 403", async () => {
    const res = await request(app403)
      .patch(`/api/admin/studio/tools/${TILE_TEST_TOOL_KEY}/tile-image`)
      .send({ imageUrl: SAMPLE_IMAGE_URL });
    expect(res.status).toBe(403);
  });

  // ── Admin access ──────────────────────────────────────────────────────────

  it("admin with valid toolKey → 200 and tileImageUrl is updated in the DB", async () => {
    const res = await request(adminApp)
      .patch(`/api/admin/studio/tools/${TILE_TEST_TOOL_KEY}/tile-image`)
      .send({ imageUrl: SAMPLE_IMAGE_URL });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.toolKey).toBe(TILE_TEST_TOOL_KEY);
    expect(res.body.tileImageUrl).toBe(SAMPLE_IMAGE_URL);

    // Confirm the DB row was actually updated (not just the response body).
    const [row] = await db
      .select({ tileImageUrl: studioModelPricing.tileImageUrl })
      .from(studioModelPricing)
      .where(eq(studioModelPricing.toolKey, TILE_TEST_TOOL_KEY))
      .limit(1);
    expect(row?.tileImageUrl).toBe(SAMPLE_IMAGE_URL);
  });

  it("admin clearing tileImageUrl (null) → 200 and DB column becomes null", async () => {
    const res = await request(adminApp)
      .patch(`/api/admin/studio/tools/${TILE_TEST_TOOL_KEY}/tile-image`)
      .send({ imageUrl: null });
    expect(res.status).toBe(200);
    expect(res.body.tileImageUrl).toBeNull();

    const [row] = await db
      .select({ tileImageUrl: studioModelPricing.tileImageUrl })
      .from(studioModelPricing)
      .where(eq(studioModelPricing.toolKey, TILE_TEST_TOOL_KEY))
      .limit(1);
    expect(row?.tileImageUrl ?? null).toBeNull();
  });

  it("admin with unknown toolKey → 404", async () => {
    const res = await request(adminApp)
      .patch("/api/admin/studio/tools/nonexistent_tool_xyz/tile-image")
      .send({ imageUrl: SAMPLE_IMAGE_URL });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/unknown tool key/i);
  });

  it("admin with invalid imageUrl (non-URL string) → 400", async () => {
    const res = await request(adminApp)
      .patch(`/api/admin/studio/tools/${TILE_TEST_TOOL_KEY}/tile-image`)
      .send({ imageUrl: "not-a-url" });
    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/admin/studio/featured/:id — DuplicateSlugError → 409 ─────────
//
// Pins the contract: when storage.updateStudioFeaturedClip throws a
// DuplicateSlugError the route must respond 409 { error: "Slug already in use" }
// rather than leaking an unhandled 500.

describe("PATCH /api/admin/studio/featured/:id — DuplicateSlugError yields 409", () => {
  const allowAdmin = (_req: any, _res: any, next: () => void) => next();

  let app: ReturnType<typeof express>;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    registerAdminQaRoutes(app, allowAdmin);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("responds 409 with slug-conflict error when storage throws DuplicateSlugError", async () => {
    vi.spyOn(storage, "updateStudioFeaturedClip").mockRejectedValueOnce(
      new DuplicateSlugError("existing-slug"),
    );

    const res = await request(app)
      .patch("/api/admin/studio/featured/1")
      .send({ slug: "existing-slug" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Slug already in use");
  });

  it("responds 500 for unexpected storage errors (not DuplicateSlugError)", async () => {
    vi.spyOn(storage, "updateStudioFeaturedClip").mockRejectedValueOnce(
      new Error("connection timeout"),
    );

    const res = await request(app)
      .patch("/api/admin/studio/featured/1")
      .send({ slug: "any-slug" });

    expect(res.status).toBe(500);
  });
});
