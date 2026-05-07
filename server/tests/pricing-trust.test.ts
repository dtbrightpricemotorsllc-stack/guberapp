import { describe, it, expect } from "vitest";
import {
  TRUST_ADJUSTMENTS,
  handsfreeBlockedPenalty,
  effectiveTrustScore,
  getTrustInfo,
  getTrustLevel,
  DEFAULT_FEE_CONFIG,
} from "../pricing";
import type { User } from "@shared/schema";

// Inline duplicate of server/routes.ts computeReliability so we can
// unit-test the formula without dragging in the entire routes module.
// Keep in sync with server/routes.ts.
function computeReliability(user: any): number {
  const accepted = Math.max(user.jobsAccepted || 0, 1);
  const completed = user.jobsCompleted || 0;
  const cancelled = user.canceledCount || 0;
  const disputed = user.jobsDisputed || 0;
  const handsfreePenalty = handsfreeBlockedPenalty(user.handsfreeBlockedAttempts ?? 0);
  const raw = ((completed) / accepted) * 100 - (cancelled * 3) - (disputed * 5) + handsfreePenalty;
  return Math.max(0, Math.min(Math.round(raw * 10) / 10, 100));
}

function makeUser(overrides: Partial<User> = {}): Partial<User> {
  return {
    id: 1,
    trustScore: 80,
    handsfreeBlockedAttempts: 0,
    day1OG: false,
    jobsCompleted: 0,
    onTimePct: 100,
    ...overrides,
  };
}

describe("handsfreeBlockedPenalty", () => {
  it("returns 0 for null/undefined/zero", () => {
    expect(handsfreeBlockedPenalty(0)).toBe(0);
    expect(handsfreeBlockedPenalty(null)).toBe(0);
    expect(handsfreeBlockedPenalty(undefined)).toBe(0);
  });

  it("scales linearly with attempts", () => {
    expect(handsfreeBlockedPenalty(1)).toBe(TRUST_ADJUSTMENTS.HANDSFREE_BLOCKED_ATTEMPT);
    expect(handsfreeBlockedPenalty(2)).toBe(TRUST_ADJUSTMENTS.HANDSFREE_BLOCKED_ATTEMPT * 2);
    expect(handsfreeBlockedPenalty(3)).toBe(TRUST_ADJUSTMENTS.HANDSFREE_BLOCKED_ATTEMPT * 3);
  });

  it("caps at -20 so a runaway counter can't bottom out the score", () => {
    expect(handsfreeBlockedPenalty(10)).toBe(-20);
    expect(handsfreeBlockedPenalty(100)).toBe(-20);
  });

  it("treats negative inputs as zero", () => {
    expect(handsfreeBlockedPenalty(-5)).toBe(0);
  });
});

describe("effectiveTrustScore", () => {
  it("equals stored score when counter is zero", () => {
    expect(effectiveTrustScore(makeUser({ trustScore: 80 }))).toBe(80);
  });

  it("subtracts the per-attempt penalty", () => {
    const score = effectiveTrustScore(makeUser({ trustScore: 80, handsfreeBlockedAttempts: 2 }));
    expect(score).toBe(80 + TRUST_ADJUSTMENTS.HANDSFREE_BLOCKED_ATTEMPT * 2);
  });

  it("clamps at 0", () => {
    expect(effectiveTrustScore(makeUser({ trustScore: 5, handsfreeBlockedAttempts: 10 }))).toBe(0);
  });

  it("clamps at 100", () => {
    expect(effectiveTrustScore(makeUser({ trustScore: 100, handsfreeBlockedAttempts: 0 }))).toBe(100);
  });

  it("falls back to 50 when trustScore is missing", () => {
    expect(effectiveTrustScore({ handsfreeBlockedAttempts: 1 } as Partial<User>))
      .toBe(50 + TRUST_ADJUSTMENTS.HANDSFREE_BLOCKED_ATTEMPT);
  });
});

describe("getTrustInfo with hands-free counter", () => {
  it("can demote a trusted_worker to verified_worker via the penalty", () => {
    const clean = getTrustInfo(makeUser({ trustScore: 82 }), DEFAULT_FEE_CONFIG);
    expect(clean.level).toBe("trusted_worker");

    const flagged = getTrustInfo(
      makeUser({ trustScore: 82, handsfreeBlockedAttempts: 1 }),
      DEFAULT_FEE_CONFIG,
    );
    // 82 + (-4) = 78  → verified_worker (>=60, <80)
    expect(flagged.score).toBe(78);
    expect(flagged.level).toBe("verified_worker");
  });

  it("can demote a verified_worker to new_worker once enough attempts pile up", () => {
    const flagged = getTrustInfo(
      makeUser({ trustScore: 62, handsfreeBlockedAttempts: 1 }),
      DEFAULT_FEE_CONFIG,
    );
    // 62 + (-4) = 58 → new_worker
    expect(flagged.score).toBe(58);
    expect(getTrustLevel(flagged.score)).toBe("new_worker");
  });

  it("ranks a flagged worker below a clean one even when raw stats are identical", () => {
    const clean = computeReliability({
      jobsAccepted: 10, jobsCompleted: 9, canceledCount: 1, jobsDisputed: 0,
      handsfreeBlockedAttempts: 0,
    });
    const flagged = computeReliability({
      jobsAccepted: 10, jobsCompleted: 9, canceledCount: 1, jobsDisputed: 0,
      handsfreeBlockedAttempts: 2,
    });
    expect(flagged).toBeLessThan(clean);
    expect(flagged).toBe(clean - 8);
  });

  it("clamps reliability score at 0 when penalty would drive it negative", () => {
    expect(computeReliability({
      jobsAccepted: 1, jobsCompleted: 0, canceledCount: 0, jobsDisputed: 0,
      handsfreeBlockedAttempts: 10,
    })).toBe(0);
  });

  it("reliability returns to baseline once cron decays the counter to 0", () => {
    const before = computeReliability({
      jobsAccepted: 10, jobsCompleted: 10, handsfreeBlockedAttempts: 3,
    });
    const after = computeReliability({
      jobsAccepted: 10, jobsCompleted: 10, handsfreeBlockedAttempts: 0,
    });
    expect(before).toBe(100 - 12);
    expect(after).toBe(100);
  });

  it("score recovers immediately once cron decays the counter to 0", () => {
    const before = getTrustInfo(
      makeUser({ trustScore: 90, handsfreeBlockedAttempts: 3 }),
      DEFAULT_FEE_CONFIG,
    );
    expect(before.score).toBe(90 - 12);

    const afterDecay = getTrustInfo(
      makeUser({ trustScore: 90, handsfreeBlockedAttempts: 0 }),
      DEFAULT_FEE_CONFIG,
    );
    expect(afterDecay.score).toBe(90);
    expect(afterDecay.level).toBe("trusted_worker");
  });
});
