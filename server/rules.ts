export const RULES = {
  STANDARD_GRACE_HOURS: 72,
  URGENT_GRACE_HOURS: 8,
  SCHEDULED_LOCK_HOURS_BEFORE: 2,

  EARLY_EXIT_FEE_PCT: 0.20,

  NO_SHOW_STRIKE_30D_THRESHOLD: 2,
  CANCEL_AFTER_OTW_30D_THRESHOLD: 3,

  RELIABLE_MIN_COMPLETED: 20,
  RELIABLE_MIN_ONTIME_PCT: 90,
  RELIABLE_MAX_CANCEL_RATE: 0.10,
} as const;

export type JobType = "urgent" | "standard" | "scheduled";
export type JobStatus =
  | "draft" | "open" | "accepted" | "in_progress" | "arrived"
  | "proof_submitted" | "completed" | "cancelled" | "expired" | "under_review";

export type StatusEventType =
  | "created" | "paid" | "opened" | "accepted"
  | "on_the_way" | "arrived" | "proof_submitted" | "completed"
  | "cancelled_by_helper" | "cancelled_by_poster" | "expired" | "flagged_under_review";

export type CancelReason =
  | "VEHICLE_ISSUE" | "EMERGENCY" | "SAFETY" | "WRONG_DETAILS"
  | "POSTER_UNRESPONSIVE" | "OTHER";

export function computeGraceEndsAt({ jobType, scheduledAt }: { jobType: string | null; scheduledAt?: Date | null }): Date {
  const now = new Date();
  if (jobType === "urgent") {
    return new Date(now.getTime() + RULES.URGENT_GRACE_HOURS * 60 * 60 * 1000);
  }
  if (jobType === "scheduled" && scheduledAt) {
    return new Date(scheduledAt.getTime() - RULES.SCHEDULED_LOCK_HOURS_BEFORE * 60 * 60 * 1000);
  }
  return new Date(now.getTime() + RULES.STANDARD_GRACE_HOURS * 60 * 60 * 1000);
}

export function computeExpiresAt({ jobType, scheduledAt }: { jobType: string | null; scheduledAt?: Date | null }): Date {
  const now = new Date();
  if (jobType === "urgent") {
    return new Date(now.getTime() + RULES.URGENT_GRACE_HOURS * 60 * 60 * 1000);
  }
  if (jobType === "scheduled" && scheduledAt) {
    return scheduledAt;
  }
  return new Date(now.getTime() + RULES.STANDARD_GRACE_HOURS * 60 * 60 * 1000);
}
