// Helpers for the structured "no-chat" job coordination flow.
//
// GUBER deliberately has no direct chat between hirer and worker. All
// coordination happens through structured availability windows, time
// selections, and confirm/reject buttons. This file owns the validation
// logic for those structured payloads so it can be unit-tested without
// pulling in Express or the database.
//
// Flow at a glance:
//   1. Poster posts job with one or more availabilityWindows.
//   2. Worker accepts → schedule_status = pending_worker_time.
//   3. Worker picks a slot inside one of those windows
//      → schedule_status = pending_poster_confirmation.
//   4. Poster confirms → schedule_status = scheduled, proof window computed,
//      address_unlocked = true.
//      OR poster rejects → schedule_status = pending_worker_time (worker picks again).
//      OR poster suggests a different window → schedule_status = poster_suggested_window.
//   5. Worker accepts/rejects the suggestion (still no free typing).

export type AvailabilityWindow = {
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM (24h)
  endTime: string;    // HH:MM (24h)
};

export type TimeSelection = {
  // Either "exact" with a single instant, or "window" with a 30-min range.
  mode: "exact" | "window";
  arrivalTime: string;       // ISO timestamp
  arrivalWindowEnd?: string; // ISO timestamp (only for mode="window")
};

// ── Schedule status state machine ──────────────────────────────────────────
// Plain strings for DB storage; this enum just enumerates the legal values.
export const SCHEDULE_STATUS = {
  PENDING_WORKER_TIME: "pending_worker_time",
  PENDING_POSTER_CONFIRMATION: "pending_poster_confirmation",
  POSTER_SUGGESTED_WINDOW: "poster_suggested_window",
  SCHEDULED: "scheduled",
} as const;
export type ScheduleStatus = typeof SCHEDULE_STATUS[keyof typeof SCHEDULE_STATUS];

// ── Timing constants (per spec parts 3, 5) ─────────────────────────────────
export const TIMING = {
  PROOF_WINDOW_BEFORE_MIN: 15,    // Proof valid from scheduled - 15 min ...
  PROOF_WINDOW_AFTER_MIN: 30,     // ... through scheduled + 30 min.
  POSTER_CONFIRM_TIMEOUT_MIN: 30, // Worker may cancel without penalty after 30 min.
  WORKER_PICK_TIMEOUT_MIN: 15,    // Job re-opens if worker doesn't pick within 15 min.
  MAX_RESCHEDULES_PER_SIDE: 1,    // Each side gets one free reschedule (spec part 6).
} as const;

// ── Validators ─────────────────────────────────────────────────────────────

export function validateAvailabilityWindow(w: any): w is AvailabilityWindow {
  if (!w || typeof w !== "object") return false;
  if (typeof w.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(w.date)) return false;
  if (typeof w.startTime !== "string" || !/^\d{2}:\d{2}$/.test(w.startTime)) return false;
  if (typeof w.endTime !== "string" || !/^\d{2}:\d{2}$/.test(w.endTime)) return false;
  // End must be strictly after start within the same day.
  if (w.startTime >= w.endTime) return false;
  return true;
}

export function validateAvailabilityWindows(arr: any): arr is AvailabilityWindow[] {
  return Array.isArray(arr) && arr.length > 0 && arr.every(validateAvailabilityWindow);
}

/**
 * Convert a {date, startTime, endTime} window into absolute Date instances.
 * Always interpreted in the server's local timezone — both Pg `timestamp`
 * (no tz) and the in-memory comparison stay consistent that way.
 */
export function windowToDateRange(w: AvailabilityWindow): { start: Date; end: Date } {
  const [sh, sm] = w.startTime.split(":").map(Number);
  const [eh, em] = w.endTime.split(":").map(Number);
  const [y, mo, d] = w.date.split("-").map(Number);
  const start = new Date(y, (mo ?? 1) - 1, d ?? 1, sh ?? 0, sm ?? 0, 0, 0);
  const end = new Date(y, (mo ?? 1) - 1, d ?? 1, eh ?? 0, em ?? 0, 0, 0);
  return { start, end };
}

/** Worker's chosen arrival time must lie inside one of the poster's windows. */
export function isInsideAnyWindow(arrival: Date, windows: AvailabilityWindow[]): boolean {
  if (isNaN(arrival.getTime())) return false;
  return windows.some(w => {
    const { start, end } = windowToDateRange(w);
    return arrival >= start && arrival <= end;
  });
}

/** Compute the proof window from the confirmed scheduled time. */
export function computeProofWindow(scheduledAt: Date): { start: Date; end: Date } {
  return {
    start: new Date(scheduledAt.getTime() - TIMING.PROOF_WINDOW_BEFORE_MIN * 60_000),
    end: new Date(scheduledAt.getTime() + TIMING.PROOF_WINDOW_AFTER_MIN * 60_000),
  };
}

/** Tag a proof submission relative to the scheduled time. */
export function classifyProofTiming(
  submittedAt: Date,
  scheduledAt: Date,
): "early" | "on_time" | "late" | "out_of_window" {
  const { start, end } = computeProofWindow(scheduledAt);
  if (submittedAt < start) return "out_of_window";
  if (submittedAt > end) return "out_of_window";
  // Within ±5 min of scheduled = "on_time"; earlier = "early"; later = "late".
  const ms = submittedAt.getTime() - scheduledAt.getTime();
  if (Math.abs(ms) <= 5 * 60_000) return "on_time";
  return ms < 0 ? "early" : "late";
}

/** Address/exact-coords are exposed only after all three gates pass. */
export function isAddressUnlocked(job: {
  paymentAuthorized?: boolean | null;
  assignedHelperId?: number | null;
  scheduleStatus?: string | null;
  // Legacy fallback: pre-existing flows also unlock once the job is funded.
  status?: string | null;
}): boolean {
  if (job.paymentAuthorized && job.assignedHelperId && job.scheduleStatus === "scheduled") {
    return true;
  }
  // Backward compatibility with the legacy lock/funded flow.
  const LEGACY_UNLOCKED = new Set(["funded", "active", "in_progress", "completion_submitted", "proof_submitted"]);
  return !!(job.status && LEGACY_UNLOCKED.has(job.status));
}

/** Validate a structured time selection from the worker. */
export function parseTimeSelection(raw: any): { ok: true; selection: TimeSelection } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid time selection" };
  const mode = raw.mode;
  if (mode !== "exact" && mode !== "window") return { ok: false, error: "mode must be 'exact' or 'window'" };
  const arrival = raw.arrivalTime ? new Date(raw.arrivalTime) : null;
  if (!arrival || isNaN(arrival.getTime())) return { ok: false, error: "Invalid arrivalTime" };
  if (mode === "window") {
    const end = raw.arrivalWindowEnd ? new Date(raw.arrivalWindowEnd) : null;
    if (!end || isNaN(end.getTime())) return { ok: false, error: "Invalid arrivalWindowEnd" };
    if (end <= arrival) return { ok: false, error: "arrivalWindowEnd must be after arrivalTime" };
    // Hard cap so a worker can't claim a 6-hour "window".
    if (end.getTime() - arrival.getTime() > 60 * 60_000) {
      return { ok: false, error: "Arrival window cannot exceed 60 minutes" };
    }
    return { ok: true, selection: { mode: "window", arrivalTime: arrival.toISOString(), arrivalWindowEnd: end.toISOString() } };
  }
  return { ok: true, selection: { mode: "exact", arrivalTime: arrival.toISOString() } };
}
