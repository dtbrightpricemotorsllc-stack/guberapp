// task-580: Integration test for the Stripe Connect-account webhook handler.
// Fires synthetic Stripe events at POST /api/webhooks/stripe-connect and asserts
// the correct DB mutations occur for the two product types that flow through
// this path: day1og and trust_box.
//
// Covers:
//   checkout.session.completed:
//   • day1og    → updateUser(day1OG: true, aiOrNotCredits+5, aiOrNotUnlimitedText)
//   • day1og    → skips if user already has day1OG
//   • day1og    → falls back to email lookup via getAllUsers when no userId in metadata
//   • day1og    → saves og_preapproved_emails when user not found at all
//   • trust_box → updateUser(trustBoxPurchased: true, aiOrNotCredits+5, aiOrNotUnlimitedText, trustBoxSubscriptionId)
//   • trust_box → suppresses notification if already active
//
//   Guard rails:
//   • Missing stripe-signature header → 400
//   • Missing STRIPE_CONNECT_WEBHOOK_SECRET → 400
//   • constructEvent throws → 400

import { describe, it, expect, beforeAll, beforeEach, vi, afterAll } from "vitest";

// ── env vars that must exist before routes.ts loads ───────────────────────────
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-32-chars-long!!";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY || "sk_test_connect_dummy";
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_test_secret";
process.env.DISABLE_BACKGROUND_JOBS = "true";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 777_100;
const SESSION_ID = "cs_connect_test_session";
const FAKE_SIG = "t=1,v1=fakesig";

// ── Stripe mock ───────────────────────────────────────────────────────────────

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
      retrieve: vi.fn(async () => ({
        id: "sub_test",
        status: "active",
        cancel_at_period_end: false,
        metadata: {},
      })),
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
        latest_charge: null,
      })),
    };
  },
}));

// ── DB mock ───────────────────────────────────────────────────────────────────

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
  getJob: vi.fn(),
  updateJob: vi.fn(),
  getJobs: vi.fn(async () => []),
  getMarketplaceItems: vi.fn(async () => []),
  updateMarketplaceItem: vi.fn(),
  getDropSponsors: vi.fn(async () => []),
  createDropSponsor: vi.fn(),
  getDirectOffer: vi.fn(),
  updateDirectOffer: vi.fn(),
  createGuberPayment: vi.fn(async () => ({ id: 1 })),
  createMoneyLedgerEntry: vi.fn(async () => ({ id: 1 })),
  createWalletTransaction: vi.fn(async () => ({ id: 1 })),
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

