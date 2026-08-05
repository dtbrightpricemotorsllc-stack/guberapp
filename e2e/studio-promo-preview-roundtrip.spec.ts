/**
 * End-to-end tests: Studio Promo Preview — client→preview encoding round-trip
 *
 * Guards against the btoa() crash that surfaced when users entered Unicode
 * characters (apostrophes, emoji, curly quotes, em-dashes) in the Studio form.
 * The form now uses encodeURIComponent(JSON.stringify(…)) — no base64 layer.
 *
 * Strategy: build the preview URL using the SAME encoding the form uses,
 * running `encodeURIComponent(JSON.stringify(data))` inside the browser via
 * page.evaluate() so Playwright never re-encodes the query string.  Then
 * navigate to the resulting URL and assert .promo-ready is in the DOM.
 *
 * Run:
 *   npx playwright test e2e/studio-promo-preview-roundtrip.spec.ts
 */

import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5000";

// PromoData shape (must match the interface in studio-promo-preview.tsx)
interface PromoData {
  brandName: string;
  tagline?: string;
  productDescription: string;
  stylePreset: string;
  callToAction?: string;
  images: string[];
  targetDuration: number;
}

/**
 * Build the preview URL using the SAME encoding the form uses,
 * running encodeURIComponent(JSON.stringify(…)) inside the browser.
 * This avoids Playwright re-encoding multi-byte characters in the
 * query string before navigation.
 *
 * Also passes &headless=1 so the preview renders in a fixed 1280×720
 * container without the scale() wrapper.
 */
async function buildAndNavigate(page: import("@playwright/test").Page, data: PromoData) {
  // First land on a page in the same origin so page.evaluate has a window
  await page.goto(`${BASE}/studio/promo/preview`, { waitUntil: "load", timeout: 20_000 });

  const previewUrl = await page.evaluate((promoData: PromoData) => {
    // This is exactly the encoding the form does:
    // encodeURIComponent(JSON.stringify(promoData))
    const encoded = encodeURIComponent(JSON.stringify(promoData));
    return `/studio/promo/preview?d=${encoded}&headless=1`;
  }, data);

  // Navigate using the URL the browser itself constructed — no re-encoding
  await page.goto(`${BASE}${previewUrl}`, { waitUntil: "load", timeout: 30_000 });
}

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe("Studio Promo — client→preview Unicode round-trip", () => {
  /**
   * Primary regression test: the exact characters that crashed btoa() in the
   * native app — apostrophes, curly quotes, em-dashes, mixed with emoji.
   */
  test("preview mounts .promo-ready with apostrophes, curly quotes, em-dashes and emoji", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    const data: PromoData = {
      brandName: "GUBER \uD83C\uDFA5",            // 🎥  via surrogate notation
      tagline: "Can\u2019t be there? Send \u2014 GUBER",  // curly ' + em-dash
      productDescription: "\u201CYou ask. They go. You see.\u201D",  // curly quotes
      stylePreset: "professional",
      callToAction: "Book Now \u2728",             // ✨ sparkle
      images: [],
      targetDuration: 5,
    };

    await buildAndNavigate(page, data);

    // .promo-ready is a hidden DOM marker appended by PromoPlayer once React
    // has fully mounted and fonts are ready — its presence proves no blank screen.
    await page.waitForSelector(".promo-ready", { state: "attached", timeout: 20_000 });

    // No uncaught JS exceptions should have occurred during decode + render
    expect(jsErrors, "no uncaught JS errors during Unicode promo decode").toHaveLength(0);
  });

  /**
   * Emoji-only brand name — previously caused btoa() to throw
   * InvalidCharacterError in the native webview.
   */
  test("preview mounts .promo-ready with emoji brand name and tagline", async ({ page }) => {
    const data: PromoData = {
      brandName: "\uD83C\uDFA5 Studio",            // 🎥 Studio
      tagline: "Drive. Deliver. Done. \uD83D\uDE97", // 🚗
      productDescription: "Same-day delivery powered by GUBER.",
      stylePreset: "energetic",
      callToAction: "Go! \uD83D\uDE80",             // 🚀
      images: [],
      targetDuration: 5,
    };

    await buildAndNavigate(page, data);
    await page.waitForSelector(".promo-ready", { state: "attached", timeout: 20_000 });
  });

  /**
   * Curly quotes and apostrophes — the other half of the original bug report.
   */
  test("preview mounts .promo-ready with curly quotes and apostrophes", async ({ page }) => {
    const data: PromoData = {
      brandName: "O\u2019Brien\u2019s Law",          // O'Brien's (curly apostrophes)
      tagline: "\u201CJustice You Can Trust\u201D",  // "Justice You Can Trust"
      productDescription: "It\u2019s your \u2018right\u2019 \u2014 fight for it.",
      stylePreset: "professional",
      callToAction: "Don\u2019t Wait",
      images: [],
      targetDuration: 5,
    };

    await buildAndNavigate(page, data);
    await page.waitForSelector(".promo-ready", { state: "attached", timeout: 20_000 });
  });

  /**
   * Full client→preview round-trip: mirrors what the form does.
   *
   * Runs encodeURIComponent(JSON.stringify(…)) in the browser (same code path
   * as studio-promo-code.tsx) and then navigates the same page to the preview
   * URL, asserting .promo-ready mounts. No auth required — /studio/promo/preview
   * is a public route.
   */
  test("form encoding round-trip: browser-encoded URL decodes and renders .promo-ready", async ({ page }) => {
    // This is the hardest Unicode combo: mixed scripts + emoji + special punctuation
    const data: PromoData = {
      brandName: "R\u00F6sti & Gr\u00FC\u00DFe",    // Rösti & Grüße (accented Latin)
      tagline: "Premium service \u2014 starting at \u20AC49", // em-dash + €
      productDescription: "Trusted by 10\u2019000+ customers worldwide.",
      stylePreset: "luxury",
      callToAction: "Learn More \u203A",              // › (single right angle quote)
      images: [],
      targetDuration: 5,
    };

    // Land on the origin first (gives page.evaluate a window context)
    await page.goto(`${BASE}/studio/promo/preview`, { waitUntil: "load", timeout: 20_000 });

    // Encode exactly as the form does, inside the browser's JS engine
    const previewUrl: string = await page.evaluate((promoData: PromoData) => {
      const encoded = encodeURIComponent(JSON.stringify(promoData));
      return `/studio/promo/preview?d=${encoded}&headless=1&t=1`;
    }, data);

    // Verify the URL structure (catches obvious encoding regressions)
    expect(previewUrl).toContain("/studio/promo/preview");
    expect(previewUrl).toContain("?d=");
    expect(previewUrl.length).toBeGreaterThan(50);

    // Navigate to the URL the browser just constructed
    await page.goto(`${BASE}${previewUrl}`, { waitUntil: "load", timeout: 30_000 });
    await page.waitForSelector(".promo-ready", { state: "attached", timeout: 20_000 });
  });
});
