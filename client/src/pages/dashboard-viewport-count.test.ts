// Unit tests for the viewport-count badge logic.
//
// The dashboard badge ("X active" / "X near you") derives from mapBounds
// reported by the Google Map idle event via inViewport() from
// client/src/lib/viewport-utils.ts, which dashboard.tsx imports and calls
// directly.  These tests exercise that production function so that any
// change to the real logic — wrong comparison, wrong property name, dropped
// null-guard — will fail here immediately.
//
// Scenarios covered:
//   A. mapBounds null  → inViewport always false → nearbyCount / workerCount = 0
//   B. mapBounds set   → pins inside bounds count; outside pins don't
//   C. Boundary edges  → inclusive (>= and <=), so exact-edge pins count
//   D. CashDrop pins   → use gpsLat/gpsLng (not lat/lng); tested explicitly
//   E. City-pan sequence → count drops to 0 during reload, then rises again

import { describe, it, expect } from "vitest";
import { inViewport } from "@/lib/viewport-utils";
import type { MapBounds } from "@/components/google-map";

// ── Shared fixtures ───────────────────────────────────────────────────────────

/** Chicago viewport (~41.3–42.3 N, ~88.1–87.1 W) */
const CHICAGO: MapBounds = { north: 42.3, south: 41.3, east: -87.1, west: -88.1 };

/** Los Angeles viewport (~33.8–34.3 N, ~118.6–117.9 W) */
const LA: MapBounds = { north: 34.3, south: 33.8, east: -117.9, west: -118.6 };

// Coordinates used across tests
const CHICAGO_PIN   = { lat: 41.8, lng: -87.6 };   // clearly inside Chicago
const LA_PIN        = { lat: 34.05, lng: -118.24 }; // clearly inside LA
const NY_PIN        = { lat: 40.71, lng: -74.01 };  // outside both viewports
const SW_CORNER     = { lat: 41.3, lng: -88.1 };    // exactly on Chicago's boundary

// ── A. null bounds — cold load ────────────────────────────────────────────────

describe("inViewport — mapBounds is null (map has not fired idle yet)", () => {
  it("returns false for a pin that would otherwise be inside bounds", () => {
    expect(inViewport(CHICAGO_PIN.lat, CHICAGO_PIN.lng, null)).toBe(false);
  });

  it("returns false for any other coordinate", () => {
    expect(inViewport(LA_PIN.lat, LA_PIN.lng, null)).toBe(false);
    expect(inViewport(0, 0, null)).toBe(false);
  });

  it("nearbyCount is 0 when mapBounds is null (jobs + cash drops)", () => {
    const jobs      = [CHICAGO_PIN, NY_PIN];
    const cashDrops = [CHICAGO_PIN]; // same coords, simulates CashDropPin.gpsLat/gpsLng
    const nearbyCount =
      jobs.filter(p => inViewport(p.lat, p.lng, null)).length +
      cashDrops.filter(d => inViewport(d.lat, d.lng, null)).length;
    expect(nearbyCount).toBe(0);
  });

  it("workerCount is 0 when mapBounds is null", () => {
    const workers = [CHICAGO_PIN, NY_PIN];
    const workerCount = workers.filter(w => inViewport(w.lat, w.lng, null)).length;
    expect(workerCount).toBe(0);
  });
});

// ── B. bounds set — basic filtering ──────────────────────────────────────────

