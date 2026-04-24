// Job-response sanitization shared by every read/mutation endpoint that
// returns a Job. Fields that reveal the poster's pricing intent (auto-
// increase ladder, suggested boost) or internal admin state are stripped
// for everyone except the poster and admins. This file is kept tiny and
// dependency-free so it can be unit-tested without spinning up Express.

export const POSTER_ONLY_PRICE_FIELDS = [
  "autoIncreaseEnabled",
  "autoIncreaseAmount",
  "autoIncreaseMax",
  "autoIncreaseIntervalMins",
  "nextIncreaseAt",
  "boostSuggested",
  "suggestedBudget",
] as const;

export const POSTER_ONLY_INTERNAL_FIELDS = [
  "removedByAdminReason",
  "stuckAcknowledgedAt",
  "stuckAcknowledgedBy",
  "stripePaymentIntentId",
  "stripeSessionId",
  "stripeChargeId",
  "stripeTransferId",
  "disputeNotes",
  "cancelNotes",
] as const;

const LOCKED_STATUSES = new Set([
  "funded",
  "active",
  "in_progress",
  "completion_submitted",
  "proof_submitted",
]);

function fuzzCoordinate(coord: number | null | undefined): number | null {
  if (coord == null) return null;
  // ±0.005 deg ≈ ±550m — enough to obscure exact address while keeping
  // the pin in the right neighborhood for browse views.
  const offset = (Math.random() - 0.5) * 0.01;
  return Math.round((coord + offset) * 10000) / 10000;
}

export function stripPosterOnlyFields(job: any) {
  const out: any = { ...job };
  for (const f of POSTER_ONLY_PRICE_FIELDS) delete out[f];
  for (const f of POSTER_ONLY_INTERNAL_FIELDS) delete out[f];
  return out;
}

export function sanitizeJobForPublic(
  job: any,
  viewerId: number | undefined,
  isAdmin: boolean = false,
) {
  const isOwner = viewerId === job.postedById;
  const isHelper = viewerId === job.assignedHelperId;
  const isLocked = LOCKED_STATUSES.has(job.status);

  const { platformFee, ...publicJob } = job;

  // Admins always see the full job (pricing + internal fields) so admin
  // dashboards and dispute tools work correctly.
  if (isAdmin) return publicJob;

  // Owner sees everything (including auto-increase config and admin internals).
  if (isOwner) {
    if (isLocked) return publicJob;
    return { ...publicJob, lat: fuzzCoordinate(job.lat), lng: fuzzCoordinate(job.lng) };
  }

  // Assigned helper sees real coords + payout, but NOT poster's price-intent
  // fields (so a worker can't see how high the budget will climb if they stall).
  if (isHelper) {
    const stripped = stripPosterOnlyFields(publicJob);
    if (isLocked) return stripped;
    return { ...stripped, lat: fuzzCoordinate(job.lat), lng: fuzzCoordinate(job.lng) };
  }

  // Strangers / browsing workers — strip pricing-intent + internal + payout
  // + exact location.
  const stripped = stripPosterOnlyFields(publicJob);
  return {
    ...stripped,
    helperPayout: undefined,
    location: job.locationApprox || "Approximate location",
    lat: fuzzCoordinate(job.lat),
    lng: fuzzCoordinate(job.lng),
  };
}
