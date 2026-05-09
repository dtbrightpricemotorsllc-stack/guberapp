// task-523: lock down the Studio pricing surface (task-519 Kling-mirrored
// economy) so a future regression — a re-run of the 41.25× multiplier, a
// reverted credit pack, a renamed tier — fails loudly instead of silently
// shipping. Three layers of coverage:
//   1. Pure constant assertions (STUDIO_CREDIT_PACKS / STUDIO_TIER_PLANS).
//   2. DB assertions on studio_model_pricing rows after post-merge.sh.
//   3. DB assertion that platform_settings flags the one-shot multiplier.
import { describe, it, expect } from "vitest";
import express from "express";
import supertest from "supertest";
import {
  STUDIO_CREDIT_PACKS,
  STUDIO_TIER_PLANS,
  STUDIO_TOOL_CREDIT_COSTS,
  STUDIO_CREDIT_REPRICE_FLAG_V519,
  studioPacksHandler,
  studioTiersHandler,
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

// task-532: catch drift between the public /api/studio/{packs,tiers}
// JSON contract and the locked spec in studio-pricing.ts. The test app
// mounts the EXACT handler functions used by registerRoutes() in
// server/routes.ts — no duplicated mapping logic. Any future change
// to studioPacksHandler/studioTiersHandler is exercised here.
function makeStudioPricingApp() {
  const app = express();
  app.get("/api/studio/packs", studioPacksHandler);
  app.get("/api/studio/tiers", studioTiersHandler);
  return app;
}

describe("GET /api/studio/packs (task-532)", () => {
  const app = makeStudioPricingApp();

  it("returns exactly 6 packs with the locked credits + price values", async () => {
    const res = await supertest(app).get("/api/studio/packs");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(6);

    const byId: Record<string, { credits: number; priceCents: number; label: string }> = {};
    for (const row of res.body as Array<{ id: string; credits: number; priceCents: number; label: string }>) {
      byId[row.id] = { credits: row.credits, priceCents: row.priceCents, label: row.label };
    }

    expect(Object.keys(byId).sort()).toEqual(
      ["boost", "mega", "power", "spark", "ultra", "whale"],
    );

    const expected: Record<string, { credits: number; priceCents: number }> = {
      spark: { credits:   330, priceCents:   500 },
      boost: { credits:   660, priceCents:  1000 },
      power: { credits:  1320, priceCents:  2000 },
      mega:  { credits:  3500, priceCents:  5000 },
      ultra: { credits:  7500, priceCents: 10000 },
      whale: { credits: 16000, priceCents: 20000 },
    };
    for (const [id, want] of Object.entries(expected)) {
      expect(
        byId[id],
        `pack "${id}" drifted from the locked spec — update studio-pricing.ts AND scripts/post-merge.sh together`,
      ).toMatchObject(want);
      expect(byId[id].label.length).toBeGreaterThan(0);
    }
  });
});

describe("GET /api/studio/tiers (task-532)", () => {
  const app = makeStudioPricingApp();

  it("returns exactly 3 tiers with the locked monthly credits + price values", async () => {
    const res = await supertest(app).get("/api/studio/tiers");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(3);

    const byId: Record<string, { priceCents: number; monthlyCredits: number; label: string; features: string[] }> = {};
    for (const row of res.body as Array<{ id: string; priceCents: number; monthlyCredits: number; label: string; features: string[] }>) {
      byId[row.id] = {
        priceCents: row.priceCents,
        monthlyCredits: row.monthlyCredits,
        label: row.label,
        features: row.features,
      };
    }

    expect(Object.keys(byId).sort()).toEqual(
      ["business", "enterprise", "standard"],
    );

    const expected: Record<string, { priceCents: number; monthlyCredits: number }> = {
      standard:   { priceCents: 1099, monthlyCredits:  660 },
      business:   { priceCents: 3799, monthlyCredits: 3000 },
      enterprise: { priceCents: 9900, monthlyCredits: 8000 },
    };
    for (const [id, want] of Object.entries(expected)) {
      expect(
        byId[id],
        `tier "${id}" drifted from the locked spec — update studio-pricing.ts AND the Stripe checkout handler together`,
      ).toMatchObject(want);
      expect(byId[id].label.length).toBeGreaterThan(0);
      expect(Array.isArray(byId[id].features)).toBe(true);
      expect(byId[id].features.length).toBeGreaterThan(0);
    }
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
