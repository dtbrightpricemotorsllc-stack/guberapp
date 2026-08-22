import { describe, expect, it } from "vitest";
import {
  DAY1_OG_PROMOTION_ENDS_AT,
  canCreateDay1OgCheckout,
  isDay1OgPromotionActive,
} from "@shared/day1og-promotion";

describe("Day-1 OG limited-time campaign", () => {
  const deadline = new Date(DAY1_OG_PROMOTION_ENDS_AT).getTime();

  it("remains active through the published deadline", () => {
    expect(isDay1OgPromotionActive(deadline)).toBe(true);
    expect(isDay1OgPromotionActive(deadline + 1)).toBe(false);
  });

  it("only creates Stripe Checkout sessions that can expire before the deadline", () => {
    expect(canCreateDay1OgCheckout(deadline - 30 * 60 * 1000)).toBe(true);
    expect(canCreateDay1OgCheckout(deadline - 30 * 60 * 1000 + 1)).toBe(false);
    expect(canCreateDay1OgCheckout(deadline + 1)).toBe(false);
  });
});