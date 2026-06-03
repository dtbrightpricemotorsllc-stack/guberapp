// task-574: Integration test for the Stripe main-account webhook handler.
// Fires a synthetic checkout.session.completed event for each product key
// and asserts the correct DB mutations occur (credits incremented, tier set,
// flags toggled, business plan created / unlocks added).
//
// Covers:
//   Webhook handler (checkout.session.completed):
//   • studio_credits     → incrementStudioCredits + studio_credits_purchased audit
//   • studio_subscription → incrementStudioCredits + updateUser(studioTier)
//   • day1og             → updateUser(day1OG: true)
//   • trust_box          → updateUser(trustBoxPurchased: true)
//   • business_scout_plan → createBusinessPlan(planType:"scout", 20 unlocks)
//   • business_extra_unlocks → updateBusinessPlan(+qty unlocks)
//
//   Product-key → webhook-metadata mapping (GET /api/mobile/checkout-redirect):
//   • business_scout  → Stripe session metadata.type === "business_scout_plan"
//   • business_unlock → Stripe session metadata.type === "business_extra_unlocks"

import { describe, it, expect, beforeAll, beforeEach, vi, afterAll } from "vitest";

// ── env vars that must exist before routes.ts loads ───────────────────────────
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-32-chars-long!!";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_webhook_secret";
process.env.DISABLE_BACKGROUND_JOBS = "true";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 777_001;
const BIZ_ID = 888_001;
const PLAN_ID = 999_001;
const SESSION_ID = "cs_test_synthetic_session";
const FAKE_SIG = "t=1,v1=fakesig";

// ── Stripe mock: bypass constructEvent + capture checkout session creates ───────

const mockConstructEvent = vi.hoisted(() => vi.fn());
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
      retrieve: vi.fn(async () => ({ id: "sub_test", status: "active", cancel_at_period_end: false, metadata: {} })),
    };
    checkout = {
      sessions: {
        list: vi.fn(async () => ({ data: [] })),
        create: mockCheckoutSessionsCreate,
      },
    };
    transfers = { create: vi.fn(async () => ({ id: "tr_test" })) };
    paymentIntents = { retrieve: vi.fn(async () => ({ id: "pi_test", amount: 100, currency: "usd", status: "succeeded", transfer_data: null })) };
  },
}));

// ── DB mock: fluent drizzle chain for dedup select + db.execute ───────────────
// The studio_credits and studio_subscription handlers call:
//   const [existing] = await db.select({…}).from(…).where(…).limit(1)
// Returning [] means "no prior audit row → proceed with credit grant".

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
  getBusinessAccount: vi.fn(),
  getBusinessAccountById: vi.fn(),
  updateBusinessAccount: vi.fn(async () => ({ id: BIZ_ID })),
  createBusinessPlan: vi.fn(async (data: any) => ({ id: PLAN_ID, ...data })),
  createBillingEvent: vi.fn(async () => ({ id: 1 })),
  getBusinessPlan: vi.fn(),
  updateBusinessPlan: vi.fn(async (id: number, data: any) => ({ id, ...data })),
  createNotificationMany: vi.fn(async () => []),
  // Other storage methods used by unrelated routes loaded by registerRoutes:
  getJob: vi.fn(),
  updateJob: vi.fn(),
  getJobs: vi.fn(async () => []),
  getMarketplaceItems: vi.fn(async () => []),
  updateMarketplaceItem: vi.fn(),
  getDropSponsors: vi.fn(async () => []),
  createDropSponsor: vi.fn(),
}));

vi.mock("../storage", () => ({ storage: mockStorage }));

// ── Misc mocks needed by registerRoutes() ─────────────────────────────────────

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

