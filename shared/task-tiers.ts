export const TASK_TIERS = [
  {
    id: "tier1",
    label: "Tier 1 — Quick Verification",
    description: "Simple photo or presence check, minimal navigation required",
    estimatedTimeMin: 15,
    estimatedTimeMax: 30,
    typicalPayMin: 10,
    typicalPayMax: 25,
    examples: ["Storefront photo", "Sign visibility check", "Hours confirmation"],
  },
  {
    id: "tier2",
    label: "Tier 2 — Standard Inspection",
    description: "Multi-point inspection with checklist, moderate time commitment",
    estimatedTimeMin: 30,
    estimatedTimeMax: 60,
    typicalPayMin: 25,
    typicalPayMax: 60,
    examples: ["Property condition report", "Parking lot audit", "Inventory spot check"],
  },
  {
    id: "tier3",
    label: "Tier 3 — Detailed Audit",
    description: "Comprehensive walkthrough, multiple photos & documentation required",
    estimatedTimeMin: 60,
    estimatedTimeMax: 120,
    typicalPayMin: 60,
    typicalPayMax: 120,
    examples: ["Full property walkthrough", "Vehicle inspection", "Compliance audit"],
  },
  {
    id: "tier4",
    label: "Tier 4 — Complex Assessment",
    description: "Multi-location or multi-day task requiring specialized knowledge",
    estimatedTimeMin: 120,
    estimatedTimeMax: 300,
    typicalPayMin: 120,
    typicalPayMax: 300,
    examples: ["Multi-unit property review", "Fleet inspection", "Regulatory compliance check"],
  },
] as const;

export type TaskTierId = (typeof TASK_TIERS)[number]["id"];

export const PRICING_MODES = [
  { id: "fixed", label: "Fixed Price", description: "Set a firm price workers see upfront" },
  { id: "auto_increase", label: "Auto Pay Increase", description: "Price auto-increases if no one accepts" },
  { id: "request_quotes", label: "Request Quotes", description: "Workers submit bids — you pick the best offer" },
] as const;

export type PricingModeId = (typeof PRICING_MODES)[number]["id"];
