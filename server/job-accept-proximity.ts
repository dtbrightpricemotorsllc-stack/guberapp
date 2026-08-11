/**
 * job-accept-proximity.ts
 *
 * Proximity gate for POST /api/jobs/:id/accept.
 *
 * Rules:
 *   - ASAP, urgent-switch, and On-Demand Help jobs require the worker to be
 *     within 20 miles of the job location (when both sets of coordinates are
 *     present).
 *   - Scheduled / appointment jobs are unconditionally exempt — a specialist
 *     may be anywhere when they pre-book a future slot.
 *   - If either the job or the worker has no GPS coordinates the gate is
 *     skipped (fail-open so missing coords never block legitimate workers).
 */

export const TWENTY_MILES_METERS = 32_187; // 20 × 1609.344 m/mile, rounded up

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns true for jobs that need the proximity gate:
 *   - urgentSwitch flag is set, OR
 *   - category is "On-Demand Help", OR
 *   - jobDetails.timeType is "ASAP"
 *
 * All other jobs (scheduled appointments, standard fixed-time jobs, etc.)
 * return false and are unconditionally exempt.
 */
export function isAsapOrOnDemandJob(job: {
  urgentSwitch?: boolean | null;
  category?: string | null;
  jobDetails?: Record<string, unknown> | null;
}): boolean {
  if (job.urgentSwitch === true) return true;
  if (job.category === "On-Demand Help") return true;
  const details = job.jobDetails as Record<string, unknown> | null | undefined;
  if (details?.timeType === "ASAP") return true;
  return false;
}

/**
 * Returns true iff v is a finite number within [min, max].
 *
 * Guards against the cases where JSON.parse accepts a string value that
 * JavaScript coerces to NaN or Infinity inside arithmetic, turning
 * `NaN > TWENTY_MILES_METERS` silently into false and bypassing the gate.
 */
function isValidCoord(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

/**
 * Check whether the worker is within 20 miles of an ASAP/on-demand job.
 *
 * Returns an error payload to send as a 403 response, or null if the accept
 * should proceed unimpeded.
 *
 * Coordinate validation rules (applied before any arithmetic):
 *   - Both values must be typeof number (not strings, booleans, or objects).
 *   - Both must be finite (rejects NaN and ±Infinity from coercion or bad input).
 *   - Latitude must be in [-90, 90]; longitude in [-180, 180].
 *   - Any invalid or missing pair is treated as "coords absent" → fail-open.
 *
 * Fail-open policy: if either set of coordinates is absent or invalid the gate
 * is skipped. This is intentional — a worker must never be blocked solely
 * because GPS was unavailable on their device. The gate is an extra safeguard,
 * not a hard authentication boundary.
 */
export function checkProximityGate(
  job: {
    urgentSwitch?: boolean | null;
    category?: string | null;
    jobDetails?: Record<string, unknown> | null;
    lat?: unknown;
    lng?: unknown;
  },
  workerLat: unknown,
  workerLng: unknown,
): { message: string; detail: string } | null {
  // Scheduled / appointment jobs are unconditionally exempt.
  if (!isAsapOrOnDemandJob(job)) return null;

  // Validate job coordinates (from DB — should always be valid, but guard anyway).
  if (!isValidCoord(job.lat, -90, 90) || !isValidCoord(job.lng, -180, 180)) {
    return null;
  }

  // Validate worker-supplied coordinates against strict numeric/range rules.
  // Non-numeric types, NaN, Infinity, or out-of-range values all fail-open.
  if (!isValidCoord(workerLat, -90, 90) || !isValidCoord(workerLng, -180, 180)) {
    return null;
  }

  const distMeters = haversineMeters(job.lat, job.lng, workerLat, workerLng);
  if (distMeters > TWENTY_MILES_METERS) {
    return {
      message: "OUTSIDE_AREA",
      detail: "You are more than 20 miles from this job location.",
    };
  }
  return null;
}
