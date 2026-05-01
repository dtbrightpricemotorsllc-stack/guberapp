// ─────────────────────────────────────────────────────────────────────────────
// GUBER Performance Shares — referral reward calculator
//
// Awards a cash reward to the referrer when a referred user completes a paid
// job, equal to a percentage of GUBER's platform fee:
//   • Day-1 OG referrer  → 10% of platform fee
//   • Standard referrer  →  5% of platform fee
//
// Eligibility window is 30 days from the referred user's signup. The window
// is enforced against the referred user's `performanceShareWindowEndsAt`,
// which is set at signup attribution time (see signup flow in
// server/routes.ts upsertGoogleUser + server/auth.ts handleSignup).
//
// "Referred user" = poster first, then worker (so we never double-pay on a
// single job). The reward is computed from the actual platform fee captured
// on the job (`jobs.platformFee`, falling back to `capturedAmount * platformFeeRate`).
//
// This function is idempotent: it skips any job whose `referralRewardStatus`
// is already set, so re-running capture flows is safe.
//
// IMPORTANT (per spec):
// - Direct referrals only — no MLM.
// - No reward on cancelled / refunded / disputed / failed jobs.
// - No reward for signups alone.
// - Do NOT call this "equity", "ownership", "profit share", or "investment".
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "./db";
import { jobs } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { storage } from "./storage";

const DAY1_OG_RATE = 0.10;
const STANDARD_RATE = 0.05;

type ReferralRewardOutcome =
  | { status: "skipped"; reason: string }
  | { status: "awarded"; referrerId: number; amount: number; type: "day1_og" | "standard" };

export async function awardReferralRewardForJob(
  jobId: number,
  capturedAmount?: number,
): Promise<ReferralRewardOutcome> {
  try {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!job) return { status: "skipped", reason: "job_not_found" };

    // Idempotent guard
    if ((job as any).referralRewardStatus) {
      return { status: "skipped", reason: "already_processed" };
    }

    // Only completed-paid jobs are eligible. Cancellation/refund/dispute states
    // are explicitly excluded.
    if ((job as any).status !== "completed_paid") {
      return { status: "skipped", reason: `job_status:${(job as any).status}` };
    }
    if ((job as any).refundedAt) {
      return { status: "skipped", reason: "refunded" };
    }

    // Pick the referred user — poster first, then worker. At most one reward
    // per job to avoid double-paying on jobs where both sides were referred.
    const posterId = (job as any).postedById as number | null;
    const workerId = (job as any).assignedHelperId as number | null;
    const candidateIds = [posterId, workerId].filter((id): id is number => !!id);

    let referredUser: any | null = null;
    let referrer: any | null = null;
    for (const uid of candidateIds) {
      const u = await storage.getUser(uid);
      if (!u) continue;
      const refBy = (u as any).referredBy as number | null;
      if (!refBy) continue;
      if (!(u as any).performanceShareEligible) continue;
      const windowEnd = (u as any).performanceShareWindowEndsAt as Date | null;
      if (!windowEnd) continue;
      // Anchor the window check to the moment the job was posted, not "now",
      // so a slow-completing job that was posted INSIDE the window still
      // qualifies (matches "completed and paid jobs from referred users for
      // 30 days" in the spec).
      const anchor = (job as any).createdAt
        ? new Date((job as any).createdAt as Date)
        : new Date();
      if (anchor.getTime() > new Date(windowEnd).getTime()) continue;

      const r = await storage.getUser(refBy);
      if (!r) continue;
      // Referrer must still be active (not soft-deleted, not banned)
      if ((r as any).deletedAt) continue;
      if ((r as any).banned) continue;
      // Self-referral guard (defence in depth — also blocked at signup)
      if (r.id === u.id) continue;

      referredUser = u;
      referrer = r;
      break;
    }

    if (!referredUser || !referrer) {
      return { status: "skipped", reason: "no_eligible_referrer" };
    }

    // Compute platform fee. Prefer the canonical column already populated at
    // pricing time; fall back to (captured * rate) when missing.
    let platformFeeAmount = (job as any).platformFee as number | null;
    if (!platformFeeAmount || platformFeeAmount <= 0) {
      const rate = ((job as any).platformFeeRate as number | null) || 0.20;
      const base = capturedAmount ?? (job as any).finalPrice ?? 0;
      platformFeeAmount = round2(base * rate);
    }
    if (!platformFeeAmount || platformFeeAmount <= 0) {
      return { status: "skipped", reason: "no_platform_fee" };
    }

    const isDay1OG = !!(referrer as any).day1OG;
    const rate = isDay1OG ? DAY1_OG_RATE : STANDARD_RATE;
    const rewardAmount = round2(platformFeeAmount * rate);
    if (rewardAmount <= 0) {
      return { status: "skipped", reason: "reward_zero" };
    }

    // ATOMIC reward claim — only one concurrent caller can win the row.
    // We require referral_reward_status IS NULL in the WHERE clause so a
    // second caller racing with the first sees rowCount=0 and bails before
    // crediting the wallet. This is the canonical source of truth for audit.
    const claimRes: any = await db.execute(sql`
      UPDATE jobs
      SET referral_reward_user_id = ${referrer.id},
          referral_reward_amount = ${rewardAmount},
          referral_reward_status = 'earned',
          referral_reward_type = ${isDay1OG ? "day1_og" : "standard"}
      WHERE id = ${jobId} AND referral_reward_status IS NULL
    `);
    const claimedRows = (claimRes?.rowCount ?? claimRes?.rows?.length ?? 0) as number;
    if (claimedRows === 0) {
      return { status: "skipped", reason: "race_already_processed" };
    }

    // Credit the referrer's wallet (immediately spendable / withdrawable like
    // any other earning).
    await storage.createWalletTransaction({
      userId: referrer.id,
      jobId: jobId,
      type: "referral_reward",
      amount: rewardAmount,
      status: "completed",
      description: `Performance Shares — ${Math.round(rate * 100)}% of GUBER's platform fee on job #${jobId} (referred ${shortName(referredUser)})`,
    });

    // Money-ledger entry for accounting reconciliation.
    try {
      await storage.createMoneyLedgerEntry({
        jobId,
        userIdOwner: referrer.id,
        userIdCounterparty: referredUser.id,
        ledgerType: "referral_reward",
        amount: rewardAmount,
        sourceSystem: "internal",
        sourceReferenceId: `job-${jobId}-referral`,
        description: `Performance Shares reward (${isDay1OG ? "Day-1 OG 10%" : "standard 5%"}) on job #${jobId}`,
      });
    } catch (ledgerErr: any) {
      console.error("[performance-shares] ledger entry failed:", ledgerErr.message);
    }

    // Notify the referrer.
    try {
      await storage.createNotification({
        userId: referrer.id,
        title: "Performance Shares earned!",
        body: `You earned $${rewardAmount.toFixed(2)} from a referral's completed job. (${isDay1OG ? "10% Day-1 OG rate" : "5% standard rate"} on GUBER's platform fee.)`,
        type: "system",
      });
    } catch (notifyErr: any) {
      console.error("[performance-shares] notify failed:", notifyErr.message);
    }

    console.log(
      `[performance-shares] job=${jobId} referrer=${referrer.id} ` +
        `referred=${referredUser.id} platformFee=$${platformFeeAmount.toFixed(2)} ` +
        `rate=${rate} reward=$${rewardAmount.toFixed(2)} (${isDay1OG ? "day1_og" : "standard"})`,
    );

    return {
      status: "awarded",
      referrerId: referrer.id,
      amount: rewardAmount,
      type: isDay1OG ? "day1_og" : "standard",
    };
  } catch (err: any) {
    // Never throw — referral reward must never break payment capture.
    console.error("[performance-shares] awardReferralRewardForJob error:", err.message);
    return { status: "skipped", reason: "exception" };
  }
}

