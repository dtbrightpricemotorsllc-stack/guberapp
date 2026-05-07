import { describe, it, expect } from "vitest";
import {
  evaluatePreflight,
  haversineMeters,
  PREFLIGHT_MIN_DURATION_SEC,
  PREFLIGHT_MAX_AGE_HOURS,
  PREFLIGHT_MAX_DISTANCE_M,
  PREFLIGHT_HARD_MIN_DURATION_SEC,
  PREFLIGHT_HARD_MAX_AGE_HOURS,
  PREFLIGHT_HARD_MAX_DISTANCE_M,
} from "./handsfree-preflight";

const NOW = new Date("2026-05-07T12:00:00Z");
const JOB = { jobLat: 37.7749, jobLng: -122.4194 };

describe("haversineMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMeters({ lat: 1, lng: 2 }, { lat: 1, lng: 2 })).toBe(0);
  });
  it("approximates ~111km per degree of latitude", () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe("evaluatePreflight - duration boundary", () => {
  it("warns when duration < 30s", () => {
    const r = evaluatePreflight({ durationSec: 29, now: NOW });
    expect(r.warnings.some((w) => w.includes("29s"))).toBe(true);
    expect(r.durationSec).toBe(29);
  });
  it("does not warn at exactly 30s", () => {
    const r = evaluatePreflight({ durationSec: PREFLIGHT_MIN_DURATION_SEC, now: NOW });
    expect(r.warnings.length).toBe(0);
  });
  it("ignores missing duration without crashing", () => {
    const r = evaluatePreflight({ now: NOW });
    expect(r.warnings).toEqual([]);
  });
});

describe("evaluatePreflight - age boundary", () => {
  it("does not warn at exactly 24h", () => {
    const fileLastModified = new Date(NOW.getTime() - PREFLIGHT_MAX_AGE_HOURS * 3_600_000);
    const r = evaluatePreflight({ fileLastModified, now: NOW });
    expect(r.warnings.length).toBe(0);
  });
  it("warns when older than 24h", () => {
    const fileLastModified = new Date(NOW.getTime() - 25 * 3_600_000);
    const r = evaluatePreflight({ fileLastModified, now: NOW });
    expect(r.warnings.some((w) => /old/.test(w))).toBe(true);
    expect(r.ageHours).toBeGreaterThan(24);
  });
  it("prefers embedded capturedAt over fileLastModified", () => {
    const capturedAt = new Date(NOW.getTime() - 1 * 3_600_000);
    const fileLastModified = new Date(NOW.getTime() - 100 * 3_600_000);
    const r = evaluatePreflight({ capturedAt, fileLastModified, now: NOW });
    expect(r.warnings.length).toBe(0);
    expect(r.capturedAt).toBe(capturedAt.toISOString());
  });
});

describe("evaluatePreflight - distance boundary", () => {
  it("only checks distance when clip GPS is present", () => {
    const r = evaluatePreflight({ ...JOB, now: NOW });
    expect(r.gpsSource).toBe("none");
    expect(r.distanceMeters).toBeUndefined();
    expect(r.warnings.length).toBe(0);
  });
  it("does not warn when clip GPS is on top of the job site", () => {
    const r = evaluatePreflight({ ...JOB, clipGps: { lat: JOB.jobLat, lng: JOB.jobLng }, now: NOW });
    expect(r.gpsSource).toBe("clip");
    expect(r.warnings.length).toBe(0);
    expect(r.distanceMeters).toBe(0);
  });
  it("persists embedded clip GPS even when the job has no coords", () => {
    const r = evaluatePreflight({ clipGps: { lat: 12.34, lng: -56.78 }, now: NOW });
    expect(r.gpsSource).toBe("clip");
    expect(r.clipGps).toEqual({ lat: 12.34, lng: -56.78 });
    expect(r.distanceMeters).toBeUndefined();
    expect(r.warnings.length).toBe(0);
  });
  it("persists embedded clip GPS alongside the distance check", () => {
    const r = evaluatePreflight({
      ...JOB,
      clipGps: { lat: JOB.jobLat + 0.001, lng: JOB.jobLng },
      now: NOW,
    });
    expect(r.clipGps).toEqual({ lat: JOB.jobLat + 0.001, lng: JOB.jobLng });
    expect(r.distanceMeters).toBeGreaterThan(0);
  });
  it("warns when clip GPS is more than 500m away", () => {
    const r = evaluatePreflight({
      ...JOB,
      clipGps: { lat: JOB.jobLat + 0.01, lng: JOB.jobLng },
      now: NOW,
    });
    expect(r.distanceMeters).toBeGreaterThan(PREFLIGHT_MAX_DISTANCE_M);
    expect(r.warnings.some((w) => /from the job site/.test(w))).toBe(true);
    expect(r.blockers.length).toBe(0);
  });
});

describe("evaluatePreflight - hard blockers (task-470)", () => {
  it("blocks when clip GPS is more than 5km away", () => {
    const r = evaluatePreflight({
      ...JOB,
      clipGps: { lat: JOB.jobLat + 0.1, lng: JOB.jobLng },
      now: NOW,
    });
    expect(r.distanceMeters).toBeGreaterThan(PREFLIGHT_HARD_MAX_DISTANCE_M);
    expect(r.blockers.some((b) => /km from the job site/.test(b))).toBe(true);
    expect(r.warnings.length).toBe(0);
  });

  it("blocks when clip is older than 7 days", () => {
    const fileLastModified = new Date(NOW.getTime() - (PREFLIGHT_HARD_MAX_AGE_HOURS + 1) * 3_600_000);
    const r = evaluatePreflight({ fileLastModified, now: NOW });
    expect(r.blockers.some((b) => /days old/.test(b))).toBe(true);
    expect(r.warnings.length).toBe(0);
  });

  it("blocks when duration is shorter than 5s", () => {
    const r = evaluatePreflight({ durationSec: PREFLIGHT_HARD_MIN_DURATION_SEC - 1, now: NOW });
    expect(r.blockers.some((b) => /minimum/.test(b))).toBe(true);
    expect(r.warnings.length).toBe(0);
  });

  it("emits warnings (not blockers) at the soft thresholds", () => {
    const r = evaluatePreflight({ durationSec: 10, now: NOW });
    expect(r.blockers.length).toBe(0);
    expect(r.warnings.length).toBe(1);
  });
  it("does not warn just inside the 500m radius", () => {
    const r = evaluatePreflight({
      ...JOB,
      clipGps: { lat: JOB.jobLat + 0.004, lng: JOB.jobLng },
      now: NOW,
    });
    expect(r.distanceMeters).toBeLessThanOrEqual(PREFLIGHT_MAX_DISTANCE_M);
    expect(r.warnings.length).toBe(0);
  });
});
