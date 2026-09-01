import express from "express";
import session from "express-session";
import supertest from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  config: {
    enabled: true,
    baseline: 517,
    eligibleSignupCount: 499,
  },
  users: new Map<number, any>(),
  retries: new Map<number, any>(),
  entries: [] as any[],
  winners: [] as any[],
  alerts: [] as any[],
  notifications: [] as any[],
  nextEntryId: 1,
  nextWinnerId: 1,
  failAllocationOnce: false,
}));

const mockPool = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
}));

function promotionRowForUser(userId: number) {
  const entry = mockState.entries.find((candidate) => candidate.user_id === userId);
  if (!entry) return { rows: [], rowCount: 0 };
  const winner = mockState.winners.find((candidate) => candidate.entry_id === entry.id);
  return {
    rows: [{
      ...entry,
      winner_id: winner?.id ?? null,
      winner_status: winner?.status ?? null,
      prize_cents: winner?.prize_cents ?? null,
      payout_method: winner?.payout_method ?? null,
      payout_handle: winner?.payout_handle ?? null,
      claimed_at: winner?.claimed_at ?? null,
      paid_at: winner?.paid_at ?? null,
      disqualification_reason: winner?.disqualification_reason ?? null,
      admin_notes: winner?.admin_notes ?? null,
    }],
    rowCount: 1,
  };
}

function handlePromotionQuery(statement: string, params: unknown[] = []) {
  if (statement === "BEGIN" || statement === "COMMIT" || statement === "ROLLBACK") {
    return { rows: [], rowCount: 0 };
  }

  if (statement.includes("INSERT INTO signup_promotion_config")) {
    return { rows: [], rowCount: 0 };
  }

  if (statement.includes("SELECT e.*, w.id AS winner_id")) {
    return promotionRowForUser(Number(params[0]));
  }

  if (statement.includes("SELECT * FROM signup_promotion_config")) {
    if (mockState.failAllocationOnce) {
      mockState.failAllocationOnce = false;
      throw new Error("temporary promotion database outage");
    }
    return {
      rows: [{
        enabled: mockState.config.enabled,
        baseline: mockState.config.baseline,
        eligible_signup_count: mockState.config.eligibleSignupCount,
      }],
      rowCount: 1,
    };
  }

  if (statement.includes("SELECT id FROM signup_promotion_entries")) {
    const normalizedEmail = params[0];
    return {
      rows: mockState.entries
        .filter((entry) => entry.normalized_email === normalizedEmail)
        .map((entry) => ({ id: entry.id })),
      rowCount: 0,
    };
  }

  if (statement.includes("UPDATE signup_promotion_config")) {
    mockState.config.eligibleSignupCount += 1;
    return {
      rows: [{
        eligible_signup_count: mockState.config.eligibleSignupCount,
        baseline: mockState.config.baseline,
      }],
      rowCount: 1,
    };
  }

  if (statement.includes("INSERT INTO signup_promotion_entries")) {
    const entry = {
      id: mockState.nextEntryId++,
      user_id: Number(params[0]),
      normalized_email: params[1],
      eligible: params[2],
      reason: params[3],
      sequence_number: params[4],
      global_signup_number: params[5],
      created_at: new Date(),
    };
    mockState.entries.push(entry);
    return { rows: [entry], rowCount: 1 };
  }

  if (statement.includes("INSERT INTO signup_promotion_winners")) {
    const existing = mockState.winners.find((winner) => winner.entry_id === Number(params[0]));
    const winner = existing ?? {
      id: mockState.nextWinnerId++,
      entry_id: Number(params[0]),
      user_id: Number(params[1]),
      global_signup_number: Number(params[2]),
      prize_cents: Number(params[3]),
      status: "pending_claim",
    };
    if (!existing) mockState.winners.push(winner);
    return { rows: [{ id: winner.id }], rowCount: 1 };
  }

  if (statement.includes("INSERT INTO signup_promotion_alerts")) {
    const winnerId = Number(params[0]);
    if (!mockState.alerts.some((alert) => alert.winner_id === winnerId)) {
      mockState.alerts.push({ id: mockState.alerts.length + 1, winner_id: winnerId });
    }
    return { rows: [], rowCount: 1 };
  }

  if (statement.includes("INSERT INTO notifications")) {
    const userId = Number(params[0]);
    if (!mockState.notifications.some((notification) => notification.user_id === userId)) {
      mockState.notifications.push({
        id: mockState.notifications.length + 1,
        user_id: userId,
        type: params[3],
        cta_url: params[4],
      });
    }
    return { rows: [], rowCount: 1 };
  }

  throw new Error(`Unhandled promotion test query: ${statement}`);
}

