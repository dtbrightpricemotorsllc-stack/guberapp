// Integration tests for the GUBER Verified Release System™ secure release
// hand-off (task-651). These exercise the real Express routes (registerRoutes)
// end to end against the real DB, covering the highest-stakes path in the whole
// custody system — the one that physically releases a protected asset:
//
//   1. POST /api/assets/:id/release/request   (assigned-driver only)
//   2. POST /api/assets/:id/release/authorizations/:authId/approve  (owner only)
//      → mints a one-time pickup code (plaintext returned EXACTLY once)
//   3. POST /api/assets/:id/release/authorizations/:authId/deny     (owner only)
//   4. POST /api/assets/:id/release/redeem    (assigned-driver only)
//      → on success appends the immutable "loaded" custody event and flips the
//        asset to "in_transit"; the code is single-use.
//
// The trust-critical guards are all re-asserted server-side and tested here:
//   - role-on-asset authorization (request/redeem are driver-only; approve/deny
//     are owner-only)
//   - GPS geofence lock (out-of-fence requests can't be approved; out-of-fence
//     redemptions are rejected)
//   - VIN hard block (a mismatch can never be approved, and is re-checked at
//     redeem as defense in depth)
//   - one-time code semantics (single-use, wrong code, expired code)
//   - driver binding (a code is bound to the exact driver who requested it)
//
// Stripe transfers, push, jwt and the pg session store are mocked; everything
// else (users, assets, roles, custody events, release authorizations/codes,
// VIN/tow/trailer verifications) is real DB.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-1234567890";
process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
process.env.RELEASE_CODE_SECRET = process.env.RELEASE_CODE_SECRET || "release-code-secret-1234567890";
// The request route requires the live selfie to be a GUBER-signed Cloudinary
// upload — set a known cloud name so we can construct a valid selfie URL.
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "guber-test";
process.env.DISABLE_BACKGROUND_JOBS = "true";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(_key: string, _opts?: unknown) {}
    customers = { list: async () => ({ data: [] }) };
    subscriptions = { list: async () => ({ data: [] }) };
    checkout = { sessions: { list: async () => ({ data: [] }) } };
    transfers = { create: async () => ({ id: "tr_test_unused" }) };
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
import { sql, eq } from "drizzle-orm";
import {
  users,
  protectedAssets,
  assetRoles,
  custodyEvents,
  releaseAuthorizations,
  releaseCodes,
  vinVerifications,
  towVehicleVerifications,
  trailerVerifications,
} from "@shared/schema";
import * as assetCustody from "../asset-custody";
import { registerRoutes } from "../routes";

// ─── Harness ──────────────────────────────────────────────────────────────────

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

// Unique high-id namespace so we never collide with seeded/real rows.
const NS = 970_000_000 + Math.floor(Math.random() * 9_000_000);
const OWNER_ID = NS + 1;
const DRIVER_ID = NS + 2;
const DRIVER2_ID = NS + 3;
const STRANGER_ID = NS + 4;
const ADMIN_ID = NS + 5;

const VIN = "1HGBH41JXMN109186";
// Pickup geofence anchor; a same-point reading is inside the 250m radius.
const PICKUP_LAT = 36.05;
const PICKUP_LNG = -79.82;
// ~1.1km north of the pickup point — comfortably outside the 250m fence.
const FAR_LAT = 36.06;
const FAR_LNG = -79.82;

const selfieUrl = () =>
  `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/guber-proof/selfie.jpg`;

let agent: ReturnType<typeof supertest>;
const createdAssetIds: number[] = [];

async function makeUser(id: number, over: Record<string, unknown> = {}) {
  await db
    .insert(users)
    .values({
      id,
      email: `release-test-${id}@example.com`,
      password: "x.y",
      username: `release_test_${id}`,
      fullName: `Release Test ${id}`,
      role: "buyer",
      ...over,
    } as any)
    .onConflictDoNothing();
}

