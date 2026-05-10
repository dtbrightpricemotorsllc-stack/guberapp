// task-606: Guard that GET /api/studio/tools is public — no auth required.
// task-612: Guard the in-process cache: second GET must hit cache, not DB;
//           admin tile-image PATCH must bust the cache so the next GET is fresh.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-t606";
process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "guber-test";
process.env.DISABLE_BACKGROUND_JOBS = "true";
process.env.FAL_KEY = process.env.FAL_KEY || "test-fal-key";

const TOOLS = [
  {
    toolKey: "wan_motion_5s",
    label: "Text → Video (5 s)",
    description: "Short cinematic clip",
    creditsCost: 30,
    durationSeconds: 5,
    tileImageUrl: null as string | null,
    active: true,
    providerEndpoint: "fal-ai/wan-motion",
    updatedAt: new Date(),
  },
];

vi.mock("../storage", () => ({
  storage: {
    getUser: vi.fn(async () => undefined),
    getUserByEmail: vi.fn(async () => undefined),
    listStudioModelPricing: vi.fn(async () => TOOLS),
    getStudioModelPricing: vi.fn(async () => TOOLS[0]),
    setStudioTileImage: vi.fn(async () => {}),
    createAuditLog: vi.fn(async () => ({})),
    // minimal stubs so registerRoutes() doesn't throw during boot
    getActiveStudioSession: vi.fn(async () => null),
    touchStudioSession: vi.fn(async () => {}),
  },
}));

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

vi.mock("../fal", () => ({
  isFalConfigured: () => false,
  isModerationConfigured: () => false,
  isOpenAITtsConfigured: () => false,
  moderatePrompt: vi.fn(),
  moderateImage: vi.fn(),
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

import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { registerRoutes } from "../routes";
import { storage } from "../storage";
import { invalidateStudioToolsCache } from "../studio-tools-cache";
import { registerAdminQaRoutes } from "../admin-qa";

let agent: ReturnType<typeof supertest>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  // No session middleware injected → req.session is undefined → requireAuth would 401
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  agent = supertest(app);
}, 30_000);

describe("GET /api/studio/tools — public endpoint (task-606)", () => {
  it("returns 200 with no session cookie attached", async () => {
    const res = await agent.get("/api/studio/tools");
    expect(res.status).toBe(200);
  });

  it("response body is a JSON array", async () => {
    const res = await agent.get("/api/studio/tools");
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("each item has the expected shape", async () => {
    const res = await agent.get("/api/studio/tools");
    expect(res.body.length).toBeGreaterThan(0);
    for (const tool of res.body) {
      expect(typeof tool.key).toBe("string");
      expect(typeof tool.label).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.creditsCost).toBe("number");
      expect(
        tool.durationSeconds === null || typeof tool.durationSeconds === "number",
      ).toBe(true);
      expect(
        tool.tileImageUrl === null || typeof tool.tileImageUrl === "string",
      ).toBe(true);
    }
  });

  it("returns the mocked tool data from storage", async () => {
    const res = await agent.get("/api/studio/tools");
    const tool = res.body.find((t: { key: string }) => t.key === "wan_motion_5s");
    expect(tool).toBeDefined();
    expect(tool.creditsCost).toBe(30);
    expect(tool.durationSeconds).toBe(5);
    expect(tool.tileImageUrl).toBeNull();
  });
});

// task-612: cache hit + cache-bust invariants.
// A separate admin app mounts registerAdminQaRoutes with a pass-through
// requireAdmin so we can call the PATCH without a real session.

describe("GET /api/studio/tools — cache behaviour (task-612)", () => {
  let adminAgent: ReturnType<typeof supertest>;

  beforeAll(() => {
    const adminApp = express();
    adminApp.use(express.json());
    const allowAdmin = (_req: Request, _res: Response, next: NextFunction) => next();
    registerAdminQaRoutes(adminApp, allowAdmin);
    adminAgent = supertest(adminApp);
  });

  beforeEach(() => {
    invalidateStudioToolsCache();
    vi.mocked(storage.listStudioModelPricing).mockClear();
  });

  it("second GET is served from cache — DB queried only once", async () => {
    await agent.get("/api/studio/tools");
    await agent.get("/api/studio/tools");

    expect(vi.mocked(storage.listStudioModelPricing)).toHaveBeenCalledTimes(1);
  });

  it("PATCH tile-image busts the cache so the next GET returns the updated tileImageUrl", async () => {
    const NEW_URL = "https://res.cloudinary.com/demo/image/upload/updated-tile.jpg";

    const warmRes = await agent.get("/api/studio/tools");
    expect(warmRes.body[0].tileImageUrl).toBeNull();

    vi.mocked(storage.listStudioModelPricing).mockResolvedValueOnce([
      { ...TOOLS[0], tileImageUrl: NEW_URL },
    ]);

    const patchRes = await adminAgent
      .patch("/api/admin/studio/tools/wan_motion_5s/tile-image")
      .send({ imageUrl: NEW_URL });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.tileImageUrl).toBe(NEW_URL);

    const getRes = await agent.get("/api/studio/tools");
    const tool = getRes.body.find((t: { key: string }) => t.key === "wan_motion_5s");
    expect(tool.tileImageUrl).toBe(NEW_URL);
    expect(vi.mocked(storage.listStudioModelPricing)).toHaveBeenCalledTimes(2);
  });
});
