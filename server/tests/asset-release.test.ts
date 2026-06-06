import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  checkGeofence,
  normalizeVin,
  hashReleaseCode,
  timingSafeHashEqual,
  maskReleaseCode,
  redactReleaseCode,
} from "../asset-custody";
import type { ProtectedAsset, ReleaseCode } from "@shared/schema";

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

describe("Verified Release System™ — pickup-code secret handling", () => {
  it("hashes deterministically and case/whitespace-insensitively (never returns plaintext)", () => {
    const h = hashReleaseCode("ABCD2345");
    expect(h).toHaveLength(64); // hex sha256
    expect(h).not.toContain("ABCD2345");
    expect(hashReleaseCode(" abcd2345 ")).toBe(h);
  });

  it("produces different digests for different codes", () => {
    expect(hashReleaseCode("ABCD2345")).not.toBe(hashReleaseCode("ABCD2346"));
  });

  it("timing-safe compare matches equal digests and rejects mismatches", () => {
    const h = hashReleaseCode("ABCD2345");
    expect(timingSafeHashEqual(h, hashReleaseCode("ABCD2345"))).toBe(true);
    expect(timingSafeHashEqual(h, hashReleaseCode("ZZZZ9999"))).toBe(false);
  });

  it("timing-safe compare safely rejects null/empty/short (legacy rows w/o codeHash)", () => {
    const h = hashReleaseCode("ABCD2345");
    expect(timingSafeHashEqual(null as any, h)).toBe(false);
    expect(timingSafeHashEqual(h, "" as any)).toBe(false);
    expect(timingSafeHashEqual("abc", h)).toBe(false); // length mismatch, no throw
  });

  it("masks codes so the plaintext is never reconstructable from the display value", () => {
    const masked = maskReleaseCode("ABCD2345");
    expect(masked).not.toContain("ABCD");
    expect(masked.endsWith("45")).toBe(true);
    expect(maskReleaseCode("XY")).toBe("••••••");
  });

  it("redactReleaseCode strips the secret verifier (codeHash) before it leaves the server", () => {
    const row = {
      id: 1,
      assetId: 1,
      authorizationId: 1,
      code: "••••••45",
      codeHash: hashReleaseCode("ABCD2345"),
      status: "active",
    } as unknown as ReleaseCode;
    const safe = redactReleaseCode(row);
    expect((safe as any).codeHash).toBeUndefined();
    expect(safe.code).toBe("••••••45");
    expect(safe.status).toBe("active");
  });
});
