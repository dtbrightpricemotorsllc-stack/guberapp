// Integration tests for Task #494 — V&I Satisfied/Retake review flow.
// Exercises the REAL Express routes registered by registerRoutes() with a
// mocked storage singleton. Asserts:
//   - POST /api/proof/:id/satisfy + /retake gating (V&I-only, ownership,
//     window, retake_requested re-review block, limit, reason)
//   - reliability counter targeting (helper poorProofCount on first retake;
//     poster excessiveRetakeCount only on crossing VI_RETAKE_LIMIT)
//   - cron purgeViProofMedia upserts task_history_summary BEFORE clearing
//     media, and the storage filter restricts to V&I jobs.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";

const POSTER_ID = 100;
const HELPER_ID = 200;
const STRANGER_ID = 999;
const ADMIN_ID = 5;
const FAKE_POSTER_JWT = "poster-jwt";
const FAKE_HELPER_JWT = "helper-jwt";
const FAKE_STRANGER_JWT = "stranger-jwt";
const FAKE_ADMIN_JWT = "admin-jwt";

const mockStorage = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  getJob: vi.fn(),
  updateJob: vi.fn(),
  getProofSubmission: vi.fn(),
  updateProofSubmission: vi.fn(),
  getProofsByJob: vi.fn(),
  createAuditLog: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock("../storage", () => ({ storage: mockStorage }));
vi.mock("../db", () => ({
  pool: { on: vi.fn(), query: vi.fn(), connect: vi.fn() },
  db: {},
}));
vi.mock("stripe", () => ({
  default: class MockStripe { constructor(_k: string, _o?: any) {} },
}));
vi.mock("connect-pg-simple", async () => {
  const sessionModule = await import("express-session");
  return { default: () => sessionModule.default.MemoryStore };
});
vi.mock("../jwt", () => ({
  generateJWT: vi.fn(),
  verifyJWT: (token: string) => {
    if (token === FAKE_POSTER_JWT) return { sub: POSTER_ID, email: "p@x" };
    if (token === FAKE_HELPER_JWT) return { sub: HELPER_ID, email: "h@x" };
    if (token === FAKE_STRANGER_JWT) return { sub: STRANGER_ID, email: "s@x" };
    if (token === FAKE_ADMIN_JWT) return { sub: ADMIN_ID, email: "a@x" };
    return null;
  },
}));
vi.mock("../push", () => ({
  notify: vi.fn().mockResolvedValue(undefined),
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
  saveSubscription: vi.fn(),
  removeSubscription: vi.fn(),
  saveApnsToken: vi.fn(),
  removeApnsToken: vi.fn(),
  saveFcmToken: vi.fn(),
  removeFcmToken: vi.fn(),
  sendPushBroadcast: vi.fn(),
  VAPID_PUBLIC_KEY: "",
}));
vi.mock("../demo-guard", () => ({
  demoGuard: (_req: any, _res: any, next: any) => next(),
  getDemoUserIds: () => new Set<number>(),
  isDemoUser: () => false,
  viewerCanSeeJobSync: () => true,
}));

import { registerRoutes } from "../routes";

const baseJob = (over: Partial<any> = {}) => ({
  id: 1,
  category: "Verify & Inspect",
  status: "proof_submitted",
  postedById: POSTER_ID,
  assignedHelperId: HELPER_ID,
  title: "Photo run",
  completedAt: null,
  viRetakeCount: 0,
  viRetakeReasons: [],
  ...over,
});
const baseProof = (over: Partial<any> = {}) => ({
  id: 11,
  jobId: 1,
  reviewDecision: "pending",
  reviewWindowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  retakeCount: 0,
  retakeReasons: [],
  imageUrls: '["a.jpg"]',
  videoUrl: "v.mp4",
  notes: "n",
  createdAt: new Date(),
  mediaPurgedAt: null,
  ...over,
});

