// Integration tests for the GUBER Verified Release System™ custody dashboards
// and Transport Passport (task-647).
//
// These exercise the real Express routes (registerRoutes) against the real DB
// (the custody engine in server/asset-custody.ts talks to Drizzle directly), so
// money-moving / trust-critical behavior has regression coverage:
//   - role-on-asset authorization (a non-role user gets 403 on /api/assets/*)
//   - lifecycle transition ordering + freeze blocking transitions
//   - witness payout idempotency (a second report → 409, paid exactly once)
//   - incident + transport-issue admin status updates
//   - passport.pdf returns a valid PDF for an authorized viewer
//
// Stripe transfers, push, jwt and the pg session store are mocked; everything
// else (users, assets, roles, custody events, witness assignments) is real DB.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-1234567890";
process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
process.env.RELEASE_CODE_SECRET = process.env.RELEASE_CODE_SECRET || "release-code-secret-1234567890";
process.env.DISABLE_BACKGROUND_JOBS = "true";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Count how many real Stripe transfers the witness payout path attempts. The
// idempotency guarantee is "paid exactly once" even if /report is hit twice.
const transferCalls: Array<{ destination: string; amount: number; idempotencyKey?: string }> = [];

vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(_key: string, _opts?: unknown) {}
    customers = { list: async () => ({ data: [] }) };
    subscriptions = { list: async () => ({ data: [] }) };
    checkout = { sessions: { list: async () => ({ data: [] }) } };
    transfers = {
      create: async (params: any, opts?: any) => {
        transferCalls.push({
          destination: params.destination,
          amount: params.amount,
          idempotencyKey: opts?.idempotencyKey,
        });
        return { id: `tr_test_${transferCalls.length}` };
      },
    };
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
import { eq } from "drizzle-orm";
import {
  users,
  protectedAssets,
  assetRoles,
  custodyEvents,
  witnessAssignments,
  witnessReports,
  incidents,
  transportIssues,
  masterTransportEvents,
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
const NS = 980_000_000 + Math.floor(Math.random() * 9_000_000);
const OWNER_ID = NS + 1;
const CARRIER_ID = NS + 2;
const WITNESS_ID = NS + 3;
const STRANGER_ID = NS + 4;
const ADMIN_ID = NS + 5;

let agent: ReturnType<typeof supertest>;
const createdAssetIds: number[] = [];

async function makeUser(id: number, over: Record<string, unknown> = {}) {
  await db
    .insert(users)
    .values({
      id,
      email: `custody-test-${id}@example.com`,
      password: "x.y",
      username: `custody_test_${id}`,
      fullName: `Custody Test ${id}`,
      role: "buyer",
      ...over,
    } as any)
    .onConflictDoNothing();
}

// Create a fully-roled asset for a scenario. Owner + (optional) carrier role.
async function makeAsset(opts: {
  estimatedValue?: number | null;
  carrier?: boolean;
  witnessAddon?: boolean;
} = {}): Promise<number> {
  const asset = await assetCustody.createProtectedAsset({
    ownerId: OWNER_ID,
    assetType: "vehicle",
    vin: "1HGBH41JXMN109186",
    year: "2022",
    make: "Honda",
    model: "Civic",
    estimatedValue: opts.estimatedValue ?? 12000,
    witnessAddon: opts.witnessAddon,
  });
  if (opts.carrier) await assetCustody.assignRole(asset.id, CARRIER_ID, "carrier");
  createdAssetIds.push(asset.id);
  return asset.id;
}

async function cleanupAsset(assetId: number) {
  await db.delete(witnessReports).where(eq(witnessReports.assetId, assetId));
  await db.delete(witnessAssignments).where(eq(witnessAssignments.assetId, assetId));
  await db.delete(incidents).where(eq(incidents.assetId, assetId));
  await db.delete(transportIssues).where(eq(transportIssues.assetId, assetId));
  await db.delete(masterTransportEvents).where(eq(masterTransportEvents.assetId, assetId));
  await db.delete(custodyEvents).where(eq(custodyEvents.assetId, assetId));
  await db.delete(assetRoles).where(eq(assetRoles.assetId, assetId));
  await db.delete(protectedAssets).where(eq(protectedAssets.id, assetId));
}

beforeAll(async () => {
  agent = await buildAgent();

  await makeUser(OWNER_ID);
  await makeUser(CARRIER_ID, { idVerified: true });
  await makeUser(WITNESS_ID, { idVerified: true, stripeAccountId: "acct_test_witness" });
  await makeUser(STRANGER_ID);
  await makeUser(ADMIN_ID, { role: "admin" });

  // The whole Verified Release System ships dark behind a feature flag — enable
  // it globally for the test app, otherwise every /api/assets/* route 404s.
  await db.execute(sql`
    INSERT INTO feature_flags (key, enabled, rollout_scope, allowed_roles, allowed_user_ids, note)
    VALUES ('verified_release_system', true, 'global', '{}', '{}', 'asset-custody-routes.test')
    ON CONFLICT (key) DO UPDATE SET enabled = true, rollout_scope = 'global'
  `);
  const { invalidateFlagCache } = await import("../feature-flags");
  invalidateFlagCache();
});

afterAll(async () => {
  for (const id of createdAssetIds) await cleanupAsset(id);
  await db.delete(users).where(eq(users.id, OWNER_ID));
  await db.delete(users).where(eq(users.id, CARRIER_ID));
  await db.delete(users).where(eq(users.id, WITNESS_ID));
  await db.delete(users).where(eq(users.id, STRANGER_ID));
  await db.delete(users).where(eq(users.id, ADMIN_ID));
});

beforeEach(() => {
  transferCalls.length = 0;
  currentUserId = null;
});

// ─── Authorization: role-on-asset ───────────────────────────────────────────

describe("Verified Release System™ — role-on-asset authorization", () => {
  it("a user with no role on the asset gets 403 from the passport endpoint", async () => {
    const assetId = await makeAsset();
    currentUserId = STRANGER_ID;
    const res = await agent.get(`/api/assets/${assetId}`).expect(403);
    expect(res.body.message).toMatch(/role on this asset/i);
  });

  it("an unauthenticated caller gets 401", async () => {
    const assetId = await makeAsset();
    currentUserId = null;
    await agent.get(`/api/assets/${assetId}`).expect(401);
  });

  it("the owner can read the transport passport for their asset", async () => {
    const assetId = await makeAsset();
    currentUserId = OWNER_ID;
    const res = await agent.get(`/api/assets/${assetId}`).expect(200);
    expect(res.body.asset.id).toBe(assetId);
    expect(res.body.myRoles).toContain("owner");
  });

  it("a non-carrier (the owner) cannot post a carrier-only lifecycle update", async () => {
    const assetId = await makeAsset({ carrier: true });
    currentUserId = OWNER_ID;
    const res = await agent
      .post(`/api/assets/${assetId}/lifecycle`)
      .send({ status: "running_normally" })
      .expect(403);
    expect(res.body.message).toMatch(/active carrier/i);
  });

  it("an admin can read any asset's passport even with no role on it", async () => {
    const assetId = await makeAsset();
    currentUserId = ADMIN_ID;
    const res = await agent.get(`/api/assets/${assetId}`).expect(200);
    expect(res.body.isAdmin).toBe(true);
  });
});

// ─── Lifecycle transitions + freeze blocking ────────────────────────────────

describe("Verified Release System™ — lifecycle transitions", () => {
  it("the carrier can post lifecycle updates, in order, each appending custody", async () => {
    const assetId = await makeAsset({ carrier: true });
    currentUserId = CARRIER_ID;

    await agent.post(`/api/assets/${assetId}/lifecycle`).send({ status: "running_normally" }).expect(200);
    await agent.post(`/api/assets/${assetId}/lifecycle`).send({ status: "arrived" }).expect(200);

    currentUserId = OWNER_ID;
    const passport = await agent.get(`/api/assets/${assetId}`).expect(200);
    const types = passport.body.timeline.map((e: any) => e.eventType);
    // Append-only timeline is newest-first; both lifecycle events are present.
    expect(types).toContain("lifecycle_running_normally");
    expect(types).toContain("lifecycle_arrived");
    const idxArrived = types.indexOf("lifecycle_arrived");
    const idxRunning = types.indexOf("lifecycle_running_normally");
    // "arrived" happened after "running_normally", so it is nearer the top.
    expect(idxArrived).toBeLessThan(idxRunning);
  });

  it("a lifecycle incident status (accident) spawns a linked incident row", async () => {
    const assetId = await makeAsset({ carrier: true });
    currentUserId = CARRIER_ID;
    const res = await agent
      .post(`/api/assets/${assetId}/lifecycle`)
      .send({ status: "accident", description: "rear-ended" })
      .expect(200);
    expect(res.body.incident).toBeTruthy();
    expect(res.body.incident.incidentType).toBe("accident");
  });

  it("rejects a lifecycle update with no status", async () => {
    const assetId = await makeAsset({ carrier: true });
    currentUserId = CARRIER_ID;
    await agent.post(`/api/assets/${assetId}/lifecycle`).send({}).expect(400);
  });

  it("a frozen asset blocks all carrier lifecycle transitions (409)", async () => {
    const assetId = await makeAsset({ carrier: true });

    // Owner freezes the asset.
    currentUserId = OWNER_ID;
    await agent.post(`/api/assets/${assetId}/freeze`).send({ reason: "fraud check" }).expect(200);

    // Carrier can no longer post a transport update.
    currentUserId = CARRIER_ID;
    const res = await agent
      .post(`/api/assets/${assetId}/lifecycle`)
      .send({ status: "running_normally" })
      .expect(409);
    expect(res.body.message).toMatch(/frozen/i);

    // After unfreeze, transitions work again.
    currentUserId = OWNER_ID;
    await agent.post(`/api/assets/${assetId}/unfreeze`).send({ note: "cleared" }).expect(200);
    currentUserId = CARRIER_ID;
    await agent.post(`/api/assets/${assetId}/lifecycle`).send({ status: "running_normally" }).expect(200);
  });

  it("only the owner/sender can freeze — a stranger is rejected", async () => {
    const assetId = await makeAsset({ carrier: true });
    currentUserId = STRANGER_ID;
    // Stranger has no role, so the feature gate still passes (flag global) but the
    // route's role check rejects with 403.
    await agent.post(`/api/assets/${assetId}/freeze`).send({ reason: "nope" }).expect(403);
  });
});

// ─── Witness payout idempotency ─────────────────────────────────────────────

describe("Verified Release System™ — witness payout idempotency", () => {
  async function setupAcceptedAssignment(): Promise<{ assetId: number; assignmentId: number }> {
    const assetId = await makeAsset({ witnessAddon: true });
    // Owner requests a witness; witness accepts; then files a report → payout.
    const assignment = await assetCustody.requestWitness({
      assetId,
      requestedBy: OWNER_ID,
      reportType: "loading",
      feeCents: 5000,
    });
    await assetCustody.acceptWitnessAssignment(assignment.id, WITNESS_ID);
    await assetCustody.assignRole(assetId, WITNESS_ID, "witness");
    return { assetId, assignmentId: assignment.id };
  }

  it("the first report pays the witness exactly once (80% Stripe Connect transfer)", async () => {
    const { assignmentId } = await setupAcceptedAssignment();
    currentUserId = WITNESS_ID;
    const res = await agent
      .post(`/api/witness/assignments/${assignmentId}/report`)
      .send({ reportType: "loading", notes: "all good" })
      .expect(200);
    expect(res.body.payout.status).toBe("sent");
    // $50.00 fee → 80% payout = $40.00 = 4000 cents.
    expect(transferCalls).toHaveLength(1);
    expect(transferCalls[0].amount).toBe(4000);
    expect(transferCalls[0].destination).toBe("acct_test_witness");
    expect(transferCalls[0].idempotencyKey).toBe(`witness-payout-${assignmentId}`);
  });

  it("a duplicate report on the same assignment returns 409 and never double-pays", async () => {
    const { assignmentId } = await setupAcceptedAssignment();
    currentUserId = WITNESS_ID;
    await agent
      .post(`/api/witness/assignments/${assignmentId}/report`)
      .send({ reportType: "loading" })
      .expect(200);
    expect(transferCalls).toHaveLength(1);

    // Second attempt: assignment is already "completed", so the atomic claim
    // fails and the route surfaces a 409 — no second transfer is attempted.
    const dup = await agent
      .post(`/api/witness/assignments/${assignmentId}/report`)
      .send({ reportType: "loading" })
      .expect(409);
    expect(dup.body.message).toMatch(/already been reported|acceptable state/i);
    expect(transferCalls).toHaveLength(1);
  });

  it("a witness without a verified ID cannot file a report (403)", async () => {
    const { assignmentId } = await setupAcceptedAssignment();
    // Flip the witness to unverified for this check.
    await db.update(users).set({ idVerified: false } as any).where(eq(users.id, WITNESS_ID));
    currentUserId = WITNESS_ID;
    const res = await agent
      .post(`/api/witness/assignments/${assignmentId}/report`)
      .send({ reportType: "loading" })
      .expect(403);
    expect(res.body.message).toBe("ID_REQUIRED");
    expect(transferCalls).toHaveLength(0);
    // Restore for other tests.
    await db.update(users).set({ idVerified: true } as any).where(eq(users.id, WITNESS_ID));
  });
});

// ─── Incident + transport-issue admin status updates ─────────────────────────

describe("Verified Release System™ — incident & issue admin updates", () => {
  it("admin updates an incident's status + protection-claim status (append-only audit)", async () => {
    const assetId = await makeAsset({ carrier: true });

    // Carrier reports an incident.
    currentUserId = CARRIER_ID;
    const created = await agent
      .post(`/api/assets/${assetId}/incidents`)
      .send({ incidentType: "theft", severity: "critical", description: "broken window" })
      .expect(200);
    const incidentId = created.body.id;

    // Admin moves it to resolved with a claim approval.
    currentUserId = ADMIN_ID;
    const res = await agent
      .post(`/api/admin/incidents/${incidentId}/status`)
      .send({ status: "resolved", protectionClaimStatus: "approved", note: "covered" })
      .expect(200);
    expect(res.body.status).toBe("resolved");
    expect(res.body.protectionClaimStatus).toBe("approved");

    // A non-admin cannot touch incident status.
    currentUserId = CARRIER_ID;
    await agent
      .post(`/api/admin/incidents/${incidentId}/status`)
      .send({ status: "open" })
      .expect(403);
  });

  it("admin resolves an open transport issue", async () => {
    const assetId = await makeAsset({ carrier: true });

    currentUserId = CARRIER_ID;
    const created = await agent
      .post(`/api/assets/${assetId}/issues`)
      .send({ issueType: "delayed", description: "traffic" })
      .expect(200);
    const issueId = created.body.id;
    expect(created.body.status).toBe("open");

    currentUserId = ADMIN_ID;
    const res = await agent
      .post(`/api/admin/issues/${issueId}/resolve`)
      .send({ note: "cleared" })
      .expect(200);
    expect(res.body.status).toBe("resolved");
  });
});

// ─── Transport Passport PDF ─────────────────────────────────────────────────

describe("Verified Release System™ — Transport Passport PDF", () => {
  it("returns a valid PDF for an authorized viewer (owner)", async () => {
    const assetId = await makeAsset({ carrier: true });
    // Add some timeline content so the PDF has real custody data to render.
    currentUserId = CARRIER_ID;
    await agent.post(`/api/assets/${assetId}/lifecycle`).send({ status: "running_normally" }).expect(200);

    currentUserId = OWNER_ID;
    const res = await agent
      .get(`/api/assets/${assetId}/passport.pdf`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    const body = res.body as Buffer;
    // A valid PDF starts with "%PDF-" and ends with "%%EOF".
    expect(body.length).toBeGreaterThan(500);
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(body.subarray(-8).toString("latin1")).toContain("EOF");
  });

  it("denies the passport PDF to a user with no role (403)", async () => {
    const assetId = await makeAsset();
    currentUserId = STRANGER_ID;
    await agent.get(`/api/assets/${assetId}/passport.pdf`).expect(403);
  });
});
