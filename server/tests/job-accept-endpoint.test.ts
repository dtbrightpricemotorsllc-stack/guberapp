/**
 * job-accept-endpoint.test.ts
 *
 * Integration tests for POST /api/jobs/:id/accept — proximity gate.
 *
 * Exercises the REAL Express stack (registerRoutes) with a mocked storage
 * singleton and confirms the three critical paths with the actual client
 * request contract (workerLat / workerLng in the request body):
 *
 *   1. Worker > 20 miles + ASAP/urgent job           → 403 OUTSIDE_AREA
 *   2. Worker > 20 miles + scheduled/appointment job → 200 (exempt)
 *   3. Worker < 20 miles + ASAP/urgent job           → 200 (within range)
 *   4. No GPS coords + ASAP job                      → 200 (fail-open)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";

// ── Fixtures ─────────────────────────────────────────────────────────────────
const POSTER_ID = 10;
const WORKER_ID = 20;
const WORKER_JWT = "worker-endpoint-test-jwt";

// Mobile, AL — matches seed data used in unit tests
const JOB_LAT = 30.6954;
const JOB_LNG = -88.0399;

// ~25 miles north of Mobile — clearly outside the 20-mile gate
const WORKER_FAR_LAT = 31.0621;
const WORKER_FAR_LNG = -88.0399;

// ~5 miles north of Mobile — clearly inside the 20-mile gate
const WORKER_NEAR_LAT = 30.7681;
const WORKER_NEAR_LNG = -88.0399;

// ── Mock: storage ─────────────────────────────────────────────────────────────
const mockStorage = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  getJob: vi.fn(),
  updateJob: vi.fn(),
  createAssignment: vi.fn(),
  createNotification: vi.fn(),
  getCatalogServiceTypes: vi.fn(),
  getServiceTypesByCategory: vi.fn(),
}));

vi.mock("../storage", () => ({ storage: mockStorage }));

vi.mock("../db", () => ({
  pool: { on: vi.fn(), query: vi.fn(), connect: vi.fn() },
  db: {},
}));

vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(_key: string, _opts?: any) {}
  },
}));

vi.mock("connect-pg-simple", async () => {
  const sessionModule = await import("express-session");
  return { default: () => sessionModule.default.MemoryStore };
});

vi.mock("../jwt", () => ({
  generateJWT: vi.fn(),
  verifyJWT: (token: string) =>
    token === WORKER_JWT ? { sub: WORKER_ID, email: "worker@example.com" } : null,
}));

vi.mock("../push", () => ({
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

vi.mock("../notify-helpers", () => ({
  notifyNearbyAvailableWorkers: vi.fn().mockResolvedValue(undefined),
}));

import { registerRoutes } from "../routes";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWorker(overrides: Partial<any> = {}): any {
  return {
    id: WORKER_ID,
    email: "worker@example.com",
    role: "user",
    tier: "community",
    suspended: false,
    banned: false,
    deletedAt: null,
    idVerified: true,
    stripeAccountStatus: "active",
    liabilityDisclaimerAcceptedAt: new Date("2024-01-01"),
    jobsAccepted: 0,
    fullName: "Test Worker",
    handsfreeBlockedAttempts: 0,
    ...overrides,
  };
}

function makePoster(): any {
  return {
    id: POSTER_ID,
    email: "poster@example.com",
    role: "user",
    suspended: false,
    banned: false,
    deletedAt: null,
  };
}

function makeJob(overrides: Partial<any> = {}): any {
  return {
    id: 1,
    status: "posted_public",
    postedById: POSTER_ID,
    assignedHelperId: null,
    category: "Moving Help",
    urgentSwitch: false,
    isBounty: false,
    lat: JOB_LAT,
    lng: JOB_LNG,
    budget: 50,
    title: "Help move a couch",
    availabilityWindows: null,
    jobDetails: null,
    scheduledAt: null,
    serviceType: null,
    verifyInspectCategory: null,
    catalogServiceTypeName: null,
    autoIncreaseEnabled: false,
    nextIncreaseAt: null,
    ...overrides,
  };
}

/** Build a valid accept request body. Pass workerLat/workerLng to include GPS. */
function acceptBody(workerLat?: number, workerLng?: number): any {
  const now = Date.now();
  const body: any = {
    waiverAccepted: true,
    availableFrom: new Date(now + 60_000).toISOString(),   // 1 minute from now
    availableTo: new Date(now + 3_600_000).toISOString(),  // 1 hour from now
    timezone: "America/New_York",
  };
  if (workerLat != null) body.workerLat = workerLat;
  if (workerLng != null) body.workerLng = workerLng;
  return body;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/jobs/:id/accept — proximity gate (endpoint integration)", () => {
  let agent: ReturnType<typeof supertest.agent>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // storage.getUser must return the right user for each id that routes.ts
    // queries (soft-delete gate, checkSuspended, helper lookup, viewerIsAdmin).
    mockStorage.getUser.mockImplementation(async (id: number) => {
      if (id === WORKER_ID) return makeWorker();
      if (id === POSTER_ID) return makePoster();
      return undefined;
    });

    mockStorage.updateUser.mockResolvedValue(undefined);

    // updateJob is called by the accept route; return the merged job so
    // respondJob → sanitizeJobForPublic has a real object to work with.
    mockStorage.updateJob.mockImplementation(async (_id: number, changes: any) =>
      makeJob(changes ?? {}),
    );

    mockStorage.createAssignment.mockResolvedValue({ id: 99 });
    mockStorage.createNotification.mockResolvedValue(undefined);
    mockStorage.getCatalogServiceTypes.mockResolvedValue([]);
    mockStorage.getServiceTypesByCategory.mockResolvedValue([]);

    const app = express();
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: false, limit: "10mb" }));
    const httpServer = createServer(app);
    await registerRoutes(httpServer, app);
    agent = supertest.agent(app);
  });

  // ── Path 1: far worker + ASAP / urgent job → 403 ─────────────────────────

  it("Path 1a: far worker + urgentSwitch job → 403 OUTSIDE_AREA", async () => {
    mockStorage.getJob.mockResolvedValue(makeJob({ urgentSwitch: true }));

    const res = await agent
      .post("/api/jobs/1/accept")
      .set("Authorization", `Bearer ${WORKER_JWT}`)
      .send(acceptBody(WORKER_FAR_LAT, WORKER_FAR_LNG))
      .expect(403);

    expect(res.body.message).toBe("OUTSIDE_AREA");
    // Confirm the route returned before touching the DB
    expect(mockStorage.updateJob).not.toHaveBeenCalled();
    expect(mockStorage.createAssignment).not.toHaveBeenCalled();
  });

  it("Path 1b: far worker + On-Demand Help category → 403 OUTSIDE_AREA", async () => {
    mockStorage.getJob.mockResolvedValue(makeJob({ category: "On-Demand Help" }));

    const res = await agent
      .post("/api/jobs/1/accept")
      .set("Authorization", `Bearer ${WORKER_JWT}`)
      .send(acceptBody(WORKER_FAR_LAT, WORKER_FAR_LNG))
      .expect(403);

    expect(res.body.message).toBe("OUTSIDE_AREA");
    expect(mockStorage.updateJob).not.toHaveBeenCalled();
  });

  it("Path 1c: far worker + jobDetails.timeType=ASAP → 403 OUTSIDE_AREA", async () => {
    mockStorage.getJob.mockResolvedValue(
      makeJob({ urgentSwitch: false, category: "Moving Help", jobDetails: { timeType: "ASAP" } }),
    );

    const res = await agent
      .post("/api/jobs/1/accept")
      .set("Authorization", `Bearer ${WORKER_JWT}`)
      .send(acceptBody(WORKER_FAR_LAT, WORKER_FAR_LNG))
      .expect(403);

    expect(res.body.message).toBe("OUTSIDE_AREA");
    expect(mockStorage.updateJob).not.toHaveBeenCalled();
  });

  // ── Path 2: far worker + scheduled/appointment job → 200 (exempt) ─────────

  it("Path 2a: far worker + scheduled appointment job (timeType=scheduled) → accepted", async () => {
    mockStorage.getJob.mockResolvedValue(
      makeJob({
        urgentSwitch: false,
        category: "Moving Help",
        jobDetails: { timeType: "scheduled" },
      }),
    );

    const res = await agent
      .post("/api/jobs/1/accept")
      .set("Authorization", `Bearer ${WORKER_JWT}`)
      .send(acceptBody(WORKER_FAR_LAT, WORKER_FAR_LNG))
      .expect(200);

    // Proximity check must have been bypassed (no OUTSIDE_AREA)
    expect(res.body.message).not.toBe("OUTSIDE_AREA");
    expect(mockStorage.updateJob).toHaveBeenCalled();
    expect(mockStorage.createAssignment).toHaveBeenCalled();
  });

  it("Path 2b: far worker + standard non-urgent job (no ASAP flag) → accepted", async () => {
    mockStorage.getJob.mockResolvedValue(
      makeJob({ urgentSwitch: false, category: "Lawn & Yard", jobDetails: null }),
    );

    await agent
      .post("/api/jobs/1/accept")
      .set("Authorization", `Bearer ${WORKER_JWT}`)
      .send(acceptBody(WORKER_FAR_LAT, WORKER_FAR_LNG))
      .expect(200);

    expect(mockStorage.updateJob).toHaveBeenCalled();
  });

  // ── Path 3: nearby worker + ASAP job → 200 ───────────────────────────────

  it("Path 3: nearby worker + urgentSwitch job → accepted", async () => {
    mockStorage.getJob.mockResolvedValue(makeJob({ urgentSwitch: true }));

    await agent
      .post("/api/jobs/1/accept")
      .set("Authorization", `Bearer ${WORKER_JWT}`)
      .send(acceptBody(WORKER_NEAR_LAT, WORKER_NEAR_LNG))
      .expect(200);

    expect(mockStorage.updateJob).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: "accepted_pending_payment" }),
    );
    expect(mockStorage.createAssignment).toHaveBeenCalled();
  });

  // ── Edge: no GPS coords sent → fail-open ─────────────────────────────────

  it("No GPS sent + ASAP job → accepted (gate fails-open when coords absent)", async () => {
    mockStorage.getJob.mockResolvedValue(makeJob({ urgentSwitch: true }));

    await agent
      .post("/api/jobs/1/accept")
      .set("Authorization", `Bearer ${WORKER_JWT}`)
      .send(acceptBody())   // ← no workerLat / workerLng
      .expect(200);

    expect(mockStorage.updateJob).toHaveBeenCalled();
  });

  // ── Malformed coordinates — validation prevents NaN bypass ───────────────
  // If the client sends a non-numeric value, JavaScript coerces it to NaN
  // inside haversine; NaN > limit is false, which would silently pass a far
  // worker through. The gate must treat any malformed pair as absent → fail-open.

  it("String workerLat + ASAP job → treated as absent, accepted (fail-open)", async () => {
    mockStorage.getJob.mockResolvedValue(makeJob({ urgentSwitch: true }));

    await agent
      .post("/api/jobs/1/accept")
      .set("Authorization", `Bearer ${WORKER_JWT}`)
      .send({ ...acceptBody(), workerLat: "far-away", workerLng: WORKER_FAR_LNG })
      .expect(200);  // fail-open, not 403

    expect(mockStorage.updateJob).toHaveBeenCalled();
  });

  it("Only workerLat sent (no workerLng) + ASAP job → treated as absent, accepted (fail-open)", async () => {
    mockStorage.getJob.mockResolvedValue(makeJob({ urgentSwitch: true }));

    await agent
      .post("/api/jobs/1/accept")
      .set("Authorization", `Bearer ${WORKER_JWT}`)
      .send({ ...acceptBody(), workerLat: WORKER_FAR_LAT })  // ← lng missing
      .expect(200);

    expect(mockStorage.updateJob).toHaveBeenCalled();
  });

  it("Out-of-range workerLat (> 90) + ASAP job → treated as absent, accepted (fail-open)", async () => {
    mockStorage.getJob.mockResolvedValue(makeJob({ urgentSwitch: true }));

    await agent
      .post("/api/jobs/1/accept")
      .set("Authorization", `Bearer ${WORKER_JWT}`)
      .send({ ...acceptBody(), workerLat: 999, workerLng: WORKER_FAR_LNG })
      .expect(200);

    expect(mockStorage.updateJob).toHaveBeenCalled();
  });

  it("Valid far coords still blocked on ASAP job (validation passes, gate fires)", async () => {
    mockStorage.getJob.mockResolvedValue(makeJob({ urgentSwitch: true }));

    const res = await agent
      .post("/api/jobs/1/accept")
      .set("Authorization", `Bearer ${WORKER_JWT}`)
      .send(acceptBody(WORKER_FAR_LAT, WORKER_FAR_LNG))
      .expect(403);

    expect(res.body.message).toBe("OUTSIDE_AREA");
    expect(mockStorage.updateJob).not.toHaveBeenCalled();
  });
});