// Create a protected asset with a configured pickup geofence and the driver
// role(s) needed for the release flow. The release routes gate request/redeem on
// the "driver" role (the assigned driver is the carrier-side actor at hand-off).
async function makeAsset(opts: { secondDriver?: boolean } = {}): Promise<number> {
  const asset = await assetCustody.createProtectedAsset({
    ownerId: OWNER_ID,
    assetType: "vehicle",
    vin: VIN,
    year: "2022",
    make: "Honda",
    model: "Civic",
    estimatedValue: 12000,
  });
  await assetCustody.setAssetGeofence(asset.id, PICKUP_LAT, PICKUP_LNG, 250);
  await assetCustody.assignRole(asset.id, DRIVER_ID, "driver");
  if (opts.secondDriver) await assetCustody.assignRole(asset.id, DRIVER2_ID, "driver");
  createdAssetIds.push(asset.id);
  return asset.id;
}

// A driver requests release at the pickup point. Defaults to a valid in-fence,
// VIN-matching request; override lat/lng/scannedVin to drive failure paths.
async function driverRequest(
  assetId: number,
  opts: { lat?: number; lng?: number; scannedVin?: string | null; as?: number } = {},
) {
  currentUserId = opts.as ?? DRIVER_ID;
  return agent
    .post(`/api/assets/${assetId}/release/request`)
    .send({
      selfieUrl: selfieUrl(),
      lat: opts.lat ?? PICKUP_LAT,
      lng: opts.lng ?? PICKUP_LNG,
      tow: { vehicleType: "flatbed", plateNumber: "ABC1234", plateState: "NC" },
      trailer: { trailerType: "open", trailerNumber: "TR-9" },
      scannedVin: opts.scannedVin === undefined ? VIN : opts.scannedVin,
    });
}

// Full request → approve, returning the one-time plaintext pickup code.
async function approvedAsset(): Promise<{ assetId: number; authId: number; plainCode: string }> {
  const assetId = await makeAsset();
  const reqRes = await driverRequest(assetId);
  expect(reqRes.status).toBe(200);
  const authId = reqRes.body.authorization.id;
  currentUserId = OWNER_ID;
  const appr = await agent
    .post(`/api/assets/${assetId}/release/authorizations/${authId}/approve`)
    .send({});
  expect(appr.status).toBe(200);
  return { assetId, authId, plainCode: appr.body.plainCode };
}

async function eventTypes(assetId: number): Promise<string[]> {
  const events = await assetCustody.getCustodyTimeline(assetId);
  return events.map((e: any) => e.eventType);
}

async function cleanupAsset(assetId: number) {
  await db.delete(releaseCodes).where(eq(releaseCodes.assetId, assetId));
  await db.delete(releaseAuthorizations).where(eq(releaseAuthorizations.assetId, assetId));
  await db.delete(vinVerifications).where(eq(vinVerifications.assetId, assetId));
  await db.delete(towVehicleVerifications).where(eq(towVehicleVerifications.assetId, assetId));
  await db.delete(trailerVerifications).where(eq(trailerVerifications.assetId, assetId));
  await db.delete(custodyEvents).where(eq(custodyEvents.assetId, assetId));
  await db.delete(assetRoles).where(eq(assetRoles.assetId, assetId));
  await db.delete(protectedAssets).where(eq(protectedAssets.id, assetId));
}

beforeAll(async () => {
  agent = await buildAgent();

  await makeUser(OWNER_ID);
  await makeUser(DRIVER_ID, { idVerified: true });
  await makeUser(DRIVER2_ID, { idVerified: true });
  await makeUser(STRANGER_ID);
  await makeUser(ADMIN_ID, { role: "admin" });

  // The whole Verified Release System ships dark behind a feature flag — enable
  // it globally for the test app, otherwise every /api/assets/* route 404s.
  await db.execute(sql`
    INSERT INTO feature_flags (key, enabled, rollout_scope, allowed_roles, allowed_user_ids, note)
    VALUES ('verified_release_system', true, 'global', '{}', '{}', 'asset-release-handoff.test')
    ON CONFLICT (key) DO UPDATE SET enabled = true, rollout_scope = 'global'
  `);
  const { invalidateFlagCache } = await import("../feature-flags");
  invalidateFlagCache();
});

afterAll(async () => {
  for (const id of createdAssetIds) await cleanupAsset(id);
  await db.delete(users).where(eq(users.id, OWNER_ID));
  await db.delete(users).where(eq(users.id, DRIVER_ID));
  await db.delete(users).where(eq(users.id, DRIVER2_ID));
  await db.delete(users).where(eq(users.id, STRANGER_ID));
  await db.delete(users).where(eq(users.id, ADMIN_ID));
});

