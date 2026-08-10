// Unit tests for the timezone-aware same-day availability check used by
// urgent/on-demand/ASAP job accepts.
//
// Boundary cases covered:
//   - Eastern US worker at various times of day
//   - Hawaii (UTC-10) worker where UTC is already "tomorrow"
//   - Next-local-day window that must be rejected
//   - Same-day window at 11:59 PM local time that must be accepted

import { describe, it, expect } from "vitest";
import { validateSameDayAvailability, localDate } from "../availability-same-day";

// Helper: build a Date from an ISO string (UTC).
const dt = (iso: string) => new Date(iso);

// ── localDate helper ─────────────────────────────────────────────────────────

describe("localDate", () => {
  it("returns the calendar date in Eastern time", () => {
    // 2026-08-10T04:00:00Z = Aug 9 at midnight ET (UTC-4 during EDT)
    expect(localDate(dt("2026-08-10T03:59:00Z"), "America/New_York")).toBe("2026-08-09");
    expect(localDate(dt("2026-08-10T04:00:00Z"), "America/New_York")).toBe("2026-08-10");
  });

  it("returns the calendar date in Hawaii (UTC-10)", () => {
    // 2026-08-11T10:00:00Z = Aug 11 00:00 Hawaii time
    expect(localDate(dt("2026-08-11T09:59:00Z"), "Pacific/Honolulu")).toBe("2026-08-10");
    expect(localDate(dt("2026-08-11T10:00:00Z"), "Pacific/Honolulu")).toBe("2026-08-11");
  });
});

// ── validateSameDayAvailability ───────────────────────────────────────────────

describe("validateSameDayAvailability", () => {
  // "now" in tests is 2026-08-10 18:00 UTC (2 PM ET / 8 AM HT)
  const NOW_UTC = dt("2026-08-10T18:00:00Z");

  // ── Eastern time ────────────────────────────────────────────────────────────

  it("accepts a window starting now in Eastern time", () => {
    // availableFrom = 18:00 UTC = 14:00 ET = Aug 10 in ET ✓
    expect(validateSameDayAvailability(dt("2026-08-10T18:00:00Z"), "America/New_York", NOW_UTC)).toBeNull();
  });

  it("accepts a window starting in the evening in Eastern time (same local day)", () => {
    // 22:00 ET = next UTC day for some clocks, but still Aug 10 in ET ✓
    const eveningET = dt("2026-08-11T02:00:00Z"); // 22:00 ET
    expect(validateSameDayAvailability(eveningET, "America/New_York", NOW_UTC)).toBeNull();
  });

  it("rejects a window starting tomorrow in Eastern time", () => {
    // Aug 11 08:00 ET = Aug 11 in ET ✗
    const tomorrowET = dt("2026-08-11T12:00:00Z");
    const err = validateSameDayAvailability(tomorrowET, "America/New_York", NOW_UTC);
    expect(err).toMatch(/start today/i);
  });

  // ── Hawaii (UTC-10) — key cross-timezone boundary case ───────────────────────

  it("accepts a window when UTC is 'tomorrow' but Hawaii time is still today", () => {
    // now = 18:00 UTC = Aug 10; worker in Hawaii sees Aug 10 08:00 HT
    // availableFrom = 20:00 UTC = Aug 10 10:00 HT — still today in Hawaii ✓
    expect(validateSameDayAvailability(dt("2026-08-10T20:00:00Z"), "Pacific/Honolulu", NOW_UTC)).toBeNull();
  });

  it("accepts a Hawaii window at 11:59 PM Hawaii time (still same local day)", () => {
    // 11:59 PM HT = 09:59 UTC next day (Aug 11T09:59Z)
    const lateNightHI = dt("2026-08-11T09:59:00Z");
    // now in Hawaii = Aug 10 08:00 HT
    expect(validateSameDayAvailability(lateNightHI, "Pacific/Honolulu", NOW_UTC)).toBeNull();
  });

  it("rejects a Hawaii window starting tomorrow Hawaii time", () => {
    // Aug 11 00:01 HT = Aug 11T10:01Z
    const tomorrowHI = dt("2026-08-11T10:01:00Z");
    const err = validateSameDayAvailability(tomorrowHI, "Pacific/Honolulu", NOW_UTC);
    expect(err).toMatch(/start today/i);
  });

  // ── NY worker, CA job (the explicit cross-timezone scenario from the review) ──

  it("allows a NY worker to accept a CA ASAP job at 9 PM ET (workerTz = Eastern)", () => {
    // now = 2026-08-10T22:00 ET = 2026-08-11T02:00 UTC
    // availableFrom = same moment = 2026-08-11T02:00 UTC
    // In Eastern time that is still Aug 10 ✓
    const now9PM_ET = dt("2026-08-11T01:00:00Z"); // 9 PM ET (UTC-4)
    const avFrom    = dt("2026-08-11T01:00:00Z");
    expect(validateSameDayAvailability(avFrom, "America/New_York", now9PM_ET)).toBeNull();
  });

  // ── Error message content ────────────────────────────────────────────────────

  it("returns the canonical error message on rejection", () => {
    const tomorrow = dt("2026-08-11T12:00:00Z");
    expect(validateSameDayAvailability(tomorrow, "America/New_York", NOW_UTC)).toBe(
      "Urgent/on-demand jobs require same-day availability. Your availability window must start today.",
    );
  });
});
