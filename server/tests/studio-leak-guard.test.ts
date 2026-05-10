// task-545: storage leak guard for runStudioGeneration() + commercial builder.
//
// The weekly orphan janitor (task-542) is a safety net for Cloudinary assets
// that leak when a Studio code path forgets to either:
//   (a) persist an upload's publicId into studio_session_files, OR
//   (b) destroy it after a downstream failure.
//
// This test exercises every Studio failure mode that re-hosts to Cloudinary
// BEFORE failing, and asserts the no-orphan invariant:
//
//     { every public_id passed to cloudinary.uploader.upload }
//       ===
//     { public_ids persisted to studio_session_files }
//        ∪ { public_ids passed to cloudinary.uploader.destroy }
//
// Cases covered:
//   1. Motion-control (Kling) failure AFTER reference image upload — ref
//      image is persisted, no provider asset created → no orphans.
//   2. wan-motion provider success but DB write failure for the output row
//      → the rehosted video must be destroyed.
//   3. Music-only failure (provider throws) → never reaches Cloudinary, but
//      assertion still trivially holds.
//   4. Music success + DB write failure → rehosted audio must be destroyed.
//   5. Commercial multi-asset partial failure (motion ok, music fails) →
//      rehosted motion clip must be destroyed.
//   6. Commercial all 3 steps succeed but post-pipeline DB write throws →
//      all 3 rehosted assets (motion + music + voice) must be destroyed.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-1234567890";
process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "guber-test";
process.env.DISABLE_BACKGROUND_JOBS = "true";
process.env.FAL_KEY = process.env.FAL_KEY || "test-fal-key";

const USER_ID = 999_999_902;
const STARTING_BALANCE = 1000;

const state = vi.hoisted(() => ({
  users: new Map<number, any>(),
  pricing: new Map<string, any>(),
  sessions: [] as any[],
  files: [] as any[],
  generationLogs: [] as any[],
  nextSessionId: 1,
  nextFileId: 1,
  uploadCounter: 0,
}));

