// Job-response sanitization shared by every read/mutation endpoint that
// returns a Job. Fields that reveal the poster's pricing intent (auto-
// increase ladder, suggested boost) or internal admin state are stripped
// for everyone except the poster and admins. This file is kept tiny and
// dependency-free so it can be unit-tested without spinning up Express.

import { createHash } from "crypto";

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

// Coordination metadata that participants (poster + assigned worker) need to
// drive the structured no-chat scheduling flow but that strangers / browsing
// workers should never see — it leaks the participants' availability,
// scheduling intent, and reschedule history.
export const PARTICIPANT_ONLY_COORDINATION_FIELDS = [
  "availabilityWindows",
  "selectedWorkerTime",
  "selectedArrivalWindowStart",
  "selectedArrivalWindowEnd",
  "scheduleStatus",
  "posterConfirmedTime",
  "lastTimeSelectionAt",
  "workerAcceptedAt",
  "rescheduleSuggestedWindow",
  "rescheduleRequestedBy",
  "rescheduleCountPoster",
  "rescheduleCountWorker",
  "workerOnMyWayAt",
  "workerArrivedAt",
  "arrivalGpsLat",
  "arrivalGpsLng",
  "arrivalVerified",
  "paymentAuthorized",
  "addressUnlocked",
  "navigationUnlocked",
  "proofWindowStart",
  "proofWindowEnd",
  "urgentArrivalDeadline",
  "jobAtRisk",
  "disputeStatus",
] as const;

const LOCKED_STATUSES = new Set([
  "funded",
  "active",
  "in_progress",
  "completion_submitted",
  "proof_submitted",
]);

// Salt for the deterministic coordinate hash. Using a server secret means an
// attacker cannot precompute the offset for arbitrary (jobId, coord) pairs.
// Falls back to a build-time string so tests still work without secrets.
const COORD_SALT =
  process.env.SESSION_SECRET ||
  process.env.JWT_SECRET ||
  "guber-coord-fuzz-salt-v1";

/**
 * Deterministically masks a coordinate for a given job. Repeated calls with
 * the same (jobId, axis, coord) return the *same* offset, so an attacker
 * cannot average many polled responses to recover the true location.
 *
 * Offset range: ±0.005° (~±550m), enough to hide the exact address while
 * keeping the pin in the right neighborhood for browse views.
 */
function fuzzCoordinate(
  coord: number | null | undefined,
  jobId: number | string | undefined,
  axis: "lat" | "lng",
): number | null {
  if (coord == null) return null;
  // When jobId is missing (shouldn't happen in practice), still mask but
  // seed off the coordinate itself so we stay deterministic.
  const seed = `${COORD_SALT}::${jobId ?? "anon"}::${axis}`;
  const hash = createHash("sha256").update(seed).digest();
  // Map the first 4 bytes to a fraction in [0, 1) → offset in [-0.005, +0.005].
  const n = hash.readUInt32BE(0) / 0x1_0000_0000;
  const offset = (n - 0.5) * 0.01;
  return Math.round((coord + offset) * 10000) / 10000;
}

export function stripPosterOnlyFields(job: any) {
  const out: any = { ...job };
  for (const f of POSTER_ONLY_PRICE_FIELDS) delete out[f];
  for (const f of POSTER_ONLY_INTERNAL_FIELDS) delete out[f];
  return out;
}

/** Strip the structured-coordination metadata that only participants need. */
export function stripParticipantOnlyCoordinationFields(job: any) {
  const out: any = { ...job };
  for (const f of PARTICIPANT_ONLY_COORDINATION_FIELDS) delete out[f];
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
    return {
      ...publicJob,
      lat: fuzzCoordinate(job.lat, job.id, "lat"),
      lng: fuzzCoordinate(job.lng, job.id, "lng"),
    };
  }

  // Assigned helper sees real coords + payout, but NOT poster's price-intent
  // fields (so a worker can't see how high the budget will climb if they stall).
  if (isHelper) {
    const stripped = stripPosterOnlyFields(publicJob);
    if (isLocked) return stripped;
    return {
      ...stripped,
      lat: fuzzCoordinate(job.lat, job.id, "lat"),
      lng: fuzzCoordinate(job.lng, job.id, "lng"),
    };
  }

  // Strangers / browsing workers — strip pricing-intent + internal + payout
  // + exact location + structured-coordination metadata (availability windows,
  // selected times, reschedule history, GPS arrival, gating flags). They can
  // see the job exists but never see how the participants are coordinating.
  const stripped = stripParticipantOnlyCoordinationFields(stripPosterOnlyFields(publicJob));
  return {
    ...stripped,
    helperPayout: undefined,
    location: job.locationApprox || "Approximate location",
    lat: fuzzCoordinate(job.lat, job.id, "lat"),
    lng: fuzzCoordinate(job.lng, job.id, "lng"),
  };
}
