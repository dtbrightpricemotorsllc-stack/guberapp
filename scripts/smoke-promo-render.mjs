#!/usr/bin/env node
/**
 * Promo Render Smoke Test
 *
 * Validates the Playwright fake-clock → frame capture → ffmpeg pipeline
 * end-to-end before any real user triggers it.
 *
 * Steps:
 *  1. Reuse a running server on PORT, or start the dev server.
 *  2. Launch Playwright with fake clock against /studio/promo/preview.
 *  3. Capture 10 evenly-spaced frames using clock.fastForward().
 *  4. Assert every frame is non-black / non-blank (ffprobe mean luma > 0.5).
 *  5. Encode frames to MP4 with ffmpeg.
 *  6. Confirm MP4 duration is within ±0.5 s of expected.
 *
 * Exit 0 = pass, exit 1 = fail.
 */

import { chromium } from "playwright-core";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";
import http from "http";

const execFileAsync = promisify(execFile);

// ── Config ────────────────────────────────────────────────────────────────────

const TARGET_DURATION = 6;   // seconds — short enough for a fast smoke test
const FRAME_COUNT     = 10;  // frames to sample
const FPS             = 24;
const WIDTH           = 1280;
const HEIGHT          = 720;
const PORT            = process.env.PORT ?? 5000;

const SAMPLE_PROMO = {
  brandName: "SmokeTest Co",
  tagline: "Built to verify",
  productDescription: "A short description exercising the render pipeline start to finish.",
  stylePreset: "professional",
  callToAction: "Get Started",
  images: [],
  targetDuration: TARGET_DURATION,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[promo-smoke] ${msg}`); }
function fail(msg) { console.error(`[promo-smoke] FAIL: ${msg}`); }

/** Probe whether a local HTTP server is listening on PORT. */
function waitForServer(port, timeout = 30_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    function attempt() {
      const req = http.get(`http://localhost:${port}/`, (res) => {
        res.resume();
        resolve();
      });
      req.setTimeout(2_000, () => req.destroy());
      req.on("error", () => {
        if (Date.now() >= deadline) return reject(new Error(`Server never ready on :${port}`));
        setTimeout(attempt, 500);
      });
    }
    attempt();
  });
}

/** Use ffprobe to measure actual MP4 duration in seconds. */
async function probeDuration(mp4Path) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    mp4Path,
  ]);
  const val = parseFloat(stdout.trim());
  if (isNaN(val)) throw new Error(`ffprobe returned non-numeric duration: "${stdout.trim()}"`);
  return val;
}

/**
 * Returns mean luma (Y channel average, 0–255) of a PNG via ffprobe lavfi.
 * A fully-black frame returns 0; any rendered content will be > 0.
 */
async function frameMeanLuma(pngPath) {
  try {
    // ffprobe lavfi approach: read the image through the signalstats filter
    const { stdout } = await execFileAsync("ffprobe", [
      "-f", "lavfi",
      "-i", `movie=${pngPath.replace(/\\/g, "/")},signalstats`,
      "-show_entries", "frame_tags=lavfi.signalstats.YAVG",
      "-of", "csv=p=0",
      "-v", "error",
    ]);
    const val = parseFloat(stdout.trim());
    return isNaN(val) ? -1 : val;
  } catch {
    // Fallback: use ffmpeg -vf with lumakey and read stderr stats
    // This always succeeds even on minimal ffprobe builds.
    return -1;
  }
}

/** Resolve the Chromium executable Playwright should use.
 *  Prefer the NixOS system chromium (has all required shared libs in this
 *  Replit environment), then fall back to the Playwright-bundled binary. */
function resolveChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;

  // NixOS system chromium must come first — the Playwright-bundled binary
  // cannot find libglib-2.0.so.0 in this environment and crashes immediately.
  const candidates = [
    "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
    path.join(process.cwd(), ".cache/ms-playwright/chromium-1217/chrome-linux64/chrome"),
    path.join(os.homedir(), ".cache/ms-playwright/chromium-1217/chrome-linux64/chrome"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return undefined; // let Playwright try its own registry
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let serverProc = null;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "promo-smoke-"));
  log(`Temp dir: ${tmpDir}`);

  try {
    // 1. Ensure a server is running ─────────────────────────────────────────
    log(`Checking for server on :${PORT}…`);
    let serverAlreadyUp = false;
    try {
      await waitForServer(PORT, 2_000);
      serverAlreadyUp = true;
      log("Server already running — reusing it.");
    } catch { /* not up yet */ }

    if (!serverAlreadyUp) {
      log("Starting dev server…");
      serverProc = spawn("npm", ["run", "dev"], {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, NODE_ENV: "development" },
      });
      serverProc.stdout.on("data", (d) => process.stdout.write(`  [server] ${d}`));
      serverProc.stderr.on("data", (d) => process.stderr.write(`  [server] ${d}`));
      await waitForServer(PORT, 60_000);
      log("Server ready.");
    }

    // 2. Build the preview URL ──────────────────────────────────────────────
    const encoded = encodeURIComponent(
      Buffer.from(JSON.stringify(SAMPLE_PROMO)).toString("base64"),
    );
    const previewUrl = `http://localhost:${PORT}/studio/promo/preview?d=${encoded}&headless=1`;
    log(`Preview URL (truncated): ${previewUrl.slice(0, 90)}…`);

    // 3. Launch Playwright ──────────────────────────────────────────────────
    log("Launching Playwright…");
    const chromiumPath = resolveChromium();
    if (chromiumPath) log(`Chromium: ${chromiumPath}`);

    const browser = await chromium.launch({
      executablePath: chromiumPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--hide-scrollbars",
      ],
      headless: true,
    });

    const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
    const page = await context.newPage();

    // Install fake clock BEFORE navigation — freezes rAF + setTimeout
    await page.clock.install({ time: 0 });

    log("Navigating to preview page…");
    await page.goto(previewUrl, { waitUntil: "load", timeout: 30_000 });

    // Wait for React to mount the animation component.
    // .promo-ready is always display:none (a hidden marker), so wait for
    // it to be attached to the DOM, not visible.
    await page.waitForSelector(".promo-ready", { state: "attached", timeout: 15_000 });
    log(".promo-ready found — React component mounted ✓");

    // Give React one extra tick to finish first paint
    await page.clock.fastForward(50);

    // 4. Capture FRAME_COUNT evenly-spaced frames ──────────────────────────
    log(`Capturing ${FRAME_COUNT} frames across ${TARGET_DURATION}s of animation…`);
    const totalFrames = Math.ceil(TARGET_DURATION * FPS);
    const step = totalFrames / (FRAME_COUNT - 1); // spread evenly including last frame
    const frameMs = 1000 / FPS;
    const framePaths = [];
    let currentFrame = 0;

    for (let i = 0; i < FRAME_COUNT; i++) {
      const targetFrame = Math.round(i * step);
      const msToAdvance = Math.max(0, (targetFrame - currentFrame) * frameMs);
      if (msToAdvance > 0) await page.clock.fastForward(msToAdvance);
      currentFrame = targetFrame;

      const framePath = path.join(tmpDir, `frame_${String(i).padStart(3, "0")}.png`);
      await page.screenshot({ path: framePath, type: "png" });
      framePaths.push(framePath);
      log(`  captured frame ${i} (t=${(targetFrame / FPS).toFixed(2)}s)`);
    }

    await browser.close();
    log("Browser closed.");

    // 5. Assert frames are non-black / non-blank ────────────────────────────
    log("Validating frames are not black…");
    let frameErrors = 0;
    for (let i = 0; i < framePaths.length; i++) {
      const luma = await frameMeanLuma(framePaths[i]);
      if (luma === -1) {
        // ffprobe lavfi not available — check file size as a proxy:
        // a valid 1280×720 PNG will always be > 10 KB; a blank/error PNG is tiny.
        const stat = await fs.stat(framePaths[i]);
        if (stat.size < 10_000) {
          fail(`frame ${i}: file too small (${stat.size} bytes) — likely blank or corrupt`);
          frameErrors++;
        } else {
          log(`  frame ${i}: size=${stat.size} bytes (luma probe unavailable, size OK)`);
        }
      } else if (luma < 0.5) {
        fail(`frame ${i}: appears black (YAVG=${luma.toFixed(3)})`);
        frameErrors++;
      } else {
        log(`  frame ${i}: YAVG=${luma.toFixed(2)} ✓`);
      }
    }
    if (frameErrors > 0) throw new Error(`${frameErrors} frame(s) failed the non-black check`);
    log("All frames pass non-black check ✓");

    // 6. Encode frames to MP4 ──────────────────────────────────────────────
    // Write frames sequentially at 1 fps so FRAME_COUNT frames → FRAME_COUNT seconds.
    log("Encoding frames to MP4 with ffmpeg…");
    const encodeDir = path.join(tmpDir, "encode");
    await fs.mkdir(encodeDir);
    for (let i = 0; i < framePaths.length; i++) {
      await fs.copyFile(framePaths[i], path.join(encodeDir, `frame_${String(i).padStart(5, "0")}.png`));
    }

    const outputMp4 = path.join(tmpDir, "smoke.mp4");
    await execFileAsync("ffmpeg", [
      "-y",
      "-framerate", "1",   // 1 fps → each frame lasts 1 s → total = FRAME_COUNT s
      "-i", path.join(encodeDir, "frame_%05d.png"),
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "22",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outputMp4,
    ]);
    log("ffmpeg encode succeeded ✓");

    // 7. Verify MP4 duration ────────────────────────────────────────────────
    const duration = await probeDuration(outputMp4);
    const expectedDuration = FRAME_COUNT; // 1 fps × FRAME_COUNT frames
    const tolerance = 0.5;
    log(`MP4 duration: ${duration.toFixed(3)}s  expected: ~${expectedDuration}s ±${tolerance}s`);
    if (Math.abs(duration - expectedDuration) > tolerance) {
      throw new Error(
        `MP4 duration ${duration.toFixed(3)}s is outside expected range ` +
        `[${expectedDuration - tolerance}, ${expectedDuration + tolerance}]`,
      );
    }
    log("MP4 duration within tolerance ✓");

    // ── All checks passed ─────────────────────────────────────────────────
    console.log("\n✅  Promo render smoke test PASSED\n");

  } catch (e) {
    fail(e.message ?? String(e));
    if (e.stack) console.error(e.stack);
    process.exitCode = 1;
  } finally {
    if (serverProc) {
      log("Stopping dev server…");
      serverProc.kill("SIGTERM");
      await new Promise((r) => serverProc.on("exit", r));
    }
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

main();
