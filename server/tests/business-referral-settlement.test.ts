import { beforeEach, describe, expect, it, vi } from "vitest";

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
  };
});

vi.mock("../db", () => ({ pool: mocks.pool }));

import { reviewCashoutRequest } from "../growth-engine";

describe("business referral settlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechecks eligibility, transfers idempotently through the caller, and records the reference", async () => {
    const events: string[] = [];
    mocks.client.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql === "BEGIN" || sql === "COMMIT") {
        events.push(sql);
        return { rows: [] };
      }
      if (sql.includes("FROM cashout_requests cr")) {
        return {
          rows: [{
            id: 45,
            user_id: 77,
            dollar_amount: "5.00",
            status: "pending",
            source_type: "business_referral",
            business_referral_id: 12,
            payout_destination_account_id: "acct_original",
            id_verified: true,
            stripe_account_id: "acct_current",
            stripe_account_status: "active",
          }],
        };
      }
      if (sql.includes("UPDATE cashout_requests")) {
        events.push("request-updated");
        expect(params).toEqual([
          "approved",
          "Ready",
          900,
          "acct_current",
          "tr_referral_45",
          45,
        ]);
        return { rows: [] };
      }
      if (sql.includes("UPDATE business_referral_attributions")) {
        events.push("reward-paid");
        expect(params).toEqual([12, 45]);
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const settle = vi.fn(async (input) => {
      events.push("stripe-transfer");
      expect(input).toEqual({
        requestId: 45,
        userId: 77,
        amountCents: 500,
        destinationAccountId: "acct_current",
      });
      return { id: "tr_referral_45" };
    });

    await reviewCashoutRequest(45, 900, "approved", "Ready", settle);

    expect(settle).toHaveBeenCalledOnce();
    expect(events.indexOf("stripe-transfer")).toBeLessThan(events.indexOf("reward-paid"));
    expect(events.at(-1)).toBe("COMMIT");
  });

  it("does not settle or mark paid when Connect eligibility has lapsed", async () => {
    mocks.client.query.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("FROM cashout_requests cr")) {
        return {
          rows: [{
            id: 46,
            user_id: 78,
            dollar_amount: "5.00",
            status: "pending",
            source_type: "business_referral",
            business_referral_id: 13,
            id_verified: true,
            stripe_account_id: "acct_lapsed",
            stripe_account_status: "restricted",
          }],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const settle = vi.fn();

    await expect(
      reviewCashoutRequest(46, 900, "approved", undefined, settle),
    ).rejects.toThrow("no longer active");

    expect(settle).not.toHaveBeenCalled();
    expect(mocks.client.query).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE business_referral_attributions"),
      expect.anything(),
    );
  });
});