import { writeFileSync } from "fs";
const FAL_KEY = process.env.FAL_KEY;
const JOB = process.argv[2];
const ENDPOINT = process.argv[3] || "fal-ai/kling-video/v1.6/pro/image-to-video";
const STATUS_URL   = `https://queue.fal.run/${ENDPOINT}/requests/${JOB}/status`;
const RESPONSE_URL = `https://queue.fal.run/${ENDPOINT}/requests/${JOB}`;
const OUT = process.argv[4] || "attached_assets/generated_videos/guber-doors-real.mp4";

async function get(url) {
  const r = await fetch(url, { headers: { Authorization: `Key ${FAL_KEY}` } });
  const text = await r.text();
  if (!text.trim()) return {};
  return JSON.parse(text);
}

const st = await get(STATUS_URL);
console.log("status:", st.status, JSON.stringify(st).slice(0,200));
if (st.status === "COMPLETED") {
  const result = await get(RESPONSE_URL);
  const videoUrl = result?.video?.url || result?.url;
  if (!videoUrl) { console.error("No URL:", JSON.stringify(result)); process.exit(1); }
  console.log("URL:", videoUrl);
  const buf = Buffer.from(await (await fetch(videoUrl)).arrayBuffer());
  writeFileSync(OUT, buf);
  console.log(`✅ Saved ${(buf.length/1024/1024).toFixed(1)} MB → ${OUT}`);
} else {
  console.log("Not complete yet — status:", st.status);
}
