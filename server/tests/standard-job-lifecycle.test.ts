import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";

const POSTER_ID = 110;
const WORKER_ID = 220;
const JOB_ID = 845;
const POSTER_JWT = "standard-job-poster";
const WORKER_JWT = "standard-job-worker";
const JOB_LAT = 30.6954;
const JOB_LNG = -88.0399;

const state = vi.hoisted(() => ({
  job: undefined as any,
  users: new Map<number, any>(),
  assignments: [] as any[],
  proofs: [] as any[],
  notifications: [] as any[],
  wallet: [] as any[],
  ledger: [] as any[],
  statusLogs: [] as any[],
  audits: [] as any[],
  captureStatus: "pending",
}));

const mockStorage = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  createJob: vi.fn(),
  getJob: vi.fn(),
  getJobs: vi.fn(),
  updateJob: vi.fn(),
  getServicePricingConfig: vi.fn(),
  getCatalogServiceTypes: vi.fn(),
  getServiceTypesByCategory: vi.fn(),
  createAssignment: vi.fn(),
  getAssignmentsByJob: vi.fn(),
  updateAssignment: vi.fn(),
  createTimesheet: vi.fn(),
  createJobStatusLog: vi.fn(),
  createProofSubmission: vi.fn(),
  getProofsByJob: vi.fn(),
  getProofChecklistItems: vi.fn(),
  createNotification: vi.fn(),
  createAuditLog: vi.fn(),
  getWalletByUser: vi.fn(),
  createWalletTransaction: vi.fn(),
  createMoneyLedgerEntry: vi.fn(),
  getBackgroundCheckEligibility: vi.fn(),
  createBackgroundCheckEligibility: vi.fn(),
  computeAndUpdateReliability: vi.fn(),
  maybeUnderReview: vi.fn(),
}));

const mockStripe = vi.hoisted(() => ({
  createCheckout: vi.fn(),
  retrieveCheckout: vi.fn(),
  retrievePaymentIntent: vi.fn(),
  capturePaymentIntent: vi.fn(),
}));

const mockPool = vi.hoisted(() => ({
  on: vi.fn(),
  query: vi.fn(),
  connect: vi.fn(),
}));

function emptyDbChain() {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(async () => []),
    then: (resolve: (value: any[]) => unknown) => Promise.resolve(resolve([])),
  };
  return chain;
}

