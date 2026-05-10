// Tests for the Apple External Purchase Link / mobile checkout token bridge
// (task-561 / task-594).
//
// Covers:
//  - signMobileCheckoutToken / verifyMobileCheckoutToken roundtrip
//  - expired token → null (utility)
//  - tampered signature → null (utility)
//  - tampered body → null (utility)
//  - malformed strings → null (utility)
//  - POST /api/mobile/checkout-link  requires auth (401)
//  - POST /api/mobile/checkout-link  rejects invalid/missing product (400)
//  - POST /api/mobile/checkout-link  happy path for all 6 products
//  - End-to-end bridge (POST mint → GET redirect) for all 6 product types
//  - GET  /api/mobile/checkout-redirect  expired token → 401 JSON
//  - GET  /api/mobile/checkout-redirect  tampered token → 401 JSON
//  - GET  /api/mobile/checkout-redirect  missing token → 401 JSON
//  - GET  /api/mobile/checkout-redirect  unknown user → 302 error redirect
//  - GET  /api/mobile/checkout-redirect  product-specific guard rails (already_og, etc.)

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// NOTE: env vars that are captured at module-load time in routes.ts (e.g.
// TRUST_BOX_PAYROLL_PRICE_ID) must be set inside vi.hoisted() which runs
// before static imports are resolved — a plain top-level assignment would
// run too late and routes.ts would capture an empty string instead.
vi.hoisted(() => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-xxxxxxxxxxx";
  process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY || "sk_test_dummy";
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
  process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "guber-test";
  process.env.DISABLE_BACKGROUND_JOBS = "true";
  // Supply a real-looking Stripe price ID so trust_box doesn't short-circuit.
  process.env.STRIPE_PAYROLL_TRUST_BOX_PRICE_ID =
    process.env.STRIPE_PAYROLL_TRUST_BOX_PRICE_ID || "price_test_trust_box_abc123";
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

const USER_ID = 888_000_001;

const state = vi.hoisted(() => ({
  users: new Map<number, any>(),
  businessAccounts: new Map<number, any>(),
  audits: [] as any[],
  stripeSessionsCreated: [] as any[],
  stripeCustomersCreated: [] as any[],
  nextStripeSessionIdx: 0,
}));

const mockStorage = vi.hoisted(() => ({
  getUser: vi.fn(async (id: number) => state.users.get(id)),
  getUserByEmail: vi.fn(async () => undefined),
  getBusinessAccount: vi.fn(async (userId: number) => state.businessAccounts.get(userId)),
  updateBusinessAccount: vi.fn(async (id: number, data: any) => {
    const acct = [...state.businessAccounts.values()].find((a) => a.id === id);
    if (acct) Object.assign(acct, data);
    return acct;
  }),
  createAuditLog: vi.fn(async (data: any) => {
    state.audits.push(data);
    return { id: state.audits.length, ...data };
  }),
  // Stub every other method the route file might touch on startup.
  getJob: vi.fn(async () => undefined),
  updateJob: vi.fn(async () => undefined),
  createNotification: vi.fn(async () => ({ id: 1 })),
}));

vi.mock("../storage", () => ({ storage: mockStorage }));

// Stripe mock — checkout.sessions.create returns a deterministic URL,
// customers.create creates a customer with a predictable ID.
vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(_key: string, _opts?: unknown) {}

    customers = {
      create: vi.fn(async (data: any) => {
        const customer = { id: `cus_test_${state.stripeCustomersCreated.length + 1}`, ...data };
        state.stripeCustomersCreated.push(customer);
        return customer;
      }),
      list: vi.fn(async () => ({ data: [] })),
    };

    subscriptions = {
      list: vi.fn(async () => ({ data: [] })),
      update: vi.fn(async () => ({})),
      cancel: vi.fn(async () => ({})),
    };

    checkout = {
      sessions: {
        create: vi.fn(async (params: any) => {
          const idx = state.nextStripeSessionIdx++;
          const url = `https://checkout.stripe.com/pay/cs_test_${idx}`;
          state.stripeSessionsCreated.push({ params, url });
          return { url, id: `cs_test_${idx}` };
        }),
        list: vi.fn(async () => ({ data: [] })),
      },
    };

    prices = { retrieve: vi.fn(async () => ({ id: "price_test", unit_amount: 100 })) };
    transfers = { create: vi.fn(async () => ({ id: "tr_test" })) };
    webhooks = { constructEvent: vi.fn(() => ({ type: "test", data: { object: {} } })) };
    accounts = { retrieve: vi.fn(async () => ({ id: "acct_test", charges_enabled: true })) };
    paymentIntents = { create: vi.fn(async () => ({ id: "pi_test", client_secret: "secret" })) };
    refunds = { create: vi.fn(async () => ({ id: "re_test" })) };
  },
}));

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
  saveSubscription: vi.fn().mockResolvedValue(undefined),
  removeSubscription: vi.fn().mockResolvedValue(undefined),
  saveApnsToken: vi.fn().mockResolvedValue(undefined),
  removeApnsToken: vi.fn().mockResolvedValue(undefined),
  saveFcmToken: vi.fn().mockResolvedValue(undefined),
  removeFcmToken: vi.fn().mockResolvedValue(undefined),
  VAPID_PUBLIC_KEY: "test-vapid-key",
}));

