/**
 * Client-side Commerce Mode context.
 *
 * Fetches the active mode from /api/commerce-mode on mount and exposes it
 * to all children. Falls back to EARNED_CREDITS_ONLY if the request fails.
 */

import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CommerceMode, TransactionCategory } from "../../../shared/commerce-mode";
import {
  DEFAULT_COMMERCE_MODE,
  canDisplayCashPrice,
  canOpenCheckout,
  canPurchaseCredits,
  canUnlockWithEarnedCredits,
  canShowPurchaseButtons,
  canDisplaySubscriptionLanguage,
  isFullCommerceEnabled,
  isEarnedCreditsOnly,
  isCommerceHidden,
  PURCHASE_BLOCKED_MESSAGE,
  EARNED_CREDITS_EXPLANATION,
  getAccessButtonLabel,
} from "../../../shared/commerce-mode";

// Re-export shared helpers + types so callers don't need two imports
export type { CommerceMode, TransactionCategory };
export {
  DEFAULT_COMMERCE_MODE,
  canDisplayCashPrice,
  canOpenCheckout,
  canPurchaseCredits,
  canUnlockWithEarnedCredits,
  canShowPurchaseButtons,
  canDisplaySubscriptionLanguage,
  isFullCommerceEnabled,
  isEarnedCreditsOnly,
  isCommerceHidden,
  PURCHASE_BLOCKED_MESSAGE,
  EARNED_CREDITS_EXPLANATION,
  getAccessButtonLabel,
};

// ─── Context ──────────────────────────────────────────────────────────────────

interface CommerceModeContextValue {
  mode: CommerceMode;
  isLoading: boolean;
  /** Whether any GUBER digital purchase flow may be shown */
  canPurchase: boolean;
  /** Whether the user can use earned credits to unlock benefits */
  canUseEarnedCredits: boolean;
  /** Whether any commerce UI is hidden entirely */
  allHidden: boolean;
  /** Helper: can this specific category open checkout? */
  canCheckout: (category: TransactionCategory) => boolean;
  /** Helper: show purchase buttons for this category? */
  showPurchaseButtons: (category: TransactionCategory) => boolean;
  /** Helper: can display cash price for this category? */
  showCashPrice: (category: TransactionCategory) => boolean;
}

const CommerceModeContext = createContext<CommerceModeContextValue>({
  mode: DEFAULT_COMMERCE_MODE,
  isLoading: true,
  canPurchase: false,
  canUseEarnedCredits: true,
  allHidden: false,
  canCheckout: () => false,
  showPurchaseButtons: () => false,
  showCashPrice: () => true,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CommerceModeProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery<{ mode: CommerceMode }>({
    queryKey: ["/api/commerce-mode"],
    staleTime: 60_000,
    retry: 1,
  });

  const mode: CommerceMode = data?.mode ?? DEFAULT_COMMERCE_MODE;

  const value: CommerceModeContextValue = {
    mode,
    isLoading,
    canPurchase: isFullCommerceEnabled(mode),
    canUseEarnedCredits: canUnlockWithEarnedCredits(mode),
    allHidden: isCommerceHidden(mode),
    canCheckout: (cat) => canOpenCheckout(mode, cat),
    showPurchaseButtons: (cat) => canShowPurchaseButtons(mode, cat),
    showCashPrice: (cat) => canDisplayCashPrice(mode, cat),
  };

  return (
    <CommerceModeContext.Provider value={value}>
      {children}
    </CommerceModeContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCommerceMode() {
  return useContext(CommerceModeContext);
}

// ─── Guard component ──────────────────────────────────────────────────────────

/**
 * Renders children only when the mode allows GUBER digital commerce.
 * In EARNED_CREDITS_ONLY mode renders the fallback instead.
 * In HIDDEN mode renders nothing.
 */
interface CommerceModeGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  category?: TransactionCategory;
}

export function CommerceModeGuard({
  children,
  fallback = null,
  category = "GUBER_DIGITAL_BENEFIT",
}: CommerceModeGuardProps) {
  const { mode } = useCommerceMode();

  if (isCommerceHidden(mode)) return null;
  if (!canShowPurchaseButtons(mode, category)) return <>{fallback}</>;
  return <>{children}</>;
}
