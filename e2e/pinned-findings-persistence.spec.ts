/**
 * End-to-end tests: pinned findings persistence and cross-session sync
 *
 * Verifies the full round-trip:
 *   Admin opens the diagnostic assistant, pins a finding via the UI (with a
 *   note and category), reloads the page, confirms the finding still appears
 *   in the Pinned tab (server-side persistence), then unpins and verifies
 *   removal — all against the real API and database.
 *
 * Prerequisites:
 *   npx playwright install chromium   (one-time)
 *   npm run dev                       (or handled by webServer in playwright.config.ts)
 *
 * Run:
 *   npx playwright test e2e/pinned-findings-persistence.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@guberapp.com";
const ADMIN_PASSWORD = "Bouncer76!";

const FINDING_MARKER = "E2E_PERSISTENCE_TEST";
const FINDING_NOTE = `${FINDING_MARKER}: pinned-via-UI note`;
const FINDING_CATEGORY = "Critical";

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login?nosplash=1");
  await page.getByTestId("input-email").fill(ADMIN_EMAIL);
  await page.getByTestId("input-password").fill(ADMIN_PASSWORD);
  await page.getByTestId("button-login-submit").click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
}

async function cleanupTestFindings(page: Page): Promise<void> {
  const res = await page.request.get("/api/admin/pinned-findings");
  if (!res.ok()) return;
  const findings = (await res.json()) as Array<{ id: number; note?: string }>;
  for (const f of findings) {
    if ((f.note ?? "").includes(FINDING_MARKER)) {
      await page.request.delete(`/api/admin/pinned-findings/${f.id}`);
    }
  }
}

/**
 * Opens the diagnostic assistant panel and waits until the tab bar is stable.
 *
 * Timeline of React state updates that cause re-renders after the panel opens:
 *   1. `open = true` (Sheet animation starts)
 *   2. Auto-scan effect fires: `setMessages([userMsg])` + `sendMutation.mutate()`
 *      → isPending = true  →  `diagnostic-typing` appears
 *   3. OpenAI responds (or errors): `setMessages([..., assistantMsg])`
 *      → isPending = false  →  `diagnostic-message-assistant-0` appears
 *
 * We need to wait until AT LEAST step 2 has happened so the panel has settled
 * past all initial re-renders.  We wait for `diagnostic-typing` OR
 * `diagnostic-message-assistant-0` to be present in the DOM — whichever
 * arrives first — since both prove the component has processed the initial
 * state updates and the tab buttons are no longer transiently detaching.
 */
async function openPanelAndWaitForStability(page: Page): Promise<void> {
  await page.getByTestId("button-admin-diagnostic").click();
  await expect(page.getByTestId("diagnostic-message-thread")).toBeVisible({
    timeout: 10_000,
  });
  // Wait for initial state updates to settle: either the typing indicator
  // (scan in progress) or the first assistant message (scan already done).
  await page
    .locator(
      '[data-testid="diagnostic-typing"], [data-testid="diagnostic-message-assistant-0"]',
    )
    .first()
    .waitFor({ state: "attached", timeout: 15_000 });
}

