/**
 * One-time script: generate GUBER doors-opening video using the real uploaded images.
 * Run with:  npx tsx scripts/generate-door-video.ts
 *
 * Uses Kling v1.6 Pro image-to-video with:
 *   - image 1 (closed doors) as the start frame
 *   - image 2 (open doors + JAC team) as the end frame
 * Result saved to attached_assets/generated_videos/guber-doors-real.mp4
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ─────────────────────────────────────────────────────────────────
const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) { console.error("❌ FAL_KEY not set"); process.exit(1); }

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const FAL_QUEUE = "https://queue.fal.run";

// ── Upload image to Cloudinary → get public URL ────────────────────────────
async function uploadToCloudinary(localPath: string, publicId: string): Promise<string> {
  const result = await cloudinary.uploader.upload(localPath, {
    public_id: publicId,
    folder: "guber-video-gen",
    overwrite: true,
    resource_type: "image",
  });
  console.log(`  ✓ uploaded → ${result.secure_url}`);
  return result.secure_url;
}

// ── Submit to fal.ai queue and poll until done ─────────────────────────────
async function submitAndWait(endpoint: string, input: Record<string, unknown>): Promise<any> {
  const submitRes = await fetch(`${FAL_QUEUE}/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(`Submit failed ${submitRes.status}: ${text.slice(0, 400)}`);
  }
  const { request_id, status_url, response_url } = (await submitRes.json()) as any;
  console.log(`  job ${request_id} queued — polling…`);

  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 6000));
    const st = await fetch(status_url, { headers: { Authorization: `Key ${FAL_KEY}` } });
    const { status } = (await st.json()) as any;
    process.stdout.write(`  status: ${status}          \r`);
    if (status === "COMPLETED") break;
    if (status === "FAILED") throw new Error("Fal job FAILED");
  }
  process.stdout.write("\n");

  const finalRes = await fetch(response_url, { headers: { Authorization: `Key ${FAL_KEY}` } });
  return finalRes.json();
}

// ── Main ───────────────────────────────────────────────────────────────────
const img1 = resolve(__dirname, "../attached_assets/file_000000004f7081f7bf431e2817f96ac5_1786809141756.png");
const img2 = resolve(__dirname, "../attached_assets/file_00000000a36c822f8f53e46bf5bb37a1_1786809151889.png");

console.log("\n=== GUBER Doors Opening Video Generator ===\n");
console.log("Step 1: Uploading source images to Cloudinary…");
const [startUrl, endUrl] = await Promise.all([
  uploadToCloudinary(img1, "guber-door-closed"),
  uploadToCloudinary(img2, "guber-door-open"),
]);

console.log("\nStep 2: Submitting to Kling v1.6 Pro (start frame + end frame)…");
const result = await submitAndWait("fal-ai/kling-video/v1.6/pro/image-to-video", {
  prompt:
    "Cinematic reveal: futuristic neon-lit sci-fi double doors slowly swing open from the center outward. " +
    "A burst of neon blue, purple and green light floods through as the doors part. " +
    "Smooth dramatic motion, portrait orientation, high quality, no camera shake.",
  image_url:      startUrl,
  tail_image_url: endUrl,
  duration:       "10",
  aspect_ratio:   "9:16",
});

console.log("\nStep 3: Downloading video…");
const videoUrl: string | undefined = result?.video?.url || result?.url;
if (!videoUrl) {
  console.error("No video URL in response:", JSON.stringify(result, null, 2));
  process.exit(1);
}
console.log(`  source URL: ${videoUrl}`);

const vidRes = await fetch(videoUrl);
const buf = Buffer.from(await vidRes.arrayBuffer());
const outPath = resolve(__dirname, "../attached_assets/generated_videos/guber-doors-real.mp4");
writeFileSync(outPath, buf);
console.log(`\n✅  Saved ${(buf.length / 1024 / 1024).toFixed(1)} MB → ${outPath}`);
