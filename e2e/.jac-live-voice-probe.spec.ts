import { expect, test } from "@playwright/test";

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--use-file-for-fake-audio-capture=/tmp/fake-jac-input.wav",
      "--autoplay-policy=no-user-gesture-required",
    ],
    executablePath: "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
  },
});

test("live mobile ConvAI produces audible output and a two-way turn", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const voiceRequests: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/jac/")) voiceRequests.push(request.url());
  });

  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as any).__jacAudioDebug));
  await page.getByRole("button", { name: "Enter Team GUBER" }).click();
  const cinematic = page.getByTestId("guber-door-cinematic");
  if (await cinematic.count()) {
    await cinematic.evaluate((video: HTMLVideoElement) => {
      video.pause();
      video.dispatchEvent(new Event("ended"));
    });
  }

  await expect(page.getByText("JAC is speaking")).toBeVisible({ timeout: 45_000 });
  const samples = await page.evaluate(async () => {
    const debug = (window as any).__jacAudioDebug;
    debug.ensureJacAudioTapListener();
    debug.unlockJacAnalyserContext();
    const values: number[] = [];
    for (let i = 0; i < 80; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 75));
      const value = debug.getJacLiveAmplitude();
      if (typeof value === "number") values.push(value);
    }
    return values;
  });
  expect(samples.length).toBeGreaterThan(5);
  expect(Math.max(...samples)).toBeGreaterThan(0.03);

  await expect(page.getByText("Listening…")).toBeVisible({ timeout: 35_000 });
  await expect.poll(
    () => page.locator('[data-testid="guber-scene-conversation"]').locator("p").count(),
    { timeout: 35_000 },
  ).toBeGreaterThan(1);

  expect(voiceRequests.some(url => url.includes("/api/jac/convai/investor-session"))).toBe(true);
  expect(voiceRequests.some(url => url.includes("/api/jac/realtime"))).toBe(false);

  await page.getByRole("button", { name: "Switch to typing" }).click();
  await expect(page.getByLabel("Message JAC")).toBeVisible();
});