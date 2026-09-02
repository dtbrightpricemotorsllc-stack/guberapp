import { test, expect, type Page, type Route } from "@playwright/test";

const CAMPAIGN_CODE = "DOOR42";
const CAMPAIGN_SESSION = "d".repeat(32);

const doorRegion = (page: Page) =>
  page.locator('[aria-label="GUBER entry — tap to open"]');

async function emitVoice(
  page: Page,
  kind: "connect" | "listening" | "thinking" | "speaking" | "user-transcript" | "assistant-response" | "error",
  errorKind?: "microphone-denied" | "microphone-unavailable" | "session" | "audio" | "transport",
  text?: string,
) {
  await page.evaluate(
    (detail) => window.dispatchEvent(new CustomEvent("jac:e2e-voice", { detail })),
    { target: "homepage", kind, errorKind, text },
  );
}

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
  await expect(page.getByTestId("guber-door-cinematic")).toBeAttached();
}

async function completeCinematic(page: Page) {
  const cinematic = page.getByTestId("guber-door-cinematic");
  await expect(cinematic).toHaveAttribute("data-playing", "true");
  await cinematic.evaluate((video: HTMLVideoElement) => {
    video.pause();
    video.dispatchEvent(new Event("ended"));
  });
}

test.describe("Team GUBER cinematic entry door", () => {
  test("a fresh home visit shows the door before the canonical JAC surface", async ({ page }) => {
    await installUnauthenticatedSession(page);

    await page.goto("/");
    await expectDoorGatedHome(page);
  });

  test("a same-tab refresh does not replay the door", async ({ page }) => {
    await installUnauthenticatedSession(page);

    await page.goto("/");
    await expectDoorGatedHome(page);
    await page.reload();
    await expect(doorRegion(page)).toHaveCount(0);
    await expect(page.getByTestId("jac-live-surface")).toHaveCount(1);
  });

  test("signed-out login navigation does not replay an already claimed door", async ({ page }) => {
    await installUnauthenticatedSession(page);

    await page.goto("/");
    await expectDoorGatedHome(page);
    await page.goto("/login");
    await expect(doorRegion(page)).toHaveCount(0);
    await page.goto("/");
    await expect(doorRegion(page)).toHaveCount(0);
  });

  test("opening the door reveals JAC in-scene before optional Explore", async ({ page }) => {
    await installUnauthenticatedSession(page);

    await page.goto("/?jac_e2e=1");
    await expectDoorGatedHome(page);
    await page.evaluate(() => history.replaceState(null, "", "/"));

    await doorRegion(page).getByRole("button", { name: "Enter Team GUBER" }).click();
    await expect(page.getByText("Connecting to JAC…")).toBeVisible();
    await emitVoice(page, "listening");
    const scene = page.locator('[aria-label="Team GUBER HQ"]');
    await expect(scene).toBeVisible();
    await expect(page.getByTestId("guber-scene-conversation")).toHaveCount(0);
    await completeCinematic(page);
    await expect(page.getByTestId("guber-greeting")).toHaveText(
      "Welcome to Team Guber. What brings you here?",
    );
    await expect(page.getByTestId("guber-scene-conversation")).toBeVisible();
    await expect(page.getByRole("button", { name: "Switch to typing" })).toHaveText("Type Instead");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("jac-live-surface")).toHaveCount(0);
  });

  test("one ENTER tap supports welcome, hands-free user speech, and JAC's spoken reply", async ({ page }) => {
    await installUnauthenticatedSession(page);
    await page.goto("/?jac_e2e=1");
    await expectDoorGatedHome(page);

    await doorRegion(page).getByRole("button", { name: "Enter Team GUBER" }).click();
    await expect(page.getByText("Connecting to JAC…")).toBeVisible();
    await emitVoice(page, "connect");
    await emitVoice(page, "speaking");
    await completeCinematic(page);
    await emitVoice(page, "assistant-response", undefined, "Welcome to Team Guber. What brings you here?");
    await emitVoice(page, "listening");

    await expect(page.getByText("Listening…")).toBeVisible();
    await emitVoice(page, "user-transcript", undefined, "I need help finding work");
    await emitVoice(page, "thinking");
    await emitVoice(page, "speaking");
    await emitVoice(page, "assistant-response", undefined, "I can help you find work near you.");
    await emitVoice(page, "listening");

    const conversation = page.getByTestId("guber-scene-conversation");
    await expect(conversation.getByText("I need help finding work")).toBeVisible();
    await expect(conversation.getByText("I can help you find work near you.")).toBeVisible();
    await expect(page.getByText("Listening…")).toBeVisible();
    await expect(page.getByRole("button", { name: "Talk to JAC with voice" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Message JAC" })).toHaveCount(0);
  });

  test("Explore is the optional escape to the canonical JAC surface", async ({ page }) => {
    await installUnauthenticatedSession(page);

    await page.goto("/?jac_e2e=1");
    await expectDoorGatedHome(page);

    await doorRegion(page).getByRole("button", { name: "Enter Team GUBER" }).click();
    await expect(page.getByText("Connecting to JAC…")).toBeVisible();
    await emitVoice(page, "listening");
    await completeCinematic(page);
    await page.getByRole("button", { name: "Switch to typing" }).click();
    await page.getByRole("button", { name: "Go to full app" }).click();

    await expect(doorRegion(page)).toHaveCount(0);
    await expect(page.getByTestId("jac-live-surface")).toHaveCount(1);
  });

  test("a startup failure stops cleanly with one calm retry and no reconnect loop", async ({ page }) => {
    await installUnauthenticatedSession(page);
    await page.goto("/?jac_e2e=1");
    await expectDoorGatedHome(page);

    await doorRegion(page).getByRole("button", { name: "Enter Team GUBER" }).click();
    await emitVoice(page, "error", "transport");
    await expect(page.getByRole("textbox", { name: "Message JAC" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe("TEXTAREA");

    await completeCinematic(page);
    await expect(page.getByText("Voice couldn’t connect. You can keep chatting here.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message JAC" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry JAC voice" })).toHaveCount(1);
    await page.waitForTimeout(2_000);
    await expect(page.getByText(/Reconnecting JAC/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry JAC voice" })).toHaveCount(1);

    await page.getByRole("button", { name: "Retry JAC voice" }).click();
    await expect(page.getByText("Connecting to JAC…")).toBeVisible();
    await emitVoice(page, "listening");
    await expect(page.getByText("Listening…")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message JAC" })).toHaveCount(0);
  });

  test("a silent provider reaches usable text instead of waiting indefinitely", async ({ page }) => {
    await installUnauthenticatedSession(page);
    await page.goto("/?jac_e2e=1");
    await expectDoorGatedHome(page);

    await doorRegion(page).getByRole("button", { name: "Enter Team GUBER" }).click();
    await completeCinematic(page);
    await expect(page.getByText("Connecting to JAC…")).toBeVisible();

    await expect(page.getByText("Voice couldn’t connect. You can keep chatting here."))
      .toBeVisible({ timeout: 14_000 });
    await expect(page.getByRole("textbox", { name: "Message JAC" })).toBeVisible();
    await expect(page.getByText(/Waiting for voice connection/)).toHaveCount(0);
  });

  test("an authenticated refresh skips the entrance doors", async ({ page }) => {
    await page.route("**/api/auth/me", route => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 44,
        email: "worker@example.test",
        username: "worker",
        fullName: "Test Worker",
        firstName: "Test",
        role: "user",
        accountType: "individual",
      }),
    }));
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("guber-door-scene")).toHaveCount(0);
  });

  test("browser sign-in return transfers the guest JAC session once before dashboard navigation", async ({ page }) => {
    let transfers = 0;
    await page.addInitScript(() => {
      localStorage.setItem("jac_guest_session_id", "door-oauth-guest");
      sessionStorage.setItem("jac_shared_conversation_v1", JSON.stringify([
        { id: "before-auth", role: "user", content: "I need delivery work", source: "homepage" },
      ]));
    });
    await page.route("**/api/auth/me", route => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 45,
        email: "oauth@example.test",
        username: "oauth_worker",
        fullName: "OAuth Worker",
        firstName: "OAuth",
        role: "user",
        accountType: "individual",
      }),
    }));
    await page.route("**/api/jac/guest-transfer", async route => {
      transfers += 1;
      expect(route.request().postDataJSON()).toEqual({
        guest_session_id: "door-oauth-guest",
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, transferred: 1 }),
      });
    });

    await page.goto("/auth-success?token=oauth-test-token");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect.poll(() => transfers).toBe(1);
    await expect(page.getByTestId("guber-door-scene")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (
      JSON.parse(sessionStorage.getItem("jac_shared_conversation_v1") || "[]")[0]?.content
    ))).toBe("I need delivery work");
  });

  test("microphone denial offers text fallback without focusing it", async ({ page }) => {
    await installUnauthenticatedSession(page);
    await page.goto("/?jac_e2e=1");
    await expectDoorGatedHome(page);

    await doorRegion(page).getByRole("button", { name: "Enter Team GUBER" }).click();
    await emitVoice(page, "error", "microphone-denied");
    await completeCinematic(page);

    await expect(page.getByText("Voice couldn’t connect. You can keep chatting here.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message JAC" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry JAC voice" })).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe("TEXTAREA");
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