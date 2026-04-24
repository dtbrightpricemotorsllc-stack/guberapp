// Integration test for the /api/my-jobs scoping + sanitization contract.
// Spins up a minimal Express app that mirrors the production route logic
// (storage.getUserJobs → sanitizeJobForPublic per viewer) and asserts a
// third-party authenticated caller can never (a) see another user's jobs
// or (b) read poster-only price-intent / internal fields.

import { describe, it, expect, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import supertest from "supertest";
import {
  sanitizeJobForPublic,
  POSTER_ONLY_PRICE_FIELDS,
  POSTER_ONLY_INTERNAL_FIELDS,
} from "../sanitize-job";

const POSTER_ID = 100;
const HELPER_ID = 200;
const STRANGER_ID = 999;

interface FakeJob {
  id: number;
  postedById: number;
  assignedHelperId: number | null;
  status: string;
  isPaid: boolean;
  budget: number;
  helperPayout: number;
  platformFee: number;
  title: string;
  location: string;
  locationApprox: string;
  lat: number;
  lng: number;
  zip: string;
  autoIncreaseEnabled: boolean;
  autoIncreaseAmount: number;
  autoIncreaseMax: number;
  autoIncreaseIntervalMins: number;
  nextIncreaseAt: Date;
  boostSuggested: boolean;
  suggestedBudget: number;
  removedByAdminReason: string;
  stripePaymentIntentId: string;
  disputeNotes: string;
}

function makeFakeJob(overrides: Partial<FakeJob> = {}): FakeJob {
  return {
    id: 42,
    postedById: POSTER_ID,
    assignedHelperId: HELPER_ID,
    status: "active",
    isPaid: true,
    budget: 80,
    helperPayout: 70,
    platformFee: 10,
    title: "Mow lawn",
    location: "123 Real St, Springfield",
    locationApprox: "Springfield, IL",
    lat: 39.7817,
    lng: -89.6501,
    zip: "62704",
    autoIncreaseEnabled: true,
    autoIncreaseAmount: 5,
    autoIncreaseMax: 200,
    autoIncreaseIntervalMins: 30,
    nextIncreaseAt: new Date("2026-04-25T00:00:00Z"),
    boostSuggested: true,
    suggestedBudget: 95,
    removedByAdminReason: "internal-only",
    stripePaymentIntentId: "pi_secret_123",
    disputeNotes: "internal-only",
    ...overrides,
  };
}

function buildApp(allJobs: FakeJob[], opts: { isAdmin: (id: number) => boolean }) {
  const app = express();
  app.use(express.json());

  // Inject a viewer id via header so the test can swap identities.
  app.use((req, _res, next) => {
    const v = req.header("x-viewer-id");
    (req as any).viewerId = v ? parseInt(v, 10) : undefined;
    next();
  });

  // Mirror the production /api/my-jobs handler: scope by viewer id, then
  // sanitize each row from the viewer's perspective.
  app.get("/api/my-jobs", (req: Request, res: Response) => {
    const viewerId: number | undefined = (req as any).viewerId;
    if (!viewerId) return res.status(401).json({ message: "auth required" });
    const isAdmin = opts.isAdmin(viewerId);
    const mine = allJobs.filter(
      (j) => j.postedById === viewerId || j.assignedHelperId === viewerId,
    );
    const sanitized = mine.map((j) => sanitizeJobForPublic(j, viewerId, isAdmin));
    res.json(sanitized);
  });

  // Mirror /api/jobs/:id with the same sanitizer contract.
  app.get("/api/jobs/:id", (req: Request, res: Response) => {
    const viewerId: number | undefined = (req as any).viewerId;
    if (!viewerId) return res.status(401).json({ message: "auth required" });
    const isAdmin = opts.isAdmin(viewerId);
    const job = allJobs.find((j) => j.id === parseInt(req.params.id, 10));
    if (!job) return res.status(404).json({ message: "Job not found" });
    const isOwner = viewerId === job.postedById;
    const isHelper = viewerId === job.assignedHelperId;
    if (!isOwner && !isHelper && !isAdmin && (job.status === "draft" || !job.isPaid)) {
      return res.status(403).json({ message: "Job not available" });
    }
    res.json(sanitizeJobForPublic(job, viewerId, isAdmin));
  });

  return app;
}

describe("/api/my-jobs scoping + sanitization", () => {
  let app: ReturnType<typeof buildApp>;
  let jobs: FakeJob[];

  beforeEach(() => {
    jobs = [
      makeFakeJob({ id: 1 }), // posted by POSTER, accepted by HELPER
      makeFakeJob({ id: 2, postedById: STRANGER_ID + 1, assignedHelperId: null }),
    ];
    app = buildApp(jobs, { isAdmin: () => false });
  });

  it("a third-party authenticated user cannot see another user's posted job", async () => {
    const res = await supertest(app)
      .get("/api/my-jobs")
      .set("x-viewer-id", String(STRANGER_ID))
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it("the assigned helper sees the job but never the poster's price ladder or internal fields", async () => {
    const res = await supertest(app)
      .get("/api/my-jobs")
      .set("x-viewer-id", String(HELPER_ID))
      .expect(200);

    expect(res.body).toHaveLength(1);
    const job = res.body[0];
    for (const f of POSTER_ONLY_PRICE_FIELDS) {
      expect(job[f], `helper leaked ${f} via /api/my-jobs`).toBeUndefined();
    }
    for (const f of POSTER_ONLY_INTERNAL_FIELDS) {
      expect(job[f], `helper leaked internal ${f} via /api/my-jobs`).toBeUndefined();
    }
    // Platform fee is also hidden from helpers.
    expect(job.platformFee).toBeUndefined();
    // Helper still sees their payout amount.
    expect(job.helperPayout).toBe(70);
  });

  it("the poster receives the full job with auto-increase config intact", async () => {
    const res = await supertest(app)
      .get("/api/my-jobs")
      .set("x-viewer-id", String(POSTER_ID))
      .expect(200);

    expect(res.body).toHaveLength(1);
    const job = res.body[0];
    expect(job.autoIncreaseEnabled).toBe(true);
    expect(job.autoIncreaseMax).toBe(200);
    expect(job.suggestedBudget).toBe(95);
    expect(job.disputeNotes).toBe("internal-only");
  });

  it("a stranger calling /api/jobs/:id directly cannot read poster-only fields", async () => {
    const res = await supertest(app)
      .get("/api/jobs/1")
      .set("x-viewer-id", String(STRANGER_ID))
      .expect(200);

    for (const f of POSTER_ONLY_PRICE_FIELDS) {
      expect(res.body[f], `stranger leaked ${f} via /api/jobs/:id`).toBeUndefined();
    }
    for (const f of POSTER_ONLY_INTERNAL_FIELDS) {
      expect(res.body[f], `stranger leaked internal ${f} via /api/jobs/:id`).toBeUndefined();
    }
    // And no helper payout.
    expect(res.body.helperPayout).toBeUndefined();
  });

  it("an admin caller bypasses sanitization on /api/jobs/:id", async () => {
    const ADMIN_ID = 1;
    app = buildApp(jobs, { isAdmin: (id) => id === ADMIN_ID });
    const res = await supertest(app)
      .get("/api/jobs/1")
      .set("x-viewer-id", String(ADMIN_ID))
      .expect(200);

    expect(res.body.autoIncreaseEnabled).toBe(true);
    expect(res.body.autoIncreaseMax).toBe(200);
    expect(res.body.removedByAdminReason).toBe("internal-only");
    expect(res.body.lat).toBe(39.7817);
  });
});
