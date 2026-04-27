// Phase 5 — Smart notification reminder helpers.
//
// Owns dedupe + quiet-hours guard for the cron-driven reminder layer.
// Each reminder fires at most once per (job|cashDrop, type[, user]) thanks
// to the reminders_sent table. Quiet hours (10pm–7am local) are respected
// for non-at-risk reminders only — at-risk pushes always go through.

import { db, pool } from "./db";
import { remindersSent, type User } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";

export type ReminderType =
  | "pre_arrival"
  | "missing_otw"
  | "at_risk_poster"
  | "at_risk_worker"
  | "payout_release"
  | "drop_expiring"
  // Task #317 — Dispute & Payout Protection.
  | "auto_confirm_midpoint"
  | "helper_response_buffer";

export interface ReminderKey {
  jobId?: number | null;
  cashDropId?: number | null;
  userId?: number | null;
  type: ReminderType;
}

/** True if a reminder of this kind has already been recorded. */
export async function wasReminderSent(key: ReminderKey): Promise<boolean> {
  const conds = [eq(remindersSent.reminderType, key.type)];
  conds.push(key.jobId != null ? eq(remindersSent.jobId, key.jobId) : isNull(remindersSent.jobId));
  conds.push(key.cashDropId != null ? eq(remindersSent.cashDropId, key.cashDropId) : isNull(remindersSent.cashDropId));
  conds.push(key.userId != null ? eq(remindersSent.userId, key.userId) : isNull(remindersSent.userId));

  const rows = await db.select({ id: remindersSent.id }).from(remindersSent).where(and(...conds)).limit(1);
  return rows.length > 0;
}

/** Record that a reminder was sent so future cron sweeps skip it. */
export async function markReminderSent(key: ReminderKey): Promise<void> {
  await db.insert(remindersSent).values({
    jobId: key.jobId ?? null,
    cashDropId: key.cashDropId ?? null,
    userId: key.userId ?? null,
    reminderType: key.type,
  });
}

/**
 * Atomically claim a reminder slot. Returns true if the caller "won" the
 * race and should send the push, false if another process already sent it.
 * Backed by partial unique indexes on reminders_sent so the DB enforces
 * single-write even under overlapping cron runs.
 */
export async function claimReminder(key: ReminderKey): Promise<boolean> {
  // The conflict predicate must EXACTLY match the partial unique index
  // predicates in scripts/post-merge.sh, otherwise Postgres throws
  // "no unique or exclusion constraint matching the ON CONFLICT spec".
  const conflictTarget = key.cashDropId != null
    ? "(cash_drop_id, user_id, reminder_type) WHERE cash_drop_id IS NOT NULL AND user_id IS NOT NULL"
    : "(job_id, reminder_type) WHERE job_id IS NOT NULL";

  const result = await pool.query(
    `INSERT INTO reminders_sent (job_id, cash_drop_id, user_id, reminder_type)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ${conflictTarget} DO NOTHING
     RETURNING id`,
    [key.jobId ?? null, key.cashDropId ?? null, key.userId ?? null, key.type],
  );
  return (result.rowCount ?? 0) > 0;
}

// ── Quiet hours (10pm–7am local) ──────────────────────────────────────────
// We don't store a tz on users; derive a coarse US tz from zip prefix and
// fall back to America/New_York. This covers >95% of real users. The
// quiet-hours window is intentionally generous so a noisy 2-min cron
// can't wake somebody up.

function tzFromZip(zip?: string | null): string {
  if (!zip || zip.length < 1) return "America/New_York";
  const c = zip[0];
  // Eastern: 0–3 (Northeast, FL, Carolinas, GA, OH east half).
  if (c === "0" || c === "1" || c === "2" || c === "3") return "America/New_York";
  // Central: 4 (KY/IN/MI), 5 (IA/MN/WI), 6 (IL/MO/KS/NE), 7 (TX/LA/OK/AR).
  if (c === "4" || c === "5" || c === "6" || c === "7") return "America/Chicago";
  // Mountain: 8 (CO/UT/NM/AZ/MT/WY/ID).
  if (c === "8") return "America/Denver";
  // Pacific: 9 (CA/OR/WA/NV/AK/HI). Good enough — AK/HI users get Pacific.
  if (c === "9") return "America/Los_Angeles";
  return "America/New_York";
}

