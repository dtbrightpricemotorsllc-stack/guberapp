import { writeFileSync } from "fs";
const FAL_KEY = process.env.FAL_KEY;

const START = "https://res.cloudinary.com/ddsah8a5l/image/upload/v1786809676/guber-video-gen/guber-door-closed.jpg";
const END   = "https://res.cloudinary.com/ddsah8a5l/image/upload/v1786809676/guber-video-gen/guber-door-open.jpg";
const ENDPOINT = "fal-ai/kling-video/v1.6/standard/image-to-video";

async function post(url, body) {
  const r = await fetch(url, { method:"POST", headers:{ Authorization:`Key ${FAL_KEY}`, "Content-Type":"application/json" }, body:JSON.stringify(body) });
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status}: ${t}`);
  return JSON.parse(t);
}
async function get(url) {
  const r = await fetch(url, { headers:{ Authorization:`Key ${FAL_KEY}` } });
  const t = await r.text(); return t.trim() ? JSON.parse(t) : {};
}

console.log("Submitting Kling v1.6 Standard (start + end frame)…");
const sub = await post(`https://queue.fal.run/${ENDPOINT}`, {
  prompt: "Cinematic reveal: futuristic neon sci-fi double doors swing open from the center outward. Burst of blue, green and purple neon light floods through. Smooth dramatic motion, portrait orientation.",
  image_url:      START,
  tail_image_url: END,
  duration:       "5",
  aspect_ratio:   "9:16",
});
const { request_id, status_url, response_url } = sub;
console.log("Job:", request_id);

const deadline = Date.now() + 12*60*1000;
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 8000));
  const st = await get(status_url);
  process.stdout.write(`[${new Date().toISOString().slice(11,19)}] ${st.status}          \r`);
  if (st.status === "COMPLETED") {
    process.stdout.write("\n");
    const res = await get(response_url);
    const videoUrl = res?.video?.url || res?.url;
    if (!videoUrl) { console.error("No URL:", JSON.stringify(res)); process.exit(1); }
    const buf = Buffer.from(await (await fetch(videoUrl)).arrayBuffer());
    const out = "attached_assets/generated_videos/guber-doors-real.mp4";
    writeFileSync(out, buf);
    console.log(`✅  ${(buf.length/1024/1024).toFixed(1)} MB → ${out}`);
    process.exit(0);
  }
  if (st.status === "FAILED") { console.error("\nFAILED:", JSON.stringify(st)); process.exit(1); }
}
console.error("Timed out"); process.exit(1);
