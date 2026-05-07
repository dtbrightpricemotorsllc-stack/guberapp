// task-484: integration tests for the hands-free under_review auto-clear
// helpers in server/handsfree-auto-clear.ts. These exercise the real DB
// (audit_logs + users tables) so the actual select / update SQL is on
// the hook — not just pseudo-logic. Each test seeds a unique throw-away
// user, runs the helper, asserts state changes, and tears the row down.

import { afterEach, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-1234567890";
process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
process.env.DISABLE_BACKGROUND_JOBS = "true";

import { db } from "../db";
import { auditLogs, users } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  HANDSFREE_AUTO_CLEAR_DAYS,
  HANDSFREE_AUTO_CLEAR_STREAK,
  clearStaleHandsfreeReviewSweep,
  tryAutoClearStreak,
} from "../handsfree-auto-clear";
import { __test__ as cronTest } from "../cron";

const created: number[] = [];

function uniqueSuffix(): string {
  return `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

async function makeUnderReviewUser(
  opts: {
    underReview?: boolean;
    handsfreeBlockedAttempts?: number;
    handsfreeBlockedLastAt?: Date | null;
    strikes30d?: number;
  } = {},
): Promise<number> {
  const tag = uniqueSuffix();
  const userValues: typeof users.$inferInsert = {
    email: `t484_${tag}@guber.test`,
    username: `t484_${tag}`,
    password: "x",
    fullName: "Task 484 Test User",
    underReview: opts.underReview ?? true,
    handsfreeBlockedAttempts: opts.handsfreeBlockedAttempts ?? 0,
    handsfreeBlockedLastAt: opts.handsfreeBlockedLastAt ?? null,
    strikes30d: opts.strikes30d ?? 0,
  };
  const [row] = await db.insert(users).values(userValues).returning({ id: users.id });
  created.push(row.id);
  return row.id;
}

async function seedAudit(userId: number, action: string, atOffsetMs: number) {
  const auditValues: typeof auditLogs.$inferInsert = {
    userId,
    action,
    details: JSON.stringify({ test: true }),
    createdAt: new Date(Date.now() + atOffsetMs),
  };
  await db.insert(auditLogs).values(auditValues);
}

afterEach(async () => {
  while (created.length > 0) {
    const id = created.pop()!;
    try {
      await db.delete(auditLogs).where(eq(auditLogs.userId, id));
      await db.delete(users).where(eq(users.id, id));
    } catch {}
  }
});

describe("handsfree-auto-clear (task-484) — streak path", () => {
  it("clears under_review after threshold clean uploads since latest auto-flag", async () => {
    const uid = await makeUnderReviewUser();
    // Auto-flag 7 days ago, then 10 clean uploads after.
    await seedAudit(uid, "handsfree_auto_flag_for_review", -7 * 86_400_000);
    for (let i = 0; i < HANDSFREE_AUTO_CLEAR_STREAK; i++) {
      await seedAudit(uid, "handsfree_proof_uploaded", -6 * 86_400_000 + i * 60_000);
    }

    const cleared = await tryAutoClearStreak(uid);
    expect(cleared).toBe(true);

    const [after] = await db.select({ ur: users.underReview }).from(users).where(eq(users.id, uid));
    expect(after.ur).toBe(false);

    const clearLogs = await db
      .select({ id: auditLogs.id, details: auditLogs.details })
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, uid), eq(auditLogs.action, "handsfree_auto_flag_cleared")));
    expect(clearLogs).toHaveLength(1);
    expect(clearLogs[0].details).toMatch(/clean_streak/);
  });

  it("a fresh block resets the streak (anchor advances past clean uploads)", async () => {
    const uid = await makeUnderReviewUser();
    // Auto-flag 30d ago, 9 clean uploads, then a NEW block, then only 5 clean.
    await seedAudit(uid, "handsfree_auto_flag_for_review", -30 * 86_400_000);
    for (let i = 0; i < 9; i++) {
      await seedAudit(uid, "handsfree_proof_uploaded", -25 * 86_400_000 + i * 60_000);
    }
    await seedAudit(uid, "handsfree_proof_blocked", -10 * 86_400_000);
    for (let i = 0; i < 5; i++) {
      await seedAudit(uid, "handsfree_proof_uploaded", -5 * 86_400_000 + i * 60_000);
    }

    const cleared = await tryAutoClearStreak(uid);
    expect(cleared).toBe(false);

    const [after] = await db.select({ ur: users.underReview }).from(users).where(eq(users.id, uid));
    expect(after.ur).toBe(true);
  });

  it("admin-set under_review (no auto-flag audit anchor) is left alone", async () => {
    const uid = await makeUnderReviewUser();
    // 20 clean uploads, no auto-flag entry → admin-set scenario.
    for (let i = 0; i < 20; i++) {
      await seedAudit(uid, "handsfree_proof_uploaded", -i * 60_000);
    }
    const cleared = await tryAutoClearStreak(uid);
    expect(cleared).toBe(false);
    const [after] = await db.select({ ur: users.underReview }).from(users).where(eq(users.id, uid));
    expect(after.ur).toBe(true);
  });

  it("does nothing when the user is not under_review", async () => {
    const uid = await makeUnderReviewUser({ underReview: false });
    await seedAudit(uid, "handsfree_auto_flag_for_review", -30 * 86_400_000);
    for (let i = 0; i < 20; i++) {
      await seedAudit(uid, "handsfree_proof_uploaded", -25 * 86_400_000 + i * 60_000);
    }
    const cleared = await tryAutoClearStreak(uid);
    expect(cleared).toBe(false);
    const clearLogs = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, uid), eq(auditLogs.action, "handsfree_auto_flag_cleared")));
    expect(clearLogs).toHaveLength(0);
  });
});

describe("handsfree-auto-clear (task-484) — time-based sweep", () => {
  it("clears users whose latest adverse event is older than the window", async () => {
    const uid = await makeUnderReviewUser();
    // Auto-flag well past the window, no later blocks.
    await seedAudit(uid, "handsfree_auto_flag_for_review", -(HANDSFREE_AUTO_CLEAR_DAYS + 5) * 86_400_000);

    const n = await clearStaleHandsfreeReviewSweep();
    expect(n).toBeGreaterThanOrEqual(1);

    const [after] = await db.select({ ur: users.underReview }).from(users).where(eq(users.id, uid));
    expect(after.ur).toBe(false);

    const clearLogs = await db
      .select({ details: auditLogs.details })
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, uid), eq(auditLogs.action, "handsfree_auto_flag_cleared")));
    expect(clearLogs.some(l => /stale_no_blocks/.test(l.details ?? ""))).toBe(true);
  });

  it("does NOT clear when a recent block exists, even if the auto-flag is ancient", async () => {
    const uid = await makeUnderReviewUser();
    // Old flag, but a block 10 days ago resets the window.
    await seedAudit(uid, "handsfree_auto_flag_for_review", -200 * 86_400_000);
    await seedAudit(uid, "handsfree_proof_blocked", -10 * 86_400_000);

    await clearStaleHandsfreeReviewSweep();
    const [after] = await db.select({ ur: users.underReview }).from(users).where(eq(users.id, uid));
    expect(after.ur).toBe(true);
  });

  it("clears once the latest block itself is past the window (old block is OK)", async () => {
    const uid = await makeUnderReviewUser();
    await seedAudit(uid, "handsfree_auto_flag_for_review", -200 * 86_400_000);
    // Block well before the window cutoff — counts as "old", should clear.
    await seedAudit(uid, "handsfree_proof_blocked", -(HANDSFREE_AUTO_CLEAR_DAYS + 30) * 86_400_000);

    await clearStaleHandsfreeReviewSweep();
    const [after] = await db.select({ ur: users.underReview }).from(users).where(eq(users.id, uid));
    expect(after.ur).toBe(false);
  });

  it("admin-set under_review (no auto-flag audit) is skipped", async () => {
    const uid = await makeUnderReviewUser();
    // No auto-flag audit, only old uploads. Admin-set scenario.
    for (let i = 0; i < 5; i++) {
      await seedAudit(uid, "handsfree_proof_uploaded", -(HANDSFREE_AUTO_CLEAR_DAYS + 30) * 86_400_000 + i * 60_000);
    }
    await clearStaleHandsfreeReviewSweep();
    const [after] = await db.select({ ur: users.underReview }).from(users).where(eq(users.id, uid));
    expect(after.ur).toBe(true);
  });
});

describe("decayHandsfreeBlockedAttempts (task-492) — auto-clear under_review on counter decay", () => {
  it("clears under_review for auto-flagged users when their counter ages out", async () => {
    const oldLast = new Date(Date.now() - 70 * 86_400_000);
    const uid = await makeUnderReviewUser({
      handsfreeBlockedAttempts: 5,
      handsfreeBlockedLastAt: oldLast,
    });
    await seedAudit(uid, "handsfree_auto_flag_for_review", -65 * 86_400_000);

    await cronTest.decayHandsfreeBlockedAttempts();

    const [after] = await db
      .select({
        ur: users.underReview,
        attempts: users.handsfreeBlockedAttempts,
        lastAt: users.handsfreeBlockedLastAt,
      })
      .from(users)
      .where(eq(users.id, uid));
    expect(after.ur).toBe(false);
    expect(after.attempts).toBe(0);
    expect(after.lastAt).toBeNull();

    const clearLogs = await db
      .select({ details: auditLogs.details })
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, uid), eq(auditLogs.action, "handsfree_auto_flag_cleared")));
    expect(clearLogs).toHaveLength(1);
    expect(clearLogs[0].details).toMatch(/counter_decayed/);
  });

  it("decays counter but leaves under_review alone for admin-set flags (no auto-flag audit)", async () => {
    const oldLast = new Date(Date.now() - 70 * 86_400_000);
    const uid = await makeUnderReviewUser({
      handsfreeBlockedAttempts: 2,
      handsfreeBlockedLastAt: oldLast,
    });
    // No handsfree_auto_flag_for_review audit row — represents an admin-set flag.

    await cronTest.decayHandsfreeBlockedAttempts();

    const [after] = await db
      .select({ ur: users.underReview, attempts: users.handsfreeBlockedAttempts })
      .from(users)
      .where(eq(users.id, uid));
    expect(after.attempts).toBe(0);
    expect(after.ur).toBe(true);

    const clearLogs = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, uid), eq(auditLogs.action, "handsfree_auto_flag_cleared")));
    expect(clearLogs).toHaveLength(0);
  });

  it("does NOT clear when the cancellation tripwire (strikes30d>=3) is also active", async () => {
    const oldLast = new Date(Date.now() - 70 * 86_400_000);
    const uid = await makeUnderReviewUser({
      handsfreeBlockedAttempts: 5,
      handsfreeBlockedLastAt: oldLast,
      strikes30d: 4,
    });
    await seedAudit(uid, "handsfree_auto_flag_for_review", -65 * 86_400_000);

    await cronTest.decayHandsfreeBlockedAttempts();

    const [after] = await db
      .select({ ur: users.underReview, attempts: users.handsfreeBlockedAttempts })
      .from(users)
      .where(eq(users.id, uid));
    // Counter still decays (it's a separate concern), but under_review
    // must remain because cancellation strikes are an independent reason.
    expect(after.attempts).toBe(0);
    expect(after.ur).toBe(true);

    const clearLogs = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, uid), eq(auditLogs.action, "handsfree_auto_flag_cleared")));
    expect(clearLogs).toHaveLength(0);
  });

  it("does nothing when the counter is still within the 60-day window", async () => {
    const recentLast = new Date(Date.now() - 10 * 86_400_000);
    const uid = await makeUnderReviewUser({
      handsfreeBlockedAttempts: 5,
      handsfreeBlockedLastAt: recentLast,
    });
    await seedAudit(uid, "handsfree_auto_flag_for_review", -8 * 86_400_000);

    await cronTest.decayHandsfreeBlockedAttempts();

    const [after] = await db
      .select({ ur: users.underReview, attempts: users.handsfreeBlockedAttempts })
      .from(users)
      .where(eq(users.id, uid));
    expect(after.attempts).toBe(5);
    expect(after.ur).toBe(true);
  });
});