beforeEach(() => {
  currentUserId = null;
});

// ─── Release request (assigned-driver only) ─────────────────────────────────

describe("Verified Release System™ — release request", () => {
  it("the assigned driver can request release at the pickup (in-fence, VIN match)", async () => {
    const assetId = await makeAsset();
    const res = await driverRequest(assetId);
    expect(res.status).toBe(200);
    expect(res.body.authorization.status).toBe("pending");
    expect(res.body.geofence.verified).toBe(true);
    expect(res.body.vin.status).toBe("matched");
    // The request is recorded immutably in the custody chain.
    expect(await eventTypes(assetId)).toContain("release_requested");
  });

  it("a non-driver (the owner) cannot request a release (403)", async () => {
    const assetId = await makeAsset();
    currentUserId = OWNER_ID;
    const res = await agent
      .post(`/api/assets/${assetId}/release/request`)
      .send({ selfieUrl: selfieUrl(), lat: PICKUP_LAT, lng: PICKUP_LNG, tow: { plateNumber: "X1" }, trailer: { trailerType: "open" } })
      .expect(403);
    expect(res.body.message).toMatch(/assigned driver/i);
  });

  it("a stranger with no role on the asset cannot request a release (403)", async () => {
    const assetId = await makeAsset();
    currentUserId = STRANGER_ID;
    await agent
      .post(`/api/assets/${assetId}/release/request`)
      .send({ selfieUrl: selfieUrl(), lat: PICKUP_LAT, lng: PICKUP_LNG, tow: { plateNumber: "X1" }, trailer: { trailerType: "open" } })
      .expect(403);
  });

  it("an unauthenticated caller is rejected (401)", async () => {
    const assetId = await makeAsset();
    currentUserId = null;
    await agent
      .post(`/api/assets/${assetId}/release/request`)
      .send({ selfieUrl: selfieUrl(), lat: PICKUP_LAT, lng: PICKUP_LNG })
      .expect(401);
  });

  it("rejects a request with no live GPS reading (400)", async () => {
    const assetId = await makeAsset();
    currentUserId = DRIVER_ID;
    await agent
      .post(`/api/assets/${assetId}/release/request`)
      .send({ selfieUrl: selfieUrl(), tow: { plateNumber: "X1" }, trailer: { trailerType: "open" } })
      .expect(400);
  });

  it("rejects a request with no live selfie (400)", async () => {
    const assetId = await makeAsset();
    currentUserId = DRIVER_ID;
    await agent
      .post(`/api/assets/${assetId}/release/request`)
      .send({ lat: PICKUP_LAT, lng: PICKUP_LNG, tow: { plateNumber: "X1" }, trailer: { trailerType: "open" } })
      .expect(400);
  });

  it("rejects a selfie that is not a GUBER-signed Cloudinary upload (400)", async () => {
    const assetId = await makeAsset();
    currentUserId = DRIVER_ID;
    const res = await agent
      .post(`/api/assets/${assetId}/release/request`)
      .send({ selfieUrl: "https://evil.example.com/fake.jpg", lat: PICKUP_LAT, lng: PICKUP_LNG, tow: { plateNumber: "X1" }, trailer: { trailerType: "open" } })
      .expect(400);
    expect(res.body.message).toMatch(/cloudinary/i);
  });
});

// ─── Owner approve / deny ───────────────────────────────────────────────────

