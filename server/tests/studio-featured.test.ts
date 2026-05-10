// task-609: Guard that GET /api/studio/featured is public — no auth required.
//
// Strategy: boot the real registerRoutes() with external services mocked out
// (same pattern as studio-tools.test.ts / task-606), then hit the endpoint
// without any session cookie.  If requireAuth is ever accidentally added to
// the route, the test will return 401 and fail.

import { describe, it, expect, beforeAll, vi } from "vitest";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-t609";
process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "guber-test";
process.env.DISABLE_BACKGROUND_JOBS = "true";
process.env.FAL_KEY = process.env.FAL_KEY || "test-fal-key";

const FEATURED_CLIPS = [
  {
    id: 1,
    slug: "golden-hour-drive",
    label: "Golden Hour Drive",
    caption: "Cinematic golden hour road trip",
    videoUrl: "https://res.cloudinary.com/demo/video/upload/sample.mp4",
    posterUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    position: 1,
    active: true,
    createdAt: new Date(),
  },
  {
    id: 2,
    slug: "neon-city-night",
    label: "Neon City Night",
    caption: "Neon-lit city streets at midnight",
    videoUrl: "https://res.cloudinary.com/demo/video/upload/city.mp4",
    posterUrl: null,
    position: 2,
    active: true,
    createdAt: new Date(),
  },
];

vi.mock("../storage", () => ({
  storage: {
    getUser: vi.fn(async () => undefined),
    getUserByEmail: vi.fn(async () => undefined),
    listStudioFeaturedClips: vi.fn(async () => FEATURED_CLIPS),
    listStudioModelPricing: vi.fn(async () => []),
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

let agent: ReturnType<typeof supertest>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  // No session middleware injected → req.session is undefined → requireAuth would 401
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  agent = supertest(app);
}, 30_000);

describe("GET /api/studio/featured — public endpoint (task-609)", () => {
  it("returns 200 with no session cookie attached", async () => {
    const res = await agent.get("/api/studio/featured");
    expect(res.status).toBe(200);
  });

  it("response body is a JSON array", async () => {
    const res = await agent.get("/api/studio/featured");
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("each item has the expected shape", async () => {
    const res = await agent.get("/api/studio/featured");
    expect(res.body.length).toBeGreaterThan(0);
    for (const clip of res.body) {
      expect(typeof clip.id).toBe("number");
      expect(typeof clip.slug).toBe("string");
      expect(typeof clip.label).toBe("string");
      expect(typeof clip.caption).toBe("string");
      expect(
        clip.videoUrl === null || typeof clip.videoUrl === "string",
      ).toBe(true);
      expect(
        clip.posterUrl === null || typeof clip.posterUrl === "string",
      ).toBe(true);
      expect(typeof clip.position).toBe("number");
    }
  });

  it("returns the mocked featured clip data from storage", async () => {
    const res = await agent.get("/api/studio/featured");
    const clip = res.body.find((c: { slug: string }) => c.slug === "golden-hour-drive");
    expect(clip).toBeDefined();
    expect(clip.label).toBe("Golden Hour Drive");
    expect(clip.caption).toBe("Cinematic golden hour road trip");
    expect(typeof clip.videoUrl).toBe("string");
  });

  it("clips with null posterUrl are returned without error", async () => {
    const res = await agent.get("/api/studio/featured");
    const clip = res.body.find((c: { slug: string }) => c.slug === "neon-city-night");
    expect(clip).toBeDefined();
    expect(clip.posterUrl).toBeNull();
  });
});
