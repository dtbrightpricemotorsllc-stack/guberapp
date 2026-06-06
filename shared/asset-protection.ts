// ════════════════════════════════════════════════════════════════════════════
// GUBER Verified Release System™ — LOCKED pricing catalog
// ────────────────────────────────────────────────────────────────────────────
// Single source of truth for protection-package and witness-add-on pricing.
//
// PRICING IS LOCKED. The SERVER resolves prices BY KEY from this catalog and
// NEVER trusts a client-supplied amount. The client may import these constants
// for display only — the charge is always computed server-side. There is no
// dynamic pricing, A/B testing, or auto-optimization. Any price change is an
// explicit code/admin change requiring confirmation.
// ════════════════════════════════════════════════════════════════════════════

export type ProtectionPackageKey = "standard" | "premium" | "elite" | "elite_max";
export type WitnessAddonKey = "witness_pickup" | "witness_delivery";

export interface ProtectionPackage {
  key: ProtectionPackageKey;
  name: string;
  priceCents: number;
  /** Lifetime founder price (Founders Club members). */
  founderPriceCents: number;
  blurb: string;
  /** Asset value band this tier targets (display only). */
  valueRangeLabel: string;
  features: string[];
}

// Four packages. The top tier ships as two SKUs ($299 / $499) to cover the
// "$299–$499" White Glove band (standard six-figure vs. exotic/ultra-high-value).
export const PROTECTION_PACKAGES: Record<ProtectionPackageKey, ProtectionPackage> = {
  standard: {
    key: "standard",
    name: "Verified Release Protection",
    priceCents: 4900,
    founderPriceCents: 2900,
    blurb: "Secure release authorization with driver selfie, GPS, tow + trailer verification, and a one-time release code.",
    valueRangeLabel: "Any asset",
    features: [
      "Release authorization request",
      "Live driver selfie",
      "GPS proximity verify",
      "Tow vehicle + trailer verification",
      "One-time release code",
      "Release confirmation",
      "Chain-of-custody event history",
    ],
  },
  premium: {
    key: "premium",
    name: "High Value Transport Passport",
    priceCents: 14900,
    founderPriceCents: 9900,
    blurb: "Everything in Verified Release plus enhanced timeline, change logging, breakdown/storage protection, and the Transport Passport PDF.",
    valueRangeLabel: "$50k – $250k",
    features: [
      "Everything in Verified Release",
      "Enhanced custody timeline",
      "Driver / tow / trailer change logging",
      "Breakdown + storage event protection",
      "DOT / HOS delay reporting",
      "Camera event logging",
      "Transport Passport PDF",
    ],
  },
  elite: {
    key: "elite",
    name: "White Glove Chain of Custody",
    priceCents: 29900,
    founderPriceCents: 23920, // 20% off
    blurb: "Everything in High Value plus pickup + delivery witness verification, incident protection, and storage transfer verification.",
    valueRangeLabel: "$250k+ exotics & collector",
    features: [
      "Everything in High Value",
      "Pickup + delivery witness verification",
      "Full custody timeline",
      "Incident protection",
      "Storage transfer verification",
      "Final Transport Passport PDF",
    ],
  },
  elite_max: {
    key: "elite_max",
    name: "White Glove Chain of Custody (Exotic)",
    priceCents: 49900,
    founderPriceCents: 39920, // 20% off
    blurb: "White Glove protection tuned for ultra-high-value and irreplaceable assets.",
    valueRangeLabel: "$500k+ / irreplaceable",
    features: [
      "Everything in White Glove",
      "Priority incident response",
      "Dedicated custody review",
    ],
  },
};

export interface WitnessAddon {
  key: WitnessAddonKey;
  name: string;
  priceCents: number;
  founderPriceCents: number;
  blurb: string;
}

export const WITNESS_ADDONS: Record<WitnessAddonKey, WitnessAddon> = {
  witness_pickup: {
    key: "witness_pickup",
    name: "Witness Verified Pickup",
    priceCents: 9900,
    founderPriceCents: 7900,
    blurb: "A V&I witness verifies the asset, driver, tow, and trailer are present, VIN matches, release code is used, and the asset is loaded.",
  },
  witness_delivery: {
    key: "witness_delivery",
    name: "Witness Verified Delivery",
    priceCents: 9900,
    founderPriceCents: 7900,
    blurb: "A V&I witness verifies the asset delivered, receiver present, asset condition, delivery code used, and final photos.",
  },
};

/** Witness keeps 80%, GUBER keeps 20% — consistent with platform fee logic. */
export const WITNESS_PAYOUT_RATE = 0.8;

/** Founders Club locked parameters (DB row is authoritative; these are defaults). */
export const FOUNDERS_CLUB = {
  defaultCap: 500,
  founderPriceCents: 9900, // $99 one-time, first 500
  standardPriceCents: 29900, // $299 one-time after the cap
} as const;

/** Asset value (USD) at/above which we warn the poster to consider High Value. */
export const HIGH_VALUE_THRESHOLD = 50000;

/** Value-based recommended package (display guidance only — never forced). */
export function recommendPackage(estimatedValue: number | null | undefined): ProtectionPackageKey {
  const v = estimatedValue || 0;
  if (v >= 500000) return "elite_max";
  if (v >= 250000) return "elite";
  if (v >= HIGH_VALUE_THRESHOLD) return "premium";
  return "standard";
}

export function isProtectionPackageKey(k: string): k is ProtectionPackageKey {
  return k === "standard" || k === "premium" || k === "elite" || k === "elite_max";
}

export function isWitnessAddonKey(k: string): k is WitnessAddonKey {
  return k === "witness_pickup" || k === "witness_delivery";
}

/** SERVER-AUTHORITATIVE price resolution. Always resolve by key, never trust client. */
export function priceForPackage(key: ProtectionPackageKey, isFounder: boolean): number {
  const p = PROTECTION_PACKAGES[key];
  return isFounder ? p.founderPriceCents : p.priceCents;
}

export function priceForWitnessAddon(key: WitnessAddonKey, isFounder: boolean): number {
  const a = WITNESS_ADDONS[key];
  return isFounder ? a.founderPriceCents : a.priceCents;
}
