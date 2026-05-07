// =============================================================================
// GUBER Liability Protection Layer (Task #318)
// =============================================================================
// Single source of truth for the safety / liability copy + simple text guards
// shared between the React client and the Express server. Anything user-facing
// here MUST also be enforced server-side: every keyword list and detector is
// imported by both layers so client validation cannot be bypassed.
//
// Scope is intentionally limited to text guards + canonical disclaimer copy.
// No state-machine changes, no Stripe changes, no UI redesign.
// =============================================================================

// ──────────────────────────────────────────────────────────────────────────────
// 1. Global liability disclaimer (one-time per user)
// ──────────────────────────────────────────────────────────────────────────────

export const GLOBAL_LIABILITY_DISCLAIMER = {
  title: "GUBER does not employ helpers.",
  body:
    "GUBER is a coordination platform that connects independent users. " +
    "GUBER does not supervise, certify, guarantee, or accept liability for any " +
    "task, helper, hirer, payment outcome, or use of the platform. " +
    "By continuing you confirm you understand this and accept full " +
    "responsibility for your own decisions and conduct on GUBER.",
  ctaLabel: "I UNDERSTAND",
};

// ──────────────────────────────────────────────────────────────────────────────
// 2. Category-specific disclaimers (4 buckets)
// ──────────────────────────────────────────────────────────────────────────────

export type LiabilityBucket =
  | "automotive"
  | "skilled"
  | "verify_inspect"
  | "property_access";

export interface CategoryDisclaimer {
  bucket: LiabilityBucket;
  title: string;
  body: string;
}

export const CATEGORY_DISCLAIMERS: Record<LiabilityBucket, CategoryDisclaimer> = {
  automotive: {
    bucket: "automotive",
    title: "Automotive / vehicle safety",
    body:
      "Vehicle work, roadside help and salvage tasks carry real physical " +
      "risk. GUBER does not certify mechanical condition, diagnose vehicles, " +
      "or guarantee fitment. Help only with what you are qualified to do, " +
      "stay clear of traffic, and do not perform any task that requires " +
      "lifting, jacking, or working under a vehicle unless you are trained " +
      "and equipped for it.",
  },
  skilled: {
    bucket: "skilled",
    title: "Skilled labor",
    body:
      "Skilled trades work may require licensing, permits, insurance, " +
      "or specific PPE. You confirm you hold any required credentials, " +
      "you will only perform work within your qualifications, and GUBER " +
      "does not supervise, inspect, or certify the work performed.",
  },
  verify_inspect: {
    bucket: "verify_inspect",
    title: "Verify & Inspect — visual documentation only",
    body:
      "Verify & Inspect tasks are limited to taking photos / video and " +
      "visually noting what is or is not present. They are not a mechanical " +
      "diagnosis, structural opinion, fitment guarantee, safety certification, " +
      "appraisal, or any form of professional advice. Document only what you " +
      "can see — never claim a vehicle, item, or property is safe, sound, " +
      "approved, or guaranteed.",
  },
  property_access: {
    bucket: "property_access",
    title: "Property / site access",
    body:
      "Only enter property you have explicit permission to enter. Do not " +
      "force entry, climb fences, or access restricted areas. If a location " +
      "feels unsafe or you cannot confirm permission, do not proceed and " +
      "cancel the job. GUBER cannot verify ownership or access rights.",
  },
};

const VI_CATEGORY_NAMES = new Set([
  "Verify & Inspect",
  "verify_inspect",
  "verify-inspect",
]);

const SKILLED_CATEGORY_NAMES = new Set([
  "Skilled Labor",
  "skilled_labor",
]);

// Sub-category strings used inside V&I and General Labor that map to the
// stricter automotive or property buckets.
const AUTOMOTIVE_HINTS = [
  "wheels, wings & water",
  "wheels wings water",
  "automotive",
  "vehicle",
  "salvage",
  "roadside",
  "tow",
];

const PROPERTY_HINTS = [
  "property & site check",
  "property site check",
  "property",
  "site check",
  "real estate",
];

