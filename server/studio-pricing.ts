// ─────────────────────────────────────────────────────────────────────────────
// Studio pricing constants (task-519, Kling-mirrored economy).
// Extracted into a standalone module so tests can import them directly without
// booting the full Express app. ANY change here must be matched by:
//   • scripts/post-merge.sh  (studio_model_pricing UPDATEs)
//   • server/tests/studio-pricing.test.ts (locked-value assertions)
// ─────────────────────────────────────────────────────────────────────────────

export const STUDIO_CREDIT_PACKS = {
  spark: { credits:   330, priceCents:   500, label: "Spark Pack" },
  boost: { credits:   660, priceCents:  1000, label: "Boost Pack" },
  power: { credits:  1320, priceCents:  2000, label: "Power Pack" },
  mega:  { credits:  3500, priceCents:  5000, label: "Mega Pack" },
  ultra: { credits:  7500, priceCents: 10000, label: "Ultra Pack" },
  whale: { credits: 16000, priceCents: 20000, label: "Whale Pack" },
} as const;
export type StudioPackId = keyof typeof STUDIO_CREDIT_PACKS;

export const STUDIO_TIER_PLANS = {
  standard: {
    label: "Standard",
    priceCents: 1099,
    monthlyCredits: 660,
    productName: "GUBER Studio · Standard",
    description:
      "660 monthly credits, motion AI, reference clips, locked vibes unlocked.",
    features: [
      "660 credits every month",
      "Motion AI on every clip",
      "Reference clips & uploads",
      "All locked vibes unlocked",
    ],
  },
  business: {
    label: "Business",
    priceCents: 3799,
    monthlyCredits: 3000,
    productName: "GUBER Studio · Business",
    description:
      "3,000 monthly credits, brand kits, ad templates, captions/music, multi-platform export.",
    features: [
      "3,000 credits every month",
      "Brand kits (logo, colors, fonts)",
      "Ad templates & captions/music",
      "Multi-platform export (TikTok, Reels, Shorts)",
      "Everything in Standard",
    ],
  },
  enterprise: {
    label: "Enterprise",
    priceCents: 9900,
    monthlyCredits: 8000,
    productName: "GUBER Studio · Enterprise",
    description:
      "8,000 monthly credits, priority generation queue, team-scale output for agencies and studios.",
    features: [
      "8,000 credits every month",
      "Priority generation queue",
      "Team-scale output for agencies & studios",
      "Everything in Business",
    ],
  },
} as const;
export type StudioTierPlanId = keyof typeof STUDIO_TIER_PLANS;

// ─────────────────────────────────────────────────────────────────────────────
// Per-tool credit costs (mirror scripts/post-merge.sh task-519 UPDATEs).
// Source of truth at runtime is the studio_model_pricing table; this map is
// the locked spec the migration converges to.
// ─────────────────────────────────────────────────────────────────────────────
export const STUDIO_TOOL_CREDIT_COSTS = {
  kling_motion_control: 80,
  wan_motion_5s: 30,
  wan_motion_10s: 60,
  minimax_music: 5,
  listing_video: 35,
  promo_clip: 35,
} as const;

export const STUDIO_CREDIT_REPRICE_MULTIPLIER_V519 = 41.25;
export const STUDIO_CREDIT_REPRICE_FLAG_V519 = "studio_credits_repriced_v519";

// ─────────────────────────────────────────────────────────────────────────────
// Public list endpoints (task-532). Extracted as standalone handlers so the
// supertest-level checks in studio-pricing.test.ts can mount the EXACT same
// code path the production routes use — no duplicated mapping logic.
// `server/routes.ts` mounts these on /api/studio/{packs,tiers}.
// ─────────────────────────────────────────────────────────────────────────────
import type { Request, Response } from "express";

export function studioPacksHandler(_req: Request, res: Response) {
  res.json(
    Object.entries(STUDIO_CREDIT_PACKS).map(([id, p]) => ({
      id,
      credits: p.credits,
      priceCents: p.priceCents,
      label: p.label,
    })),
  );
}

export function studioTiersHandler(_req: Request, res: Response) {
  res.json(
    Object.entries(STUDIO_TIER_PLANS).map(([id, p]) => ({
      id,
      label: p.label,
      priceCents: p.priceCents,
      monthlyCredits: p.monthlyCredits,
      description: p.description,
      features: p.features,
    })),
  );
}
