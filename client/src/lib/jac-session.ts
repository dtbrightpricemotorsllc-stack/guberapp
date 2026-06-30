/**
 * JAC Pre-login Session Draft
 *
 * When a user completes info-gathering with JAC before they have an account,
 * we persist their collected data to localStorage (24h window) so it survives
 * navigation to /signup or /login.  After login the JacResumeBanner reads this
 * draft, applies it to the appropriate form-prefill keys, and routes the user
 * to the right screen automatically.
 */

export type JacDraftIntent =
  | "post_job"
  | "sell_vehicle"
  | "sell_item"
  | "transport"
  | "verify_car"
  | "find_work"
  | "earn_credits"
  | "general";

export interface JacSessionDraft {
  intent: JacDraftIntent;
  listingType: string;
  collected: Record<string, any>;
  route: string;
  messages: Array<{ role: string; content: string }>;
  source: "jac" | "homepage" | "onboarding";
  savedAt: number;
}

const KEY = "jac_session_draft_v1";
const EXPIRY_MS = 24 * 60 * 60 * 1000;

export function saveJacSessionDraft(data: Omit<JacSessionDraft, "savedAt">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {}
}

export function getJacSessionDraft(): JacSessionDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as JacSessionDraft;
    if (Date.now() - p.savedAt > EXPIRY_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function clearJacSessionDraft() {
  try { localStorage.removeItem(KEY); } catch {}
}

/**
 * Writes collected data into the localStorage keys that each destination
 * form already reads.  Returns the target route.
 */
export function applyJacSessionDraft(draft: JacSessionDraft): string {
  const { listingType, collected, route } = draft;
  try {
    if (listingType === "job") {
      localStorage.setItem("jac_job_prefill", JSON.stringify({
        category: collected.category || "",
        serviceType: collected.serviceType || collected.service_type || "",
        descriptionSeed: collected.descriptionSeed || collected.description || "",
        budgetHint: collected.budget ? Number(collected.budget) : null,
        zip: collected.zip || "",
      }));
    } else if (listingType) {
      localStorage.setItem("jac_listing_prefill", JSON.stringify({
        type: listingType,
        collected,
        route,
        savedAt: Date.now(),
      }));
    }
  } catch {}
  return route;
}

const INTENT_LABELS: Record<string, string> = {
  post_job:     "job posting",
  sell_vehicle: "vehicle listing",
  sell_item:    "item listing",
  transport:    "transport request",
  verify_car:   "Verify & Inspect request",
  find_work:    "work search",
  earn_credits: "credits mission",
  general:      "request",
  vehicle:      "vehicle listing",
  item:         "item listing",
  house:        "property listing",
  load:         "transport request",
  vi:           "Verify & Inspect request",
};

export function getIntentLabel(draft: JacSessionDraft): string {
  return INTENT_LABELS[draft.intent] || INTENT_LABELS[draft.listingType] || "request";
}
