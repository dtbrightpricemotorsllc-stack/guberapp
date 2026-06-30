import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";

const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) { console.error("FAL_KEY not set"); process.exit(1); }

const IMAGE_PATH = "attached_assets/file_000000000484720cadfe29f97bb52842_1781929681048.png";
const OUT_DIR = "client/public/mascot-spec";

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

async function uploadToFal(filePath) {
  console.log("Uploading image to Fal.ai storage...");
  const fileData = fs.readFileSync(filePath);
  const fileName = path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, "_");

  const uploadRes = await fetchJson("https://rest.alpha.fal.ai/storage/upload/initiate", {
    method: "POST",
    headers: {
      "Authorization": `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file_name: `${fileName}.png`, content_type: "image/png" }),
  });

  if (uploadRes.status !== 200 || !uploadRes.body?.upload_url) {
    console.error("Upload initiate failed:", uploadRes.status, uploadRes.raw);
    return null;
  }

  const { upload_url, file_url } = uploadRes.body;
  console.log("Got upload URL. Uploading binary...");

  await new Promise((resolve, reject) => {
    const urlObj = new URL(upload_url);
    const lib = upload_url.startsWith("https") ? https : http;
    const req = lib.request(urlObj, {
      method: "PUT",
      headers: { "Content-Type": "image/png", "Content-Length": fileData.length },
    }, (res) => {
      res.resume();
      res.on("end", resolve);
    });
    req.on("error", reject);
    req.write(fileData);
    req.end();
  });

  console.log("Image uploaded:", file_url);
  return file_url;
}

async function runTrellis(imageUrl) {
  console.log("\nSubmitting to TRELLIS (image → 3D GLB)...");
  const submitRes = await fetchJson("https://queue.fal.run/fal-ai/trellis", {
    method: "POST",
    headers: {
      "Authorization": `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageUrl,
      ss_sampling_steps: 12,
      slat_sampling_steps: 12,
      mesh_simplify: 0.95,
      texture_size: 1024,
    }),
  });

  if (submitRes.status !== 200) {
    console.error("TRELLIS submit failed:", submitRes.status, submitRes.raw?.slice(0, 500));
    return null;
  }

  const { request_id } = submitRes.body;
  console.log("Job submitted:", request_id);
  return request_id;
}

async function pollResult(requestId, modelPath) {
  const statusUrl = `https://queue.fal.run/${modelPath}/requests/${requestId}/status`;
  const resultUrl = `https://queue.fal.run/${modelPath}/requests/${requestId}`;

  console.log("Polling for result...");
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const s = await fetchJson(statusUrl, {
      headers: { "Authorization": `Key ${FAL_KEY}` },
    });
    const status = s.body?.status;
    console.log(`  [${(i+1)*10}s] status: ${status}`);
    if (status === "COMPLETED") {
      const r = await fetchJson(resultUrl, {
        headers: { "Authorization": `Key ${FAL_KEY}` },
      });
      return r.body;
    }
    if (status === "FAILED") {
      console.error("Job failed:", JSON.stringify(s.body));
      return null;
    }
  }
  console.error("Timed out waiting for result");
  return null;
}

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, (res) => {
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", (e) => { fs.unlink(destPath, () => {}); reject(e); });
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const imageUrl = await uploadToFal(IMAGE_PATH);
  if (!imageUrl) { console.error("Upload failed"); process.exit(1); }

  const requestId = await runTrellis(imageUrl);
  if (!requestId) { console.error("Submission failed"); process.exit(1); }

  const result = await pollResult(requestId, "fal-ai/trellis");
  if (!result) { console.error("Generation failed"); process.exit(1); }

  console.log("\nResult keys:", Object.keys(result));

  const glbUrl = result.model_mesh?.url || result.video?.url || result.glb?.url;
  if (glbUrl) {
    const outPath = `${OUT_DIR}/GUBER_mascot_raw.glb`;
    console.log("Downloading GLB →", outPath);
    await downloadFile(glbUrl, outPath);
    console.log("✓ Saved:", outPath);
    console.log("\nFile size:", (fs.statSync(outPath).size / 1024).toFixed(1), "KB");
  } else {
    console.log("Full result:", JSON.stringify(result, null, 2));
  }
}

main().catch(console.error);
