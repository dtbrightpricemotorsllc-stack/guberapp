// ─────────────────────────────────────────────────────────────────────────
// GUBER Dispute & Payout Protection — shared constants & helpers
// Centralised so server, cron, and client all read the same values/copy.
// (Task #317)
// ─────────────────────────────────────────────────────────────────────────

import { z } from "zod";

// 8-value structured issue type taxonomy.
export const DISPUTE_ISSUE_TYPES = [
  "job_not_completed",
  "poor_quality",
  "missing_proof",
  "wrong_location",
  "unsafe_behavior",
  "damage_claim",
  "payment_problem",
  "other",
] as const;

export type DisputeIssueType = typeof DISPUTE_ISSUE_TYPES[number];

export const DISPUTE_ISSUE_TYPE_LABELS: Record<DisputeIssueType, string> = {
  job_not_completed: "Job not completed",
  poor_quality: "Poor quality",
  missing_proof: "Missing proof / photos",
  wrong_location: "Wrong location",
  unsafe_behavior: "Unsafe behavior",
  damage_claim: "Damage claim",
  payment_problem: "Payment problem",
  other: "Other",
};

export const disputeIssueTypeSchema = z.enum(DISPUTE_ISSUE_TYPES);

// Admin actions on a dispute.
export const ADMIN_DISPUTE_DECISIONS = [
  "release_payout",
  "refund_poster",
  "partial",
  "request_more_info",
  "close_no_action",
  "flag_user",
  "suspend_user",
] as const;

export type AdminDisputeDecision = typeof ADMIN_DISPUTE_DECISIONS[number];

export const adminDisputeDecisionSchema = z.enum(ADMIN_DISPUTE_DECISIONS);

// Internal payout-status mirror (does NOT drive Stripe).
export const INTERNAL_PAYOUT_STATUSES = [
  "pending_confirmation",
  "approved",
  "on_hold",
  "released",
  "refunded",
  "partial_release",
] as const;
export type InternalPayoutStatus = typeof INTERNAL_PAYOUT_STATUSES[number];

// User risk levels.
export const RISK_LEVELS = ["normal", "watch", "restricted", "suspended"] as const;
export type RiskLevel = typeof RISK_LEVELS[number];

// Helper response window.
export const HELPER_RESPONSE_WINDOW_HOURS = 24;

