import type { User, Job } from "@shared/schema";

export interface PlatformFeeConfig {
  platformFeeRate: number;
  posterProcessingFeeRate: number;
  posterServiceFeeRate: number;
  earlyCashoutFeeRate: number;
  instantCashoutFeeRate: number;
  reviewTimerHours: number;
  autoConfirmEnabled: boolean;
  autoPayoutEnabled: boolean;
  earlyCashoutEnabled: boolean;
  instantCashoutEnabled: boolean;
}

export const DEFAULT_FEE_CONFIG: PlatformFeeConfig = {
  platformFeeRate: 0.20,
  posterProcessingFeeRate: 0.032,
  posterServiceFeeRate: 0,
  earlyCashoutFeeRate: 0.02,
  instantCashoutFeeRate: 0.05,
  reviewTimerHours: 12,
  autoConfirmEnabled: true,
  autoPayoutEnabled: false,
  earlyCashoutEnabled: false,
  instantCashoutEnabled: false,
};

export interface JobPricing {
  baseJobPrice: number;
  posterProcessingFee: number;
  posterServiceFee: number;
  totalPosterCharge: number;
  platformFeeRate: number;
  platformFeeAmount: number;
  workerGrossShare: number;
  workerNetAfterCashoutFee: number;
  payoutMethodType: string;
  payoutSpeedType: string;
  feeProfile: string;
}

export function calculateJobPricing(
  baseJobPrice: number,
  config: PlatformFeeConfig,
  worker?: Partial<User> | null,
  options?: {
    referralDiscount?: number;
    ogDiscount?: boolean;
    promoRate?: number;
    cashoutMode?: "standard" | "early" | "instant";
  }
): JobPricing {
  let effectiveFeeRate = config.platformFeeRate;
  let feeProfile = "standard";

  if (options?.promoRate !== undefined) {
    effectiveFeeRate = options.promoRate;
    feeProfile = "promo";
  } else if (options?.ogDiscount && worker?.day1OG) {
    effectiveFeeRate = Math.max(effectiveFeeRate - 0.02, 0.05);
    feeProfile = "day1_og";
  } else if (options?.referralDiscount) {
    effectiveFeeRate = Math.max(effectiveFeeRate - options.referralDiscount, 0.05);
    feeProfile = "referral";
  }

  const platformFeeAmount = Math.round(baseJobPrice * effectiveFeeRate * 100) / 100;
  const workerGrossShare = Math.round((baseJobPrice - platformFeeAmount) * 100) / 100;

  const posterProcessingFee = Math.round(baseJobPrice * config.posterProcessingFeeRate * 100) / 100;
  const posterServiceFee = config.posterServiceFeeRate > 0
    ? Math.round(baseJobPrice * config.posterServiceFeeRate * 100) / 100
    : 0;
  const totalPosterCharge = Math.round((baseJobPrice + posterProcessingFee + posterServiceFee) * 100) / 100;

  let cashoutFee = 0;
  let payoutSpeedType = "standard";
  if (options?.cashoutMode === "early" && config.earlyCashoutEnabled) {
    cashoutFee = Math.round(workerGrossShare * config.earlyCashoutFeeRate * 100) / 100;
    payoutSpeedType = "early";
  } else if (options?.cashoutMode === "instant" && config.instantCashoutEnabled) {
    cashoutFee = Math.round(workerGrossShare * config.instantCashoutFeeRate * 100) / 100;
    payoutSpeedType = "instant";
  }

  const workerNetAfterCashoutFee = Math.round((workerGrossShare - cashoutFee) * 100) / 100;

  return {
    baseJobPrice,
    posterProcessingFee,
    posterServiceFee,
    totalPosterCharge,
    platformFeeRate: effectiveFeeRate,
    platformFeeAmount,
    workerGrossShare,
    workerNetAfterCashoutFee,
    payoutMethodType: "bank",
    payoutSpeedType,
    feeProfile,
  };
}

export type TrustLevel = "new_worker" | "verified_worker" | "trusted_worker";

export interface TrustInfo {
  score: number;
  level: TrustLevel;
  canEarlyCashout: boolean;
  canInstantCashout: boolean;
  badges: string[];
}

export function getTrustLevel(score: number): TrustLevel {
  if (score >= 80) return "trusted_worker";
  if (score >= 60) return "verified_worker";
  return "new_worker";
}

