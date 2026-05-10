/**
 * E2E tests: MobileReturnBanner visibility (task-572)
 *
 * Verifies that the "Return to app" banner:
 *   - appears on a mobile viewport when a purchase-success param is present
 *   - disappears after clicking the dismiss button
 *   - stays hidden on a desktop viewport (the default project config)
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
