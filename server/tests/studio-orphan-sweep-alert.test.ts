import { describe, it, expect } from "vitest";
import { evaluateAlertNeed } from "../studio-orphan-sweep.js";

const MB = 1024 * 1024;
const HOUR = 60 * 60 * 1000;

const baseInput = {
  thresholdOrphans: 100,
  thresholdBytes: 500 * MB,
  throttleHours: 168, // weekly
  lastAlertAt: null as Date | null,
  lastAlertOrphans: 0,
  lastAlertBytes: 0,
  now: new Date("2026-05-10T12:00:00Z"),
};

describe("evaluateAlertNeed (task-546 alert throttling)", () => {
  it("does not alert when both totals are under threshold", () => {
    const d = evaluateAlertNeed({ ...baseInput, totalOrphans: 50, totalOrphanBytes: 100 * MB });
    expect(d.send).toBe(false);
    expect(d.reason).toBe("below_threshold");
  });

  it("alerts on first crossing of orphan threshold", () => {
    const d = evaluateAlertNeed({ ...baseInput, totalOrphans: 200, totalOrphanBytes: 1 * MB });
    expect(d.send).toBe(true);
    expect(d.reason).toBe("first_alert");
  });

  it("alerts on first crossing of bytes threshold", () => {
    const d = evaluateAlertNeed({ ...baseInput, totalOrphans: 1, totalOrphanBytes: 700 * MB });
    expect(d.send).toBe(true);
    expect(d.reason).toBe("first_alert");
  });

  it("throttles repeat alerts for the same standing waste within the window", () => {
    const lastAt = new Date(baseInput.now.getTime() - 24 * HOUR); // 1 day ago
    const d = evaluateAlertNeed({
      ...baseInput,
      totalOrphans: 210,
      totalOrphanBytes: 510 * MB,
      lastAlertAt: lastAt,
      lastAlertOrphans: 200,
      lastAlertBytes: 500 * MB,
    });
    expect(d.send).toBe(false);
    expect(d.reason).toBe("throttled");
  });

  it("re-alerts within the window if waste grows materially (>25%)", () => {
    const lastAt = new Date(baseInput.now.getTime() - 24 * HOUR);
    const d = evaluateAlertNeed({
      ...baseInput,
      totalOrphans: 400, // 200 → 400 = 100% growth
      totalOrphanBytes: 510 * MB,
      lastAlertAt: lastAt,
      lastAlertOrphans: 200,
      lastAlertBytes: 500 * MB,
    });
    expect(d.send).toBe(true);
    expect(d.reason).toBe("growth");
  });

  it("re-alerts after the throttle window even with similar totals", () => {
    const lastAt = new Date(baseInput.now.getTime() - 200 * HOUR); // > 168h
    const d = evaluateAlertNeed({
      ...baseInput,
      totalOrphans: 205,
      totalOrphanBytes: 505 * MB,
      lastAlertAt: lastAt,
      lastAlertOrphans: 200,
      lastAlertBytes: 500 * MB,
    });
    expect(d.send).toBe(true);
    expect(d.reason).toBe("first_alert");
  });

  it("forces a hard reminder after 30 days no matter what", () => {
    const lastAt = new Date(baseInput.now.getTime() - 31 * 24 * HOUR);
    const d = evaluateAlertNeed({
      ...baseInput,
      throttleHours: 24 * 365, // huge throttle
      totalOrphans: 105,
      totalOrphanBytes: 1 * MB,
      lastAlertAt: lastAt,
      lastAlertOrphans: 105,
      lastAlertBytes: 1 * MB,
    });
    expect(d.send).toBe(true);
    expect(d.reason).toBe("hard_reminder");
  });

  it("respects custom thresholds", () => {
    const d = evaluateAlertNeed({
      ...baseInput,
      thresholdOrphans: 10,
      thresholdBytes: 1 * MB,
      totalOrphans: 11,
      totalOrphanBytes: 0,
    });
    expect(d.send).toBe(true);
  });
});
