import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearListingPrefill,
  readListingPrefill,
  saveServiceOfferPrefill,
} from "./jac-listing-prefill";

let store: Record<string, string> = {};

vi.stubGlobal("localStorage", {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
});

describe("service-offer JAC prefill", () => {
  beforeEach(() => {
    store = {};
  });

  it("stores the guest draft in the format consumed after signup", () => {
    const collected = {
      title: "Same-day lawn care",
      category: "On-Demand Help",
      serviceType: "Lawn Care",
      description: "Mowing, edging, and cleanup.",
      capabilities: ["Mowing", "Edging"],
      pricingType: "starting_at",
      startingPrice: 65,
      availableNow: true,
    };

    saveServiceOfferPrefill(collected);

    expect(readListingPrefill()).toMatchObject({
      type: "service_offer",
      route: "/offer-service",
      collected,
    });
  });

  it("clears the draft after the offer form consumes it", () => {
    saveServiceOfferPrefill({ title: "Furniture assembly" });
    clearListingPrefill();
    expect(readListingPrefill()).toBeNull();
  });
});