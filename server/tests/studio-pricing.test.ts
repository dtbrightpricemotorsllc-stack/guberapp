// task-523: lock down the Studio pricing surface (task-519 Kling-mirrored
// economy) so a future regression — a re-run of the 41.25× multiplier, a
// reverted credit pack, a renamed tier — fails loudly instead of silently
// shipping. Three layers of coverage:
//   1. Pure constant assertions (STUDIO_CREDIT_PACKS / STUDIO_TIER_PLANS).
//   2. DB assertions on studio_model_pricing rows after post-merge.sh.
//   3. DB assertion that platform_settings flags the one-shot multiplier.
import { describe, it, expect } from "vitest";
import {
  STUDIO_CREDIT_PACKS,
  STUDIO_TIER_PLANS,
  STUDIO_TOOL_CREDIT_COSTS,
  STUDIO_CREDIT_REPRICE_FLAG_V519,
} from "../studio-pricing";
import { db } from "../db";
import { sql } from "drizzle-orm";

describe("Studio credit packs (task-519)", () => {
  it("has exactly 6 packs", () => {
    expect(Object.keys(STUDIO_CREDIT_PACKS).sort()).toEqual(
      ["boost", "mega", "power", "spark", "ultra", "whale"],
    );
  });

  it("locks every pack's credit and price amount", () => {
    expect(STUDIO_CREDIT_PACKS.spark).toMatchObject({ credits:   330, priceCents:   500 });
    expect(STUDIO_CREDIT_PACKS.boost).toMatchObject({ credits:   660, priceCents:  1000 });
    expect(STUDIO_CREDIT_PACKS.power).toMatchObject({ credits:  1320, priceCents:  2000 });
    expect(STUDIO_CREDIT_PACKS.mega ).toMatchObject({ credits:  3500, priceCents:  5000 });
    expect(STUDIO_CREDIT_PACKS.ultra).toMatchObject({ credits:  7500, priceCents: 10000 });
    expect(STUDIO_CREDIT_PACKS.whale).toMatchObject({ credits: 16000, priceCents: 20000 });
  });

  it("every pack has a non-empty label", () => {
    for (const pack of Object.values(STUDIO_CREDIT_PACKS)) {
      expect(typeof pack.label).toBe("string");
      expect(pack.label.length).toBeGreaterThan(0);
    }
  });
});

describe("Studio tier plans (task-519)", () => {
  it("has exactly 3 tiers (standard, business, enterprise)", () => {
    expect(Object.keys(STUDIO_TIER_PLANS).sort()).toEqual(
      ["business", "enterprise", "standard"],
    );
  });

  it("locks each tier's monthly credit grant and price", () => {
    expect(STUDIO_TIER_PLANS.standard).toMatchObject({
      priceCents: 1099,
      monthlyCredits: 660,
    });
    expect(STUDIO_TIER_PLANS.business).toMatchObject({
      priceCents: 3799,
      monthlyCredits: 3000,
    });
    expect(STUDIO_TIER_PLANS.enterprise).toMatchObject({
      priceCents: 9900,
      monthlyCredits: 8000,
    });
  });
});

describe("studio_model_pricing rows (task-519, post-merge.sh)", () => {
  it("matches the locked Kling-mirrored credit costs", async () => {
    const rows = await db.execute(sql`
      SELECT tool_key, credits_cost
        FROM studio_model_pricing
       WHERE tool_key IN ('kling_motion_control','wan_motion_5s','wan_motion_10s','minimax_music')
    `);
    const actual: Record<string, number> = {};
    for (const r of rows.rows as Array<{ tool_key: string; credits_cost: number }>) {
      actual[r.tool_key] = Number(r.credits_cost);
    }
    expect(actual).toEqual(STUDIO_TOOL_CREDIT_COSTS);
  });
});

describe("studio_credits one-shot 41.25× multiplier (task-519)", () => {
  it("platform_settings records the migration so it never re-runs", async () => {
    const rows = await db.execute(sql`
      SELECT value FROM platform_settings
       WHERE key = ${STUDIO_CREDIT_REPRICE_FLAG_V519}
    `);
    expect(rows.rows.length).toBe(1);
    expect((rows.rows[0] as { value: string }).value).toBe("true");
  });
});
