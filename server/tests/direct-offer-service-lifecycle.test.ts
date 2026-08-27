import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";

const HIRER_ID = 41;
const PROVIDER_ID = 77;
const THIRD_PARTY_ID = 88;
const HIRER_JWT = "service-request-hirer";
const PROVIDER_JWT = "service-request-provider";
const THIRD_PARTY_JWT = "service-request-third-party";

const mockStorage = vi.hoisted(() => ({
  getUser: vi.fn(),
  getJob: vi.fn(),
  getDirectOffer: vi.fn(),
  updateDirectOffer: vi.fn(),
  updateJob: vi.fn(),
  createNotification: vi.fn(),
  getGuberPaymentByOffer: vi.fn(),
  updateGuberPayment: vi.fn(),
  createMoneyLedgerEntry: vi.fn(),
  createCancellationLogEntry: vi.fn(),
}));
const mockPool = vi.hoisted(() => ({
  on: vi.fn(),
  query: vi.fn(),
  connect: vi.fn(),
}));
const mockStripe = vi.hoisted(() => ({
  retrievePaymentIntent: vi.fn(),
  createRefund: vi.fn(),
}));

vi.mock("../storage", () => ({ storage: mockStorage }));
vi.mock("../db", () => ({ pool: mockPool, db: {} }));
vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(_key: string, _opts?: any) {}
    paymentIntents = { retrieve: mockStripe.retrievePaymentIntent };
    refunds = { create: mockStripe.createRefund };
  },
}));
vi.mock("connect-pg-simple", async () => {
  const sessionModule = await import("express-session");
  return { default: () => sessionModule.default.MemoryStore };
});
vi.mock("../jwt", () => ({
  generateJWT: vi.fn(),
  verifyJWT: (token: string) => {
    if (token === HIRER_JWT) return { sub: HIRER_ID, email: "hirer@example.com" };
    if (token === PROVIDER_JWT) return { sub: PROVIDER_ID, email: "provider@example.com" };
    if (token === THIRD_PARTY_JWT) return { sub: THIRD_PARTY_ID, email: "third@example.com" };
    return null;
  },
}));
vi.mock("../push", () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
  saveSubscription: vi.fn(), removeSubscription: vi.fn(), saveApnsToken: vi.fn(), removeApnsToken: vi.fn(),
  saveFcmToken: vi.fn(), removeFcmToken: vi.fn(), sendPushBroadcast: vi.fn(), VAPID_PUBLIC_KEY: "",
}));
vi.mock("../demo-guard", () => ({
  demoGuard: (_req: any, _res: any, next: any) => next(),
  getDemoUserIds: () => new Set<number>(), isDemoUser: () => false, viewerCanSeeJobSync: () => true,
}));
vi.mock("../notify-helpers", () => ({ notifyNearbyAvailableWorkers: vi.fn().mockResolvedValue(undefined) }));

import { registerRoutes } from "../routes";

const counteredServiceOffer = {
  id: 902,
  jobId: 901,
  serviceOfferId: 12,
  hirerUserId: HIRER_ID,
  workerUserId: PROVIDER_ID,
  currentOfferAmount: 131.25,
  category: "General Labor",
  jobSummary: "Furniture assembly",
  status: "countered_by_worker",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
};

const fundedServiceOffer = {
  ...counteredServiceOffer,
  status: "funded",
  stripePaymentIntentId: "pi_service_request",
};

const fundedPayment = {
  id: 333,
  grossAmount: 131.25,
  netToWorker: 100,
  platformFeeAmount: 12,
};
const linkedServiceRequestJob = {
  id: 901,
  jobType: "service_request",
  postedById: HIRER_ID,
  assignedHelperId: PROVIDER_ID,
  status: "funded",
  isPaid: true,
  paymentAuthorized: true,
  stripePaymentIntentId: "pi_service_request",
};

async function buildApp() {
  const app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
  return app;
}