vi.mock("../db", () => ({ pool: mockPool }));

import {
  SIGNUP_PROMOTION_BASELINE,
  SIGNUP_PROMOTION_INTERVAL,
  SIGNUP_PROMOTION_PRIZE_CENTS,
  classifyPromotionUser,
  recordSignupPromotionSafely,
  retrySignupPromotionAllocations,
  isPromotionWinner,
  promotionGlobalSignupNumber,
  validatePromotionWinnerUpdate,
} from "../signup-promotion";
import { handleSignup, type AuthStorage } from "../auth";

const user = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  email: "new-user@example.com",
  ...overrides,
});

function resetPromotionState() {
  mockState.config.enabled = true;
  mockState.config.baseline = SIGNUP_PROMOTION_BASELINE;
  mockState.config.eligibleSignupCount = 499;
  mockState.users.clear();
  mockState.retries.clear();
  mockState.entries.length = 0;
  mockState.winners.length = 0;
  mockState.alerts.length = 0;
  mockState.notifications.length = 0;
  mockState.nextEntryId = 1;
  mockState.nextWinnerId = 1;
  mockState.failAllocationOnce = false;

  mockPool.query.mockImplementation(async (statement: string, params: unknown[] = []) => {
    if (statement.includes("SELECT user_id") && statement.includes("signup_promotion_retries")) {
      return {
        rows: [...mockState.retries.entries()]
          .filter(([, retry]) => !retry.resolved_at && retry.next_attempt_at <= new Date())
          .map(([userId]) => ({ user_id: userId })),
        rowCount: mockState.retries.size,
      };
    }

    if (statement.includes("SELECT id, email") && statement.includes("FROM users")) {
      const found = mockState.users.get(Number(params[0]));
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }

    if (statement.includes("INSERT INTO signup_promotion_retries")) {
      const userId = Number(params[0]);
      const existing = mockState.retries.get(userId);
      mockState.retries.set(userId, {
        user_id: userId,
        attempts: (existing?.attempts ?? 0) + (existing ? 1 : 0),
        last_error: params[1],
        next_attempt_at: new Date(),
        resolved_at: null,
      });
      return { rows: [], rowCount: 1 };
    }

    if (statement.includes("UPDATE signup_promotion_retries SET resolved_at")) {
      const retry = mockState.retries.get(Number(params[0]));
      if (retry) retry.resolved_at = new Date();
      return { rows: [], rowCount: retry ? 1 : 0 };
    }

    throw new Error(`Unhandled promotion test pool query: ${statement}`);
  });

  mockPool.connect.mockImplementation(async () => ({
    query: vi.fn((statement: string, params: unknown[] = []) => Promise.resolve(handlePromotionQuery(statement, params))),
    release: vi.fn(),
  }));
}

beforeEach(resetPromotionState);

describe("fixed-baseline signup promotion", () => {
  it("keeps the established baseline, interval, and prize", () => {
    expect(SIGNUP_PROMOTION_BASELINE).toBe(517);
    expect(SIGNUP_PROMOTION_INTERVAL).toBe(500);
    expect(SIGNUP_PROMOTION_PRIZE_CENTS).toBe(5000);
  });

  it("awards only every 500th eligible signup", () => {
    expect(isPromotionWinner(499)).toBe(false);
    expect(isPromotionWinner(500)).toBe(true);
    expect(isPromotionWinner(501)).toBe(false);
    expect(isPromotionWinner(1000)).toBe(true);
  });

  it("adds the post-activation sequence to the fixed baseline", () => {
    expect(promotionGlobalSignupNumber(499)).toBe(1016);
    expect(promotionGlobalSignupNumber(500)).toBe(1017);
    expect(promotionGlobalSignupNumber(1000)).toBe(1517);
    expect(promotionGlobalSignupNumber(1500)).toBe(2017);
  });

  it("excludes the account categories from the permanent eligibility snapshot", () => {
    expect(classifyPromotionUser(user())).toBeNull();
    expect(classifyPromotionUser(user({ accountType: "business" }))).toBe("business_account");
    expect(classifyPromotionUser(user({ accountType: "pending_business" }))).toBe("business_account");
    expect(classifyPromotionUser(user({ role: "admin" }))).toBe("admin_account");
    expect(classifyPromotionUser(user({ isTestUser: true }))).toBe("test_account");
    expect(classifyPromotionUser(user({ suspended: true }))).toBe("suspended_account");
    expect(classifyPromotionUser(user({ banned: true }))).toBe("banned_account");
    expect(classifyPromotionUser(user({ deletedAt: new Date() }))).toBe("deleted_account");
    expect(classifyPromotionUser(user({ email: "  " }))).toBe("missing_email");
  });

  it("only permits a claimed winner to become paid with payout and audit details", () => {
    expect(() => validatePromotionWinnerUpdate("pending_claim", "paid", "cash_app", "$winner", "Paid manually")).toThrow("Cannot change");
    expect(() => validatePromotionWinnerUpdate("claimed", "paid", null, "$winner", "Paid manually")).toThrow("Payout method");
    expect(() => validatePromotionWinnerUpdate("claimed", "paid", "cash_app", "", "Paid manually")).toThrow("payout handle");
    expect(() => validatePromotionWinnerUpdate("claimed", "paid", "cash_app", "$winner", "no")).toThrow("audit note");
    expect(() => validatePromotionWinnerUpdate("claimed", "paid", "cash_app", "$winner", "Paid manually")).not.toThrow();
    expect(() => validatePromotionWinnerUpdate("paid", "claimed", "cash_app", "$winner", "Paid manually")).toThrow("Cannot change");
  });
});

