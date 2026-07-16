/**
 * GUBER Commerce Mode — centralized feature-control system.
 *
 * GUBER_COMMERCE_MODE controls how the entire app handles digital purchases,
 * subscriptions, and GUBER-owned platform benefits. It has NO effect on
 * real-world job compensation, marketplace sale prices, worker payouts,
 * Stripe Connect contractor payments, or any TransactionCategory other than
 * GUBER_DIGITAL_BENEFIT.
 */

// ─── Primary mode enum ────────────────────────────────────────────────────────

export type CommerceMode = "HIDDEN" | "EARNED_CREDITS_ONLY" | "FULL_COMMERCE";

export const COMMERCE_MODES: CommerceMode[] = [
  "HIDDEN",
  "EARNED_CREDITS_ONLY",
  "FULL_COMMERCE",
];

/**
 * Default and fail-safe mode for iOS production.
 * If configuration cannot be loaded, the system must fall back to this.
 * Must NEVER be FULL_COMMERCE.
 */
export const DEFAULT_COMMERCE_MODE: CommerceMode = "EARNED_CREDITS_ONLY";

// ─── Transaction classification ───────────────────────────────────────────────

/**
 * Every transaction in GUBER is classified into one of these categories.
 * Commerce mode ONLY applies when category === "GUBER_DIGITAL_BENEFIT".
 * Real-world service payments and marketplace transactions are always untouched.
 */
export type TransactionCategory =
  | "REAL_WORLD_SERVICE"      // Job pay, task compensation, transport quotes, deposits, refunds
  | "MARKETPLACE_TRANSACTION" // Marketplace sale prices, buyer/seller agreements
  | "GUBER_DIGITAL_BENEFIT"   // Platform access, boosts, Studio credits, memberships, Trust Box, Scout Plan
  | "GUBER_REWARD_CREDIT";    // Credit earnings from missions, referrals, tasks

// ─── Reward type ──────────────────────────────────────────────────────────────

/**
 * Every opportunity must clearly display its actual reward type so users are
 * never misled about whether they receive cash, credits, or both.
 */
export type RewardType =
  | "CASH_COMPENSATION"  // Real-world job pay from a customer
  | "GUBER_CREDITS"      // Platform credit reward (missions, referrals, etc.)
  | "BOTH";              // Cash + credits (promotional combos)

// ─── Helper functions (pure — no I/O, safe on both server and client) ─────────

export function isCommerceHidden(mode: CommerceMode): boolean {
  return mode === "HIDDEN";
}

export function isEarnedCreditsOnly(mode: CommerceMode): boolean {
  return mode === "EARNED_CREDITS_ONLY";
}

export function isFullCommerceEnabled(mode: CommerceMode): boolean {
  return mode === "FULL_COMMERCE";
}

/** Whether cash prices ($) may be displayed to the user. */
export function canDisplayCashPrice(mode: CommerceMode, category: TransactionCategory): boolean {
  if (category !== "GUBER_DIGITAL_BENEFIT") return true; // Real-world prices always shown
  return mode === "FULL_COMMERCE";
}

/** Whether a Stripe / external checkout flow may be initiated. */
export function canOpenCheckout(mode: CommerceMode, category: TransactionCategory): boolean {
  if (category !== "GUBER_DIGITAL_BENEFIT") return true;
  return mode === "FULL_COMMERCE";
}

/** Whether credits can be purchased with money. */
export function canPurchaseCredits(mode: CommerceMode): boolean {
  return mode === "FULL_COMMERCE";
}

/** Whether external payment links (Stripe, Apple Pay, Google Pay) may be shown. */
export function canUseExternalPaymentLink(mode: CommerceMode, category: TransactionCategory): boolean {
  if (category !== "GUBER_DIGITAL_BENEFIT") return true;
  return mode === "FULL_COMMERCE";
}

/** Whether earned credits may be used to unlock a GUBER digital benefit. */
export function canUnlockWithEarnedCredits(mode: CommerceMode): boolean {
  return mode === "EARNED_CREDITS_ONLY" || mode === "FULL_COMMERCE";
}

/** Whether subscription/membership UI language is visible. */
export function canDisplaySubscriptionLanguage(mode: CommerceMode): boolean {
  return mode === "FULL_COMMERCE";
}

/** Whether purchase-related buttons (Buy, Subscribe, Checkout) are shown. */
export function canShowPurchaseButtons(mode: CommerceMode, category: TransactionCategory): boolean {
  if (category !== "GUBER_DIGITAL_BENEFIT") return true;
  return mode === "FULL_COMMERCE";
}

// ─── Blocked-purchase message (server → client) ───────────────────────────────

export const PURCHASE_BLOCKED_MESSAGE =
  "Purchases are not available in this version of GUBER. Access is available through earned GUBER Credits.";

// ─── Labels for admin UI ──────────────────────────────────────────────────────

export const COMMERCE_MODE_LABELS: Record<CommerceMode, string> = {
  HIDDEN: "Hidden — all commerce UI concealed",
  EARNED_CREDITS_ONLY: "Earned Credits Only — iOS production mode",
  FULL_COMMERCE: "Full Commerce — complete purchase experience",
};

// ─── Earned-credits-only copy helpers ────────────────────────────────────────

export const EARNED_CREDITS_EXPLANATION =
  "GUBER Credits are earned by completing eligible tasks and activities within GUBER. Credits cannot be purchased in this version.";

export function getAccessButtonLabel(action: "use" | "unlock" | "view" | "earn"): string {
  switch (action) {
    case "use":    return "Use Earned Credits";
    case "unlock": return "Unlock with Earned Credits";
    case "view":   return "View Earning Opportunities";
    case "earn":   return "Complete Tasks to Earn Credits";
  }
}

/** Subscription-tier display names for EARNED_CREDITS_ONLY mode. */
export const EARNED_ACCESS_TIER_LABELS: Record<string, string> = {
  standard:   "GUBER Access Level",
  business:   "Contributor Status",
  enterprise: "GUBER Rewards Level",
};
