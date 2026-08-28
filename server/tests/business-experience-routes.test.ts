import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import supertest from "supertest";
import {
  qualifyBusinessReferral,
  recordBusinessReferral,
  registerBusinessExperienceRoutes,
} from "../business-experience";

const mockPool = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
}));

const mockStorage = vi.hoisted(() => ({
  getBusinessAccount: vi.fn(),
  getBusinessAccountById: vi.fn(),
  getBusinessProfile: vi.fn(),
  updateBusinessAccount: vi.fn(),
  createAuditLog: vi.fn(),
  createNotification: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("../db", () => ({ pool: mockPool }));
vi.mock("../storage", () => ({ storage: mockStorage }));

const BUSINESS_OWNER_ID = 101;
const DISTRIBUTOR_ID = 202;
const ADMIN_ID = 303;
const BUSINESS_ACCOUNT_ID = 404;

const businessAccount = {
  id: BUSINESS_ACCOUNT_ID,
  ownerUserId: BUSINESS_OWNER_ID,
  businessName: "North Star Retail",
  workEmail: "owner@northstar.example",
  phone: null,
  industry: "Retail",
  companyNeedsSummary: null,
  status: "pending_business",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
};

function clientFor(...responses: unknown[]) {
  return {
    query: vi.fn(async () => responses.shift() ?? { rows: [] }),
    release: vi.fn(),
  };
}

function buildApp(userId: number | null = BUSINESS_OWNER_ID) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { userId };
    next();
  });

  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
    next();
  };
  const requireAdmin = (req: any, res: any, next: any) => {
    if (req.session.userId !== ADMIN_ID) return res.status(403).json({ message: "Admin only" });
    next();
  };
  registerBusinessExperienceRoutes(app, { requireAuth, requireAdmin });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPool.query.mockReset();
  mockPool.connect.mockReset();
  mockStorage.getBusinessAccount.mockResolvedValue(businessAccount);
  mockStorage.getBusinessAccountById.mockResolvedValue(businessAccount);
  mockStorage.getBusinessProfile.mockResolvedValue({ companyName: businessAccount.businessName });
  mockStorage.updateBusinessAccount.mockResolvedValue(businessAccount);
  mockStorage.createAuditLog.mockResolvedValue(undefined);
  mockStorage.createNotification.mockResolvedValue(undefined);
  mockStorage.getUser.mockResolvedValue({ id: DISTRIBUTOR_ID });
});

describe("business referral invitation attribution", () => {
  it("normalizes a valid code and stores the distributor attribution", async () => {
    const attribution = {
      id: 1,
      business_account_id: BUSINESS_ACCOUNT_ID,
      invitation_code: "TG-VALID",
      distributor_user_id: DISTRIBUTOR_ID,
      distributor_label: "Distributor One",
      status: "pending",
      reward_status: "pending",
    };
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ code: "TG-VALID", owner_user_id: DISTRIBUTOR_ID, owner_label: "Distributor One", active: true, expires_at: null }],
      })
      .mockResolvedValueOnce({ rows: [attribution] });
    const client = clientFor(
      undefined,
      undefined,
      { rows: [{ code: "TG-VALID", owner_user_id: DISTRIBUTOR_ID, owner_label: "Distributor One", active: true, expires_at: null }] },
      { rows: [attribution] },
      undefined,
    );
    mockPool.connect.mockResolvedValueOnce(client);

    await expect(recordBusinessReferral(BUSINESS_ACCOUNT_ID, "  tg-valid ", BUSINESS_OWNER_ID)).resolves.toEqual(attribution);
    expect(client.query.mock.calls[2][1]).toEqual(["TG-VALID"]);
    expect(client.query.mock.calls[3][1]).toEqual([
      BUSINESS_ACCOUNT_ID,
      "TG-VALID",
      DISTRIBUTOR_ID,
      "Distributor One",
    ]);
  });

  it.each([
    ["unknown", undefined],
    ["inactive", { code: "TG-TEST", owner_user_id: DISTRIBUTOR_ID, owner_label: "Distributor One", active: false, expires_at: null }],
    ["expired", { code: "TG-TEST", owner_user_id: DISTRIBUTOR_ID, owner_label: "Distributor One", active: true, expires_at: "2020-01-01T00:00:00.000Z" }],
  ])("rejects %s invitation codes", async (_label, codeRow) => {
    const client = clientFor(undefined, undefined, { rows: codeRow ? [codeRow] : [] }, undefined);
    mockPool.connect.mockResolvedValueOnce(client);

    await expect(recordBusinessReferral(BUSINESS_ACCOUNT_ID, "TG-TEST", BUSINESS_OWNER_ID))
      .rejects.toThrow("Invalid or expired invitation code");
    expect(client.query.mock.calls[2][1]).toEqual(["TG-TEST"]);
  });

  it("rejects a self-referral before writing an attribution", async () => {
    const client = clientFor(
      undefined,
      undefined,
      { rows: [{ code: "TG-SELF", owner_user_id: BUSINESS_OWNER_ID, owner_label: "Owner", active: true, expires_at: null }] },
      undefined,
    );
    mockPool.connect.mockResolvedValueOnce(client);

    await expect(recordBusinessReferral(BUSINESS_ACCOUNT_ID, "TG-SELF", BUSINESS_OWNER_ID))
      .rejects.toThrow("You cannot use your own distributor code");
    expect(client.query.mock.calls[2][1]).toEqual(["TG-SELF"]);
  });

  it("rejects duplicate attribution for the same business account", async () => {
    const client = clientFor(
      undefined,
      undefined,
      { rows: [{ code: "TG-DUP", owner_user_id: DISTRIBUTOR_ID, owner_label: "Distributor One", active: true, expires_at: null }] },
      { rows: [] },
      undefined,
    );
    mockPool.connect.mockResolvedValueOnce(client);

    await expect(recordBusinessReferral(BUSINESS_ACCOUNT_ID, "TG-DUP", BUSINESS_OWNER_ID))
      .rejects.toThrow("This business already has referral attribution");
    expect(client.query.mock.calls[3][0]).toContain("ON CONFLICT (business_account_id) DO NOTHING");
  });
});

