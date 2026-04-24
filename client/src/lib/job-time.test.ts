import { describe, it, expect } from "vitest";
import { formatJobTime } from "./job-time";

const SAMPLE = new Date("2026-04-24T20:00:00Z"); // 4 PM EDT / 1 PM PDT

describe("formatJobTime", () => {
  it("renders the job's local zone explicitly when zip resolves", () => {
    const t = formatJobTime(SAMPLE, "90001");
    expect(t).not.toBeNull();
    // Pacific Time abbreviation (PDT/PST) should appear in the rendered string.
    expect(t!.primary).toMatch(/PDT|PST|GMT-?\d/);
    expect(t!.inJobZone).toBe(true);
  });

  it("includes a viewer-local tag when the viewer zone differs from the job zone", () => {
    const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const t = formatJobTime(SAMPLE, "90001");
    if (viewerTz === "America/Los_Angeles") {
      expect(t!.viewerLocal).toBeUndefined();
    } else {
      expect(t!.viewerLocal).toBeDefined();
      expect(t!.viewerLocal).toMatch(/your time/);
    }
  });

  it("falls back to viewer-local with explicit '(your time)' tag when zip is missing", () => {
    const t = formatJobTime(SAMPLE, null);
    expect(t!.inJobZone).toBe(false);
    expect(t!.primary).toMatch(/\(your time\)/);
  });

  it("returns null for missing input", () => {
    expect(formatJobTime(null, "90001")).toBeNull();
    expect(formatJobTime(undefined, "90001")).toBeNull();
  });

  it("derives different zones for different US ZIP regions", () => {
    // Render the same instant in multiple US zones — the formatted time-of-
    // day should differ across at least two of them, proving the timezone
    // mapping is actually in effect (not silently falling back to one zone).
    const la = formatJobTime(SAMPLE, "90001")?.primary ?? "";
    const ny = formatJobTime(SAMPLE, "10001")?.primary ?? "";
    const denver = formatJobTime(SAMPLE, "80202")?.primary ?? "";
    expect(la).not.toBe(ny);
    expect(ny).not.toBe(denver);
  });
});
