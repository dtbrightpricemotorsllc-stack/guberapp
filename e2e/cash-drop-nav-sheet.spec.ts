import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const BASE = "http://localhost:5000";

const LIAB_EMAIL = "liability_test@guberapp.internal";
const LIAB_PASS = "LibTest2026!";

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getToken(request: APIRequestContext, email: string, pass: string): Promise<string> {
  const res = await request.post(`${BASE}/api/auth/login`, { data: { email, password: pass } });
  const body = await res.json();
  if (!body.token) throw new Error(`Login failed for ${email}: ${JSON.stringify(body)}`);
  return body.token;
}

async function gotoAsUser(
  page: Page,
  request: APIRequestContext,
  url: string,
  email: string,
  pass: string,
): Promise<string> {
  await page.goto(`${BASE}/login?nosplash=1`);
  const token = await getToken(request, email, pass);
  await page.evaluate((t: string) => localStorage.setItem("guber_token", t), token);
  await page.goto(url);
  return token;
}

async function clearPreferredMapApp(request: APIRequestContext, token: string): Promise<void> {
  await request.post(`${BASE}/api/users/me/preferred-map-app`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { app: null },
  });
}

async function createFixture(
  request: APIRequestContext,
  opts: { allSlotsTaken?: boolean; createAcceptedAttempt?: boolean } = {},
): Promise<number> {
  const res = await request.post(`${BASE}/api/test/create-cash-drop-fixture`, {
    data: { userEmail: LIAB_EMAIL, ...opts },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.dropId as number;
}

async function cleanup(request: APIRequestContext, dropId: number): Promise<void> {
  const res = await request.post(`${BASE}/api/test/cleanup-cash-drop-fixture`, { data: { dropId } });
  if (res.status() !== 200) {
    console.warn(`Cleanup warning: status ${res.status()} for dropId ${dropId} — ${await res.text()}`);
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe("Cash Drop nav sheet", () => {
  test("nav sheet opens with title + Google + Waze buttons after accepting via safety modal", async ({
    page,
    request,
  }) => {
    const dropId = await createFixture(request, { allSlotsTaken: false, createAcceptedAttempt: false });

    try {
      const token = await gotoAsUser(
        page,
        request,
        `${BASE}/cash-drop/${dropId}?nosplash=1`,
        LIAB_EMAIL,
        LIAB_PASS,
      );

      // Reset preferred map app so the sheet always opens (never bypassed by direct launch)
      await clearPreferredMapApp(request, token);

      // Wait for accept button to appear
      const acceptBtn = page.getByTestId("button-accept-cash-drop");
      await expect(acceptBtn).toBeVisible({ timeout: 15_000 });

      // Click opens the safety modal
      await acceptBtn.click();
      const safetyDialog = page.getByTestId("dialog-cash-drop-safety");
      await expect(safetyDialog).toBeVisible({ timeout: 5_000 });

      // Confirm safety modal — triggers acceptMutation → attempt.status becomes "accepted"
      await page.getByTestId("button-confirm-safety").click();
      await expect(safetyDialog).not.toBeVisible({ timeout: 5_000 });

      // Nav buttons should appear once the attempt is accepted
      const googleBtn = page.getByTestId("link-google-maps-cash-drop");
      await expect(googleBtn).toBeVisible({ timeout: 10_000 });

      // Click the Google Maps button — opens the nav sheet (no preferred provider set)
      await googleBtn.click();

      // Sheet must appear with the expected elements
      const sheet = page.getByTestId("sheet-navigation-launch");
      await expect(sheet).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId("text-nav-sheet-title")).toBeVisible();
      await expect(page.getByTestId("button-nav-launch-google")).toBeVisible();
      await expect(page.getByTestId("button-nav-launch-waze")).toBeVisible();
    } finally {
      await cleanup(request, dropId);
    }
  });

  test("warning banner is shown when all winner slots are already taken", async ({
    page,
    request,
  }) => {
    const dropId = await createFixture(request, {
      allSlotsTaken: true,
      createAcceptedAttempt: true,
    });

    try {
      const token = await gotoAsUser(
        page,
        request,
        `${BASE}/cash-drop/${dropId}?nosplash=1`,
        LIAB_EMAIL,
        LIAB_PASS,
      );

      // Reset preferred map app so the sheet always opens
      await clearPreferredMapApp(request, token);

      // Nav buttons appear because attempt.status === "accepted" && drop.status === "active"
      const googleBtn = page.getByTestId("link-google-maps-cash-drop");
      await expect(googleBtn).toBeVisible({ timeout: 15_000 });

      // Click opens the nav sheet — warning is present because all slots are filled
      await googleBtn.click();

      const sheet = page.getByTestId("sheet-navigation-launch");
      await expect(sheet).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId("banner-nav-sheet-warning")).toBeVisible();
    } finally {
      await cleanup(request, dropId);
    }
  });
});
