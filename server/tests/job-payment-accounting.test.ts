import { describe, expect, it } from "vitest";
import { calculateStandardJobPayment } from "../job-payment-accounting";

describe("standard job payment accounting", () => {
  it("uses one cents-based snapshot for Checkout and the destination-charge worker share", () => {
    const payment = calculateStandardJobPayment({
      budget: 100,
      urgentFee: 10,
      platformFeeRate: 0.2,
    });

    expect(payment).toMatchObject({
      budgetCents: 10_000,
      urgentFeeCents: 1_000,
      workerShareCents: 8_000,
      grossChargeCents: 11_360,
      processingFeeCents: 360,
      applicationFeeCents: 3_360,
    });
    expect(payment.grossChargeCents - payment.workerShareCents).toBe(payment.applicationFeeCents);
  });

  it("rounds the worker payment and gross charge independently in cents", () => {
    const payment = calculateStandardJobPayment({
      budget: 19.99,
      urgentFee: 0,
      platformFeeRate: 0.15,
    });

    expect(payment.workerShareCents).toBe(1_699);
    expect(payment.grossChargeCents).toBeGreaterThan(payment.budgetCents);
    expect(payment.applicationFeeCents).toBe(payment.grossChargeCents - payment.workerShareCents);
  });

  it("does not permit a negative invoice when malformed optional amounts arrive", () => {
    const payment = calculateStandardJobPayment({
      budget: -10,
      urgentFee: -4,
      platformFeeRate: 4,
    });

    expect(payment.grossChargeCents).toBeGreaterThanOrEqual(30);
    expect(payment.workerShareCents).toBe(0);
  });
});