/**
 * job-accept-proximity.test.ts
 *
 * Unit tests for the 20-mile proximity gate used by POST /api/jobs/:id/accept.
 *
 * Three paths are covered:
 *   1. Worker > 20 miles away + ASAP job           → rejected (OUTSIDE_AREA)
 *   2. Worker > 20 miles away + scheduled job      → accepted (no error)
 *   3. Worker < 20 miles away + any job type       → accepted (no error)
 *
 * The gate logic lives in server/job-accept-proximity.ts so it can be tested
 * without pulling in the entire routes module or any database connections.
 */

import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  isAsapOrOnDemandJob,
  checkProximityGate,
  TWENTY_MILES_METERS,
} from "../job-accept-proximity";

// ── Coordinate fixtures ──────────────────────────────────────────────────────
// Mobile, AL (near many test job posts in seed data)
const JOB_LAT = 30.6954;
const JOB_LNG = -88.0399;

// ~25 miles north of Mobile — clearly outside the 20-mile gate
const WORKER_FAR_LAT = 31.0621;
const WORKER_FAR_LNG = -88.0399;

// ~5 miles north of Mobile — clearly inside the 20-mile gate
const WORKER_NEAR_LAT = 30.7681;
const WORKER_NEAR_LNG = -88.0399;

// ── haversineMeters ──────────────────────────────────────────────────────────
describe("haversineMeters", () => {
  it("returns ~0 for identical coordinates", () => {
    expect(haversineMeters(30.0, -88.0, 30.0, -88.0)).toBeCloseTo(0, 0);
  });

  it("returns a positive distance for distinct points", () => {
    const d = haversineMeters(JOB_LAT, JOB_LNG, WORKER_FAR_LAT, WORKER_FAR_LNG);
    expect(d).toBeGreaterThan(0);
  });

  it("far worker is beyond 20 miles from job", () => {
    const d = haversineMeters(JOB_LAT, JOB_LNG, WORKER_FAR_LAT, WORKER_FAR_LNG);
    expect(d).toBeGreaterThan(TWENTY_MILES_METERS);
  });

  it("near worker is within 20 miles of job", () => {
    const d = haversineMeters(JOB_LAT, JOB_LNG, WORKER_NEAR_LAT, WORKER_NEAR_LNG);
    expect(d).toBeLessThan(TWENTY_MILES_METERS);
  });
});

// ── isAsapOrOnDemandJob ──────────────────────────────────────────────────────
describe("isAsapOrOnDemandJob", () => {
  it("returns true when urgentSwitch is set", () => {
    expect(isAsapOrOnDemandJob({ urgentSwitch: true })).toBe(true);
  });

  it("returns true for On-Demand Help category", () => {
    expect(isAsapOrOnDemandJob({ category: "On-Demand Help" })).toBe(true);
  });

  it("returns true when jobDetails.timeType is ASAP", () => {
    expect(
      isAsapOrOnDemandJob({ jobDetails: { timeType: "ASAP" } }),
    ).toBe(true);
  });

  it("returns false for a scheduled appointment job", () => {
    expect(
      isAsapOrOnDemandJob({
        urgentSwitch: false,
        category: "Skilled Labor",
        jobDetails: { timeType: "scheduled" },
      }),
    ).toBe(false);
  });

  it("returns false when all fields are null/missing", () => {
    expect(isAsapOrOnDemandJob({})).toBe(false);
    expect(isAsapOrOnDemandJob({ urgentSwitch: null, category: null, jobDetails: null })).toBe(false);
  });
});

