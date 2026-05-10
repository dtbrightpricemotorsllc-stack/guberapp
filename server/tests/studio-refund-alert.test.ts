import { describe, it, expect } from "vitest";
import { evaluateRefundAlertNeed } from "../studio-refund-alert.js";
import type { RefundRateSample } from "../studio-refund-alert.js";

const HOUR = 60 * 60 * 1000;
const NOW  = new Date("2026-05-10T12:00:00Z");

function makeSample(overrides: Partial<RefundRateSample> = {}): RefundRateSample {
  const succeeded = overrides.succeeded ?? 3;
  const failed    = overrides.failed    ?? 0;
  const refunded  = overrides.refunded  ?? 0;
  const total     = succeeded + failed + refunded;
  const rate      = total === 0 ? 0 : (failed + refunded) / total;
  return { windowHours: 1, total, succeeded, failed, refunded, rate, ...overrides };
}

const base = {
  thresholdRate: 0.5,
  minSample:     5,
  throttleHours: 4,
  lastAlertAt:   null as Date | null,
  now:           NOW,
};

describe("evaluateRefundAlertNeed (task-556)", () => {
  it("suppresses alert when sample is below min threshold", () => {
    const sample = makeSample({ succeeded: 2, failed: 2, refunded: 0 }); // total=4 < 5
    const d = evaluateRefundAlertNeed({ ...base, sample });
    expect(d.send).toBe(false);
    expect(d.reason).toBe("below_min_sample");
  });

  it("suppresses alert when rate is under threshold", () => {
    const sample = makeSample({ succeeded: 8, failed: 1, refunded: 0 }); // 10% rate
    const d = evaluateRefundAlertNeed({ ...base, sample });
    expect(d.send).toBe(false);
    expect(d.reason).toBe("below_threshold");
  });

  it("fires on first crossing above threshold with enough sample", () => {
    const sample = makeSample({ succeeded: 2, failed: 3, refunded: 2 }); // 5/7 = 71%
    const d = evaluateRefundAlertNeed({ ...base, sample });
    expect(d.send).toBe(true);
    expect(d.reason).toBe("first_alert");
  });

  it("fires when exactly at threshold rate (>= triggers the alert)", () => {
    // 5 out of 10 = 50% — equals threshold; implementation uses >= so this fires
    const sample = makeSample({ succeeded: 5, failed: 3, refunded: 2 }); // 5/10 = 50%
    const d = evaluateRefundAlertNeed({ ...base, sample });
    expect(d.send).toBe(true);
    expect(d.reason).toBe("first_alert");
  });

  it("fires when just above threshold rate", () => {
    const sample = makeSample({ succeeded: 4, failed: 3, refunded: 2 }); // 5/9 ≈ 55.6%
    const d = evaluateRefundAlertNeed({ ...base, sample });
    expect(d.send).toBe(true);
    expect(d.reason).toBe("first_alert");
  });

  it("throttles within the alert window", () => {
    const sample = makeSample({ succeeded: 2, failed: 3, refunded: 2 }); // 71%
    const lastAlertAt = new Date(NOW.getTime() - 2 * HOUR); // 2h ago, throttle=4h
    const d = evaluateRefundAlertNeed({ ...base, sample, lastAlertAt });
    expect(d.send).toBe(false);
    expect(d.reason).toBe("throttled");
  });

  it("re-fires once the throttle window has elapsed", () => {
    const sample = makeSample({ succeeded: 2, failed: 3, refunded: 2 }); // 71%
    const lastAlertAt = new Date(NOW.getTime() - 5 * HOUR); // 5h ago, throttle=4h
    const d = evaluateRefundAlertNeed({ ...base, sample, lastAlertAt });
    expect(d.send).toBe(true);
    expect(d.reason).toBe("within_window");
  });

  it("respects custom threshold and min-sample settings", () => {
    const sample = makeSample({ succeeded: 7, failed: 2, refunded: 1 }); // 30% rate, total=10
    const d = evaluateRefundAlertNeed({
      ...base,
      thresholdRate: 0.25, // lower bar
      minSample: 10,       // exactly met
      sample,
    });
    expect(d.send).toBe(true);
  });

  it("returns thresholds on the decision object", () => {
    const sample = makeSample({ succeeded: 1, failed: 0, refunded: 0 });
    const d = evaluateRefundAlertNeed({ ...base, sample });
    expect(d.thresholdRate).toBe(0.5);
    expect(d.minSample).toBe(5);
    expect(d.throttleHours).toBe(4);
  });
});
