// task-610: Guard that admin CRUD routes for featured clips require admin auth.
//
// Strategy: boot the real registerRoutes() with external services mocked out
// (same pattern as studio-featured.test.ts / task-609), then hit each admin
// endpoint without any session cookie.  If requireAdmin is ever accidentally
// removed from a route, the test will return 200 and fail.

import { describe, it, expect, beforeAll, vi } from "vitest";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-t610";
process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "guber-test";
process.env.DISABLE_BACKGROUND_JOBS = "true";
process.env.FAL_KEY = process.env.FAL_KEY || "test-fal-key";

vi.mock("../storage", () => ({
  storage: {
    getUser: vi.fn(async () => undefined),
    getUserByEmail: vi.fn(async () => undefined),
    listStudioFeaturedClips: vi.fn(async () => []),
    listStudioModelPricing: vi.fn(async () => []),
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

let agent: ReturnType<typeof supertest>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  // No session middleware injected → req.session is undefined → requireAdmin blocks with 401/403
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  agent = supertest(app);
}, 30_000);

describe("Admin featured-clips CRUD — auth guard (task-610)", () => {
  it("GET /api/admin/studio/featured returns 401 or 403 without a session", async () => {
    const res = await agent.get("/api/admin/studio/featured");
    expect([401, 403]).toContain(res.status);
  });

  it("POST /api/admin/studio/featured returns 401 or 403 without a session", async () => {
    const res = await agent
      .post("/api/admin/studio/featured")
      .send({ slug: "test", label: "Test", caption: "Test caption", position: 1 });
    expect([401, 403]).toContain(res.status);
  });

  it("PATCH /api/admin/studio/featured/:id returns 401 or 403 without a session", async () => {
    const res = await agent
      .patch("/api/admin/studio/featured/1")
      .send({ label: "Updated" });
    expect([401, 403]).toContain(res.status);
  });

  it("DELETE /api/admin/studio/featured/:id returns 401 or 403 without a session", async () => {
    const res = await agent.delete("/api/admin/studio/featured/1");
    expect([401, 403]).toContain(res.status);
  });
});
