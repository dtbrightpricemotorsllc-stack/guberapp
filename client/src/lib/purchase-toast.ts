/**
 * Parse a guber://purchase-complete?type=...&tier=... deep-link URL and
 * return the toast props that should be shown to the user.
 * Returns null for any URL that is not a purchase-complete deep link.
 */
export function parsePurchaseUrl(url: string): PurchaseToastProps | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "guber:") return null;
    if (parsed.host !== "purchase-complete") return null;
    const params = new URLSearchParams(parsed.search || "");
    return getPurchaseToast(params.get("type"), params.get("tier"));
  } catch {
    return null;
  }
}

export interface PurchaseToastProps {
  title: string;
  description: string;
  duration: number;
}

export function getPurchaseToast(
  type: string | null,
  tier?: string | null,
): PurchaseToastProps {
  if (type === "subscription" && tier) {
    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    return {
      title: `${tierLabel} Plan activated!`,
      description: `Welcome to ${tierLabel}! Your monthly credits have been added.`,
      duration: 5000,
    };
  }
  if (type === "credits") {
    return {
      title: "Credits added!",
      description: "Your new credits are ready to use — enjoy!",
      duration: 4000,
    };
  }
  if (type === "day1og") {
    return {
      title: "Day-1 OG unlocked!",
      description: "You're officially a founding member. Your badge and perks are active.",
      duration: 5000,
    };
  }
  if (type === "trust_box") {
    return {
      title: "Trust Box activated!",
      description: "Your Trust Box is live and ready to collect tips.",
      duration: 5000,
    };
  }
  if (type === "business_scout") {
    return {
      title: "Scout Plan activated!",
      description: "You can now search and contact workers directly.",
      duration: 5000,
    };
  }
  if (type === "business_unlock") {
    return {
      title: "Profile unlocks added!",
      description: "Your additional worker profile unlocks are ready to use.",
      duration: 4000,
    };
  }
  return {
    title: "Credits added!",
    description: "Your new credits are ready to use — enjoy!",
    duration: 4000,
  };
}
