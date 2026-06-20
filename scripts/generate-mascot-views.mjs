/**
 * Generate clean isolated mascot views using FLUX
 * for Hyper3D Rodin multi-view input
 */
import fs from "fs";
import https from "https";
import http from "http";

const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) { console.error("FAL_KEY not set"); process.exit(1); }

const OUT_DIR = "client/public/mascot-spec/views";
fs.mkdirSync(OUT_DIR, { recursive: true });

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(url, { ...options }, (res) => {
      let body = "";
      res.on("data", (c) => body += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body), raw: body }); }
        catch { resolve({ status: res.statusCode, body: null, raw: body }); }
      });
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", e => { fs.unlink(dest, () => {}); reject(e); });
  });
}

async function generateImage(prompt, filename) {
  const sub = await fetchJson("https://queue.fal.run/fal-ai/flux/schnell", {
    method: "POST",
    headers: { "Authorization": `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      image_size: "square_hd",
      num_inference_steps: 4,
      num_images: 1,
    }),
  });
  if (sub.status !== 200) { console.error("Submit failed:", sub.status, sub.raw?.slice(0,200)); return null; }
  const { request_id } = sub.body;

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const s = await fetchJson(`https://queue.fal.run/fal-ai/flux/schnell/requests/${request_id}/status`, {
      headers: { "Authorization": `Key ${FAL_KEY}` },
    });
    if (s.body?.status === "COMPLETED") {
      const r = await fetchJson(`https://queue.fal.run/fal-ai/flux/schnell/requests/${request_id}`, {
        headers: { "Authorization": `Key ${FAL_KEY}` },
      });
      const imgUrl = r.body?.images?.[0]?.url;
      if (imgUrl) {
        await downloadFile(imgUrl, `${OUT_DIR}/${filename}`);
        console.log(`  ✓ ${filename}`);
        return `${OUT_DIR}/${filename}`;
      }
    }
    if (s.body?.status === "FAILED") { console.error("Failed:", s.body); return null; }
    process.stdout.write(`\r  [${(i+1)*5}s] ${s.body?.status || "??"}`);
  }
  return null;
}

const BASE = "3D render, full body, isolated on pure white background, no shadows, no text, ultra clean, photorealistic 3D cartoon character, GUBER honey badger mascot: short stocky black and white badger body, round head, wearing dark purple superhero cape with glowing neon green trim, purple shield badge with letter G on chest, holding a smartphone showing a map app, large expressive eyes, cute round nose, white face with black eye patches";

const views = [
  { name: "front.png",    angle: "front view, facing camera directly, arms slightly out" },
  { name: "back.png",     angle: "back view, showing full purple cape with large G emblem" },
  { name: "left.png",     angle: "90 degree side view from the left, profile" },
  { name: "right.png",    angle: "90 degree side view from the right, profile" },
];

async function main() {
  console.log("Generating mascot reference views with FLUX...\n");
  const results = [];
  for (const v of views) {
    console.log(`Generating ${v.name}...`);
    const path = await generateImage(`${BASE}, ${v.angle}`, v.name);
    results.push({ name: v.name, path });
    console.log("");
  }
  console.log("\nGenerated views:");
  results.forEach(r => console.log(` ${r.path ? "✓" : "✗"} ${r.name}`));
}

main().catch(console.error);
