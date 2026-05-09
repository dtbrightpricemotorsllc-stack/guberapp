// Integration test for PATCH /api/resume/qualifications/:id/review
//
// Verifies that approving a drone credential (FAA Part 107 / Drone Operator):
//   1. Grants the "Drone Certified" milestone badge on the worker's user row.
//   2. Sets `droneCertified = true` on the worker projection.
//   3. Sends a notification whose body mentions the drone badge.
//
// The route is exercised through the REAL Express stack registered by
// registerRoutes() — no logic is duplicated inside the test. Storage and
// heavy infrastructure (DB pool, Stripe, PgSession) are mocked.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";

const ADMIN_ID = 1;
const TARGET_USER_ID = 100;
const QUALIFICATION_ID = 555;
const ADMIN_JWT = "test-only-admin-bearer-token";

const mockStorage = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateQualification: vi.fn(),
  updateUser: vi.fn(),
  getWorkerProjection: vi.fn(),
  upsertWorkerProjection: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock("../storage", () => ({ storage: mockStorage }));

vi.mock("../db", () => ({
  pool: { on: vi.fn(), query: vi.fn(), connect: vi.fn() },
  db: {},
}));

vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(_key: string, _opts?: any) {}
  },
}));

vi.mock("connect-pg-simple", async () => {
  const sessionModule = await import("express-session");
  return { default: () => sessionModule.default.MemoryStore };
});

vi.mock("../jwt", () => ({
  generateJWT: vi.fn(),
  verifyJWT: (token: string) =>
    token === ADMIN_JWT ? { sub: ADMIN_ID, email: "admin@example.com" } : null,
}));

import { registerRoutes } from "../routes";

describe("PATCH /api/resume/qualifications/:id/review — drone credential approval", () => {
  let agent: ReturnType<typeof supertest.agent>;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockStorage.getUser.mockImplementation(async (id: number) => {
      if (id === ADMIN_ID) {
        return { id: ADMIN_ID, email: "admin@example.com", role: "admin" };
      }
      if (id === TARGET_USER_ID) {
        return {
          id: TARGET_USER_ID,
          email: "worker@example.com",
          role: "buyer",
          tier: "community",
          milestoneBadges: [],
        };
      }
      return undefined;
    });

    mockStorage.updateUser.mockResolvedValue(undefined);
    mockStorage.upsertWorkerProjection.mockResolvedValue(undefined);
    mockStorage.createNotification.mockResolvedValue({ id: 1 });
    mockStorage.getWorkerProjection.mockResolvedValue({
      userId: TARGET_USER_ID,
      droneCertified: false,
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const app = express();
    app.use(express.json());
    const httpServer = createServer(app);
    await registerRoutes(httpServer, app);
    agent = supertest.agent(app);
  });

  it("grants the Drone Certified badge, flips the projection flag, and notifies the worker", async () => {
    mockStorage.updateQualification.mockResolvedValue({
      id: QUALIFICATION_ID,
      userId: TARGET_USER_ID,
      qualificationName: "FAA Part 107 Remote Pilot Certificate",
      credentialType: "FAA Part 107 / Drone Operator",
      verificationStatus: "verified",
    });

    const res = await agent
      .patch(`/api/resume/qualifications/${QUALIFICATION_ID}/review`)
      .set("Authorization", `Bearer ${ADMIN_JWT}`)
      .send({ verificationStatus: "verified", adminNotes: "Looks good" })
      .expect(200);

    expect(res.body.verificationStatus).toBe("verified");

    expect(mockStorage.updateUser).toHaveBeenCalledOnce();
    const [updatedUserId, updates] = mockStorage.updateUser.mock.calls[0];
    expect(updatedUserId).toBe(TARGET_USER_ID);
    expect(updates.credentialVerified).toBe(true);
    expect(updates.milestoneBadges).toContain("Drone Certified");

    expect(mockStorage.upsertWorkerProjection).toHaveBeenCalledOnce();
    const [projArg] = mockStorage.upsertWorkerProjection.mock.calls[0];
    expect(projArg.userId).toBe(TARGET_USER_ID);
    expect(projArg.droneCertified).toBe(true);

    expect(mockStorage.createNotification).toHaveBeenCalledOnce();
    const [notif] = mockStorage.createNotification.mock.calls[0];
    expect(notif.userId).toBe(TARGET_USER_ID);
    expect(notif.title).toBe("Credential approved");
    expect(notif.body).toMatch(/Drone Certified/);
  });

  it("matches drone credentials by qualification name when credentialType is missing", async () => {
    mockStorage.updateQualification.mockResolvedValue({
      id: QUALIFICATION_ID,
      userId: TARGET_USER_ID,
      qualificationName: "Part 107 Remote Pilot",
      credentialType: null,
      verificationStatus: "verified",
    });

    await agent
      .patch(`/api/resume/qualifications/${QUALIFICATION_ID}/review`)
      .set("Authorization", `Bearer ${ADMIN_JWT}`)
      .send({ verificationStatus: "verified" })
      .expect(200);

    const [, updates] = mockStorage.updateUser.mock.calls[0];
    expect(updates.milestoneBadges).toContain("Drone Certified");
    expect(mockStorage.upsertWorkerProjection).toHaveBeenCalledOnce();
    expect(mockStorage.upsertWorkerProjection.mock.calls[0][0].droneCertified).toBe(true);
  });

  it("does not grant the drone badge for a non-drone credential", async () => {
    mockStorage.updateQualification.mockResolvedValue({
      id: QUALIFICATION_ID,
      userId: TARGET_USER_ID,
      qualificationName: "OSHA 10 Construction Safety",
      credentialType: "OSHA 10",
      verificationStatus: "verified",
    });

    await agent
      .patch(`/api/resume/qualifications/${QUALIFICATION_ID}/review`)
      .set("Authorization", `Bearer ${ADMIN_JWT}`)
      .send({ verificationStatus: "verified" })
      .expect(200);

    const [, updates] = mockStorage.updateUser.mock.calls[0];
    expect(updates.milestoneBadges).toBeUndefined();
    expect(mockStorage.upsertWorkerProjection).not.toHaveBeenCalled();

    const [notif] = mockStorage.createNotification.mock.calls[0];
    expect(notif.body).not.toMatch(/Drone Certified/);
    expect(notif.body).toMatch(/Skilled \(credentialed\) tier/);
  });

  it("does not grant the drone badge when status is not 'verified'", async () => {
    mockStorage.updateQualification.mockResolvedValue({
      id: QUALIFICATION_ID,
      userId: TARGET_USER_ID,
      qualificationName: "FAA Part 107",
      credentialType: "FAA Part 107 / Drone Operator",
      verificationStatus: "rejected",
    });

    await agent
      .patch(`/api/resume/qualifications/${QUALIFICATION_ID}/review`)
      .set("Authorization", `Bearer ${ADMIN_JWT}`)
      .send({ verificationStatus: "rejected", adminNotes: "Document blurry" })
      .expect(200);

    expect(mockStorage.updateUser).not.toHaveBeenCalled();
    expect(mockStorage.upsertWorkerProjection).not.toHaveBeenCalled();
    expect(mockStorage.createNotification).not.toHaveBeenCalled();
  });
});
