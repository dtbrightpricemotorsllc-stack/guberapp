/**
 * The Day-1 OG offer is time-limited, while earned status remains permanent.
 * The UTC instant corresponds to September 30, 2026, 11:59:59.999 PM Eastern
 * Daylight Time.
 */
export const DAY1_OG_PROMOTION_ENDS_AT = "2026-10-01T03:59:59.999Z";
export const DAY1_OG_PROMOTION_END_LABEL = "September 30, 2026 at 11:59 PM ET";

export function day1OgPromotionEndsAt(): Date {
  return new Date(DAY1_OG_PROMOTION_ENDS_AT);
}

export function isDay1OgPromotionActive(now = Date.now()): boolean {
  return now <= day1OgPromotionEndsAt().getTime();
}

/**
 * Stripe Checkout sessions must stay open for at least 30 minutes. A session
 * is only issued when it can still expire at or before the public deadline.
 */
export function canCreateDay1OgCheckout(now = Date.now()): boolean {
  return day1OgPromotionEndsAt().getTime() - now >= 30 * 60 * 1000;
}