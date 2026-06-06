import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  checkGeofence,
  normalizeVin,
} from "../asset-custody";
import type { ProtectedAsset } from "@shared/schema";

// Minimal protected-asset stub with just the geofence fields the guard reads.
function asset(over: Partial<ProtectedAsset> = {}): ProtectedAsset {
  return {
    id: 1,
    ownerId: 1,
    geofenceLat: null,
    geofenceLng: null,
    geofenceRadiusMeters: 250,
    ...over,
  } as ProtectedAsset;
}

describe("Verified Release System™ — geofence lock (checkGeofence)", () => {
  it("reports distance ~0 for the same point", () => {
    expect(haversineMeters(36.05, -79.82, 36.05, -79.82)).toBeLessThan(1);
  });

  it("treats an asset with no pickup coordinates as unconfigured (never verified)", () => {
    const g = checkGeofence(asset({ geofenceLat: null, geofenceLng: null }), 36.05, -79.82);
    expect(g.unconfigured).toBe(true);
    expect(g.verified).toBe(false);
    expect(g.meters).toBeNull();
  });

  it("verifies a point inside the geofence radius", () => {
    const a = asset({ geofenceLat: 36.05, geofenceLng: -79.82, geofenceRadiusMeters: 250 });
    // ~30m north of the pickup point.
    const g = checkGeofence(a, 36.0503, -79.82);
    expect(g.unconfigured).toBe(false);
    expect(g.verified).toBe(true);
    expect(g.meters).not.toBeNull();
    expect(g.meters!).toBeLessThanOrEqual(250);
  });

  it("rejects a point outside the geofence radius", () => {
    const a = asset({ geofenceLat: 36.05, geofenceLng: -79.82, geofenceRadiusMeters: 250 });
    // ~1.1km north of the pickup point.
    const g = checkGeofence(a, 36.06, -79.82);
    expect(g.verified).toBe(false);
    expect(g.meters!).toBeGreaterThan(250);
    expect(g.radiusMeters).toBe(250);
  });

  it("uses a 250m default radius when none is set", () => {
    const a = asset({ geofenceLat: 36.05, geofenceLng: -79.82, geofenceRadiusMeters: null });
    const g = checkGeofence(a, 36.05, -79.82);
    expect(g.radiusMeters).toBe(250);
    expect(g.verified).toBe(true);
  });
});

describe("Verified Release System™ — VIN hard block (normalizeVin)", () => {
  it("upper-cases and strips separators so equivalent VINs match", () => {
    expect(normalizeVin("1hgbh41jxmn-109186")).toBe("1HGBH41JXMN109186");
    expect(normalizeVin(" 1hgbh41jXmn109186 ")).toBe("1HGBH41JXMN109186");
  });

  it("normalizes null/undefined to an empty string", () => {
    expect(normalizeVin(null)).toBe("");
    expect(normalizeVin(undefined)).toBe("");
  });

  it("distinguishes genuinely different VINs", () => {
    expect(normalizeVin("1HGBH41JXMN109186")).not.toBe(normalizeVin("1HGBH41JXMN109187"));
  });
});
