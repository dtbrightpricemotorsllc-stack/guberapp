// task-533: lock down the Studio refund path. Studio /api/studio/generate/*
// endpoints deduct credits BEFORE calling Fal.ai and must refund the exact
// amount on any provider failure (502 path in runStudioGeneration). With the
// task-519 prices (80/30/60/5 cr) a regression that "forgets" the refund
// silently wipes user balances. This test stubs the Fal provider to throw and
// asserts that the user's studio_credits balance is unchanged after the 502.
//
// Covers:
//   • wan_motion_5s (30 cr) — the cheapest video tier
//   • minimax_music (5 cr) — the music tier (different code path / pricing)

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-1234567890";
process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "guber-test";
process.env.DISABLE_BACKGROUND_JOBS = "true";
process.env.FAL_KEY = process.env.FAL_KEY || "test-fal-key";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const USER_ID = 999_999_901;
const STARTING_BALANCE = 1000;

const state = vi.hoisted(() => ({
  users: new Map<number, any>(),
  pricing: new Map<string, any>(),
  sessions: [] as any[],
  files: [] as any[],
  generationLogs: [] as any[],
  nextSessionId: 1,
  nextFileId: 1,
}));

const mockStorage = vi.hoisted(() => ({
  getUser: vi.fn(async (id: number) => state.users.get(id)),
  getUserByEmail: vi.fn(async () => undefined),

  // Studio credit ledger — atomic-ish in-memory mirror of the real Postgres
  // conditional update. decrement returns null on insufficient funds.
  incrementStudioCredits: vi.fn(async (userId: number, amount: number) => {
    const u = state.users.get(userId);
    if (!u) return 0;
    u.studioCredits = (u.studioCredits ?? 0) + amount;
    return u.studioCredits;
  }),
  decrementStudioCredits: vi.fn(async (userId: number, amount: number) => {
    const u = state.users.get(userId);
    if (!u) return null;
    const cur = u.studioCredits ?? 0;
    if (cur < amount) return null;
    u.studioCredits = cur - amount;
    return u.studioCredits;
  }),

  // Pricing
  getStudioModelPricing: vi.fn(async (toolKey: string) => state.pricing.get(toolKey)),

  // Sessions + files (just enough for ensureStudioSession + addStudioSessionFile)
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

// Fal mock — provider available + moderation passes; the tool generators ALL
// throw so we exercise the refund branch.
class FakeFalNotConfiguredError extends Error {
  constructor() { super("not configured"); this.name = "FalNotConfiguredError"; }
}
class FakeModerationUnavailableError extends Error {
  constructor() { super("mod offline"); this.name = "ModerationUnavailableError"; }
}

const generateWanMotion = vi.hoisted(() => vi.fn());
const generateMiniMaxMusic = vi.hoisted(() => vi.fn());
const generateKlingMotionControl = vi.hoisted(() => vi.fn());
const generateMirrorMotion = vi.hoisted(() => vi.fn());
const generateOpenAITts = vi.hoisted(() => vi.fn());

class FakeOpenAITtsUnavailableError extends Error {
  constructor(msg = "tts offline") { super(msg); this.name = "OpenAITtsUnavailableError"; }
}

vi.mock("../fal", () => ({
  isFalConfigured: () => true,
  isModerationConfigured: () => true,
  isOpenAITtsConfigured: () => true,
  moderatePrompt: vi.fn(async () => ({ flagged: false, reason: null })),
  moderateImage: vi.fn(async () => ({ flagged: false, reason: null })),
  ModerationUnavailableError: FakeModerationUnavailableError,
  FalNotConfiguredError: FakeFalNotConfiguredError,
  OpenAITtsUnavailableError: FakeOpenAITtsUnavailableError,
  generateWanMotion,
  generateMiniMaxMusic,
  generateKlingMotionControl,
  generateMirrorMotion,
  generateOpenAITts,
  generateFluxQuickPic: vi.fn(),
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

function resetUser(balance = STARTING_BALANCE) {
  state.users.clear();
  state.users.set(USER_ID, {
    id: USER_ID,
    role: "buyer",
    deletedAt: null,
    studioCredits: balance,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Studio refund path (task-533)", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    state.pricing.set("wan_motion_5s", {
      toolKey: "wan_motion_5s",
      creditsCost: 30,
      durationSeconds: 5,
      active: true,
    });
    state.pricing.set("minimax_music", {
      toolKey: "minimax_music",
      creditsCost: 5,
      durationSeconds: null,
      active: true,
    });
    // task-536: Mirror Motion uses creditsCostOverride: 16 * dur, so the
    // base pricing.creditsCost is irrelevant — we just need the row to exist
    // so runStudioGeneration() doesn't 400 on "Unknown tool.".
    state.pricing.set("mirror_motion", {
      toolKey: "mirror_motion",
      creditsCost: 0,
      durationSeconds: null,
      active: true,
    });
    // task-537: Commercial Builder is a 3-step pipeline (motion + music +
    // optional voiceover). It debits the bundle price (200 cr) up front and
    // must refund the FULL amount if any required step fails.
    state.pricing.set("commercial_builder", {
      toolKey: "commercial_builder",
      creditsCost: 200,
      durationSeconds: 10,
      active: true,
    });
    agent = await buildAgent();
  });

  beforeEach(() => {
    resetUser(STARTING_BALANCE);
    state.sessions.length = 0;
    state.files.length = 0;
    state.generationLogs.length = 0;
    state.nextSessionId = 1;
    state.nextFileId = 1;
    currentUserId = USER_ID;
    generateWanMotion.mockReset();
    generateMiniMaxMusic.mockReset();
    generateKlingMotionControl.mockReset();
    generateMirrorMotion.mockReset();
    generateOpenAITts.mockReset();
    mockStorage.incrementStudioCredits.mockClear();
    mockStorage.decrementStudioCredits.mockClear();
  });

  it("refunds wan_motion_5s (30 cr) when the Fal provider throws", async () => {
    generateWanMotion.mockRejectedValueOnce(new Error("Fal upstream timeout"));

    const res = await agent
      .post("/api/studio/generate/wan-motion")
      .send({ prompt: "a cinematic neon alley", durationSeconds: 5 })
      .expect(502);

    // The user's balance should be exactly what it started at.
    expect(state.users.get(USER_ID)!.studioCredits).toBe(STARTING_BALANCE);
    // Server reports the post-refund balance back to the client.
    expect(res.body.balance).toBe(STARTING_BALANCE);
    expect(res.body.message).toMatch(/credit was returned/i);

    // We must have called both decrement (30) and increment (30).
    expect(mockStorage.decrementStudioCredits).toHaveBeenCalledWith(USER_ID, 30);
    expect(mockStorage.incrementStudioCredits).toHaveBeenCalledWith(USER_ID, 30);

    // A "refunded" generation log row was written.
    const refundLog = state.generationLogs.find(
      (l) => l.toolKey === "wan_motion_5s" && l.status === "refunded",
    );
    expect(refundLog).toBeTruthy();
    expect(refundLog.creditsCost).toBe(30);
    expect(refundLog.errorReason).toMatch(/Fal upstream timeout/);

    // No output file was attached to the session.
    expect(state.files.find((f) => f.fileType === "output_video")).toBeUndefined();
  });

  it("refunds minimax_music (5 cr) when the Fal provider throws", async () => {
    generateMiniMaxMusic.mockRejectedValueOnce(new Error("Music model exploded"));

    const res = await agent
      .post("/api/studio/generate/music")
      .send({ prompt: "lofi guitar over rain" })
      .expect(502);

    expect(state.users.get(USER_ID)!.studioCredits).toBe(STARTING_BALANCE);
    expect(res.body.balance).toBe(STARTING_BALANCE);
    expect(res.body.message).toMatch(/credit was returned/i);

    expect(mockStorage.decrementStudioCredits).toHaveBeenCalledWith(USER_ID, 5);
    expect(mockStorage.incrementStudioCredits).toHaveBeenCalledWith(USER_ID, 5);

    const refundLog = state.generationLogs.find(
      (l) => l.toolKey === "minimax_music" && l.status === "refunded",
    );
    expect(refundLog).toBeTruthy();
    expect(refundLog.creditsCost).toBe(5);
    expect(refundLog.errorReason).toMatch(/Music model exploded/);
  });

  // task-536: Mirror Motion is the only Studio tool with a per-call variable
  // price (creditsCostOverride: 16 * dur). A regression that hardcodes the
  // refund amount (e.g. always 80 cr) would short-change 10s callers by 80 cr.
  // These tests assert decrement AND increment are each called with the
  // duration-specific amount on a provider failure.
  describe.each([
    { dur: 5,  expectedCost: 80 },
    { dur: 10, expectedCost: 160 },
  ])("mirror_motion ($durs → $expectedCost cr) refund", ({ dur, expectedCost }) => {
    it("refunds the exact duration-priced amount when Fal throws", async () => {
      // Mirror Motion requires a reference image — seed one in the session.
      const sessionRow = await mockStorage.createStudioSession(USER_ID);
      const refImage = await mockStorage.addStudioSessionFile({
        sessionId: sessionRow.id,
        userId: USER_ID,
        fileType: "reference_image",
        providerUrl: "https://example.com/photo.jpg",
        cloudinaryPublicId: "ref/photo",
        resourceType: "image",
        meta: {},
      });
      // Reset call history AFTER seeding so the seeding decrement/increment
      // calls (there are none, but be defensive) don't pollute assertions.
      mockStorage.incrementStudioCredits.mockClear();
      mockStorage.decrementStudioCredits.mockClear();

      generateMirrorMotion.mockRejectedValueOnce(new Error(`Mirror upstream boom @${dur}s`));

      const res = await agent
        .post("/api/studio/generate/mirror-motion")
        .send({
          prompt: "mirror the dance",
          sourceFileId: refImage.id,
          motionVideoUrl: "https://example.com/reference.mp4",
          durationSeconds: dur,
          audioRightsConfirmed: true,
        })
        .expect(502);

      // Balance fully restored.
      expect(state.users.get(USER_ID)!.studioCredits).toBe(STARTING_BALANCE);
      expect(res.body.balance).toBe(STARTING_BALANCE);
      expect(res.body.message).toMatch(/credit was returned/i);

      // Both decrement and refund used the duration-specific amount. A
      // regression that hardcodes either side to 80 would pass dur=5 but
      // fail dur=10 (and vice versa).
      expect(mockStorage.decrementStudioCredits).toHaveBeenCalledTimes(1);
      expect(mockStorage.incrementStudioCredits).toHaveBeenCalledTimes(1);
      expect(mockStorage.decrementStudioCredits).toHaveBeenCalledWith(USER_ID, expectedCost);
      expect(mockStorage.incrementStudioCredits).toHaveBeenCalledWith(USER_ID, expectedCost);

      const refundLog = state.generationLogs.find(
        (l) => l.toolKey === "mirror_motion" && l.status === "refunded",
      );
      expect(refundLog).toBeTruthy();
      expect(refundLog.creditsCost).toBe(expectedCost);
      expect(refundLog.errorReason).toMatch(new RegExp(`Mirror upstream boom @${dur}s`));

      // No output video was attached.
      expect(state.files.find((f) => f.fileType === "output_video")).toBeUndefined();
    });
  });

  // Sanity check: the success path does NOT refund. Without this companion
  // assertion a buggy implementation that "always refunds" would still pass
  // the failure tests above.
  it("does NOT refund when the provider succeeds", async () => {
    generateMiniMaxMusic.mockResolvedValueOnce({
      audioUrl: "https://example.com/track.mp3",
      jobId: "fal_job_ok",
    });

    const res = await agent
      .post("/api/studio/generate/music")
      .send({ prompt: "warm jazz" })
      .expect(200);

    expect(state.users.get(USER_ID)!.studioCredits).toBe(STARTING_BALANCE - 5);
    expect(res.body.balance).toBe(STARTING_BALANCE - 5);
    expect(mockStorage.incrementStudioCredits).not.toHaveBeenCalled();

    const okLog = state.generationLogs.find(
      (l) => l.toolKey === "minimax_music" && l.status === "succeeded",
    );
    expect(okLog).toBeTruthy();
  });

  // task-537: /api/studio/generate/commercial debits the 200-cr bundle up
  // front, then runs (1) Kling motion-control, (2) MiniMax music (1 retry),
  // (3) optional OpenAI TTS voiceover. Any of the 3 steps failing must
  // refund the FULL 200 cr — a regression that refunds only one step's
  // price would silently drain users by ~120-195 cr per failed commercial.
  describe("Commercial Builder refund (task-537)", () => {
    const COMMERCIAL_BUNDLE = 200;

    async function seedProductPhoto() {
      const sessionRow = await mockStorage.createStudioSession(USER_ID);
      const photo = await mockStorage.addStudioSessionFile({
        sessionId: sessionRow.id,
        userId: USER_ID,
        fileType: "upload_image",
        providerUrl: "https://example.com/product.jpg",
        cloudinaryPublicId: "uploads/product",
        resourceType: "image",
        meta: {},
      });
      mockStorage.incrementStudioCredits.mockClear();
      mockStorage.decrementStudioCredits.mockClear();
      return photo;
    }

    function bodyFor(photoId: number, opts: { withVoice?: boolean } = {}) {
      return {
        vertical: "auto-repair",
        businessName: "Acme Auto",
        businessDescription: "Family-owned shop fixing cars since 1992.",
        ctaText: "Call us today!",
        productPhotoFileId: photoId,
        ...(opts.withVoice ? { voiceId: "alloy" } : {}),
      };
    }

    it("refunds the full 200-cr bundle when the motion-control step fails", async () => {
      const photo = await seedProductPhoto();
      generateKlingMotionControl.mockRejectedValueOnce(new Error("Kling 503"));

      const res = await agent
        .post("/api/studio/generate/commercial")
        .send(bodyFor(photo.id))
        .expect(502);

      expect(state.users.get(USER_ID)!.studioCredits).toBe(STARTING_BALANCE);
      expect(res.body.balance).toBe(STARTING_BALANCE);
      expect(res.body.message).toMatch(/credits were returned/i);

      expect(mockStorage.decrementStudioCredits).toHaveBeenCalledTimes(1);
      expect(mockStorage.incrementStudioCredits).toHaveBeenCalledTimes(1);
      expect(mockStorage.decrementStudioCredits).toHaveBeenCalledWith(USER_ID, COMMERCIAL_BUNDLE);
      expect(mockStorage.incrementStudioCredits).toHaveBeenCalledWith(USER_ID, COMMERCIAL_BUNDLE);

      expect(generateMiniMaxMusic).not.toHaveBeenCalled();
      expect(generateOpenAITts).not.toHaveBeenCalled();

      const refundLog = state.generationLogs.find(
        (l) => l.toolKey === "commercial_builder" && l.status === "refunded",
      );
      expect(refundLog).toBeTruthy();
      expect(refundLog.creditsCost).toBe(COMMERCIAL_BUNDLE);
      expect(refundLog.errorReason).toMatch(/Motion render failed.*Kling 503/);

      // No output files attached to the session.
      expect(state.files.find((f) => f.fileType === "output_video")).toBeUndefined();
      expect(state.files.find((f) => f.fileType === "output_audio")).toBeUndefined();
    });

    it("refunds the full 200-cr bundle when the music step fails twice", async () => {
      const photo = await seedProductPhoto();
      generateKlingMotionControl.mockResolvedValueOnce({
        videoUrl: "https://example.com/motion.mp4",
        jobId: "kling_ok_1",
      });
      // The route retries music exactly once (attempts 1 + 2).
      generateMiniMaxMusic
        .mockRejectedValueOnce(new Error("Music boom A"))
        .mockRejectedValueOnce(new Error("Music boom B"));

      const res = await agent
        .post("/api/studio/generate/commercial")
        .send(bodyFor(photo.id))
        .expect(502);

      expect(state.users.get(USER_ID)!.studioCredits).toBe(STARTING_BALANCE);
      expect(res.body.balance).toBe(STARTING_BALANCE);
      expect(res.body.message).toMatch(/credits were returned/i);

      expect(mockStorage.decrementStudioCredits).toHaveBeenCalledTimes(1);
      expect(mockStorage.incrementStudioCredits).toHaveBeenCalledTimes(1);
      expect(mockStorage.decrementStudioCredits).toHaveBeenCalledWith(USER_ID, COMMERCIAL_BUNDLE);
      expect(mockStorage.incrementStudioCredits).toHaveBeenCalledWith(USER_ID, COMMERCIAL_BUNDLE);

      expect(generateMiniMaxMusic).toHaveBeenCalledTimes(2);
      expect(generateOpenAITts).not.toHaveBeenCalled();

      const refundLog = state.generationLogs.find(
        (l) => l.toolKey === "commercial_builder" && l.status === "refunded",
      );
      expect(refundLog).toBeTruthy();
      expect(refundLog.creditsCost).toBe(COMMERCIAL_BUNDLE);
      expect(refundLog.errorReason).toMatch(/Music render failed twice.*Music boom B/);

      // No output rows committed (motion was generated but rolled back).
      expect(state.files.find((f) => f.fileType === "output_video")).toBeUndefined();
      expect(state.files.find((f) => f.fileType === "output_audio")).toBeUndefined();
    });

    it("refunds the full 200-cr bundle when the voiceover step fails", async () => {
      const photo = await seedProductPhoto();
      generateKlingMotionControl.mockResolvedValueOnce({
        videoUrl: "https://example.com/motion.mp4",
        jobId: "kling_ok_3",
      });
      generateMiniMaxMusic.mockResolvedValueOnce({
        audioUrl: "https://example.com/music.mp3",
        jobId: "minimax_ok_3",
      });
      generateOpenAITts.mockRejectedValueOnce(new Error("TTS exploded"));

      const res = await agent
        .post("/api/studio/generate/commercial")
        .send(bodyFor(photo.id, { withVoice: true }))
        .expect(502);

      expect(state.users.get(USER_ID)!.studioCredits).toBe(STARTING_BALANCE);
      expect(res.body.balance).toBe(STARTING_BALANCE);
      expect(res.body.message).toMatch(/credits were returned/i);

      expect(mockStorage.decrementStudioCredits).toHaveBeenCalledTimes(1);
      expect(mockStorage.incrementStudioCredits).toHaveBeenCalledTimes(1);
      expect(mockStorage.decrementStudioCredits).toHaveBeenCalledWith(USER_ID, COMMERCIAL_BUNDLE);
      expect(mockStorage.incrementStudioCredits).toHaveBeenCalledWith(USER_ID, COMMERCIAL_BUNDLE);

      const refundLog = state.generationLogs.find(
        (l) => l.toolKey === "commercial_builder" && l.status === "refunded",
      );
      expect(refundLog).toBeTruthy();
      expect(refundLog.creditsCost).toBe(COMMERCIAL_BUNDLE);
      expect(refundLog.errorReason).toMatch(/Voiceover failed.*TTS exploded/);

      // Motion + music were generated but rolled back — no output files
      // attached to the session.
      expect(state.files.find((f) => f.fileType === "output_video")).toBeUndefined();
      expect(state.files.find((f) => f.fileType === "output_audio")).toBeUndefined();
    });
  });
});
