// Tests for the Hands-Free / wearable POV upload flow (task-454).
//
// Covers:
//  - sign/verify roundtrip in server/wearable-token.ts
//  - expired token rejected
//  - tampered signature rejected
//  - GET /api/jobs/:id/wearable-upload-token requires assigned helper
//  - POST /api/proof/wearable-upload happy path writes proof + audit log
//  - both routes return 403 when handsfree_capture_enabled = "false"

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-1234567890";
process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "guber-test";
process.env.DISABLE_BACKGROUND_JOBS = "true";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const HELPER_ID = 999_999_801;
const HIRER_ID = 999_999_802;
const OTHER_USER_ID = 999_999_803;

interface MockJob {
  id: number;
  postedById: number;
  assignedHelperId: number | null;
  status: string;
  title: string;
  proofStatus?: string;
}

const state = vi.hoisted(() => ({
  jobs: new Map<number, any>(),
  proofs: [] as any[],
  audits: [] as any[],
  notifications: [] as any[],
  jobUpdates: [] as Array<{ id: number; data: any }>,
  users: new Map<number, any>(),
  nextProofId: 1,
}));

const mockStorage = vi.hoisted(() => ({
  getUser: vi.fn(async (id: number) => state.users.get(id)),
  getUserByEmail: vi.fn(async () => undefined),
  getJob: vi.fn(async (id: number) => state.jobs.get(id)),
  updateJob: vi.fn(async (id: number, data: any) => {
    state.jobUpdates.push({ id, data });
    const j = state.jobs.get(id);
    if (j) Object.assign(j, data);
    return j;
  }),
  createProofSubmission: vi.fn(async (data: any) => {
    const proof = { id: state.nextProofId++, ...data };
    state.proofs.push(proof);
    return proof;
  }),
  createAuditLog: vi.fn(async (data: any) => {
    state.audits.push(data);
    return { id: state.audits.length, ...data };
  }),
  createNotification: vi.fn(async (data: any) => {
    state.notifications.push(data);
    return { id: state.notifications.length, ...data };
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

// ─── Real imports (after mocks) ───────────────────────────────────────────────

import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { signWearableToken, verifyWearableToken } from "../wearable-token";
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

async function setHandsfreeFlag(value: "true" | "false") {
  await db.execute(sql`
    INSERT INTO platform_settings (key, value)
    VALUES ('handsfree_capture_enabled', ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `);
  // Mirror the kill-switch in the feature-flag console too — the route
  // dual-gates on both. Defaults to disabled, so we always have to seed it.
  const enabled = value === "true";
  await db.execute(sql`
    INSERT INTO feature_flags (key, enabled, rollout_scope, allowed_roles, allowed_user_ids, note)
    VALUES ('handsfree_capture', ${enabled}, 'global', '{}', '{}', 'wearable.test')
    ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled, rollout_scope = 'global'
  `);
}

function makeCloudinaryUrl(): string {
  return `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/v123/guber-proof/clip.webm`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("wearable-token utility", () => {
  it("signs and verifies a token roundtrip", () => {
    const token = signWearableToken(42, HELPER_ID);
    const payload = verifyWearableToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.jobId).toBe(42);
    expect(payload!.helperId).toBe(HELPER_ID);
    expect(payload!.exp).toBeGreaterThan(Date.now());
    expect(typeof payload!.nonce).toBe("string");
  });

  it("returns null for an expired token", () => {
    const realNow = Date.now;
    Date.now = () => realNow() - 30 * 60 * 1000; // 30 min ago
    const token = signWearableToken(42, HELPER_ID);
    Date.now = realNow;
    expect(verifyWearableToken(token)).toBeNull();
  });

  it("rejects a token with a forged signature", () => {
    const token = signWearableToken(42, HELPER_ID);
    const [body] = token.split(".");
    const forged = `${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    expect(verifyWearableToken(forged)).toBeNull();
  });

  it("rejects a token whose body has been tampered with", () => {
    const token = signWearableToken(42, HELPER_ID);
    const [, sig] = token.split(".");
    // Re-encode payload with a different jobId; signature won't match.
    const tampered = Buffer.from(JSON.stringify({
      jobId: 9999, helperId: HELPER_ID, exp: Date.now() + 60_000, nonce: "x",
    })).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(verifyWearableToken(`${tampered}.${sig}`)).toBeNull();
  });

  it("returns null for malformed token strings", () => {
    expect(verifyWearableToken("")).toBeNull();
    expect(verifyWearableToken("not-a-token")).toBeNull();
    expect(verifyWearableToken("a.b.c")).toBeNull();
  });
});

describe("Hands-Free upload routes (registerRoutes)", () => {
  let agent: ReturnType<typeof supertest>;
  const JOB_ID = 777_777_001;

  beforeAll(async () => {
    agent = await buildAgent();
  });

  beforeEach(async () => {
    state.proofs.length = 0;
    state.audits.length = 0;
    state.notifications.length = 0;
    state.jobUpdates.length = 0;
    state.jobs.clear();
    state.users.clear();
    state.nextProofId = 1;

    state.users.set(HELPER_ID, { id: HELPER_ID, role: "buyer", deletedAt: null });
    state.users.set(HIRER_ID, { id: HIRER_ID, role: "buyer", deletedAt: null });
    state.users.set(OTHER_USER_ID, { id: OTHER_USER_ID, role: "buyer", deletedAt: null });

    state.jobs.set(JOB_ID, {
      id: JOB_ID,
      postedById: HIRER_ID,
      assignedHelperId: HELPER_ID,
      status: "active",
      title: "Verify a vehicle",
    });

    await setHandsfreeFlag("true");
    // The feature-flag resolver caches for 30s in-process; clear it so the
    // kill-switch test can't poison subsequent tests.
    const { invalidateFlagCache } = await import("../feature-flags");
    invalidateFlagCache();
    currentUserId = HELPER_ID;
  });

  afterAll(async () => {
    await setHandsfreeFlag("true");
  });

  // ── Token endpoint ──────────────────────────────────────────────────────────

  describe("GET /api/jobs/:id/wearable-upload-token", () => {
    it("returns a token to the assigned helper", async () => {
      currentUserId = HELPER_ID;
      const res = await agent.get(`/api/jobs/${JOB_ID}/wearable-upload-token`).expect(200);
      expect(res.body.token).toMatch(/^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/);
      expect(res.body.expiresInSec).toBe(15 * 60);

      const payload = verifyWearableToken(res.body.token);
      expect(payload).not.toBeNull();
      expect(payload!.helperId).toBe(HELPER_ID);
      expect(payload!.jobId).toBe(JOB_ID);
    });

    it("returns 403 to a user who is not the assigned helper", async () => {
      currentUserId = OTHER_USER_ID;
      const res = await agent.get(`/api/jobs/${JOB_ID}/wearable-upload-token`).expect(403);
      expect(res.body.message).toMatch(/assigned helper/i);
    });

    it("returns 401 when not authenticated", async () => {
      currentUserId = null;
      await agent.get(`/api/jobs/${JOB_ID}/wearable-upload-token`).expect(401);
    });

    it("returns 403 when the kill-switch is off", async () => {
      await setHandsfreeFlag("false");
      currentUserId = HELPER_ID;
      const res = await agent.get(`/api/jobs/${JOB_ID}/wearable-upload-token`).expect(403);
      expect(res.body.message).toMatch(/disabled/i);
    });
  });

  // ── Upload endpoint ─────────────────────────────────────────────────────────

  describe("POST /api/proof/wearable-upload", () => {
    function uploadBody(token: string) {
      return {
        token,
        videoUrl: makeCloudinaryUrl(),
        captureMeta: {
          deviceKind: "phone-handsfree",
          deviceModel: "TestPhone",
          captureStartedAt: new Date(Date.now() - 60_000).toISOString(),
          captureEndedAt: new Date().toISOString(),
          gpsAtStart: { lat: 39.5, lng: -104.9 },
          consentVersion: 1,
        },
      };
    }

    it("happy path: writes proof + audit log + notifies hirer", async () => {
      currentUserId = HELPER_ID;
      const token = signWearableToken(JOB_ID, HELPER_ID);

      const res = await agent
        .post("/api/proof/wearable-upload")
        .send(uploadBody(token))
        .expect(200);

      expect(res.body.id).toBeGreaterThan(0);
      expect(res.body.jobId).toBe(JOB_ID);
      expect(res.body.videoUrl).toContain("/guber-proof/");

      // Proof submission was created
      expect(state.proofs).toHaveLength(1);
      expect(state.proofs[0].submittedBy).toBe(HELPER_ID);
      expect(state.proofs[0].jobId).toBe(JOB_ID);
      expect(state.proofs[0].captureMeta.deviceKind).toBe("phone-handsfree");
      expect(state.proofs[0].captureMeta.receivedAt).toBeTruthy();
      expect(state.proofs[0].gpsLat).toBe(39.5);

      // Job advanced to proof_submitted
      expect(state.jobUpdates.some((u) =>
        u.id === JOB_ID && u.data.status === "proof_submitted",
      )).toBe(true);

      // Audit log written for the upload
      expect(state.audits.some((a) =>
        a.action === "handsfree_proof_uploaded" && a.userId === HELPER_ID,
      )).toBe(true);

      // Hirer was notified
      expect(state.notifications.some((n) =>
        n.userId === HIRER_ID && /POV Proof/i.test(n.title),
      )).toBe(true);
    });

    it("rejects an expired token", async () => {
      currentUserId = HELPER_ID;
      const realNow = Date.now;
      Date.now = () => realNow() - 30 * 60 * 1000;
      const token = signWearableToken(JOB_ID, HELPER_ID);
      Date.now = realNow;

      const res = await agent
        .post("/api/proof/wearable-upload")
        .send(uploadBody(token))
        .expect(401);
      expect(res.body.message).toMatch(/invalid or expired/i);
      expect(state.proofs).toHaveLength(0);
    });

    it("rejects a forged token", async () => {
      currentUserId = HELPER_ID;
      const token = signWearableToken(JOB_ID, HELPER_ID);
      const [body] = token.split(".");
      const forged = `${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

      await agent
        .post("/api/proof/wearable-upload")
        .send(uploadBody(forged))
        .expect(401);
      expect(state.proofs).toHaveLength(0);
    });

    it("rejects a token belonging to a different helper", async () => {
      // Token signed for HELPER_ID, request made by OTHER_USER_ID
      const token = signWearableToken(JOB_ID, HELPER_ID);
      currentUserId = OTHER_USER_ID;

      const res = await agent
        .post("/api/proof/wearable-upload")
        .send(uploadBody(token))
        .expect(403);
      expect(res.body.message).toMatch(/does not belong/i);
      expect(state.proofs).toHaveLength(0);
    });

    it("rejects a non-Cloudinary videoUrl", async () => {
      currentUserId = HELPER_ID;
      const token = signWearableToken(JOB_ID, HELPER_ID);
      const body = uploadBody(token);
      body.videoUrl = "https://evil.example.com/clip.mp4";

      const res = await agent
        .post("/api/proof/wearable-upload")
        .send(body)
        .expect(400);
      expect(res.body.message).toMatch(/cloudinary/i);
      expect(state.proofs).toHaveLength(0);
    });

    it("returns 403 when the kill-switch is off", async () => {
      await setHandsfreeFlag("false");
      currentUserId = HELPER_ID;
      const token = signWearableToken(JOB_ID, HELPER_ID);

      const res = await agent
        .post("/api/proof/wearable-upload")
        .send(uploadBody(token))
        .expect(403);
      expect(res.body.message).toMatch(/disabled/i);
      expect(state.proofs).toHaveLength(0);
    });

    it("returns 401 when not authenticated", async () => {
      currentUserId = null;
      const token = signWearableToken(JOB_ID, HELPER_ID);
      await agent
        .post("/api/proof/wearable-upload")
        .send(uploadBody(token))
        .expect(401);
      expect(state.proofs).toHaveLength(0);
    });

    // ── task-470: hard-block fraudulent uploads ──
    describe("hard preflight blockers (task-470)", () => {
      const JOB_LAT = 39.5;
      const JOB_LNG = -104.9;

      beforeEach(() => {
        // Anchor the job in physical space so distance checks have meaning.
        const j = state.jobs.get(JOB_ID);
        if (j) {
          j.lat = JOB_LAT;
          j.lng = JOB_LNG;
        }
      });

      function expectBlocked(res: any, matcher: RegExp) {
        expect(res.status).toBe(422);
        expect(res.body.code).toBe("preflight_blocked");
        expect(Array.isArray(res.body.reasons)).toBe(true);
        expect(res.body.reasons.some((r: string) => matcher.test(r))).toBe(true);
        expect(state.proofs).toHaveLength(0);
        expect(state.audits.some((a) => a.action === "handsfree_proof_blocked")).toBe(true);
      }

      it("rejects clips whose embedded GPS is more than 5km from the job", async () => {
        currentUserId = HELPER_ID;
        const token = signWearableToken(JOB_ID, HELPER_ID);
        const body = uploadBody(token);
        body.captureMeta = {
          ...body.captureMeta,
          deviceKind: "paired-android",
          // ~11 km north of job
          gpsAtStart: undefined as any,
          preflight: {
            clipGps: { lat: JOB_LAT + 0.1, lng: JOB_LNG },
          },
        } as any;

        const res = await agent.post("/api/proof/wearable-upload").send(body);
        expectBlocked(res, /km from the job site/);
      });

      it("rejects clips older than 7 days (capturedAt)", async () => {
        currentUserId = HELPER_ID;
        const token = signWearableToken(JOB_ID, HELPER_ID);
        const body = uploadBody(token);
        const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3_600_000).toISOString();
        body.captureMeta = {
          ...body.captureMeta,
          deviceKind: "paired-ios",
          preflight: { capturedAt: eightDaysAgo },
        } as any;

        const res = await agent.post("/api/proof/wearable-upload").send(body);
        expectBlocked(res, /days old/);
      });

      it("rejects clips older than 7 days (paired fileLastModified fallback)", async () => {
        currentUserId = HELPER_ID;
        const token = signWearableToken(JOB_ID, HELPER_ID);
        const body = uploadBody(token);
        body.captureMeta = {
          ...body.captureMeta,
          deviceKind: "paired-android",
          fileLastModified: new Date(Date.now() - 10 * 24 * 3_600_000).toISOString(),
        } as any;

        const res = await agent.post("/api/proof/wearable-upload").send(body);
        expectBlocked(res, /days old/);
      });

      it("rejects clips shorter than 5s", async () => {
        currentUserId = HELPER_ID;
        const token = signWearableToken(JOB_ID, HELPER_ID);
        const start = Date.now() - 2_000;
        const body = uploadBody(token);
        body.captureMeta.captureStartedAt = new Date(start).toISOString();
        body.captureMeta.captureEndedAt = new Date(start + 2_000).toISOString();

        const res = await agent.post("/api/proof/wearable-upload").send(body);
        expectBlocked(res, /5s minimum/);
      });

      it("ignores phone-handsfree fileLastModified for the age block", async () => {
        // phone-handsfree clips are recorded live; their file mtime is the
        // upload moment, never the recording moment, so it must not trigger
        // the 7-day age block.
        currentUserId = HELPER_ID;
        const token = signWearableToken(JOB_ID, HELPER_ID);
        const body = uploadBody(token);
        body.captureMeta = {
          ...body.captureMeta,
          deviceKind: "phone-handsfree",
          fileLastModified: new Date(Date.now() - 365 * 24 * 3_600_000).toISOString(),
        } as any;

        await agent.post("/api/proof/wearable-upload").send(body).expect(200);
        expect(state.proofs).toHaveLength(1);
      });
    });
  });
});
