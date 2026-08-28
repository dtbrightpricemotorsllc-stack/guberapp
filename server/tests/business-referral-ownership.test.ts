import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import supertest from "supertest";

const mocks = vi.hoisted(() => {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };
  return {
    client,
    pool: {
      connect: vi.fn(async () => client),
      query: vi.fn(),
    },
    storage: {
      getUser: vi.fn(),
      getBusinessAccount: vi.fn(),
      createAuditLog: vi.fn(),
      createNotification: vi.fn(),
    },
  };
});

vi.mock("../db", () => ({ pool: mocks.pool }));
vi.mock("../storage", () => ({ storage: mocks.storage }));

import {
  qualifyBusinessReferral,
  recordBusinessReferral,
  registerBusinessExperienceRoutes,
} from "../business-experience";

function testApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { userId: 900 };
    next();
  });
  const allow = (_req: any, _res: any, next: any) => next();
  registerBusinessExperienceRoutes(app, { requireAuth: allow, requireAdmin: allow });
  return app;
}

describe("business referral ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storage.createAuditLog.mockResolvedValue({});
    mocks.storage.createNotification.mockResolvedValue({});
    mocks.pool.query.mockResolvedValue({ rows: [] });
  });

  it("serializes owner assignment and appends the old and new owner to history", async () => {
    mocks.storage.getUser.mockResolvedValue({
      id: 22,
      fullName: "New Distributor",
      username: "new-distributor",
    });
    mocks.client.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.includes("pg_advisory_xact_lock(hashtext")) return { rows: [] };
      if (sql.includes("FROM business_referral_codes") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            code: "TG-HKH94G",
            label: "Team GUBER distributor 1",
            owner_user_id: 11,
            owner_label: "Original Distributor",
          }],
        };
      }
      if (sql.includes("UPDATE business_referral_codes")) {
        return {
          rows: [{
            code: "TG-HKH94G",
            label: "Team GUBER distributor 1",
            owner_user_id: 22,
            owner_label: "New Distributor",
          }],
        };
      }
      if (sql.includes("INSERT INTO business_referral_code_owner_history")) {
        expect(params).toEqual([
          "TG-HKH94G",
          11,
          "Original Distributor",
          22,
          "New Distributor",
          900,
        ]);
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const response = await supertest(testApp())
      .patch("/api/admin/business-referral-codes/tg-hkh94g")
      .send({ ownerUserId: 22 })
      .expect(200);

    expect(response.body.owner_user_id).toBe(22);
    expect(mocks.client.query.mock.calls.map(([sql]) => String(sql))).toEqual(expect.arrayContaining([
      "BEGIN",
      expect.stringContaining("pg_advisory_xact_lock(hashtext"),
      expect.stringContaining("INSERT INTO business_referral_code_owner_history"),
      "COMMIT",
    ]));
    expect(mocks.storage.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      userId: 900,
      action: "business_referral_code_owner_changed",
      details: expect.stringContaining("Original Distributor"),
    }));
    expect(mocks.pool.query).toHaveBeenCalledWith(
      expect.stringContaining("a.distributor_user_id IS NULL"),
      ["TG-HKH94G"],
    );
  });

  it("locks the code before snapshotting its owner onto a new attribution", async () => {
    mocks.client.query.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.includes("pg_advisory_xact_lock(hashtext")) return { rows: [] };
      if (sql.includes("SELECT code, owner_user_id")) {
        return {
          rows: [{
            code: "TG-AD8P7S",
            owner_user_id: 33,
            owner_label: "Signup Owner",
            active: true,
            expires_at: null,
          }],
        };
      }
      if (sql.includes("INSERT INTO business_referral_attributions")) {
        return {
          rows: [{
            id: 1,
            business_account_id: 77,
            invitation_code: "TG-AD8P7S",
            distributor_user_id: 33,
            distributor_label: "Signup Owner",
          }],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const attribution = await recordBusinessReferral(77, "tg-ad8p7s", 88);
    const sqlCalls = mocks.client.query.mock.calls.map(([sql]) => String(sql));

    expect(sqlCalls.findIndex((sql) => sql.includes("pg_advisory_xact_lock(hashtext")))
      .toBeLessThan(sqlCalls.findIndex((sql) => sql.includes("SELECT code, owner_user_id")));
    expect(attribution.distributor_user_id).toBe(33);
    expect(attribution.distributor_label).toBe("Signup Owner");
  });

  it("keeps an unassigned attribution non-payable until an owner exists", async () => {
    mocks.client.query.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("SELECT invitation_code")) {
        return { rows: [{ invitation_code: "TG-DY2WKH" }] };
      }
      if (sql.includes("SELECT a.*")) {
        return {
          rows: [{
            id: 4,
            business_account_id: 91,
            invitation_code: "TG-DY2WKH",
            distributor_user_id: null,
            distributor_label: null,
            owner_user_id: null,
            owner_label: null,
            business_owner_id: 101,
            status: "pending",
            reward_status: "pending",
          }],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await qualifyBusinessReferral(91, 900);

    expect(result.reward_status).toBe("pending");
    expect(mocks.client.query).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE business_referral_attributions"),
      expect.anything(),
    );
    expect(mocks.storage.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects referral cash-out before connecting to the reward transaction", async () => {
    mocks.storage.getUser.mockResolvedValue({
      id: 55,
      idVerified: true,
      stripeAccountId: null,
      stripeAccountStatus: "active",
    });

    const response = await supertest(testApp())
      .post("/api/business/referral/cashout")
      .send({ payoutMethod: "cashapp", payoutDetails: "$handle" })
      .expect(409);

    expect(response.body.message).toContain("Stripe Connect");
    expect(mocks.pool.connect).not.toHaveBeenCalled();
  });
});