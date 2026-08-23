/**
 * End-to-end coverage for the provider draft privacy boundary.
 *
 * A real account saves a service offer through the provider UI. An anonymous
 * discovery request must not return that draft, even though the provider can
 * see it in their own management list.
 */

import { test, expect, request } from "@playwright/test";

// Keep this aligned with playwright.config.ts so cookies created by the API
// context can be transferred to the browser page.
const BASE = process.env.E2E_BASE_URL || "http://localhost:5000";

test("provider drafts stay private from public service discovery", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `service-offer-${stamp}@guberapp.test`;
  const title = `QA private service ${stamp}`;
  const api = await request.newContext({ baseURL: BASE });

  try {
    const signup = await api.post("/api/auth/signup", {
      data: {
        email,
        username: `service_${stamp.replace(/[^a-z0-9]/gi, "").slice(0, 18)}`,
        fullName: "QA Service Provider",
        password: "StrongPass!2026",
        zipcode: "90210",
      },
    });
    expect(signup.status(), await signup.text()).toBe(201);

    // Transfer the authenticated API session to the browser page so the
    // provider flow is exercised through the real React form.
    const state = await api.storageState();
    await page.context().addCookies(state.cookies);
    await page.goto("/offer-service");
    await expect(page.getByTestId("page-offer-service")).toBeVisible();

    await page.getByLabel("Service title").fill(title);
    await page.getByRole("button", { name: /save private draft/i }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByText("draft", { exact: true }).first()).toBeVisible();

    const publicApi = await request.newContext({ baseURL: BASE });
    try {
      const discovery = await publicApi.get(`/api/service-offers?search=${encodeURIComponent(title)}`);
      expect(discovery.ok()).toBe(true);
      const publicOffers = await discovery.json();
      expect(publicOffers).toEqual([]);
    } finally {
      await publicApi.dispose();
    }
  } finally {
    await api.dispose();
  }
});