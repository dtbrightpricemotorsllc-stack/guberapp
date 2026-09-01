import { beforeEach, describe, expect, it, vi } from "vitest";

const scheduledJobs = vi.hoisted(() => [] as Array<{ expression: string; callback: () => Promise<void> }>);
const schedule = vi.hoisted(() => vi.fn(function scheduleMock(
  expression: string,
  callback: () => Promise<void>,
) {
  scheduledJobs.push({ expression, callback });
  return {} as any;
}));
const retrySignupPromotionAllocations = vi.hoisted(() => vi.fn());

vi.mock("node-cron", () => ({ default: { schedule } }));
vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../notify-helpers", () => ({
  notifyNearbyAvailableWorkers: vi.fn(),
  notifyCashDropExpired: vi.fn(),
  notifyHandsfreeAutoCleared: vi.fn(),
}));
vi.mock("../push", () => ({ sendPushToUser: vi.fn() }));
vi.mock("../reminders", () => ({ claimReminder: vi.fn(), isUserInQuietHours: vi.fn() }));
vi.mock("../pricing", () => ({ TRUST_ADJUSTMENTS: {} }));
vi.mock("../demo-guard", () => ({
  getDemoUserIds: vi.fn(),
  isDemoUser: vi.fn(),
  viewerCanSeeJobSync: vi.fn(),
}));
vi.mock("../referral-reward", () => ({
  awardReferralRewardForJob: vi.fn(),
  voidReferralRewardForJob: vi.fn(),
}));
vi.mock("../payout-guard", () => ({ evaluatePayoutMultiFactor: vi.fn() }));
vi.mock("../job-payment-settlement", () => ({ settleStandardDestinationCharge: vi.fn() }));
vi.mock("../signup-promotion", () => ({ retrySignupPromotionAllocations }));
vi.mock("stripe", () => ({
  default: vi.fn(function StripeMock() {
    return {};
  }),
}));

import { startCron } from "../cron";

describe("signup promotion retry cron wiring", () => {
  beforeEach(() => {
    scheduledJobs.length = 0;
    schedule.mockClear();
    retrySignupPromotionAllocations.mockReset();
    delete process.env.DISABLE_BACKGROUND_JOBS;
  });

  it("runs the retry worker from the five-minute scheduled sweep", async () => {
    startCron();

    const fiveMinuteJob = scheduledJobs.find((job) => job.expression === "*/5 * * * *");
    expect(fiveMinuteJob).toBeDefined();

    retrySignupPromotionAllocations.mockRejectedValueOnce(new Error("test retry failure"));
    await fiveMinuteJob!.callback();

    expect(retrySignupPromotionAllocations).toHaveBeenCalledOnce();
  });
});