describe("business evidence and administrator review", () => {
  it("submits evidence and records a non-override audit entry", async () => {
    const evidence = {
      id: 10,
      business_account_id: BUSINESS_ACCOUNT_ID,
      requirement_key: "registration_ein",
      status: "submitted",
      evidence_url: "https://irs.example/ein/123",
      note: "Certificate attached",
      is_admin_override: false,
    };
    mockPool.query.mockResolvedValueOnce({ rows: [evidence] });

    const response = await supertest(buildApp())
      .post("/api/business/verification-evidence")
      .send({
        requirementKey: "registration_ein",
        evidenceUrl: "  https://irs.example/ein/123  ",
        note: " Certificate attached ",
      })
      .expect(201);

    expect(response.body).toEqual(evidence);
    expect(mockPool.query.mock.calls[0][1]).toEqual([
      BUSINESS_ACCOUNT_ID,
      "registration_ein",
      "https://irs.example/ein/123",
      "Certificate attached",
    ]);
    expect(mockStorage.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      userId: BUSINESS_OWNER_ID,
      action: "business_verification_evidence_submitted",
    }));
    expect(mockStorage.createAuditLog.mock.calls[0][0].details).toContain("registration_ein");
  });

  it("requires evidence for an applicable requirement", async () => {
    const response = await supertest(buildApp())
      .post("/api/business/verification-evidence")
      .send({ requirementKey: "registration_ein" })
      .expect(400);

    expect(response.body.message).toContain("official document link or a note");
    expect(mockPool.query).not.toHaveBeenCalled();
    expect(mockStorage.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects evidence requirements that do not apply to the business type", async () => {
    const response = await supertest(buildApp())
      .post("/api/business/verification-evidence")
      .send({ requirementKey: "license", note: "not applicable" })
      .expect(400);

    expect(response.body.message).toContain("does not apply");
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("rejects an administrator decision without an audit reason", async () => {
    const response = await supertest(buildApp(ADMIN_ID))
      .post(`/api/admin/business-verification/${BUSINESS_ACCOUNT_ID}/review`)
      .send({ requirementKey: "registration_ein", decision: "approved", reason: " " })
      .expect(400);

    expect(response.body.message).toContain("audit reason");
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("records a rejected administrator override and keeps access limited", async () => {
    const review = {
      id: 10,
      business_account_id: BUSINESS_ACCOUNT_ID,
      requirement_key: "registration_ein",
      status: "rejected",
      is_admin_override: true,
      reviewed_by: ADMIN_ID,
      override_reason: "The submitted registration did not match the legal name.",
    };
    mockPool.query
      .mockResolvedValueOnce({ rows: [review] })
      .mockResolvedValueOnce({ rows: [{ requirement_key: "registration_ein", status: "rejected" }] });

    const response = await supertest(buildApp(ADMIN_ID))
      .post(`/api/admin/business-verification/${BUSINESS_ACCOUNT_ID}/review`)
      .send({
        requirementKey: "registration_ein",
        decision: "rejected",
        reason: review.override_reason,
      })
      .expect(200);

    expect(response.body).toEqual(review);
    expect(mockStorage.updateBusinessAccount).toHaveBeenCalledWith(BUSINESS_ACCOUNT_ID, {
      status: "approved_limited",
      verifiedAt: null,
    });
    expect(mockStorage.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      userId: ADMIN_ID,
      action: "business_verification_admin_review",
    }));
    expect(mockStorage.createAuditLog.mock.calls[0][0].details).toContain(review.override_reason);
    expect(mockPool.query.mock.calls[0][0]).toContain("is_admin_override");
  });

  it("approves the final requirement, verifies the business, and qualifies its referral", async () => {
    const review = {
      id: 11,
      business_account_id: BUSINESS_ACCOUNT_ID,
      requirement_key: "registration_ein",
      status: "approved",
      is_admin_override: true,
      reviewed_by: ADMIN_ID,
      override_reason: "Reviewed against the official filing.",
    };
    mockPool.query
      .mockResolvedValueOnce({ rows: [review] })
      .mockResolvedValueOnce({ rows: [{ requirement_key: "registration_ein", status: "approved" }] });
    mockPool.connect.mockResolvedValueOnce(clientFor(
      undefined,
      undefined,
      { rows: [{ invitation_code: "TG-VALID" }] },
      undefined,
      {
        rows: [{
          id: 12,
          business_account_id: BUSINESS_ACCOUNT_ID,
          invitation_code: "TG-VALID",
          owner_user_id: DISTRIBUTOR_ID,
          business_owner_id: BUSINESS_OWNER_ID,
          status: "pending",
          reward_status: "pending",
        }],
      },
      { rowCount: 1, rows: [] },
      undefined,
    ));

    const response = await supertest(buildApp(ADMIN_ID))
      .post(`/api/admin/business-verification/${BUSINESS_ACCOUNT_ID}/review`)
      .send({
        requirementKey: "registration_ein",
        decision: "approved",
        reason: review.override_reason,
      })
      .expect(200);

    expect(response.body).toEqual(review);
    expect(mockStorage.updateBusinessAccount).toHaveBeenCalledWith(BUSINESS_ACCOUNT_ID, {
      status: "verified_business",
      verifiedAt: expect.any(Date),
    });
    expect(mockStorage.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "business_referral_cash_reward_qualified",
      userId: ADMIN_ID,
    }));
    expect(mockStorage.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "business_verification_admin_review",
    }));
    expect(mockStorage.createNotification).toHaveBeenCalledTimes(1);
  });
});

