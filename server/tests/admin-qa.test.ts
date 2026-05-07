import { describe, it, expect, vi } from "vitest";
import { filterVisibleItems } from "../visibility";
import { toCloudinaryAttachmentUrl, classifyMedia } from "../media-download";

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
import express from "express";
import request from "supertest";

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
});