const mockStorage = vi.hoisted(() => ({
  getUser: vi.fn(async (id: number) => state.users.get(id)),
  getUserByEmail: vi.fn(async () => undefined),

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

class FakeFalNotConfiguredError extends Error {
  constructor() { super("not configured"); this.name = "FalNotConfiguredError"; }
}
class FakeModerationUnavailableError extends Error {
  constructor() { super("mod offline"); this.name = "ModerationUnavailableError"; }
}
class FakeOpenAITtsUnavailableError extends Error {
  constructor(msg = "tts offline") { super(msg); this.name = "OpenAITtsUnavailableError"; }
}

const generateWanMotion = vi.hoisted(() => vi.fn());
const generateMiniMaxMusic = vi.hoisted(() => vi.fn());
const generateKlingMotionControl = vi.hoisted(() => vi.fn());
const generateMirrorMotion = vi.hoisted(() => vi.fn());
const generateOpenAITts = vi.hoisted(() => vi.fn());

// Cloudinary mock — every reHost MUST funnel through these stubs. The leak
// guard relies on us seeing every upload + every destroy.
const cloudinaryUpload = vi.hoisted(() => vi.fn(async (_url: string, opts: any) => {
  state.uploadCounter++;
  return {
    secure_url: `https://cloudinary.test/${opts.folder}/asset_${state.uploadCounter}.bin`,
    public_id: `${opts.folder}/asset_${state.uploadCounter}`,
  };
}));
const cloudinaryDestroy = vi.hoisted(() => vi.fn(async () => ({ result: "ok" })));

vi.mock("../cloudinary.js", () => ({
  default: { uploader: { upload: cloudinaryUpload, destroy: cloudinaryDestroy } },
}));
vi.mock("../cloudinary", () => ({
  default: { uploader: { upload: cloudinaryUpload, destroy: cloudinaryDestroy } },
}));

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

import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { registerRoutes } from "../routes";

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

// Pull every public_id we handed out from the upload mock's resolved values.
async function uploadedPublicIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const result of cloudinaryUpload.mock.results) {
    if (result.type === "return") {
      const value = await result.value;
      if (value?.public_id) ids.add(String(value.public_id));
    }
  }
  return ids;
}

function destroyedPublicIds(): Set<string> {
  return new Set(cloudinaryDestroy.mock.calls.map((c: any[]) => String(c[0])));
}

function persistedPublicIds(): Set<string> {
  const ids = new Set<string>();
  for (const f of state.files) {
    if (f.cloudinaryPublicId) ids.add(String(f.cloudinaryPublicId));
  }
  return ids;
}

// The core invariant: no Cloudinary asset we created is left both unreferenced
// AND not destroyed. A leak == upload that is neither persisted nor destroyed.
async function assertNoOrphans() {
  const uploaded = await uploadedPublicIds();
  const persisted = persistedPublicIds();
  const destroyed = destroyedPublicIds();
  const orphans = [...uploaded].filter((id) => !persisted.has(id) && !destroyed.has(id));
  expect(orphans, `orphan publicIds (uploaded but neither persisted nor destroyed): ${orphans.join(", ")}`).toEqual([]);
}

describe("Studio storage leak guard (task-545)", () => {
  let agent: ReturnType<typeof supertest>;

  beforeAll(async () => {
    state.pricing.set("wan_motion_5s", { toolKey: "wan_motion_5s", creditsCost: 30, durationSeconds: 5, active: true });
    state.pricing.set("minimax_music", { toolKey: "minimax_music", creditsCost: 5, durationSeconds: null, active: true });
    state.pricing.set("kling_motion_control", { toolKey: "kling_motion_control", creditsCost: 80, durationSeconds: 5, active: true });
    state.pricing.set("commercial_builder", { toolKey: "commercial_builder", creditsCost: 200, durationSeconds: 10, active: true });
    agent = await buildAgent();
  });

  beforeEach(() => {
    resetUser(STARTING_BALANCE);
    state.sessions.length = 0;
    state.files.length = 0;
    state.generationLogs.length = 0;
    state.nextSessionId = 1;
    state.nextFileId = 1;
    state.uploadCounter = 0;
    currentUserId = USER_ID;
    generateWanMotion.mockReset();
    generateMiniMaxMusic.mockReset();
    generateKlingMotionControl.mockReset();
    generateMirrorMotion.mockReset();
    generateOpenAITts.mockReset();
    mockStorage.incrementStudioCredits.mockClear();
    mockStorage.decrementStudioCredits.mockClear();
    mockStorage.addStudioSessionFile.mockClear();
    mockStorage.touchStudioSession.mockReset();
    mockStorage.touchStudioSession.mockImplementation(async (_id: number) => {});
    mockStorage.logStudioGeneration.mockClear();
    cloudinaryUpload.mockClear();
    cloudinaryDestroy.mockClear();
  });

  // ── Case 1: provider failure with no upload yet ─────────────────────────────
  // When the provider throws BEFORE we re-host, there is nothing to leak.
  // The invariant should still hold trivially.
  it("motion-control fails before any Cloudinary upload happens — no orphans", async () => {
    // Seed a reference image (persisted by the upload route in real use; here
    // we just create the row directly).
    const sessionRow = await mockStorage.createStudioSession(USER_ID);
    const refImage = await mockStorage.addStudioSessionFile({
      sessionId: sessionRow.id,
      userId: USER_ID,
      fileType: "reference_image",
      providerUrl: "https://example.com/photo.jpg",
      cloudinaryPublicId: "guber-studio-v2-uploads/ref_photo",
      resourceType: "image",
      meta: {},
    });
    cloudinaryUpload.mockClear();

    generateKlingMotionControl.mockRejectedValueOnce(new Error("Kling 503"));

    await agent
      .post("/api/studio/generate/motion-control")
      .send({ prompt: "drift through the alley", sourceFileId: refImage.id, durationSeconds: 5 })
      .expect(502);

    expect(cloudinaryUpload).not.toHaveBeenCalled();
    await assertNoOrphans();
    // Refund happened.
    expect(state.users.get(USER_ID)!.studioCredits).toBe(STARTING_BALANCE);
  });

  // ── Case 2: wan-motion success + DB row write throws ────────────────────────
  // Provider returns a video, route re-hosts to Cloudinary, then the DB write
  // throws. The rehosted video MUST be destroyed.
  it("wan-motion DB write fails after rehost — rehosted video is destroyed (no orphans)", async () => {
    generateWanMotion.mockResolvedValueOnce({
      videoUrl: "https://example.com/wan.mp4",
      jobId: "wan_db_fail",
    });
    const realAdd = mockStorage.addStudioSessionFile.getMockImplementation()!;
    mockStorage.addStudioSessionFile.mockImplementationOnce(async () => {
      throw new Error("DB write exploded after rehost");
    });
    mockStorage.addStudioSessionFile.mockImplementation(realAdd);

    await agent
      .post("/api/studio/generate/wan-motion")
      .send({ prompt: "neon alley", durationSeconds: 5 })
      .expect(502);

    expect(cloudinaryUpload).toHaveBeenCalledTimes(1);
    expect(cloudinaryDestroy).toHaveBeenCalledTimes(1);
    await assertNoOrphans();
    // Refund happened.
    expect(state.users.get(USER_ID)!.studioCredits).toBe(STARTING_BALANCE);
  });

  // ── Case 3: music-only provider failure (no upload, no leak) ────────────────
  it("music-only provider failure happens before any upload — no orphans", async () => {
    generateMiniMaxMusic.mockRejectedValueOnce(new Error("Music model exploded"));

    await agent
      .post("/api/studio/generate/music")
      .send({ prompt: "lofi guitar over rain" })
      .expect(502);

    expect(cloudinaryUpload).not.toHaveBeenCalled();
    await assertNoOrphans();
    expect(state.users.get(USER_ID)!.studioCredits).toBe(STARTING_BALANCE);
  });

  // ── Case 4: music success + DB write fails after rehost ─────────────────────
  it("music DB write fails after rehost — rehosted audio is destroyed (no orphans)", async () => {
    generateMiniMaxMusic.mockResolvedValueOnce({
      audioUrl: "https://example.com/track.mp3",
      jobId: "music_db_fail",
    });
    const realAdd = mockStorage.addStudioSessionFile.getMockImplementation()!;
    mockStorage.addStudioSessionFile.mockImplementationOnce(async () => {
      throw new Error("DB write exploded after music rehost");
    });
    mockStorage.addStudioSessionFile.mockImplementation(realAdd);

    await agent
      .post("/api/studio/generate/music")
      .send({ prompt: "warm jazz" })
      .expect(502);

    expect(cloudinaryUpload).toHaveBeenCalledTimes(1);
    expect(cloudinaryDestroy).toHaveBeenCalledTimes(1);
    await assertNoOrphans();
    expect(state.users.get(USER_ID)!.studioCredits).toBe(STARTING_BALANCE);
  });

  // ── Case 5: commercial multi-asset partial failure ──────────────────────────
  // Motion succeeds + uploads; music fails twice. Motion clip must be destroyed.
  it("commercial — motion uploaded, music fails twice — motion clip is destroyed (no orphans)", async () => {
    const sessionRow = await mockStorage.createStudioSession(USER_ID);
    const photo = await mockStorage.addStudioSessionFile({
      sessionId: sessionRow.id,
      userId: USER_ID,
      fileType: "upload_image",
      providerUrl: "https://example.com/product.jpg",
      cloudinaryPublicId: "guber-studio-v2-uploads/product",
      resourceType: "image",
      meta: {},
    });
    cloudinaryUpload.mockClear();

    generateKlingMotionControl.mockResolvedValueOnce({
      videoUrl: "https://example.com/motion.mp4",
      jobId: "kling_ok",
    });
    generateMiniMaxMusic
      .mockRejectedValueOnce(new Error("Music boom A"))
      .mockRejectedValueOnce(new Error("Music boom B"));

    await agent
      .post("/api/studio/generate/commercial")
      .send({
        vertical: "auto-repair",
        businessName: "Acme Auto",
        businessDescription: "Family-owned shop fixing cars since 1992.",
        ctaText: "Call us today!",
        productPhotoFileId: photo.id,
      })
      .expect(502);

    // Motion was uploaded; music never reached Cloudinary.
    expect(cloudinaryUpload).toHaveBeenCalledTimes(1);
    expect(cloudinaryDestroy).toHaveBeenCalledTimes(1);
    await assertNoOrphans();
    expect(state.users.get(USER_ID)!.studioCredits).toBe(STARTING_BALANCE);
  });

  // ── Case 6: commercial all 3 steps succeed, post-pipeline DB row fails ──────
  // The outer catch must destroy every asset we created (motion + music + voice).
  it("commercial — all 3 providers succeed but post-pipeline DB write fails — every rehosted asset destroyed", async () => {
    const sessionRow = await mockStorage.createStudioSession(USER_ID);
    const photo = await mockStorage.addStudioSessionFile({
      sessionId: sessionRow.id,
      userId: USER_ID,
      fileType: "upload_image",
      providerUrl: "https://example.com/product.jpg",
      cloudinaryPublicId: "guber-studio-v2-uploads/product",
      resourceType: "image",
      meta: {},
    });
    cloudinaryUpload.mockClear();

    generateKlingMotionControl.mockResolvedValueOnce({
      videoUrl: "https://example.com/motion.mp4",
      jobId: "kling_ok_outer",
    });
    generateMiniMaxMusic.mockResolvedValueOnce({
      audioUrl: "https://example.com/music.mp3",
      jobId: "minimax_ok_outer",
    });
    generateOpenAITts.mockResolvedValueOnce({
      dataUrl: "data:audio/mp3;base64,AAAA",
    });

    // First addStudioSessionFile call AFTER providers succeed = motion row write.
    const realAdd = mockStorage.addStudioSessionFile.getMockImplementation()!;
    mockStorage.addStudioSessionFile.mockImplementationOnce(async () => {
      throw new Error("DB hiccup writing motion row");
    });
    mockStorage.addStudioSessionFile.mockImplementation(realAdd);

    await agent
      .post("/api/studio/generate/commercial")
      .send({
        vertical: "auto-repair",
        businessName: "Acme Auto",
        businessDescription: "Family-owned shop fixing cars since 1992.",
        ctaText: "Call us today!",
        productPhotoFileId: photo.id,
        voiceId: "alloy",
      })
      .expect(500);

    // 3 uploads (motion, music, voice). Each must be destroyed by the outer catch.
    expect(cloudinaryUpload).toHaveBeenCalledTimes(3);
    expect(cloudinaryDestroy).toHaveBeenCalledTimes(3);
    await assertNoOrphans();
    expect(state.users.get(USER_ID)!.studioCredits).toBe(STARTING_BALANCE);
  });

  // ── Case 7: moderation block fires before any provider/upload runs ──────────
  // Moderation rejection happens BEFORE the credit debit and BEFORE any
  // provider call, so there's nothing to leak. Documenting this explicitly
  // because the task narrative calls out moderation block as a failure path
  // worth guarding against.
  it("prompt moderation block — no provider call, no upload, no orphans", async () => {
    const fal = await import("../fal");
    (fal.moderatePrompt as any).mockResolvedValueOnce({ flagged: true, reason: "blocked" });

    await agent
      .post("/api/studio/generate/wan-motion")
      .send({ prompt: "obviously disallowed", durationSeconds: 5 })
      .expect((res) => {
        // 400/403 — exact code is moderation policy; either way no provider.
        if (![400, 403, 422].includes(res.status)) {
          throw new Error(`expected moderation block status, got ${res.status}`);
        }
      });

    expect(generateWanMotion).not.toHaveBeenCalled();
    expect(cloudinaryUpload).not.toHaveBeenCalled();
    expect(cloudinaryDestroy).not.toHaveBeenCalled();
    await assertNoOrphans();
    // No credit motion either.
    expect(state.users.get(USER_ID)!.studioCredits).toBe(STARTING_BALANCE);
    expect(mockStorage.decrementStudioCredits).not.toHaveBeenCalled();

    // Reset moderation mock for subsequent tests.
    (fal.moderatePrompt as any).mockReset();
    (fal.moderatePrompt as any).mockImplementation(async () => ({ flagged: false, reason: null }));
  });

  // ── Sanity: the success path keeps assets (and the invariant still holds) ───
  it("wan-motion success — asset is persisted (no orphans, no destroys)", async () => {
    generateWanMotion.mockResolvedValueOnce({
      videoUrl: "https://example.com/wan-ok.mp4",
      jobId: "wan_ok",
    });

    await agent
      .post("/api/studio/generate/wan-motion")
      .send({ prompt: "calm forest", durationSeconds: 5 })
      .expect(200);

    expect(cloudinaryUpload).toHaveBeenCalledTimes(1);
    expect(cloudinaryDestroy).not.toHaveBeenCalled();
    await assertNoOrphans();
  });
});
