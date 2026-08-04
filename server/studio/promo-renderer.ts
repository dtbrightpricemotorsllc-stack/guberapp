// GUBER Studio — Promo Video Renderer
// Uses Playwright's fake clock to control Framer Motion frame-by-frame,
// captures screenshots, then encodes to MP4 with ffmpeg.

// playwright-core is loaded dynamically so esbuild never statically bundles it
// (it arrives at runtime as a transitive dep of @playwright/test).
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
  /** Font id from FONT_OPTIONS — passed through to the preview page */

  fontId?: string;

  musicTrack?: string;    // filename relative to client/public/music/, e.g. "drive.mp3"; omit for no music
}

const FPS = 24;
const WIDTH = 1280;
const HEIGHT = 720;

// -18 dB volume factor: ducks music so it never drowns a voice-over
const MUSIC_VOLUME_DB = "-18dB";

const TRUSTED_IMAGE_ORIGINS = [
  "res.cloudinary.com",
  "cloudinary.com",
];
function getChromiumPath(): string {
  // Primary: let playwright-core resolve the installed revision dynamically.
  try {
    const p = chromium.executablePath();
    if (p) return p;
  } catch {
    // falls through to static fallback
  }

  // Fallback: known Replit Nix-store / cache location.
  const candidates = [
    path.join(process.cwd(), ".cache/ms-playwright/chromium-1217/chrome-linux64/chrome"),
    path.join(os.homedir(), ".cache/ms-playwright/chromium-1217/chrome-linux64/chrome"),
    "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-unwrapped-98.0.4758.102-sandbox/bin/chromium",
  ];
  const found = candidates.find((p) => {
    try { require("fs").accessSync(p); return true; } catch { return false; }
  });
  if (found) return found;

  throw new Error(
    "Chromium executable not found. Run `npx playwright install chromium` and retry.",
  );
}

export async function renderPromoVideo(
  input: PromoRenderInput,
  onProgress?: (frame: number, total: number) => void,
): Promise<Buffer> {
  // ── Validate image sources ──────────────────────────────────────────────
  const badImages = (input.images ?? []).filter((u) => !isTrustedImageUrl(u));
  if (badImages.length > 0) {
    throw new Error(
      `Image source not allowed: ${badImages[0]}. Only Cloudinary-hosted images are accepted.`,
    );
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "guber-promo-"));

  try {
    const totalFrames = Math.ceil(input.targetDuration * FPS);
    const frameMs = 1000 / FPS;

    // Encode promo data as base64 for the preview URL
    const encoded = encodeURIComponent(
      Buffer.from(JSON.stringify(input)).toString("base64"),
    );
    const previewUrl = `http://localhost:${process.env.PORT ?? 5000}/studio/promo/preview?d=${encoded}&headless=1`;

    // ── Launch Playwright ───────────────────────────────────────────────────
    const { chromium } = await import("playwright-core");
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

    // ── ffmpeg encode ───────────────────────────────────────────────────────
    const outputPath = path.join(tmpDir, "promo.mp4");

    if (input.musicTrack) {
      // Resolve the music file path — stored in client/public/music/
      const musicPath = path.join(
        process.cwd(),
        "client/public/music",
        path.basename(input.musicTrack), // prevent path traversal
      );

      // Verify the file exists before passing to ffmpeg
      let musicExists = false;
      try {
        await fs.access(musicPath);
        musicExists = true;
      } catch {
        console.warn(`[promo-render] Music track not found: ${musicPath}, rendering without audio`);
      }

      if (musicExists) {
        // Mix: video frames + looped/ducked audio track
        // -stream_loop -1 loops the audio indefinitely; -shortest stops at video end.
        // volume=${MUSIC_VOLUME_DB} ducks to -18 dB so it never drowns voice-over.
        await execFileAsync("ffmpeg", [
          "-y",
          "-framerate", String(FPS),
          "-i", path.join(tmpDir, "frame_%05d.png"),
          "-stream_loop", "-1",
          "-i", musicPath,
          "-c:v", "libx264",
          "-preset", "fast",
          "-crf", "22",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac",
          "-b:a", "128k",
          "-filter_complex", `[1:a]volume=${MUSIC_VOLUME_DB}[music];[music]apad[a]`,
          "-map", "0:v",
          "-map", "[a]",
          "-shortest",
          "-movflags", "+faststart",
          outputPath,
        ]);
      } else {
        // Fall back to silent encode
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
      }
    } else {
      // No music — silent encode
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
    }

    const mp4 = await fs.readFile(outputPath);
    return mp4;
  } finally {
    // Best-effort cleanup
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Returns true when the URL is from a trusted upload origin.
 * Data-URLs (base64) are allowed as well — they carry no outbound request.
 */
export function isTrustedImageUrl(url: string): boolean {
  if (url.startsWith("data:image/")) return true;
  try {
    const { hostname } = new URL(url);
    return TRUSTED_IMAGE_ORIGINS.some(
      (trusted) => hostname === trusted || hostname.endsWith(`.${trusted}`),
    );
  } catch {
    return false;
  }
}
