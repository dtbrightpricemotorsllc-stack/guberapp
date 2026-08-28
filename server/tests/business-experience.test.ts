import { describe, expect, it } from "vitest";
import {
  BUSINESS_PLAN_CATALOG,
  FOUNDING_LOCAL_OFFER,
  calculateBusinessPlatformFee,
  getBusinessRequirementsForIndustry,
} from "../business-experience";

describe("business handout promises", () => {
  it("keeps the three business tiers and founding offer explicit", () => {
    expect(BUSINESS_PLAN_CATALOG.map((plan) => plan.planType)).toEqual([
      "business",
      "business_plus",
      "business_pro",
    ]);
    expect(BUSINESS_PLAN_CATALOG.find((plan) => plan.planType === "business")?.monthlyPriceCents).toBe(0);
    expect(BUSINESS_PLAN_CATALOG.find((plan) => plan.planType === "business_plus")?.monthlyPriceCents).toBe(1999);
    expect(BUSINESS_PLAN_CATALOG.find((plan) => plan.planType === "business_pro")?.monthlyPriceCents).toBe(4999);
    expect(FOUNDING_LOCAL_OFFER.monthlyPriceCents).toBe(999);
    expect(FOUNDING_LOCAL_OFFER.eligibility).toContain("verification");
  });

  it("applies the lower Business Pro platform fee consistently", () => {
    expect(calculateBusinessPlatformFee(100, "business")).toEqual({
      grossAmount: 100,
      feeRate: 0.2,
      platformFee: 20,
      netAmount: 80,
    });
    expect(calculateBusinessPlatformFee(100, "business_pro")).toEqual({
      grossAmount: 100,
      feeRate: 0.15,
      platformFee: 15,
      netAmount: 85,
    });
  });

  it("requires extra official evidence for regulated business types", () => {
    const contractorKeys = getBusinessRequirementsForIndustry("Contractor").map((item) => item.key);
    const retailKeys = getBusinessRequirementsForIndustry("Retail").map((item) => item.key);
    expect(contractorKeys).toEqual(expect.arrayContaining(["registration_ein", "license", "insurance", "bonding"]));
    expect(retailKeys).toEqual(["registration_ein"]);
  });
});