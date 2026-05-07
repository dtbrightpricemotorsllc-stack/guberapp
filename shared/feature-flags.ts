// Centralized registry of feature-flag keys used by both client and server.
// Add a flag here, then it shows up in the admin Feature Flag Console
// (`/admin/qa/flags`) and is queryable via isFeatureEnabledFor(key, viewer).

export type FeatureFlagKey =
  | "studio_ai"
  | "studio_subscriptions"
  | "cash_drops"
  | "barter"
  | "direct_offers"
  | "observation_marketplace"
  | "handsfree_capture"
  | "business_promo"
  | "qa_dashboard";

export type RolloutScope = "off" | "global" | "role" | "allowlist";

export interface FeatureFlagDef {
  key: FeatureFlagKey;
  label: string;
  description: string;
  defaultEnabled: boolean;
  defaultScope: RolloutScope;
}

export const FEATURE_FLAGS: FeatureFlagDef[] = [
  {
    key: "studio_ai",
    label: "AI Video Studio",
    description: "Allow generation of AI clips at /studio.",
    defaultEnabled: true,
    defaultScope: "global",
  },
  {
    key: "studio_subscriptions",
    label: "Studio Tier Subscriptions",
    description: "Allow purchase of Creator / Business Studio plans.",
    defaultEnabled: true,
    defaultScope: "global",
  },
  {
    key: "cash_drops",
    label: "Cash Drops",
    description: "Show cash drops list, map, and host-drop creation.",
    defaultEnabled: true,
    defaultScope: "global",
  },
  {
    key: "barter",
    label: "Barter Listings",
    description: "Allow creation and discovery of barter (non-cash) listings.",
    defaultEnabled: true,
    defaultScope: "global",
  },
  {
    key: "direct_offers",
    label: "Direct Offers",
    description: "Hirer-to-worker direct offer creation.",
    defaultEnabled: true,
    defaultScope: "global",
  },
  {
    key: "observation_marketplace",
    label: "Observation Marketplace",
    description: "Passive-income observation jobs surfaced to workers.",
    defaultEnabled: true,
    defaultScope: "global",
  },
  {
    key: "handsfree_capture",
    label: "Hands-Free POV Capture",
    description: "Show the hands-free POV recorder on V&I jobs and accept wearable uploads.",
    defaultEnabled: false,
    defaultScope: "global",
  },
  {
    key: "business_promo",
    label: "Business Promo",
    description: "GUBER Business promo CTAs + business signup surfaces.",
    defaultEnabled: true,
    defaultScope: "global",
  },
  {
    key: "qa_dashboard",
    label: "QA Dashboard",
    description: "Master switch for the /admin/qa surface itself (admin-only regardless).",
    defaultEnabled: true,
    defaultScope: "global",
  },
];

export function isKnownFlag(key: string): key is FeatureFlagKey {
  return FEATURE_FLAGS.some((f) => f.key === key);
}
