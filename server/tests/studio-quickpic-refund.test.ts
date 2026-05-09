// task-535: lock down the Quick Pic free-quota refund path. Mirrors the
// task-533 credit refund test, but on a different counter — the daily
// `studio_free_quota.used_count` slot consumed by
// `/api/studio/generate/quick-pic` BEFORE Fal.ai is called. A regression
// here would silently burn a user's free generations on every provider
// failure.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-1234567890";
process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "guber-test";
process.env.DISABLE_BACKGROUND_JOBS = "true";
process.env.FAL_KEY = process.env.FAL_KEY || "test-fal-key";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const USER_ID = 999_999_902;
const DAILY_LIMIT = 3;

const state = vi.hoisted(() => ({
  users: new Map<number, any>(),
  pricing: new Map<string, any>(),
  sessions: [] as any[],
  files: [] as any[],
  generationLogs: [] as any[],
  freeQuota: new Map<string, number>(), // key = `${userId}:${day}`
  nextSessionId: 1,
  nextFileId: 1,
}));

const quotaKey = (userId: number, day: string) => `${userId}:${day}`;

const mockStorage = vi.hoisted(() => ({
  getUser: vi.fn(async (id: number) => state.users.get(id)),
  getUserByEmail: vi.fn(async () => undefined),

  // Free-quota counter — mirror the real Postgres conditional upsert.
  // Returns the new used_count, or null when daily limit is reached.
  consumeStudioFreeQuota: vi.fn(async (userId: number, day: string, dailyLimit: number) => {
    const k = quotaKey(userId, day);
    const cur = state.freeQuota.get(k) ?? 0;
    if (cur >= dailyLimit) return null;
    const next = cur + 1;
    state.freeQuota.set(k, next);
    return next;
  }),
  refundStudioFreeQuota: vi.fn(async (userId: number, day: string) => {
    const k = quotaKey(userId, day);
    const cur = state.freeQuota.get(k) ?? 0;
    state.freeQuota.set(k, Math.max(cur - 1, 0));
  }),
  getStudioFreeQuotaUsed: vi.fn(async (userId: number, day: string) =>
    state.freeQuota.get(quotaKey(userId, day)) ?? 0,
  ),

  getStudioModelPricing: vi.fn(async (toolKey: string) => state.pricing.get(toolKey)),

  getActiveStudioSession: vi.fn(async (userId: number) =>
    state.sessions.find((s) => s.userId === userId && s.status === "active"),
  ),
  createStudioSession: vi.fn(async (userId: number) => {
    const row = { id: state.nextSessionId++, userId, status: "active", startedAt: new Date(), lastActivityAt: new Date() };
    state.sessions.push(row);
    return row;
  }),
  touchStudioSession: vi.fn(async (_id: number) => {}),
  listStudioSessionFiles: vi.fn(async (sessionId: number) =>
    state.files.filter((f) => f.sessionId === sessionId),
  ),
  addStudioSessionFile: vi.fn(async (data: any) => {
    const row = { id: state.nextFileId++, createdAt: new Date(), ...data };
    state.files.push(row);
    return row;
  }),

  logStudioGeneration: vi.fn(async (data: any) => {
    const row = { id: state.generationLogs.length + 1, createdAt: new Date(), ...data };
    state.generationLogs.push(row);
    return row;
  }),

  // Credit ledger — Quick Pic is free, but registerRoutes touches these
  // mocks during boot for unrelated handlers.
  incrementStudioCredits: vi.fn(async () => 0),
  decrementStudioCredits: vi.fn(async () => null),
}));

vi.mock("../storage", () => ({ storage: mockStorage }));

vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(_key: string, _opts?: unknown) {}
    customers = { list: async () => ({ data: [] }) };
    subscriptions = { list: async () => ({ data: [] }) };
    checkout = { sessions: { list: async () => ({ data: [] }) } };
    transfers = { create: async () => ({ id: "tr_test" }) };
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

// Force the free_quickpic_enabled flag ON for the tests.
vi.mock("../feature-flags", () => ({
  isFeatureEnabledFor: vi.fn(async () => true),
  ensureFlagsSeeded: vi.fn(async () => {}),
  invalidateFlagCache: vi.fn(),
  listAllFlags: vi.fn(async () => []),
  updateFlag: vi.fn(async () => {}),
}));

class FakeFalNotConfiguredError extends Error {
  constructor() { super("not configured"); this.name = "FalNotConfiguredError"; }
}
class FakeModerationUnavailableError extends Error {
  constructor() { super("mod offline"); this.name = "ModerationUnavailableError"; }
}

const generateFluxQuickPic = vi.hoisted(() => vi.fn());

