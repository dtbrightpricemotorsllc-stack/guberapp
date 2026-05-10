/**
 * E2E tests: MobileReturnBanner visibility (task-572, task-576)
 *
 * Verifies that the "Return to app" banner:
 *   - appears on a mobile viewport when a purchase-success param is present
 *   - disappears after clicking the dismiss button
 *   - stays hidden on a desktop viewport (the default project config)
 *   - appears on /studio?credits=success (actual mobile checkout redirect target for studio_credits)
 *   - appears on /studio?subscription=success (actual redirect for studio_subscription)
 *   - the guber:// deep-link anchor is present in every banner instance
 *
 * Run:
 *   npx playwright test e2e/mobile-return-banner.spec.ts
 */

import { test, expect, devices } from "@playwright/test";

const DEMO_EMAIL = "demo.consumer@guberapp.internal";
const DEMO_PASSWORD = "GuberDemo2026!";

async function loginAs(
  page: Parameters<Parameters<typeof test>[1]>[0]["page"],
  email: string,
  password: string
) {
  await page.goto("/login");
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("button-login-submit").click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 12_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile: banner visible with credits=success param
// ─────────────────────────────────────────────────────────────────────────────
test("MobileReturnBanner: visible on mobile viewport with credits=success param", async ({
  browser,
}) => {
  const iphone = devices["iPhone 12"];
  const context = await browser.newContext({
    ...iphone,
  });
  const page = await context.newPage();

  try {
    await loginAs(page, DEMO_EMAIL, DEMO_PASSWORD);
    await page.goto("/studio/credits?credits=success");

    await expect(
      page.getByTestId("banner-mobile-return")
    ).toBeVisible({ timeout: 8_000 });
  } finally {
    await context.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Mobile: banner disappears after dismiss
// ─────────────────────────────────────────────────────────────────────────────
test("MobileReturnBanner: dismiss button hides the banner on mobile", async ({
  browser,
}) => {
  const iphone = devices["iPhone 12"];
  const context = await browser.newContext({
    ...iphone,
  });
  const page = await context.newPage();

  try {
    await loginAs(page, DEMO_EMAIL, DEMO_PASSWORD);
    await page.goto("/studio/credits?credits=success");

    const banner = page.getByTestId("banner-mobile-return");
    await expect(banner).toBeVisible({ timeout: 8_000 });

    await page.getByTestId("button-dismiss-return-banner").click();
    await expect(banner).not.toBeVisible({ timeout: 3_000 });
  } finally {
    await context.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Desktop: banner always hidden regardless of query param
// ─────────────────────────────────────────────────────────────────────────────
test("MobileReturnBanner: hidden on desktop viewport with credits=success param", async ({
  page,
}) => {
  // The default playwright project uses Desktop Chrome — no UA override needed.
  await loginAs(page, DEMO_EMAIL, DEMO_PASSWORD);
  await page.goto("/studio/credits?credits=success");

  // Give the page a moment to settle; the banner should never appear.
  await page.waitForTimeout(1_500);
  await expect(
    page.getByTestId("banner-mobile-return")
  ).not.toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-11 (task-576): banner visible on /studio?credits=success
// This is the ACTUAL success_url target used by GET /api/mobile/checkout-redirect
// for product=studio_credits. The previous tests used /studio/credits which is
// only correct for the web (non-iOS) checkout flow.
// ─────────────────────────────────────────────────────────────────────────────
test("MobileReturnBanner: visible on /studio with credits=success param (mobile checkout redirect target)", async ({
  browser,
}) => {
  const iphone = devices["iPhone 12"];
  const context = await browser.newContext({ ...iphone });
  const page = await context.newPage();

  try {
    await loginAs(page, DEMO_EMAIL, DEMO_PASSWORD);
    // /studio?credits=success is the actual success_url set by the mobile
    // checkout-redirect route for studio_credits purchases.
    await page.goto("/studio?credits=success");

    await expect(
      page.getByTestId("banner-mobile-return")
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    await context.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-12 (task-576): banner visible on /studio?subscription=success
// Mirrors TC-11 for studio_subscription purchases.
// ─────────────────────────────────────────────────────────────────────────────
test("MobileReturnBanner: visible on /studio with subscription=success param (mobile checkout redirect target)", async ({
  browser,
}) => {
  const iphone = devices["iPhone 12"];
  const context = await browser.newContext({ ...iphone });
  const page = await context.newPage();

  try {
    await loginAs(page, DEMO_EMAIL, DEMO_PASSWORD);
    await page.goto("/studio?subscription=success");

    await expect(
      page.getByTestId("banner-mobile-return")
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    await context.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-11/12 deep-link check: guber:// anchor is present in the banner
// ─────────────────────────────────────────────────────────────────────────────
test("MobileReturnBanner: guber:// deep-link anchor is present when banner is shown", async ({
  browser,
}) => {
  const iphone = devices["iPhone 12"];
  const context = await browser.newContext({ ...iphone });
  const page = await context.newPage();

  try {
    await loginAs(page, DEMO_EMAIL, DEMO_PASSWORD);
    await page.goto("/studio?credits=success");

    const link = page.getByTestId("link-return-to-app");
    await expect(link).toBeVisible({ timeout: 10_000 });
    const href = await link.getAttribute("href");
    expect(href).toBe("guber://");
  } finally {
    await context.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-13 (task-576): banner visible on /og-success (Day-1 OG mobile redirect)
// success_url for day1og product is /og-success?session_id={CHECKOUT_SESSION_ID}
// ─────────────────────────────────────────────────────────────────────────────
test("MobileReturnBanner: visible on /og-success with session_id param (Day-1 OG redirect)", async ({
  browser,
}) => {
  const iphone = devices["iPhone 12"];
  const context = await browser.newContext({ ...iphone });
  const page = await context.newPage();

  try {
    await loginAs(page, DEMO_EMAIL, DEMO_PASSWORD);
    // Simulate return from Stripe with a fake session ID — the banner renders
    // for any truthy session_id value (show={!!sessionId} in og-success.tsx).
    await page.goto("/og-success?session_id=cs_test_placeholder");

    await expect(
      page.getByTestId("banner-mobile-return")
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    await context.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-14 (task-576): banner visible on /ai-or-not?trustbox=success (Trust Box)
// success_url for trust_box product is /ai-or-not?trustbox=success
// ─────────────────────────────────────────────────────────────────────────────
test("MobileReturnBanner: visible on /ai-or-not with trustbox=success param (Trust Box redirect)", async ({
  browser,
}) => {
  const iphone = devices["iPhone 12"];
  const context = await browser.newContext({ ...iphone });
  const page = await context.newPage();

  try {
    await loginAs(page, DEMO_EMAIL, DEMO_PASSWORD);
    await page.goto("/ai-or-not?trustbox=success");

    await expect(
      page.getByTestId("banner-mobile-return")
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    await context.close();
  }
});
