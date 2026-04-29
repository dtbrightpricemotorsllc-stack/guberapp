/**
 * GUBER Guided Job Builder — single source of truth.
 *
 * Each job type defines its guided sections (chips), pricing base, and
 * modifier rules. The renderer (components/guided-job-builder.tsx) reads
 * this config and produces a tap-based form that matches the Lawn Care /
 * Pet Care gold standard.
 *
 * Adding a new job type? Push a new JobTypeConfig entry below — no
 * component changes needed.
 */

export type GuidedSection = {
  name: string;            // jobDetails key
  label: string;           // display label
  options: string[];       // chip options (do NOT include "Other" — set hasOther)
  multi?: boolean;         // multi-select toggle group
  required?: boolean;
  hasOther?: boolean;      // appends "Other" chip → reveals freeform input
};

export type EffortRule = {
  field: string;
  values?: string[];       // match any of these values
  whenAny?: boolean;       // for multi: at least one selection in values bumps
  whenCountAtLeast?: number; // for multi: bump if selection count >= this
  weight: number;
};

export type HelpersRule = {
  field: string;
  values?: string[];
  whenCountAtLeast?: number;
  helpers: number;         // suggested helpers count when matched
};

export type PricingModifier = {
  field: string;
  values?: string[];
  whenAny?: boolean;
  whenCountAtLeast?: number;
  addLow: number;
  addHigh: number;
  reason: string;          // shown in summary "Why?"
};

export type JobTypeConfig = {
  category: string;
  jobType: string;
  shortLabel?: string;     // shorter form for auto-title prefix
  warning?: string;        // orange credential / safety warning
  disclaimer?: string;     // grey footer text (V&I, etc.)
  sections: GuidedSection[];
  basePriceLow: number;
  basePriceHigh: number;
  effortRules?: EffortRule[];
  helpersRules?: HelpersRule[];
  pricingModifiers?: PricingModifier[];
  blockKeywords?: string[]; // forbidden phrases in notes
  // Optional callback for combinator helper rules that the simple
  // single-field HelpersRule shape can't express (e.g. high urgency AND
  // roadside). Returns the desired helpers count; the engine keeps the max
  // of (base helpers, helpersRules max, helpersFn output).
  helpersFn?: (jobDetails: Record<string, any>, currentHelpers: number) => number;
};

const MIN_PAYOUT = 15;

// Universal automotive / boat / RV / roadside disclaimer. Shown on the
// guided job summary panel for any vehicle-touching job type.
export const AUTO_DISCLAIMER =
  "GUBER connects users for assistance. Work is performed at your own risk. Always ensure safe conditions.";

// ---------------------------------------------------------------------------
// Universal helpers
// ---------------------------------------------------------------------------

function asArr(v: any): string[] {
  if (Array.isArray(v)) return v;
  if (v == null || v === "") return [];
  return [String(v)];
}

function fieldMatches(rule: { field: string; values?: string[]; whenAny?: boolean; whenCountAtLeast?: number }, jobDetails: Record<string, any>): boolean {
  const raw = jobDetails[rule.field];
  if (raw == null || raw === "") return false;
  if (Array.isArray(raw)) {
    if (rule.whenCountAtLeast && raw.length >= rule.whenCountAtLeast) return true;
    if (rule.values && raw.some((v) => rule.values!.includes(v))) return true;
    if (rule.whenAny && raw.length > 0 && !rule.values) return true;
    return false;
  }
  if (rule.values && rule.values.includes(String(raw))) return true;
  if (rule.whenAny && !rule.values) return true;
  return false;
}

export function computeEffort(
  config: JobTypeConfig,
  jobDetails: Record<string, any>,
  urgent: boolean,
  estimatedMinutes: number,
): "Easy" | "Moderate" | "Heavy" {
  let score = 0;
  (config.effortRules || []).forEach((r) => {
    if (fieldMatches(r, jobDetails)) score += r.weight;
  });
  // multi-select breadth always adds a bit
  config.sections.filter((s) => s.multi).forEach((s) => {
    const arr = asArr(jobDetails[s.name]);
    if (arr.length >= 3) score += 1;
  });
  if (urgent) score += 1;
  if (estimatedMinutes >= 240) score += 2;
  else if (estimatedMinutes >= 120) score += 1;

  if (score <= 2) return "Easy";
  if (score <= 5) return "Moderate";
  return "Heavy";
}

export function computeHelpers(
  config: JobTypeConfig,
  jobDetails: Record<string, any>,
): number {
  // Explicit user pick wins
  const explicit = jobDetails["helpersNeeded"];
  if (explicit) {
    const n = parseInt(String(explicit));
    if (Number.isFinite(n) && n > 0) return n;
    if (String(explicit).includes("3+")) return 3;
  }
  let helpers = 1;
  (config.helpersRules || []).forEach((r) => {
    if (fieldMatches(r, jobDetails) && r.helpers > helpers) {
      helpers = r.helpers;
    }
  });
  if (config.helpersFn) {
    const next = config.helpersFn(jobDetails, helpers);
    if (Number.isFinite(next) && next > helpers) helpers = next;
  }
  return helpers;
}

export function computeSuggestedPrice(
  config: JobTypeConfig,
  jobDetails: Record<string, any>,
  urgent: boolean,
): { low: number; high: number; reasons: string[] } {
  let low = config.basePriceLow;
  let high = config.basePriceHigh;
  const reasons: string[] = [];
  (config.pricingModifiers || []).forEach((m) => {
    if (fieldMatches(m, jobDetails)) {
      low += m.addLow;
      high += m.addHigh;
      reasons.push(m.reason);
    }
  });
  if (urgent) {
    low += 10;
    high += 15;
    reasons.push("urgent");
  }
  if (low < MIN_PAYOUT) low = MIN_PAYOUT;
  if (high < low + 5) high = low + 5;
  return { low, high, reasons };
}

export function computeAutoTitle(
  config: JobTypeConfig,
  jobDetails: Record<string, any>,
): string {
  const prefix = config.shortLabel || config.jobType;

  // Pull the most descriptive multi-select first
  const multi = config.sections.find((s) => s.multi);
  const single = config.sections.find((s) => !s.multi);

  const multiVals = multi ? asArr(jobDetails[multi.name]) : [];
  const singleVal = single ? jobDetails[single.name] : "";

  let descriptor = "";
  if (multiVals.length > 0) {
    descriptor = multiVals.slice(0, 2).join(" + ");
  } else if (singleVal) {
    descriptor = String(singleVal);
  }

  const sizeSection = config.sections.find((s) =>
    /size|count|stops|duration/i.test(s.name) && !s.multi,
  );
  const sizeVal = sizeSection ? jobDetails[sizeSection.name] : "";

  let title = `${prefix} Needed`;
  if (descriptor) title += ` - ${descriptor}`;
  if (sizeVal && !descriptor.includes(String(sizeVal))) title += ` (${sizeVal})`;
  return title;
}

// ---------------------------------------------------------------------------
// Notes contact-block
// ---------------------------------------------------------------------------

import { OFF_PLATFORM_PATTERNS } from "@shared/liability";

const CONTACT_BLOCK_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, label: "phone number" },
  { re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, label: "email" },
  { re: /\b(cash\s*app|cashapp|\$cashtag)\b/i, label: "Cash App" },
  { re: /\b(venmo|@venmo)\b/i, label: "Venmo" },
  { re: /\bzelle\b/i, label: "Zelle" },
  { re: /\bpaypal\b/i, label: "PayPal" },
  { re: /\b(call|text)\s*me\b/i, label: "off-platform contact" },
  { re: /\b(reach|contact)\s+me\s+(at|on)\b/i, label: "off-platform contact" },
  { re: /\bsnap(chat)?\s*[:@]?\w+/i, label: "Snapchat handle" },
  { re: /\bwhats?app\b/i, label: "WhatsApp" },
  { re: /\btelegram\b/i, label: "Telegram" },
  { re: /\binstagram\b|\big[:@]\w+/i, label: "Instagram" },
  // Strengthened off-platform / pay-outside guards (Task #318) — sourced
  // from shared/liability.ts so the same patterns apply on the server too.
  ...OFF_PLATFORM_PATTERNS,
];