vi.mock("../fal", () => ({
  isFalConfigured: () => true,
  isModerationConfigured: () => true,
  moderatePrompt: vi.fn(async () => ({ flagged: false, reason: null })),
  moderateImage: vi.fn(async () => ({ flagged: false, reason: null })),
  ModerationUnavailableError: FakeModerationUnavailableError,
  FalNotConfiguredError: FakeFalNotConfiguredError,
  generateWanMotion: vi.fn(),
  generateMiniMaxMusic: vi.fn(),
  generateKlingMotionControl: vi.fn(),
  generateMirrorMotion: vi.fn(),
  generateFluxQuickPic,
}));

// ─── Real imports (after mocks) ───────────────────────────────────────────────

import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { registerRoutes } from "../routes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let currentUserId: number | null = null;

async function buildAgent() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
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

function resetUser() {
  state.users.clear();
  state.users.set(USER_ID, {
    id: USER_ID,
    role: "buyer",
    deletedAt: null,
    studioCredits: 0,
  });
}

function utcDayString(d = new Date()): string {
  // Mirror the helper inside server/routes.ts so the test can read the
  // exact same key the route writes to.
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Quick Pic free-quota refund (task-535)", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    state.pricing.set("flux_quick_pic", {
      toolKey: "flux_quick_pic",
      creditsCost: 0,
      durationSeconds: null,
      active: true,
    });
    agent = await buildAgent();
  });

  beforeEach(() => {
    resetUser();
    state.sessions.length = 0;
    state.files.length = 0;
    state.generationLogs.length = 0;
    state.freeQuota.clear();
    state.nextSessionId = 1;
    state.nextFileId = 1;
    currentUserId = USER_ID;
    generateFluxQuickPic.mockReset();
    mockStorage.consumeStudioFreeQuota.mockClear();
    mockStorage.refundStudioFreeQuota.mockClear();
  });

  it("refunds the daily slot when the Fal provider throws", async () => {
    generateFluxQuickPic.mockRejectedValueOnce(new Error("Flux upstream timeout"));

    const day = utcDayString();
    const res = await agent
      .post("/api/studio/generate/quick-pic")
      .send({ prompt: "a neon cyberpunk skyline" })
      .expect(502);

    // The user's daily used count must be exactly what it started at (0).
    expect(state.freeQuota.get(quotaKey(USER_ID, day)) ?? 0).toBe(0);

    // Server reports the post-refund counters back to the client.
    expect(res.body.dailyLimit).toBe(DAILY_LIMIT);
    expect(res.body.used).toBe(0);
    expect(res.body.remaining).toBe(DAILY_LIMIT);
    expect(res.body.message).toMatch(/returned/i);

    // Both consume + refund happened, exactly once each.
    expect(mockStorage.consumeStudioFreeQuota).toHaveBeenCalledTimes(1);
    expect(mockStorage.consumeStudioFreeQuota).toHaveBeenCalledWith(USER_ID, day, DAILY_LIMIT);
    expect(mockStorage.refundStudioFreeQuota).toHaveBeenCalledTimes(1);
    expect(mockStorage.refundStudioFreeQuota).toHaveBeenCalledWith(USER_ID, day);

    // A "refunded" generation log row was written for the free tool.
    const refundLog = state.generationLogs.find(
      (l) => l.toolKey === "flux_quick_pic" && l.status === "refunded",
    );
    expect(refundLog).toBeTruthy();
    expect(refundLog.creditsCost).toBe(0);
    expect(refundLog.errorReason).toMatch(/Flux upstream timeout/);

    // No output image was attached to the session.
    expect(state.files.find((f) => f.fileType === "output_image")).toBeUndefined();
  });

  // Sanity check: the success path DOES consume a slot. Without this companion
  // assertion a buggy implementation that "always refunds" would still pass
  // the failure test above.
  it("DOES consume a slot when the provider succeeds", async () => {
    generateFluxQuickPic.mockResolvedValueOnce({
      imageUrl: "https://example.com/quickpic.png",
      jobId: "fal_quickpic_ok",
    });

    const day = utcDayString();
    const res = await agent
      .post("/api/studio/generate/quick-pic")
      .send({ prompt: "a calm forest at dawn" })
      .expect(200);

    // One slot should be burned.
    expect(state.freeQuota.get(quotaKey(USER_ID, day))).toBe(1);
    expect(res.body.billing).toBe("free");
    expect(res.body.used).toBe(1);
    expect(res.body.remaining).toBe(DAILY_LIMIT - 1);

    // No refund call on the happy path.
    expect(mockStorage.refundStudioFreeQuota).not.toHaveBeenCalled();

    const okLog = state.generationLogs.find(
      (l) => l.toolKey === "flux_quick_pic" && l.status === "succeeded",
    );
    expect(okLog).toBeTruthy();

    // Output image attached to the session.
    expect(state.files.find((f) => f.fileType === "output_image")).toBeTruthy();
  });
});