/**
 * Void a previously-earned referral reward (for refund / dispute reversal).
 * Marks the row voided and logs a reversing wallet transaction so the
 * referrer's available balance is correct.
 */
export async function voidReferralRewardForJob(jobId: number, reason: string): Promise<void> {
  try {
    // ATOMIC void — only one concurrent caller can flip the row from
    // earned/paid → voided, preventing double reversal under races.
    const voidRes: any = await db.execute(sql`
      UPDATE jobs SET referral_reward_status = 'voided'
      WHERE id = ${jobId}
        AND referral_reward_status IN ('earned','paid')
      RETURNING referral_reward_user_id, referral_reward_amount
    `);
    const row = (voidRes?.rows ?? [])[0] as any;
    if (!row) return;
    const referrerId = row.referral_reward_user_id as number | null;
    const amount = row.referral_reward_amount as number | null;
    if (!referrerId || !amount) return;

    await storage.createWalletTransaction({
      userId: referrerId,
      jobId,
      type: "referral_reward_reversal",
      amount: -amount,
      status: "completed",
      description: `Performance Shares reversed for job #${jobId}: ${reason}`,
    });

    try {
      await storage.createMoneyLedgerEntry({
        jobId,
        userIdOwner: referrerId,
        ledgerType: "referral_reward_reversal",
        amount: -amount,
        sourceSystem: "internal",
        sourceReferenceId: `job-${jobId}-referral-void`,
        description: `Performance Shares reversal: ${reason}`,
      });
    } catch (ledgerErr: any) {
      console.error("[performance-shares] reversal ledger failed:", ledgerErr.message);
    }

    console.log(`[performance-shares] reversed job=${jobId} referrer=${referrerId} amount=$${amount.toFixed(2)} reason=${reason}`);
  } catch (err: any) {
    console.error("[performance-shares] voidReferralRewardForJob error:", err.message);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function shortName(u: any): string {
  if (!u) return "user";
  return (u.publicUsername as string) || (u.username as string) || `user #${u.id}`;
}
