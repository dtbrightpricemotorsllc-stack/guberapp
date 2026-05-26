/**
 * GUBER Hero Video Generator
 * Produces a 10-second cinematic clip from the hero badger image.
 *
 * Pipeline:
 *  1. Upload source image to Cloudinary → public URL for Fal.ai
 *  2. Kling Motion Control (10s) + MiniMax Music — run in parallel
 *  3. FFmpeg — merge audio, add "Guber Studios" watermark
 *  4. Upload final MP4 to Cloudinary
 *  5. Save as studio_featured_clips template row
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { pool } from "../server/db.js";

// ── Load env from .env if not already set ────────────────────────────────────
const dotenvPath = path.resolve(".env");
if (fs.existsSync(dotenvPath)) {
  const lines = fs.readFileSync(dotenvPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const FAL_KEY = process.env.FAL_KEY;
const CLD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLD_KEY = process.env.CLOUDINARY_API_KEY;
const CLD_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!FAL_KEY) { console.error("FAL_KEY not set"); process.exit(1); }
if (!CLD_NAME || !CLD_KEY || !CLD_SECRET) { console.error("Cloudinary env vars missing"); process.exit(1); }

const FAL_BASE = "https://queue.fal.run";
const TMP = "/tmp/guber-hero";
fs.mkdirSync(TMP, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

async function falSubmit<T>(endpoint: string, input: Record<string, any>): Promise<T> {
  const submitRes = await fetch(`${FAL_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Authorization": `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!submitRes.ok) throw new Error(`Fal submit failed ${submitRes.status}: ${await submitRes.text()}`);
  const { request_id, status_url, response_url } = await submitRes.json() as any;
  console.log(`  ↳ queued ${endpoint} (${request_id})`);

  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const st = await fetch(status_url, { headers: { "Authorization": `Key ${FAL_KEY}` } });
    const { status } = await st.json() as any;
    process.stdout.write(`\r  ↳ ${endpoint}: ${status}      `);
    if (status === "COMPLETED") break;
    if (status === "FAILED") throw new Error(`Fal job ${request_id} failed`);
  }
  console.log();
  const res = await fetch(response_url, { headers: { "Authorization": `Key ${FAL_KEY}` } });
  return res.json() as T;
}

async function cloudinaryUpload(filePath: string, folder: string, resourceType: "image" | "video" | "raw" = "video"): Promise<string> {
  const crypto = await import("crypto");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = `${folder}/${path.basename(filePath, path.extname(filePath))}-${timestamp}`;
  const toSign = `public_id=${publicId}&timestamp=${timestamp}${CLD_SECRET}`;
  const signature = crypto.createHash("sha1").update(toSign).digest("hex");

  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  form.append("api_key", CLD_KEY!);
  form.append("timestamp", timestamp);
  form.append("public_id", publicId);
  form.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLD_NAME}/${resourceType}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Cloudinary upload failed: ${await res.text()}`);
  const json = await res.json() as any;
  return json.secure_url as string;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(`  ↳ saved ${dest} (${(buf.length / 1024).toFixed(0)} KB)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const SRC_IMAGE = "attached_assets/file_0000000032a4720cb30a2cea2b2e2b91_1779753753680.png";
  if (!fs.existsSync(SRC_IMAGE)) { console.error("Source image not found:", SRC_IMAGE); process.exit(1); }

  // ── Step 1: Upload source image to Cloudinary for a public URL ────────────
  console.log("\n[1/5] Uploading source image to Cloudinary...");
  const imageUrl = await cloudinaryUpload(SRC_IMAGE, "guber-studio/sources", "image");
  console.log("  ↳ image URL:", imageUrl);

  // ── Step 2: Parallel generation — video + music ───────────────────────────
  console.log("\n[2/5] Generating 10s animated video + music (parallel)...");

  const VIDEO_PROMPT =
    "The GUBER badger hero stands atop a rooftop overlooking a glowing night cityscape. " +
    "Cape gently billowing and fluttering in the breeze, white chest fur softly rippling, " +
    "fluffy badger tail slowly wagging side to side. Storm clouds drifting slowly across the " +
    "dark sky. The GUBER spotlight beam sweeping gently left and right across the clouds. " +
    "City lights pulsing warmly below. Distant police sirens and city ambience. " +
    "Epic cinematic, atmospheric, 4K, dramatic lighting, heroic.";

  const MUSIC_PROMPT =
    "Emotional American rebuild theme. Sweeping orchestral score, hopeful yet powerful, " +
    "deep brass and soaring strings, cinematic fanfare, patriotic upswing, " +
    "distant city sirens woven into the soundscape, urban night ambience underneath, " +
    "triumphant but raw, 10 seconds.";

  const [videoOutput, musicOutput] = await Promise.all([
    falSubmit<any>("fal-ai/kling-video/v1/standard/image-to-video", {
      prompt: VIDEO_PROMPT,
      image_url: imageUrl,
      duration: "10",
      aspect_ratio: "9:16",
    }),
    falSubmit<any>("fal-ai/minimax-music/v2", {
      prompt: MUSIC_PROMPT,
      duration: 10,
    }),
  ]);

  const rawVideoUrl: string = videoOutput?.video?.url || videoOutput?.videos?.[0]?.url || videoOutput?.url;
  const rawAudioUrl: string = musicOutput?.audio?.url || musicOutput?.url;
  if (!rawVideoUrl) throw new Error("No video URL in response: " + JSON.stringify(videoOutput));
  if (!rawAudioUrl) throw new Error("No audio URL in MiniMax response: " + JSON.stringify(musicOutput));
  console.log("  ↳ raw video:", rawVideoUrl);
  console.log("  ↳ raw audio:", rawAudioUrl);

  // ── Step 3: Download raw files ────────────────────────────────────────────
  console.log("\n[3/5] Downloading raw video and audio...");
  const rawVideoPath = path.join(TMP, "raw-video.mp4");
  const rawAudioPath = path.join(TMP, "raw-audio.mp3");
  await Promise.all([
    downloadFile(rawVideoUrl, rawVideoPath),
    downloadFile(rawAudioUrl, rawAudioPath),
  ]);

  // ── Step 4: FFmpeg — merge audio + watermark ──────────────────────────────
  console.log("\n[4/5] Merging audio and adding watermark...");
  const finalPath = path.join(TMP, "guber-hero-final.mp4");

  // Watermark: "Guber Studios" in bottom-right, semi-transparent white
  const ffmpegCmd = [
    "ffmpeg -y",
    `-i "${rawVideoPath}"`,
    `-i "${rawAudioPath}"`,
    // Mix audio: music at 70% volume, trim to 10s
    `-filter_complex`,
    `"[1:a]volume=0.7,atrim=0:10,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aud];` +
    `[0:v]drawtext=text='Guber Studios':fontsize=24:fontcolor=white@0.55:` +
    `x=w-tw-20:y=h-th-20:font=sans-serif[vwm]"`,
    `-map "[vwm]" -map "[aud]"`,
    `-t 10`,
    `-c:v libx264 -preset fast -crf 20`,
    `-c:a aac -b:a 192k`,
    `-movflags +faststart`,
    `"${finalPath}"`,
  ].join(" ");

  console.log("  ↳ running ffmpeg...");
  execSync(ffmpegCmd, { stdio: "pipe" });
  console.log("  ↳ final video:", finalPath, `(${(fs.statSync(finalPath).size / 1024 / 1024).toFixed(1)} MB)`);

  // ── Step 5: Upload final video + save as template ─────────────────────────
  console.log("\n[5/5] Uploading final video to Cloudinary...");
  const finalVideoUrl = await cloudinaryUpload(finalPath, "guber-studio/templates", "video");
  console.log("  ↳ final URL:", finalVideoUrl);

  // Save poster image (source PNG as poster)
  const posterUrl = imageUrl;

  // Save to studio_featured_clips as a template
  console.log("\n  Saving template to database...");
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO studio_featured_clips (slug, label, caption, video_url, poster_url, position, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (slug) DO UPDATE SET
         label = EXCLUDED.label,
         caption = EXCLUDED.caption,
         video_url = EXCLUDED.video_url,
         poster_url = EXCLUDED.poster_url,
         active = true`,
      [
        "guber-hero-city-night",
        "GUBER Hero — City Night",
        VIDEO_PROMPT,
        finalVideoUrl,
        posterUrl,
        1,
        true,
      ]
    );
    console.log("  ↳ template saved as slug: guber-hero-city-night");
  } finally {
    client.release();
  }

  console.log("\n✅ Done! Final video:", finalVideoUrl);
  console.log("   Template visible in GUBER Studio → /studio/explore");
  await pool.end();
}

main().catch(err => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});