export function detectContactBlock(text: string, extra: string[] = []): string | null {
  if (!text) return null;
  for (const p of CONTACT_BLOCK_PATTERNS) {
    if (p.re.test(text)) return p.label;
  }
  for (const kw of extra) {
    const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(text)) return kw;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Quality score
// ---------------------------------------------------------------------------

export function computeQualityScore(args: {
  config: JobTypeConfig;
  jobDetails: Record<string, any>;
  estimatedMinutes: number;
  finalPrice: number;
  suggestedLow: number;
  suggestedHigh: number;
  photoCount: number;
  notes: string;
  contactBlockHit: boolean;
}): { score: number; message: string } {
  let score = 50;

  // Service type / job type implicitly chosen if config exists
  score += 10;

  // Guided steps completed: at least one selection per required section
  const required = args.config.sections.filter((s) => s.required);
  const filled = required.filter((s) => {
    const v = args.jobDetails[s.name];
    return Array.isArray(v) ? v.length > 0 : !!v;
  });
  if (required.length === 0 || filled.length === required.length) score += 10;

  if (args.photoCount > 0) score += 10;
  else score -= 15;

  if (args.estimatedMinutes > 0) score += 10;

  if (
    args.finalPrice >= args.suggestedLow &&
    args.finalPrice <= args.suggestedHigh + 25
  ) {
    score += 10;
  } else if (args.finalPrice > 0 && args.finalPrice < args.suggestedLow) {
    score -= 20;
  }

  // "Other" without enough explanation
  Object.entries(args.jobDetails).forEach(([k, v]) => {
    if (k.endsWith("_other") && typeof v === "string" && v.trim().length > 0 && v.trim().length < 4) {
      score -= 15;
    }
  });

  if (args.contactBlockHit) score -= 25;

  if (score > 100) score = 100;
  if (score < 0) score = 0;

  let message = "Add a little more detail to get better matches.";
  if (score >= 80) message = "Strong job post — helpers should understand this clearly.";
  else if (score >= 60) message = "Good post — adding photos or details may help.";

  return { score, message };
}

// ---------------------------------------------------------------------------
// CONFIGS
// ---------------------------------------------------------------------------

const TIME_TYPES = ["ASAP", "Today", "Scheduled", "Flexible"];
const ESTIMATED_TIMES = ["Under 1 hour", "1–2 hours", "Half day", "Full day", "Multi-day"];

export { TIME_TYPES, ESTIMATED_TIMES, MIN_PAYOUT };

// =========================
// ON-DEMAND HELP
// =========================

const ON_DEMAND: JobTypeConfig[] = [
  {
    category: "On-Demand Help",
    jobType: "Pet Care",
    sections: [
      { name: "petType", label: "Pet type", options: ["Dog", "Cat", "Multiple pets"], required: true, hasOther: true },
      { name: "services", label: "Service needed", options: ["Walk", "Feed", "Check-in", "Pet sitting", "Overnight stay", "Basic wash/grooming", "Vet transport"], multi: true, required: true, hasOther: true },
      { name: "petCount", label: "Number of pets", options: ["1", "2", "3+"], required: true },
      { name: "duration", label: "Duration", options: ["30 minutes", "1 hour", "Multiple visits", "Overnight"], required: true },
      { name: "petNotes", label: "Special notes", options: ["Friendly pet", "Needs leash", "Needs feeding instructions", "Access instructions needed"], multi: true, hasOther: true },
    ],
    basePriceLow: 18,
    basePriceHigh: 35,
    effortRules: [
      { field: "services", values: ["Overnight stay", "Vet transport", "Pet sitting"], weight: 2 },
      { field: "petCount", values: ["3+"], weight: 1 },
      { field: "duration", values: ["Overnight", "Multiple visits"], weight: 1 },
    ],
    pricingModifiers: [
      { field: "services", values: ["Pet sitting", "Overnight stay"], addLow: 25, addHigh: 60, reason: "extended care" },
      { field: "services", values: ["Vet transport"], addLow: 15, addHigh: 30, reason: "vet transport" },
      { field: "petCount", values: ["3+"], addLow: 10, addHigh: 20, reason: "3+ pets" },
      { field: "duration", values: ["Overnight"], addLow: 30, addHigh: 80, reason: "overnight" },
    ],
    helpersRules: [
      { field: "petCount", values: ["3+"], helpers: 1 },
    ],
    blockKeywords: ["medication", "medicate", "inject", "give shot", "give meds"],
    disclaimer: "GUBER Pet Care does not include medical treatment. Owner-provided routine reminders only.",
  },
  {
    category: "On-Demand Help",
    jobType: "Errand Running",
    shortLabel: "Errand Run",
    sections: [
      { name: "errandType", label: "Errand type", options: ["Store run", "Pickup item", "Drop-off item", "Multiple stops"], required: true, hasOther: true },
      { name: "stops", label: "Number of stops", options: ["1", "2–3", "4+"], required: true },
      { name: "paymentHandling", label: "Item / payment handling", options: ["No purchase needed", "Purchase needed", "Prepaid pickup"], required: true, hasOther: true },
      { name: "distance", label: "Distance", options: ["Nearby", "Across town", "Long distance"], required: true },
    ],
    basePriceLow: 18,
    basePriceHigh: 35,
    effortRules: [
      { field: "stops", values: ["2–3"], weight: 1 },
      { field: "stops", values: ["4+"], weight: 2 },
      { field: "distance", values: ["Long distance"], weight: 2 },
      { field: "paymentHandling", values: ["Purchase needed"], weight: 1 },
    ],
    pricingModifiers: [
      { field: "stops", values: ["2–3"], addLow: 5, addHigh: 10, reason: "multiple stops" },
      { field: "stops", values: ["4+"], addLow: 15, addHigh: 30, reason: "many stops" },
      { field: "distance", values: ["Across town"], addLow: 5, addHigh: 12, reason: "across town" },
      { field: "distance", values: ["Long distance"], addLow: 15, addHigh: 35, reason: "long distance" },
      { field: "paymentHandling", values: ["Purchase needed"], addLow: 5, addHigh: 10, reason: "purchase handling" },
    ],
  },
  {
    category: "On-Demand Help",
    jobType: "Delivery",
    sections: [
      { name: "itemType", label: "Item type", options: ["Food/groceries", "Small package", "Documents", "Large item", "Furniture"], required: true, hasOther: true },
      { name: "itemSize", label: "Item size", options: ["Small", "Medium", "Large", "Heavy"], required: true },
      { name: "loadingHelp", label: "Loading help", options: ["No loading needed", "Help loading", "Help unloading", "Help both"], required: true },
      { name: "fragile", label: "Fragile?", options: ["Yes", "No"], required: true },
    ],
    basePriceLow: 18,
    basePriceHigh: 40,
    effortRules: [
      { field: "itemType", values: ["Furniture", "Large item"], weight: 2 },
      { field: "itemSize", values: ["Large", "Heavy"], weight: 2 },
      { field: "loadingHelp", values: ["Help loading", "Help unloading", "Help both"], weight: 1 },
    ],
    pricingModifiers: [
      { field: "itemType", values: ["Furniture", "Large item"], addLow: 15, addHigh: 35, reason: "furniture/large" },
      { field: "itemSize", values: ["Heavy"], addLow: 10, addHigh: 20, reason: "heavy" },
      { field: "loadingHelp", values: ["Help loading", "Help unloading"], addLow: 5, addHigh: 12, reason: "loading help" },
      { field: "loadingHelp", values: ["Help both"], addLow: 12, addHigh: 25, reason: "load + unload help" },
    ],
    helpersRules: [
      { field: "itemType", values: ["Furniture"], helpers: 2 },
      { field: "itemSize", values: ["Heavy"], helpers: 2 },
      { field: "loadingHelp", values: ["Help both"], helpers: 2 },
    ],
  },
  {
    category: "On-Demand Help",
    jobType: "Personal Assistant",
    shortLabel: "Personal Assistant Help",
    sections: [
      { name: "taskType", label: "Task type", options: ["Organizing", "Scheduling help", "Phone calls", "Admin help", "Light errands"], required: true, hasOther: true },
      { name: "duration", label: "Duration", options: ["Under 1 hour", "1–2 hours", "Half day"], required: true },
      { name: "location", label: "Location", options: ["Remote", "In-person"], required: true },
    ],
    basePriceLow: 20,
    basePriceHigh: 40,
    effortRules: [
      { field: "duration", values: ["Half day"], weight: 2 },
      { field: "duration", values: ["1–2 hours"], weight: 1 },
    ],
    pricingModifiers: [
      { field: "duration", values: ["1–2 hours"], addLow: 10, addHigh: 20, reason: "1–2 hours" },
      { field: "duration", values: ["Half day"], addLow: 30, addHigh: 60, reason: "half day" },
    ],
  },
  {
    category: "On-Demand Help",
    jobType: "Wait in Line",
    shortLabel: "Wait in Line Help",
    sections: [
      { name: "expectedWait", label: "Expected wait", options: ["Under 30 min", "30–60 min", "1–2 hours", "2+ hours"], required: true },
      { name: "lineType", label: "Line type", options: ["DMV/office", "Event", "Store release", "Appointment hold"], required: true, hasOther: true },
      { name: "handoff", label: "Replacement handoff", options: ["Text/app update only", "Meet poster on arrival"], required: true, hasOther: true },
    ],
    basePriceLow: 18,
    basePriceHigh: 30,
    effortRules: [
      { field: "expectedWait", values: ["1–2 hours"], weight: 1 },
      { field: "expectedWait", values: ["2+ hours"], weight: 2 },
    ],
    pricingModifiers: [
      { field: "expectedWait", values: ["30–60 min"], addLow: 5, addHigh: 10, reason: "30-60 min wait" },
      { field: "expectedWait", values: ["1–2 hours"], addLow: 15, addHigh: 25, reason: "1-2 hour wait" },
      { field: "expectedWait", values: ["2+ hours"], addLow: 25, addHigh: 50, reason: "2+ hour wait" },
    ],
  },
  {
    category: "On-Demand Help",
    jobType: "House Sitting",
    sections: [
      { name: "duration", label: "Duration", options: ["Few hours", "Overnight", "Weekend", "Multi-day"], required: true },
      { name: "duties", label: "Duties", options: ["Be present", "Bring in mail", "Feed pets", "Water plants"], multi: true, required: true, hasOther: true },
      { name: "access", label: "Access", options: ["Key available", "Smart lock", "Meet first"], required: true, hasOther: true },
    ],
    basePriceLow: 25,
    basePriceHigh: 60,
    effortRules: [
      { field: "duration", values: ["Overnight"], weight: 1 },
      { field: "duration", values: ["Weekend"], weight: 2 },
      { field: "duration", values: ["Multi-day"], weight: 3 },
      { field: "duties", whenCountAtLeast: 3, weight: 1 },
    ],
    pricingModifiers: [
      { field: "duration", values: ["Overnight"], addLow: 25, addHigh: 60, reason: "overnight" },
      { field: "duration", values: ["Weekend"], addLow: 60, addHigh: 140, reason: "weekend" },
      { field: "duration", values: ["Multi-day"], addLow: 120, addHigh: 300, reason: "multi-day" },
    ],
  },
  {
    category: "On-Demand Help",
    jobType: "Property Check",
    sections: [
      { name: "checkType", label: "Check type", options: ["Exterior only", "Interior with access", "Photo proof", "Quick drive-by"], required: true, hasOther: true },
      { name: "proofNeeded", label: "Proof needed", options: ["Photos", "Video", "Notes", "Checklist"], multi: true, required: true },
      { name: "urgency", label: "Urgency", options: ["Today", "Scheduled", "Flexible"], required: true },
    ],
    basePriceLow: 18,
    basePriceHigh: 35,
    effortRules: [
      { field: "checkType", values: ["Interior with access"], weight: 1 },
      { field: "proofNeeded", whenCountAtLeast: 3, weight: 1 },
    ],
    pricingModifiers: [
      { field: "checkType", values: ["Interior with access"], addLow: 5, addHigh: 15, reason: "interior access" },
      { field: "proofNeeded", values: ["Video"], addLow: 5, addHigh: 10, reason: "video proof" },
    ],
  },
  {
    category: "On-Demand Help",
    jobType: "Jump Start",
    shortLabel: "Jump Start",
    warning: "GUBER does not allow unsafe roadside work. Helper and poster must agree on a safe meeting point before accepting.",
    disclaimer: AUTO_DISCLAIMER,
    sections: [
      { name: "issue", label: "Issue", options: ["Dead battery", "Lights left on", "Won't crank", "Other"], required: true, hasOther: true },
      { name: "vehicleType", label: "Vehicle type", options: ["Car", "Truck", "SUV", "Van", "Motorcycle"], required: true, hasOther: true },
      { name: "location", label: "Location", options: ["Driveway", "Parking lot", "Roadside", "Tight access"], required: true, hasOther: true },
      { name: "urgency", label: "Urgency", options: ["Low", "Medium", "High"], required: true },
    ],
    basePriceLow: 20,
    basePriceHigh: 50,
    effortRules: [
      { field: "location", values: ["Roadside"], weight: 2 },
      { field: "location", values: ["Tight access"], weight: 1 },
      { field: "vehicleType", values: ["Truck", "Van"], weight: 1 },
      { field: "urgency", values: ["High"], weight: 1 },
    ],
    pricingModifiers: [
      { field: "location", values: ["Roadside"], addLow: 10, addHigh: 30, reason: "roadside" },
      { field: "location", values: ["Tight access"], addLow: 5, addHigh: 15, reason: "tight access" },
      { field: "urgency", values: ["High"], addLow: 10, addHigh: 25, reason: "high urgency" },
    ],
    helpersFn: (jd) => {
      if (jd.urgency === "High" && jd.location === "Roadside") return 2;
      return 1;
    },
  },
  {
    category: "On-Demand Help",
    jobType: "Lockout Service",
    shortLabel: "Lockout",
    warning: "Helper must verify proof of ownership (ID + registration or matching documentation) before any lockout work.",
    disclaimer: AUTO_DISCLAIMER,
    sections: [
      { name: "vehicleType", label: "Vehicle type", options: ["Car", "Truck", "SUV", "Van", "Motorcycle", "RV"], required: true, hasOther: true },
      { name: "proofOfOwnership", label: "Proof of ownership", options: ["Yes — I have ID + registration on me", "No — need to retrieve documents"], required: true },
      { name: "location", label: "Location", options: ["Driveway", "Parking lot", "Roadside", "Tight access"], required: true, hasOther: true },
      { name: "urgency", label: "Urgency", options: ["Low", "Medium", "High"], required: true },
    ],
    basePriceLow: 25,
    basePriceHigh: 70,
    effortRules: [
      { field: "location", values: ["Roadside"], weight: 2 },
      { field: "proofOfOwnership", values: ["No — need to retrieve documents"], weight: 1 },
      { field: "urgency", values: ["High"], weight: 1 },
    ],
    pricingModifiers: [
      { field: "location", values: ["Roadside"], addLow: 10, addHigh: 25, reason: "roadside" },
      { field: "urgency", values: ["High"], addLow: 10, addHigh: 30, reason: "high urgency" },
    ],
    helpersFn: (jd) => {
      if (jd.urgency === "High" && jd.location === "Roadside") return 2;
      return 1;
    },
  },
  {
    category: "On-Demand Help",
    jobType: "Vehicle Transport",
    shortLabel: "Vehicle Transport",
    warning: "Vehicle transport requires proper credentials, equipment, and capacity. Confirm a safe pickup and drop-off plan before accepting.",
    disclaimer: AUTO_DISCLAIMER,
    sections: [
      { name: "vehicleType", label: "Vehicle type", options: ["Car", "Truck", "SUV", "Van", "Motorcycle", "Boat / trailer", "RV"], required: true, hasOther: true },
      { name: "transportType", label: "Transport type", options: ["Drive it", "Trailer", "Flatbed"], required: true },
      { name: "condition", label: "Vehicle condition", options: ["Running", "Non-running"], required: true },
      { name: "distance", label: "Distance", options: ["Local (under 10 mi)", "Across town", "Long distance"], required: true },
      { name: "urgency", label: "Urgency", options: ["Low", "Medium", "High"], required: true },
    ],
    basePriceLow: 40,
    basePriceHigh: 200,
    effortRules: [
      { field: "transportType", values: ["Trailer"], weight: 2 },
      { field: "transportType", values: ["Flatbed"], weight: 2 },
      { field: "condition", values: ["Non-running"], weight: 2 },
      { field: "distance", values: ["Across town"], weight: 1 },
      { field: "distance", values: ["Long distance"], weight: 3 },
      { field: "urgency", values: ["High"], weight: 1 },
    ],
    pricingModifiers: [
      { field: "transportType", values: ["Trailer"], addLow: 25, addHigh: 75, reason: "trailer" },
      { field: "transportType", values: ["Flatbed"], addLow: 40, addHigh: 120, reason: "flatbed" },
      { field: "condition", values: ["Non-running"], addLow: 20, addHigh: 60, reason: "non-running" },
      { field: "distance", values: ["Across town"], addLow: 20, addHigh: 50, reason: "across town" },
      { field: "distance", values: ["Long distance"], addLow: 75, addHigh: 250, reason: "long distance" },
      { field: "urgency", values: ["High"], addLow: 15, addHigh: 50, reason: "high urgency" },
    ],
    helpersRules: [
      { field: "condition", values: ["Non-running"], helpers: 2 },
      { field: "transportType", values: ["Trailer", "Flatbed"], helpers: 2 },
    ],
  },
  {
    category: "On-Demand Help",
    jobType: "Roadside Assistance",
    shortLabel: "Roadside Assistance",
    warning: "GUBER does not allow unsafe roadside or highway work. Helper and poster must agree on a safe meeting point before accepting.",
    disclaimer: AUTO_DISCLAIMER,
    sections: [
      { name: "service", label: "Service needed", options: ["Tire change", "Lockout", "Jump start", "Fluid delivery", "Tow assistance"], required: true, hasOther: true },
      { name: "vehicleType", label: "Vehicle type", options: ["Car", "Truck", "SUV", "Van", "Motorcycle", "RV"], required: true, hasOther: true },
      { name: "location", label: "Location", options: ["Driveway", "Parking lot", "Roadside", "Highway shoulder", "Tight access"], required: true, hasOther: true },
      { name: "urgency", label: "Urgency", options: ["Low", "Medium", "High"], required: true },
    ],
    basePriceLow: 25,
    basePriceHigh: 80,
    effortRules: [
      { field: "location", values: ["Roadside", "Highway shoulder"], weight: 2 },
      { field: "service", values: ["Tow assistance"], weight: 2 },
      { field: "service", values: ["Fluid delivery"], weight: 1 },
      { field: "urgency", values: ["High"], weight: 2 },
    ],
    pricingModifiers: [
      { field: "service", values: ["Tow assistance"], addLow: 20, addHigh: 70, reason: "tow assistance" },
      { field: "service", values: ["Fluid delivery"], addLow: 10, addHigh: 30, reason: "fluid delivery" },
      { field: "service", values: ["Tire change"], addLow: 10, addHigh: 30, reason: "tire change" },
      { field: "location", values: ["Roadside"], addLow: 15, addHigh: 35, reason: "roadside" },
      { field: "location", values: ["Highway shoulder"], addLow: 25, addHigh: 60, reason: "highway shoulder" },
      { field: "urgency", values: ["High"], addLow: 15, addHigh: 45, reason: "high urgency" },
    ],
    helpersFn: (jd) => {
      if (jd.urgency === "High" && (jd.location === "Roadside" || jd.location === "Highway shoulder")) return 2;
      return 1;
    },
  },
];

// =========================
// GENERAL LABOR
// =========================

const GENERAL_LABOR: JobTypeConfig[] = [
  {
    category: "General Labor",
    jobType: "Lawn Care",
    sections: [
      { name: "services", label: "Services needed", options: ["Mowing", "Edging", "Weed eating", "Blowing", "Leaf removal", "Mulching", "Hedge trimming"], multi: true, required: true, hasOther: true },
      { name: "yardSize", label: "Yard size", options: ["Small (under 1/4 acre)", "Medium (1/4–1/2 acre)", "Large (1/2–1 acre)", "Very large (1+ acre)"], required: true },
      { name: "equipmentProvided", label: "Equipment provided by poster?", options: ["Yes", "No"], required: true },
    ],
    basePriceLow: 25,
    basePriceHigh: 65,
    effortRules: [
      { field: "services", whenCountAtLeast: 3, weight: 1 },
      { field: "services", whenCountAtLeast: 5, weight: 1 },
      { field: "yardSize", values: ["Large (1/2–1 acre)"], weight: 2 },
      { field: "yardSize", values: ["Very large (1+ acre)"], weight: 3 },
      { field: "equipmentProvided", values: ["No"], weight: 1 },
    ],
    pricingModifiers: [
      { field: "yardSize", values: ["Medium (1/4–1/2 acre)"], addLow: 10, addHigh: 20, reason: "medium yard" },
      { field: "yardSize", values: ["Large (1/2–1 acre)"], addLow: 25, addHigh: 55, reason: "large yard" },
      { field: "yardSize", values: ["Very large (1+ acre)"], addLow: 50, addHigh: 120, reason: "very large yard" },
      { field: "services", values: ["Leaf removal"], addLow: 10, addHigh: 25, reason: "leaf removal" },
      { field: "services", values: ["Mulching"], addLow: 15, addHigh: 35, reason: "mulching" },
      { field: "services", values: ["Hedge trimming"], addLow: 10, addHigh: 25, reason: "hedge trimming" },
      { field: "equipmentProvided", values: ["No"], addLow: 10, addHigh: 20, reason: "helper brings equipment" },
    ],
    helpersRules: [
      { field: "yardSize", values: ["Very large (1+ acre)"], helpers: 2 },
    ],
  },
  {
    category: "General Labor",
    jobType: "Moving",
    shortLabel: "Moving Help",
    sections: [
      { name: "itemTypes", label: "What is being moved", options: ["Boxes", "Furniture", "Appliances", "Storage items", "Mixed items"], multi: true, required: true, hasOther: true },
      { name: "moveSize", label: "Move size", options: ["Few items", "1 room", "Apartment", "House", "Storage unit"], required: true },
      { name: "heavyItems", label: "Heavy items", options: ["No heavy items", "Some heavy items", "Very heavy items"], required: true },
      { name: "stairs", label: "Stairs", options: ["No stairs", "1 flight", "Multiple flights"], required: true },
      { name: "truck", label: "Truck needed?", options: ["No", "Yes", "Poster has truck"], required: true },
    ],
    basePriceLow: 35,
    basePriceHigh: 80,
    effortRules: [
      { field: "moveSize", values: ["Apartment"], weight: 2 },
      { field: "moveSize", values: ["House"], weight: 3 },
      { field: "moveSize", values: ["Storage unit"], weight: 2 },
      { field: "heavyItems", values: ["Some heavy items"], weight: 1 },
      { field: "heavyItems", values: ["Very heavy items"], weight: 3 },
      { field: "stairs", values: ["1 flight"], weight: 1 },
      { field: "stairs", values: ["Multiple flights"], weight: 2 },
      { field: "truck", values: ["Yes"], weight: 1 },
      { field: "itemTypes", values: ["Furniture", "Appliances"], weight: 1 },
    ],
    pricingModifiers: [
      { field: "moveSize", values: ["1 room"], addLow: 15, addHigh: 30, reason: "1 room" },
      { field: "moveSize", values: ["Apartment"], addLow: 40, addHigh: 100, reason: "apartment" },
      { field: "moveSize", values: ["House"], addLow: 80, addHigh: 200, reason: "full house" },
      { field: "moveSize", values: ["Storage unit"], addLow: 30, addHigh: 80, reason: "storage unit" },
      { field: "heavyItems", values: ["Some heavy items"], addLow: 15, addHigh: 30, reason: "heavy items" },
      { field: "heavyItems", values: ["Very heavy items"], addLow: 30, addHigh: 70, reason: "very heavy items" },
      { field: "stairs", values: ["1 flight"], addLow: 10, addHigh: 20, reason: "stairs" },
      { field: "stairs", values: ["Multiple flights"], addLow: 25, addHigh: 50, reason: "multiple flights" },
      { field: "truck", values: ["Yes"], addLow: 30, addHigh: 75, reason: "truck needed" },
    ],
    helpersRules: [
      { field: "moveSize", values: ["Apartment"], helpers: 2 },
      { field: "moveSize", values: ["House"], helpers: 3 },
      { field: "moveSize", values: ["Storage unit"], helpers: 2 },
      { field: "heavyItems", values: ["Very heavy items"], helpers: 2 },
      { field: "stairs", values: ["Multiple flights"], helpers: 2 },
    ],
  },
  {
    category: "General Labor",
    jobType: "Cleaning",
    shortLabel: "Cleaning Help",
    sections: [
      { name: "areas", label: "Area", options: ["Kitchen", "Bathroom", "Bedrooms", "Whole home", "Garage"], multi: true, required: true, hasOther: true },
      { name: "cleaningLevel", label: "Cleaning level", options: ["Light", "Standard", "Deep", "Move-out"], required: true },
      { name: "size", label: "Size", options: ["Small", "Medium", "Large"], required: true },
      { name: "supplies", label: "Supplies", options: ["Poster provides supplies", "Helper brings supplies", "Not sure"], required: true },
    ],
    basePriceLow: 30,
    basePriceHigh: 75,
    effortRules: [
      { field: "cleaningLevel", values: ["Deep"], weight: 2 },
      { field: "cleaningLevel", values: ["Move-out"], weight: 3 },
      { field: "size", values: ["Large"], weight: 2 },
      { field: "areas", whenCountAtLeast: 3, weight: 1 },
      { field: "areas", values: ["Whole home"], weight: 2 },
    ],
    pricingModifiers: [
      { field: "cleaningLevel", values: ["Deep"], addLow: 25, addHigh: 60, reason: "deep clean" },
      { field: "cleaningLevel", values: ["Move-out"], addLow: 40, addHigh: 100, reason: "move-out" },
      { field: "size", values: ["Medium"], addLow: 10, addHigh: 25, reason: "medium" },
      { field: "size", values: ["Large"], addLow: 25, addHigh: 60, reason: "large" },
      { field: "areas", values: ["Whole home"], addLow: 30, addHigh: 80, reason: "whole home" },
      { field: "supplies", values: ["Helper brings supplies"], addLow: 10, addHigh: 20, reason: "supplies" },
    ],
    helpersRules: [
      { field: "cleaningLevel", values: ["Move-out"], helpers: 2 },
      { field: "areas", values: ["Whole home"], helpers: 2 },
    ],
  },
  {
    category: "General Labor",
    jobType: "Hauling / Junk Removal",
    shortLabel: "Junk Removal",
    sections: [
      { name: "loadSize", label: "Load size", options: ["Few items", "Half truck load", "Full truck load", "Multiple loads"], required: true },
      { name: "itemTypes", label: "Item type", options: ["Furniture", "Trash bags", "Yard debris", "Appliances", "Mixed junk"], multi: true, required: true, hasOther: true },
      { name: "heavyLifting", label: "Heavy lifting", options: ["No", "Yes", "Very heavy"], required: true },
      { name: "disposal", label: "Disposal needed", options: ["Curb only", "Haul away", "Dump run needed"], required: true },
    ],
    basePriceLow: 35,
    basePriceHigh: 80,
    effortRules: [
      { field: "loadSize", values: ["Full truck load"], weight: 2 },
      { field: "loadSize", values: ["Multiple loads"], weight: 3 },
      { field: "heavyLifting", values: ["Yes"], weight: 1 },
      { field: "heavyLifting", values: ["Very heavy"], weight: 3 },
      { field: "disposal", values: ["Haul away", "Dump run needed"], weight: 1 },
    ],
    pricingModifiers: [
      { field: "loadSize", values: ["Half truck load"], addLow: 20, addHigh: 50, reason: "half truck" },
      { field: "loadSize", values: ["Full truck load"], addLow: 50, addHigh: 120, reason: "full truck" },
      { field: "loadSize", values: ["Multiple loads"], addLow: 100, addHigh: 250, reason: "multiple loads" },
      { field: "heavyLifting", values: ["Yes"], addLow: 15, addHigh: 30, reason: "heavy lifting" },
      { field: "heavyLifting", values: ["Very heavy"], addLow: 30, addHigh: 70, reason: "very heavy lifting" },
      { field: "disposal", values: ["Haul away"], addLow: 20, addHigh: 50, reason: "haul away" },
      { field: "disposal", values: ["Dump run needed"], addLow: 30, addHigh: 80, reason: "dump fees" },
    ],
    helpersRules: [
      { field: "loadSize", values: ["Full truck load", "Multiple loads"], helpers: 2 },
      { field: "heavyLifting", values: ["Very heavy"], helpers: 2 },
    ],
  },
  {
    category: "General Labor",
    jobType: "Assembly",
    shortLabel: "Assembly Help",
    sections: [
      { name: "itemType", label: "Item type", options: ["Furniture", "Bed frame", "Desk/table", "Shelving", "Gym equipment", "Outdoor item"], required: true, hasOther: true },
      { name: "itemCount", label: "Item count", options: ["1", "2–3", "4+"], required: true },
      { name: "tools", label: "Tools", options: ["Poster has tools", "Helper needs tools"], required: true },
      { name: "difficulty", label: "Difficulty", options: ["Simple", "Moderate", "Complex"], required: true },
    ],
    basePriceLow: 25,
    basePriceHigh: 60,
    effortRules: [
      { field: "itemCount", values: ["2–3"], weight: 1 },
      { field: "itemCount", values: ["4+"], weight: 2 },
      { field: "difficulty", values: ["Moderate"], weight: 1 },
      { field: "difficulty", values: ["Complex"], weight: 2 },
      { field: "itemType", values: ["Gym equipment", "Outdoor item"], weight: 1 },
    ],
    pricingModifiers: [
      { field: "itemCount", values: ["2–3"], addLow: 15, addHigh: 30, reason: "multiple items" },
      { field: "itemCount", values: ["4+"], addLow: 30, addHigh: 80, reason: "many items" },
      { field: "difficulty", values: ["Complex"], addLow: 20, addHigh: 50, reason: "complex" },
      { field: "tools", values: ["Helper needs tools"], addLow: 10, addHigh: 20, reason: "helper brings tools" },
    ],
  },
  {
    category: "General Labor",
    jobType: "Pressure Washing",
    sections: [
      { name: "area", label: "Area", options: ["Driveway", "House siding", "Deck/patio", "Fence"], required: true, hasOther: true },
      { name: "size", label: "Size", options: ["Small", "Medium", "Large"], required: true },
      { name: "waterAccess", label: "Water access", options: ["Available", "Not sure", "No"], required: true },
      { name: "equipment", label: "Equipment", options: ["Helper brings equipment", "Poster has equipment"], required: true },
    ],
    basePriceLow: 30,
    basePriceHigh: 70,
    effortRules: [
      { field: "size", values: ["Medium"], weight: 1 },
      { field: "size", values: ["Large"], weight: 2 },
      { field: "area", values: ["House siding"], weight: 1 },
      { field: "equipment", values: ["Helper brings equipment"], weight: 1 },
    ],
    pricingModifiers: [
      { field: "size", values: ["Medium"], addLow: 15, addHigh: 30, reason: "medium area" },
      { field: "size", values: ["Large"], addLow: 30, addHigh: 80, reason: "large area" },
      { field: "equipment", values: ["Helper brings equipment"], addLow: 20, addHigh: 40, reason: "helper equipment" },
      { field: "waterAccess", values: ["No"], addLow: 10, addHigh: 25, reason: "no water on-site" },
    ],
  },
  {
    category: "General Labor",
    jobType: "Garage Cleanout",
    shortLabel: "Garage Cleanout Help",
    sections: [
      { name: "size", label: "Size", options: ["Small", "Medium", "Large"], required: true },
      { name: "workNeeded", label: "Work needed", options: ["Sort items", "Move items", "Trash bagging", "Haul away"], multi: true, required: true, hasOther: true },
      { name: "heavyItems", label: "Heavy items", options: ["No", "Yes"], required: true },
    ],
    basePriceLow: 35,
    basePriceHigh: 80,
    effortRules: [
      { field: "size", values: ["Medium"], weight: 1 },
      { field: "size", values: ["Large"], weight: 2 },
      { field: "heavyItems", values: ["Yes"], weight: 2 },
      { field: "workNeeded", values: ["Haul away"], weight: 2 },
      { field: "workNeeded", whenCountAtLeast: 3, weight: 1 },
    ],
    pricingModifiers: [
      { field: "size", values: ["Medium"], addLow: 20, addHigh: 40, reason: "medium garage" },
      { field: "size", values: ["Large"], addLow: 40, addHigh: 100, reason: "large garage" },
      { field: "heavyItems", values: ["Yes"], addLow: 15, addHigh: 35, reason: "heavy items" },
      { field: "workNeeded", values: ["Haul away"], addLow: 25, addHigh: 60, reason: "haul away" },
    ],
    helpersRules: [
      { field: "size", values: ["Large"], helpers: 2 },
    ],
  },
  {
    category: "General Labor",
    jobType: "Packing / Unpacking",
    shortLabel: "Packing Help",
    sections: [
      { name: "service", label: "Service", options: ["Packing", "Unpacking", "Labeling", "Organizing"], multi: true, required: true, hasOther: true },
      { name: "size", label: "Size", options: ["Few boxes", "1 room", "Multiple rooms", "Whole home"], required: true },
      { name: "supplies", label: "Supplies", options: ["Poster has supplies", "Helper brings supplies"], required: true },
    ],
    basePriceLow: 30,
    basePriceHigh: 70,
    effortRules: [
      { field: "size", values: ["1 room"], weight: 1 },
      { field: "size", values: ["Multiple rooms"], weight: 2 },
      { field: "size", values: ["Whole home"], weight: 3 },
      { field: "service", whenCountAtLeast: 3, weight: 1 },
    ],
    pricingModifiers: [
      { field: "size", values: ["1 room"], addLow: 15, addHigh: 35, reason: "1 room" },
      { field: "size", values: ["Multiple rooms"], addLow: 40, addHigh: 100, reason: "multiple rooms" },
      { field: "size", values: ["Whole home"], addLow: 80, addHigh: 200, reason: "whole home" },
      { field: "supplies", values: ["Helper brings supplies"], addLow: 15, addHigh: 30, reason: "helper supplies" },
    ],
    helpersRules: [
      { field: "size", values: ["Multiple rooms", "Whole home"], helpers: 2 },
    ],
  },
  {
    category: "General Labor",
    jobType: "Vehicle Detailing",
    shortLabel: "Vehicle Detailing",
    disclaimer: AUTO_DISCLAIMER,
    sections: [
      { name: "detailType", label: "Detail type", options: ["Full Detail", "Exterior Only", "Interior Only", "Wash + Vacuum"], required: true },
      { name: "vehicleType", label: "Vehicle type", options: ["Car", "SUV", "Truck", "Van"], required: true, hasOther: true },
      { name: "condition", label: "Current condition", options: ["Light", "Moderate", "Very dirty"], required: true },
      { name: "supplies", label: "Supplies", options: ["Poster supplies", "Helper brings supplies"], required: true },
    ],
    basePriceLow: 30,
    basePriceHigh: 90,
    effortRules: [
      { field: "detailType", values: ["Full Detail"], weight: 2 },
      { field: "detailType", values: ["Interior Only", "Exterior Only"], weight: 1 },
      { field: "vehicleType", values: ["SUV", "Truck", "Van"], weight: 1 },
      { field: "condition", values: ["Moderate"], weight: 1 },
      { field: "condition", values: ["Very dirty"], weight: 2 },
      { field: "supplies", values: ["Helper brings supplies"], weight: 1 },
    ],
    pricingModifiers: [
      { field: "detailType", values: ["Full Detail"], addLow: 25, addHigh: 70, reason: "full detail" },
      { field: "detailType", values: ["Interior Only"], addLow: 10, addHigh: 30, reason: "interior detail" },
      { field: "detailType", values: ["Exterior Only"], addLow: 5, addHigh: 25, reason: "exterior detail" },
      { field: "vehicleType", values: ["SUV", "Truck"], addLow: 10, addHigh: 25, reason: "larger vehicle" },
      { field: "vehicleType", values: ["Van"], addLow: 15, addHigh: 35, reason: "van size" },
      { field: "condition", values: ["Moderate"], addLow: 5, addHigh: 15, reason: "moderate dirt" },
      { field: "condition", values: ["Very dirty"], addLow: 15, addHigh: 40, reason: "very dirty" },
      { field: "supplies", values: ["Helper brings supplies"], addLow: 10, addHigh: 25, reason: "helper supplies" },
    ],
  },
  {
    category: "General Labor",
    jobType: "Boat Cleaning",
    shortLabel: "Boat Cleaning",
    disclaimer: AUTO_DISCLAIMER,
    sections: [
      { name: "areas", label: "Areas to clean", options: ["Deck", "Exterior", "Interior", "Hull", "Engine compartment"], multi: true, required: true, hasOther: true },
      { name: "boatSize", label: "Boat size", options: ["Small / personal watercraft", "Medium", "Large yacht"], required: true },
      { name: "condition", label: "Current condition", options: ["Light", "Moderate", "Very dirty"], required: true },
      { name: "supplies", label: "Supplies", options: ["Poster supplies", "Helper brings supplies"], required: true },
    ],
    basePriceLow: 40,
    basePriceHigh: 120,
    effortRules: [
      { field: "areas", whenCountAtLeast: 3, weight: 1 },
      { field: "areas", values: ["Hull"], weight: 1 },
      { field: "areas", values: ["Engine compartment"], weight: 2 },
      { field: "boatSize", values: ["Medium"], weight: 1 },
      { field: "boatSize", values: ["Large yacht"], weight: 3 },
      { field: "condition", values: ["Moderate"], weight: 1 },
      { field: "condition", values: ["Very dirty"], weight: 2 },
      { field: "supplies", values: ["Helper brings supplies"], weight: 1 },
    ],
    pricingModifiers: [
      { field: "boatSize", values: ["Medium"], addLow: 20, addHigh: 60, reason: "medium boat" },
      { field: "boatSize", values: ["Large yacht"], addLow: 80, addHigh: 250, reason: "large yacht" },
      { field: "areas", values: ["Hull"], addLow: 20, addHigh: 50, reason: "hull cleaning" },
      { field: "areas", values: ["Engine compartment"], addLow: 25, addHigh: 60, reason: "engine bay" },
      { field: "condition", values: ["Very dirty"], addLow: 20, addHigh: 50, reason: "very dirty" },
      { field: "supplies", values: ["Helper brings supplies"], addLow: 15, addHigh: 35, reason: "helper supplies" },
    ],
    helpersRules: [
      { field: "boatSize", values: ["Large yacht"], helpers: 2 },
    ],
  },
  {
    category: "General Labor",
    jobType: "RV Cleaning",
    shortLabel: "RV Cleaning",
    disclaimer: AUTO_DISCLAIMER,
    sections: [
      { name: "areas", label: "Areas to clean", options: ["Interior", "Exterior wash", "Roof", "Awning", "Holding tanks"], multi: true, required: true, hasOther: true },
      { name: "rvSize", label: "RV size / class", options: ["Class B / Camper Van", "Class C", "Class A", "Travel Trailer", "Fifth Wheel"], required: true },
      { name: "condition", label: "Current condition", options: ["Light", "Moderate", "Very dirty"], required: true },
      { name: "supplies", label: "Supplies", options: ["Poster supplies", "Helper brings supplies"], required: true },
    ],
    basePriceLow: 45,
    basePriceHigh: 130,
    effortRules: [
      { field: "areas", whenCountAtLeast: 3, weight: 1 },
      { field: "areas", values: ["Roof"], weight: 2 },
      { field: "areas", values: ["Holding tanks"], weight: 2 },
      { field: "rvSize", values: ["Class A", "Fifth Wheel"], weight: 2 },
      { field: "rvSize", values: ["Class C", "Travel Trailer"], weight: 1 },
      { field: "condition", values: ["Moderate"], weight: 1 },
      { field: "condition", values: ["Very dirty"], weight: 2 },
      { field: "supplies", values: ["Helper brings supplies"], weight: 1 },
    ],
    pricingModifiers: [
      { field: "rvSize", values: ["Class C", "Travel Trailer"], addLow: 20, addHigh: 50, reason: "mid-size RV" },
      { field: "rvSize", values: ["Class A", "Fifth Wheel"], addLow: 40, addHigh: 110, reason: "large RV" },
      { field: "areas", values: ["Roof"], addLow: 20, addHigh: 50, reason: "roof access" },
      { field: "areas", values: ["Holding tanks"], addLow: 25, addHigh: 60, reason: "tanks" },
      { field: "condition", values: ["Very dirty"], addLow: 20, addHigh: 50, reason: "very dirty" },
      { field: "supplies", values: ["Helper brings supplies"], addLow: 15, addHigh: 35, reason: "helper supplies" },
    ],
    helpersRules: [
      { field: "rvSize", values: ["Class A", "Fifth Wheel"], helpers: 2 },
      { field: "areas", values: ["Roof"], helpers: 2 },
    ],
  },
];

// =========================
// SKILLED LABOR
// =========================

const SKILLED_WARNING = "Some skilled jobs may require licensing or verified experience. Posters and helpers are responsible for following local laws.";

function skilled(jobType: string, issues: string[], extras: Partial<JobTypeConfig> = {}): JobTypeConfig {
  return {
    category: "Skilled Labor",
    jobType,
    shortLabel: `${jobType} Help`,
    warning: SKILLED_WARNING,
    sections: [
      { name: "issueType", label: "Issue type", options: issues, multi: true, required: true, hasOther: true },
      { name: "urgency", label: "Urgency", options: ["Low", "Medium", "High"], required: true },
      { name: "access", label: "Access / location", options: ["Indoor", "Outdoor", "Both"], required: true, hasOther: true },
      { name: "scope", label: "Scope", options: ["Diagnosis only", "Repair needed", "Install"], required: true },
    ],
    basePriceLow: 40,
    basePriceHigh: 120,
    effortRules: [
      { field: "scope", values: ["Repair needed", "Install"], weight: 2 },
      { field: "issueType", whenCountAtLeast: 2, weight: 1 },
      { field: "urgency", values: ["High"], weight: 1 },
    ],
    pricingModifiers: [
      { field: "urgency", values: ["High"], addLow: 15, addHigh: 35, reason: "high urgency" },
      { field: "scope", values: ["Repair needed"], addLow: 20, addHigh: 60, reason: "repair" },
      { field: "scope", values: ["Install"], addLow: 30, addHigh: 80, reason: "install" },
    ],
    ...extras,
  };
}

const SKILLED_LABOR: JobTypeConfig[] = [
  skilled("Plumbing", ["Leak", "Clog", "Toilet", "Sink", "Faucet install", "Water heater", "Unknown"]),
  skilled("Electrical", ["Outlet", "Light fixture", "Breaker", "Switch", "Fan install", "Unknown"], {
    warning: "Electrical work may require a licensed professional. Confirm local rules before posting.",
  }),
  skilled("HVAC", ["Not cooling", "Not heating", "Thermostat", "Filter/service", "Noise", "Unknown"]),
  skilled("Carpentry", ["Door", "Trim", "Framing", "Shelving", "Repair", "Custom build"]),
  skilled("Drywall", ["Patch small hole", "Patch large hole", "Finish/sand", "Water damage"]),
  skilled("Painting", ["Touch-up", "One room", "Multiple rooms", "Exterior", "Fence/deck"], {
    basePriceLow: 50,
    basePriceHigh: 180,
  }),
  skilled("Welding", ["Small repair", "Gate/fence", "Trailer", "Equipment", "Custom"]),
  {
    category: "Skilled Labor",
    jobType: "Auto Repair",
    shortLabel: "Auto Repair",
    warning: "No unsafe roadside work. Helper and poster must agree on a safe location before accepting. Some repairs may require licensed/verified helpers.",
    disclaimer: AUTO_DISCLAIMER,
    sections: [
      { name: "vehicleType", label: "Vehicle type", options: ["Car", "Truck", "SUV", "Van"], required: true, hasOther: true },
      { name: "helpNeeded", label: "Help needed", options: ["Brakes", "Battery", "No start", "Oil/service", "Diagnostics", "Suspension", "AC/Heating", "Tires", "Roadside assistance"], multi: true, required: true, hasOther: true },
      { name: "workLocation", label: "Work location", options: ["Driveway", "Garage", "Parking lot", "Roadside / Highway shoulder"], required: true },
      { name: "partsSituation", label: "Parts situation", options: ["Helper brings parts", "Poster supplies parts", "Diagnose first"], required: true },
      { name: "urgency", label: "Urgency", options: ["Low", "Medium", "High"], required: true },
    ],
    basePriceLow: 45,
    basePriceHigh: 200,
    effortRules: [
      { field: "helpNeeded", whenCountAtLeast: 2, weight: 1 },
      { field: "helpNeeded", whenCountAtLeast: 3, weight: 1 },
      { field: "helpNeeded", values: ["Brakes", "Suspension", "AC/Heating"], weight: 2 },
      { field: "vehicleType", values: ["Truck", "Van"], weight: 1 },
      { field: "workLocation", values: ["Roadside / Highway shoulder"], weight: 2 },
      { field: "partsSituation", values: ["Helper brings parts"], weight: 1 },
      { field: "urgency", values: ["High"], weight: 2 },
    ],
    pricingModifiers: [
      { field: "helpNeeded", values: ["Brakes"], addLow: 30, addHigh: 80, reason: "brake work" },
      { field: "helpNeeded", values: ["Suspension"], addLow: 40, addHigh: 120, reason: "suspension" },
      { field: "helpNeeded", values: ["AC/Heating"], addLow: 30, addHigh: 100, reason: "AC / heating" },
      { field: "helpNeeded", values: ["No start"], addLow: 25, addHigh: 75, reason: "no-start diagnosis" },
      { field: "helpNeeded", values: ["Diagnostics"], addLow: 15, addHigh: 50, reason: "diagnostics" },
      { field: "partsSituation", values: ["Helper brings parts"], addLow: 25, addHigh: 80, reason: "helper supplies parts" },
      { field: "partsSituation", values: ["Diagnose first"], addLow: -15, addHigh: -30, reason: "diagnose-only scope" },
      { field: "workLocation", values: ["Roadside / Highway shoulder"], addLow: 20, addHigh: 60, reason: "roadside risk" },
      { field: "urgency", values: ["High"], addLow: 20, addHigh: 60, reason: "high urgency" },
    ],
    helpersRules: [
      { field: "workLocation", values: ["Roadside / Highway shoulder"], helpers: 2 },
    ],
    helpersFn: (jd) => {
      // High-risk: high urgency on a roadside/highway shoulder → at least 2 helpers
      if (jd.urgency === "High" && jd.workLocation === "Roadside / Highway shoulder") return 2;
      return 1;
    },
  },
  {
    category: "Skilled Labor",
    jobType: "Marine / Boat Repair",
    shortLabel: "Marine / Boat Repair",
    warning: "Marine / boat repair may require specialized credentials. Confirm safe access and conditions before accepting.",
    disclaimer: AUTO_DISCLAIMER,
    sections: [
      { name: "issueType", label: "Issue type", options: ["Engine", "Hull", "Electrical", "Plumbing", "Trailer", "Other"], multi: true, required: true, hasOther: true },
      { name: "boatSize", label: "Boat size", options: ["Small / personal watercraft", "Medium", "Large yacht"], required: true },
      { name: "workLocation", label: "Work location", options: ["Marina", "Storage yard", "Driveway", "On water (only if safe)"], required: true },
      { name: "partsSituation", label: "Parts situation", options: ["Helper brings parts", "Poster supplies parts", "Diagnose first"], required: true },
      { name: "urgency", label: "Urgency", options: ["Low", "Medium", "High"], required: true },
    ],
    basePriceLow: 60,
    basePriceHigh: 250,
    effortRules: [
      { field: "issueType", whenCountAtLeast: 2, weight: 1 },
      { field: "issueType", values: ["Engine", "Hull"], weight: 2 },
      { field: "boatSize", values: ["Medium"], weight: 1 },
      { field: "boatSize", values: ["Large yacht"], weight: 3 },
      { field: "workLocation", values: ["On water (only if safe)"], weight: 2 },
      { field: "urgency", values: ["High"], weight: 2 },
    ],
    pricingModifiers: [
      { field: "issueType", values: ["Engine"], addLow: 50, addHigh: 150, reason: "engine work" },
      { field: "issueType", values: ["Hull"], addLow: 40, addHigh: 120, reason: "hull repair" },
      { field: "issueType", values: ["Electrical"], addLow: 30, addHigh: 90, reason: "electrical" },
      { field: "issueType", values: ["Trailer"], addLow: 20, addHigh: 60, reason: "trailer" },
      { field: "boatSize", values: ["Medium"], addLow: 25, addHigh: 80, reason: "medium boat" },
      { field: "boatSize", values: ["Large yacht"], addLow: 100, addHigh: 350, reason: "large yacht" },
      { field: "workLocation", values: ["On water (only if safe)"], addLow: 25, addHigh: 80, reason: "on-water work" },
      { field: "partsSituation", values: ["Helper brings parts"], addLow: 25, addHigh: 80, reason: "helper supplies parts" },
      { field: "partsSituation", values: ["Diagnose first"], addLow: -20, addHigh: -40, reason: "diagnose-only scope" },
      { field: "urgency", values: ["High"], addLow: 25, addHigh: 75, reason: "high urgency" },
    ],
    helpersRules: [
      { field: "boatSize", values: ["Large yacht"], helpers: 2 },
      { field: "issueType", values: ["Engine", "Hull"], helpers: 2 },
    ],
    helpersFn: (jd) => {
      if (jd.urgency === "High" && jd.workLocation === "On water (only if safe)") return 2;
      return 1;
    },
  },
  {
    category: "Skilled Labor",
    jobType: "Towing / Hauling",
    shortLabel: "Towing",
    warning: "Towing requires proper equipment, capacity, and credentials. No unsafe roadside or highway work without agreement.",
    disclaimer: AUTO_DISCLAIMER,
    sections: [
      { name: "towType", label: "Tow / haul type", options: ["Standard car tow", "Non-running vehicle", "Blocked vehicle", "Locked wheels", "Trailer hauling", "Equipment hauling"], multi: true, required: true, hasOther: true },
      { name: "vehicleType", label: "Vehicle / load type", options: ["Car", "Truck", "SUV", "Van", "Motorcycle", "Boat / trailer", "RV"], required: true, hasOther: true },
      { name: "distance", label: "Distance", options: ["Local (under 10 mi)", "Across town", "Long distance"], required: true },
      { name: "equipment", label: "Equipment", options: ["Helper brings tow truck", "Poster has trailer", "Need flatbed"], required: true },
      { name: "urgency", label: "Urgency", options: ["Low", "Medium", "High"], required: true },
    ],
    basePriceLow: 65,
    basePriceHigh: 250,
    effortRules: [
      { field: "towType", whenCountAtLeast: 2, weight: 1 },
      { field: "towType", values: ["Non-running vehicle", "Blocked vehicle", "Locked wheels"], weight: 2 },
      { field: "towType", values: ["Equipment hauling", "Trailer hauling"], weight: 2 },
      { field: "distance", values: ["Across town"], weight: 1 },
      { field: "distance", values: ["Long distance"], weight: 3 },
      { field: "equipment", values: ["Need flatbed"], weight: 2 },
      { field: "urgency", values: ["High"], weight: 2 },
    ],
    pricingModifiers: [
      { field: "towType", values: ["Non-running vehicle"], addLow: 25, addHigh: 75, reason: "non-running" },
      { field: "towType", values: ["Blocked vehicle"], addLow: 30, addHigh: 90, reason: "blocked vehicle" },
      { field: "towType", values: ["Locked wheels"], addLow: 35, addHigh: 100, reason: "locked wheels" },
      { field: "towType", values: ["Trailer hauling"], addLow: 30, addHigh: 90, reason: "trailer hauling" },
      { field: "towType", values: ["Equipment hauling"], addLow: 50, addHigh: 150, reason: "equipment hauling" },
      { field: "distance", values: ["Across town"], addLow: 20, addHigh: 60, reason: "across town" },
      { field: "distance", values: ["Long distance"], addLow: 75, addHigh: 250, reason: "long distance" },
      { field: "equipment", values: ["Need flatbed"], addLow: 40, addHigh: 120, reason: "flatbed" },
      { field: "urgency", values: ["High"], addLow: 25, addHigh: 75, reason: "high urgency" },
    ],
    helpersRules: [
      { field: "towType", values: ["Blocked vehicle", "Locked wheels", "Equipment hauling", "Trailer hauling"], helpers: 2 },
    ],
    helpersFn: (jd) => {
      // High-risk reinforcement: high urgency on equipment / trailer hauling stays at 2 helpers
      const tow = Array.isArray(jd.towType) ? jd.towType : (jd.towType ? [jd.towType] : []);
      if (jd.urgency === "High" && (tow.includes("Equipment hauling") || tow.includes("Trailer hauling"))) return 2;
      return 1;
    },
  },
  skilled("Roofing", ["Leak check", "Shingle repair", "Gutter issue", "Inspection only"], {
    warning: "Roof work may be hazardous. Credentials, ladders, and safety gear required.",
  }),
  skilled("Flooring", ["Repair", "Install", "Remove old flooring", "Trim/transition"]),
  skilled("Appliance Repair", ["Washer", "Dryer", "Refrigerator", "Dishwasher", "Stove/oven"]),
  skilled("Locksmith", ["Lockout", "Rekey", "Lock install", "Key issue"], {
    warning: "Helper must verify proof of ownership/access before any locksmith work.",
  }),
];

// =========================
// VERIFY & INSPECT (post-job redirect — these are reference configs only)
// V&I jobs are created through /verify-inspect; these configs power
// the live summary panel and quality scoring when V&I jobs hit
// post-job for review.
// =========================

const VI_DISCLAIMER = "Visual documentation only. No safety, mechanical, condition, or legal guarantee.";

const VI: JobTypeConfig[] = [
  {
    category: "Verify & Inspect",
    jobType: "Property Check",
    disclaimer: VI_DISCLAIMER,
    sections: [
      { name: "propertyType", label: "Property type", options: ["House", "Apartment", "Land/lot", "Business"], required: true, hasOther: true },
      { name: "proofNeeded", label: "Proof needed", options: ["Exterior photos", "Interior photos with access", "Video walkaround", "Notes/checklist"], multi: true, required: true },
      { name: "checkFocus", label: "Check focus", options: ["Condition", "Occupancy signs", "Damage", "Address confirmation"], multi: true, required: true, hasOther: true },
    ],
    basePriceLow: 25,
    basePriceHigh: 60,
    pricingModifiers: [
      { field: "proofNeeded", values: ["Interior photos with access"], addLow: 10, addHigh: 25, reason: "interior access" },
      { field: "proofNeeded", values: ["Video walkaround"], addLow: 10, addHigh: 20, reason: "video" },
    ],
  },
  {
    category: "Verify & Inspect",
    jobType: "Vehicle Check",
    disclaimer: "Visual verification only — not a mechanical inspection or guarantee.",
    sections: [
      { name: "vehicleType", label: "Vehicle type", options: ["Car", "Truck", "Motorcycle", "Boat", "RV"], required: true, hasOther: true },
      { name: "proofNeeded", label: "Proof needed", options: ["Exterior photos", "Interior photos", "VIN photo", "Video walkaround", "Start/run video if safe"], multi: true, required: true },
      { name: "checkFocus", label: "Check focus", options: ["Condition", "Location confirmation", "Damage", "Listing verification"], multi: true, required: true, hasOther: true },
    ],
    basePriceLow: 30,
    basePriceHigh: 70,
    pricingModifiers: [
      { field: "proofNeeded", values: ["Start/run video if safe"], addLow: 10, addHigh: 20, reason: "start/run video" },
      { field: "proofNeeded", whenCountAtLeast: 4, addLow: 10, addHigh: 20, reason: "many proofs" },
    ],
  },
  {
    category: "Verify & Inspect",
    jobType: "Marketplace Item Verification",
    disclaimer: "Visual verification only. No guarantee of authenticity, function, or ownership.",
    sections: [
      { name: "itemType", label: "Item type", options: ["Electronics", "Furniture", "Tools", "Vehicle part", "Appliance"], required: true, hasOther: true },
      { name: "proofNeeded", label: "Proof needed", options: ["Photos", "Video", "Serial/model photo if visible", "Seller/location confirmation"], multi: true, required: true },
      { name: "checkFocus", label: "Check focus", options: ["Item exists", "Visible condition", "Matches listing"], multi: true, required: true, hasOther: true },
    ],
    basePriceLow: 22,
    basePriceHigh: 55,
  },
  {
    category: "Verify & Inspect",
    jobType: "Salvage Yard Part Confirmation",
    disclaimer: "Visual confirmation only. No fitment, function, or guarantee claims allowed.",
    blockKeywords: ["will fit", "works", "guaranteed", "guarantee", "diagnose", "diagnosis"],
    sections: [
      { name: "partType", label: "Part type", options: ["Body panel", "Engine part", "Interior part", "Wheel/tire", "Electrical part"], required: true, hasOther: true },
      { name: "proofRequired", label: "Proof required", options: ["Donor vehicle photo", "Part present/missing photo", "VIN tag if visible", "Yard row/signage photo"], multi: true, required: true },
      { name: "conditionTags", label: "Condition tags", options: ["Intact", "Damaged", "Missing", "Unknown"], multi: true, required: true },
    ],
    basePriceLow: 20,
    basePriceHigh: 50,
  },
  {
    category: "Verify & Inspect",
    jobType: "Storage Unit Check",
    disclaimer: VI_DISCLAIMER,
    sections: [
      { name: "proofNeeded", label: "Proof needed", options: ["Unit exterior", "Unit interior with access", "Item photos", "Video"], multi: true, required: true },
      { name: "checkFocus", label: "Check focus", options: ["Lock status", "Visible condition", "Items present", "Damage"], multi: true, required: true, hasOther: true },
    ],
    basePriceLow: 22,
    basePriceHigh: 55,
  },
  {
    category: "Verify & Inspect",
    jobType: "Business Location Check",
    disclaimer: VI_DISCLAIMER,
    sections: [
      { name: "proofNeeded", label: "Proof needed", options: ["Exterior sign", "Address confirmation", "Open/closed status", "Photos/video"], multi: true, required: true },
      { name: "checkFocus", label: "Check focus", options: ["Business exists", "Hours/signage", "Location condition"], multi: true, required: true, hasOther: true },
    ],
    basePriceLow: 22,
    basePriceHigh: 55,
  },
  {
    category: "Verify & Inspect",
    jobType: "Quick Check",
    disclaimer: VI_DISCLAIMER,
    sections: [
      { name: "checkType", label: "What needs checking", options: ["Address", "Item", "Vehicle", "Sign/location"], required: true, hasOther: true },
      { name: "proofNeeded", label: "Proof", options: ["Photo", "Short video", "Note"], multi: true, required: true },
    ],
    basePriceLow: 15,
    basePriceHigh: 30,
  },
  {
    category: "Verify & Inspect",
    jobType: "Boat Check",
    disclaimer: `Visual verification only — not a marine survey, mechanical inspection, or guarantee. ${AUTO_DISCLAIMER}`,
    sections: [
      { name: "boatType", label: "Boat type", options: ["Personal watercraft", "Outboard", "Inboard", "Sailboat"], required: true, hasOther: true },
      { name: "proofNeeded", label: "Proof needed", options: ["Exterior photos", "Interior photos", "Hull photos", "Engine compartment photos", "Trailer photos", "VIN / HIN photo", "Walkaround video"], multi: true, required: true },
      { name: "checkFocus", label: "Check focus", options: ["Condition", "Damage", "Listing match", "Trailer condition", "Location confirmation"], multi: true, required: true, hasOther: true },
    ],
    basePriceLow: 35,
    basePriceHigh: 80,
    pricingModifiers: [
      { field: "proofNeeded", values: ["Engine compartment photos"], addLow: 5, addHigh: 15, reason: "engine bay access" },
      { field: "proofNeeded", values: ["Walkaround video"], addLow: 10, addHigh: 20, reason: "walkaround video" },
      { field: "proofNeeded", whenCountAtLeast: 4, addLow: 10, addHigh: 25, reason: "many proofs" },
      { field: "boatType", values: ["Inboard", "Sailboat"], addLow: 10, addHigh: 25, reason: "larger boat" },
    ],
  },
  {
    category: "Verify & Inspect",
    jobType: "RV Check",
    disclaimer: `Visual verification only — not a mechanical inspection or RV guarantee. ${AUTO_DISCLAIMER}`,
    sections: [
      { name: "rvType", label: "RV type / class", options: ["Class A", "Class B / Camper Van", "Class C", "Travel Trailer", "Fifth Wheel"], required: true, hasOther: true },
      { name: "proofNeeded", label: "Proof needed", options: ["Exterior photos", "Interior photos", "Roof photos", "Slide-out photos", "Tire / undercarriage photos", "VIN photo", "Walkaround video"], multi: true, required: true },
      { name: "checkFocus", label: "Check focus", options: ["Condition", "Damage", "Listing match", "Roof condition", "Slide-out function (visual)", "Location confirmation"], multi: true, required: true, hasOther: true },
    ],
    basePriceLow: 40,
    basePriceHigh: 90,
    pricingModifiers: [
      { field: "proofNeeded", values: ["Roof photos"], addLow: 10, addHigh: 25, reason: "roof access" },
      { field: "proofNeeded", values: ["Slide-out photos"], addLow: 5, addHigh: 15, reason: "slide-out documentation" },
      { field: "proofNeeded", values: ["Walkaround video"], addLow: 10, addHigh: 20, reason: "walkaround video" },
      { field: "proofNeeded", whenCountAtLeast: 4, addLow: 10, addHigh: 25, reason: "many proofs" },
      { field: "rvType", values: ["Class A", "Fifth Wheel"], addLow: 10, addHigh: 25, reason: "larger RV" },
    ],
  },
];

// =========================
// EXPORTS
// =========================

export const JOB_BUILDER_CONFIG: JobTypeConfig[] = [
  ...ON_DEMAND,
  ...GENERAL_LABOR,
  ...SKILLED_LABOR,
  ...VI,
];

export function findJobConfig(category: string, jobType: string): JobTypeConfig | null {
  if (!category || !jobType) return null;
  return JOB_BUILDER_CONFIG.find((c) => c.category === category && c.jobType === jobType) || null;
}

export function jobTypesForCategory(category: string): string[] {
  return JOB_BUILDER_CONFIG.filter((c) => c.category === category).map((c) => c.jobType);
}
