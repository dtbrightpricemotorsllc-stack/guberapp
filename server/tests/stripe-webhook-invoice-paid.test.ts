// task-581: Integration tests for the Stripe main-account webhook invoice.paid handler.
// Fires synthetic invoice.paid events and asserts the correct DB mutations:
//
//   studio_subscription (billing_reason: subscription_cycle)
//     → incrementStudioCredits called with monthlyCredits
//     → studio_subscription_renewed audit written with [invoice:…] tag
//     → monthly credits notification sent
//
//   studio_subscription dedup
//     → if audit row already has [invoice:…] tag, no credits granted
//
//   studio_subscription non-renewal billing reason
//     → subscription_create billing_reason skips the drip entirely
//
//   trust_box
//     → updateUser called with trustBoxPurchased: true
//     → trust_box_renewed audit written
//
//   no subscription on invoice → ignored (200, no mutations)
//   unknown sub metadata type  → ignored (200, no mutations)

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// ── env vars that must exist before routes.ts loads ──────────────────────────
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-32-chars-long!!";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_webhook_secret";
process.env.DISABLE_BACKGROUND_JOBS = "true";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const USER_ID = 777_002;
const INVOICE_ID = "in_test_invoice_001";
const SUB_ID = "sub_test_studio_001";
const FAKE_SIG = "t=1,v1=fakesig";

// ── Stripe mock ───────────────────────────────────────────────────────────────
const mockConstructEvent = vi.hoisted(() => vi.fn());
const mockSubscriptionsRetrieve = vi.hoisted(() => vi.fn());
const mockCheckoutSessionsCreate = vi.hoisted(() => vi.fn());
const mockCustomersCreate = vi.hoisted(() => vi.fn());

vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(_k: string, _o?: any) {}
    webhooks = { constructEvent: mockConstructEvent };
    customers = {
      list: vi.fn(async () => ({ data: [] })),
      create: mockCustomersCreate,
    };
    subscriptions = {
      list: vi.fn(async () => ({ data: [] })),
      retrieve: mockSubscriptionsRetrieve,
    };
    checkout = {
      sessions: {
        list: vi.fn(async () => ({ data: [] })),
        create: mockCheckoutSessionsCreate,
      },
    };
    transfers = { create: vi.fn(async () => ({ id: "tr_test" })) };
    paymentIntents = {
      retrieve: vi.fn(async () => ({
        id: "pi_test",
        amount: 100,
        currency: "usd",
        status: "succeeded",
        transfer_data: null,
      })),
    };
  },
}));

// ── DB mock: fluent drizzle chain ─────────────────────────────────────────────
// The studio_subscription dedup check calls:
//   const [existingDrip] = await db.select({…}).from(…).where(…).limit(1)
// Returning [] → no prior audit row → proceed with credit grant.
// Returning [{ id: 1 }] → already processed → skip.

const dbSelectResult = vi.hoisted(() => ({ rows: [] as any[] }));

vi.mock("../db", () => {
  const makeChain = (): any => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(dbSelectResult.rows),
      innerJoin: () => chain,
      leftJoin: () => chain,
      orderBy: () => chain,
      offset: () => chain,
    };
    return chain;
  };
  return {
    pool: { on: vi.fn(), query: vi.fn(), connect: vi.fn() },
    db: {
      select: (_fields?: any) => makeChain(),
      execute: vi.fn(async () => ({ rows: [] })),
      insert: (_table: any) => ({
        values: (_data: any) => ({
          returning: () => Promise.resolve([{ id: 1 }]),
          onConflictDoNothing: () => Promise.resolve(),
        }),
      }),
      update: (_table: any) => ({
        set: (_data: any) => ({
          where: (_cond: any) => ({
            returning: () => Promise.resolve([{ id: 1 }]),
          }),
        }),
      }),
    },
  };
});

