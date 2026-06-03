// ─────────────────────────────────────────────────────────────────────────────
// GUBER Ambassador Reward — limited-time referral bounty
//
// Pays the referrer $5 (configurable) for every 100 (configurable) ID-VERIFIED
// signups attributed to their referral link during the campaign window.
//
// This is SEPARATE from Performance Shares (server/referral-reward.ts), which
// pays a % of GUBER's platform fee on a referred user's completed jobs. The two
// programs do not interact and can run at the same time.
//
// Design — reuses existing rails, no schema changes:
//   • Qualifying join = a user with referred_by = <referrer> AND id_verified =
//     true AND created_at inside the campaign window.
//   • Milestones earned = floor(qualifyingJoins / joinsPerMilestone).
//   • Milestones already paid = count of the referrer's wallet transactions of
//     type 'ambassador_reward'. This is the idempotency source of truth, so
//     re-running the award path never double-pays a milestone.
//   • Reward is credited to the wallet as a normal, withdrawable earning
//     (status 'completed'), matching the Performance Shares pattern.
//
// Campaign config lives in platform_settings under key 'ambassador_campaign'.
// On first read it self-seeds: active, 30-day window from now, $5 / 100 joins.
// Admins can edit the JSON value to change dates, amounts, or kill the campaign.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "./db";
import { platformSettings, walletTransactions, moneyLedger } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { storage } from "./storage";

export const AMBASSADOR_CAMPAIGN_KEY = "ambassador_campaign";
// Arbitrary, stable classifier for this feature's per-referrer advisory locks.
const ADVISORY_LOCK_CLASS = 48270;

export type AmbassadorCampaign = {
  active: boolean;
  startsAt: Date;
  endsAt: Date;
  rewardPerMilestone: number;
  joinsPerMilestone: number;
};

const DEFAULT_REWARD = 5;
const DEFAULT_JOINS = 100;
const DEFAULT_DURATION_DAYS = 30;

function defaultCampaign(): AmbassadorCampaign {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + DEFAULT_DURATION_DAYS * 24 * 60 * 60 * 1000);
  return {
    active: true,
    startsAt,
    endsAt,
    rewardPerMilestone: DEFAULT_REWARD,
    joinsPerMilestone: DEFAULT_JOINS,
  };
}

function serialize(c: AmbassadorCampaign): string {
  return JSON.stringify({
    active: c.active,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    rewardPerMilestone: c.rewardPerMilestone,
    joinsPerMilestone: c.joinsPerMilestone,
  });
}

function parse(value: string): AmbassadorCampaign {
  const raw = JSON.parse(value);
  const fallback = defaultCampaign();
  const startsAt = raw.startsAt ? new Date(raw.startsAt) : fallback.startsAt;
  const endsAt = raw.endsAt ? new Date(raw.endsAt) : fallback.endsAt;
  return {
    active: raw.active !== false,
    startsAt: isNaN(startsAt.getTime()) ? fallback.startsAt : startsAt,
    endsAt: isNaN(endsAt.getTime()) ? fallback.endsAt : endsAt,
    rewardPerMilestone: Number(raw.rewardPerMilestone) > 0 ? Number(raw.rewardPerMilestone) : DEFAULT_REWARD,
    joinsPerMilestone: Number(raw.joinsPerMilestone) > 0 ? Math.floor(Number(raw.joinsPerMilestone)) : DEFAULT_JOINS,
  };
}

/**
 * Read the campaign config, self-seeding a default 30-day campaign on first use.
 */
export async function getAmbassadorCampaign(): Promise<AmbassadorCampaign> {
  try {
    const rows = await db.select().from(platformSettings).where(eq(platformSettings.key, AMBASSADOR_CAMPAIGN_KEY)).limit(1);
    if (rows.length > 0) return parse(rows[0].value);
  } catch (e: any) {
    console.error("[ambassador] getAmbassadorCampaign read error:", e.message);
    return defaultCampaign();
  }
  const seeded = defaultCampaign();
  try {
    await db
      .insert(platformSettings)
      .values({
        key: AMBASSADOR_CAMPAIGN_KEY,
        value: serialize(seeded),
        category: "growth",
        description: "Limited-time ambassador bounty: $X per N ID-verified referral signups.",
      })
      .onConflictDoNothing({ target: platformSettings.key });
  } catch (e: any) {
    console.error("[ambassador] seed default campaign failed:", e.message);
  }
  return seeded;
}

/** Count ID-verified referred signups for a referrer within the campaign window. */
async function countQualifyingJoins(referrerId: number, c: AmbassadorCampaign): Promise<number> {
  const row = await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM users
    WHERE referred_by = ${referrerId}
      AND id_verified = true
      AND created_at >= ${c.startsAt.toISOString()}
      AND created_at <= ${c.endsAt.toISOString()}
  `);
  return Number((row.rows[0] as any)?.n || 0);
}

/** Count milestones already paid (one wallet txn per $reward milestone). */
async function countMilestonesPaid(referrerId: number): Promise<number> {
  const row = await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM wallet_transactions
    WHERE user_id = ${referrerId} AND type = 'ambassador_reward'
  `);
  return Number((row.rows[0] as any)?.n || 0);
}

export type AmbassadorStatus = {
  active: boolean;
  endsAt: string;
  daysRemaining: number;
  rewardPerMilestone: number;
  joinsPerMilestone: number;
  qualifyingJoins: number;
  milestonesEarned: number;
  milestonesPaid: number;
  totalEarned: number;
  joinsTowardNext: number;
  joinsToNextReward: number;
};