// Mock resend to prevent real email sends from the day1og handler
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
import { signMobileCheckoutToken } from "../mobile-checkout-token";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(metadata: Record<string, string>, extra: Record<string, any> = {}): any {
  return {
    id: `evt_${Math.random().toString(36).slice(2, 10)}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: SESSION_ID,
        payment_status: "paid",
        subscription: null,
        metadata,
        ...extra,
      },
    },
  };
}

async function buildAgent() {
  const app = express();
  // Use raw body for webhook endpoint (routes.ts casts req.body as Buffer);
  // since constructEvent is mocked, the actual body content doesn't matter —
  // we only need it to be parseable so Express doesn't error.
  app.use(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  return supertest(app);
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Stripe webhook — checkout.session.completed (task-574)", () => {
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
    studioTier: "free",
    studioSubscriptionId: null,
    studioSubscriptionStatus: null,
    studioSubscriptionCancelAtPeriodEnd: false,
    day1OG: false,
    aiOrNotCredits: 0,
    aiOrNotUnlimitedText: false,
    trustBoxPurchased: false,
    trustBoxSubscriptionId: null,
    trustScore: 50,
  });

  const defaultBizAccount = () => ({
    id: BIZ_ID,
    ownerUserId: USER_ID,
    businessName: "Test Biz",
    workEmail: "biz@guber.app",
    status: "approved",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    verificationFeePaid: false,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    dbSelectResult.rows = [];

    mockStorage.getUser.mockResolvedValue(defaultUser());
    mockStorage.getBusinessAccountById.mockResolvedValue(defaultBizAccount());
    mockStorage.getBusinessAccount.mockResolvedValue(defaultBizAccount());

    // Default business plan stub (used by business_extra_unlocks)
    mockStorage.getBusinessPlan.mockResolvedValue({
      id: PLAN_ID,
      businessAccountId: BIZ_ID,
      planType: "scout",
      status: "active",
      currentUnlockBalance: 5,
      includedUnlocksPerMonth: 20,
    });

    // Default Stripe checkout session create returns a URL
    mockCheckoutSessionsCreate.mockResolvedValue({
      id: "cs_mock_session",
      url: "https://checkout.stripe.com/mock",
    });

    // Default customers create returns a customer id
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

  // ── studio_credits ──────────────────────────────────────────────────────────

  it("studio_credits: increments studio_credits and writes audit log", async () => {
    const event = makeEvent({
      type: "studio_credits",
      userId: String(USER_ID),
      userEmail: "test@guber.app",
      credits: "330",
      packId: "spark",
    });

    const res = await postWebhook(event);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    expect(mockStorage.incrementStudioCredits).toHaveBeenCalledWith(USER_ID, 330);

    const auditCall = mockStorage.createAuditLog.mock.calls.find(
      ([arg]: [any]) => arg.action === "studio_credits_purchased",
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall[0].userId).toBe(USER_ID);
    expect(auditCall[0].details).toContain(`[session:${SESSION_ID}]`);
    expect(auditCall[0].details).toContain("spark");
    expect(auditCall[0].details).toContain("+330");

    expect(mockStorage.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, title: "Studio Credits Added!" }),
    );
  });

  it("studio_credits: skips duplicate if audit row already exists for this session", async () => {
    dbSelectResult.rows = [{ id: 42 }];

    const event = makeEvent({
      type: "studio_credits",
      userId: String(USER_ID),
      credits: "330",
      packId: "spark",
    });

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    expect(mockStorage.incrementStudioCredits).not.toHaveBeenCalled();
    expect(mockStorage.createAuditLog).not.toHaveBeenCalled();
  });

  // ── studio_subscription ─────────────────────────────────────────────────────

  it("studio_subscription: increments credits + sets studioTier on first activation", async () => {
    const event = makeEvent(
      {
        type: "studio_subscription",
        userId: String(USER_ID),
        userEmail: "test@guber.app",
        tier: "standard",
        monthlyCredits: "660",
      },
      { subscription: "sub_test_123" },
    );

    const res = await postWebhook(event);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    expect(mockStorage.incrementStudioCredits).toHaveBeenCalledWith(USER_ID, 660);

    expect(mockStorage.updateUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        studioTier: "standard",
        studioSubscriptionId: "sub_test_123",
        studioSubscriptionStatus: "active",
      }),
    );

    const auditCall = mockStorage.createAuditLog.mock.calls.find(
      ([arg]: [any]) => arg.action === "studio_subscription_activated",
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall[0].details).toContain("standard");
    expect(auditCall[0].details).toContain("+660");

    expect(mockStorage.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, title: "Studio Standard unlocked!" }),
    );
  });

  it("studio_subscription: does not double-grant if session already processed", async () => {
    dbSelectResult.rows = [{ id: 77 }];

    const event = makeEvent(
      {
        type: "studio_subscription",
        userId: String(USER_ID),
        tier: "business",
        monthlyCredits: "3000",
      },
      { subscription: "sub_dup" },
    );

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    expect(mockStorage.incrementStudioCredits).not.toHaveBeenCalled();
    expect(mockStorage.updateUser).not.toHaveBeenCalled();
  });

  it("studio_subscription: enterprise tier sets correct tier name", async () => {
    const event = makeEvent(
      {
        type: "studio_subscription",
        userId: String(USER_ID),
        tier: "enterprise",
        monthlyCredits: "8000",
      },
      { subscription: "sub_ent" },
    );

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    expect(mockStorage.updateUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ studioTier: "enterprise" }),
    );
    expect(mockStorage.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Studio Enterprise unlocked!" }),
    );
  });

  // ── day1og ──────────────────────────────────────────────────────────────────

  it("day1og: sets day1OG=true and grants 5 aiOrNot credits", async () => {
    const event = makeEvent({
      type: "day1og",
      userId: String(USER_ID),
      userEmail: "test@guber.app",
    });

    const res = await postWebhook(event);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    expect(mockStorage.updateUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        day1OG: true,
        aiOrNotCredits: 5,
        aiOrNotUnlimitedText: true,
      }),
    );

    const auditCall = mockStorage.createAuditLog.mock.calls.find(
      ([arg]: [any]) => arg.action === "day1og_activated",
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall[0].userId).toBe(USER_ID);

    expect(mockStorage.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, title: "Day-1 OG Activated!" }),
    );
  });

  it("day1og: skips update if user already has day1OG", async () => {
    mockStorage.getUser.mockResolvedValueOnce({
      id: USER_ID,
      email: "test@guber.app",
      day1OG: true,
      aiOrNotCredits: 5,
      trustScore: 60,
    });

    const event = makeEvent({
      type: "day1og",
      userId: String(USER_ID),
      userEmail: "test@guber.app",
    });

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    expect(mockStorage.updateUser).not.toHaveBeenCalled();
    expect(mockStorage.createAuditLog).not.toHaveBeenCalled();
  });

  // ── trust_box ───────────────────────────────────────────────────────────────

  it("trust_box: sets trustBoxPurchased=true and grants 5 aiOrNot credits", async () => {
    const event = makeEvent(
      {
        type: "trust_box",
        userId: String(USER_ID),
        userEmail: "test@guber.app",
      },
      { subscription: "sub_tb_001" },
    );

    const res = await postWebhook(event);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    expect(mockStorage.updateUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        trustBoxPurchased: true,
        aiOrNotCredits: 5,
        aiOrNotUnlimitedText: true,
        trustBoxSubscriptionId: "sub_tb_001",
      }),
    );

    const auditCall = mockStorage.createAuditLog.mock.calls.find(
      ([arg]: [any]) => arg.action === "trust_box_purchased",
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall[0].userId).toBe(USER_ID);

    expect(mockStorage.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, title: "Trust Box Active!" }),
    );
  });

  // ── business_scout_plan ─────────────────────────────────────────────────────

  it("business_scout_plan: creates a scout plan with 20 unlocks", async () => {
    const event = makeEvent(
      {
        type: "business_scout_plan",
        businessAccountId: String(BIZ_ID),
      },
      { subscription: "sub_scout_001" },
    );

    const res = await postWebhook(event);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    expect(mockStorage.updateBusinessAccount).toHaveBeenCalledWith(
      BIZ_ID,
      expect.objectContaining({ stripeSubscriptionId: "sub_scout_001" }),
    );

    expect(mockStorage.createBusinessPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        businessAccountId: BIZ_ID,
        planType: "scout",
        status: "active",
        includedUnlocksPerMonth: 20,
        currentUnlockBalance: 20,
      }),
    );

    expect(mockStorage.createBillingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        businessAccountId: BIZ_ID,
        eventType: "scout_plan_activated",
      }),
    );

    expect(mockStorage.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        title: "Scout Plan Active",
      }),
    );
  });

  // ── business_extra_unlocks ──────────────────────────────────────────────────

  it("business_extra_unlocks: increments currentUnlockBalance by the purchased quantity", async () => {
    const event = makeEvent({
      type: "business_extra_unlocks",
      businessAccountId: String(BIZ_ID),
      quantity: "10",
    });

    const res = await postWebhook(event);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    expect(mockStorage.updateBusinessPlan).toHaveBeenCalledWith(
      PLAN_ID,
      expect.objectContaining({ currentUnlockBalance: 15 }),
    );

    expect(mockStorage.createBillingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        businessAccountId: BIZ_ID,
        eventType: "extra_unlocks_purchased",
        rawReference: "10 unlocks",
      }),
    );
  });

  it("business_extra_unlocks: defaults quantity to 1 if not provided", async () => {
    const event = makeEvent({
      type: "business_extra_unlocks",
      businessAccountId: String(BIZ_ID),
    });

    const res = await postWebhook(event);
    expect(res.status).toBe(200);

    expect(mockStorage.updateBusinessPlan).toHaveBeenCalledWith(
      PLAN_ID,
      expect.objectContaining({ currentUnlockBalance: 6 }),
    );
  });

  // ── Guard rails ─────────────────────────────────────────────────────────────

  it("returns 400 when stripe-signature header is missing", async () => {
    // Do NOT queue a mockReturnValueOnce here — the route exits before calling
    // constructEvent (missing sig guard), so any queued value would leak into
    // subsequent tests since vi.clearAllMocks() clears call history but not
    // the mockImplementationOnce/mockReturnValueOnce queue.
    const res = await agent
      .post("/api/webhooks/stripe")
      .set("content-type", "application/json")
      .send("{}");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/missing stripe-signature/i);
  });

  it("returns 400 when STRIPE_WEBHOOK_SECRET is not set", async () => {
    const saved = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      const event = makeEvent({ type: "studio_credits", userId: String(USER_ID), credits: "330", packId: "spark" });
      const res = await agent
        .post("/api/webhooks/stripe")
        .set("stripe-signature", FAKE_SIG)
        .set("content-type", "application/json")
        .send(JSON.stringify(event));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/webhook not configured/i);
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = saved;
    }
  });

  it("returns 400 when Stripe signature verification throws", async () => {
    mockConstructEvent.mockImplementationOnce(() => {
      throw new Error("Invalid signature");
    });

    const res = await agent
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "t=bad,v1=badhash")
      .set("content-type", "application/json")
      .send("{}");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/signature verification failed/i);
  });
});

// ── Product-key → webhook-metadata mapping ────────────────────────────────────
// GET /api/mobile/checkout-redirect translates VALID_PRODUCTS keys into
// Stripe checkout session metadata.type values. A drift here would produce
// a webhook that the handler's if/else chain silently ignores (unhandled type).
//
// These tests verify the two keys that differ from their webhook counterparts:
//   business_scout  → metadata.type: "business_scout_plan"
//   business_unlock → metadata.type: "business_extra_unlocks"

describe("Mobile checkout redirect — product-key → metadata mapping (task-574)", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    const app = express();
    app.use(
      "/api/mobile/checkout-redirect",
      express.raw({ type: "*/*" }),
    );
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: false }));
    const httpServer = createServer(app);
    await registerRoutes(httpServer, app);
    agent = supertest(app);
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockStorage.getUser.mockResolvedValue({
      id: USER_ID,
      email: "test@guber.app",
      fullName: "Test User",
      role: "buyer",
      deletedAt: null,
      studioCredits: 100,
      studioTier: "free",
      studioSubscriptionId: null,
      day1OG: false,
      trustBoxPurchased: false,
      trustBoxSubscriptionId: null,
    });

    mockStorage.getBusinessAccount.mockResolvedValue({
      id: BIZ_ID,
      ownerUserId: USER_ID,
      businessName: "Test Biz",
      workEmail: "biz@guber.app",
      status: "approved",
      stripeCustomerId: "cus_existing_001",
      stripeSubscriptionId: null,
    });

    mockCheckoutSessionsCreate.mockResolvedValue({
      id: "cs_mock_map",
      url: "https://checkout.stripe.com/map_mock",
    });

    mockCustomersCreate.mockResolvedValue({ id: "cus_new_001" });
  });

  function makeToken(product: string, options: Record<string, string> = {}) {
    return signMobileCheckoutToken(USER_ID, product as any, options);
  }

  it("business_scout: checkout session is created with metadata.type='business_scout_plan'", async () => {
    const token = makeToken("business_scout");

    const res = await agent
      .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`);

    // Route redirects to the Stripe session URL
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://checkout.stripe.com/map_mock");

    // Stripe checkout.sessions.create must have been called with the
    // correct metadata.type — the webhook handler only handles "business_scout_plan"
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledTimes(1);
    const [sessionParams] = mockCheckoutSessionsCreate.mock.calls[0];
    expect(sessionParams.metadata).toMatchObject({
      type: "business_scout_plan",
      businessAccountId: String(BIZ_ID),
    });
    expect(sessionParams.mode).toBe("subscription");
  });

  it("business_unlock: checkout session is created with metadata.type='business_extra_unlocks'", async () => {
    const token = makeToken("business_unlock", { quantity: "5" });

    const res = await agent
      .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://checkout.stripe.com/map_mock");

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledTimes(1);
    const [sessionParams] = mockCheckoutSessionsCreate.mock.calls[0];
    expect(sessionParams.metadata).toMatchObject({
      type: "business_extra_unlocks",
      businessAccountId: String(BIZ_ID),
      quantity: "5",
    });
    expect(sessionParams.mode).toBe("payment");
  });

  it("business_unlock: quantity is clamped to 1-50 range", async () => {
    const token = makeToken("business_unlock", { quantity: "999" });

    await agent
      .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`);

    const [sessionParams] = mockCheckoutSessionsCreate.mock.calls[0];
    expect(Number(sessionParams.metadata.quantity)).toBeLessThanOrEqual(50);
  });

  it("invalid/expired token returns 401 so the native SDK can detect it", async () => {
    const res = await agent
      .get("/api/mobile/checkout-redirect?token=not_a_valid_token");

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired|invalid/i);
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });
});