// ── checkProximityGate — the three critical paths ───────────────────────────
describe("checkProximityGate", () => {
  // ── Path 1: Worker > 20 miles + ASAP job → rejected ──────────────────────
  describe("Path 1 — far worker + ASAP/urgent job is rejected", () => {
    it("rejects when urgentSwitch is true and worker is far away", () => {
      const job = { urgentSwitch: true, lat: JOB_LAT, lng: JOB_LNG };
      const result = checkProximityGate(job, WORKER_FAR_LAT, WORKER_FAR_LNG);
      expect(result).not.toBeNull();
      expect(result!.message).toBe("OUTSIDE_AREA");
    });

    it("rejects for On-Demand Help category when worker is far away", () => {
      const job = { category: "On-Demand Help", lat: JOB_LAT, lng: JOB_LNG };
      const result = checkProximityGate(job, WORKER_FAR_LAT, WORKER_FAR_LNG);
      expect(result).not.toBeNull();
      expect(result!.message).toBe("OUTSIDE_AREA");
    });

    it("rejects when jobDetails.timeType is ASAP and worker is far away", () => {
      const job = {
        urgentSwitch: false,
        category: "Moving Help",
        jobDetails: { timeType: "ASAP" },
        lat: JOB_LAT,
        lng: JOB_LNG,
      };
      const result = checkProximityGate(job, WORKER_FAR_LAT, WORKER_FAR_LNG);
      expect(result).not.toBeNull();
      expect(result!.message).toBe("OUTSIDE_AREA");
    });
  });

  // ── Path 2: Worker > 20 miles + scheduled job → accepted ─────────────────
  describe("Path 2 — far worker + scheduled/appointment job is allowed", () => {
    it("allows a worker 25+ miles away on a scheduled appointment job", () => {
      const job = {
        urgentSwitch: false,
        category: "Skilled Labor",
        jobDetails: { timeType: "scheduled" },
        lat: JOB_LAT,
        lng: JOB_LNG,
      };
      const result = checkProximityGate(job, WORKER_FAR_LAT, WORKER_FAR_LNG);
      expect(result).toBeNull();
    });

    it("allows a far worker on a standard (non-urgent, non-ASAP) job", () => {
      const job = {
        urgentSwitch: false,
        category: "Verify & Inspect",
        jobDetails: null,
        lat: JOB_LAT,
        lng: JOB_LNG,
      };
      const result = checkProximityGate(job, WORKER_FAR_LAT, WORKER_FAR_LNG);
      expect(result).toBeNull();
    });

    it("allows a far worker when job has no jobDetails at all", () => {
      const job = {
        urgentSwitch: false,
        category: "Lawn & Yard",
        lat: JOB_LAT,
        lng: JOB_LNG,
      };
      const result = checkProximityGate(job, WORKER_FAR_LAT, WORKER_FAR_LNG);
      expect(result).toBeNull();
    });
  });

  // ── Path 3: Worker < 20 miles + any job → accepted ───────────────────────
  describe("Path 3 — nearby worker is always allowed", () => {
    it("allows a nearby worker on an urgent ASAP job", () => {
      const job = { urgentSwitch: true, lat: JOB_LAT, lng: JOB_LNG };
      const result = checkProximityGate(job, WORKER_NEAR_LAT, WORKER_NEAR_LNG);
      expect(result).toBeNull();
    });

    it("allows a nearby worker on an On-Demand Help job", () => {
      const job = { category: "On-Demand Help", lat: JOB_LAT, lng: JOB_LNG };
      const result = checkProximityGate(job, WORKER_NEAR_LAT, WORKER_NEAR_LNG);
      expect(result).toBeNull();
    });

    it("allows a nearby worker on a scheduled job", () => {
      const job = {
        urgentSwitch: false,
        category: "Skilled Labor",
        jobDetails: { timeType: "scheduled" },
        lat: JOB_LAT,
        lng: JOB_LNG,
      };
      const result = checkProximityGate(job, WORKER_NEAR_LAT, WORKER_NEAR_LNG);
      expect(result).toBeNull();
    });
  });

  // ── Edge cases: missing coordinates ──────────────────────────────────────
  describe("missing coordinates — fail-open (never block a legitimate worker)", () => {
    it("passes when job has no lat/lng (fail-open)", () => {
      const job = { urgentSwitch: true, lat: null, lng: null };
      expect(checkProximityGate(job, WORKER_FAR_LAT, WORKER_FAR_LNG)).toBeNull();
    });

    it("passes when worker coords are null (fail-open)", () => {
      const job = { urgentSwitch: true, lat: JOB_LAT, lng: JOB_LNG };
      expect(checkProximityGate(job, null, null)).toBeNull();
    });

    it("passes when worker coords are undefined (fail-open)", () => {
      const job = { urgentSwitch: true, lat: JOB_LAT, lng: JOB_LNG };
      expect(checkProximityGate(job, undefined, undefined)).toBeNull();
    });
  });

  // ── Coordinate validation — malformed inputs must not bypass the gate ─────
  // If the client sends a non-numeric or out-of-range value, JavaScript would
  // coerce it to NaN inside haversineMeters; NaN > limit is false, so a far
  // worker would silently pass. The gate must treat malformed coords as absent
  // (fail-open) rather than silently producing a wrong answer.
  describe("malformed worker coordinates → treated as absent (fail-open, not bypassed)", () => {
    const asapJob = { urgentSwitch: true, lat: JOB_LAT, lng: JOB_LNG };

    it("string latitude fails validation → fail-open", () => {
      expect(checkProximityGate(asapJob, "31.0621" as any, WORKER_FAR_LNG)).toBeNull();
    });

    it("NaN latitude fails validation → fail-open", () => {
      expect(checkProximityGate(asapJob, NaN, WORKER_FAR_LNG)).toBeNull();
    });

    it("Infinity latitude fails validation → fail-open", () => {
      expect(checkProximityGate(asapJob, Infinity, WORKER_FAR_LNG)).toBeNull();
    });

    it("latitude out of range (> 90) fails validation → fail-open", () => {
      expect(checkProximityGate(asapJob, 91, WORKER_FAR_LNG)).toBeNull();
    });

    it("latitude out of range (< -90) fails validation → fail-open", () => {
      expect(checkProximityGate(asapJob, -91, WORKER_FAR_LNG)).toBeNull();
    });

    it("longitude out of range (> 180) fails validation → fail-open", () => {
      expect(checkProximityGate(asapJob, WORKER_FAR_LAT, 181)).toBeNull();
    });

    it("longitude out of range (< -180) fails validation → fail-open", () => {
      expect(checkProximityGate(asapJob, WORKER_FAR_LAT, -181)).toBeNull();
    });

    it("only one coordinate provided (lat only) → fail-open", () => {
      expect(checkProximityGate(asapJob, WORKER_FAR_LAT, undefined)).toBeNull();
    });

    it("only one coordinate provided (lng only) → fail-open", () => {
      expect(checkProximityGate(asapJob, undefined, WORKER_FAR_LNG)).toBeNull();
    });

    it("boolean true as coordinate fails validation → fail-open", () => {
      // typeof true === 'boolean', not 'number'
      expect(checkProximityGate(asapJob, true as any, WORKER_FAR_LNG)).toBeNull();
    });

    it("null string 'null' as coordinate fails validation → fail-open", () => {
      expect(checkProximityGate(asapJob, "null" as any, WORKER_FAR_LNG)).toBeNull();
    });
  });
});