/** Build the at-a-glance status surfaced to the ambassador in the UI. */
export async function getAmbassadorStatusForUser(userId: number): Promise<AmbassadorStatus> {
  const c = await getAmbassadorCampaign();
  const qualifyingJoins = await countQualifyingJoins(userId, c);
  const milestonesPaid = await countMilestonesPaid(userId);
  const milestonesEarned = Math.floor(qualifyingJoins / c.joinsPerMilestone);
  const windowOpen = c.active && Date.now() <= c.endsAt.getTime();
  const daysRemaining = Math.max(0, Math.ceil((c.endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const joinsTowardNext = qualifyingJoins % c.joinsPerMilestone;
  return {
    active: windowOpen,
    endsAt: c.endsAt.toISOString(),
    daysRemaining,
    rewardPerMilestone: c.rewardPerMilestone,
    joinsPerMilestone: c.joinsPerMilestone,
    qualifyingJoins,
    milestonesEarned,
    milestonesPaid,
    totalEarned: round2(milestonesPaid * c.rewardPerMilestone),
    joinsTowardNext,
    joinsToNextReward: c.joinsPerMilestone - joinsTowardNext,
  };
}

/**
 * Credit any newly-completed milestones to the referrer's wallet. Idempotent:
 * compares milestones earned (by qualifying-join count) against milestones
 * already paid (by wallet-txn count) and pays only the difference.
 */
export async function awardAmbassadorRewardForReferrer(referrerId: number): Promise<{ awarded: number; amount: number }> {
  try {
    const c = await getAmbassadorCampaign();
    // Admin kill-switch: stop paying out new milestones when disabled.
    if (!c.active) return { awarded: 0, amount: 0 };

    const referrer = await storage.getUser(referrerId);
    if (!referrer) return { awarded: 0, amount: 0 };
    if ((referrer as any).deletedAt || (referrer as any).banned) return { awarded: 0, amount: 0 };

    // Concurrency guard: serialize all award attempts for the SAME referrer with
    // a transaction-scoped Postgres advisory lock. A second caller blocks until
    // the first transaction commits (and its awaited wallet inserts are durably
    // visible), so the recount inside the lock can never re-pay a milestone.
    // Different referrers use different lock keys and run fully in parallel.
    const milestonesToPay: number[] = [];
    let qualifyingJoins = 0;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_CLASS}, ${referrerId})`);

      qualifyingJoins = await countQualifyingJoins(referrerId, c);
      const milestonesEarned = Math.floor(qualifyingJoins / c.joinsPerMilestone);
      const milestonesPaid = await countMilestonesPaid(referrerId);
      if (milestonesEarned <= milestonesPaid) return;

      for (let m = milestonesPaid + 1; m <= milestonesEarned; m++) {
        const reward = round2(c.rewardPerMilestone);
        // Insert through the transaction client so the row is committed (and
        // counted by any waiting caller) atomically with lock release.
        await tx.insert(walletTransactions).values({
          userId: referrerId,
          type: "ambassador_reward",
          amount: reward,
          status: "completed",
          description: `Ambassador bounty — ${m * c.joinsPerMilestone} ID-verified referral signups ($${reward.toFixed(2)} per ${c.joinsPerMilestone})`,
        });
        try {
          await tx.insert(moneyLedger).values({
            userIdOwner: referrerId,
            ledgerType: "ambassador_reward",
            amount: reward,
            sourceSystem: "internal",
            sourceReferenceId: `ambassador-${referrerId}-milestone-${m}`,
            description: `Ambassador bounty milestone #${m} (${m * c.joinsPerMilestone} verified signups)`,
          });
        } catch (ledgerErr: any) {
          console.error("[ambassador] ledger entry failed:", ledgerErr.message);
        }
        milestonesToPay.push(m);
      }
    });

    if (milestonesToPay.length === 0) return { awarded: 0, amount: 0 };

    // Notify outside the lock — non-financial, must not extend the critical section.
    const amount = round2(milestonesToPay.length * c.rewardPerMilestone);
    for (const m of milestonesToPay) {
      try {
        await storage.createNotification({
          userId: referrerId,
          title: "Ambassador bounty earned! 🎉",
          body: `You hit ${m * c.joinsPerMilestone} ID-verified signups from your referral link and earned $${round2(c.rewardPerMilestone).toFixed(2)}. It's in your wallet, ready to withdraw.`,
          type: "system",
        });
      } catch (notifyErr: any) {
        console.error("[ambassador] notify failed:", notifyErr.message);
      }
    }

    console.log(`[ambassador] referrer=${referrerId} qualifyingJoins=${qualifyingJoins} paid ${milestonesToPay.length} milestone(s) totaling $${amount.toFixed(2)}`);
    return { awarded: milestonesToPay.length, amount };
  } catch (err: any) {
    // Never throw — must not break the verification-approval flow.
    console.error("[ambassador] awardAmbassadorRewardForReferrer error:", err.message);
    return { awarded: 0, amount: 0 };
  }
}

/**
 * Trigger entry point: call when a referred user becomes ID-verified. Resolves
 * the referrer and credits any newly-completed milestone(s).
 */
export async function maybeAwardAmbassadorForReferredUser(referredUserId: number): Promise<void> {
  try {
    const u = await storage.getUser(referredUserId);
    if (!u) return;
    if (!(u as any).idVerified) return;
    const referrerId = (u as any).referredBy as number | null;
    if (!referrerId || referrerId === referredUserId) return;
    await awardAmbassadorRewardForReferrer(referrerId);
  } catch (err: any) {
    console.error("[ambassador] maybeAwardAmbassadorForReferredUser error:", err.message);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
