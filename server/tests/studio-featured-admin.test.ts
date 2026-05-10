// task-610: Guard that admin CRUD routes for featured clips require admin auth.
// task-613: Validate that POST/PATCH reject bad payloads with 4xx and that
//           duplicate slugs surface as 409, not 500.
//
// Strategy: boot the real registerRoutes() with external services mocked out
// (same pattern as studio-featured.test.ts / task-609), then hit each admin
// endpoint without any session cookie.  If requireAdmin is ever accidentally
// removed from a route, the test will return 200 and fail.
//
// A second suite mounts registerAdminQaRoutes() directly with an allowAdmin
// bypass so we can exercise the actual validation / error-handling logic.

import { describe, it, expect, beforeAll, vi } from "vitest";
import { DuplicateSlugError } from "../errors";
import type { Request, Response, NextFunction } from "express";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-t610";
process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "guber-test";
process.env.DISABLE_BACKGROUND_JOBS = "true";
process.env.FAL_KEY = process.env.FAL_KEY || "test-fal-key";

const mockCreateFeaturedClip = vi.fn();
const mockUpdateFeaturedClip = vi.fn();
const mockDeleteFeaturedClip = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getUser: vi.fn(async () => undefined),
    getUserByEmail: vi.fn(async () => undefined),
    listStudioFeaturedClips: vi.fn(async () => []),
    listStudioModelPricing: vi.fn(async () => []),
    getActiveStudioSession: vi.fn(async () => null),
    touchStudioSession: vi.fn(async () => {}),
    createStudioFeaturedClip: (...args: Parameters<typeof mockCreateFeaturedClip>) => mockCreateFeaturedClip(...args),
    updateStudioFeaturedClip: (...args: Parameters<typeof mockUpdateFeaturedClip>) => mockUpdateFeaturedClip(...args),
    deleteStudioFeaturedClip: (...args: Parameters<typeof mockDeleteFeaturedClip>) => mockDeleteFeaturedClip(...args),
    createAuditLog: vi.fn(async () => {}),
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
  return { default: () => (sessionMod as typeof sessionMod).default.MemoryStore };
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
import { registerAdminQaRoutes } from "../admin-qa";

let agent: ReturnType<typeof supertest>;

const allowAdmin = (_req: Request, _res: Response, next: NextFunction) => next();

function buildAdminApp() {
  const app = express();
  app.use(express.json());
  registerAdminQaRoutes(app, allowAdmin);
  return supertest(app);
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  // No session middleware injected → req.session is undefined → requireAdmin blocks with 401/403
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  agent = supertest(app);
}, 30_000);

// ── Auth guard (task-610) ─────────────────────────────────────────────────────

