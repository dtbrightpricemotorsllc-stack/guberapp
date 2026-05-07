// task-484: auto-clear logic for the hands-free fraud "under_review"
// auto-flag introduced by task-482. Two reinforcing paths share the same
// gating rules so they can't disagree:
//
//   1. Streak path (called from POST /api/proof/wearable-upload after a
//      successful upload). Anchor = max(latest block, latest auto-flag).
//      HANDSFREE_AUTO_CLEAR_STREAK clean uploads after that anchor clears
//      the flag. A fresh block moves the anchor and resets the streak so
//      the worker has to genuinely prove themselves again.
//
//   2. Time path (called from cron). Sweeps every user whose latest
//      adverse event is older than HANDSFREE_AUTO_CLEAR_DAYS ("90 days
//      with no new blocks"). Old historical blocks don't strand workers.
//
// Both paths require an `handsfree_auto_flag_for_review` audit entry to
// exist for the user — admin-set under_review flags have no audit anchor
// and are deliberately left alone. Both paths are best-effort: failures
// must never bubble up to the caller (route response / cron loop).

import { and, eq, gt, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { auditLogs, users } from "@shared/schema";
import { db as defaultDb } from "./db";
import { notifyHandsfreeAutoCleared } from "./notify-helpers";

export const HANDSFREE_AUTO_CLEAR_STREAK = 10;
export const HANDSFREE_AUTO_CLEAR_DAYS = 90;

type DB = typeof defaultDb;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Run the streak check for one user. Idempotent and safe to call after
 * every successful hands-free upload — does nothing unless the user is
 * currently under_review AND was auto-flagged AND has accumulated
 * HANDSFREE_AUTO_CLEAR_STREAK clean uploads since the latest adverse
 * event. Returns true if the flag was just cleared.
 */
export async function tryAutoClearStreak(
  userId: number,
  database: DB = defaultDb,
): Promise<boolean> {
  try {
    const [selfRow] = await database
      .select({ underReview: users.underReview })
      .from(users)
      .where(eq(users.id, userId));
    if (!selfRow?.underReview) return false;

    const [anchorRow] = await database
      .select({
        lastFlag: sql<Date | null>`max(case when ${auditLogs.action} = 'handsfree_auto_flag_for_review' then ${auditLogs.createdAt} end)`,
        lastAdverse: sql<Date | null>`max(case when ${auditLogs.action} in ('handsfree_proof_blocked','handsfree_auto_flag_for_review') then ${auditLogs.createdAt} end)`,
      })
      .from(auditLogs)
      .where(eq(auditLogs.userId, userId));

    const lastFlagRaw = anchorRow?.lastFlag ?? null;
    const lastAdverseRaw = anchorRow?.lastAdverse ?? null;
    if (!lastFlagRaw || !lastAdverseRaw) return false;
    const lastFlag = lastFlagRaw instanceof Date ? lastFlagRaw : new Date(lastFlagRaw);
    const lastAdverse = lastAdverseRaw instanceof Date ? lastAdverseRaw : new Date(lastAdverseRaw);

    const cleanRows = await database
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(and(
        eq(auditLogs.userId, userId),
        eq(auditLogs.action, "handsfree_proof_uploaded"),
        gt(auditLogs.createdAt, lastAdverse),
      ));
    if (cleanRows.length < HANDSFREE_AUTO_CLEAR_STREAK) return false;

    // Atomic clear+audit: if either side fails, the transaction rolls back so
    // we never have a cleared user without the explanatory audit record.
    const ok = await database.transaction(async (tx) => {
      const [updated] = await tx
        .update(users)
        .set({ underReview: false, handsfreeBlockedAttempts: 0, handsfreeBlockedLastAt: null })
        .where(and(eq(users.id, userId), eq(users.underReview, true)))
        .returning({ id: users.id });
      if (!updated) return false;
      await tx.insert(auditLogs).values({
        userId,
        action: "handsfree_auto_flag_cleared",
        details: JSON.stringify({
          reason: "clean_streak",
          cleanUploads: cleanRows.length,
          threshold: HANDSFREE_AUTO_CLEAR_STREAK,
          flaggedAt: toIso(lastFlag),
          streakAnchorAt: toIso(lastAdverse),
        }),
      });
      return true;
    });
    if (ok) await notifyHandsfreeAutoCleared(userId, "clean_streak");
    return ok;
  } catch (err) {
    console.error("[handsfree-auto-clear] streak check failed:", err);
    return false;
  }
}

/**
 * Sweep all users whose latest adverse event is older than the configured
 * window. Returns count cleared. Per-user errors are swallowed so one
 * bad row doesn't stop the rest of the sweep.
 */
export async function clearStaleHandsfreeReviewSweep(
  database: DB = defaultDb,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - HANDSFREE_AUTO_CLEAR_DAYS * 24 * 60 * 60_000);
  const adverseSub = database
    .select({
      userId: auditLogs.userId,
      lastFlagAt: sql<Date | null>`max(case when ${auditLogs.action} = 'handsfree_auto_flag_for_review' then ${auditLogs.createdAt} end)`.as("last_flag_at"),
      lastAdverseAt: sql<Date | null>`max(case when ${auditLogs.action} in ('handsfree_proof_blocked','handsfree_auto_flag_for_review') then ${auditLogs.createdAt} end)`.as("last_adverse_at"),
    })
    .from(auditLogs)
    .where(inArray(auditLogs.action, ["handsfree_proof_blocked", "handsfree_auto_flag_for_review"]))
    .groupBy(auditLogs.userId)
    .as("hf_adverse");

  const candidates = await database
    .select({
      id: users.id,
      lastFlagAt: adverseSub.lastFlagAt,
      lastAdverseAt: adverseSub.lastAdverseAt,
    })
    .from(users)
    .innerJoin(adverseSub, eq(adverseSub.userId, users.id))
    .where(and(
      eq(users.underReview, true),
      isNotNull(adverseSub.lastFlagAt),
      lte(adverseSub.lastAdverseAt, cutoff),
    ));

  let cleared = 0;
  for (const c of candidates) {
    if (!c.lastFlagAt || !c.lastAdverseAt) continue;
    try {
      const ok = await database.transaction(async (tx) => {
        const [updated] = await tx
          .update(users)
          .set({ underReview: false, handsfreeBlockedAttempts: 0, handsfreeBlockedLastAt: null })
          .where(and(eq(users.id, c.id), eq(users.underReview, true)))
          .returning({ id: users.id });
        if (!updated) return false;
        await tx.insert(auditLogs).values({
          userId: c.id,
          action: "handsfree_auto_flag_cleared",
          details: JSON.stringify({
            reason: "stale_no_blocks",
            windowDays: HANDSFREE_AUTO_CLEAR_DAYS,
            flaggedAt: toIso(c.lastFlagAt!),
            lastAdverseAt: toIso(c.lastAdverseAt!),
          }),
        });
        return true;
      });
      if (ok) {
        cleared++;
        await notifyHandsfreeAutoCleared(c.id, "stale_no_blocks");
      }
    } catch (err) {
      console.error(`[handsfree-auto-clear] failed for user ${c.id}:`, err);
    }
  }
  return cleared;
}
