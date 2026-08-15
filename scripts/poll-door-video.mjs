import { writeFileSync } from "fs";

const FAL_KEY = process.env.FAL_KEY;
const REQUEST_ID = "01a00627-f5d1-79a1-ab3c-ba4ae69391af";
const STATUS_URL = `https://queue.fal.run/fal-ai/kling-video/v1.6/pro/image-to-video/requests/${REQUEST_ID}/status`;
const RESULT_URL = `https://queue.fal.run/fal-ai/kling-video/v1.6/pro/image-to-video/requests/${REQUEST_ID}`;

async function main() {
  const deadline = Date.now() + 9 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 8000));
    const st = await fetch(STATUS_URL, { headers: { Authorization: `Key ${FAL_KEY}` } });
    const json = await st.json();
    const status = json.status;
    process.stdout.write(`status: ${status}          \r`);
    if (status === "COMPLETED") {
      process.stdout.write("\n");
      const finalRes = await fetch(RESULT_URL, { headers: { Authorization: `Key ${FAL_KEY}` } });
      const result = await finalRes.json();
      const videoUrl = result?.video?.url || result?.url;
      if (!videoUrl) { console.error("No video URL:", JSON.stringify(result, null, 2)); process.exit(1); }
      console.log("Video URL:", videoUrl);
      const vidBuf = Buffer.from(await (await fetch(videoUrl)).arrayBuffer());
      const out = "attached_assets/generated_videos/guber-doors-real.mp4";
      writeFileSync(out, vidBuf);
      console.log(`✅  Saved ${(vidBuf.length / 1024 / 1024).toFixed(1)} MB → ${out}`);
      return;
    }
    if (status === "FAILED") { console.error("\n❌ Job FAILED:", JSON.stringify(json, null, 2)); process.exit(1); }
  }
  console.error("\n⏰ Timed out waiting for job");
}

main().catch(e => { console.error(e); process.exit(1); });