describe("Task #494 — V&I review flow integration", () => {
  let agent: ReturnType<typeof supertest.agent>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStorage.getUser.mockImplementation(async (id: number) => {
      const baseUser = { id, role: "user", excessiveRetakeCount: 0, poorProofCount: 0 };
      if (id === ADMIN_ID) return { ...baseUser, role: "admin" };
      return baseUser;
    });
    mockStorage.updateUser.mockResolvedValue(undefined);
    mockStorage.updateJob.mockResolvedValue(undefined);
    mockStorage.updateProofSubmission.mockResolvedValue(undefined);
    mockStorage.createAuditLog.mockResolvedValue({ id: 1 });
    mockStorage.createNotification.mockResolvedValue(undefined);
    mockStorage.getProofsByJob.mockResolvedValue([]);

    const app = express();
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: false, limit: "10mb" }));
    const httpServer = createServer(app);
    await registerRoutes(httpServer, app);
    agent = supertest.agent(app);
  });

  describe("POST /api/proof/:id/satisfy", () => {
    it("400s when the parent job is NOT V&I", async () => {
      mockStorage.getProofSubmission.mockResolvedValue(baseProof());
      mockStorage.getJob.mockResolvedValue(baseJob({ category: "Lawn Care" }));
      const res = await agent
        .post("/api/proof/11/satisfy")
        .set("Authorization", `Bearer ${FAKE_POSTER_JWT}`)
        .expect(400);
      expect(res.body.message).toMatch(/V&I/);
      expect(mockStorage.updateProofSubmission).not.toHaveBeenCalled();
    });

    it("403s for a stranger (non-poster, non-admin)", async () => {
      mockStorage.getProofSubmission.mockResolvedValue(baseProof());
      mockStorage.getJob.mockResolvedValue(baseJob());
      await agent
        .post("/api/proof/11/satisfy")
        .set("Authorization", `Bearer ${FAKE_STRANGER_JWT}`)
        .expect(403);
      expect(mockStorage.updateProofSubmission).not.toHaveBeenCalled();
    });

    it("410s when the review window has expired", async () => {
      mockStorage.getProofSubmission.mockResolvedValue(
        baseProof({ reviewWindowExpiresAt: new Date(Date.now() - 1000) })
      );
      mockStorage.getJob.mockResolvedValue(baseJob());
      await agent
        .post("/api/proof/11/satisfy")
        .set("Authorization", `Bearer ${FAKE_POSTER_JWT}`)
        .expect(410);
      expect(mockStorage.updateProofSubmission).not.toHaveBeenCalled();
    });

    it("409s if already satisfied", async () => {
      mockStorage.getProofSubmission.mockResolvedValue(baseProof({ reviewDecision: "satisfied" }));
      mockStorage.getJob.mockResolvedValue(baseJob());
      await agent
        .post("/api/proof/11/satisfy")
        .set("Authorization", `Bearer ${FAKE_POSTER_JWT}`)
        .expect(409);
    });

    it("happy path: poster satisfies → updates proof + job + audit log", async () => {
      mockStorage.getProofSubmission.mockResolvedValue(baseProof());
      mockStorage.getJob.mockResolvedValue(baseJob());
      await agent
        .post("/api/proof/11/satisfy")
        .set("Authorization", `Bearer ${FAKE_POSTER_JWT}`)
        .expect(200);
      expect(mockStorage.updateProofSubmission).toHaveBeenCalledWith(11, expect.objectContaining({
        reviewDecision: "satisfied",
        reviewedBy: POSTER_ID,
      }));
      expect(mockStorage.updateJob).toHaveBeenCalledWith(1, expect.objectContaining({
        status: "completion_submitted",
        proofStatus: "approved",
      }));
      const auditCalls = mockStorage.createAuditLog.mock.calls.map((c) => c[0].action);
      expect(auditCalls).toContain("vi.proof.satisfied");
    });

    it("admin can satisfy on behalf of the poster", async () => {
      mockStorage.getProofSubmission.mockResolvedValue(baseProof());
      mockStorage.getJob.mockResolvedValue(baseJob());
      await agent
        .post("/api/proof/11/satisfy")
        .set("Authorization", `Bearer ${FAKE_ADMIN_JWT}`)
        .expect(200);
      expect(mockStorage.updateProofSubmission).toHaveBeenCalled();
    });
  });

  describe("POST /api/proof/:id/retake", () => {
    it("blocks re-retake of a row already in retake_requested", async () => {
      mockStorage.getProofSubmission.mockResolvedValue(baseProof({ reviewDecision: "retake_requested" }));
      mockStorage.getJob.mockResolvedValue(baseJob({ viRetakeCount: 1 }));
      const res = await agent
        .post("/api/proof/11/retake")
        .set("Authorization", `Bearer ${FAKE_POSTER_JWT}`)
        .send({ reason: "still blurry" })
        .expect(409);
      expect(res.body.message).toMatch(/wait for the helper/i);
      expect(mockStorage.updateProofSubmission).not.toHaveBeenCalled();
    });

    it("first retake: bumps HELPER poorProofCount, NOT poster excessiveRetakeCount", async () => {
      mockStorage.getProofSubmission.mockResolvedValue(baseProof());
      mockStorage.getJob.mockResolvedValue(baseJob({ viRetakeCount: 0 }));
      await agent
        .post("/api/proof/11/retake")
        .set("Authorization", `Bearer ${FAKE_POSTER_JWT}`)
        .send({})
        .expect(200);
      // Helper bumped on first retake
      const helperUpdate = mockStorage.updateUser.mock.calls.find((c) => c[0] === HELPER_ID);
      expect(helperUpdate).toBeTruthy();
      expect(helperUpdate![1]).toMatchObject({ poorProofCount: 1 });
      // Poster NOT bumped on first retake
      const posterUpdate = mockStorage.updateUser.mock.calls.find((c) => c[0] === POSTER_ID);
      expect(posterUpdate).toBeUndefined();
      // Job-level counter advanced
      expect(mockStorage.updateJob).toHaveBeenCalledWith(1, expect.objectContaining({
        viRetakeCount: 1,
        proofStatus: "retake_requested",
      }));
    });

    it("requires reason from second retake on", async () => {
      mockStorage.getProofSubmission.mockResolvedValue(baseProof());
      mockStorage.getJob.mockResolvedValue(baseJob({ viRetakeCount: 1, viRetakeReasons: ["a"] }));
      await agent
        .post("/api/proof/11/retake")
        .set("Authorization", `Bearer ${FAKE_POSTER_JWT}`)
        .send({})
        .expect(400);
    });

    it("third retake (crossing limit): bumps POSTER excessiveRetakeCount, NOT helper", async () => {
      mockStorage.getProofSubmission.mockResolvedValue(baseProof());
      mockStorage.getJob.mockResolvedValue(baseJob({ viRetakeCount: 2, viRetakeReasons: ["a", "b"] }));
      await agent
        .post("/api/proof/11/retake")
        .set("Authorization", `Bearer ${FAKE_POSTER_JWT}`)
        .send({ reason: "still not clear enough" })
        .expect(200);
      const posterUpdate = mockStorage.updateUser.mock.calls.find((c) => c[0] === POSTER_ID);
      expect(posterUpdate).toBeTruthy();
      expect(posterUpdate![1]).toMatchObject({ excessiveRetakeCount: 1 });
      // Helper not bumped on later retakes
      const helperUpdate = mockStorage.updateUser.mock.calls.find((c) => c[0] === HELPER_ID);
      expect(helperUpdate).toBeUndefined();
    });

    it("rejects further retakes once limit reached", async () => {
      mockStorage.getProofSubmission.mockResolvedValue(baseProof());
      mockStorage.getJob.mockResolvedValue(baseJob({ viRetakeCount: 3 }));
      await agent
        .post("/api/proof/11/retake")
        .set("Authorization", `Bearer ${FAKE_POSTER_JWT}`)
        .send({ reason: "x" })
        .expect(400);
    });

    it("400s on non-V&I jobs (proves V&I gate)", async () => {
      mockStorage.getProofSubmission.mockResolvedValue(baseProof());
      mockStorage.getJob.mockResolvedValue(baseJob({ category: "On-Demand Help" }));
      await agent
        .post("/api/proof/11/retake")
        .set("Authorization", `Bearer ${FAKE_POSTER_JWT}`)
        .send({ reason: "x" })
        .expect(400);
    });

    it("409s with dispute message when a dispute was opened", async () => {
      mockStorage.getProofSubmission.mockResolvedValue(baseProof());
      mockStorage.getJob.mockResolvedValue(baseJob({ disputeOpenedAt: new Date() }));
      const r = await agent
        .post("/api/proof/11/retake")
        .set("Authorization", `Bearer ${FAKE_POSTER_JWT}`)
        .send({ reason: "x" })
        .expect(409);
      expect(r.body.message).toMatch(/dispute/i);
    });

    it("satisfy is also blocked once a dispute is opened", async () => {
      mockStorage.getProofSubmission.mockResolvedValue(baseProof());
      mockStorage.getJob.mockResolvedValue(baseJob({ disputeOpenedAt: new Date() }));
      const r = await agent
        .post("/api/proof/11/satisfy")
        .set("Authorization", `Bearer ${FAKE_POSTER_JWT}`)
        .expect(409);
      expect(r.body.message).toMatch(/dispute/i);
      expect(mockStorage.updateProofSubmission).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/jobs/:id/proof-review-state", () => {
    it("returns windowOpen=true and canSatisfy=true for V&I poster within window", async () => {
      mockStorage.getJob.mockResolvedValue(baseJob());
      mockStorage.getProofsByJob.mockResolvedValue([baseProof()]);
      const res = await agent
        .get("/api/jobs/1/proof-review-state")
        .set("Authorization", `Bearer ${FAKE_POSTER_JWT}`)
        .expect(200);
      expect(res.body).toMatchObject({
        windowOpen: true,
        canSatisfy: true,
        canRetake: true,
        retakeLimit: 3,
        retakesUsed: 0,
      });
    });

    it("returns canSatisfy=false on non-V&I jobs", async () => {
      mockStorage.getJob.mockResolvedValue(baseJob({ category: "Lawn Care" }));
      mockStorage.getProofsByJob.mockResolvedValue([baseProof()]);
      const res = await agent
        .get("/api/jobs/1/proof-review-state")
        .set("Authorization", `Bearer ${FAKE_POSTER_JWT}`)
        .expect(200);
      expect(res.body.canSatisfy).toBe(false);
      expect(res.body.canRetake).toBe(false);
    });

    it("windowOpen=false when latest proof is in retake_requested (aligns with gate)", async () => {
      mockStorage.getJob.mockResolvedValue(baseJob());
      mockStorage.getProofsByJob.mockResolvedValue([baseProof({ reviewDecision: "retake_requested" })]);
      const res = await agent
        .get("/api/jobs/1/proof-review-state")
        .set("Authorization", `Bearer ${FAKE_POSTER_JWT}`)
        .expect(200);
      expect(res.body.windowOpen).toBe(false);
      expect(res.body.canSatisfy).toBe(false);
      expect(res.body.canRetake).toBe(false);
    });

    it("windowOpen=false once a dispute has been opened", async () => {
      mockStorage.getJob.mockResolvedValue(baseJob({ disputeOpenedAt: new Date() }));
      mockStorage.getProofsByJob.mockResolvedValue([baseProof()]);
      const res = await agent
        .get("/api/jobs/1/proof-review-state")
        .set("Authorization", `Bearer ${FAKE_POSTER_JWT}`)
        .expect(200);
      expect(res.body.windowOpen).toBe(false);
      expect(res.body.canSatisfy).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cron-level integration: purgeViProofMedia summary + media-clearing order.
// We mock storage + cloudinary so the function runs against in-memory data.
// ─────────────────────────────────────────────────────────────────────────────

const mockDestroy = vi.hoisted(() => ({ fn: vi.fn().mockResolvedValue({ ok: true, publicId: "x/y" }) }));
vi.mock("../cloudinary", () => ({
  destroyAsset: (...args: any[]) => mockDestroy.fn(...args),
  parseCloudinaryAsset: () => ({ resourceType: "image", publicId: "x/y" }),
}));

describe("Task #494 — purgeViProofMedia cron integration", () => {
  let upsertCalls: any[];
  let updateProofCalls: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockDestroy.fn.mockReset();
    mockDestroy.fn.mockResolvedValue({ ok: true, publicId: "x/y" });
    upsertCalls = [];
    updateProofCalls = [];
    Object.assign(mockStorage as any, {
      getProofsToPurgeMedia: vi.fn(),
      upsertTaskHistorySummary: vi.fn(async (data: any) => {
        upsertCalls.push({ time: Date.now(), data });
        return data;
      }),
      updateProofSubmission: vi.fn(async (id: number, data: any) => {
        updateProofCalls.push({ time: Date.now(), id, data });
        return undefined;
      }),
      getProofsByJob: vi.fn().mockResolvedValue([
        { id: 11, reviewDecision: "retake_requested" },
        { id: 12, reviewDecision: "auto_satisfied" },
      ]),
    });
  });

  it("upserts task_history_summary BEFORE clearing media and audit-logs the purge", async () => {
    const job = baseJob({
      status: "completed_paid",
      completedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      viRetakeCount: 1,
    });
    const proof = baseProof({ reviewDecision: "auto_satisfied", videoUrl: "https://res.cloudinary.com/c/video/upload/v1/x.mp4", imageUrls: '["https://res.cloudinary.com/c/image/upload/v1/y.jpg"]' });
    (mockStorage as any).getProofsToPurgeMedia.mockResolvedValue([proof]);
    mockStorage.getJob.mockResolvedValue(job);
    mockStorage.createAuditLog.mockResolvedValue({ id: 1 });

    const cron = await import("../cron");
    const purged = await cron.purgeViProofMedia();
    expect(purged).toBe(1);

    // Order check: summary upsert BEFORE media-clearing update.
    expect(upsertCalls).toHaveLength(1);
    expect(updateProofCalls).toHaveLength(1);
    expect(upsertCalls[0].time).toBeLessThanOrEqual(updateProofCalls[0].time);

    // Summary persists key V&I metadata.
    expect(upsertCalls[0].data).toMatchObject({
      jobId: 1,
      posterId: POSTER_ID,
      helperId: HELPER_ID,
      category: "Verify & Inspect",
      retakeCount: 1,
      proofCount: 2,
    });
    expect(upsertCalls[0].data.outcome).toMatch(/auto-satisfied/i);

    // The proof row was nulled across all media-bearing fields.
    expect(updateProofCalls[0].data).toMatchObject({
      imageUrls: null,
      videoUrl: null,
      notes: null,
      captureMeta: null,
      povSummary: null,
    });
    expect(updateProofCalls[0].data.mediaPurgedAt).toBeInstanceOf(Date);

    // Audit log written.
    const actions = mockStorage.createAuditLog.mock.calls.map((c: any) => c[0].action);
    expect(actions).toContain("vi.proof.media_purged");
  });

  it("multi-proof job: summary outcome reflects the LATEST proof and is upserted ONCE", async () => {
    // Regression: prior implementation upserted task_history_summary per
    // proof row, so iteration order could overwrite the final outcome
    // with an earlier (e.g. retake_requested) one. Now grouped by jobId
    // and derived from the latest proof.
    const job = baseJob({
      status: "completed_paid",
      completedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      viRetakeCount: 2,
    });
    const oldProof = baseProof({ reviewDecision: "retake_requested", videoUrl: "https://res.cloudinary.com/c/video/upload/v1/old.mp4" });
    const newProof = { ...baseProof({ reviewDecision: "auto_satisfied", videoUrl: "https://res.cloudinary.com/c/video/upload/v1/new.mp4" }), id: oldProof.id + 5 };
    (mockStorage as any).getProofsToPurgeMedia.mockResolvedValue([oldProof, newProof]);
    mockStorage.getJob.mockResolvedValue(job);
    (mockStorage as any).getProofsByJob.mockResolvedValue([oldProof, newProof]);
    mockStorage.createAuditLog.mockResolvedValue({ id: 1 });

    const cron = await import("../cron");
    const purged = await cron.purgeViProofMedia();

    // Both proofs scrubbed.
    expect(purged).toBe(2);
    expect(updateProofCalls).toHaveLength(2);

    // Summary upserted ONCE with the LATEST proof's outcome (auto_satisfied),
    // never overwritten by the retake_requested row.
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].data.proofReviewDecision).toBe("auto_satisfied");
    expect(upsertCalls[0].data.outcome).toMatch(/auto-satisfied/i);
    expect(upsertCalls[0].data.proofCount).toBe(2);
  });

  it("skips disputed jobs even if they slip through the storage filter", async () => {
    (mockStorage as any).getProofsToPurgeMedia.mockResolvedValue([baseProof()]);
    mockStorage.getJob.mockResolvedValue(baseJob({ status: "disputed", completedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) }));
    const cron = await import("../cron");
    const purged = await cron.purgeViProofMedia();
    expect(purged).toBe(0);
    expect(upsertCalls).toHaveLength(0);
    expect(updateProofCalls).toHaveLength(0);
  });

  it("skips jobs that EVER had a dispute opened (disputeOpenedAt set, status not disputed)", async () => {
    // Race: dispute was opened then resolved — job.status is now non-disputed
    // but disputeOpenedAt remains. Media must still be retained as evidence.
    (mockStorage as any).getProofsToPurgeMedia.mockResolvedValue([baseProof()]);
    mockStorage.getJob.mockResolvedValue(baseJob({
      status: "completed_paid",
      disputeOpenedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    }));
    const cron = await import("../cron");
    const purged = await cron.purgeViProofMedia();
    expect(purged).toBe(0);
    expect(upsertCalls).toHaveLength(0);
    expect(updateProofCalls).toHaveLength(0);
  });

  it("skips non-V&I jobs even if they slip through the storage filter", async () => {
    (mockStorage as any).getProofsToPurgeMedia.mockResolvedValue([baseProof()]);
    mockStorage.getJob.mockResolvedValue(baseJob({ category: "Lawn Care", completedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) }));
    const cron = await import("../cron");
    const purged = await cron.purgeViProofMedia();
    expect(purged).toBe(0);
    expect(upsertCalls).toHaveLength(0);
  });

  it("skips jobs whose completedAt is within the retention window", async () => {
    (mockStorage as any).getProofsToPurgeMedia.mockResolvedValue([baseProof()]);
    mockStorage.getJob.mockResolvedValue(baseJob({ completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) }));
    const cron = await import("../cron");
    const purged = await cron.purgeViProofMedia();
    expect(purged).toBe(0);
  });

  it("ALWAYS scrubs DB media + stamps mediaPurgedAt at 30d, even when Cloudinary fails (deadline-enforced)", async () => {
    // Policy: at the 30-day cutoff the DB-side scrub is unconditional —
    // sensitive proof detail must leave the application on schedule even
    // if the external delete API misbehaves. Orphaned remote assets are
    // tracked separately for out-of-band retry.
    mockDestroy.fn.mockResolvedValue({ ok: false, publicId: "x/y" });
    const proof = baseProof({
      reviewDecision: "auto_satisfied",
      videoUrl: "https://res.cloudinary.com/c/video/upload/v1/x.mp4",
      imageUrls: '["https://res.cloudinary.com/c/image/upload/v1/y.jpg"]',
    });
    (mockStorage as any).getProofsToPurgeMedia.mockResolvedValue([proof]);
    mockStorage.getJob.mockResolvedValue(baseJob({
      status: "completed_paid",
      completedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    }));
    mockStorage.createAuditLog.mockResolvedValue({ id: 1 });

    const cron = await import("../cron");
    const purged = await cron.purgeViProofMedia();
    expect(purged).toBe(1);

    // DB scrub is unconditional.
    expect(updateProofCalls).toHaveLength(1);
    expect(updateProofCalls[0].data.mediaPurgedAt).toBeInstanceOf(Date);
    expect(updateProofCalls[0].data.imageUrls).toBeNull();
    expect(updateProofCalls[0].data.videoUrl).toBeNull();
    expect(updateProofCalls[0].data.notes).toBeNull();
    expect(updateProofCalls[0].data.captureMeta).toBeNull();

    // Standard purge audit fires.
    const purgedCall = mockStorage.createAuditLog.mock.calls.find(
      (c: any) => c[0].action === "vi.proof.media_purged",
    );
    expect(purgedCall).toBeTruthy();

    // Orphan audit fires separately so retry job can pick it up.
    const orphanCall = mockStorage.createAuditLog.mock.calls.find(
      (c: any) => c[0].action === "vi.proof.cloudinary_orphan_pending",
    );
    expect(orphanCall).toBeTruthy();
    const orphan = JSON.parse(orphanCall![0].details);
    expect(orphan.failedCount).toBeGreaterThan(0);
    expect(orphan.failedUrls).toBeTruthy();

    // Summary metadata still records failed URL count for visibility.
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].data.metadata.failedAssets).toBeGreaterThan(0);
    expect(upsertCalls[0].data.metadata.failedUrls).toBeTruthy();
  });
});