describe("signup promotion retry recovery", () => {
  it("lets signup succeed, durably retries a transient allocation failure, and stays idempotent", async () => {
    const storageState = {
      createdUser: undefined as any,
    };
    const storage: AuthStorage = {
      getUserByEmail: async () => undefined,
      getUserByUsername: async () => undefined,
      createUser: async (data) => {
        storageState.createdUser = {
          id: 42,
          email: String(data.email),
          username: String(data.username),
          fullName: String(data.fullName),
          accountType: null,
          role: "buyer",
          isTestUser: false,
          suspended: false,
          banned: false,
          deletedAt: null,
        };
        mockState.users.set(storageState.createdUser.id, storageState.createdUser);
        return storageState.createdUser;
      },
      getUser: async (id) => mockState.users.get(id),
      updateUser: async () => undefined,
      createPasswordResetToken: async () => {},
      getPasswordResetToken: async () => undefined,
      invalidatePasswordResetToken: async () => {},
    };

    const app = express();
    app.use(express.json());
    app.use(session({ secret: "signup-promotion-test-secret", resave: false, saveUninitialized: false }));
    app.post("/signup", handleSignup(storage, { onUserCreated: recordSignupPromotionSafely }));

    mockState.failAllocationOnce = true;
    const signupResponse = await supertest(app).post("/signup").send({
      email: "winner@example.com",
      username: "winner",
      fullName: "Promotion Winner",
      password: "Strong-password-123!",
    });

    expect(signupResponse.status).toBe(201);
    expect(storageState.createdUser).toMatchObject({ id: 42, email: "winner@example.com" });
    expect(mockState.retries.get(42)).toMatchObject({
      user_id: 42,
      attempts: 0,
      last_error: "temporary promotion database outage",
      next_attempt_at: expect.any(Date),
      resolved_at: null,
    });
    expect(mockState.entries).toHaveLength(0);
    expect(mockState.winners).toHaveLength(0);

    await expect(retrySignupPromotionAllocations()).resolves.toBe(1);

    expect(mockState.retries.get(42)?.resolved_at).toBeInstanceOf(Date);
    expect(mockState.entries).toHaveLength(1);
    expect(mockState.entries[0]).toMatchObject({
      user_id: 42,
      eligible: true,
      sequence_number: 500,
      global_signup_number: 1017,
    });
    expect(mockState.winners).toHaveLength(1);
    expect(mockState.winners[0]).toMatchObject({
      entry_id: mockState.entries[0].id,
      user_id: 42,
      global_signup_number: 1017,
      prize_cents: SIGNUP_PROMOTION_PRIZE_CENTS,
      status: "pending_claim",
    });
    expect(mockState.alerts).toHaveLength(1);
    expect(mockState.notifications).toHaveLength(1);

    const replayedRetry = mockState.retries.get(42);
    replayedRetry.resolved_at = null;
    replayedRetry.next_attempt_at = new Date();

    await expect(retrySignupPromotionAllocations()).resolves.toBe(1);

    expect(mockState.entries).toHaveLength(1);
    expect(mockState.winners).toHaveLength(1);
    expect(mockState.alerts).toHaveLength(1);
    expect(mockState.notifications).toHaveLength(1);
    expect(mockState.retries.get(42)?.resolved_at).toBeInstanceOf(Date);

    await expect(retrySignupPromotionAllocations()).resolves.toBe(0);
  });
});