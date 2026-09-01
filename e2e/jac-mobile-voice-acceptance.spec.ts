import { test, expect, type Page } from "@playwright/test";

const MOBILE_PROFILES = [
  {
    name: "Android Chrome",
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  },
  {
    name: "Samsung Internet",
    userAgent: "Mozilla/5.0 (Linux; Android 15; SAMSUNG SM-S938U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  },
];

async function emitVoice(page: Page, kind: string, text?: string) {
  await page.evaluate(
    ({ kind, text }) => window.dispatchEvent(new CustomEvent("jac:e2e-voice", {
      detail: { target: "homepage", kind, text },
    })),
    { kind, text },
  );
}

for (const profile of MOBILE_PROFILES) {
  test.describe(`JAC one-tap voice — ${profile.name}`, () => {
    test.use({
      userAgent: profile.userAgent,
      viewport: { width: 384, height: 854 },
    });

    test("ENTER alone reaches welcome, listening, user speech, and spoken reply", async ({ page }) => {
      await page.route("**/api/auth/me", route => route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Not authenticated" }),
      }));
      await page.goto("/?jac_e2e=1");
      await expect.poll(() => page.evaluate(() => navigator.userAgent)).toContain(
        profile.name === "Samsung Internet" ? "SamsungBrowser" : "Chrome",
      );

      await page.getByRole("button", { name: "Enter Team GUBER" }).click();
      await expect(page.getByText("Connecting…")).toBeVisible();
      await emitVoice(page, "connect");
      await emitVoice(page, "speaking");

      const cinematic = page.getByTestId("guber-door-cinematic");
      await cinematic.evaluate((video: HTMLVideoElement) => {
        video.pause();
        video.dispatchEvent(new Event("ended"));
      });
      await emitVoice(page, "assistant-response", "Welcome to Team Guber. What brings you here?");
      await emitVoice(page, "listening");
      await expect(page.getByText("Listening…")).toBeVisible();

      await emitVoice(page, "user-transcript", "Can you help me find work?");
      await emitVoice(page, "thinking");
      await emitVoice(page, "speaking");
      await emitVoice(page, "assistant-response", "Yes. Tell me what kind of work you want.");
      await emitVoice(page, "listening");

      const conversation = page.getByTestId("guber-scene-conversation");
      await expect(conversation.getByText("Can you help me find work?")).toBeVisible();
      await expect(conversation.getByText("Yes. Tell me what kind of work you want.")).toBeVisible();
      await expect(page.getByText("Listening…")).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Message JAC" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Talk to JAC with voice" })).toHaveCount(0);
    });
  });
}