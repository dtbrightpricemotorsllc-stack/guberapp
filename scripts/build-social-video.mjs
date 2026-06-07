// scripts/build-social-video.mjs
// Aggressive cinematic enhancement:
//   • Strong color grade (contrast +30%, saturation +50%, gamma dip)
//   • Cinematic teal-shadow / warm-highlight color balance
//   • Sharp unsharp mask for crispness
//   • Solid vignette edges
//   • Double-pass spectral noise reduction (crowd noise removal)
//   • GUBER logo watermark bottom-right (semi-transparent)
//   • Cool background music at audible but non-overpowering volume (18%)
//   • 3-second GUBER ending card

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";

const run = promisify(execFile);

const DIR = "attached_assets";
const AUD = `${DIR}/generated_audio`;
const VID = `${DIR}/generated_videos`;

const srcVideo    = `${DIR}/Video.Guru_20260607_073240695_1780835659054.mp4`;
const logo        = `${DIR}/Picsart_25-10-05_02-32-00-877_1772543526293.png`;
const musicBed    = `${AUD}/music_guber_promo_bed.mp3`;

const endCardTmp  = `${VID}/_ending_card_tmp.mp4`;
const finalOut    = `${VID}/guber_social_final.mp4`;

const BOLD   = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const NEON   = "0x39FF14";
const PURPLE = "0xD100FF";
const WHITE  = "white";

const SRC_DUR     = 58.953470;
const ENDCARD_DUR = 3;
const TOTAL_DUR   = SRC_DUR + ENDCARD_DUR;

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
// PASS 1 — 3-second ending card (888x1920, video only)
// ─────────────────────────────────────────────────────────────────────────────
const ecFilter =
  `[1:v]scale=200:-1[lg];` +
  `[0:v][lg]overlay=(W-w)/2:480[bg];` +
  `[bg]fade=t=in:st=0:d=0.4,fade=t=out:st=2.6:d=0.4,` +
  dt("G U B E R",
    `fontsize=26:fontcolor=${NEON}:x=(w-text_w)/2:y=460`) + `,` +
  dt("Support & follow those",
    `fontsize=56:fontcolor=${WHITE}:shadowcolor=black@0.6:shadowx=2:shadowy=2:x=(w-text_w)/2:y=760`) + `,` +
  dt("who support & follow back",
    `fontsize=56:fontcolor=${NEON}:borderw=2:bordercolor=${NEON}@0.35:shadowcolor=black@0.5:shadowx=2:shadowy=2:x=(w-text_w)/2:y=826`) + `,` +
  dt("___________________________",
    `fontsize=18:fontcolor=white@0.25:x=(w-text_w)/2:y=918`) + `,` +
  dt("Creating value",
    `fontsize=38:fontcolor=white@0.75:x=(w-text_w)/2:y=960`) + `,` +
  dt("Making you visible",
    `fontsize=38:fontcolor=white@0.75:x=(w-text_w)/2:y=1006`) + `,` +
  dt("Giving back.",
    `fontsize=38:fontcolor=${NEON}:borderw=1:bordercolor=${NEON}@0.3:x=(w-text_w)/2:y=1052`) + `,` +
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
], "Ending card (3s)");

// ─────────────────────────────────────────────────────────────────────────────
// PASS 2 — Full cinematic assembly
//
// Video pipeline (clearly visible):
//   eq: contrast +30%, saturation +50%, gamma 0.88  ← very noticeable
//   colorbalance: teal in shadows / warm in highlights (cinematic look)
//   unsharp: strong sharpening luma pass
//   vignette: deep edge darkening PI/4
//   logo watermark: 62px, 55% opacity, bottom-right
//
// Audio pipeline:
//   double afftdn pass at nf=-40: aggressive crowd/ambient noise floor removal
//   highpass 100Hz: cut low rumble
//   volume +8%: compensate for denoising loss
//   music: 18% volume, bass-boosted, harsh-mid cut, 2s fade in/out
// ─────────────────────────────────────────────────────────────────────────────

const totalStr  = TOTAL_DUR.toFixed(3);
const fadeOutAt = (TOTAL_DUR - 2).toFixed(2);

// ── logo watermark prep ───────────────────────────────────────────────────────
const logoPrep =
  `[3:v]scale=62:-1,format=rgba,colorchannelmixer=aa=0.55[wm]`;

// ── original video: aggressive cinematic grade ────────────────────────────────
//   colorbalance: push shadows blue-green (teal), highlights orange-warm
const videoGrade =
  `[0:v]fps=24,format=yuv420p,setsar=1,` +
  // Strong image punch
  `eq=contrast=1.30:brightness=0.02:saturation=1.50:gamma=0.88,` +
  // Teal-shadow / warm-highlight grade (cinematic)
  `colorbalance=rs=-0.10:gs=0.02:bs=0.12:rm=0.01:gm=0.00:bm=-0.04:rh=0.06:gh=0.02:bh=-0.08,` +
  // Sharp unsharp mask — noticeably crisper
  `unsharp=7:7:2.0:5:5:0.0,` +
  // Deep vignette
  `vignette=angle=PI/4[vg]`;

const watermark    = `[vg][wm]overlay=W-w-14:H-h-16[v0]`;
const endcardNorm  = `[1:v]fps=24,format=yuv420p,setsar=1[v1]`;
const concat       = `[v0][v1]concat=n=2:v=1:a=0[vout]`;

// ── audio: double-pass noise reduction ───────────────────────────────────────
const audioClean =
  `[0:a]highpass=f=100,afftdn=nf=-40,afftdn=nf=-40,volume=1.08[cleaned]`;

// ── music: cool-tuned bed ────────────────────────────────────────────────────
//   bass boost +4dB, mid cut -3dB around 2.8kHz (where crowd noise lives),
//   soft high roll-off at 10kHz → warmer/cooler feel
const audioMus =
  `[2:a]` +
  `atrim=0:${totalStr},` +
  `volume=0.18,` +
  `equalizer=f=85:t=h:w=120:g=4,` +
  `equalizer=f=2800:t=h:w=3000:g=-3,` +
  `equalizer=f=10000:t=h:w=6000:g=-2,` +
  `afade=t=in:st=0:d=2,` +
  `afade=t=out:st=${fadeOutAt}:d=2[mus]`;

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
  "-map", "[vout]", "-map", "[aout]",
  "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "24",
  "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
  finalOut,
], "Cinematic assembly — aggressive grade + double denoise + music");

// Cleanup temp
if (fs.existsSync(endCardTmp)) fs.unlinkSync(endCardTmp);

const { stdout } = await run("ffprobe", [
  "-v", "error",
  "-show_entries", "format=duration,size:stream=codec_type,width,height,codec_name",
  "-of", "default=nw=1",
  finalOut,
]);

console.log(`\n✅ DONE\n📁 ${finalOut}\n${stdout}`);