describe("inViewport — mapBounds set (idle event has fired)", () => {
  it("returns true for a pin clearly inside the viewport", () => {
    expect(inViewport(CHICAGO_PIN.lat, CHICAGO_PIN.lng, CHICAGO)).toBe(true);
  });

  it("returns false for a pin in a different city", () => {
    expect(inViewport(LA_PIN.lat, LA_PIN.lng, CHICAGO)).toBe(false);
    expect(inViewport(NY_PIN.lat, NY_PIN.lng, CHICAGO)).toBe(false);
  });

  it("nearbyCount reflects only in-viewport pins", () => {
    const jobs      = [CHICAGO_PIN, LA_PIN, NY_PIN]; // 1 inside
    const cashDrops = [CHICAGO_PIN, NY_PIN];          // 1 inside
    const nearbyCount =
      jobs.filter(p => inViewport(p.lat, p.lng, CHICAGO)).length +
      cashDrops.filter(d => inViewport(d.lat, d.lng, CHICAGO)).length;
    expect(nearbyCount).toBe(2); // 1 job + 1 cash drop
  });

  it("workerCount reflects only in-viewport workers", () => {
    const workers = [CHICAGO_PIN, LA_PIN, NY_PIN]; // 1 inside
    const workerCount = workers.filter(w => inViewport(w.lat, w.lng, CHICAGO)).length;
    expect(workerCount).toBe(1);
  });

  it("nearbyCount is 0 when all pins are outside the viewport", () => {
    const jobs      = [LA_PIN, NY_PIN];
    const cashDrops = [NY_PIN];
    const nearbyCount =
      jobs.filter(p => inViewport(p.lat, p.lng, CHICAGO)).length +
      cashDrops.filter(d => inViewport(d.lat, d.lng, CHICAGO)).length;
    expect(nearbyCount).toBe(0);
  });

  it("nearbyCount equals total when all pins are inside the viewport", () => {
    const jobs      = [CHICAGO_PIN, CHICAGO_PIN];
    const cashDrops = [CHICAGO_PIN];
    const nearbyCount =
      jobs.filter(p => inViewport(p.lat, p.lng, CHICAGO)).length +
      cashDrops.filter(d => inViewport(d.lat, d.lng, CHICAGO)).length;
    expect(nearbyCount).toBe(3);
  });
});

// ── C. boundary edges ─────────────────────────────────────────────────────────

describe("inViewport — boundary edges are inclusive", () => {
  it("includes a pin exactly on the south-west corner", () => {
    expect(inViewport(SW_CORNER.lat, SW_CORNER.lng, CHICAGO)).toBe(true);
  });

  it("includes a pin exactly on the north edge", () => {
    expect(inViewport(CHICAGO.north, CHICAGO_PIN.lng, CHICAGO)).toBe(true);
  });

  it("excludes a pin just outside the south edge", () => {
    expect(inViewport(CHICAGO.south - 0.001, CHICAGO_PIN.lng, CHICAGO)).toBe(false);
  });

  it("excludes a pin just outside the east edge", () => {
    expect(inViewport(CHICAGO_PIN.lat, CHICAGO.east + 0.001, CHICAGO)).toBe(false);
  });
});

// ── D. CashDrop gpsLat/gpsLng usage ──────────────────────────────────────────

describe("inViewport — cash drop pins use gpsLat / gpsLng", () => {
  it("counts cash drops whose gpsLat/gpsLng are inside the viewport", () => {
    // Simulates: activeCashDropPins.filter(d => inViewport(d.gpsLat, d.gpsLng, mapBounds))
    const drops = [
      { gpsLat: CHICAGO_PIN.lat, gpsLng: CHICAGO_PIN.lng },  // inside
      { gpsLat: LA_PIN.lat,      gpsLng: LA_PIN.lng },        // outside
    ];
    const visible = drops.filter(d => inViewport(d.gpsLat, d.gpsLng, CHICAGO));
    expect(visible.length).toBe(1);
  });

  it("counts 0 cash drops when mapBounds is null", () => {
    const drops = [{ gpsLat: CHICAGO_PIN.lat, gpsLng: CHICAGO_PIN.lng }];
    const visible = drops.filter(d => inViewport(d.gpsLat, d.gpsLng, null));
    expect(visible.length).toBe(0);
  });
});

// ── E. city-pan sequence ──────────────────────────────────────────────────────

describe("inViewport — pan to a new city updates the count correctly", () => {
  it("count transitions: Chicago→0 (null bounds)→LA", () => {
    const pins = [CHICAGO_PIN, LA_PIN]; // one pin in each city

    // Step 1: Chicago viewport active
    const inChicago = pins.filter(p => inViewport(p.lat, p.lng, CHICAGO));
    expect(inChicago.length).toBe(1);
    expect(inChicago[0]).toEqual(CHICAGO_PIN);

    // Step 2: bounds reset to null while map re-loads tiles for new city
    const duringLoad = pins.filter(p => inViewport(p.lat, p.lng, null));
    expect(duringLoad.length).toBe(0);

    // Step 3: LA viewport fires — only the LA pin is now visible
    const inLA = pins.filter(p => inViewport(p.lat, p.lng, LA));
    expect(inLA.length).toBe(1);
    expect(inLA[0]).toEqual(LA_PIN);
  });
});
