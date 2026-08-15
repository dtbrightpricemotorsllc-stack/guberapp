/**
 * Generates GUBER doors-opening video from the two real uploaded images.
 * Images already hosted on Cloudinary from previous run.
 */
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAL_KEY   = process.env.FAL_KEY;
if (!FAL_KEY) { console.error("❌ FAL_KEY not set"); process.exit(1); }

const START_URL = "https://res.cloudinary.com/ddsah8a5l/image/upload/v1786809676/guber-video-gen/guber-door-closed.jpg";
const END_URL   = "https://res.cloudinary.com/ddsah8a5l/image/upload/v1786809676/guber-video-gen/guber-door-open.jpg";

async function falPost(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${url} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function falGet(url) {
  const r = await fetch(url, { headers: { Authorization: `Key ${FAL_KEY}` } });
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}: ${await r.text()}`);
  return r.json();
}

// Submit
console.log("Submitting Kling v1.6 Pro image-to-video…");
const submit = await falPost(
  "https://queue.fal.run/fal-ai/kling-video/v1.6/pro/image-to-video",
  {
    prompt:
      "Dramatic cinematic reveal: neon-lit futuristic sci-fi double doors slowly swing open outward from the center. " +
      "Burst of blue, purple and green neon light as they part. Smooth, slow, high-quality portrait video.",
    image_url:      START_URL,
    tail_image_url: END_URL,
    duration:       "10",
    aspect_ratio:   "9:16",
  }
);

const { request_id, status_url, response_url } = submit;
console.log(`Job: ${request_id}`);

// Poll
const deadline = Date.now() + 12 * 60 * 1000;
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 10000));
  let st;
  try { st = await falGet(status_url); } catch { continue; }
  process.stdout.write(`  [${new Date().toISOString().slice(11,19)}] ${st.status}          \r`);
  if (st.status === "COMPLETED") break;
  if (st.status === "FAILED") { console.error("\n❌ FAILED:", JSON.stringify(st)); process.exit(1); }
}
process.stdout.write("\n");

// Fetch result
const result = await falGet(response_url);
const videoUrl = result?.video?.url || result?.url;
if (!videoUrl) { console.error("No video URL:", JSON.stringify(result)); process.exit(1); }
console.log("Video URL:", videoUrl);

// Download
const vidBuf = Buffer.from(await (await fetch(videoUrl)).arrayBuffer());
const out = resolve(__dirname, "../attached_assets/generated_videos/guber-doors-real.mp4");
writeFileSync(out, vidBuf);
console.log(`✅  ${(vidBuf.length / 1024 / 1024).toFixed(1)} MB → ${out}`);