describe("Admin featured-clips CRUD — auth guard (task-610)", () => {
  it("GET /api/admin/studio/featured returns 401 or 403 without a session", async () => {
    const res = await agent.get("/api/admin/studio/featured");
    expect([401, 403]).toContain(res.status);
  });

  it("POST /api/admin/studio/featured returns 401 or 403 without a session", async () => {
    const res = await agent
      .post("/api/admin/studio/featured")
      .send({ slug: "test", label: "Test", caption: "Test caption", position: 1, videoUrl: "https://example.com/v.mp4" });
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

// ── POST — required-field validation (task-613) ───────────────────────────────

describe("Admin featured-clips POST — required-field validation (task-613)", () => {
  const adminAgent = buildAdminApp();

  const VALID = {
    slug: "test-clip",
    label: "Test Label",
    caption: "Test caption",
    videoUrl: "https://example.com/v.mp4",
    position: 1,
  };

  it("returns 400 when slug is missing", async () => {
    const { slug: _omit, ...body } = VALID;
    const res = await adminAgent.post("/api/admin/studio/featured").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/slug/i);
  });

  it("returns 400 when label is missing", async () => {
    const { label: _omit, ...body } = VALID;
    const res = await adminAgent.post("/api/admin/studio/featured").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/label/i);
  });

  it("returns 400 when caption is missing", async () => {
    const { caption: _omit, ...body } = VALID;
    const res = await adminAgent.post("/api/admin/studio/featured").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/caption/i);
  });

  it("returns 400 when videoUrl is missing", async () => {
    const { videoUrl: _omit, ...body } = VALID;
    const res = await adminAgent.post("/api/admin/studio/featured").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/videoUrl/i);
  });

  it("returns 400 when position is missing", async () => {
    const { position: _omit, ...body } = VALID;
    const res = await adminAgent.post("/api/admin/studio/featured").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/position/i);
  });

  it("returns 400 when position is a non-numeric string", async () => {
    const res = await adminAgent
      .post("/api/admin/studio/featured")
      .send({ ...VALID, position: "not-a-number" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/position/i);
  });

  it("returns 400 when position is an empty string", async () => {
    const res = await adminAgent
      .post("/api/admin/studio/featured")
      .send({ ...VALID, position: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/position/i);
  });

  it("returns 400 when position is negative", async () => {
    const res = await adminAgent
      .post("/api/admin/studio/featured")
      .send({ ...VALID, position: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/position/i);
  });

  it("returns 400 when slug is whitespace-only", async () => {
    const res = await adminAgent
      .post("/api/admin/studio/featured")
      .send({ ...VALID, slug: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/slug/i);
  });

  it("returns 400 when label is whitespace-only", async () => {
    const res = await adminAgent
      .post("/api/admin/studio/featured")
      .send({ ...VALID, label: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/label/i);
  });

  it("returns 400 when the entire body is empty", async () => {
    const res = await adminAgent.post("/api/admin/studio/featured").send({});
    expect(res.status).toBe(400);
  });

  it("succeeds (200) when all required fields are provided", async () => {
    mockCreateFeaturedClip.mockResolvedValueOnce({
      id: 1, slug: VALID.slug, label: VALID.label, caption: VALID.caption,
      videoUrl: VALID.videoUrl, posterUrl: null, position: VALID.position, active: true,
    });
    const res = await adminAgent.post("/api/admin/studio/featured").send(VALID);
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe(VALID.slug);
  });
});

// ── POST — duplicate-slug handling (task-613) ─────────────────────────────────

describe("Admin featured-clips POST — duplicate-slug handling (task-613)", () => {
  const adminAgent = buildAdminApp();

  const VALID = {
    slug: "existing-slug",
    label: "Test",
    caption: "Caption",
    videoUrl: "https://example.com/v.mp4",
    position: 1,
  };

  it("returns 409 when the storage layer throws a DuplicateSlugError", async () => {
    mockCreateFeaturedClip.mockRejectedValueOnce(new DuplicateSlugError(VALID.slug));
    const res = await adminAgent.post("/api/admin/studio/featured").send(VALID);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/slug already exists/i);
  });

  it("returns 409 for a second slug that also already exists", async () => {
    mockCreateFeaturedClip.mockRejectedValueOnce(new DuplicateSlugError("another-slug"));
    const res = await adminAgent
      .post("/api/admin/studio/featured")
      .send({ ...VALID, slug: "another-slug" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/slug already exists/i);
  });

  // task-626: race-condition path — the storage layer catches the DB 23505 error
  // and surfaces it as DuplicateSlugError; the route must still return 409.
  it("returns 409 on the race-condition path (storage converts 23505 → DuplicateSlugError)", async () => {
    mockCreateFeaturedClip.mockRejectedValueOnce(new DuplicateSlugError(VALID.slug));
    const res = await adminAgent.post("/api/admin/studio/featured").send(VALID);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/slug already exists/i);
  });
});

// ── PATCH — validation (task-613) ─────────────────────────────────────────────

describe("Admin featured-clips PATCH — validation (task-613)", () => {
  const adminAgent = buildAdminApp();

  it("returns 400 when the id is not numeric", async () => {
    const res = await adminAgent.patch("/api/admin/studio/featured/abc").send({ label: "New" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when slug is provided but empty", async () => {
    const res = await adminAgent.patch("/api/admin/studio/featured/5").send({ slug: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/slug/i);
  });

  it("returns 400 when label is provided but empty", async () => {
    const res = await adminAgent.patch("/api/admin/studio/featured/5").send({ label: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/label/i);
  });

  it("returns 400 when caption is provided but empty", async () => {
    const res = await adminAgent.patch("/api/admin/studio/featured/5").send({ caption: "  " });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/caption/i);
  });

  it("returns 400 when position is provided but not a number", async () => {
    const res = await adminAgent.patch("/api/admin/studio/featured/5").send({ position: "bad" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/position/i);
  });

  it("returns 400 when position is an empty string", async () => {
    const res = await adminAgent.patch("/api/admin/studio/featured/5").send({ position: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/position/i);
  });

  it("returns 400 when position is negative", async () => {
    const res = await adminAgent.patch("/api/admin/studio/featured/5").send({ position: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/position/i);
  });

  it("returns 404 when the clip does not exist", async () => {
    mockUpdateFeaturedClip.mockResolvedValueOnce(null);
    const res = await adminAgent.patch("/api/admin/studio/featured/9999").send({ label: "Ghost" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("trims whitespace and coerces position before writing to storage", async () => {
    let captured: Record<string, unknown> = {};
    mockUpdateFeaturedClip.mockImplementationOnce(async (_id: number, p: Record<string, unknown>) => {
      captured = p;
      return { id: 5, slug: "trimmed", label: "Label", caption: "Cap", videoUrl: "https://example.com/v.mp4", posterUrl: null, position: 3, active: true };
    });
    const res = await adminAgent
      .patch("/api/admin/studio/featured/5")
      .send({ slug: "  trimmed  ", position: "3" });
    expect(res.status).toBe(200);
    expect(captured.slug).toBe("trimmed");
    expect(captured.position).toBe(3);
  });

  it("returns 409 when updating slug to an already-taken value", async () => {
    mockUpdateFeaturedClip.mockRejectedValueOnce(new DuplicateSlugError("taken-slug"));
    const res = await adminAgent.patch("/api/admin/studio/featured/5").send({ slug: "taken-slug" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/slug already exists/i);
  });

  it("returns 200 and the updated row when the clip exists", async () => {
    mockUpdateFeaturedClip.mockResolvedValueOnce({
      id: 5, slug: "my-clip", label: "Updated", caption: "Cap",
      videoUrl: "https://example.com/v.mp4", posterUrl: null, position: 2, active: true,
    });
    const res = await adminAgent.patch("/api/admin/studio/featured/5").send({ label: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe("Updated");
  });
});

// ── DELETE — validation (task-613) ───────────────────────────────────────────

describe("Admin featured-clips DELETE — validation (task-613)", () => {
  const adminAgent = buildAdminApp();

  it("returns 400 when the id is not numeric", async () => {
    const res = await adminAgent.delete("/api/admin/studio/featured/not-a-number");
    expect(res.status).toBe(400);
  });

  it("returns 404 when the clip does not exist", async () => {
    mockDeleteFeaturedClip.mockResolvedValueOnce(false);
    const res = await adminAgent.delete("/api/admin/studio/featured/9999");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 200 when the clip is deleted", async () => {
    mockDeleteFeaturedClip.mockResolvedValueOnce(true);
    const res = await adminAgent.delete("/api/admin/studio/featured/3");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
