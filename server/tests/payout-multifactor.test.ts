import { describe, it, expect } from "vitest";
import { evaluatePayoutMultiFactor } from "../payout-guard";

// Anti-fraud invariant: GPS proximity ALONE must never authorize a payout.
// Release requires all three factors: GPS proximity verified + worker submitted
// completion + (customer confirmation OR photo/video artifact).

const NYC = { lat: 40.7128, lng: -74.006 };

function baseJob(overrides: Record<string, any> = {}) {
  return {
    lat: NYC.lat,
    lng: NYC.lng,
    arrivedAt: null,
    workerArrivedAt: null,
    geofenceVerifiedAt: null,
    proofRequired: true,
    ...overrides,
  };
}

describe("evaluatePayoutMultiFactor", () => {
  it("BLOCKS payout on GPS proximity alone (no completion, no confirmation)", () => {
    const r = evaluatePayoutMultiFactor({
      job: baseJob({ geofenceVerifiedAt: new Date() }),
      proofs: [],
      helperConfirmed: false,
      customerConfirmed: false,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("provider_completion_missing");
    expect(r.reasons).toContain("no_customer_confirmation_or_photo");
  });

  it("BLOCKS when GPS proximity was never verified for an in-person job", () => {
    const r = evaluatePayoutMultiFactor({
      job: baseJob(), // no arrivedAt / geofenceVerifiedAt
      proofs: [{ imageUrls: ["a.jpg"] }],
      helperConfirmed: true,
      customerConfirmed: true,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("gps_proximity_unverified");
  });

  it("ALLOWS payout: GPS verified + completion + customer confirmation", () => {
    const r = evaluatePayoutMultiFactor({
      job: baseJob({ arrivedAt: new Date() }),
      proofs: [],
      helperConfirmed: true,
      customerConfirmed: true,
    });
    expect(r.ok).toBe(true);
    expect(r.reasons).toHaveLength(0);
  });

  it("ALLOWS payout: GPS verified + completion + photo artifact (no customer confirm)", () => {
    const r = evaluatePayoutMultiFactor({
      job: baseJob({ geofenceVerifiedAt: new Date() }),
      proofs: [{ imageUrls: ["proof1.jpg"] }],
      helperConfirmed: true,
      customerConfirmed: false,
    });
    expect(r.ok).toBe(true);
    expect(r.factors.hasPhotoArtifact).toBe(true);
  });

  it("ALLOWS payout: video artifact satisfies the confirmation factor", () => {
    const r = evaluatePayoutMultiFactor({
      job: baseJob({ arrivedAt: new Date() }),
      proofs: [{ videoUrl: "clip.mp4" }],
      helperConfirmed: true,
      customerConfirmed: false,
    });
    expect(r.ok).toBe(true);
  });

  it("does NOT count a not-encountered report as a photo artifact", () => {
    const r = evaluatePayoutMultiFactor({
      job: baseJob({ geofenceVerifiedAt: new Date() }),
      proofs: [{ notEncountered: true, imageUrls: ["x.jpg"] }],
      helperConfirmed: true,
      customerConfirmed: false,
    });
    expect(r.factors.hasPhotoArtifact).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("no_customer_confirmation_or_photo");
  });

  it("exempts online/legacy jobs (no real coords) from the GPS factor", () => {
    const r = evaluatePayoutMultiFactor({
      job: baseJob({ lat: null, lng: null }),
      proofs: [],
      helperConfirmed: true,
      customerConfirmed: true,
    });
    expect(r.factors.gpsProximityVerified).toBe(true);
    expect(r.ok).toBe(true);
  });

  it("treats (0,0) coordinates as no-coords (not a real geofence)", () => {
    const r = evaluatePayoutMultiFactor({
      job: baseJob({ lat: 0, lng: 0 }),
      proofs: [],
      helperConfirmed: true,
      customerConfirmed: true,
    });
    expect(r.factors.hasRealCoords).toBe(false);
    expect(r.ok).toBe(true);
  });

  it("BLOCKS when worker never submitted completion even with full confirmation", () => {
    const r = evaluatePayoutMultiFactor({
      job: baseJob({ arrivedAt: new Date() }),
      proofs: [{ imageUrls: ["a.jpg"] }],
      helperConfirmed: false,
      customerConfirmed: true,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("provider_completion_missing");
  });
});