export function getTrustInfo(
  user: Partial<User>,
  config: PlatformFeeConfig
): TrustInfo {
  const score = user.trustScore ?? 50;
  const level = getTrustLevel(score);
  const isOG = user.day1OG ?? false;

  const badges: string[] = [];
  if (level === "verified_worker" || level === "trusted_worker") badges.push("Verified");
  if (level === "trusted_worker") badges.push("Trusted Helper");
  if (isOG) badges.push("Day-1 OG");
  if ((user.jobsCompleted ?? 0) >= 10) badges.push("10+ Jobs");
  if ((user.jobsCompleted ?? 0) >= 50) badges.push("50+ Jobs");
  if ((user.onTimePct ?? 0) >= 95) badges.push("Fast Responder");

  let canEarlyCashout = false;
  let canInstantCashout = false;

  if (config.earlyCashoutEnabled) {
    if (level === "verified_worker" || level === "trusted_worker") {
      canEarlyCashout = true;
    }
    if (isOG) canEarlyCashout = true;
  }

  if (config.instantCashoutEnabled) {
    if (level === "trusted_worker") {
      canInstantCashout = true;
    }
    if (isOG) canInstantCashout = true;
  }

  return { score, level, canEarlyCashout, canInstantCashout, badges };
}

export const TRUST_ADJUSTMENTS = {
  JOB_COMPLETED_WITH_PROOF: 5,
  POSTER_CONFIRMED: 5,
  ON_TIME_COMPLETION: 2,
  POSITIVE_RATING: 2,
  DISPUTE_OPENED: -10,
  JOB_ABANDONED: -15,
  PROOF_REJECTED: -20,
  LATE_COMPLETION: -5,
  OG_STARTING_BONUS: 10,
};

export function adjustTrustScore(currentScore: number, adjustment: number): number {
  return Math.max(0, Math.min(100, currentScore + adjustment));
}

export interface PayoutEligibility {
  eligible: boolean;
  reason?: string;
  availableModes: ("standard" | "early" | "instant")[];
}

export function checkPayoutEligibility(
  job: Partial<Job>,
  worker: Partial<User>,
  config: PlatformFeeConfig,
  proofSubmitted: boolean,
  hasDispute: boolean
): PayoutEligibility {
  if (!job.isPaid) {
    return { eligible: false, reason: "Job payment not completed", availableModes: [] };
  }

  if (hasDispute) {
    return { eligible: false, reason: "Payout locked due to dispute", availableModes: [] };
  }

  if (!proofSubmitted && job.proofRequired) {
    return { eligible: false, reason: "Required proof not submitted", availableModes: [] };
  }

  const status = (job as any).status;
  const payoutStatuses = ["confirmed", "payout_eligible", "paid_out"];
  if (!payoutStatuses.includes(status) && status !== "completed") {
    return { eligible: false, reason: "Job not yet completed", availableModes: [] };
  }

  const trustInfo = getTrustInfo(worker, config);
  const modes: ("standard" | "early" | "instant")[] = ["standard"];

  if (trustInfo.canEarlyCashout) modes.push("early");
  if (trustInfo.canInstantCashout) modes.push("instant");

  return { eligible: true, availableModes: modes };
}

export async function loadFeeConfig(
  getSetting: (key: string) => Promise<string | null>
): Promise<PlatformFeeConfig> {
  const config = { ...DEFAULT_FEE_CONFIG };

  const mappings: [keyof PlatformFeeConfig, string, "number" | "boolean"][] = [
    ["platformFeeRate", "platform_fee_rate", "number"],
    ["posterProcessingFeeRate", "poster_processing_fee_rate", "number"],
    ["posterServiceFeeRate", "poster_service_fee_rate", "number"],
    ["earlyCashoutFeeRate", "early_cashout_fee_rate", "number"],
    ["instantCashoutFeeRate", "instant_cashout_fee_rate", "number"],
    ["reviewTimerHours", "review_timer_hours", "number"],
    ["autoConfirmEnabled", "auto_confirm_enabled", "boolean"],
    ["autoPayoutEnabled", "auto_payout_enabled", "boolean"],
    ["earlyCashoutEnabled", "early_cashout_enabled", "boolean"],
    ["instantCashoutEnabled", "instant_cashout_enabled", "boolean"],
  ];

  for (const [configKey, settingKey, type] of mappings) {
    const val = await getSetting(settingKey);
    if (val !== null) {
      if (type === "number") {
        (config as any)[configKey] = parseFloat(val);
      } else {
        (config as any)[configKey] = val === "true";
      }
    }
  }

  return config;
}