describe("business-scoped inventory", () => {
  it("returns only available or active inventory for the requested verified business", async () => {
    const business = {
      business_account_id: BUSINESS_ACCOUNT_ID,
      companyName: "North Star Retail",
      accountStatus: "verified_business",
      businessHours: null,
    };
    const inventory = [
      { id: 1, business_account_id: BUSINESS_ACCOUNT_ID, title: "North Star item", status: "available" },
    ];
    mockPool.query
      .mockResolvedValueOnce({ rows: [business] })
      .mockResolvedValueOnce({ rows: inventory });

    const response = await supertest(buildApp(null))
      .get(`/api/public/businesses/${BUSINESS_ACCOUNT_ID}`)
      .expect(200);

    expect(response.body.inventory).toEqual(inventory);
    expect(mockPool.query.mock.calls[0][0]).toContain("ba.status = 'verified_business'");
    expect(mockPool.query.mock.calls[1][0]).toContain("business_account_id = $1");
    expect(mockPool.query.mock.calls[1][0]).toContain("status IN ('available', 'active')");
    expect(mockPool.query.mock.calls[1][1]).toEqual([BUSINESS_ACCOUNT_ID]);
  });

  it("scopes an authenticated storefront to the owner's business account", async () => {
    const inventory = [{ id: 2, business_account_id: BUSINESS_ACCOUNT_ID, title: "Owner item" }];
    mockPool.query.mockResolvedValueOnce({ rows: inventory });

    const response = await supertest(buildApp())
      .get("/api/business/storefront")
      .expect(200);

    expect(response.body).toEqual(inventory);
    expect(mockPool.query.mock.calls[0][0]).toContain("business_account_id = $1");
    expect(mockPool.query.mock.calls[0][1]).toEqual([BUSINESS_ACCOUNT_ID]);
  });
});

