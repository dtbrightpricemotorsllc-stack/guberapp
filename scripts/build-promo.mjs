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

const NEON = "0x39FF14";   // neon green
const PURPLE = "0xD100FF"; // brand purple
const BLACK = "0x000000";  // GUBER black

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

// staged fade-in alpha: invisible until t0, fade over d, then hold at 1
const fade = (t0, d) =>
  `alpha='if(lt(t,${t0}),0,if(lt(t,${t0 + d}),(t-${t0})/${d},1))'`;

const dt = (text, opts) => `drawtext=fontfile=${BOLD}:text='${text}':${opts}`;

// 1) Animated brand end-card (8s): logo + staged reveal of headline, subheadline,
//    feature line, CTA, website; final frame holds ~3s.
const ecFilter =
  `[1:v]scale=-1:300[lg];` +
  `[0:v][lg]overlay=(W-w)/2:90[bg];` +
  `[bg]fade=t=in:st=0:d=0.6,` +
  // Headline
  dt("TRUST IS NOT PROOF.",
    `fontsize=86:fontcolor=white:shadowcolor=black@0.6:shadowx=2:shadowy=2:` +
    `x=(w-text_w)/2:y=430:${fade(0.7, 0.6)}`) + `,` +
  // Subheadline
  dt("Proof of Work.  Proof of Location.  Proof of Completion.",
    `fontsize=38:fontcolor=${NEON}:x=(w-text_w)/2:y=555:${fade(1.5, 0.5)}`) + `,` +
  // Feature line
  dt("Verified People   •   Protected Payments   •   Real Accountability",
    `fontsize=33:fontcolor=white:x=(w-text_w)/2:y=635:${fade(2.4, 0.5)}`) + `,` +
  // CTA
  dt("Find Work.  Hire Help.  Verify Things.",
    `fontsize=52:fontcolor=${NEON}:shadowcolor=black@0.6:shadowx=2:shadowy=2:` +
    `x=(w-text_w)/2:y=720:${fade(3.3, 0.5)}`) + `,` +
  // Website footer
  dt("guberapp.com",
    `fontsize=40:fontcolor=${PURPLE}:x=(w-text_w)/2:y=840:${fade(4.2, 0.5)}`) +
  `[v]`;

await ff([
  "-f", "lavfi", "-i", `color=c=${BLACK}:s=1920x1080:d=8:r=24`,
  "-i", logo,
  "-filter_complex", ecFilter,
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

// 3) Logo watermark + timed titles over the footage + audio mix.
await ff([
  "-i", base, "-i", logo, "-i", music, "-i", vo,
  "-filter_complex",
  `[1:v]scale=-1:92,format=rgba,colorchannelmixer=aa=0.85[wm];` +
  `[0:v][wm]overlay=64:54:enable='lte(t,21.6)'[wmd];` +
  `[wmd]` +
  dt("TRUST IS NOT PROOF",
    `fontsize=74:fontcolor=white:bordercolor=black@0.5:borderw=2:` +
    `shadowcolor=black@0.6:shadowx=2:shadowy=2:x=(w-text_w)/2:y=h-230:` +
    `enable='between(t,1.4,6.6)'`) + `,` +
  dt("ACCOUNTABILITY BUILT IN",
    `fontsize=74:fontcolor=white:bordercolor=black@0.5:borderw=2:` +
    `shadowcolor=black@0.6:shadowx=2:shadowy=2:x=(w-text_w)/2:y=h-230:` +
    `enable='between(t,9,14.2)'`) + `,` +
  dt("VERIFIED.  PROTECTED.",
    `fontsize=74:fontcolor=${NEON}:bordercolor=black@0.5:borderw=2:` +
    `shadowcolor=black@0.6:shadowx=2:shadowy=2:x=(w-text_w)/2:y=h-230:` +
    `enable='between(t,16.4,21.2)'`) + `,` +
  `fade=t=in:st=0:d=0.6[vout];` +
  `[2:a]volume=0.30,afade=t=in:st=0:d=1.2,afade=t=out:st=27.6:d=2.2[mus];` +
  `[3:a]volume=1.15[voc];` +
  `[mus][voc]amix=inputs=2:duration=longest:normalize=0[aout]`,
  "-map", "[vout]", "-map", "[aout]",
  "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "24",
  "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest",
  master,
], "titles + audio mux");

for (const f of [endcard, base]) fs.existsSync(f) && fs.unlinkSync(f);

const { stdout } = await run("ffprobe", [
  "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height",
  "-of", "default=nw=1", master,
]);
console.log(`\nMASTER: ${master}\n${stdout}`);
