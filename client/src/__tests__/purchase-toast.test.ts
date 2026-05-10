import { describe, it, expect } from "vitest";
import { getPurchaseToast, parsePurchaseUrl } from "@/lib/purchase-toast";

// ─── getPurchaseToast: pure mapping ──────────────────────────────────────────

describe("getPurchaseToast — purchase-type to toast-props mapping", () => {
  it("day1og: shows Day-1 OG unlocked title", () => {
    const t = getPurchaseToast("day1og");
    expect(t.title).toBe("Day-1 OG unlocked!");
    expect(t.description).toContain("founding member");
    expect(t.duration).toBeGreaterThan(0);
  });

  it("trust_box: shows Trust Box activated title", () => {
    const t = getPurchaseToast("trust_box");
    expect(t.title).toBe("Trust Box activated!");
    expect(t.description).toContain("Trust Box");
    expect(t.duration).toBeGreaterThan(0);
  });

  it("business_scout: shows Scout Plan activated title", () => {
    const t = getPurchaseToast("business_scout");
    expect(t.title).toBe("Scout Plan activated!");
    expect(t.description).toContain("search and contact workers");
    expect(t.duration).toBeGreaterThan(0);
  });

  it("business_unlock: shows Profile unlocks added title", () => {
    const t = getPurchaseToast("business_unlock");
    expect(t.title).toBe("Profile unlocks added!");
    expect(t.description).toContain("worker profile unlocks");
    expect(t.duration).toBeGreaterThan(0);
  });

  it("credits: shows Credits added title", () => {
    const t = getPurchaseToast("credits");
    expect(t.title).toBe("Credits added!");
    expect(t.description).toContain("credits are ready");
    expect(t.duration).toBeGreaterThan(0);
  });

  it("subscription with standard tier: capitalises tier name in title", () => {
    const t = getPurchaseToast("subscription", "standard");
    expect(t.title).toBe("Standard Plan activated!");
    expect(t.description).toContain("Standard");
    expect(t.duration).toBeGreaterThan(0);
  });

  it("subscription with business tier: capitalises correctly", () => {
    const t = getPurchaseToast("subscription", "business");
    expect(t.title).toBe("Business Plan activated!");
  });

  it("subscription with enterprise tier: capitalises correctly", () => {
    const t = getPurchaseToast("subscription", "enterprise");
    expect(t.title).toBe("Enterprise Plan activated!");
  });

  it("subscription without tier: falls back to generic credits toast", () => {
    const t = getPurchaseToast("subscription", null);
    expect(t.title).toBe("Credits added!");
  });

  it("unrecognised type: falls back to generic credits toast", () => {
    const t = getPurchaseToast("something_unknown");
    expect(t.title).toBe("Credits added!");
    expect(t.description).toContain("credits are ready");
  });

  it("null type: falls back to generic credits toast", () => {
    const t = getPurchaseToast(null);
    expect(t.title).toBe("Credits added!");
  });
});

// ─── parsePurchaseUrl: deep-link wiring (simulates NativeDeepLinkHandler) ───

describe("parsePurchaseUrl — NativeDeepLinkHandler guber://purchase-complete wiring", () => {
  it("returns null for a non-guber URL", () => {
    expect(parsePurchaseUrl("https://guberapp.app/dashboard")).toBeNull();
  });

  it("returns null for a guber:// URL that is not purchase-complete", () => {
    expect(parsePurchaseUrl("guber://auth-success?token=abc")).toBeNull();
  });

  it("returns null for a completely invalid URL string", () => {
    expect(parsePurchaseUrl("not a url at all")).toBeNull();
  });

  it("day1og deep link → Day-1 OG unlocked toast", () => {
    const t = parsePurchaseUrl("guber://purchase-complete?type=day1og");
    expect(t).not.toBeNull();
    expect(t!.title).toBe("Day-1 OG unlocked!");
    expect(t!.description).toContain("founding member");
  });

  it("trust_box deep link → Trust Box activated toast", () => {
    const t = parsePurchaseUrl("guber://purchase-complete?type=trust_box");
    expect(t).not.toBeNull();
    expect(t!.title).toBe("Trust Box activated!");
  });

  it("business_scout deep link → Scout Plan activated toast", () => {
    const t = parsePurchaseUrl("guber://purchase-complete?type=business_scout");
    expect(t).not.toBeNull();
    expect(t!.title).toBe("Scout Plan activated!");
  });

  it("business_unlock deep link → Profile unlocks added toast", () => {
    const t = parsePurchaseUrl("guber://purchase-complete?type=business_unlock");
    expect(t).not.toBeNull();
    expect(t!.title).toBe("Profile unlocks added!");
  });

  it("credits deep link → Credits added toast", () => {
    const t = parsePurchaseUrl("guber://purchase-complete?type=credits");
    expect(t).not.toBeNull();
    expect(t!.title).toBe("Credits added!");
  });

  it("subscription+tier deep link → capitalised plan toast", () => {
    const t = parsePurchaseUrl("guber://purchase-complete?type=subscription&tier=standard");
    expect(t).not.toBeNull();
    expect(t!.title).toBe("Standard Plan activated!");
  });

  it("subscription without tier in URL → generic credits toast", () => {
    const t = parsePurchaseUrl("guber://purchase-complete?type=subscription");
    expect(t).not.toBeNull();
    expect(t!.title).toBe("Credits added!");
  });

  it("unrecognised type in URL → generic credits toast (fallback)", () => {
    const t = parsePurchaseUrl("guber://purchase-complete?type=unknown_product");
    expect(t).not.toBeNull();
    expect(t!.title).toBe("Credits added!");
  });

  it("no type param in URL → generic credits toast (fallback)", () => {
    const t = parsePurchaseUrl("guber://purchase-complete");
    expect(t).not.toBeNull();
    expect(t!.title).toBe("Credits added!");
  });
});
