import { test, expect, type Page, type Route } from "@playwright/test";

const CAMPAIGN_CODE = "DOOR42";
const CAMPAIGN_SESSION = "d".repeat(32);

const doorRegion = (page: Page) =>
  page.locator('[aria-label="GUBER entry — tap to open"]');

async function installUnauthenticatedSession(page: Page) {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Not authenticated" }),
    });
  });
}

async function expectDoorGatedHome(page: Page) {
  await expect(page.getByTestId("page-home")).toBeVisible();
  await expect(doorRegion(page)).toBeVisible();
  await expect(page.getByTestId("jac-live-surface")).toHaveCount(0);
  await expect(doorRegion(page).getByRole("button", { name: "Enter Team GUBER" })).toHaveCount(1);
}

test.describe("Team GUBER cinematic entry door", () => {
  test("a fresh home visit shows the door before the canonical JAC surface", async ({ page }) => {
    await installUnauthenticatedSession(page);

    await page.goto("/");
    await expectDoorGatedHome(page);
  });

  test("every web refresh shows the door even for returning visitors", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("guberDoorSplashSeen", "1"));
    await installUnauthenticatedSession(page);

    await page.goto("/");
    await expectDoorGatedHome(page);
  });

  test("opening the door reveals JAC in-scene before optional Explore", async ({ page }) => {
    await installUnauthenticatedSession(page);

    await page.goto("/");
    await expectDoorGatedHome(page);

    await doorRegion(page).getByRole("button", { name: "Enter Team GUBER" }).click();
    const scene = page.locator('[aria-label="Team GUBER HQ"]');
    await expect(scene).toBeVisible();
    await expect(page.getByTestId("guber-door-panel-left")).toHaveAttribute("data-open", "true");
    await expect(page.getByTestId("guber-door-panel-right")).toHaveAttribute("data-open", "true");
    await expect(page.getByTestId("guber-greeting")).toHaveText(
      "Welcome to Team Guber. What brings you here?",
    );
    await expect(page.getByRole("button", { name: "Talk to JAC with voice" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Type to JAC instead" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("jac-live-surface")).toHaveCount(0);
  });

  test("Explore is the optional escape to the canonical JAC surface", async ({ page }) => {
    await installUnauthenticatedSession(page);

    await page.goto("/");
    await expectDoorGatedHome(page);

    await doorRegion(page).getByRole("button", { name: "Enter Team GUBER" }).click();
    await page.getByRole("button", { name: "Type to JAC instead" }).click();
    await page.getByRole("button", { name: "Go to full app" }).click();

    await expect(doorRegion(page)).toHaveCount(0);
    await expect(page.getByTestId("jac-live-surface")).toHaveCount(1);
  });

  test("a fresh campaign join reaches the same door-gated home flow", async ({ page }) => {
    const campaignRequests: unknown[] = [];
    const session = {
      sessionId: CAMPAIGN_SESSION,
      kind: "consumer",
      source: "flyer",
      referralCode: CAMPAIGN_CODE,
      invitationCode: null,
      originalIntent: "discover_guber",
      currentIntent: "discover_guber",
      resumePath: "/dashboard",
      context: {},
      status: "active",
      expiresAt: "2030-01-01T00:00:00.000Z",
    };

    await installUnauthenticatedSession(page);
    await page.route("**/api/onboarding/campaign-session", async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      campaignRequests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(session),
      });
    });

    await page.goto(`/join/${CAMPAIGN_CODE}`);
    await expect(page).toHaveURL(
      new RegExp(`\\/?\\?campaignSession=${CAMPAIGN_SESSION}&campaignKind=consumer$`),
    );
    await expectDoorGatedHome(page);

    expect(campaignRequests).toEqual([
      expect.objectContaining({
        kind: "consumer",
        code: CAMPAIGN_CODE,
        source: "flyer",
      }),
    ]);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("guber_ref")))
      .toBe(CAMPAIGN_CODE);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("guber_campaign_session")))
      .toBe(CAMPAIGN_SESSION);
  });
});