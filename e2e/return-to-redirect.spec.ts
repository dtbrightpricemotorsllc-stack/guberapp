/**
 * End-to-end tests: post-login returnTo redirect behaviour
 *
 * These tests exercise the full browser round-trip:
 *   protected page → session expiry / auth guard → /login?returnTo=<path>
 *   → user signs in → lands back on original protected page
 *
 * Prerequisites:
 *   npx playwright install chromium   (one-time, downloads browser binary)
 *   npm run dev                       (or handled by webServer in playwright.config.ts)
 *
 * Run:
 *   npx playwright test
 *   npx playwright test e2e/return-to-redirect.spec.ts
 */

import { test, expect, Page } from "@playwright/test";

const DEMO_EMAIL = "demo.consumer@guberapp.internal";
const DEMO_PASSWORD = "GuberDemo2026!";

async function loginAs(page: Page, email: string, password: string) {
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("button-login-submit").click();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: ProtectedRoute redirect
// Navigating to a protected page while unauthenticated produces a
// /login?returnTo=<path> redirect; completing login returns to that path.
// ─────────────────────────────────────────────────────────────────────────────
test("ProtectedRoute: unauthenticated visit → login with returnTo → back to original page", async ({
  page,
}) => {
  // 1. Go directly to a protected page without being logged in.
  await page.goto("/browse-jobs");

  // 2. The ProtectedRoute guard should redirect to /login?returnTo=%2Fbrowse-jobs.
  await expect(page).toHaveURL(/\/login/);
  const url = new URL(page.url());
  expect(url.searchParams.get("returnTo")).toBe("/browse-jobs");

  // 3. Complete login with the demo consumer account.
  await loginAs(page, DEMO_EMAIL, DEMO_PASSWORD);

  // 4. Should land back on /browse-jobs, not the default /dashboard.
  await expect(page).toHaveURL(/\/browse-jobs/);
  await expect(page).not.toHaveURL(/\/login/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: handleExpiredSession() path
// A user with a valid session navigates to a page. Their session token becomes
// invalid (simulated by replacing the token with a garbage value and destroying
// the server session). When the app's TanStack queries refetch on focus, the
// 401 triggers handleExpiredSession(), which sets window.location.href to
// /login?reason=session_expired&returnTo=<currentPath>.
// Completing login returns the user to the page they were on.
// ─────────────────────────────────────────────────────────────────────────────
test("handleExpiredSession: invalid token triggers session-expired redirect → login → back to original page", async ({
  page,
}) => {
  // 1. Log in as demo consumer.
  await page.goto("/login");
  await loginAs(page, DEMO_EMAIL, DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/);

  // 2. Navigate to /marketplace and wait for it to fully load.
  await page.goto("/marketplace");
  await expect(page.getByTestId("page-marketplace")).toBeVisible();

  // 3. Simulate session expiry:
  //    - Put a garbage JWT in localStorage so getToken() returns a non-null value
  //      (required for handleExpiredSession to fire the redirect).
  //    - Destroy the server-side session so all subsequent API calls return 401.
  await page.evaluate(async () => {
    localStorage.setItem("guber_token", "stale.invalid.jwt.xyz");
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  });

  // 4. Dispatch a focus event to trigger TanStack Query refetches; the first
  //    query that returns 401 will call handleExpiredSession().
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  // 5. Wait for the redirect to /login with the correct query params.
  await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  const loginUrl = new URL(page.url());
  const returnTo = loginUrl.searchParams.get("returnTo");
  expect(returnTo).toMatch(/\/marketplace/);

  // 6. Log in again.
  await loginAs(page, DEMO_EMAIL, DEMO_PASSWORD);

  // 7. Should land back on /marketplace, completing the full round-trip.
  await expect(page).toHaveURL(/\/marketplace/, { timeout: 8_000 });
  await expect(page).not.toHaveURL(/\/login/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: External returnTo is rejected (open-redirect protection)
// A malicious link like /login?returnTo=https://evil.com must not redirect
// the user outside the app after login.
// ─────────────────────────────────────────────────────────────────────────────
test("open-redirect guard: external returnTo is rejected and falls back to /dashboard", async ({
  page,
}) => {
  // 1. Navigate to /login with a crafted external returnTo.
  await page.goto("/login?returnTo=https%3A%2F%2Fevil.com");

  // 2. Log in.
  await loginAs(page, DEMO_EMAIL, DEMO_PASSWORD);

  // 3. Must NOT navigate to an external domain — should land on /dashboard.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 6_000 });
  await expect(page).not.toHaveURL(/evil\.com/);
});
