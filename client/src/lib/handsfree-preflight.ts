export const PREFLIGHT_MIN_DURATION_SEC = 30;
export const PREFLIGHT_MAX_AGE_HOURS = 24;
export const PREFLIGHT_MAX_DISTANCE_M = 500;

export interface PreflightInput {
  durationSec?: number;
  capturedAt?: Date;
  fileLastModified?: Date;
  clipGps?: { lat: number; lng: number };
  jobLat?: number | null;
  jobLng?: number | null;
  now?: Date;
}

export interface PreflightResult {
  warnings: string[];
  durationSec?: number;
  fileLastModified?: string;
  capturedAt?: string;
  ageHours?: number;
  distanceMeters?: number;
  gpsSource?: "clip" | "none";
  // Coordinates pulled from the file's container metadata (moov ISO-6709),
  // when present. Surfaced so reviewers can see what the file itself claims,
  // independent of the device's live GPS at upload time.
  clipGps?: { lat: number; lng: number };
}

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function evaluatePreflight(input: PreflightInput): PreflightResult {
  const now = input.now ?? new Date();
  const warnings: string[] = [];
  const result: PreflightResult = { warnings, gpsSource: "none" };

  const ageSource = input.capturedAt ?? input.fileLastModified;
  if (input.fileLastModified) {
    result.fileLastModified = input.fileLastModified.toISOString();
  }
  if (input.capturedAt) {
    result.capturedAt = input.capturedAt.toISOString();
  }
  if (ageSource) {
    const ageHours = (now.getTime() - ageSource.getTime()) / 3_600_000;
    result.ageHours = Math.round(ageHours * 10) / 10;
    if (ageHours > PREFLIGHT_MAX_AGE_HOURS) {
      warnings.push(
        `Clip looks ${Math.round(ageHours)}h old (older than the ${PREFLIGHT_MAX_AGE_HOURS}h cutoff).`,
      );
    }
  }

  if (typeof input.durationSec === "number" && Number.isFinite(input.durationSec)) {
    result.durationSec = Math.round(input.durationSec);
    if (input.durationSec < PREFLIGHT_MIN_DURATION_SEC) {
      warnings.push(
        `Clip is only ${Math.round(input.durationSec)}s long (minimum ${PREFLIGHT_MIN_DURATION_SEC}s recommended).`,
      );
    }
  }

  if (input.clipGps) {
    result.clipGps = { lat: input.clipGps.lat, lng: input.clipGps.lng };
    result.gpsSource = "clip";
    if (typeof input.jobLat === "number" && typeof input.jobLng === "number") {
      const dist = haversineMeters(input.clipGps, { lat: input.jobLat, lng: input.jobLng });
      result.distanceMeters = Math.round(dist);
      if (dist > PREFLIGHT_MAX_DISTANCE_M) {
        warnings.push(
          `Clip's embedded GPS is ${Math.round(dist)}m from the job site (further than ${PREFLIGHT_MAX_DISTANCE_M}m).`,
        );
      }
    }
  }

  return result;
}
