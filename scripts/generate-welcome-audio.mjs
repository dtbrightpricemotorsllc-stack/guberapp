/**
 * One-time script: generate public/jac-audio/welcome.mp3
 *
 * Uses OpenAI TTS (tts-1-hd, voice "nova") as the generation source.
 * The file is served statically — $0 per visitor after this runs once.
 *
 * To regenerate with JAC's ElevenLabs "Jessica" voice instead, add
 * text_to_speech scope to the ELEVENLABS_API_KEY in Replit secrets,
 * then swap the fetch call below for the ElevenLabs TTS API.
 *
 * Run:  node scripts/generate-welcome-audio.mjs
 */
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../public/jac-audio/welcome.mp3");

// Normalized text — same rewrites as normalizeTtsText() in jac-tts.ts:
//   GUBER → Goober  (so TTS pronounces it correctly)
//   JAC   → Jack
const TEXT = "Hey, welcome to Team Goober. What are you trying to make happen?";

const baseUrl = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const apiKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

if (!apiKey) {
  console.error("❌  AI_INTEGRATIONS_OPENAI_API_KEY not set.");
  process.exit(1);
}

console.log("Generating greeting audio via OpenAI TTS…");
console.log(`  Model : tts-1-hd`);
console.log(`  Voice : nova`);
console.log(`  Text  : "${TEXT}"`);

const res = await fetch(`${baseUrl}/audio/speech`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "tts-1-hd",
    voice: "nova",        // warm, clear female voice — closest OpenAI match
    input: TEXT,
    response_format: "mp3",
  }),
});

if (!res.ok) {
  const body = await res.text();
  console.error(`❌  OpenAI TTS error ${res.status}: ${body}`);
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(OUT_PATH, buf);
console.log(`✅  Saved ${buf.length} bytes → ${OUT_PATH}`);
console.log();
console.log("NOTE: This was generated with OpenAI TTS (nova voice).");
console.log("To use JAC's exact ElevenLabs Jessica voice, add text_to_speech");
console.log("scope to ELEVENLABS_API_KEY and re-run with the ElevenLabs API.");