describe("exactly-once business referral reward and cash-out", () => {
  it("creates one $5 reward and one cash-out request across retries", async () => {
    const pendingAttribution = {
      id: 21,
      business_account_id: BUSINESS_ACCOUNT_ID,
      invitation_code: "TG-VALID",
      owner_user_id: DISTRIBUTOR_ID,
      business_owner_id: BUSINESS_OWNER_ID,
      status: "pending",
      reward_status: "pending",
    };
    const approvedAttribution = { ...pendingAttribution, status: "qualified", reward_status: "approved" };
    mockPool.connect
      .mockResolvedValueOnce(clientFor(
        undefined,
        undefined,
        { rows: [{ invitation_code: "TG-VALID" }] },
        undefined,
        { rows: [pendingAttribution] },
        { rowCount: 1, rows: [] },
        undefined,
      ))
      .mockResolvedValueOnce(clientFor(
        undefined,
        undefined,
        { rows: [{ invitation_code: "TG-VALID" }] },
        undefined,
        { rows: [approvedAttribution] },
        undefined,
      ));

    await expect(qualifyBusinessReferral(BUSINESS_ACCOUNT_ID, ADMIN_ID)).resolves.toEqual({
      ...pendingAttribution,
      status: "qualified",
      reward_status: "approved",
    });
    await expect(qualifyBusinessReferral(BUSINESS_ACCOUNT_ID, ADMIN_ID)).resolves.toEqual(approvedAttribution);

    expect(mockStorage.createAuditLog).toHaveBeenCalledTimes(1);
    expect(mockStorage.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "business_referral_cash_reward_qualified",
      userId: ADMIN_ID,
    }));
    expect(mockStorage.createNotification).toHaveBeenCalledTimes(1);

    const cashoutRequest = {
      id: 31,
      user_id: DISTRIBUTOR_ID,
      dollar_amount: 5,
      status: "pending",
      source_type: "business_referral",
      business_referral_id: 21,
    };
    mockStorage.getUser.mockResolvedValue({
      id: DISTRIBUTOR_ID,
      idVerified: true,
      stripeAccountId: "acct_test",
      stripeAccountStatus: "active",
    });
    mockPool.connect
      .mockResolvedValueOnce(clientFor(
        undefined,
        undefined,
        { rows: [{ ...approvedAttribution, reward_amount_cents: 500, cashout_request_id: null }] },
        { rows: [cashoutRequest] },
        undefined,
        undefined,
      ))
      .mockResolvedValueOnce(clientFor(
        undefined,
        undefined,
        { rows: [] },
        undefined,
      ));

    const firstCashout = await supertest(buildApp(DISTRIBUTOR_ID))
      .post("/api/business/referral/cashout")
      .send({ payoutMethod: "stripe_connect", payoutDetails: "acct_test" })
      .expect(201);
    expect(firstCashout.body).toEqual({ ...cashoutRequest, rewardAmountCents: 500 });

    await supertest(buildApp(DISTRIBUTOR_ID))
      .post("/api/business/referral/cashout")
      .send({ payoutMethod: "stripe_connect" })
      .expect(409);

    const clients = mockPool.connect.mock.results.map((result) => result.value);
    const cashoutClient = await clients[2];
    const cashoutInsert = cashoutClient.query.mock.calls.find(([statement]: [string]) =>
      statement.includes("INSERT INTO cashout_requests"),
    );
    expect(cashoutInsert?.[1]).toEqual([
      DISTRIBUTOR_ID,
      5,
      "acct_test",
      21,
    ]);
    expect(cashoutInsert?.[0]).toContain("'business_referral'");
    expect(cashoutClient.query.mock.calls.filter(([statement]: [string]) =>
      statement.includes("INSERT INTO cashout_requests"),
    )).toHaveLength(1);
    expect(cashoutClient.release).toHaveBeenCalled();
    expect((await clients[3]).release).toHaveBeenCalled();
  });
});