// ── Storage mock ──────────────────────────────────────────────────────────────
const mockStorage = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(async () => ({ id: USER_ID })),
  getAllUsers: vi.fn(async () => []),
  incrementStudioCredits: vi.fn(async (_uid: number, amount: number) => 100 + amount),
  createAuditLog: vi.fn(async () => ({ id: 1, action: "test" })),
  createNotification: vi.fn(async () => ({ id: 1 })),
  createNotificationMany: vi.fn(async () => []),
  getBusinessAccount: vi.fn(),
  getBusinessAccountById: vi.fn(),
  updateBusinessAccount: vi.fn(async () => ({ id: 1 })),
  createBusinessPlan: vi.fn(async (data: any) => ({ id: 1, ...data })),
  createBillingEvent: vi.fn(async () => ({ id: 1 })),
  getBusinessPlan: vi.fn(),
  updateBusinessPlan: vi.fn(async (id: number, data: any) => ({ id, ...data })),
  // Stubs for routes loaded by registerRoutes()
  getJob: vi.fn(),
  updateJob: vi.fn(),
  getJobs: vi.fn(async () => []),
  getMarketplaceItems: vi.fn(async () => []),
  updateMarketplaceItem: vi.fn(),
  getDropSponsors: vi.fn(async () => []),
  createDropSponsor: vi.fn(),
}));

vi.mock("../storage", () => ({ storage: mockStorage }));

// ── Misc mocks ────────────────────────────────────────────────────────────────
vi.mock("connect-pg-simple", async () => {
  const sessionMod = await import("express-session");
  return { default: () => (sessionMod as any).default.MemoryStore };
});

vi.mock("../jwt", () => ({
  generateJWT: vi.fn(),
  verifyJWT: vi.fn().mockReturnValue(null),
}));

vi.mock("../push", () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
  sendPushBroadcast: vi.fn().mockResolvedValue(undefined),
  saveSubscription: vi.fn(),
  removeSubscription: vi.fn(),
  saveApnsToken: vi.fn(),
  removeApnsToken: vi.fn(),
  saveFcmToken: vi.fn(),
  removeFcmToken: vi.fn(),
  notify: vi.fn().mockResolvedValue(undefined),
  VAPID_PUBLIC_KEY: "test-vapid-key",
}));

vi.mock("../fal", () => ({
  isFalConfigured: () => false,
  isModerationConfigured: () => false,
  isOpenAITtsConfigured: () => false,
  moderatePrompt: vi.fn(async () => ({ flagged: false, reason: null })),
  moderateImage: vi.fn(async () => ({ flagged: false, reason: null })),
  ModerationUnavailableError: class extends Error {},
  FalNotConfiguredError: class extends Error {},
  OpenAITtsUnavailableError: class extends Error {},
  generateWanMotion: vi.fn(),
  generateMiniMaxMusic: vi.fn(),
  generateKlingMotionControl: vi.fn(),
  generateMirrorMotion: vi.fn(),
  generateOpenAITts: vi.fn(),
  generateFluxQuickPic: vi.fn(),
}));

vi.mock("../cloudinary.js", () => ({
  default: { uploader: { upload: vi.fn(), destroy: vi.fn() } },
}));
vi.mock("../cloudinary", () => ({
  default: { uploader: { upload: vi.fn(), destroy: vi.fn() } },
}));

vi.mock("../demo-guard", () => ({
  demoGuard: (_req: any, _res: any, next: any) => next(),
  getDemoUserIds: () => new Set<number>(),
  isDemoUser: () => false,
  viewerCanSeeJobSync: () => true,
}));

vi.mock("resend", () => ({
  Resend: class MockResend {
    constructor(_key: string) {}
    emails = { send: vi.fn(async () => ({ data: { id: "mock-email-id" } })) };
  },
}));

// ── Real imports (after all mocks are declared) ───────────────────────────────
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { registerRoutes } from "../routes";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInvoicePaidEvent(
  invoiceFields: Record<string, any>,
): any {
  return {
    id: `evt_${Math.random().toString(36).slice(2, 10)}`,
    type: "invoice.paid",
    data: {
      object: {
        id: INVOICE_ID,
        subscription: SUB_ID,
        billing_reason: "subscription_cycle",
        ...invoiceFields,
      },
    },
  };
}

function makeSubscription(metadata: Record<string, string>, extra: Record<string, any> = {}): any {
  return {
    id: SUB_ID,
    status: "active",
    cancel_at_period_end: false,
    metadata,
    ...extra,
  };
}

