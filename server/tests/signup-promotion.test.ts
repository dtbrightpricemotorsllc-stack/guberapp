import { describe, expect, it } from "vitest";
import {
  SIGNUP_PROMOTION_BASELINE,
  SIGNUP_PROMOTION_INTERVAL,
  SIGNUP_PROMOTION_PRIZE_CENTS,
  classifyPromotionUser,
  isPromotionWinner,
  promotionGlobalSignupNumber,
} from "../signup-promotion";

const user = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  email: "new-user@example.com",
  ...overrides,
});

describe("fixed-baseline signup promotion", () => {
  it("keeps the established baseline, interval, and prize", () => {
    expect(SIGNUP_PROMOTION_BASELINE).toBe(517);
    expect(SIGNUP_PROMOTION_INTERVAL).toBe(500);
    expect(SIGNUP_PROMOTION_PRIZE_CENTS).toBe(5000);
  });

  it("awards only every 500th eligible signup", () => {
    expect(isPromotionWinner(499)).toBe(false);
    expect(isPromotionWinner(500)).toBe(true);
    expect(isPromotionWinner(501)).toBe(false);
    expect(isPromotionWinner(1000)).toBe(true);
  });

  it("adds the post-activation sequence to the fixed baseline", () => {
    expect(promotionGlobalSignupNumber(499)).toBe(1016);
    expect(promotionGlobalSignupNumber(500)).toBe(1017);
    expect(promotionGlobalSignupNumber(1000)).toBe(1517);
    expect(promotionGlobalSignupNumber(1500)).toBe(2017);
  });

  it("excludes the account categories from the permanent eligibility snapshot", () => {
    expect(classifyPromotionUser(user())).toBeNull();
    expect(classifyPromotionUser(user({ accountType: "business" }))).toBe("business_account");
    expect(classifyPromotionUser(user({ accountType: "pending_business" }))).toBe("business_account");
    expect(classifyPromotionUser(user({ role: "admin" }))).toBe("admin_account");
    expect(classifyPromotionUser(user({ isTestUser: true }))).toBe("test_account");
    expect(classifyPromotionUser(user({ suspended: true }))).toBe("suspended_account");
    expect(classifyPromotionUser(user({ banned: true }))).toBe("banned_account");
    expect(classifyPromotionUser(user({ deletedAt: new Date() }))).toBe("deleted_account");
    expect(classifyPromotionUser(user({ email: "  " }))).toBe("missing_email");
  });
});