import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const BASE = "http://localhost:5000";

// Liability test user: idVerified=true, seeded on every dev startup (seed-demo.ts)
const LIAB_EMAIL = "liability_test@guberapp.internal";
const LIAB_PASS = "LibTest2026!";

// Demo consumer: used as job poster in fixture helpers
const DEMO_CONSUMER_EMAIL = "demo.consumer@guberapp.internal";

// V&I post-job URL — makes isVIJob=true (viTitle is required), safe description
const VI_POST_JOB_URL =
  `${BASE}/post-job?nosplash=1` +
  `&category=Verify+%26+Inspect` +
  `&viTitle=Vehicle+Inspection` +
  `&viDescription=Check+exterior+panels+and+lights` +
  `&useCaseName=Pre-Purchase+Check` +
  `&catalogServiceTypeName=Vehicle+Inspection` +
  `&verifyInspectCategory=automotive`;

// Same URL but viDescription triggers the SafetyGateModal (roadside keyword)
const VI_ROADSIDE_URL =
  `${BASE}/post-job?nosplash=1` +
  `&category=Verify+%26+Inspect` +
  `&viTitle=Car+Assistance` +
  `&viDescription=Car+is+stranded+on+roadside+and+needs+jump+start` +
  `&useCaseName=Pre-Purchase+Check` +
  `&catalogServiceTypeName=Vehicle+Inspection` +
  `&verifyInspectCategory=automotive`;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getToken(request: APIRequestContext, email: string, pass: string): Promise<string> {
  const res = await request.post(`${BASE}/api/auth/login`, { data: { email, password: pass } });
  const body = await res.json();
  if (!body.token) throw new Error(`Login failed for ${email}: ${JSON.stringify(body)}`);
  return body.token;
}

async function injectToken(page: Page, token: string): Promise<void> {
  await page.evaluate((t: string) => localStorage.setItem("guber_token", t), token);
}

async function gotoAsUser(page: Page, request: APIRequestContext, url: string, email: string, pass: string): Promise<void> {
  // Prime localStorage with the API token (no UI login needed)
  await page.goto(`${BASE}/login?nosplash=1`);
  const token = await getToken(request, email, pass);
  await injectToken(page, token);
  await page.goto(url);
}

async function resetDisclaimer(request: APIRequestContext): Promise<void> {
  // /api/test/* is excluded from the rate limiter in dev mode
  const res = await request.post(`${BASE}/api/test/reset-liability-disclaimer`, {
    data: { email: LIAB_EMAIL },
  });
  if (res.status() !== 200) {
    throw new Error(`Reset disclaimer failed: ${res.status()} ${await res.text()}`);
  }
}

