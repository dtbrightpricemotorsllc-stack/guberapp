// ── Anti-fraud payout guardrail ───────────────────────────────────────────
// Centralizes the multi-factor check that MUST pass before any Stripe capture /
// transfer releases funds to a worker. The cardinal rule: raw GPS proximity
// NEVER releases money on its own (location can be spoofed). GPS is used only to
// *verify and log* that the worker reached the job geofence. Releasing funds
// additionally requires the worker to manually submit completion in-app AND a
// confirmation step — either the customer confirming, or a photo/video proof
// artifact on file.
//
// All three factors must hold:
//   1. gpsProximityVerified      — worker reached the geofence (or the job has no
//                                  real coordinates, e.g. online/legacy jobs).
//   2. providerSubmittedCompletion — worker confirmed completion in-app.
//   3. confirmationFactor        — customer confirmed OR a photo/video artifact
//                                  exists.

export interface PayoutMultiFactorInput {
  job: {
    lat?: number | null;
    lng?: number | null;
    arrivedAt?: Date | string | null;
    workerArrivedAt?: Date | string | null;
    geofenceVerifiedAt?: Date | string | null;
    proofRequired?: boolean | null;
  };
  proofs: Array<{
    notEncountered?: boolean | null;
    imageUrls?: string[] | null;
    videoUrl?: string | null;
  }>;
  /** Worker manually submitted/confirmed completion in-app. */
  helperConfirmed: boolean;
  /** Customer confirmed OR the platform auto-confirmed after the review window. */
  customerConfirmed: boolean;
}

export interface PayoutMultiFactorResult {
  ok: boolean;
  factors: {
    gpsProximityVerified: boolean;
    providerSubmittedCompletion: boolean;
    confirmationFactor: boolean;
    hasPhotoArtifact: boolean;
    hasRealCoords: boolean;
  };
  reasons: string[];
}

export function evaluatePayoutMultiFactor(
  input: PayoutMultiFactorInput,
): PayoutMultiFactorResult {
  const { job, proofs, helperConfirmed, customerConfirmed } = input;

  // Treat (0,0) as "no coordinates" — legacy / online jobs sometimes store
  // (0,0) instead of null, and those should not be geofenced.
  const hasRealCoords =
    typeof job.lat === "number" &&
    typeof job.lng === "number" &&
    !(job.lat === 0 && job.lng === 0);

  // GPS factor: a geofence/arrival verification must exist for in-person jobs.
  // Online/legacy jobs with no real coordinates are exempt.
  const gpsProximityVerified =
    !hasRealCoords ||
    !!job.arrivedAt ||
    !!job.workerArrivedAt ||
    !!job.geofenceVerifiedAt;

  const providerSubmittedCompletion = !!helperConfirmed;

  const hasPhotoArtifact = (proofs || []).some(
    (p) =>
      !p?.notEncountered &&
      ((Array.isArray(p?.imageUrls) && p.imageUrls.length > 0) || !!p?.videoUrl),
  );

  // Confirmation step: customer confirmation OR a photo/video artifact.
  const confirmationFactor = !!customerConfirmed || hasPhotoArtifact;

  const reasons: string[] = [];
  if (!gpsProximityVerified) reasons.push("gps_proximity_unverified");
  if (!providerSubmittedCompletion) reasons.push("provider_completion_missing");
  if (!confirmationFactor) reasons.push("no_customer_confirmation_or_photo");

  return {
    ok: reasons.length === 0,
    factors: {
      gpsProximityVerified,
      providerSubmittedCompletion,
      confirmationFactor,
      hasPhotoArtifact,
      hasRealCoords,
    },
    reasons,
  };
}
