/**
 * Browser-level regression coverage for JAC's service route confirmation.
 *
 * The AI response is stubbed at the network boundary so this test remains
 * deterministic. The real React chat surfaces, message history, confirmation
 * actions, gated route buttons, and destination navigation are exercised.
 */

import { test, expect, type Page } from "@playwright/test";

const CLARIFY_REPLY =
  "Before I send you anywhere, do you want to choose a provider directly, or post an open job so nearby workers can apply?";
const PROVIDER_CONFIRM_REPLY =
  "Want me to take you to where you can publish a service offer people can hire you for directly?";

type ChatSurface = "guest" | "authenticated";

async function installJacResponses(page: Page, surface: ChatSurface) {
  const requests: string[] = [];
  const endpoints = surface === "guest"
    ? ["**/api/jac/onboard"]
    : ["**/api/ai/guber-assist", "**/api/jac/listing-collect"];

  for (const endpoint of endpoints) await page.route(endpoint, async (route) => {
    const isListingEndpoint = endpoint.includes("listing-collect");
    const body = route.request().postDataJSON() as { messages?: Array<{ role: string; content: string }> };
    const lastUserMessage = [...(body.messages || [])]
      .reverse()
      .find((message) => message.role === "user")?.content || "";
    requests.push(lastUserMessage);

    const isProviderRequest = /i want to offer my service/i.test(lastUserMessage);
    const isProviderConfirmation = /take me there to offer a service|yes.*offer a service|publish a service|become a provider/i.test(lastUserMessage);
    const isBrowseConfirmation = /show me providers i can hire directly/i.test(lastUserMessage);
    const response = isProviderConfirmation
      ? {
          reply: "Your service offer is ready to publish. This is the provider path, not a job post.",
          route: "/offer-service",
          ...(isListingEndpoint ? { ready: true, listingType: "service", collected: {} } : {}),
          actions: [],
          options: [],
        }
      : isBrowseConfirmation
        ? {
            reply: "Here are local providers you can hire directly — pick one and send a protected request.",
            route: "/services",
            actions: [],
            options: [],
          }
        : isProviderRequest
          ? {
              reply: PROVIDER_CONFIRM_REPLY,
              route: null,
              ...(isListingEndpoint ? { ready: false, listingType: "service", collected: {} } : {}),
              actions: [
                { label: "Yes, help me offer a service", message: "yes, take me there to offer a service" },
              ],
              options: [],
            }
        : {
            reply: CLARIFY_REPLY,
            route: null,
            actions: [
              { label: "Browse providers to hire", message: "show me providers I can hire directly" },
              { label: "Post an open job", message: "I want to post an open job" },
            ],
            options: [],
          };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });

  return requests;
}

async function sendGuestMessage(page: Page, message: string) {
  const input = page.getByLabel("Message JAC");
  await expect(input).toBeEnabled();
  await input.fill(message);
  await input.press("Enter");
}

async function enterCanonicalJac(page: Page) {
  const doorEntry = page.getByRole("button", { name: "Enter Team GUBER" });
  if (await doorEntry.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await doorEntry.click();
    await page.getByRole("button", { name: "Type to JAC instead" }).click();
    await page.getByRole("button", { name: "Go to full app" }).click();
  }
  await expect(page.getByTestId("jac-live-surface")).toBeVisible();
}

async function sendAssistantMessage(page: Page, message: string) {
  const input = page.getByTestId("input-assistant-message");
  await expect(input).toBeEnabled();
  await input.fill(message);
  await input.press("Enter");
}

async function installAuthenticatedSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("guber_alert_status", "granted");
    localStorage.setItem("guber_alert_modal_autoshown", "true");
  });
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 987654,
        email: "jac-route-test@guberapp.test",
        username: "jac_route_test",
        fullName: "QA JAC Route Tester",
        firstName: "QA",
        role: "user",
        accountType: "individual",
      }),
    });
  });
}

