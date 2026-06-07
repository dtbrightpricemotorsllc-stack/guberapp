// scripts/build-social-video.mjs
// Enhanced marketing video:
//   1. Cinematic color grade + sharpening + vignette on original footage
//   2. GUBER logo watermark (corner, semi-transparent)
//   3. Crowd/background noise reduction via spectral denoising (afftdn)
//   4. Cool background music at low volume under original audio
//   5. 3-second GUBER branded ending card appended
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

const endCardTmp = `${VID}/_ending_card_tmp.mp4`;
const finalOut   = `${VID}/guber_social_enhanced.mp4`;

const BOLD   = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const NEON   = "0x39FF14";
const PURPLE = "0xD100FF";
const WHITE  = "white";

// Video specs (source is 888x1920 portrait, 58.95s)
const SRC_DUR     = 58.953470;
const ENDCARD_DUR = 3;
const TOTAL_DUR   = SRC_DUR + ENDCARD_DUR;   // 61.95s

// ── helpers ───────────────────────────────────────────────────────────────────
async function ff(args, label) {
  console.log(`\n>>> ${label}`);
  try {
    await run("ffmpeg", ["-y", ...args], { maxBuffer: 1024 * 1024 * 512 });
    console.log(`    ✓ ${label}`);
  } catch (e) {
    console.error(`    ✗ FAIL: ${label}`);
    console.error(String(e.stderr || e.message).split("\n").slice(-25).join("\n"));
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
// More epic redesign:
//   • Neon green glowing border on key text (borderw + neon bordercolor)
//   • GUBER logo centred
//   • Fast reveal: everything fades in together (0–0.4s), holds, fades out (2.6–3s)
// ─────────────────────────────────────────────────────────────────────────────
const ecFilter =
  `[1:v]scale=200:-1[lg];` +
  `[0:v][lg]overlay=(W-w)/2:480[bg];` +
  `[bg]fade=t=in:st=0:d=0.4,fade=t=out:st=2.6:d=0.4,` +
  // Top label — small GUBER brand label
  dt("G U B E R",
    `fontsize=26:fontcolor=${NEON}:` +
    `borderw=0:x=(w-text_w)/2:y=460`) + `,` +
  // Main statement line 1 — white, large
  dt("Support & follow those",
    `fontsize=56:fontcolor=${WHITE}:` +
    `shadowcolor=black@0.6:shadowx=2:shadowy=2:` +
    `x=(w-text_w)/2:y=760`) + `,` +
  // Main statement line 2 — neon green, glowing effect via border
  dt("who support & follow back",
    `fontsize=56:fontcolor=${NEON}:` +
    `borderw=2:bordercolor=${NEON}@0.35:` +
    `shadowcolor=black@0.5:shadowx=2:shadowy=2:` +
    `x=(w-text_w)/2:y=826`) + `,` +
  // Thin divider line approximation using underscores
  dt("___________________________",
    `fontsize=18:fontcolor=white@0.25:x=(w-text_w)/2:y=918`) + `,` +
  // Brand values — three lines, white fading to neon
  dt("Creating value",
    `fontsize=38:fontcolor=white@0.75:x=(w-text_w)/2:y=960`) + `,` +
  dt("Making you visible",
    `fontsize=38:fontcolor=white@0.75:x=(w-text_w)/2:y=1006`) + `,` +
  dt("Giving back.",
    `fontsize=38:fontcolor=${NEON}:` +
    `borderw=1:bordercolor=${NEON}@0.3:` +
    `x=(w-text_w)/2:y=1052`) + `,` +
  // Website
  dt("guberapp.com",
    `fontsize=30:fontcolor=${PURPLE}:x=(w-text_w)/2:y=1170`) +
  `[vout]`;

await ff([
  "-f", "lavfi", "-i", `color=c=black:s=888x1920:r=24:d=${ENDCARD_DUR}`,
  "-i", logo,
  "-filter_complex", ecFilter,
  "-map", "[vout]",
  "-c:v", "libx264", "-crf", "17", "-pix_fmt", "yuv420p", "-r", "24",
  endCardTmp,
], "Ending card (3s portrait)");

// ─────────────────────────────────────────────────────────────────────────────
// PASS 2 — Full cinematic assembly
//
// Inputs:
//   0 — original marketing video  (video + audio, 58.95s, 888x1920)
//   1 — ending card               (video only, 3s, 888x1920)
//   2 — music bed MP3             (-stream_loop -1, looped)
//   3 — GUBER logo PNG            (watermark)
//
// VIDEO PIPELINE (original footage):
//   fps=24 → yuv420p
//   → eq: contrast +8%, saturation +15%, gamma 0.97 (punchier, more vivid)
//   → curves: subtle cinematic teal-in-shadows / warm-highlights grade
//   → unsharp: moderate sharpening (crisper, more professional)
//   → vignette: gentle cinematic edge darkening
//   → logo watermark: bottom-right, 55% opacity
//   → concat ending card (ending card already styled)
//
// AUDIO PIPELINE (original audio):
//   → highpass 80Hz: remove low rumble
//   → afftdn nf=-23: spectral noise floor reduction (removes crowd hiss/cheer)
//   → volume +5%: compensate for denoising
//   mixed with:
//   → music bed: looped, trimmed to 62s, volume 10%, bass-boosted (+4dB @ 85Hz),
//     harsh-mid cut (-2.5dB @ 2.8kHz), high-shelf soft cut at 10kHz,
//     2s fade-in, 2s fade-out at end
//   amix: voices dominate, music is background texture
// ─────────────────────────────────────────────────────────────────────────────

const totalStr = TOTAL_DUR.toFixed(3);
const fadeOutAt = (TOTAL_DUR - 2).toFixed(2);

// Logo: scale to 62px wide, semi-transparent
const logoPrep =
  `[3:v]scale=62:-1,format=rgba,colorchannelmixer=aa=0.55[wm]`;

// Original video: cinematic grade pipeline
// curves: push shadows slightly blue, highlights slightly warm
const videoGrade =
  `[0:v]fps=24,format=yuv420p,setsar=1,` +
  // Punch up the image
  `eq=contrast=1.08:brightness=0.015:saturation=1.15:gamma=0.97,` +
  // Cinematic teal-shadow / warm-highlight grade
  `curves=r='0/0 0.4/0.37 1/1':g='0/0 0.4/0.38 1/1':b='0/0 0.35/0.38 0.7/0.67 1/0.93',` +
  // Moderate sharpening: luma pass
  `unsharp=5:5:0.7:3:3:0.0,` +
  // Gentle vignette
  `vignette=angle=PI/5[vg]`;

// Overlay watermark bottom-right
const watermark = `[vg][wm]overlay=W-w-14:H-h-16[v0]`;

// Ending card normalise
const endcardNorm = `[1:v]fps=24,format=yuv420p,setsar=1[v1]`;

// Concat
const concat = `[v0][v1]concat=n=2:v=1:a=0[vout]`;

// Audio: denoise original
const audioClean =
  `[0:a]highpass=f=80,afftdn=nf=-23,volume=1.05[cleaned]`;

// Music: loop → trim → EQ to sound cooler (bass-forward, soft highs) → fade
const audioMus =
  `[2:a]` +
  `atrim=0:${totalStr},` +
  `volume=0.10,` +
  // Bass boost (warm, punchy low end)
  `equalizer=f=85:t=h:w=120:g=4,` +
  // Cut harsh upper-mids that compete with voice
  `equalizer=f=2800:t=h:w=3000:g=-2.5,` +
  // Gentle high shelf roll-off (smoother, less fatiguing)
  `equalizer=f=10000:t=h:w=6000:g=-2,` +
  `afade=t=in:st=0:d=2,` +
  `afade=t=out:st=${fadeOutAt}:d=2[mus]`;

// Mix: voice + music
const audioMix =
  `[cleaned][mus]amix=inputs=2:duration=longest:normalize=0[aout]`;

const filterGraph = [
  logoPrep,
  videoGrade,
  watermark,
  endcardNorm,
  concat,
  audioClean,
  audioMus,
  audioMix,
].join(";");

await ff([
  "-i",           srcVideo,
  "-i",           endCardTmp,
  "-stream_loop", "-1", "-i", musicBed,
  "-i",           logo,
  "-filter_complex", filterGraph,
  "-map",  "[vout]", "-map", "[aout]",
  "-c:v",  "libx264", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "24",
  "-c:a",  "aac", "-b:a", "192k", "-movflags", "+faststart",
  finalOut,
], "Cinematic assembly: grade + denoise + watermark + music + ending card");

// Cleanup temp
if (fs.existsSync(endCardTmp)) fs.unlinkSync(endCardTmp);

// Probe output
const { stdout } = await run("ffprobe", [
  "-v", "error",
  "-show_entries", "format=duration,size:stream=codec_type,width,height,codec_name",
  "-of", "default=nw=1",
  finalOut,
]);

console.log(`\n✅ DONE\n📁 ${finalOut}\n${stdout}`);