// ─── Real imports (after mocks) ───────────────────────────────────────────────

import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { signMobileCheckoutToken, verifyMobileCheckoutToken } from "../mobile-checkout-token";
import { registerRoutes } from "../routes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let currentUserId: number | null = null;

async function buildAgent() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (!(req as any).session) (req as any).session = {};
    if (currentUserId !== null) (req as any).session.userId = currentUserId;
    (req as any).session.destroy = (cb: any) => cb && cb();
    next();
  });
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  return supertest(app);
}

function b64url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ─── Token utility tests ───────────────────────────────────────────────────────

describe("mobile-checkout-token utility", () => {
  it("signs and verifies a roundtrip for every valid product", () => {
    const products = [
      "studio_credits",
      "studio_subscription",
      "day1og",
      "trust_box",
      "business_scout",
      "business_unlock",
    ] as const;

    for (const product of products) {
      const token = signMobileCheckoutToken(USER_ID, product, { foo: "bar" });
      const payload = verifyMobileCheckoutToken(token);
      expect(payload, `product ${product} roundtrip`).not.toBeNull();
      expect(payload!.userId).toBe(USER_ID);
      expect(payload!.product).toBe(product);
      expect(payload!.options).toEqual({ foo: "bar" });
      expect(payload!.exp).toBeGreaterThan(Date.now());
      expect(typeof payload!.nonce).toBe("string");
    }
  });

  it("returns null for an expired token", () => {
    const realNow = Date.now;
    Date.now = () => realNow() - 20 * 60 * 1000; // 20 min ago → exp in the past
    const token = signMobileCheckoutToken(USER_ID, "day1og", {});
    Date.now = realNow;
    expect(verifyMobileCheckoutToken(token)).toBeNull();
  });

  it("rejects a token with a forged signature", () => {
    const token = signMobileCheckoutToken(USER_ID, "day1og", {});
    const [body] = token.split(".");
    const forged = `${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    expect(verifyMobileCheckoutToken(forged)).toBeNull();
  });

  it("rejects a token whose body has been tampered with", () => {
    const token = signMobileCheckoutToken(USER_ID, "day1og", {});
    const [, sig] = token.split(".");
    const tamperedBody = b64url(JSON.stringify({
      userId: 9999, product: "day1og", options: {}, exp: Date.now() + 60_000, nonce: "x",
    }));
    expect(verifyMobileCheckoutToken(`${tamperedBody}.${sig}`)).toBeNull();
  });

  it("rejects malformed token strings", () => {
    expect(verifyMobileCheckoutToken("")).toBeNull();
    expect(verifyMobileCheckoutToken("nodot")).toBeNull();
    expect(verifyMobileCheckoutToken("a.b.c")).toBeNull();
  });

  it("rejects a token with an invalid product", () => {
    // Manually craft a valid-looking token with a bad product name.
    const realNow = Date.now;
    const payload = {
      userId: USER_ID,
      product: "invalid_product",
      options: {},
      exp: realNow() + 15 * 60 * 1000,
      nonce: "abc",
    };
    const body = b64url(JSON.stringify(payload));
    // Sign it with the real key so the HMAC passes, product check should fail.
    const crypto = require("crypto");
    const secret = process.env.SESSION_SECRET!;
    const sig = crypto.createHmac("sha256", secret).update(body).digest("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(verifyMobileCheckoutToken(`${body}.${sig}`)).toBeNull();
  });
});

// ─── HTTP route tests ──────────────────────────────────────────────────────────

describe("mobile checkout HTTP routes (registerRoutes)", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    agent = await buildAgent();
  });

  beforeEach(() => {
    state.audits.length = 0;
    state.stripeSessionsCreated.length = 0;
    state.stripeCustomersCreated.length = 0;
    state.nextStripeSessionIdx = 0;
    state.users.clear();
    state.businessAccounts.clear();

    state.users.set(USER_ID, {
      id: USER_ID,
      email: "test@guber.test",
      role: "buyer",
      deletedAt: null,
      day1OG: false,
      studioSubscriptionId: null,
      studioTier: "free",
      trustBoxPurchased: false,
      trustBoxSubscriptionId: null,
    });

    currentUserId = USER_ID;
  });

  // ── POST /api/mobile/checkout-link ──────────────────────────────────────────

  describe("POST /api/mobile/checkout-link", () => {
    it("returns 401 when unauthenticated", async () => {
      currentUserId = null;
      await agent
        .post("/api/mobile/checkout-link")
        .send({ product: "day1og" })
        .expect(401);
    });

    it("returns 400 for an invalid product", async () => {
      const res = await agent
        .post("/api/mobile/checkout-link")
        .send({ product: "fake_product" })
        .expect(400);
      expect(res.body.message).toMatch(/invalid product/i);
    });

    it("returns 400 when product is missing", async () => {
      const res = await agent
        .post("/api/mobile/checkout-link")
        .send({})
        .expect(400);
      expect(res.body.message).toMatch(/invalid product/i);
    });

    it.each([
      ["studio_credits",      { packId: "spark" }],
      ["studio_subscription", { tier: "standard" }],
      ["day1og",              {}],
      ["trust_box",           {}],
      ["business_scout",      {}],
      ["business_unlock",     { quantity: "5" }],
    ] as const)(
      "returns a signed token URL for product '%s'",
      async (product, options) => {
        const res = await agent
          .post("/api/mobile/checkout-link")
          .send({ product, options })
          .expect(200);

        expect(res.body.url).toMatch(/\/mobile-checkout\?token=/);
        const urlObj = new URL(res.body.url);
        const token = urlObj.searchParams.get("token")!;
        expect(token).toBeTruthy();

        const payload = verifyMobileCheckoutToken(token);
        expect(payload).not.toBeNull();
        expect(payload!.userId).toBe(USER_ID);
        expect(payload!.product).toBe(product);
      },
    );
  });

  // ── End-to-end bridge: POST checkout-link → GET checkout-redirect ───────────
  // Mirrors the real iOS flow for every product type: the authenticated app
  // calls POST to mint a signed URL, opens that URL in SFSafariViewController,
  // the server validates the token and 302-redirects to Stripe.

  describe("end-to-end bridge (POST → GET) — all 6 product types", () => {
    async function bridge(product: string, options: Record<string, string>) {
      const linkRes = await agent
        .post("/api/mobile/checkout-link")
        .send({ product, options })
        .expect(200);

      expect(linkRes.body.url).toMatch(/\/mobile-checkout\?token=/);
      const token = new URL(linkRes.body.url).searchParams.get("token")!;
      expect(token).toBeTruthy();

      const redirectRes = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);

      return { redirectRes, token };
    }

    it("studio_credits: full POST→GET bridge lands on Stripe", async () => {
      const { redirectRes } = await bridge("studio_credits", { packId: "boost" });
      expect(redirectRes.headers.location).toMatch(/checkout\.stripe\.com/);
      expect(state.stripeSessionsCreated[0].params.metadata.packId).toBe("boost");
    });

    it("studio_subscription: full POST→GET bridge lands on Stripe", async () => {
      const { redirectRes } = await bridge("studio_subscription", { tier: "business" });
      expect(redirectRes.headers.location).toMatch(/checkout\.stripe\.com/);
      expect(state.stripeSessionsCreated[0].params.metadata.tier).toBe("business");
    });

    it("day1og: full POST→GET bridge lands on Stripe", async () => {
      const { redirectRes } = await bridge("day1og", {});
      expect(redirectRes.headers.location).toMatch(/checkout\.stripe\.com/);
      expect(state.stripeSessionsCreated[0].params.metadata.type).toBe("day1og");
    });

    it("trust_box: full POST→GET bridge lands on Stripe", async () => {
      const { redirectRes } = await bridge("trust_box", {});
      expect(redirectRes.headers.location).toMatch(/checkout\.stripe\.com/);
      expect(state.stripeSessionsCreated[0].params.metadata.type).toBe("trust_box");
    });

    it("business_scout: full POST→GET bridge lands on Stripe", async () => {
      state.businessAccounts.set(USER_ID, {
        id: 3001, userId: USER_ID, workEmail: "scout@guber.test",
        businessName: "Scout Co", stripeCustomerId: "cus_scout_bridge",
      });
      const { redirectRes } = await bridge("business_scout", {});
      expect(redirectRes.headers.location).toMatch(/checkout\.stripe\.com/);
      expect(state.stripeSessionsCreated[0].params.metadata.type).toBe("business_scout_plan");
    });

    it("business_unlock: full POST→GET bridge lands on Stripe", async () => {
      state.businessAccounts.set(USER_ID, {
        id: 3002, userId: USER_ID, workEmail: "unlock@guber.test",
        businessName: "Unlock Co", stripeCustomerId: "cus_unlock_bridge",
      });
      const { redirectRes } = await bridge("business_unlock", { quantity: "4" });
      expect(redirectRes.headers.location).toMatch(/checkout\.stripe\.com/);
      expect(state.stripeSessionsCreated[0].params.line_items[0].quantity).toBe(4);
    });
  });

  // ── GET /api/mobile/checkout-redirect — invalid-token handling ───────────────
  // Expired, tampered, or missing tokens return 401 JSON so the native app can
  // detect the failure programmatically and prompt the user to retry.

  describe("GET /api/mobile/checkout-redirect", () => {
    it("returns 401 for an expired token", async () => {
      const realNow = Date.now;
      Date.now = () => realNow() - 20 * 60 * 1000;
      const token = signMobileCheckoutToken(USER_ID, "day1og", {});
      Date.now = realNow;

      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(401);
      expect(res.body.message).toMatch(/expired|invalid/i);
    });

    it("returns 401 for a tampered token", async () => {
      const token = signMobileCheckoutToken(USER_ID, "day1og", {});
      const [body] = token.split(".");
      const forged = `${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(forged)}`)
        .expect(401);
      expect(res.body.message).toMatch(/expired|invalid/i);
    });

    it("returns 401 when token is missing entirely", async () => {
      const res = await agent
        .get("/api/mobile/checkout-redirect")
        .expect(401);
      expect(res.body.message).toMatch(/expired|invalid/i);
    });

    it("redirects to error page when the user does not exist", async () => {
      state.users.clear(); // no user found
      const token = signMobileCheckoutToken(USER_ID, "day1og", {});
      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(res.headers.location).toMatch(/login.*account_not_found/);
    });

    // ── studio_credits ──────────────────────────────────────────────────────

    it("studio_credits: 302 → Stripe checkout URL for a valid pack", async () => {
      const token = signMobileCheckoutToken(USER_ID, "studio_credits", { packId: "spark" });
      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(res.headers.location).toMatch(/checkout\.stripe\.com/);
      expect(state.stripeSessionsCreated).toHaveLength(1);
      expect(state.stripeSessionsCreated[0].params.mode).toBe("payment");
      expect(state.stripeSessionsCreated[0].params.metadata.type).toBe("studio_credits");
      expect(state.stripeSessionsCreated[0].params.metadata.packId).toBe("spark");
    });

    it("studio_credits: redirects to error page for an invalid packId", async () => {
      const token = signMobileCheckoutToken(USER_ID, "studio_credits", { packId: "nonexistent" });
      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(res.headers.location).toMatch(/studio\/credits.*invalid_pack/);
      expect(state.stripeSessionsCreated).toHaveLength(0);
    });

    it("studio_credits: covers all 6 credit packs", async () => {
      const packs = ["spark", "boost", "power", "mega", "ultra", "whale"] as const;
      for (const packId of packs) {
        state.stripeSessionsCreated.length = 0;
        state.nextStripeSessionIdx = 0;
        const token = signMobileCheckoutToken(USER_ID, "studio_credits", { packId });
        const res = await agent
          .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
          .expect(302);
        expect(res.headers.location, `pack ${packId}`).toMatch(/checkout\.stripe\.com/);
        expect(state.stripeSessionsCreated[0].params.metadata.packId).toBe(packId);
      }
    });

    // ── studio_subscription ─────────────────────────────────────────────────

    it("studio_subscription: 302 → Stripe checkout URL for a valid tier", async () => {
      const token = signMobileCheckoutToken(USER_ID, "studio_subscription", { tier: "standard" });
      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(res.headers.location).toMatch(/checkout\.stripe\.com/);
      expect(state.stripeSessionsCreated).toHaveLength(1);
      expect(state.stripeSessionsCreated[0].params.mode).toBe("subscription");
      expect(state.stripeSessionsCreated[0].params.metadata.type).toBe("studio_subscription");
      expect(state.stripeSessionsCreated[0].params.metadata.tier).toBe("standard");
    });

    it("studio_subscription: redirects to error page for an invalid tier", async () => {
      const token = signMobileCheckoutToken(USER_ID, "studio_subscription", { tier: "bogus" });
      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(res.headers.location).toMatch(/studio\/credits.*invalid_tier/);
    });

    it("studio_subscription: redirects to error page when user already has a subscription", async () => {
      state.users.set(USER_ID, {
        ...state.users.get(USER_ID),
        studioSubscriptionId: "sub_existing",
      });
      const token = signMobileCheckoutToken(USER_ID, "studio_subscription", { tier: "business" });
      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(res.headers.location).toMatch(/studio\/credits.*already_subscribed/);
    });

    it("studio_subscription: covers all 3 tier plans", async () => {
      const tiers = ["standard", "business", "enterprise"] as const;
      for (const tier of tiers) {
        state.stripeSessionsCreated.length = 0;
        state.nextStripeSessionIdx = 0;
        const token = signMobileCheckoutToken(USER_ID, "studio_subscription", { tier });
        const res = await agent
          .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
          .expect(302);
        expect(res.headers.location, `tier ${tier}`).toMatch(/checkout\.stripe\.com/);
        expect(state.stripeSessionsCreated[0].params.metadata.tier).toBe(tier);
      }
    });

    // ── day1og ──────────────────────────────────────────────────────────────

    it("day1og: 302 → Stripe checkout URL", async () => {
      const token = signMobileCheckoutToken(USER_ID, "day1og", {});
      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(res.headers.location).toMatch(/checkout\.stripe\.com/);
      expect(state.stripeSessionsCreated[0].params.metadata.type).toBe("day1og");
    });

    it("day1og: redirects to error page when user is already OG", async () => {
      state.users.set(USER_ID, { ...state.users.get(USER_ID), day1OG: true });
      const token = signMobileCheckoutToken(USER_ID, "day1og", {});
      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(res.headers.location).toMatch(/profile.*already_og/);
    });

    // ── trust_box ───────────────────────────────────────────────────────────

    it("trust_box: 302 → Stripe checkout URL", async () => {
      const token = signMobileCheckoutToken(USER_ID, "trust_box", {});
      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(res.headers.location).toMatch(/checkout\.stripe\.com/);
      expect(state.stripeSessionsCreated[0].params.metadata.type).toBe("trust_box");
    });

    it("trust_box: redirects to error page when user is already subscribed", async () => {
      state.users.set(USER_ID, {
        ...state.users.get(USER_ID),
        trustBoxPurchased: true,
        trustBoxSubscriptionId: "sub_trust_existing",
      });
      const token = signMobileCheckoutToken(USER_ID, "trust_box", {});
      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(res.headers.location).toMatch(/ai-or-not.*already_subscribed/);
    });

    // ── business_scout ──────────────────────────────────────────────────────

    it("business_scout: 302 → Stripe checkout URL (existing customer)", async () => {
      state.businessAccounts.set(USER_ID, {
        id: 1001,
        userId: USER_ID,
        workEmail: "biz@guber.test",
        businessName: "Guber Inc",
        stripeCustomerId: "cus_existing_scout",
      });
      const token = signMobileCheckoutToken(USER_ID, "business_scout", {});
      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(res.headers.location).toMatch(/checkout\.stripe\.com/);
      expect(state.stripeSessionsCreated[0].params.metadata.type).toBe("business_scout_plan");
      // No new customer should have been created since stripeCustomerId is set
      expect(state.stripeCustomersCreated).toHaveLength(0);
    });

    it("business_scout: creates a Stripe customer if one does not yet exist", async () => {
      state.businessAccounts.set(USER_ID, {
        id: 1002,
        userId: USER_ID,
        workEmail: "newbiz@guber.test",
        businessName: "New Biz",
        stripeCustomerId: null,
      });
      const token = signMobileCheckoutToken(USER_ID, "business_scout", {});
      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(res.headers.location).toMatch(/checkout\.stripe\.com/);
      expect(state.stripeCustomersCreated).toHaveLength(1);
    });

    it("business_scout: redirects to error page when no business account exists", async () => {
      // businessAccounts is empty for USER_ID
      const token = signMobileCheckoutToken(USER_ID, "business_scout", {});
      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(res.headers.location).toMatch(/biz\/dashboard.*no_account/);
    });

    // ── business_unlock ─────────────────────────────────────────────────────

    it("business_unlock: 302 → Stripe checkout URL with correct quantity", async () => {
      state.businessAccounts.set(USER_ID, {
        id: 2001,
        userId: USER_ID,
        workEmail: "unlock@guber.test",
        businessName: "Unlock Co",
        stripeCustomerId: "cus_existing_unlock",
      });
      const token = signMobileCheckoutToken(USER_ID, "business_unlock", { quantity: "3" });
      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(res.headers.location).toMatch(/checkout\.stripe\.com/);
      const created = state.stripeSessionsCreated[0];
      expect(created.params.metadata.type).toBe("business_extra_unlocks");
      expect(created.params.line_items[0].quantity).toBe(3);
    });

    it("business_unlock: defaults quantity to 5 when not provided", async () => {
      state.businessAccounts.set(USER_ID, {
        id: 2002,
        userId: USER_ID,
        workEmail: "unlock2@guber.test",
        businessName: "Unlock Co 2",
        stripeCustomerId: "cus_existing_unlock2",
      });
      const token = signMobileCheckoutToken(USER_ID, "business_unlock", {});
      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(res.headers.location).toMatch(/checkout\.stripe\.com/);
      // Default qty=5 when none supplied
      expect(state.stripeSessionsCreated[0].params.line_items[0].quantity).toBe(5);
    });

    it("business_unlock: redirects to error page when no business account exists", async () => {
      const token = signMobileCheckoutToken(USER_ID, "business_unlock", { quantity: "5" });
      const res = await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(res.headers.location).toMatch(/biz\/dashboard.*no_account/);
    });

    // ── resolveSuccessUrl ───────────────────────────────────────────────────

    it("respects a guber:// deep-link successUrl in the Stripe session", async () => {
      const successUrl = "guber://studio/credits?purchased=1";
      const token = signMobileCheckoutToken(USER_ID, "day1og", { successUrl });
      await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      expect(state.stripeSessionsCreated[0].params.success_url).toBe(successUrl);
    });

    it("falls back to the default successUrl for an unsafe custom URL", async () => {
      const successUrl = "https://evil.example.com/steal";
      const token = signMobileCheckoutToken(USER_ID, "day1og", { successUrl });
      await agent
        .get(`/api/mobile/checkout-redirect?token=${encodeURIComponent(token)}`)
        .expect(302);
      // Should NOT use the evil URL
      expect(state.stripeSessionsCreated[0].params.success_url).not.toContain("evil.example.com");
    });
  });
});
