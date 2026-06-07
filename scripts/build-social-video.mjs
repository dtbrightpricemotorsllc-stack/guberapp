// scripts/build-social-video.mjs
// Assembles the user's marketing video with:
//   - Upbeat background music mixed at low volume under the original audio
//   - 3-second GUBER ending card appended
//
// Usage: node scripts/build-social-video.mjs
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";

const run = promisify(execFile);

const DIR = "attached_assets";
const AUD = `${DIR}/generated_audio`;
const VID = `${DIR}/generated_videos`;

const srcVideo  = `${DIR}/Video.Guru_20260607_073240695_1780835659054.mp4`;
const logo      = `${DIR}/Picsart_25-10-05_02-32-00-877_1772543526293.png`;
const musicBed  = `${AUD}/music_guber_promo_bed.mp3`;

const endCard   = `${VID}/_ending_card_tmp.mp4`;
const finalOut  = `${VID}/guber_social_master.mp4`;

const BOLD   = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const NEON   = "0x39FF14";
const PURPLE = "0xD100FF";
const WHITE  = "white";

// Source video is 888x1920 portrait, 58.953s
const SRC_W       = 888;
const SRC_H       = 1920;
const ENDCARD_DUR = 3;
const SRC_DUR     = 58.953470;
const TOTAL_DUR   = SRC_DUR + ENDCARD_DUR;   // ~61.95s

// Music volume under existing audio — quiet enough to hear all voices clearly
const MUS_VOL     = 0.12;

// ── helpers ───────────────────────────────────────────────────────────────────
async function ff(args, label) {
  console.log(`\n>>> ${label}`);
  try {
    await run("ffmpeg", ["-y", ...args], { maxBuffer: 1024 * 1024 * 256 });
    console.log(`    ✓ ${label}`);
  } catch (e) {
    console.error(`    ✗ FAIL: ${label}`);
    console.error(String(e.stderr || e.message).split("\n").slice(-30).join("\n"));
    throw e;
  }
}

const dt = (text, opts) =>
  `drawtext=fontfile=${BOLD}:text='${text}':${opts}`;

// ── verify inputs ─────────────────────────────────────────────────────────────
for (const f of [srcVideo, logo, musicBed]) {
  if (!fs.existsSync(f)) throw new Error(`Missing: ${f}`);
}
fs.mkdirSync(VID, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// PASS 1 — 3-second ending card (888x1920 portrait, video only)
//
// Layout (portrait 888x1920):
//   y=500  GUBER logo (scaled to 200px wide) centred
//   y=780  "Support & follow those"        — white,  54px
//   y=842  "who support & follow back"     — neon,   54px
//   y=982  "Creating value"                — white,  38px
//   y=1028 "Making you visible"            — white,  38px
//   y=1074 "Giving back."                  — neon,   38px
//   y=1190 "guberapp.com"                  — purple, 30px
//
// Whole card fades in (0–0.4s) and fades to black at end (2.6–3s).
// ─────────────────────────────────────────────────────────────────────────────
const ecFilter =
  // Scale logo to 200px wide
  `[1:v]scale=200:-1[lg];` +
  // Overlay logo on black bg, centred at y=500
  `[0:v][lg]overlay=(W-w)/2:500[bg];` +
  // Fade in + fade to black
  `[bg]fade=t=in:st=0:d=0.4,fade=t=out:st=2.6:d=0.4,` +
  // Line 1 — "Support & follow those"
  dt("Support & follow those",
    `fontsize=54:fontcolor=${WHITE}:` +
    `shadowcolor=black@0.5:shadowx=2:shadowy=2:` +
    `x=(w-text_w)/2:y=780`) + `,` +
  // Line 2 — neon green call-out
  dt("who support & follow back",
    `fontsize=54:fontcolor=${NEON}:` +
    `shadowcolor=black@0.5:shadowx=2:shadowy=2:` +
    `x=(w-text_w)/2:y=842`) + `,` +
  // Lines 3-5 — brand values
  dt("Creating value",
    `fontsize=38:fontcolor=white@0.80:x=(w-text_w)/2:y=982`) + `,` +
  dt("Making you visible",
    `fontsize=38:fontcolor=white@0.80:x=(w-text_w)/2:y=1028`) + `,` +
  dt("Giving back.",
    `fontsize=38:fontcolor=${NEON}:x=(w-text_w)/2:y=1074`) + `,` +
  // Website
  dt("guberapp.com",
    `fontsize=30:fontcolor=${PURPLE}:x=(w-text_w)/2:y=1190`) +
  `[vout]`;

await ff([
  "-f", "lavfi", "-i", `color=c=black:s=${SRC_W}x${SRC_H}:r=24:d=${ENDCARD_DUR}`,
  "-i", logo,
  "-filter_complex", ecFilter,
  "-map", "[vout]",
  "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "24",
  endCard,
], `Ending card (${ENDCARD_DUR}s, ${SRC_W}x${SRC_H} portrait)`);

// ─────────────────────────────────────────────────────────────────────────────
// PASS 2 — Full assembly
//
// Inputs:
//   0 — original marketing video  (video + original audio, 58.95s)
//   1 — ending card video         (video only,  3s)
//   2 — music bed                 (-stream_loop -1, looped)
//
// Video: normalize both to 24fps yuv420p → concat (58.95s + 3s = ~62s)
// Audio: original audio (vol 1.0) + looped music (vol 0.12, trimmed to total
//        duration, 1.5s fade-in, 2s fade-out at the end).
//        amix duration=longest → music covers ending card too.
// ─────────────────────────────────────────────────────────────────────────────
const fadeOutStart = (TOTAL_DUR - 2).toFixed(2);

const videoGraph =
  `[0:v]fps=24,format=yuv420p,setsar=1[v0];` +
  `[1:v]fps=24,format=yuv420p,setsar=1[v1];` +
  `[v0][v1]concat=n=2:v=1:a=0[vout]`;

const audioGraph =
  // Keep original audio at full volume
  `[0:a]volume=1.0[orig];` +
  // Music: loop, trim to total duration, low volume, fade in + fade out at end
  `[2:a]atrim=0:${TOTAL_DUR.toFixed(3)},` +
    `volume=${MUS_VOL},` +
    `afade=t=in:st=0:d=1.5,` +
    `afade=t=out:st=${fadeOutStart}:d=2[mus];` +
  // Mix: voices dominate, music is background texture
  `[orig][mus]amix=inputs=2:duration=longest:normalize=0[aout]`;

await ff([
  "-i", srcVideo,
  "-i", endCard,
  "-stream_loop", "-1", "-i", musicBed,
  "-filter_complex", `${videoGraph};${audioGraph}`,
  "-map", "[vout]", "-map", "[aout]",
  "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "24",
  "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
  finalOut,
], "Final assembly: original + ending card + music mix");

// Cleanup temp
if (fs.existsSync(endCard)) fs.unlinkSync(endCard);

// Probe the output
const { stdout } = await run("ffprobe", [
  "-v", "error",
  "-show_entries", "format=duration:stream=codec_type,width,height,codec_name",
  "-of", "default=nw=1",
  finalOut,
]);

console.log(`\n✅ DONE\n📁 ${finalOut}\n${stdout}`);
console.log(`\nTo download: the file is at ${finalOut}`);