/**
 * True if it's currently between 22:00 and 06:59 in the user's local tz.
 * Use for non-at-risk reminders only — at-risk pushes ignore this guard.
 */
export function isUserInQuietHours(user: Pick<User, "zipcode"> | null | undefined, now: Date = new Date()): boolean {
  const tz = tzFromZip(user?.zipcode ?? null);
  // Intl.DateTimeFormat with hour12:false returns "24" at midnight in some
  // engines — normalize to 0 for safety.
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).format(now);
  let hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour)) return false;
  if (hour === 24) hour = 0;
  return hour >= 22 || hour < 7;
}

// ── Snooze support ────────────────────────────────────────────────────────
// Workers can tap "Snooze 5m" on the missing-on-the-way push to push the
// nudge out by 5 minutes. The cron sweep is dedup-gated by reminders_sent,
// so a real snooze must (a) drop the dedupe row and (b) schedule a fresh
// in-process timer that re-delivers the push if the worker still hasn't
// tapped "On the way".

/** In-process scheduler used by snooze actions. Cleared on restart — that's
 *  acceptable because snooze is a best-effort UX nicety, not a guarantee. */
const snoozeTimers = new Map<string, NodeJS.Timeout>();

function snoozeKey(key: ReminderKey): string {
  return `${key.type}|${key.jobId ?? ""}|${key.cashDropId ?? ""}|${key.userId ?? ""}`;
}

/** Drop the dedupe row for a reminder so the cron loop can re-evaluate it. */
export async function clearReminder(key: ReminderKey): Promise<void> {
  const conds = [eq(remindersSent.reminderType, key.type)];
  conds.push(key.jobId != null ? eq(remindersSent.jobId, key.jobId) : isNull(remindersSent.jobId));
  conds.push(key.cashDropId != null ? eq(remindersSent.cashDropId, key.cashDropId) : isNull(remindersSent.cashDropId));
  conds.push(key.userId != null ? eq(remindersSent.userId, key.userId) : isNull(remindersSent.userId));
  await db.delete(remindersSent).where(and(...conds));
}

/**
 * Schedule a one-shot follow-up for a reminder. If the same key is snoozed
 * again before `minutes` elapse, the previous timer is cancelled and replaced
 * (so rapid double-taps don't fire two pushes back-to-back).
 *
 * The fire callback is responsible for re-checking world state (the worker
 * may have tapped "On the way" between snooze and follow-up) and for
 * delivering the push itself.
 */
export function scheduleSnooze(
  key: ReminderKey,
  minutes: number,
  fire: () => Promise<void>,
): void {
  const k = snoozeKey(key);
  const existing = snoozeTimers.get(k);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    snoozeTimers.delete(k);
    try {
      await fire();
    } catch {
      // Snooze is best-effort — swallow errors so they don't crash the host.
    }
  }, Math.max(0, minutes) * 60_000);

  // Don't keep the event loop alive just for a snooze timer.
  if (typeof timer.unref === "function") timer.unref();

  snoozeTimers.set(k, timer);
}

/** Cancel a pending snooze timer (used by tests; harmless if none exists). */
export function cancelSnooze(key: ReminderKey): void {
  const k = snoozeKey(key);
  const existing = snoozeTimers.get(k);
  if (existing) {
    clearTimeout(existing);
    snoozeTimers.delete(k);
  }
}

/** Test-only: number of currently pending snooze timers. */
export function pendingSnoozeCount(): number {
  return snoozeTimers.size;
}
