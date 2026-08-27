import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPool = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
}));

vi.mock("../db", () => ({ pool: mockPool }));

import { settleStandardDestinationCharge } from "../job-payment-settlement";

const pendingRow = {
  id: 44,
  posted_by_id: 100,
  assigned_helper_id: 200,
  title: "QA fixture job",
  status: "completion_submitted",
  stripe_payment_intent_id: "pi_job_44",
  payment_rail: "destination_charge",
  payment_gross_cents: 11360,
  worker_payout_cents: 8000,
  worker_gross_share: 80,
  capture_status: "pending",
  capture_attempts: 0,
};

function transactionClient(row = pendingRow) {
  return {
    query: vi.fn(async (query: string) => {
      if (query.includes("SELECT j.id")) return { rows: [row], rowCount: 1 };
      if (query.includes("SELECT capture_status")) return { rows: [{ capture_status: "capturing" }], rowCount: 1 };
      if (query.includes("UPDATE wallet_transactions")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
}

describe("settleStandardDestinationCharge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it("captures once and writes job, ledger, wallet, and settlement state in the final transaction", async () => {
    const claim = transactionClient();
    const finalize = transactionClient();
    mockPool.connect.mockResolvedValueOnce(claim).mockResolvedValueOnce(finalize);
    const stripe = {
      paymentIntents: {
        capture: vi.fn().mockResolvedValue({ amount_received: 11360 }),
      },
    };

    const result = await settleStandardDestinationCharge(44, stripe as any);

    expect(result).toEqual({ status: "captured", grossCharge: 113.6, workerShare: 80 });
    expect(stripe.paymentIntents.capture).toHaveBeenCalledOnce();
    expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(
      "pi_job_44",
      {},
      { idempotencyKey: "guber-standard-job-44-capture-v1" },
    );
    const finalQueries = finalize.query.mock.calls.map(([query]) => String(query));
    expect(finalQueries.some((query) => query.includes("INSERT INTO money_ledger"))).toBe(true);
    expect(finalQueries.some((query) => query.includes("wallet_transactions"))).toBe(true);
    expect(finalQueries.some((query) => query.includes("capture_status = 'captured'"))).toBe(true);
  });

  it("does not call Stripe again after a durable captured settlement", async () => {
    const claim = transactionClient({ ...pendingRow, capture_status: "captured" });
    mockPool.connect.mockResolvedValueOnce(claim);
    const stripe = { paymentIntents: { capture: vi.fn() } };

    const result = await settleStandardDestinationCharge(44, stripe as any);

    expect(result).toEqual({ status: "already_captured", grossCharge: 113.6, workerShare: 80 });
    expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
  });

  it("lets a concurrent request observe the active capture claim without calling Stripe", async () => {
    const claim = transactionClient({
      ...pendingRow,
      capture_status: "capturing",
      last_attempt_at: new Date(),
    });
    mockPool.connect.mockResolvedValueOnce(claim);
    const stripe = { paymentIntents: { capture: vi.fn() } };

    const result = await settleStandardDestinationCharge(44, stripe as any);

    expect(result).toEqual({ status: "capture_in_progress" });
    expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
  });

  it("leaves a Stripe capture failure retryable instead of finalizing the job", async () => {
    const claim = transactionClient();
    mockPool.connect.mockResolvedValueOnce(claim);
    const stripe = {
      paymentIntents: {
        capture: vi.fn().mockRejectedValue(new Error("temporary Stripe outage")),
      },
    };

    const result = await settleStandardDestinationCharge(44, stripe as any);

    expect(result.status).toBe("capture_failed");
    expect(mockPool.query).toHaveBeenCalledTimes(2);
    const updates = mockPool.query.mock.calls.map(([query]) => String(query)).join("\n");
    expect(updates).toContain("capture_status = $2");
    expect(updates).toContain("status = 'completion_submitted'");
  });
});