vi.mock("../storage", () => ({ storage: mockStorage }));
vi.mock("../db", () => ({
  pool: mockPool,
  db: {
    select: vi.fn(() => emptyDbChain()),
    execute: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  },
}));
vi.mock("../referral-reward", () => ({
  awardReferralRewardForJob: vi.fn().mockResolvedValue({ status: "skipped", reason: "not_referred" }),
  voidReferralRewardForJob: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(_key: string, _opts?: any) {}
    checkout = {
      sessions: {
        create: mockStripe.createCheckout,
        retrieve: mockStripe.retrieveCheckout,
      },
    };
    paymentIntents = {
      retrieve: mockStripe.retrievePaymentIntent,
      capture: mockStripe.capturePaymentIntent,
    };
  },
}));
vi.mock("connect-pg-simple", async () => {
  const sessionModule = await import("express-session");
  return { default: () => sessionModule.default.MemoryStore };
});
vi.mock("../jwt", () => ({
  generateJWT: vi.fn(),
  verifyJWT: (token: string) => {
    if (token === POSTER_JWT) return { sub: POSTER_ID, email: "poster@example.com" };
    if (token === WORKER_JWT) return { sub: WORKER_ID, email: "worker@example.com" };
    return null;
  },
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

function settlementRow() {
  return {
    id: state.job.id,
    posted_by_id: state.job.postedById,
    assigned_helper_id: state.job.assignedHelperId,
    title: state.job.title,
    status: state.job.status,
    stripe_payment_intent_id: state.job.stripePaymentIntentId,
    payment_rail: state.job.paymentRail,
    payment_gross_cents: state.job.paymentGrossCents,
    worker_payout_cents: state.job.workerPayoutCents,
    worker_gross_share: state.job.workerGrossShare,
    capture_status: state.captureStatus,
    capture_attempts: 0,
    last_attempt_at: null,
  };
}

function transactionClient() {
  return {
    query: vi.fn(async (query: string, params?: any[]) => {
      if (query.includes("SELECT j.id")) {
        return { rows: [settlementRow()], rowCount: 1 };
      }
      if (query.includes("capture_status = 'capturing'")) {
        state.captureStatus = "capturing";
      }
      if (query.includes("SELECT capture_status")) {
        return { rows: [{ capture_status: state.captureStatus }], rowCount: 1 };
      }
      if (query.includes("SET status = 'completed_paid'")) {
        Object.assign(state.job, {
          status: "completed_paid",
          payoutStatus: "paid_out",
          internalPayoutStatus: "released",
          payoutAmount: params?.[1],
          paymentGrossCents: params?.[2],
          workerPayoutCents: params?.[3],
        });
      }
      if (query.includes("INSERT INTO money_ledger")) {
        state.ledger.push(
          { type: "job_payment_captured", amount: params?.[3] },
          { type: "job_earning", amount: params?.[7] },
          { type: "platform_fee", amount: params?.[10] },
        );
      }
      if (query.includes("UPDATE wallet_transactions")) {
        return { rows: [], rowCount: 0 };
      }
      if (query.includes("INSERT INTO wallet_transactions")) {
        state.wallet.push({
          userId: params?.[0],
          jobId: params?.[1],
          type: "earning",
          amount: params?.[2],
          status: "completed",
        });
      }
      if (query.includes("capture_status = 'captured'")) {
        state.captureStatus = "captured";
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("standard job route lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.job = undefined;
    state.assignments.length = 0;
    state.proofs.length = 0;
    state.notifications.length = 0;
    state.wallet.length = 0;
    state.ledger.length = 0;
    state.statusLogs.length = 0;
    state.audits.length = 0;
    state.captureStatus = "pending";

    state.users = new Map([
      [POSTER_ID, {
        id: POSTER_ID,
        email: "poster@example.com",
        fullName: "Test Poster",
        role: "user",
        tier: "community",
        idVerified: true,
        liabilityDisclaimerAcceptedAt: new Date("2026-01-01"),
        suspended: false,
        banned: false,
        deletedAt: null,
        day1OG: false,
      }],
      [WORKER_ID, {
        id: WORKER_ID,
        email: "worker@example.com",
        fullName: "Nearby Worker",
        role: "user",
        tier: "community",
        idVerified: true,
        stripeAccountId: "acct_worker_220",
        stripeAccountStatus: "active",
        liabilityDisclaimerAcceptedAt: new Date("2026-01-01"),
        suspended: false,
        banned: false,
        deletedAt: null,
        jobsAccepted: 0,
        jobsCompleted: 0,
        trustScore: 50,
        milestoneBadges: [],
      }],
    ]);

    mockStorage.getUser.mockImplementation(async (id: number) => state.users.get(id));
    mockStorage.updateUser.mockImplementation(async (id: number, changes: any) => {
      const updated = { ...state.users.get(id), ...changes };
      state.users.set(id, updated);
      return updated;
    });
    mockStorage.createJob.mockImplementation(async (data: any) => {
      state.job = {
        id: JOB_ID,
        ...data,
        buyerConfirmed: false,
        helperConfirmed: false,
        proofStatus: null,
        helperStage: null,
        visibility: "public",
      };
      return state.job;
    });
    mockStorage.getJob.mockImplementation(async (id: number) => id === JOB_ID ? state.job : undefined);
    mockStorage.getJobs.mockImplementation(async () => state.job ? [state.job] : []);
    mockStorage.updateJob.mockImplementation(async (id: number, changes: any) => {
      if (id !== JOB_ID || !state.job) return undefined;
      Object.assign(state.job, changes);
      return state.job;
    });
    mockStorage.getServicePricingConfig.mockResolvedValue({
      minPayout: 20,
      suggestedRangeLow: 50,
      suggestedRangeHigh: 150,
      estimatedMinutes: 60,
      complexityTier: "standard",
    });
    mockStorage.getCatalogServiceTypes.mockResolvedValue([]);
    mockStorage.getServiceTypesByCategory.mockResolvedValue([]);
    mockStorage.createAssignment.mockImplementation(async (data: any) => {
      const assignment = { id: 1, ...data };
      state.assignments.push(assignment);
      return assignment;
    });
    mockStorage.getAssignmentsByJob.mockImplementation(async () => state.assignments);
    mockStorage.updateAssignment.mockImplementation(async (id: number, changes: any) => {
      const assignment = state.assignments.find((item) => item.id === id);
      Object.assign(assignment, changes);
      return assignment;
    });
    mockStorage.createTimesheet.mockResolvedValue({ id: 1 });
    mockStorage.createJobStatusLog.mockImplementation(async (data: any) => {
      state.statusLogs.push(data);
      return { id: state.statusLogs.length, ...data };
    });
    mockStorage.createProofSubmission.mockImplementation(async (data: any) => {
      const proof = { id: state.proofs.length + 1, ...data };
      state.proofs.push(proof);
      return proof;
    });
    mockStorage.getProofsByJob.mockImplementation(async () => state.proofs);
    mockStorage.getProofChecklistItems.mockResolvedValue([]);
    mockStorage.createNotification.mockImplementation(async (data: any) => {
      state.notifications.push(data);
      return { id: state.notifications.length, ...data };
    });
    mockStorage.createAuditLog.mockImplementation(async (data: any) => {
      state.audits.push(data);
      return { id: state.audits.length, ...data };
    });
    mockStorage.getWalletByUser.mockImplementation(async (id: number) =>
      state.wallet.filter((item) => item.userId === id),
    );
    mockStorage.createWalletTransaction.mockImplementation(async (data: any) => {
      state.wallet.push(data);
      return { id: state.wallet.length, ...data };
    });
    mockStorage.createMoneyLedgerEntry.mockResolvedValue({ id: 1 });
    mockStorage.getBackgroundCheckEligibility.mockResolvedValue(undefined);
    mockStorage.createBackgroundCheckEligibility.mockResolvedValue({ id: 1 });
    mockStorage.computeAndUpdateReliability.mockResolvedValue(undefined);
    mockStorage.maybeUnderReview.mockResolvedValue(undefined);

    mockStripe.createCheckout.mockResolvedValue({
      id: "cs_job_845",
      url: "https://checkout.example/standard-job",
    });
    mockStripe.retrieveCheckout.mockResolvedValue({
      id: "cs_job_845",
      status: "complete",
      payment_status: "paid",
      payment_intent: "pi_job_845",
      metadata: { type: "job_lock", guber_job_id: String(JOB_ID) },
    });
    mockStripe.retrievePaymentIntent.mockResolvedValue({ latest_charge: "ch_job_845" });
    mockStripe.capturePaymentIntent.mockResolvedValue({ amount_received: 10330 });
    mockPool.connect.mockImplementation(async () => transactionClient());
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it("posts, accepts, funds, proves, dual-confirms, and pays one normal job", async () => {
    const app = express();
    app.use(express.json({ limit: "10mb" }));
    await registerRoutes(createServer(app), app);
    const request = supertest(app);

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const selectedTime = `${futureDate}T10:30:00.000Z`;

    const posted = await request
      .post("/api/jobs/create-checkout")
      .set(auth(POSTER_JWT))
      .send({
        category: "General Labor",
        serviceType: "Lawn Care",
        description: "Mow and edge a small front yard.",
        budget: "100",
        location: "100 Test Street",
        zip: "36602",
        lat: JOB_LAT,
        lng: JOB_LNG,
        urgentSwitch: false,
        availabilityWindows: [{ date: futureDate, startTime: "10:00", endTime: "12:00" }],
      })
      .expect(200);

    expect(posted.body).toEqual({ jobId: JOB_ID, redirectMode: true });
    expect(state.job).toMatchObject({
      status: "posted_public",
      isPublished: true,
      isPaid: true,
      urgentSwitch: false,
      category: "General Labor",
    });

    const browse = await request
      .get("/api/jobs")
      .set(auth(WORKER_JWT))
      .expect(200);
    expect(browse.body.map((job: any) => job.id)).toContain(JOB_ID);

    const accepted = await request
      .post(`/api/jobs/${JOB_ID}/accept`)
      .set(auth(WORKER_JWT))
      .send({
        waiverAccepted: true,
        availableFrom: `${futureDate}T10:00:00.000Z`,
        availableTo: `${futureDate}T12:00:00.000Z`,
        timezone: "America/New_York",
        workerLat: JOB_LAT + 0.001,
        workerLng: JOB_LNG + 0.001,
      })
      .expect(200);
    expect(accepted.body).toMatchObject({
      status: "accepted_pending_payment",
      assignedHelperId: WORKER_ID,
    });

    await request
      .post(`/api/jobs/${JOB_ID}/select-time`)
      .set(auth(WORKER_JWT))
      .send({ mode: "exact", arrivalTime: selectedTime })
      .expect(200);
    await request
      .post(`/api/jobs/${JOB_ID}/confirm-time`)
      .set(auth(POSTER_JWT))
      .expect(200);

    const locked = await request
      .post(`/api/jobs/${JOB_ID}/lock`)
      .set(auth(POSTER_JWT))
      .send({})
      .expect(200);
    expect(locked.body.checkoutUrl).toBe("https://checkout.example/standard-job");
    expect(mockStripe.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent_data: expect.objectContaining({
          capture_method: "manual",
          transfer_data: { destination: "acct_worker_220" },
        }),
      }),
      { idempotencyKey: `guber-standard-job-${JOB_ID}-checkout-v1` },
    );
    expect(state.job).toMatchObject({
      paymentRail: "destination_charge",
      paymentGrossCents: 10330,
      workerPayoutCents: 8000,
    });

    await request
      .post(`/api/jobs/${JOB_ID}/confirm-lock-payment`)
      .set(auth(POSTER_JWT))
      .send({ sessionId: "cs_job_845" })
      .expect(200);
    expect(state.job).toMatchObject({
      status: "funded",
      paymentAuthorized: true,
      stripePaymentIntentId: "pi_job_845",
    });

    await request
      .post(`/api/jobs/${JOB_ID}/start-work`)
      .set(auth(WORKER_JWT))
      .send({ safetyConfirmed: true })
      .expect(200);
    await request
      .post(`/api/jobs/${JOB_ID}/milestone`)
      .set(auth(WORKER_JWT))
      .send({ statusType: "on_the_way", gpsLat: JOB_LAT, gpsLng: JOB_LNG })
      .expect(200);
    await request
      .post(`/api/jobs/${JOB_ID}/milestone`)
      .set(auth(WORKER_JWT))
      .send({ statusType: "arrived", gpsLat: JOB_LAT, gpsLng: JOB_LNG })
      .expect(200);

    await request
      .post(`/api/jobs/${JOB_ID}/submit-proof`)
      .set(auth(WORKER_JWT))
      .send({
        imageUrls: ["https://cdn.example/job-845-proof.jpg"],
        notes: "Yard mowed and edged.",
        gpsLat: JOB_LAT,
        gpsLng: JOB_LNG,
        gpsTimestamp: new Date().toISOString(),
      })
      .expect(200);
    expect(state.job.status).toBe("proof_submitted");
    expect(state.proofs).toHaveLength(1);

    await request
      .post(`/api/jobs/${JOB_ID}/confirm`)
      .set(auth(WORKER_JWT))
      .expect(200);
    expect(state.job).toMatchObject({
      status: "completion_submitted",
      helperConfirmed: true,
      payoutStatus: "review_pending",
    });

    const completed = await request
      .post(`/api/jobs/${JOB_ID}/confirm`)
      .set(auth(POSTER_JWT))
      .expect(200);

    expect(completed.body).toMatchObject({
      status: "completed_paid",
      buyerConfirmed: true,
      helperConfirmed: true,
      payoutStatus: "paid_out",
      internalPayoutStatus: "released",
      payoutAmount: 80,
    });
    expect(mockStripe.capturePaymentIntent).toHaveBeenCalledWith(
      "pi_job_845",
      {},
      { idempotencyKey: `guber-standard-job-${JOB_ID}-capture-v1` },
    );
    expect(state.captureStatus).toBe("captured");
    expect(state.wallet).toContainEqual(expect.objectContaining({
      userId: WORKER_ID,
      jobId: JOB_ID,
      type: "earning",
      amount: 80,
      status: "completed",
    }));
    expect(state.ledger).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "job_payment_captured", amount: -103.3 }),
      expect.objectContaining({ type: "job_earning", amount: 80 }),
      expect.objectContaining({ type: "platform_fee", amount: 23.3 }),
    ]));
    expect(state.notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: POSTER_ID, title: "Helper Applied" }),
      expect.objectContaining({ userId: WORKER_ID, title: "Job Locked! 💰" }),
      expect.objectContaining({ userId: POSTER_ID, title: "Proof Submitted ✅" }),
      expect.objectContaining({ userId: WORKER_ID, title: "Payment Released! 💸" }),
    ]));
  });
});