function makeEvent(type: string, metadata: Record<string, string>, extra: Record<string, any> = {}): any {
  return {
    id: `evt_${Math.random().toString(36).slice(2, 10)}`,
    type,
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
  app.use(
    "/api/webhooks/stripe-connect",
    express.raw({ type: "application/json" }),
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  return supertest(app);
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Stripe Connect webhook — checkout.session.completed (task-580)", () => {
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
    mockStorage.getAllUsers.mockResolvedValue([]);
    mockCheckoutSessionsCreate.mockResolvedValue({
      id: "cs_mock_session",
      url: "https://checkout.stripe.com/mock",
    });
    mockCustomersCreate.mockResolvedValue({ id: "cus_mock_001" });
  });

  async function postConnectWebhook(event: any) {
    mockConstructEvent.mockReturnValueOnce(event);
    return agent
      .post("/api/webhooks/stripe-connect")
      .set("stripe-signature", FAKE_SIG)
      .set("content-type", "application/json")
      .send(JSON.stringify(event));
  }

  // ── day1og ─────────────────────────────────────────────────────────────────

  it("day1og: sets day1OG=true and grants 5 aiOrNot credits via userId lookup", async () => {
    const event = makeEvent("checkout.session.completed", {
      type: "day1og",
      userId: String(USER_ID),
      userEmail: "test@guber.app",
    });

    const res = await postConnectWebhook(event);
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
      ...defaultUser(),
      day1OG: true,
      aiOrNotCredits: 5,
    });

    const event = makeEvent("checkout.session.completed", {
      type: "day1og",
      userId: String(USER_ID),
      userEmail: "test@guber.app",
    });

    const res = await postConnectWebhook(event);
    expect(res.status).toBe(200);

    expect(mockStorage.updateUser).not.toHaveBeenCalled();
    expect(mockStorage.createAuditLog).not.toHaveBeenCalled();
  });

  it("day1og: falls back to email lookup via getAllUsers when no userId in metadata", async () => {
    // No userId in metadata means getUser is never called — only getAllUsers is used for the lookup.
    mockStorage.getAllUsers.mockResolvedValueOnce([
      { ...defaultUser(), id: USER_ID, email: "og@guber.app" },
    ]);

    const event = makeEvent("checkout.session.completed", {
      type: "day1og",
      userEmail: "og@guber.app",
    });

    const res = await postConnectWebhook(event);
    expect(res.status).toBe(200);

    expect(mockStorage.getAllUsers).toHaveBeenCalled();
    expect(mockStorage.updateUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ day1OG: true, aiOrNotCredits: 5, aiOrNotUnlimitedText: true }),
    );
    expect(mockStorage.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, title: "Day-1 OG Activated!" }),
    );
  });

  it("day1og: inserts into og_preapproved_emails when user is not found at all", async () => {
    const { db } = await import("../db");
    // No userId in metadata — handler skips getUser entirely, goes straight to getAllUsers.
    mockStorage.getAllUsers.mockResolvedValueOnce([]);

    const event = makeEvent("checkout.session.completed", {
      type: "day1og",
      userEmail: "newcomer@guber.app",
    });

    const res = await postConnectWebhook(event);
    expect(res.status).toBe(200);

    expect(mockStorage.updateUser).not.toHaveBeenCalled();
    expect((db as any).execute).toHaveBeenCalled();
  });

  // ── trust_box ──────────────────────────────────────────────────────────────

  it("trust_box: sets trustBoxPurchased=true and grants 5 aiOrNot credits", async () => {
    const event = makeEvent(
      "checkout.session.completed",
      {
        type: "trust_box",
        userId: String(USER_ID),
        userEmail: "test@guber.app",
      },
      { subscription: "sub_tb_connect_001" },
    );

    const res = await postConnectWebhook(event);
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    expect(mockStorage.updateUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        trustBoxPurchased: true,
        aiOrNotCredits: 5,
        aiOrNotUnlimitedText: true,
        trustBoxSubscriptionId: "sub_tb_connect_001",
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

  it("trust_box: updates user but suppresses notification if Trust Box already active", async () => {
    mockStorage.getUser.mockResolvedValueOnce({
      ...defaultUser(),
      trustBoxPurchased: true,
      trustBoxSubscriptionId: "sub_existing",
      aiOrNotCredits: 5,
    });

    const event = makeEvent(
      "checkout.session.completed",
      {
        type: "trust_box",
        userId: String(USER_ID),
      },
      { subscription: "sub_tb_renew" },
    );

    const res = await postConnectWebhook(event);
    expect(res.status).toBe(200);

    // Credits still increment on renewal (handler always adds 5 on top of existing credits)
    expect(mockStorage.updateUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        trustBoxPurchased: true,
        aiOrNotCredits: 10,
        aiOrNotUnlimitedText: true,
        trustBoxSubscriptionId: "sub_tb_renew",
      }),
    );

    const auditCall = mockStorage.createAuditLog.mock.calls.find(
      ([arg]: [any]) => arg.action === "trust_box_purchased",
    );
    expect(auditCall).toBeTruthy();

    // "Trust Box Active!" notification suppressed when already active
    expect(mockStorage.createNotification).not.toHaveBeenCalled();
  });

  it("trust_box: omits trustBoxSubscriptionId from update payload when session has no subscription", async () => {
    const event = makeEvent("checkout.session.completed", {
      type: "trust_box",
      userId: String(USER_ID),
    });

    const res = await postConnectWebhook(event);
    expect(res.status).toBe(200);

    expect(mockStorage.updateUser).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ trustBoxPurchased: true }),
    );
    const updateCall = mockStorage.updateUser.mock.calls[0];
    expect(updateCall[1]).not.toHaveProperty("trustBoxSubscriptionId");
  });

  // ── Guard rails ────────────────────────────────────────────────────────────

  it("returns 400 when stripe-signature header is missing", async () => {
    const res = await agent
      .post("/api/webhooks/stripe-connect")
      .set("content-type", "application/json")
      .send("{}");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/missing stripe-signature/i);
  });

  it("returns 400 when STRIPE_CONNECT_WEBHOOK_SECRET is not set", async () => {
    const saved = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    try {
      const event = makeEvent("checkout.session.completed", {
        type: "trust_box",
        userId: String(USER_ID),
      });
      const res = await agent
        .post("/api/webhooks/stripe-connect")
        .set("stripe-signature", FAKE_SIG)
        .set("content-type", "application/json")
        .send(JSON.stringify(event));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/webhook not configured/i);
    } finally {
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET = saved;
    }
  });

  it("returns 400 when Stripe signature verification throws", async () => {
    mockConstructEvent.mockImplementationOnce(() => {
      throw new Error("Invalid signature");
    });

    const res = await agent
      .post("/api/webhooks/stripe-connect")
      .set("stripe-signature", "t=bad,v1=badhash")
      .set("content-type", "application/json")
      .send("{}");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/signature verification failed/i);
  });
});