async function buildAgent() {
  const app = express();
  app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  return supertest(app);
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe("Stripe webhook — invoice.paid (task-581)", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    agent = await buildAgent();
  });

  const defaultUser = () => ({
    id: USER_ID,
    email: "test@guber.app",
    fullName: "Test User",
    role: "buyer",
    deletedAt: null,
    studioCredits: 100,
    studioTier: "standard",
    studioSubscriptionId: SUB_ID,
    studioSubscriptionStatus: "active",
    studioSubscriptionCancelAtPeriodEnd: false,
    day1OG: false,
    aiOrNotCredits: 0,
    aiOrNotUnlimitedText: false,
    trustBoxPurchased: false,
    trustBoxSubscriptionId: null,
    trustScore: 50,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    dbSelectResult.rows = [];
    mockStorage.getUser.mockResolvedValue(defaultUser());
    mockCheckoutSessionsCreate.mockResolvedValue({
      id: "cs_mock_session",
      url: "https://checkout.stripe.com/mock",
    });
    mockCustomersCreate.mockResolvedValue({ id: "cus_mock_001" });
  });

  async function postWebhook(event: any) {
    mockConstructEvent.mockReturnValueOnce(event);
    return agent
      .post("/api/webhooks/stripe")
      .set("stripe-signature", FAKE_SIG)
      .set("content-type", "application/json")
      .send(JSON.stringify(event));
  }

  // ── studio_subscription renewal ──────────────────────────────────────────────

  it("studio_subscription: grants monthly credits on subscription_cycle renewal", async () => {
    mockSubscriptionsRetrieve.mockResolvedValueOnce(
      makeSubscription({
        type: "studio_subscription",
        userId: String(USER_ID),
        tier: "standard",
        monthlyCredits: "660",
      }),
    );

    const event = makeInvoicePaidEvent({ billing_reason: "subscription_cycle" });
    const res = await postWebhook(event);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    expect(mockStorage.incrementStudioCredits).toHaveBeenCalledWith(USER_ID, 660);

    expect(mockStorage.updateUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ studioSubscriptionStatus: "active" }),
    );

    const auditCall = mockStorage.createAuditLog.mock.calls.find(
      ([arg]: [any]) => arg.action === "studio_subscription_renewed",
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall[0].userId).toBe(USER_ID);
    expect(auditCall[0].details).toContain(`[invoice:${INVOICE_ID}]`);
    expect(auditCall[0].details).toContain("+660");

    expect(mockStorage.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        title: "Monthly Studio credits added",
      }),
    );
  });

  it("studio_subscription: grants correct credits for business tier (3000 cr)", async () => {
    mockSubscriptionsRetrieve.mockResolvedValueOnce(
      makeSubscription({
        type: "studio_subscription",
        userId: String(USER_ID),
        tier: "business",
        monthlyCredits: "3000",
      }),
    );

    const event = makeInvoicePaidEvent({ billing_reason: "subscription_cycle" });
    const res = await postWebhook(event);

    expect(res.status).toBe(200);
    expect(mockStorage.incrementStudioCredits).toHaveBeenCalledWith(USER_ID, 3000);

    const auditCall = mockStorage.createAuditLog.mock.calls.find(
      ([arg]: [any]) => arg.action === "studio_subscription_renewed",
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall[0].details).toContain("+3000");
  });

  it("studio_subscription: grants correct credits for enterprise tier (8000 cr)", async () => {
    mockSubscriptionsRetrieve.mockResolvedValueOnce(
      makeSubscription({
        type: "studio_subscription",
        userId: String(USER_ID),
        tier: "enterprise",
        monthlyCredits: "8000",
      }),
    );

    const event = makeInvoicePaidEvent({ billing_reason: "subscription_cycle" });
    const res = await postWebhook(event);

    expect(res.status).toBe(200);
    expect(mockStorage.incrementStudioCredits).toHaveBeenCalledWith(USER_ID, 8000);
  });

  // ── Dedup guard ──────────────────────────────────────────────────────────────

  it("studio_subscription: does NOT grant credits if invoice already processed (dedup)", async () => {
    // Simulate a pre-existing audit row with this invoice tag
    dbSelectResult.rows = [{ id: 99 }];

    mockSubscriptionsRetrieve.mockResolvedValueOnce(
      makeSubscription({
        type: "studio_subscription",
        userId: String(USER_ID),
        tier: "standard",
        monthlyCredits: "660",
      }),
    );

    const event = makeInvoicePaidEvent({ billing_reason: "subscription_cycle" });
    const res = await postWebhook(event);

    expect(res.status).toBe(200);
    expect(mockStorage.incrementStudioCredits).not.toHaveBeenCalled();
    expect(mockStorage.createAuditLog).not.toHaveBeenCalled();
    expect(mockStorage.createNotification).not.toHaveBeenCalled();
  });

  // ── Non-renewal billing reason ───────────────────────────────────────────────

  it("studio_subscription: skips drip for billing_reason=subscription_create (initial invoice)", async () => {
    mockSubscriptionsRetrieve.mockResolvedValueOnce(
      makeSubscription({
        type: "studio_subscription",
        userId: String(USER_ID),
        tier: "standard",
        monthlyCredits: "660",
      }),
    );

    const event = makeInvoicePaidEvent({ billing_reason: "subscription_create" });
    const res = await postWebhook(event);

    expect(res.status).toBe(200);
    expect(mockStorage.incrementStudioCredits).not.toHaveBeenCalled();
    expect(mockStorage.createAuditLog).not.toHaveBeenCalled();
  });

  it("studio_subscription: skips drip for billing_reason=manual (admin-triggered invoice)", async () => {
    mockSubscriptionsRetrieve.mockResolvedValueOnce(
      makeSubscription({
        type: "studio_subscription",
        userId: String(USER_ID),
        tier: "standard",
        monthlyCredits: "660",
      }),
    );

    const event = makeInvoicePaidEvent({ billing_reason: "manual" });
    const res = await postWebhook(event);

    expect(res.status).toBe(200);
    expect(mockStorage.incrementStudioCredits).not.toHaveBeenCalled();
  });

  // ── trust_box renewal ────────────────────────────────────────────────────────

  it("trust_box: writes trust_box_renewed audit and keeps trustBoxPurchased=true", async () => {
    const trustBoxSubId = "sub_trust_box_001";
    mockSubscriptionsRetrieve.mockResolvedValueOnce({
      id: trustBoxSubId,
      status: "active",
      cancel_at_period_end: false,
      metadata: {
        type: "trust_box",
        userId: String(USER_ID),
      },
    });

    const event = makeInvoicePaidEvent({
      subscription: trustBoxSubId,
      billing_reason: "subscription_cycle",
    });
    const res = await postWebhook(event);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    expect(mockStorage.updateUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        trustBoxPurchased: true,
        trustBoxSubscriptionId: trustBoxSubId,
      }),
    );

    const auditCall = mockStorage.createAuditLog.mock.calls.find(
      ([arg]: [any]) => arg.action === "trust_box_renewed",
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall[0].userId).toBe(USER_ID);
    expect(auditCall[0].details).toContain(INVOICE_ID);
    expect(auditCall[0].details).toContain(trustBoxSubId);
  });

  it("trust_box: does NOT touch studio credits", async () => {
    const trustBoxSubId = "sub_trust_box_002";
    mockSubscriptionsRetrieve.mockResolvedValueOnce({
      id: trustBoxSubId,
      status: "active",
      cancel_at_period_end: false,
      metadata: { type: "trust_box", userId: String(USER_ID) },
    });

    const event = makeInvoicePaidEvent({
      subscription: trustBoxSubId,
      billing_reason: "subscription_cycle",
    });
    const res = await postWebhook(event);

    expect(res.status).toBe(200);
    expect(mockStorage.incrementStudioCredits).not.toHaveBeenCalled();
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────

  it("ignores invoice.paid with no subscription field", async () => {
    const event = makeInvoicePaidEvent({ subscription: null });
    const res = await postWebhook(event);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(mockStorage.incrementStudioCredits).not.toHaveBeenCalled();
    expect(mockStorage.updateUser).not.toHaveBeenCalled();
    expect(mockStorage.createAuditLog).not.toHaveBeenCalled();
    // subscriptions.retrieve should not be called when there's no subscription ID
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it("ignores invoice.paid for an unrelated subscription type", async () => {
    mockSubscriptionsRetrieve.mockResolvedValueOnce(
      makeSubscription({ type: "business_scout_plan", businessAccountId: "123" }),
    );

    const event = makeInvoicePaidEvent({ billing_reason: "subscription_cycle" });
    const res = await postWebhook(event);

    expect(res.status).toBe(200);
    expect(mockStorage.incrementStudioCredits).not.toHaveBeenCalled();
    expect(mockStorage.updateUser).not.toHaveBeenCalled();
    expect(mockStorage.createAuditLog).not.toHaveBeenCalled();
  });

  it("returns 200 and received:true even if subscriptions.retrieve throws", async () => {
    mockSubscriptionsRetrieve.mockRejectedValueOnce(new Error("Stripe network error"));

    const event = makeInvoicePaidEvent({ billing_reason: "subscription_cycle" });
    const res = await postWebhook(event);

    // The handler catches the error and still responds 200 (webhook must ack)
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(mockStorage.incrementStudioCredits).not.toHaveBeenCalled();
  });
});
