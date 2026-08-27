export type StandardJobPaymentInput = {
  budget: number | null | undefined;
  urgentFee: number | null | undefined;
  platformFeeRate: number;
};

export type StandardJobPayment = {
  budgetCents: number;
  urgentFeeCents: number;
  workerShareCents: number;
  processingFeeCents: number;
  grossChargeCents: number;
  applicationFeeCents: number;
  budget: number;
  urgentFee: number;
  workerShare: number;
  processingFee: number;
  grossCharge: number;
  applicationFee: number;
};

const STRIPE_PERCENT = 0.029;
const STRIPE_FIXED_CENTS = 30;

const cents = (value: number | null | undefined) => Math.max(0, Math.round((value || 0) * 100));
const dollars = (value: number) => Math.round(value) / 100;

/**
 * The accounting snapshot for a standard public job. Amounts are calculated in
 * cents so Checkout, capture, ledger, and wallet records cannot drift by a
 * rounding cent.
 */
export function calculateStandardJobPayment(input: StandardJobPaymentInput): StandardJobPayment {
  const budgetCents = cents(input.budget);
  const urgentFeeCents = cents(input.urgentFee);
  const rate = Math.min(1, Math.max(0, Number.isFinite(input.platformFeeRate) ? input.platformFeeRate : 0));
  const workerShareCents = Math.round(budgetCents * (1 - rate));
  const chargeBeforeProcessingCents = budgetCents + urgentFeeCents;
  const grossChargeCents = Math.ceil((chargeBeforeProcessingCents + STRIPE_FIXED_CENTS) / (1 - STRIPE_PERCENT));
  const processingFeeCents = grossChargeCents - chargeBeforeProcessingCents;
  const applicationFeeCents = grossChargeCents - workerShareCents;

  return {
    budgetCents,
    urgentFeeCents,
    workerShareCents,
    processingFeeCents,
    grossChargeCents,
    applicationFeeCents,
    budget: dollars(budgetCents),
    urgentFee: dollars(urgentFeeCents),
    workerShare: dollars(workerShareCents),
    processingFee: dollars(processingFeeCents),
    grossCharge: dollars(grossChargeCents),
    applicationFee: dollars(applicationFeeCents),
  };
}