describe("Verified Release System™ — owner approve / deny", () => {
  it("the owner approves a pending request and is handed a one-time pickup code", async () => {
    const assetId = await makeAsset();
    const reqRes = await driverRequest(assetId);
    const authId = reqRes.body.authorization.id;

    currentUserId = OWNER_ID;
    const res = await agent
      .post(`/api/assets/${assetId}/release/authorizations/${authId}/approve`)
      .send({})
      .expect(200);
    expect(res.body.authorization.status).toBe("approved");
    // The plaintext code is returned EXACTLY once, 8 unambiguous chars.
    expect(res.body.plainCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    // The persisted code row is redacted — the secret HMAC verifier never leaves
    // the server, and the display value is masked.
    expect(res.body.code.codeHash).toBeUndefined();
    expect(res.body.code.code).toMatch(/^•+/);
    // Approval + code issuance are both recorded in the custody chain.
    const types = await eventTypes(assetId);
    expect(types).toContain("release_approved");
    expect(types).toContain("code_issued");
  });

  it("a non-owner (the driver) cannot approve a release (403)", async () => {
    const assetId = await makeAsset();
    const reqRes = await driverRequest(assetId);
    const authId = reqRes.body.authorization.id;

    currentUserId = DRIVER_ID;
    await agent
      .post(`/api/assets/${assetId}/release/authorizations/${authId}/approve`)
      .send({})
      .expect(403);
  });

  it("VIN mismatch is a HARD BLOCK — the owner cannot approve (409)", async () => {
    const assetId = await makeAsset();
    const reqRes = await driverRequest(assetId, { scannedVin: "1HGBH41JXMN999999" });
    expect(reqRes.body.vin.status).toBe("mismatch");
    const authId = reqRes.body.authorization.id;

    currentUserId = OWNER_ID;
    const res = await agent
      .post(`/api/assets/${assetId}/release/authorizations/${authId}/approve`)
      .send({})
      .expect(409);
    expect(res.body.message).toMatch(/VIN mismatch/i);
    // No code was minted for a blocked authorization.
    const codes = await assetCustody.getReleaseCodesForAsset(assetId);
    expect(codes).toHaveLength(0);
  });

  it("an out-of-geofence request can never be approved (409)", async () => {
    const assetId = await makeAsset();
    const reqRes = await driverRequest(assetId, { lat: FAR_LAT, lng: FAR_LNG });
    expect(reqRes.body.geofence.verified).toBe(false);
    const authId = reqRes.body.authorization.id;

    currentUserId = OWNER_ID;
    const res = await agent
      .post(`/api/assets/${assetId}/release/authorizations/${authId}/approve`)
      .send({})
      .expect(409);
    expect(res.body.message).toMatch(/geofence/i);
  });

  it("the owner can deny a pending request (status denied)", async () => {
    const assetId = await makeAsset();
    const reqRes = await driverRequest(assetId);
    const authId = reqRes.body.authorization.id;

    currentUserId = OWNER_ID;
    const res = await agent
      .post(`/api/assets/${assetId}/release/authorizations/${authId}/deny`)
      .send({ reason: "not ready" })
      .expect(200);
    expect(res.body.authorization.status).toBe("denied");
    expect(await eventTypes(assetId)).toContain("release_denied");
  });

  it("a non-owner cannot deny a release (403)", async () => {
    const assetId = await makeAsset();
    const reqRes = await driverRequest(assetId);
    const authId = reqRes.body.authorization.id;

    currentUserId = STRANGER_ID;
    await agent
      .post(`/api/assets/${assetId}/release/authorizations/${authId}/deny`)
      .send({})
      .expect(403);
  });
});

// ─── Code redemption at hand-off ────────────────────────────────────────────

describe("Verified Release System™ — pickup-code redemption", () => {
  it("the approved driver redeems the code in-fence → asset loaded & in transit", async () => {
    const { assetId, plainCode } = await approvedAsset();

    currentUserId = DRIVER_ID;
    const res = await agent
      .post(`/api/assets/${assetId}/release/redeem`)
      .send({ code: plainCode, lat: PICKUP_LAT, lng: PICKUP_LNG })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.code.status).toBe("used");

    // The immutable "loaded" custody event is appended on success.
    const types = await eventTypes(assetId);
    expect(types).toContain("code_redeemed");
    expect(types).toContain("loaded");

    // The asset is now in transit.
    const asset = await assetCustody.getProtectedAsset(assetId);
    expect(asset?.status).toBe("in_transit");
  });

  it("a pickup code is single-use — a second redemption is rejected (409)", async () => {
    const { assetId, plainCode } = await approvedAsset();

    currentUserId = DRIVER_ID;
    await agent
      .post(`/api/assets/${assetId}/release/redeem`)
      .send({ code: plainCode, lat: PICKUP_LAT, lng: PICKUP_LNG })
      .expect(200);

    const dup = await agent
      .post(`/api/assets/${assetId}/release/redeem`)
      .send({ code: plainCode, lat: PICKUP_LAT, lng: PICKUP_LNG })
      .expect(409);
    expect(dup.body.message).toMatch(/already been used/i);
    // The "loaded" event was appended exactly once.
    const loadedCount = (await eventTypes(assetId)).filter((t) => t === "loaded").length;
    expect(loadedCount).toBe(1);
  });

  it("a wrong code is rejected and never loads the asset (409)", async () => {
    const { assetId } = await approvedAsset();

    currentUserId = DRIVER_ID;
    const res = await agent
      .post(`/api/assets/${assetId}/release/redeem`)
      .send({ code: "ZZZZ9999", lat: PICKUP_LAT, lng: PICKUP_LNG })
      .expect(409);
    expect(res.body.message).toMatch(/invalid pickup code/i);
    const asset = await assetCustody.getProtectedAsset(assetId);
    expect(asset?.status).not.toBe("in_transit");
  });

  it("redemption outside the pickup geofence is blocked (409)", async () => {
    const { assetId, plainCode } = await approvedAsset();

    currentUserId = DRIVER_ID;
    const res = await agent
      .post(`/api/assets/${assetId}/release/redeem`)
      .send({ code: plainCode, lat: FAR_LAT, lng: FAR_LNG })
      .expect(409);
    expect(res.body.message).toMatch(/pickup point|geofence/i);
    // Code is still active (not consumed) and asset is not loaded.
    const codes = await assetCustody.getReleaseCodesForAsset(assetId);
    expect(codes[0].status).toBe("active");
  });

  it("an expired pickup code cannot be redeemed (409)", async () => {
    const { assetId, authId, plainCode } = await approvedAsset();
    // Force the freshly-minted code to be expired.
    await db
      .update(releaseCodes)
      .set({ expiresAt: new Date(Date.now() - 60_000) } as any)
      .where(eq(releaseCodes.authorizationId, authId));

    currentUserId = DRIVER_ID;
    const res = await agent
      .post(`/api/assets/${assetId}/release/redeem`)
      .send({ code: plainCode, lat: PICKUP_LAT, lng: PICKUP_LNG })
      .expect(409);
    expect(res.body.message).toMatch(/expired/i);
  });

  it("the code is bound to the approved driver — a different driver is rejected (403)", async () => {
    const assetId = await makeAsset({ secondDriver: true });
    const reqRes = await driverRequest(assetId); // requested by DRIVER_ID
    const authId = reqRes.body.authorization.id;
    currentUserId = OWNER_ID;
    const appr = await agent
      .post(`/api/assets/${assetId}/release/authorizations/${authId}/approve`)
      .send({})
      .expect(200);

    // A different carrier-side driver on the same asset presents the code.
    currentUserId = DRIVER2_ID;
    const res = await agent
      .post(`/api/assets/${assetId}/release/redeem`)
      .send({ code: appr.body.plainCode, lat: PICKUP_LAT, lng: PICKUP_LNG })
      .expect(403);
    expect(res.body.message).toMatch(/different driver/i);
    // Code remains active; asset is not loaded.
    const codes = await assetCustody.getReleaseCodesForAsset(assetId);
    expect(codes[0].status).toBe("active");
  });

  it("VIN mismatch is re-checked at redeem as defense in depth (409)", async () => {
    const { assetId, authId, plainCode } = await approvedAsset();
    // Tamper the linked VIN verification to a mismatch after a valid code was
    // minted — the redeem path must independently re-assert the VIN hard block.
    await db
      .update(vinVerifications)
      .set({ status: "mismatch", matched: false } as any)
      .where(eq(vinVerifications.authorizationId, authId));

    currentUserId = DRIVER_ID;
    const res = await agent
      .post(`/api/assets/${assetId}/release/redeem`)
      .send({ code: plainCode, lat: PICKUP_LAT, lng: PICKUP_LNG })
      .expect(409);
    expect(res.body.message).toMatch(/VIN mismatch/i);
    const asset = await assetCustody.getProtectedAsset(assetId);
    expect(asset?.status).not.toBe("in_transit");
  });

  it("a non-driver cannot redeem a pickup code (403)", async () => {
    const { assetId, plainCode } = await approvedAsset();
    currentUserId = OWNER_ID;
    await agent
      .post(`/api/assets/${assetId}/release/redeem`)
      .send({ code: plainCode, lat: PICKUP_LAT, lng: PICKUP_LNG })
      .expect(403);
  });
});
