import { test, expect, type Page } from "@playwright/test";

const BASE_URL = "http://localhost:5000";
const LOGIN_EMAIL = "sarah@example.com";
const LOGIN_PASSWORD = "password123";
const CASH_DROP_ID = 4;
const CASH_DROP_PATH = `/cash-drop/${CASH_DROP_ID}`;
const ARRIVED_API = `/api/cash-drops/${CASH_DROP_ID}/arrived`;
const GPS_STORAGE_KEY = "guber_gps_ok";

async function loginAndGoToDrop(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login?nosplash=1`);
  await page.getByRole("textbox", { name: /email/i }).fill(LOGIN_EMAIL);
  await page.getByRole("textbox", { name: /password/i }).fill(LOGIN_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in|login|submit/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 10_000,
  });
  await page.goto(`${BASE_URL}${CASH_DROP_PATH}?nosplash=1`);
}

async function resetGpsState(page: Page): Promise<void> {
  const modal = page.getByTestId("modal-gps-disclaimer");
  if (await modal.isVisible()) {
    await page.getByTestId("button-gps-disclaimer-confirm").click();
    await expect(modal).not.toBeVisible({ timeout: 3_000 });
    await page.waitForTimeout(300);
  }
  await page.evaluate((key: string) => localStorage.removeItem(key), GPS_STORAGE_KEY);
}

test.describe("GPS Disclaimer Gate", () => {
  test("modal appears and blocks the GPS action before disclaimer is accepted", async ({
    page,
  }) => {
    await loginAndGoToDrop(page);
    await resetGpsState(page);

    const requestsFired: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes(ARRIVED_API)) requestsFired.push(req.url());
    });

    const modal = page.getByTestId("modal-gps-disclaimer");
    const arrivedBtn = page.getByTestId("button-i-arrived");
    await expect(arrivedBtn).toBeVisible({ timeout: 10_000 });

    await arrivedBtn.click();

    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("button-gps-disclaimer-confirm")).toBeVisible();

    await page.waitForTimeout(500);
    expect(requestsFired).toHaveLength(0);
  });

  test("clicking Got it, continue dismisses the modal and allows the GPS action to proceed", async ({
    page,
  }) => {
    await loginAndGoToDrop(page);
    await resetGpsState(page);

    const arrivedRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes(ARRIVED_API)) arrivedRequests.push(req.url());
    });

    const modal = page.getByTestId("modal-gps-disclaimer");
    const arrivedBtn = page.getByTestId("button-i-arrived");
    await expect(arrivedBtn).toBeVisible({ timeout: 10_000 });

    await arrivedBtn.click();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    expect(arrivedRequests).toHaveLength(0);

    const arrivedRequestPromise = page.waitForRequest(
      (req) => req.url().includes(ARRIVED_API) && req.method() === "POST",
      { timeout: 12_000 }
    );

    await page.getByTestId("button-gps-disclaimer-confirm").click();

    await expect(modal).not.toBeVisible({ timeout: 5_000 });

    await page.waitForFunction(
      (key: string) => localStorage.getItem(key) === "1",
      GPS_STORAGE_KEY,
      { timeout: 5_000 }
    );

    await arrivedRequestPromise;
    expect(arrivedRequests.length).toBeGreaterThan(0);
  });

  test("modal does not re-appear on subsequent GPS actions once accepted in the same session", async ({
    page,
  }) => {
    await loginAndGoToDrop(page);
    await resetGpsState(page);

    const modal = page.getByTestId("modal-gps-disclaimer");
    const arrivedBtn = page.getByTestId("button-i-arrived");
    await expect(arrivedBtn).toBeVisible({ timeout: 10_000 });

    await arrivedBtn.click();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("button-gps-disclaimer-confirm").click();
    await expect(modal).not.toBeVisible({ timeout: 5_000 });

    await page.waitForFunction(
      (key: string) => localStorage.getItem(key) === "1",
      GPS_STORAGE_KEY,
      { timeout: 5_000 }
    );

    await page.goto(`${BASE_URL}${CASH_DROP_PATH}?nosplash=1`);
    await expect(arrivedBtn).toBeVisible({ timeout: 10_000 });

    const gpsOkAfterNav = await page.evaluate(
      (key: string) => localStorage.getItem(key),
      GPS_STORAGE_KEY
    );
    expect(gpsOkAfterNav).toBe("1");

    await expect(arrivedBtn).toBeEnabled({ timeout: 5_000 });
    await arrivedBtn.click();
    await page.waitForTimeout(1_500);
    await expect(modal).not.toBeVisible();
  });
});
