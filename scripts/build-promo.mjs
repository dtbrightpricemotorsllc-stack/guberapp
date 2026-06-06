import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";

const run = promisify(execFile);

const DIR = "attached_assets";
const VID = `${DIR}/generated_videos`;
const AUD = `${DIR}/generated_audio`;
const OUT = `${DIR}/generated_videos`;

const clip1 = `${VID}/guber_promo_stakes_loading.mp4`;
const clip2 = `${VID}/guber_promo_trust_network.mp4`;
const clip3 = `${VID}/guber_promo_verified_delivery.mp4`;
const logo = `${DIR}/Picsart_25-10-05_02-32-00-877_1772543526293.png`;
const music = `${AUD}/music_guber_promo_bed.mp3`;
const vo = `${AUD}/speech_guber_promo_vo.mp3`;

const endcard = `${OUT}/_endcard.mp4`;
const base = `${OUT}/_base.mp4`;
const master = `${OUT}/guber_promo_master_16x9.mp4`;

const BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

const NEON = "0x39FF14";
const BG = "0x080a0f";

for (const f of [clip1, clip2, clip3, logo, music, vo]) {
  if (!fs.existsSync(f)) throw new Error(`Missing asset: ${f}`);
}

async function ff(args, label) {
  console.log(`\n>>> ${label}`);
  try {
    await run("ffmpeg", ["-y", ...args], { maxBuffer: 1024 * 1024 * 64 });
    console.log(`    ok: ${label}`);
  } catch (e) {
    console.error(`    FAIL: ${label}`);
    console.error(String(e.stderr || e.message).split("\n").slice(-25).join("\n"));
    throw e;
  }
}

// 1) Brand end-card (4s): dark bg + centered logo + tagline + service line, fade in.
await ff([
  "-f", "lavfi", "-i", `color=c=${BG}:s=1920x1080:d=4:r=24`,
  "-i", logo,
  "-filter_complex",
  `[1:v]scale=-1:430[lg];` +
  `[0:v][lg]overlay=(W-w)/2:250[bg];` +
  `[bg]drawtext=fontfile=${BOLD}:text='PROOF. NOT PROMISES.':fontsize=66:fontcolor=white:` +
  `x=(w-text_w)/2:y=760:shadowcolor=black@0.6:shadowx=2:shadowy=2,` +
  `drawtext=fontfile=${BOLD}:text='FIND WORK     HIRE HELP     VERIFY ASSETS     PROTECT TRANSACTIONS':` +
  `fontsize=30:fontcolor=${NEON}:x=(w-text_w)/2:y=860,` +
  `fade=t=in:st=0:d=0.6[v]`,
  "-map", "[v]", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "24",
  endcard,
], "endcard");

// 2) Concatenate 3 clips + endcard with crossfades (video only).
await ff([
  "-i", clip1, "-i", clip2, "-i", clip3, "-i", endcard,
  "-filter_complex",
  `[0:v]settb=AVTB,fps=24,format=yuv420p,setsar=1[v0];` +
  `[1:v]settb=AVTB,fps=24,format=yuv420p,setsar=1[v1];` +
  `[2:v]settb=AVTB,fps=24,format=yuv420p,setsar=1[v2];` +
  `[3:v]settb=AVTB,fps=24,format=yuv420p,setsar=1[v3];` +
  `[v0][v1]xfade=transition=fade:duration=0.7:offset=7.3[x01];` +
  `[x01][v2]xfade=transition=fade:duration=0.7:offset=14.6[x012];` +
  `[x012][v3]xfade=transition=fadeblack:duration=0.7:offset=21.9[vb]`,
  "-map", "[vb]", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "24",
  base,
], "base concat");

// 3) Logo watermark + timed titles + audio mix (music ducked under VO).
await ff([
  "-i", base, "-i", logo, "-i", music, "-i", vo,
  "-filter_complex",
  `[1:v]scale=-1:92,format=rgba,colorchannelmixer=aa=0.85[wm];` +
  `[0:v][wm]overlay=64:54:enable='lte(t,21.6)'[wmd];` +
  `[wmd]` +
  `drawtext=fontfile=${BOLD}:text='TRUST IS NOT PROOF':fontsize=74:fontcolor=white:` +
  `bordercolor=black@0.5:borderw=2:shadowcolor=black@0.6:shadowx=2:shadowy=2:` +
  `x=(w-text_w)/2:y=h-230:enable='between(t,1.4,6.6)',` +
  `drawtext=fontfile=${BOLD}:text='ACCOUNTABILITY BUILT IN':fontsize=74:fontcolor=white:` +
  `bordercolor=black@0.5:borderw=2:shadowcolor=black@0.6:shadowx=2:shadowy=2:` +
  `x=(w-text_w)/2:y=h-230:enable='between(t,9,14.2)',` +
  `drawtext=fontfile=${BOLD}:text='VERIFIED.  PROTECTED.':fontsize=74:fontcolor=${NEON}:` +
  `bordercolor=black@0.5:borderw=2:shadowcolor=black@0.6:shadowx=2:shadowy=2:` +
  `x=(w-text_w)/2:y=h-230:enable='between(t,16.4,21.2)',` +
  `fade=t=in:st=0:d=0.6,fade=t=out:st=25.3:d=0.6[vout];` +
  `[2:a]volume=0.30,afade=t=in:st=0:d=1.2,afade=t=out:st=23.9:d=2.0[mus];` +
  `[3:a]volume=1.15[voc];` +
  `[mus][voc]amix=inputs=2:duration=longest:normalize=0[aout]`,
  "-map", "[vout]", "-map", "[aout]",
  "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "24",
  "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest",
  master,
], "titles + audio mux");

// cleanup intermediates
for (const f of [endcard, base]) fs.existsSync(f) && fs.unlinkSync(f);

const { stdout } = await run("ffprobe", [
  "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height",
  "-of", "default=nw=1", master,
]);
console.log(`\nMASTER: ${master}\n${stdout}`);