/**
 * Returns the category disclaimer that applies to a given job, picking the
 * strictest bucket when multiple hints match. Returns null when no
 * category-specific disclaimer applies (still gated by the global one).
 */
export function getCategoryDisclaimer(args: {
  category?: string | null;
  verifyInspectCategory?: string | null;
  serviceType?: string | null;
  useCaseName?: string | null;
}): CategoryDisclaimer | null {
  const category = (args.category || "").trim();
  const subStr = [
    args.verifyInspectCategory,
    args.serviceType,
    args.useCaseName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (AUTOMOTIVE_HINTS.some((h) => subStr.includes(h))) {
    return CATEGORY_DISCLAIMERS.automotive;
  }
  if (PROPERTY_HINTS.some((h) => subStr.includes(h))) {
    return CATEGORY_DISCLAIMERS.property_access;
  }
  if (VI_CATEGORY_NAMES.has(category)) {
    return CATEGORY_DISCLAIMERS.verify_inspect;
  }
  if (SKILLED_CATEGORY_NAMES.has(category)) {
    return CATEGORY_DISCLAIMERS.skilled;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. Verify & Inspect language guard
// ──────────────────────────────────────────────────────────────────────────────

// Words/phrases that imply certification, guarantee, or professional opinion.
// V&I helpers may only document what they see — never warrant condition, fit,
// safety, or approval. Hits are blocked client- and server-side.
export const VI_FORBIDDEN_WORDS = [
  "guarantee",
  "guaranteed",
  "guarantees",
  "guaranteeing",
  "certify",
  "certified",
  "certifies",
  "certification",
  "safe",
  "unsafe",
  "will work",
  "will fit",
  "fits",
  "approved",
  "approve",
  "passes inspection",
  "roadworthy",
  "structurally sound",
  // Task #494 — never act as inspector / diagnostician / certifier.
  // Includes plain "drive" / "drives" / "driving" because operating the
  // subject vehicle is out of scope (helpers are eyes on the ground only,
  // never operators) — covers solicitations like "drive the car around
  // the lot" that "test drive" alone wouldn't catch.
  "drive",
  "drives",
  "driving",
  "test drive",
  "test-drive",
  "drove",
  "operate the vehicle",
  "operate the car",
  "start the engine",
  "turn the key",
  "fix",
  "fixes",
  "fix it",
  "repair",
  "repaired",
  "repairs",
  "service the",
  "tune up",
  "tune-up",
  "assess",
  "assessment",
  "diagnostic",
  "diagnosed",
  "diagnose",
  "diagnosis",
  "mechanical opinion",
  "mechanically sound",
  "expert opinion",
  "professional inspection",
  "professional opinion",
  "appraisal",
  "appraised",
  "authenticity verified",
  "authenticity confirmed",
  "verified authentic",
  "take apart",
  "disassemble",
  "remove panel",
  "remove cover",
  "crawl underneath",
  "trespass",
  "restricted area",
  "hidden surveillance",
  "covert recording",
  "stalk",
  "harass",
  "emergency response",
];

export const VI_LANGUAGE_HINT =
  "Verify & Inspect is visual documentation only. Words like " +
  "\"guarantee\", \"certify\", \"safe\", \"approved\", \"will work\", or " +
  "\"fits\" aren't allowed — describe what you see instead (e.g. \"appears " +
  "intact\", \"no visible damage in photos\", \"matches part number on box\").";

export interface ViLanguageHit {
  word: string;
  message: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const VI_FORBIDDEN_REGEXES = VI_FORBIDDEN_WORDS.map((w) => ({
  word: w,
  re: new RegExp(`\\b${escapeRegExp(w)}\\b`, "i"),
}));

export function detectViLanguageHit(text?: string | null): ViLanguageHit | null {
  if (!text) return null;
  for (const { word, re } of VI_FORBIDDEN_REGEXES) {
    if (re.test(text)) {
      return { word, message: VI_LANGUAGE_HINT };
    }
  }
  return null;
}

/** Replace every forbidden V&I term with "[visual only]" for server-side sanitization. */
export function replaceViLanguage(text: string): string {
  let clean = text;
  for (const { re } of VI_FORBIDDEN_REGEXES) {
    clean = clean.replace(new RegExp(re.source, "gi"), "[visual only]");
  }
  return clean;
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. Safety-gate triggers (helper start confirmation requires extra ack)
// ──────────────────────────────────────────────────────────────────────────────

export interface SafetyTriggerHit {
  trigger: string;
  message: string;
}

const SAFETY_TRIGGERS: { trigger: string; patterns: RegExp[]; message: string }[] = [
  {
    trigger: "roadside",
    patterns: [/\broadside\b/i, /\bbroken\s*down\b/i, /\bstranded\b/i, /\bjump\s*start\b/i, /\bflat\s*tire\b/i],
    message:
      "This task involves roadside help. Stay clear of moving traffic, wear " +
      "high-visibility clothing if possible, and never stand between vehicles.",
  },
  {
    trigger: "towing",
    patterns: [/\btow(ing|ed)?\b/i, /\bwinch\b/i, /\brecover(y|ed)\s*vehicle\b/i],
    message:
      "Towing/recovery work carries crush, cable-snap, and traffic risk. " +
      "Only attempt if you are trained and properly equipped.",
  },
  {
    trigger: "heavy_lifting",
    patterns: [/\bheavy\s*(lift|lifting|object|item)\b/i, /\bmove\s+(piano|safe|appliance|fridge)\b/i, /\b500\s*lb/i, /\b\d{3,}\s*lbs?\b/i],
    message:
      "This task may involve heavy lifting. Use proper technique, ask for " +
      "the help you need, and decline anything beyond what you can safely lift.",
  },
  {
    trigger: "night_work",
    patterns: [/\bnight\s*work\b/i, /\bafter\s*dark\b/i, /\b(11|12|1|2|3)\s*(pm|am)\b/i, /\bovernight\b/i],
    message:
      "Night work has reduced visibility and higher personal-safety risk. " +
      "Stay in lit areas, share your location, and trust your instincts.",
  },
  {
    trigger: "unknown_location",
    patterns: [/\bunknown\s*location\b/i, /\bremote\s*area\b/i, /\bmiddle\s*of\s*nowhere\b/i, /\bno\s*address\b/i, /\bsketchy\b/i],
    message:
      "Location appears remote or unverified. Confirm the address, share " +
      "your live location with someone you trust, and cancel if anything " +
      "feels off when you arrive.",
  },
];

export function detectSafetyTriggers(args: {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  serviceType?: string | null;
  jobDetails?: Record<string, any> | null;
  location?: string | null;
}): SafetyTriggerHit[] {
  const haystack = [
    args.title,
    args.description,
    args.category,
    args.serviceType,
    args.location,
    args.jobDetails ? JSON.stringify(args.jobDetails) : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (!haystack) return [];

  const hits: SafetyTriggerHit[] = [];
  for (const t of SAFETY_TRIGGERS) {
    if (t.patterns.some((p) => p.test(haystack))) {
      hits.push({ trigger: t.trigger, message: t.message });
    }
  }

  // Roadside / towing categories almost always need the unknown-location reminder.
  if (
    hits.some((h) => h.trigger === "roadside" || h.trigger === "towing") &&
    !hits.some((h) => h.trigger === "unknown_location")
  ) {
    hits.push({
      trigger: "unknown_location",
      message: SAFETY_TRIGGERS.find((t) => t.trigger === "unknown_location")!.message,
    });
  }
  return hits;
}

// ──────────────────────────────────────────────────────────────────────────────
// 5. Disallowed job-type guard
// ──────────────────────────────────────────────────────────────────────────────

export interface DisallowedHit {
  category: string;
  message: string;
}

const DISALLOWED_PATTERNS: { category: string; patterns: RegExp[]; message: string }[] = [
  {
    category: "illegal",
    patterns: [
      /\b(buy|sell|deliver|score|drop\s*off)\s+(weed|marijuana|coke|cocaine|meth|heroin|fentanyl|drugs?)\b/i,
      /\b(stolen|fence)\s+(goods|items|property)\b/i,
      /\bunlicensed\s+(gun|firearm)\s+(sale|transfer)\b/i,
    ],
    message: "GUBER cannot be used for illegal activity.",
  },
  {
    category: "medical",
    patterns: [
      /\b(give|administer|inject)\s+(injection|shot|insulin|medication|meds?)\b/i,
      /\b(medical\s+procedure|catheter|wound\s+care|change\s+(bandage|dressing))\b/i,
      /\b(diagnose|prescribe)\b/i,
    ],
    message:
      "GUBER does not support medical care, injections, prescription handling, " +
      "or diagnosis tasks.",
  },
  {
    category: "trespassing",
    patterns: [
      /\b(break\s*in|jimmy|pry\s+open|pick\s+the\s+lock)\b/i,
      /\b(without\s+permission|owner\s+isn'?t\s+home|repo)\b/i,
      /\b(force\s+entry|kick\s+the\s+door)\b/i,
    ],
    message:
      "GUBER does not support tasks that require entering property without " +
      "explicit owner permission.",
  },
  {
    category: "dangerous",
    patterns: [
      /\b(climb|work)\s+on\s+(a\s+)?roof\b/i,
      /\bclimb\s+a\s+(ladder|tower|tree)\b.*\b(no\s+harness|alone)\b/i,
      /\b(remove|cut\s+down)\s+(large|big)\s+tree\b/i,
      /\bhandle\s+(asbestos|lead\s+paint|biohazard|hazmat)\b/i,
      /\b(electrical\s+panel|live\s+wires?)\b/i,
    ],
    message:
      "Tasks like roof work, large tree removal, or hazardous-material handling " +
      "are outside GUBER's scope and must be hired through a licensed contractor.",
  },
];

export function detectDisallowedJobContent(args: {
  title?: string | null;
  description?: string | null;
  serviceType?: string | null;
  jobDetails?: Record<string, any> | null;
}): DisallowedHit | null {
  const haystack = [
    args.title,
    args.description,
    args.serviceType,
    args.jobDetails ? JSON.stringify(args.jobDetails) : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (!haystack) return null;
  for (const d of DISALLOWED_PATTERNS) {
    if (d.patterns.some((p) => p.test(haystack))) {
      return { category: d.category, message: d.message };
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// 6. Off-platform contact / payment patterns (extends existing filter)
// ──────────────────────────────────────────────────────────────────────────────

// Strengthened patterns explicitly required by Task #318. The legacy
// `contactInfoPattern` regex in server/auth.ts only matched phone/email/handles
// — these add the "pay outside / pay outside the app / pay in cash / off
// platform / meet outside" variants.
export const OFF_PLATFORM_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bpay\s+outside(\s+(the\s+)?(app|platform|guber))?\b/i, label: "off-platform payment" },
  { re: /\bpay\s+(me\s+)?(in\s+)?cash(\s+(in\s+hand|directly))?\b/i, label: "off-platform payment" },
  { re: /\bcash\s+only\b/i, label: "off-platform payment" },
  { re: /\boff\s*[-\s]?platform\b/i, label: "off-platform contact" },
  { re: /\boff\s+the\s+app\b/i, label: "off-platform contact" },
  { re: /\bmeet\s+outside\s+(of\s+)?(the\s+)?(app|guber)\b/i, label: "off-platform contact" },
  { re: /\bskip\s+(the\s+)?(app|guber|platform)\b/i, label: "off-platform contact" },
  { re: /\bvenmo\s+me\b/i, label: "Venmo" },
  { re: /\bzelle\s+me\b/i, label: "Zelle" },
  { re: /\bcash\s*app\s+me\b/i, label: "Cash App" },
];

export function detectOffPlatformPhrase(text?: string | null): string | null {
  if (!text) return null;
  for (const p of OFF_PLATFORM_PATTERNS) {
    if (p.re.test(text)) return p.label;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// 7. Persistent statements / labels (used in UI; kept here for parity)
// ──────────────────────────────────────────────────────────────────────────────

export const STATEMENTS = {
  noEmployment:
    "GUBER does not employ users. Helpers and hirers are independent of each other and of GUBER.",
  paymentSafety:
    "Payments are processed through GUBER for coordination purposes. GUBER is not responsible for the service outcome.",
  visualOnly: "Visual documentation only — no diagnoses, fitment, or safety claims.",
  helperStartConfirm:
    "I confirm I will only perform this job if it is safe and within my ability.",
  offPlatform:
    "For your safety and protection, keep communication and payment inside GUBER.",
};

// ──────────────────────────────────────────────────────────────────────────────
// 8. VI_COPY — single source of truth for V&I positioning copy (Task #494)
// V&I is "visual proof / eyes on the ground" — never inspector, diagnostician,
// certifier, or appraiser. All user-facing V&I strings should originate here.
// ──────────────────────────────────────────────────────────────────────────────

export const VI_COPY = {
  // Brand-line tagline used wherever V&I is introduced (home, marketplace,
  // verify-inspect landing, post-job summary, marketing HTML).
  tagline: "Visual proof — eyes on the ground, not inspectors.",
  shortTagline: "Visual proof. No diagnoses, no certifications.",

  // Hero blurb for landing & marketing pages. Replaces every "certified
  // GUBER inspector" / "professional inspection" / "diagnose" phrasing.
  heroBlurb:
    "GUBER's Verify & Inspect helpers are local people who go take photos and short video for you. They document what's there — they do not diagnose, repair, certify, appraise, or vouch for safety.",

  // Short positioning line used on cards, badges, and small surfaces.
  positioning: "Eyes on the ground — visual proof only.",

  // Posted under proof submission UI.
  helperSubmitNote:
    "Document what you can see. Don't disassemble, drive, repair, or claim something is safe, sound, or authentic — just photos, short video, and what you observed.",

  // Hirer-side proof review banner.
  reviewBanner:
    "These are visual notes from a local helper — not a professional inspection or appraisal. Use them to decide whether to take a closer look, not as a final verdict.",

  // Retake / Satisfied control labels.
  satisfiedButton: "Satisfied — release payment",
  satisfiedHint:
    "Marks the proof as accepted and releases payment to the helper. You can still file a dispute later if something material was missed.",
  retakeButton: "Request retake",
  retakeHint:
    "Send the helper back for additional or clearer photos. The first request is free; the helper has a fresh window to respond.",
  retakeReasonRequired:
    "Tell the helper exactly what to redo (e.g. \"need a clearer photo of the VIN tag\"). Required from the second retake on.",
  retakeMaxReached:
    "This proof has reached the retake limit. Either accept it and release payment, or file a dispute.",

  // Auto-satisfy banner shown when the review window expires without action.
  autoSatisfyBanner:
    "Review window elapsed without action. Proof was auto-accepted and payment was released. You may still report an issue under Disputes.",

  // 30-day media retention.
  mediaRetentionNotice:
    "Detailed proof media (photos, video) is retained for 30 days after job completion, then purged. The summary record stays on your history forever.",
  mediaPurgedNotice:
    "Detailed proof media for this job has been purged (30-day retention). The summary record below is permanent.",

  // V&I rating impact line — keep it neutral and proof-focused.
  ratingImpactNote:
    "V&I ratings reflect documentation quality and timeliness only — never mechanical, legal, or safety judgement.",
} as const;

export type ProofReviewDecision =
  | "pending"
  | "satisfied"
  | "retake_requested"
  | "auto_satisfied";

// Proof review state lifecycle (Task #494):
//   submitted → pending  →  satisfied | retake_requested | auto_satisfied
// retake_requested loops back to "pending" once the helper resubmits.
export const PROOF_REVIEW_DECISIONS: ProofReviewDecision[] = [
  "pending",
  "satisfied",
  "retake_requested",
  "auto_satisfied",
];

// Beyond this many retakes, the hirer must either accept or open a dispute.
// (Helper reliability counter `excessiveRetakeCount` increments at this point.)
export const VI_RETAKE_LIMIT = 3;

// Days of detailed-media retention for V&I proof submissions.
export const VI_MEDIA_RETENTION_DAYS = 30;