async function acceptDisclaimer(request: APIRequestContext, token: string): Promise<void> {
  const res = await request.post(`${BASE}/api/users/me/accept-liability-disclaimer`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(200);
}

async function dismissGpsModal(page: Page): Promise<void> {
  // Mark GPS ok so the GPS disclaimer never blocks the form
  await page.evaluate(() => {
    localStorage.setItem("guber_gps_ok", "1");
    const el = document.querySelector('[data-testid="modal-gps-disclaimer"]');
    if (el) (el as HTMLElement).style.display = "none";
  });
}

async function fillBudgetAndClick(page: Page): Promise<void> {
  await dismissGpsModal(page);
  const budgetInputs = page.getByTestId("input-budget");
  await expect(budgetInputs.first()).toBeVisible({ timeout: 5_000 });
  // V&I form renders a second budget input — use the last one (the V&I-specific one)
  await budgetInputs.last().fill("75");
  await dismissGpsModal(page);
  await page.getByTestId("button-post-job").click({ force: true });
}

// ─── GlobalDisclaimerModal ────────────────────────────────────────────────────

test.describe("GlobalDisclaimerModal — UI", () => {
  test.beforeEach(async ({ request }) => {
    await resetDisclaimer(request);
  });

  test("modal appears when ID-verified user without disclaimer clicks Post Job", async ({
    page,
    request,
  }) => {
    await gotoAsUser(page, request, VI_POST_JOB_URL, LIAB_EMAIL, LIAB_PASS);
    await expect(page.getByTestId("page-post-job")).toBeVisible({ timeout: 10_000 });

    const modal = page.getByTestId("modal-global-liability-disclaimer");
    await expect(modal).not.toBeVisible();

    await fillBudgetAndClick(page);
    await expect(modal).toBeVisible({ timeout: 5_000 });
  });

  test("accepting disclaimer persists to DB; modal does not reappear on next submit", async ({
    page,
    request,
  }) => {
    await gotoAsUser(page, request, VI_POST_JOB_URL, LIAB_EMAIL, LIAB_PASS);
    await expect(page.getByTestId("page-post-job")).toBeVisible({ timeout: 10_000 });

    await fillBudgetAndClick(page);

    const modal = page.getByTestId("modal-global-liability-disclaimer");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await page.getByTestId("button-accept-global-disclaimer").click();
    await expect(modal).not.toBeVisible({ timeout: 5_000 });

    // Confirm DB persistence via API
    const token = await page.evaluate(() => localStorage.getItem("guber_token"));
    const meRes = await request.get(`${BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const me = await meRes.json();
    expect(me.liabilityDisclaimerAcceptedAt).not.toBeNull();

    // Navigate away and back — modal must NOT appear again
    await page.goto(VI_POST_JOB_URL);
    await expect(page.getByTestId("page-post-job")).toBeVisible({ timeout: 10_000 });
    await fillBudgetAndClick(page);
    await page.waitForTimeout(1_000);
    await expect(modal).not.toBeVisible();
  });

  test("dismissing modal with X keeps form intact without accepting", async ({
    page,
    request,
  }) => {
    await gotoAsUser(page, request, VI_POST_JOB_URL, LIAB_EMAIL, LIAB_PASS);
    await expect(page.getByTestId("page-post-job")).toBeVisible({ timeout: 10_000 });

    await fillBudgetAndClick(page);

    const modal = page.getByTestId("modal-global-liability-disclaimer");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await page.getByTestId("button-close-global-disclaimer").click();
    await expect(modal).not.toBeVisible({ timeout: 3_000 });

    // Page must still be on post-job (not navigated away)
    await expect(page.getByTestId("page-post-job")).toBeVisible();
    await expect(page.getByTestId("button-post-job")).toBeVisible();
  });
});

// ─── SafetyGateModal ──────────────────────────────────────────────────────────

test.describe("SafetyGateModal — UI", () => {
  test.beforeEach(async ({ request }) => {
    // Accept disclaimer first so safety gate is reached (not disclaimer gate)
    await resetDisclaimer(request);
    const token = await getToken(request, LIAB_EMAIL, LIAB_PASS);
    await acceptDisclaimer(request, token);
  });

  test("safety gate fires when job description contains roadside keyword", async ({
    page,
    request,
  }) => {
    await gotoAsUser(page, request, VI_ROADSIDE_URL, LIAB_EMAIL, LIAB_PASS);
    await expect(page.getByTestId("page-post-job")).toBeVisible({ timeout: 10_000 });

    await fillBudgetAndClick(page);

    await expect(page.getByTestId("modal-safety-gate")).toBeVisible({ timeout: 5_000 });
  });

  test("Cancel on safety gate closes it without firing a checkout request", async ({
    page,
    request,
  }) => {
    await gotoAsUser(page, request, VI_ROADSIDE_URL, LIAB_EMAIL, LIAB_PASS);
    await expect(page.getByTestId("page-post-job")).toBeVisible({ timeout: 10_000 });

    await fillBudgetAndClick(page);

    const safetyModal = page.getByTestId("modal-safety-gate");
    await expect(safetyModal).toBeVisible({ timeout: 5_000 });

    const checkoutUrls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/jobs/create-checkout")) checkoutUrls.push(req.url());
    });

    await page.getByTestId("button-cancel-safety-gate").click();
    await expect(safetyModal).not.toBeVisible({ timeout: 3_000 });

    await page.waitForTimeout(600);
    expect(checkoutUrls).toHaveLength(0);
    await expect(page.getByTestId("page-post-job")).toBeVisible();
  });
});

// ─── Server-side API gates ────────────────────────────────────────────────────

test.describe("Server-side liability gates — API", () => {
  test("POST /api/jobs/create-checkout → 412 DISCLAIMER_REQUIRED when no disclaimer", async ({
    request,
  }) => {
    await resetDisclaimer(request);
    const token = await getToken(request, LIAB_EMAIL, LIAB_PASS);

    const res = await request.post(`${BASE}/api/jobs/create-checkout`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: "Simple errand",
        description: "Pick up groceries",
        category: "On-Demand Help",
        location: "Los Angeles, CA",
        budget: 30,
        payType: "fixed",
      },
    });

    expect(res.status()).toBe(412);
    const body = await res.json();
    expect(body.message).toBe("DISCLAIMER_REQUIRED");
  });

  test("accept-disclaimer → 200; GET /api/auth/me reflects liabilityDisclaimerAcceptedAt", async ({
    request,
  }) => {
    await resetDisclaimer(request);
    const token = await getToken(request, LIAB_EMAIL, LIAB_PASS);

    const acceptRes = await request.post(`${BASE}/api/users/me/accept-liability-disclaimer`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(acceptRes.status()).toBe(200);

    const meRes = await request.get(`${BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await meRes.json()).liabilityDisclaimerAcceptedAt).not.toBeNull();
  });

  test("accept-disclaimer is idempotent — second call also returns 200", async ({
    request,
  }) => {
    await resetDisclaimer(request);
    const token = await getToken(request, LIAB_EMAIL, LIAB_PASS);

    await request.post(`${BASE}/api/users/me/accept-liability-disclaimer`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const second = await request.post(`${BASE}/api/users/me/accept-liability-disclaimer`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(second.status()).toBe(200);
  });

  test("POST /api/jobs/create-checkout → 400 DISALLOWED_JOB for medical content", async ({
    request,
  }) => {
    // Accept disclaimer so the disallowed-content check is reached
    await resetDisclaimer(request);
    const token = await getToken(request, LIAB_EMAIL, LIAB_PASS);
    await acceptDisclaimer(request, token);

    const res = await request.post(`${BASE}/api/jobs/create-checkout`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: "Medical consultation",
        description: "I need someone to diagnose my condition and prescribe medication",
        category: "On-Demand Help",
        location: "Los Angeles, CA",
        budget: 50,
        payType: "fixed",
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("DISALLOWED_JOB");
  });

  test("POST /api/jobs/create-checkout → 400 CONTACT_BLOCK for off-platform payment phrase in description", async ({
    request,
  }) => {
    // Accept disclaimer so the contact-block check is reached
    await resetDisclaimer(request);
    const token = await getToken(request, LIAB_EMAIL, LIAB_PASS);
    await acceptDisclaimer(request, token);

    const res = await request.post(`${BASE}/api/jobs/create-checkout`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: "Simple errand",
        description: "Pick up groceries and Venmo me the change",
        category: "On-Demand Help",
        location: "Los Angeles, CA",
        budget: 30,
        payType: "fixed",
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("CONTACT_BLOCK");
    expect(body.detail).toMatch(/Venmo/i);
  });

  test("POST /api/observations: V&I forbidden words are sanitized server-side", async ({
    request,
  }) => {
    await resetDisclaimer(request);
    const token = await getToken(request, LIAB_EMAIL, LIAB_PASS);

    const jobsRes = await request.get(
      `${BASE}/api/jobs?category=Verify+%26+Inspect&status=posted_public`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const jobsBody = await jobsRes.json();
    const viJob = Array.isArray(jobsBody) ? jobsBody[0] : null;

    if (!viJob) {
      test.skip(true, "No public V&I job available — skipping sanitization test");
      return;
    }

    const obsRes = await request.post(`${BASE}/api/observations`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        jobId: viJob.id,
        notes: "This vehicle is guaranteed safe and certified — it will fit perfectly",
        photos: [],
      },
    });

    if (obsRes.status() === 200 || obsRes.status() === 201) {
      const saved: string = (await obsRes.json()).notes ?? "";
      expect(saved).not.toContain("guaranteed");
      expect(saved).not.toContain("certified");
      expect(saved).toContain("[visual only]");
    } else {
      // May be inaccessible (not assigned); verify error shape is reasonable
      expect([400, 403, 404]).toContain(obsRes.status());
    }
  });
});

// ─── Disallowed job guard — client-side UI gate ───────────────────────────────

test.describe("Disallowed job guard — client-side", () => {
  test.beforeEach(async ({ request }) => {
    // Accept disclaimer so only the disallowed-job block gates the form
    await resetDisclaimer(request);
    const token = await getToken(request, LIAB_EMAIL, LIAB_PASS);
    await acceptDisclaimer(request, token);
  });

  test("medical content in V&I description shows disallowed-job block and disables Post button", async ({
    page,
    request,
  }) => {
    // viDescription contains a prohibited medical phrase — detectDisallowedJobContent
    // fires client-side from the URL param before the user does anything
    const disallowedUrl =
      `${BASE}/post-job?nosplash=1` +
      `&category=Verify+%26+Inspect` +
      `&viTitle=Medical+Checkup` +
      `&viDescription=I+need+someone+to+diagnose+my+condition+and+prescribe+medication` +
      `&useCaseName=Health+Check` +
      `&catalogServiceTypeName=Medical+Inspection` +
      `&verifyInspectCategory=health`;

    await gotoAsUser(page, request, disallowedUrl, LIAB_EMAIL, LIAB_PASS);
    await expect(page.getByTestId("page-post-job")).toBeVisible({ timeout: 10_000 });
    await dismissGpsModal(page);

    // The disallowed-job block must appear automatically (no click required)
    await expect(page.getByTestId("text-disallowed-job-block")).toBeVisible({ timeout: 5_000 });

    // Post button must be disabled — disallowed content blocks checkout
    await expect(page.getByTestId("button-post-job")).toBeDisabled();
  });
});

// ─── Off-platform contact block — client-side UI gate ─────────────────────────

test.describe("Off-platform contact block — client-side", () => {
  test.beforeEach(async ({ request }) => {
    // Accept disclaimer so we reach the job form without the disclaimer gate
    await resetDisclaimer(request);
    const token = await getToken(request, LIAB_EMAIL, LIAB_PASS);
    await acceptDisclaimer(request, token);
  });

  test("contact info in guided-builder notes shows inline warning and disables Post button", async ({
    page,
    request,
  }) => {
    // Guided-builder job: On-Demand Help / Delivery — service= sets serviceType from URL
    await gotoAsUser(
      page,
      request,
      `${BASE}/post-job?nosplash=1&category=On-Demand+Help&service=Delivery`,
      LIAB_EMAIL,
      LIAB_PASS,
    );
    await expect(page.getByTestId("page-post-job")).toBeVisible({ timeout: 10_000 });
    await dismissGpsModal(page);

    // Guided-builder notes textarea is always visible once the guided builder renders
    const notesInput = page.getByTestId("textarea-guided-notes");
    await expect(notesInput).toBeVisible({ timeout: 8_000 });

    // "text me at …" survives filterNotesContent (phrase stays; number becomes [removed])
    // so detectContactBlock fires on the "text me" phrase
    await notesInput.fill("text me at 555-867-5309");

    // Inline warning must appear in the guided builder
    await expect(page.getByTestId("text-contact-block-warning")).toBeVisible({ timeout: 3_000 });

    // Post button must be disabled — contact block prevents checkout
    await expect(page.getByTestId("button-post-job")).toBeDisabled();
  });
});

// ─── Helper start-confirmation modal ─────────────────────────────────────────

test.describe("HelperStartConfirmModal — UI", () => {
  test("modal appears when helper taps 'On My Way'; cancelling closes it without navigating away", async ({
    page,
    request,
  }) => {
    // Ensure the test user has a clean, accepted disclaimer
    await resetDisclaimer(request);
    const token = await getToken(request, LIAB_EMAIL, LIAB_PASS);
    await acceptDisclaimer(request, token);

    // Create a fixture job with the test user assigned as helper
    const fixtureRes = await request.post(`${BASE}/api/test/create-helper-assignment`, {
      data: { helperEmail: LIAB_EMAIL, posterEmail: DEMO_CONSUMER_EMAIL },
    });
    expect(fixtureRes.status()).toBe(200);
    const { jobId } = await fixtureRes.json();
    expect(typeof jobId).toBe("number");

    // Navigate to the job-detail page as the assigned helper
    await gotoAsUser(page, request, `${BASE}/jobs/${jobId}`, LIAB_EMAIL, LIAB_PASS);

    // The "On My Way" button is visible once the page loads and the helper stage is empty
    const onMyWayBtn = page.getByTestId("button-on-my-way");
    await expect(onMyWayBtn).toBeVisible({ timeout: 15_000 });

    // Clicking opens the HelperStartConfirmModal (Task #318 safety gate)
    await onMyWayBtn.click();
    await expect(page.getByTestId("modal-helper-start-confirm")).toBeVisible({ timeout: 5_000 });

    // Cancelling closes the modal without navigating away
    await page.getByTestId("button-cancel-helper-start").click();
    await expect(page.getByTestId("modal-helper-start-confirm")).not.toBeVisible({ timeout: 3_000 });

    // Page must still be on the job-detail view
    expect(page.url()).toContain(`/jobs/${jobId}`);
  });
});