describe("provider-service direct offer lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getUser.mockResolvedValue({ id: HIRER_ID, suspended: false, banned: false, deletedAt: null });
    mockStorage.getJob.mockResolvedValue(linkedServiceRequestJob);
    mockStorage.getDirectOffer.mockResolvedValue(counteredServiceOffer);
    mockStorage.updateDirectOffer.mockImplementation(async (_id: number, changes: any) => ({ ...counteredServiceOffer, ...changes }));
    mockStorage.updateJob.mockResolvedValue({ id: 901, status: "accepted_pending_payment" });
    mockStorage.createNotification.mockResolvedValue({});
    mockStorage.getGuberPaymentByOffer.mockResolvedValue(fundedPayment);
    mockStorage.updateGuberPayment.mockResolvedValue({});
    mockStorage.createMoneyLedgerEntry.mockResolvedValue({});
    mockStorage.createCancellationLogEntry.mockResolvedValue({});
    mockStripe.retrievePaymentIntent.mockResolvedValue({ status: "succeeded", latest_charge: "ch_service_request" });
    mockStripe.createRefund.mockResolvedValue({ id: "re_service_request" });
    mockPool.query.mockImplementation(async (query: string) => {
      if (query.includes("FROM service_offers")) {
        return {
          rows: [{
            category: "Skilled Labor",
            service_class: "skilled_pro",
            service_type: "Plumbing",
            required_tier: "verified",
            credential_required: true,
          }],
        };
      }
      return { rows: [] };
    });
  });

  it("lets the hirer approve a provider counter and moves the linked job to protected payment authorization", async () => {
    const app = await buildApp();
    const response = await supertest(app)
      .patch("/api/direct-offers/902/approve-counter")
      .set("Authorization", `Bearer ${HIRER_JWT}`)
      .expect(200);

    expect(response.body.status).toBe("agreed_payment_pending");
    expect(mockStorage.updateDirectOffer).toHaveBeenCalledWith(902, expect.objectContaining({
      status: "agreed_payment_pending",
    }));
    expect(mockStorage.updateJob).toHaveBeenCalledWith(901, expect.objectContaining({
      status: "accepted_pending_payment",
      budget: 131.25,
      finalPrice: 131.25,
    }));
    expect(mockStorage.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: PROVIDER_ID,
      jobId: 901,
    }));
  });

  it("does not let the provider accept their own counter", async () => {
    const app = await buildApp();
    const response = await supertest(app)
      .patch("/api/direct-offers/902/accept")
      .set("Authorization", `Bearer ${PROVIDER_JWT}`)
      .expect(400);

    expect(response.body.message).toMatch(/cannot be accepted/i);
    expect(mockStorage.updateDirectOffer).not.toHaveBeenCalled();
    expect(mockStorage.updateJob).not.toHaveBeenCalled();
  });

  it("accepts a general service request when the provider's current gates pass", async () => {
    const provider = {
      id: PROVIDER_ID,
      liabilityDisclaimerAcceptedAt: new Date(),
      idVerified: true,
      tier: "community",
      credentialVerified: false,
      backgroundCheckStatus: "none",
    };
    mockStorage.getUser.mockImplementation(async (id: number) => id === PROVIDER_ID ? provider : { id: HIRER_ID });
    mockStorage.getDirectOffer.mockResolvedValue({
      ...counteredServiceOffer,
      serviceOfferId: null,
      status: "sent",
    });
    const app = await buildApp();

    const response = await supertest(app)
      .patch("/api/direct-offers/902/accept")
      .set("Authorization", `Bearer ${PROVIDER_JWT}`)
      .expect(200);

    expect(response.body.status).toBe("agreed_payment_pending");
    expect(mockStorage.updateDirectOffer).toHaveBeenCalledWith(902, expect.objectContaining({
      status: "agreed_payment_pending",
    }));
  });

  it.each([
    ["missing liability acknowledgement", { liabilityDisclaimerAcceptedAt: null }, 412, /liability disclaimer/i],
    ["stale identity verification", { idVerified: false }, 403, /verify your current ID/i],
  ])("rejects a general request when the provider has %s", async (_caseName, override, status, detail) => {
    const provider = {
      id: PROVIDER_ID,
      liabilityDisclaimerAcceptedAt: new Date(),
      idVerified: true,
      tier: "community",
      credentialVerified: false,
      backgroundCheckStatus: "none",
      ...override,
    };
    mockStorage.getUser.mockImplementation(async (id: number) => id === PROVIDER_ID ? provider : { id: HIRER_ID });
    mockStorage.getDirectOffer.mockResolvedValue({
      ...counteredServiceOffer,
      serviceOfferId: null,
      status: "sent",
    });
    const app = await buildApp();

    const response = await supertest(app)
      .patch("/api/direct-offers/902/accept")
      .set("Authorization", `Bearer ${PROVIDER_JWT}`)
      .expect(status);

    expect(response.body.detail).toMatch(detail);
    expect(mockStorage.updateDirectOffer).not.toHaveBeenCalled();
    expect(mockStorage.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: HIRER_ID,
      type: "offer_acceptance_blocked",
    }));
  });

  it.each([
    ["below the required tier", { tier: "community" }, /tier or higher/],
    ["with stale credentials", { tier: "verified", credentialVerified: false }, /credential is not currently verified/i],
    ["with a restricted background check", {
      tier: "verified",
      credentialVerified: true,
      backgroundCheckStatus: "flagged",
      backgroundCheckRestrictions: ["Plumbing"],
    }, /background-check restrictions/i],
  ])("rejects a Skilled / Pro request when the provider is %s", async (_caseName, override, detail) => {
    const provider = {
      id: PROVIDER_ID,
      liabilityDisclaimerAcceptedAt: new Date(),
      idVerified: true,
      tier: "community",
      credentialVerified: true,
      backgroundCheckStatus: "none",
      backgroundCheckRestrictions: [],
      ...override,
    };
    mockStorage.getUser.mockImplementation(async (id: number) => id === PROVIDER_ID ? provider : { id: HIRER_ID });
    mockStorage.getDirectOffer.mockResolvedValue({
      ...counteredServiceOffer,
      category: "Skilled Labor",
      serviceOfferId: 12,
      status: "sent",
    });
    const app = await buildApp();

    const response = await supertest(app)
      .patch("/api/direct-offers/902/accept")
      .set("Authorization", `Bearer ${PROVIDER_JWT}`)
      .expect(403);

    expect(response.body.detail).toMatch(detail);
    expect(mockStorage.updateDirectOffer).not.toHaveBeenCalled();
  });

  it("rejects an expired service request before checking acceptance gates", async () => {
    mockStorage.getDirectOffer.mockResolvedValue({
      ...counteredServiceOffer,
      serviceOfferId: null,
      status: "sent",
      expiresAt: new Date(Date.now() - 60 * 1000),
    });
    const app = await buildApp();

    const response = await supertest(app)
      .patch("/api/direct-offers/902/accept")
      .set("Authorization", `Bearer ${PROVIDER_JWT}`)
      .expect(400);

    expect(response.body.message).toMatch(/expired/i);
    expect(mockStorage.updateDirectOffer).not.toHaveBeenCalled();
  });

  it("clears protected payment state from the linked job when a funded request is cancelled and refunded", async () => {
    mockStorage.getDirectOffer.mockResolvedValue(fundedServiceOffer);
    mockStorage.updateDirectOffer.mockImplementation(async (_id: number, changes: any) => ({ ...fundedServiceOffer, ...changes }));
    const app = await buildApp();

    await supertest(app)
      .post("/api/direct-offers/902/cancel")
      .set("Authorization", `Bearer ${HIRER_JWT}`)
      .send({ reasonCode: "no_longer_needed" })
      .expect(200);

    expect(mockStorage.updateGuberPayment).toHaveBeenCalledWith(fundedPayment.id, expect.objectContaining({
      paymentStatus: "refunded",
    }));
    expect(mockStripe.createRefund).toHaveBeenCalledWith(expect.objectContaining({
      charge: "ch_service_request",
      reason: "requested_by_customer",
    }));
    expect(mockStorage.updateJob).toHaveBeenCalledWith(901, expect.objectContaining({
      status: "cancelled",
      isPaid: false,
      paymentAuthorized: false,
      stripePaymentIntentId: null,
    }));
  });

  it.each([
    ["POST", "/api/jobs/901/milestone"],
    ["POST", "/api/jobs/901/start-work"],
    ["POST", "/api/jobs/901/confirm"],
    ["POST", "/api/jobs/901/dispute"],
    ["POST", "/api/jobs/901/cancel"],
    ["POST", "/api/jobs/901/cancel/poster"],
    ["POST", "/api/jobs/901/cancel/helper"],
    ["POST", "/api/jobs/901/lock"],
    ["POST", "/api/jobs/901/confirm-lock-payment"],
    ["POST", "/api/jobs/901/select-time"],
    ["POST", "/api/jobs/901/submit-proof"],
    ["POST", "/api/jobs/901/request-payout"],
    ["PATCH", "/api/jobs/901"],
  ])("rejects legacy %s %s mutations for a linked service request", async (method, path) => {
    const app = await buildApp();
    const request = supertest(app)[method.toLowerCase() as "post" | "patch"](path)
      .set("Authorization", `Bearer ${HIRER_JWT}`)
      .send({});
    const response = await request.expect(409);

    expect(response.body.code).toBe("SERVICE_REQUEST_DIRECT_OFFER_REQUIRED");
    expect(mockStorage.updateJob).not.toHaveBeenCalled();
    expect(mockStripe.createRefund).not.toHaveBeenCalled();
  });

  it.each([
    ["before funding", { ...linkedServiceRequestJob, status: "draft", isPaid: false, paymentAuthorized: false }],
    ["after funding", linkedServiceRequestJob],
  ])("keeps the service request private from a third party %s", async (_stage, job) => {
    mockStorage.getJob.mockResolvedValue(job);
    const app = await buildApp();

    await supertest(app)
      .get("/api/jobs/901")
      .set("Authorization", `Bearer ${THIRD_PARTY_JWT}`)
      .expect(404);
  });
});