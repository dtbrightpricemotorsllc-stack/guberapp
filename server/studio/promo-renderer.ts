// GUBER Studio — Promo Video Renderer
// Uses Playwright's fake clock to control Framer Motion frame-by-frame,
// captures screenshots, then encodes to MP4 with ffmpeg.

import { chromium } from "playwright-core";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

export interface PromoRenderInput {
  brandName: string;
  tagline?: string;
  productDescription: string;
  stylePreset: string;
  callToAction?: string;
  images: string[];
  targetDuration: number; // seconds
}

const FPS = 24;
const WIDTH = 1280;
const HEIGHT = 720;

// Playwright's bundled Chromium path (available after `npx playwright install`)
function getChromiumPath(): string | undefined {
  const candidates = [
    // Playwright's own download
    path.join(
      process.cwd(),
      ".cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
    ),
    path.join(
      os.homedir(),
      ".cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
    ),
    // Nix system chromium
    "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-unwrapped-98.0.4758.102-sandbox/bin/chromium",
  ];
  // Prefer the one that matches what dry-run reported
  const reported = "/home/runner/workspace/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome";
  return candidates.includes(reported) ? reported : candidates[0];
}

export async function renderPromoVideo(
  input: PromoRenderInput,
  onProgress?: (frame: number, total: number) => void,
): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "guber-promo-"));

  try {
    const totalFrames = Math.ceil(input.targetDuration * FPS);
    const frameMs = 1000 / FPS;

    // Encode promo data as base64 for the preview URL
    const encoded = encodeURIComponent(
      Buffer.from(JSON.stringify(input)).toString("base64"),
    );
    const previewUrl = `http://localhost:${process.env.PORT ?? 5000}/studio/promo/preview?d=${encoded}&headless=1`;

    // ── Launch Playwright ────────────────────────────────────────────────────
    const browser = await chromium.launch({
      executablePath: getChromiumPath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--hide-scrollbars",
        "--disable-web-security",
        "--allow-file-access-from-files",
      ],
      headless: true,
    });

    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
    });

    const page = await context.newPage();

    // Install fake clock BEFORE navigation — this freezes all timers and rAF
    await page.clock.install({ time: 0 });

    await page.goto(previewUrl, { waitUntil: "load", timeout: 30_000 });

    // Wait for React to mount and render the animation component
    await page.waitForSelector(".promo-ready", { timeout: 15_000 });

    // Give React one extra tick to finish painting
    await page.clock.fastForward(50);

    // ── Capture frames ───────────────────────────────────────────────────────
    for (let frame = 0; frame < totalFrames; frame++) {
      const framePath = path.join(
        tmpDir,
        `frame_${String(frame).padStart(5, "0")}.png`,
      );
      await page.screenshot({ path: framePath, type: "png" });
      if (frame < totalFrames - 1) {
        // Advance Playwright's fake clock by one frame — this fires setTimeout
        // callbacks (scene transitions) AND advances Framer Motion via rAF.
        await page.clock.fastForward(frameMs);
      }
      onProgress?.(frame + 1, totalFrames);
    }

    await browser.close();

    // ── ffmpeg encode ────────────────────────────────────────────────────────
    const outputPath = path.join(tmpDir, "promo.mp4");
    await execFileAsync("ffmpeg", [
      "-y",
      "-framerate", String(FPS),
      "-i", path.join(tmpDir, "frame_%05d.png"),
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "22",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outputPath,
    ]);

    const mp4 = await fs.readFile(outputPath);
    return mp4;
  } finally {
    // Best-effort cleanup
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