// Risk-signal thresholds at which `normal` is auto-bumped to `watch`.
// Higher levels (restricted, suspended) only ever come from explicit admin action.
export const RISK_WATCH_THRESHOLDS = {
  jobsDisputed: 2,
  noShowCount: 2,
  missingProofCount: 2,
  bypassAttemptCount: 1,
  falseClaimFlagCount: 1,
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Category-aware auto-confirm window.
// simple jobs: 24h, skilled labor: 48h, V&I: 24h, high-value: 72h.
// ─────────────────────────────────────────────────────────────────────────

export const AUTO_CONFIRM_WINDOW_HOURS = {
  simple: 24,
  skilled: 48,
  verifyInspect: 24,
  highValue: 72,
} as const;

export const HIGH_VALUE_BUDGET_THRESHOLD = 500;

const SKILLED_CATEGORIES = new Set([
  "skilled labor",
  "skilled-labor",
  "skilled",
  "trades",
  "professional",
  "professional services",
  "automotive",
  "auto",
  "roadside",
  "construction",
]);

const VI_CATEGORIES = new Set([
  "verify & inspect",
  "verify and inspect",
  "v&i",
  "vi",
]);

/**
 * Returns the category-aware auto-confirm window (hours).
 * Fixed windows per spec: high-value beats category; otherwise V&I=24h,
 * skilled=48h, everything else (simple) = 24h. The `fallbackHours` argument
 * is ONLY used when no rule matches and the caller still wants a platform-
 * configured default for legacy/unknown categories — it never overrides a
 * matched fixed window.
 */
export function autoConfirmHoursFor(job: {
  category?: string | null;
  jobType?: string | null;
  budget?: number | null;
}, fallbackHours: number = AUTO_CONFIRM_WINDOW_HOURS.simple): number {
  const budget = Number(job.budget || 0);
  if (budget >= HIGH_VALUE_BUDGET_THRESHOLD) return AUTO_CONFIRM_WINDOW_HOURS.highValue;

  const cat = (job.category || "").toLowerCase().trim();
  const jt = (job.jobType || "").toLowerCase().trim();

  if (VI_CATEGORIES.has(cat) || jt.includes("verify") || jt.includes("inspect")) {
    return AUTO_CONFIRM_WINDOW_HOURS.verifyInspect;
  }
  if (SKILLED_CATEGORIES.has(cat) || /skill|trade|automotive|roadside|construction/.test(jt)) {
    return AUTO_CONFIRM_WINDOW_HOURS.skilled;
  }
  // Simple / unmatched category: honour the platform-configured fallback
  // (e.g. `review_timer_hours` from platform settings) but never let it
  // exceed the spec ceiling of 24h for simple jobs.
  if (fallbackHours && fallbackHours > 0) {
    return Math.min(fallbackHours, AUTO_CONFIRM_WINDOW_HOURS.simple);
  }
  return AUTO_CONFIRM_WINDOW_HOURS.simple;
}

/** Returns true when a job is in a Verify & Inspect category. */
export function isVerifyInspectJob(job: { category?: string | null; jobType?: string | null }): boolean {
  const cat = (job.category || "").toLowerCase().trim();
  const jt = (job.jobType || "").toLowerCase().trim();
  return VI_CATEGORIES.has(cat) || jt.includes("verify") || jt.includes("inspect");
}

/** Returns true when a job is automotive / roadside / vehicle. */
export function isAutomotiveJob(job: { category?: string | null; jobType?: string | null; serviceType?: string | null; verifyInspectCategory?: string | null }): boolean {
  const blob = [job.category, job.jobType, job.serviceType, job.verifyInspectCategory]
    .map((s) => (s || "").toLowerCase())
    .join(" ");
  return /\b(auto|automotive|roadside|vehicle|car|truck|tire|battery|jump|tow)\b/.test(blob);
}

// ─────────────────────────────────────────────────────────────────────────
// Spec copy — single source of truth for user/admin-facing dispute strings.
// (Proof-based wording only — no insurance / guarantee / warranty language.)
// ─────────────────────────────────────────────────────────────────────────

export const DISPUTE_COPY = {
  posterReviewTitle: "Review the completed job",
  posterReviewBody:
    "Please review the completed work and any proof submitted. Confirm completion to release payment to the worker, or report an issue if something doesn't match what was agreed.",
  posterConfirmButton: "Confirm Completion",
  posterReportIssueButton: "Report Issue",

  reportModalTitle: "Report an issue",
  reportModalIntro:
    "Tell GUBER what went wrong. Choose an issue type, add details, and attach photos, video, or screenshots if you have them. The worker will be given 24 hours to respond before GUBER reviews.",
  reportTypeLabel: "Issue type",
  reportTypePlaceholder: "Select an issue type…",
  reportDetailsLabel: "Explain what happened",
  reportDetailsPlaceholder:
    "Describe the issue in your own words. Include what was agreed, what happened, and what's missing or wrong.",
  reportEvidenceLabel: "Photo / video / screenshot evidence (optional)",
  reportSubmitButton: "Submit dispute",
  reportSubmittedTitle: "Dispute submitted",
  reportSubmittedBody:
    "GUBER will review submitted information from both sides — your report, the worker's response, the proof on file, and the timestamps and locations recorded — and reach a decision. Payout for this job is on hold until the review is complete.",

  helperResponseTitle: "An issue was reported on this job",
  helperResponseBody:
    "The poster reported an issue. You have 24 hours to respond with your side of the story and add any photos, video, or screenshots. After that, GUBER will review using the proof already on file.",
  helperResponseTextLabel: "Your response",
  helperResponseTextPlaceholder:
    "Explain what happened from your side. Reference the proof you already submitted (photos, GPS, timestamps).",
  helperResponseEvidenceLabel: "Additional photo / video / screenshot evidence (optional)",
  helperResponseSubmitButton: "Send response",
  helperResponseSubmittedTitle: "Response sent",
  helperResponseSubmittedBody:
    "Your response is on file. GUBER will review the proof, both sides' explanations, and any timestamps or location data, and will decide whether to release the payout, issue a refund, or reach out for more information.",
  helperResponseDeadlinePassed:
    "The 24-hour response window has passed. GUBER will review using the proof and information already on file.",

  adminViBanner:
    "V&I disputes are documentation-based only. Review proof submission, location/time correctness, and checklist completion. Do not make mechanical, legal, or safety judgements.",
  adminAutomotiveBanner:
    "Automotive / roadside review: check safety confirmation, photos, completion notes, location, timestamps, and proof of attempt. GUBER does not guarantee repair outcome, diagnosis accuracy, or vehicle condition.",

  proofMissingWarning:
    "Required proof items are missing. Please submit the required photos, video, or checklist items before marking this job complete.",
} as const;
