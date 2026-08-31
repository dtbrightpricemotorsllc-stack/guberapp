import { test, expect, type Page, type Route } from "@playwright/test";

const DOOR_SEEN_KEY = "guberDoorSplashSeen";
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
}

test.describe("Team GUBER first-visit door", () => {
  test("a fresh home visit shows the door before the canonical JAC surface", async ({ page }) => {
    await page.addInitScript((key) => localStorage.removeItem(key), DOOR_SEEN_KEY);
    await installUnauthenticatedSession(page);

    await page.goto("/");
    await expectDoorGatedHome(page);
  });

  test("?doortest=1 shows the door even for returning visitors", async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, "1"), DOOR_SEEN_KEY);
    await installUnauthenticatedSession(page);

    await page.goto("/?doortest=1");
    await expectDoorGatedHome(page);
  });

  test("completing the door leaves exactly one canonical JAC surface", async ({ page }) => {
    await page.addInitScript((key) => localStorage.removeItem(key), DOOR_SEEN_KEY);
    await installUnauthenticatedSession(page);

    await page.goto("/");
    await expectDoorGatedHome(page);

    await doorRegion(page).getByRole("button", { name: "Enter Team GUBER" }).click();
    await page.getByRole("button", { name: "Type to JAC instead" }).click();
    await page.getByRole("button", { name: "Go to full app" }).click();

    await expect(doorRegion(page)).toHaveCount(0);
    await expect(page.getByTestId("jac-live-surface")).toHaveCount(1);
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), DOOR_SEEN_KEY))
      .toBe("1");
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

    await page.addInitScript((key) => localStorage.removeItem(key), DOOR_SEEN_KEY);
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