test.describe("Pinned Findings Persistence", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin?nosplash=1");
    await cleanupTestFindings(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestFindings(page);
  });

  /**
   * Full UI-driven pin round-trip:
   *   open panel → wait for AI auto-scan response → pin via UI with note and
   *   category → verify in Pinned tab → page.reload() → verify persistence →
   *   unpin → confirm removal via API.
   */
  test("pinned finding persists across page reload (server-side persistence)", async ({
    page,
  }) => {
    // This test waits for a real OpenAI API call — give it plenty of time.
    test.setTimeout(120_000);

    // ── 1. Open the panel and wait for the auto-scan AI response ─────────────
    await page.goto("/admin?nosplash=1");
    await openPanelAndWaitForStability(page);

    // `visibleMessages` filters the auto-scan user prompt, so the AI reply is
    // rendered at index 0 as `diagnostic-message-assistant-0`.  Wait up to 60 s
    // for the OpenAI call (or its error fallback message) to appear.
    await expect(
      page.getByTestId("diagnostic-message-assistant-0"),
    ).toBeVisible({ timeout: 60_000 });

    // ── 2. Pin the response via the UI — fill note and pick a category ────────
    // refetchOnWindowFocus: true means every Playwright interaction can trigger
    // a pinnedFindings refetch → React re-render that transiently detaches panel
    // elements.  We use force:true for clicks inside the panel to reliably
    // dispatch events despite these brief detachments.
    // The pin button may be above the visible scroll area if the AI response is
    // tall.  scrollIntoViewIfNeeded() scrolls the inner message-thread container
    // to bring the button into view before clicking.
    await page.getByTestId("button-pin-diagnostic-0").scrollIntoViewIfNeeded();
    await page.getByTestId("button-pin-diagnostic-0").click({ force: true });
    await expect(page.getByTestId("pin-note-input-area-0")).toBeVisible({
      timeout: 5_000,
    });
    await page.getByTestId("input-pin-note-0").fill(FINDING_NOTE);
    await page
      .getByTestId(`chip-category-${FINDING_CATEGORY.toLowerCase()}-0`)
      .click({ force: true });

    // Intercept the POST to capture the new finding ID.
    const pinResponsePromise = page.waitForResponse(
      (r) =>
        r.url().includes("/api/admin/pinned-findings") &&
        r.request().method() === "POST",
    );
    await page.getByTestId("button-confirm-pin-0").click({ force: true });
    const pinResponse = await pinResponsePromise;
    expect(pinResponse.status()).toBe(201);
    const pinned = (await pinResponse.json()) as { id: number };
    const findingId = pinned.id;

    // ── 3. Switch to Pinned tab and verify the card is visible ────────────────
    await page.getByTestId("tab-pinned").click();
    await expect(page.getByTestId(`pinned-finding-${findingId}`)).toBeVisible({
      timeout: 8_000,
    });
    await expect(
      page.getByTestId(`pinned-finding-${findingId}`),
    ).toContainText(FINDING_MARKER);
    await expect(page.getByTestId(`badge-category-${findingId}`)).toHaveText(
      FINDING_CATEGORY,
    );

    // ── 4. Reload the page — this is the core persistence assertion ───────────
    await page.reload();
    await expect(page).toHaveURL(/\/admin/, { timeout: 8_000 });

    // ── 5. Re-open the panel, switch to Pinned tab, confirm finding persisted ──
    await openPanelAndWaitForStability(page);
    await page.getByTestId("tab-pinned").click();
    await expect(page.getByTestId(`pinned-finding-${findingId}`)).toBeVisible({
      timeout: 8_000,
    });
    await expect(
      page.getByTestId(`pinned-finding-${findingId}`),
    ).toContainText(FINDING_MARKER);
    await expect(page.getByTestId(`badge-category-${findingId}`)).toHaveText(
      FINDING_CATEGORY,
    );

    // ── 6. Unpin via the dismiss button and confirm removal ───────────────────
    await page.getByTestId(`button-dismiss-finding-${findingId}`).click();
    await expect(
      page.getByTestId(`pinned-finding-${findingId}`),
    ).not.toBeVisible({ timeout: 8_000 });

    const afterUnpin = await page.request.get("/api/admin/pinned-findings");
    const remaining = (await afterUnpin.json()) as Array<{ id: number }>;
    expect(remaining.find((f) => f.id === findingId)).toBeUndefined();
  });

  /**
   * Dismiss flow: create a finding via API, open the Pinned tab via UI,
   * click the dismiss button, and verify removal in both UI and API.
   */
  test("dismissing a pinned finding removes it from the Pinned tab", async ({
    page,
  }) => {
    // ── 1. Create a finding via API (shares browser session cookies) ──────────
    const createRes = await page.request.post("/api/admin/pinned-findings", {
      data: {
        content: `${FINDING_MARKER}: Memory usage at 92% — immediate scaling action recommended.`,
        note: FINDING_NOTE,
        category: FINDING_CATEGORY,
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    const findingId: number = created.id;

    // ── 2. Open panel and navigate to Pinned tab ─────────────────────────────
    await page.goto("/admin?nosplash=1");
    await openPanelAndWaitForStability(page);
    await page.getByTestId("tab-pinned").click();

    await expect(page.getByTestId(`pinned-finding-${findingId}`)).toBeVisible({
      timeout: 8_000,
    });

    // ── 3. Dismiss the finding via the UI ────────────────────────────────────
    await page.getByTestId(`button-dismiss-finding-${findingId}`).click();

    // ── 4. Verify the finding is gone from the UI ────────────────────────────
    await expect(
      page.getByTestId(`pinned-finding-${findingId}`),
    ).not.toBeVisible({ timeout: 8_000 });

    // ── 5. Confirm deletion via API (server-side state) ──────────────────────
    const getRes = await page.request.get("/api/admin/pinned-findings");
    expect(getRes.ok()).toBeTruthy();
    const remaining = (await getRes.json()) as Array<{ id: number }>;
    expect(remaining.find((f) => f.id === findingId)).toBeUndefined();
  });
});
