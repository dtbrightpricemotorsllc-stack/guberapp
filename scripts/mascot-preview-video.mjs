import { fal } from "@fal-ai/client";
import fs from "fs";
import https from "https";
import http from "http";

const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) { console.error("FAL_KEY not set"); process.exit(1); }

fal.config({ credentials: FAL_KEY });

const OUT_DIR = "client/public/mascot-spec";
const IMAGE_URL = "https://v3b.fal.media/files/b/0a9f027c/5VEtbKcqZ2UPHxSIEniom_file_000000000484720cadfe29f97bb52842_1781929681048.png.png";

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, res => { res.pipe(file); file.on("finish", () => { file.close(); resolve(); }); })
      .on("error", e => { fs.unlink(dest, () => {}); reject(e); });
  });
}

async function main() {
  console.log("=== GUBER Mascot Preview Video (fal SDK) ===\n");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const prompt = "The GUBER badger mascot slowly nods its head, blinks its eyes, and its mouth opens and closes as if talking excitedly. The purple cape sways gently. 3D cartoon character, dark background, smooth natural animation, centered frame.";

  // Try kling v1.6 first
  const models = [
    {
      id: "fal-ai/kling-video/v1-6/standard/image-to-video",
      input: { image_url: IMAGE_URL, prompt, duration: "5", aspect_ratio: "9:16" },
    },
    {
      id: "fal-ai/kling-video/v1/standard/image-to-video",
      input: { image_url: IMAGE_URL, prompt, duration: "5", aspect_ratio: "9:16" },
    },
    {
      id: "fal-ai/stable-video",
      input: { image_url: IMAGE_URL, motion_bucket_id: 90, fps: 24 },
    },
  ];

  for (const { id, input } of models) {
    console.log(`Trying: ${id}`);
    try {
      const result = await fal.subscribe(id, {
        input,
        logs: true,
        onQueueUpdate(update) {
          if (update.status === "IN_PROGRESS") {
            const log = update.logs?.slice(-1)[0]?.message;
            if (log) process.stdout.write(`\r  ${log.slice(0, 80)}      `);
          } else {
            process.stdout.write(`\r  Status: ${update.status}                          `);
          }
        },
      });
      console.log("\n  Done. Result keys:", Object.keys(result.data || result));
      const data = result.data || result;
      const videoUrl = data.video?.url || data.url;
      if (videoUrl) {
        const outPath = `${OUT_DIR}/GUBER_mascot_preview.mp4`;
        console.log("  Downloading →", outPath);
        await download(videoUrl, outPath);
        const size = (fs.statSync(outPath).size / 1024).toFixed(0);
        console.log(`✓ Saved: ${outPath} (${size} KB)`);
        return;
      }
    } catch (err) {
      console.log(`\n  Failed: ${err.message?.slice(0, 150)}`);
    }
  }
  console.error("All video models failed.");
}

main().catch(err => { console.error(err); process.exit(1); });
