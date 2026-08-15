/**
 * Generates the JAC door-open greeting as a static MP3.
 * Run once (or whenever the voice / greeting text changes):
 *   node scripts/generate-jac-welcome-audio.mjs
 *
 * Output: client/public/jac-audio/homepage-welcome.mp3
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "client", "public", "jac-audio");
const OUT_FILE = join(OUT_DIR, "homepage-welcome.mp3");

const GREETING_TEXT = "Hey, welcome to Team GUBER. What are you trying to make happen?";
const VOICE_ID      = process.env.JAC_ELEVENLABS_VOICE_ID || "cgSgspJ2msm6clMCkdW9"; // Jessica
const MODEL_ID      = process.env.JAC_ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";
const API_KEY       = process.env.ELEVENLABS_API_KEY;

if (!API_KEY) {
  console.error("ERROR: ELEVENLABS_API_KEY is not set.");
  process.exit(1);
}

const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;

console.log(`Generating greeting audio…`);
console.log(`  voice  : ${VOICE_ID}`);
console.log(`  model  : ${MODEL_ID}`);
console.log(`  text   : "${GREETING_TEXT}"`);

const res = await fetch(url, {
  method: "POST",
  headers: {
    "xi-api-key": API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    text: GREETING_TEXT,
    model_id: MODEL_ID,
    voice_settings: {
      stability: 0.38,
      similarity_boost: 0.9,
      style: 0.55,
      use_speaker_boost: true,
    },
  }),
});

if (!res.ok) {
  const body = await res.text().catch(() => "");
  console.error(`ElevenLabs error ${res.status}: ${body}`);
  process.exit(1);
}

const buf = await res.arrayBuffer();
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, Buffer.from(buf));
console.log(`✓ Saved ${buf.byteLength} bytes → ${OUT_FILE}`);
