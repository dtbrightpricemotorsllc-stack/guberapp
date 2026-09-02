import { test, expect, type Page } from "@playwright/test";

/**
 * These are user-agent profiles only. Playwright always runs them in Chromium
 * with the fake microphone configured by playwright.config.ts. They are useful
 * for repeatable UI/lifecycle regressions, but never count as physical-device
 * speaker, permission, or microphone evidence.
 */
const MOBILE_PROFILES = [
  {
    name: "iOS Safari",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
    userAgentMarker: "Safari",
  },
  {
    name: "iOS WKWebView/TestFlight",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    userAgentMarker: "Mobile",
  },
  {
    name: "Android Chrome",
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
    userAgentMarker: "Chrome",
  },
  {
    name: "Android WebView/installed app",
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro Build/AP4A.250805.002) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36",
    userAgentMarker: "Version/4.0",
  },
  {
    name: "Samsung Internet",
    userAgent: "Mozilla/5.0 (Linux; Android 15; SAMSUNG SM-S938U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
    userAgentMarker: "SamsungBrowser",
  },
];

async function emitVoice(page: Page, kind: string, text?: string) {
  await page.evaluate(
    ({ kind, text }) => window.dispatchEvent(new CustomEvent("jac:e2e-voice", {
      detail: { target: "homepage", kind, text },
    })),
    { kind, text },
  );
  // Phase changes are idempotent. Replay them once after the current React
  // task so a profile transition/remount cannot drop the signal. Transcript
  // and assistant-response events stay single-shot to preserve their
  // duplicate/echo assertions.
  if (["connect", "listening", "thinking", "speaking"].includes(kind)) {
    await page.evaluate(
      ({ kind, text }) => new Promise<void>(resolve => {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("jac:e2e-voice", {
            detail: { target: "homepage", kind, text },
          }));
          resolve();
        }, 0);
      }),
      { kind, text },
    );
  }
}

for (const profile of MOBILE_PROFILES) {
  test.describe(`JAC one-tap voice — ${profile.name} — fake-mic browser profile`, () => {
    test.use({
      userAgent: profile.userAgent,
      viewport: { width: 384, height: 854 },
      // This lane is a browser-controlled lifecycle check, not a service
      // worker/update check. Blocking SW prevents an update banner from
      // interrupting the first profile after a dev-server restart.
      serviceWorkers: "block",
    });

    test("ENTER alone reaches welcome, listening, user speech, and spoken reply", async ({ page }) => {
      await page.route("**/api/auth/me", route => route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Not authenticated" }),
      }));
      await page.route("**/api/jac/convai/public-session", route => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          voiceToken: "fake-mic-browser-test-token",
          signedUrl: "wss://fake-mic-browser-test.invalid/session",
          dynamicVariableName: "voice_token",
          agentId: "fake-mic-browser-test-agent",
        }),
      }));
      await page.goto("/?jac_e2e=1");
      await expect.poll(() => page.evaluate(() => navigator.userAgent)).toContain(profile.userAgentMarker);

      const sessionResponse = page.waitForResponse("**/api/jac/convai/public-session");
      await page.getByRole("button", { name: "Enter Team GUBER" }).click();
      await expect(page.getByText("Connecting to JAC…")).toBeVisible();
      await sessionResponse;
      // The harness startup parses the response in an async effect and sets
      // the initial connecting phase; let that transition settle before
      // sending the first scripted phase event.
      await page.waitForTimeout(0);
      await emitVoice(page, "connect");
      await emitVoice(page, "speaking");

      const cinematic = page.getByTestId("guber-door-cinematic");
      await cinematic.evaluate((video: HTMLVideoElement) => {
        video.pause();
        video.dispatchEvent(new Event("ended"));
      });
      await expect(page.getByText("JAC is speaking")).toBeVisible();
      await emitVoice(page, "assistant-response", "Welcome to Team Guber. What brings you here?");
      await emitVoice(page, "listening");
      await expect(page.getByText("Listening…")).toBeVisible();

      await emitVoice(page, "user-transcript", "Can you help me find work?");
      await emitVoice(page, "thinking");
      await expect(page.getByText("JAC is thinking…")).toBeVisible();
      await emitVoice(page, "speaking");
      await expect(page.getByText("JAC is speaking")).toBeVisible();
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