async function dismissDashboardOverlays(page: Page) {
  const gpsConfirm = page.getByTestId("button-gps-disclaimer-confirm");
  const alertClose = page.getByTestId("button-close-alert-modal");

  // These are unrelated to JAC but can legitimately appear on a fresh
  // authenticated session and intercept the assistant trigger.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await alertClose.isVisible({ timeout: 300 }).catch(() => false)) {
      await alertClose.click();
    }
    if (await gpsConfirm.isVisible({ timeout: 300 }).catch(() => false)) {
      await gpsConfirm.click();
    }
    if (
      !(await page.getByTestId("modal-gps-disclaimer").isVisible({ timeout: 150 }).catch(() => false)) &&
      !(await page.getByTestId("modal-alert-prompt").isVisible({ timeout: 150 }).catch(() => false))
    ) {
      return;
    }
    await page.waitForTimeout(250);
  }
}

test("guest JAC asks whether to browse or post before showing a destination", async ({ page }) => {
  const requests = await installJacResponses(page, "guest");
  const voiceRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/jac\/convai\/(?:public-)?session/.test(request.url())) {
      voiceRequests.push(request.url());
    }
  });

  await page.goto("/");
  await expect(page.getByTestId("page-home")).toBeVisible();
  await enterCanonicalJac(page);
  // Text JAC must be immediately usable. Voice is optional on web/PWA and
  // cannot mint a session until the user explicitly taps the voice control.
  expect(voiceRequests).toEqual([]);
  await sendGuestMessage(page, "I need help finding someone for a repair.");

  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByText(CLARIFY_REPLY, { exact: true })).toBeVisible();
  const liveSurface = page.getByTestId("jac-live-surface");
  await expect(liveSurface.locator('a[href="/services"]')).toHaveCount(0);
  await expect(liveSurface.locator('a[href="/post-job"]')).toHaveCount(0);
  expect(requests).toEqual(["I need help finding someone for a repair."]);

  await sendGuestMessage(page, "show me providers I can hire directly");
  await expect.poll(() => requests.length).toBe(2);
  await expect(page.getByText(/Here are local providers you can hire directly/)).toBeVisible();
  await expect(liveSurface.locator('a[href="/post-job"]')).toHaveCount(0);
});

test("authenticated JAC confirms the browse-vs-post choice before routing", async ({ page }) => {
  {
    await installAuthenticatedSession(page);
    const requests = await installJacResponses(page, "authenticated");
    await page.goto("/dashboard");
    await expect(page.getByTestId("page-dashboard")).toBeVisible();
    await dismissDashboardOverlays(page);
    await page.getByTestId("button-guber-assistant").click();

    await sendAssistantMessage(page, "I'm looking for guidance.");
    await expect(page.getByText(CLARIFY_REPLY, { exact: true })).toBeVisible();
    await expect(page.locator("[data-testid^='button-dd-route-']")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Browse providers to hire", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Post an open job", exact: true })).toBeVisible();
    expect(requests).toEqual(["I'm looking for guidance."]);

    await page.getByRole("button", { name: "Browse providers to hire", exact: true }).click();
    await expect(page.getByText(/Here are local providers you can hire directly/)).toBeVisible();
    await expect(page.locator("[data-testid^='button-dd-route-']")).toHaveCount(1);
    await page.locator("[data-testid^='button-dd-route-']").click();
    await expect(page).toHaveURL(/\/services$/);
  }
});

test("offering a service stays on the provider path and never becomes a job post", async ({ page }) => {
  {
    await installAuthenticatedSession(page);
    const requests = await installJacResponses(page, "authenticated");
    await page.goto("/dashboard");
    await expect(page.getByTestId("page-dashboard")).toBeVisible();
    await dismissDashboardOverlays(page);
    await page.getByTestId("button-guber-assistant").click();

    await sendAssistantMessage(page, "I want to offer my service.");
    await expect(page.getByText(PROVIDER_CONFIRM_REPLY, { exact: true })).toBeVisible();
    await expect(page.locator("[data-testid^='button-dd-route-']")).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/post-job/);

    await page.getByRole("button", { name: "Yes, help me offer a service", exact: true }).click();
    await expect(page.getByText(/Your service offer is ready to publish/)).toBeVisible();
    await expect(page).toHaveURL(/\/offer-service$/);
    await expect(page).not.toHaveURL(/\/post-job/);
    expect(requests).toEqual(["I want to offer my service.", "yes, take me there to offer a service"]);
  }
});