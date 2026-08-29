import { describe, expect, it } from "vitest";
import {
  BUSINESS_PLAN_CATALOG,
  FOUNDING_LOCAL_OFFER,
  calculateBusinessPlatformFee,
  getBusinessReferralCashoutBlock,
  getBusinessPlanFromCatalog,
  getBusinessRequirementsForIndustry,
  getCustomerBusinessRequestNextAction,
  isProfessionalServiceCategory,
  normalizeBusinessCapabilities,
  safeProfessionalRequestMessage,
  isFoundingLocalOfferEligible,
  resolveBusinessReferralPayoutOwner,
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

    const beforeDeadline = new Date("2026-08-28T12:00:00.000Z");
    expect(isFoundingLocalOfferEligible({
      status: "verified_business",
      createdAt: "2026-08-01T00:00:00.000Z",
    }, beforeDeadline)).toBe(true);
    expect(isFoundingLocalOfferEligible({
      status: "approved_limited",
      createdAt: "2026-08-01T00:00:00.000Z",
    }, beforeDeadline)).toBe(false);
    expect(isFoundingLocalOfferEligible({
      status: "verified_business",
      createdAt: "2026-10-01T00:00:00.000Z",
    }, beforeDeadline)).toBe(false);
    expect(isFoundingLocalOfferEligible({
      status: "verified_business",
      createdAt: "2026-08-01T00:00:00.000Z",
    }, new Date("2026-10-01T00:00:00.000Z"))).toBe(false);
  });

  it("resolves checkout prices from the explicit catalog", () => {
    expect(getBusinessPlanFromCatalog("business_plus")).toMatchObject({
      label: "Business+",
      monthlyPriceCents: 1999,
    });
    expect(getBusinessPlanFromCatalog("scout")).toBeUndefined();
  });

  it("keeps the signup-time distributor when a code is reassigned later", () => {
    expect(resolveBusinessReferralPayoutOwner(
      { distributor_user_id: 41, distributor_label: "Original Distributor" },
      { owner_user_id: 82, owner_label: "New Distributor" },
    )).toEqual({
      ownerUserId: 41,
      ownerLabel: "Original Distributor",
      source: "attribution",
    });
  });

  it("uses the current code owner only when the signup was originally unassigned", () => {
    expect(resolveBusinessReferralPayoutOwner(
      { distributor_user_id: null, distributor_label: null },
      { owner_user_id: 82, owner_label: "Configured Distributor" },
    )).toEqual({
      ownerUserId: 82,
      ownerLabel: "Configured Distributor",
      source: "code",
    });
    expect(resolveBusinessReferralPayoutOwner(
      { distributor_user_id: null, distributor_label: null },
      { owner_user_id: null, owner_label: null },
    )).toBeNull();
  });

  it("allows earnings to accrue but blocks cash-out until identity and Stripe are ready", () => {
    expect(getBusinessReferralCashoutBlock({
      idVerified: false,
      stripeAccountId: "acct_ready",
      stripeAccountStatus: "active",
    })).toContain("ID verification");
    expect(getBusinessReferralCashoutBlock({
      idVerified: true,
      stripeAccountId: "acct_pending",
      stripeAccountStatus: "pending",
    })).toContain("Stripe Connect");
    expect(getBusinessReferralCashoutBlock({
      idVerified: true,
      stripeAccountId: null,
      stripeAccountStatus: "active",
    })).toContain("Stripe Connect");
    expect(getBusinessReferralCashoutBlock({
      idVerified: true,
      stripeAccountId: "acct_ready",
      stripeAccountStatus: "active",
    })).toBeNull();
  });
});

describe("universal business capabilities", () => {
  it("always keeps a public profile and removes unknown capability keys", () => {
    expect(normalizeBusinessCapabilities(["quote_requests", "unknown", "quote_requests"])).toEqual([
      "public_profile",
      "quote_requests",
    ]);
    expect(normalizeBusinessCapabilities([])).toEqual([
      "public_profile",
      "customer_inquiries",
      "service_availability",
    ]);
  });

  it("recognizes regulated professional categories without exposing a professional identity", () => {
    expect(isProfessionalServiceCategory("medical_practice", "Other")).toBe(true);
    expect(isProfessionalServiceCategory("", "Legal / Professional Services")).toBe(true);
    expect(isProfessionalServiceCategory("", "Retail")).toBe(false);
  });

  it("blocks sensitive intake details while allowing general routing context", () => {
    expect(safeProfessionalRequestMessage("I need an initial consultation next week")).toContain("initial consultation");
    expect(() => safeProfessionalRequestMessage("My diagnosis and prescription are attached")).toThrow("do not include");
  });
});

describe("customer business request history", () => {
  it("maps booking and request statuses to clear customer next actions", () => {
    expect(getCustomerBusinessRequestNextAction("booking", "reschedule_proposed"))
      .toBe("Review the proposed new time");
    expect(getCustomerBusinessRequestNextAction("request", "quoted"))
      .toBe("Review the business response");
    expect(getCustomerBusinessRequestNextAction("booking", "completed"))
      .toBe("No action needed");
  });
});
