/**
 * Live-like JAC acceptance flow.
 *
 * Uses the real homepage, login form, demo-account session cookie, authenticated
 * dashboard, JAC components, storage handoff, and navigation. Provider responses
 * are deterministic at browser boundaries so CI never publishes, pays, or relies
 * on OpenAI availability.
 */

import { test, expect, type Page, type Route } from "@playwright/test";

const DEMO_EMAIL = "demo.consumer@guberapp.internal";
const DEMO_PASSWORD = "GuberDemo2026!";
const PUBLIC_TEXT_REPLY = "I can explain your options and keep the next step safe.";
const AUTH_TEXT_REPLY = "Your profile is the safe place to review those account details.";

async function dismissDashboardOverlays(page: Page) {
  const gpsConfirm = page.getByTestId("button-gps-disclaimer-confirm");
  const alertClose = page.getByTestId("button-close-alert-modal");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await alertClose.isVisible({ timeout: 250 }).catch(() => false)) await alertClose.click();
    if (await gpsConfirm.isVisible({ timeout: 250 }).catch(() => false)) await gpsConfirm.click();
    const gpsVisible = await page.getByTestId("modal-gps-disclaimer").isVisible({ timeout: 100 }).catch(() => false);
    const alertVisible = await page.getByTestId("modal-alert-prompt").isVisible({ timeout: 100 }).catch(() => false);
    if (!gpsVisible && !alertVisible) return;
    await page.waitForTimeout(200);
  }
}

async function enterCanonicalJac(page: Page) {
  const doorEntry = page.getByRole("button", { name: "Enter Team GUBER" });
  if (await doorEntry.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await doorEntry.click();
    const cinematic = page.getByTestId("guber-door-cinematic");
    await cinematic.evaluate((video: HTMLVideoElement) => {
      video.pause();
      video.dispatchEvent(new Event("ended"));
    });
    await page.getByRole("button", { name: "Switch to typing" }).click();
    await page.getByRole("button", { name: "Go to full app" }).click();
    await expect(page.getByTestId("guber-door-scene")).toHaveCount(0);
  }
  await expect(page.getByTestId("jac-live-surface")).toBeVisible();
}

test("JAC takes a real user from greeting to a safe action across login", async ({ page }) => {
  const origin = new URL(process.env.E2E_BASE_URL || "http://localhost:5000").origin;
  await page.context().grantPermissions(["microphone"], { origin });
  await page.addInitScript(() => {
    localStorage.setItem("guber_alert_status", "granted");
    localStorage.setItem("guber_alert_modal_autoshown", "true");
  });

  const unsafeRequests: string[] = [];
  let assistantTextAttempts = 0;

  const blockUnsafeMutation = async (route: Route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.continue();
      return;
    }
    const path = new URL(request.url()).pathname;
    unsafeRequests.push(`${request.method()} ${path}`);
    await route.fulfill({
      status: 418,
      contentType: "application/json",
      body: JSON.stringify({ message: "unsafe smoke-test mutation blocked" }),
    });
  };
  await page.route("**/api/jobs", blockUnsafeMutation);
  await page.route("**/api/marketplace", blockUnsafeMutation);
  await page.route("**/api/load-board", blockUnsafeMutation);
  await page.route("**/api/jac/publish-job", blockUnsafeMutation);
  await page.route(/\/api\/.*(?:checkout|payment-intent|payout|capture-payment|stripe-transfer)/i, blockUnsafeMutation);

  await page.route("**/api/jac/onboard", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reply: PUBLIC_TEXT_REPLY, route: null, actions: [], options: [] }),
    });
  });
  await page.route("**/api/ai/guber-assist", async (route) => {
    assistantTextAttempts += 1;
    if (assistantTextAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "temporary response outage" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: AUTH_TEXT_REPLY,
        route: "/profile",
        actions: [],
        options: [],
      }),
    });
  });
  await page.route("**/api/jac/briefing", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: null, chips: [] }) }));
  await page.route("**/api/jac/context", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }));
  await page.route("**/api/jac/opportunities", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }));
  await page.route("**/api/jac/pending-draft-card", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ card: null }) }));

  // Enter the canonical JAC surface through the existing text path. Live voice
  // behavior is covered separately by the mobile/door acceptance specs.
  await page.goto("/?jac_e2e=1");
  await expect(page.getByTestId("page-home")).toBeVisible();
  await enterCanonicalJac(page);
  const publicInput = page.getByPlaceholder("Type to JAC…");
  await publicInput.fill("Please remember that I need account guidance.");
  await publicInput.press("Enter");
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByTestId("jac-live-transcript")).toContainText(PUBLIC_TEXT_REPLY);

  // Use the real login form and demo fixture account in the same tab so browser
  // session storage represents the actual handoff a user experiences.
  await page.getByTestId("link-nav-signin").click();
  await page.getByTestId("input-email").fill(DEMO_EMAIL);
  await page.getByTestId("input-password").fill(DEMO_PASSWORD);
  await page.getByTestId("input-password").press("Enter");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("page-dashboard")).toBeVisible();
  await dismissDashboardOverlays(page);

  // The authenticated dashboard deliberately remains text-only so the public
  // door/canonical surface remains the single live voice owner.
  await page.getByTestId("button-guber-assistant").click();
  const thread = page.getByTestId("assistant-message-thread");
  await expect(thread).toContainText(PUBLIC_TEXT_REPLY);
  await expect(page.getByTestId("button-dd-mic")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start voice" })).toHaveCount(0);

  // Text failure is explicit, a second request succeeds, and the only action in
  // the smoke path is safe navigation to the profile page.
  const input = page.getByTestId("input-assistant-message");
  await input.fill("Help me review my account choices.");
  await input.press("Enter");
  await expect(thread).toContainText("Sorry, I'm having trouble right now. Please try again in a moment.");
  await input.fill("Please try that account guidance again.");
  await input.press("Enter");
  await expect(thread).toContainText(AUTH_TEXT_REPLY);
  await page.locator("[data-testid^='button-dd-route-']").last().click();
  await expect(page).toHaveURL(/\/profile$/);

  expect(unsafeRequests).toEqual([]);
});