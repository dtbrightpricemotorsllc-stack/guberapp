// server/studio/ai-director.ts
// Async job engine for GUBER AI Director — generates N Fal.ai wan_motion_10s clips,
// mixes AI music (stream-looped for long-form) + OpenAI TTS VO, assembles via
// FFmpeg with a dynamic xfade chain, uploads to Cloudinary.
//
// Duration tiers: short (2 clips ~23s) through feature (36 clips ~6 min).
// Credits charged upfront and refunded automatically on failure.
// Clips generated in parallel batches of 4 to respect Fal.ai rate limits.
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execFile = promisify(execFileCb);

// ── Duration tiers ────────────────────────────────────────────────────────────
export const DURATION_TIERS = {
  short:    { clips: 2,  label: "Short",    approxLabel: "~20 sec",  credits: 200 },
  standard: { clips: 4,  label: "Standard", approxLabel: "~45 sec",  credits: 320 },
  long:     { clips: 8,  label: "Long",     approxLabel: "~1.5 min", credits: 560 },
  extended: { clips: 18, label: "Extended", approxLabel: "~3 min",   credits: 1160 },
  feature:  { clips: 36, label: "Feature",  approxLabel: "~6 min",   credits: 2240 },
} as const;

export type DurationTierId = keyof typeof DURATION_TIERS;

export function approxOutputSeconds(nClips: number): number {
  return nClips * 10 - (nClips - 1) * 0.5 + 3; // footage + 3s end card
}

// ── Job types ─────────────────────────────────────────────────────────────────
export type DirectorCategory =
  | "home_services" | "auto" | "beauty" | "moving"
  | "events" | "fitness" | "food" | "general";

export type DirectorJobStatus =
  | "pending" | "generating_clips" | "generating_audio"
  | "assembling" | "uploading" | "complete" | "failed";

export type DirectorJob = {
  jobId: string;
  userId: number;
  status: DirectorJobStatus;
  stage: string;
  outputUrl?: string;
  cloudinaryPublicId?: string;
  error?: string;
  creditsDebited: number;
  createdAt: Date;
};

// ── Job store (in-memory, swept every 30 min) ─────────────────────────────────
const jobStore = new Map<string, DirectorJob>();

export function getDirectorJob(jobId: string): DirectorJob | undefined {
  return jobStore.get(jobId);
}

export function createDirectorJob(jobId: string, userId: number, creditsDebited: number): DirectorJob {
  const job: DirectorJob = { jobId, userId, status: "pending", stage: "Queued…", creditsDebited, createdAt: new Date() };
  jobStore.set(jobId, job);
  return job;
}

setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of jobStore) if (job.createdAt.getTime() < cutoff) jobStore.delete(id);
}, 30 * 60 * 1000).unref();

// ── Category config (3 rotating prompts per category for visual variety) ──────
type CatConfig = { prompts: [string, string, string]; music: string };

const CAT: Record<DirectorCategory, CatConfig> = {
  home_services: {
    prompts: [
      "Cinematic aerial establishing shot of a clean suburban home with perfect landscaping, bright sunny day, professional commercial photography, wide angle",
      "Professional home service worker in branded uniform working efficiently inside a bright modern home, skilled hands close-up, natural lighting, high-quality commercial advertisement",
      "Satisfied homeowner smiling and shaking hands with a professional in uniform, front porch, warm sunlight, trust and reliability, lifestyle commercial shot",
    ],
    music: "Uplifting friendly instrumental background music, modern home services commercial, warm and trustworthy",
  },
  auto: {
    prompts: [
      "Cinematic wide shot of a gleaming luxury car in a professional auto detailing bay, dramatic spotlighting, commercial photography",
      "Professional auto detailer's skilled gloved hands polishing a car with precision, studio lighting, premium commercial quality close-up",
      "Shiny clean car driving on a scenic road at golden hour, premium automotive transformation reveal, commercial advertisement",
    ],
    music: "Sleek modern instrumental background music, premium automotive advertisement, confident and polished",
  },
  beauty: {
    prompts: [
      "Upscale modern salon interior, warm soft lighting, luxury atmosphere, establishing wide shot, beauty commercial",
      "Professional stylist or barber at work with skilled hands close-up, satisfied client, warm inviting lighting, premium beauty advertisement",
      "Stunning before-and-after reveal of a client with a fresh transformation, mirror reflection, beauty lifestyle commercial",
    ],
    music: "Smooth sophisticated instrumental background music, luxury beauty commercial, elegant and stylish",
  },
  moving: {
    prompts: [
      "Clean professional moving truck parked in front of a house on a bright sunny day, uniformed movers in position, wide establishing shot",
      "Professional movers carefully loading furniture as a team with care and efficiency, bright sunlight, reliable service commercial",
      "Happy family welcoming movers into their new home, successful move, warm lifestyle commercial shot",
    ],
    music: "Upbeat energetic instrumental background music, moving and delivery commercial, reliable and efficient",
  },
  events: {
    prompts: [
      "Elegant event venue with beautiful ambient lighting and tasteful decorations, wide cinematic establishing shot, luxury events advertisement",
      "Professional photographer or DJ captured at work during a lively event, dynamic ambient lighting, skilled professional in action",
      "Joyful guests celebrating at a beautifully arranged event, candid moments, warm ambient light, premium events commercial",
    ],
    music: "Vibrant celebratory instrumental background music, events and entertainment commercial, exciting and memorable",
  },
  fitness: {
    prompts: [
      "Modern gym or scenic outdoor training location at golden hour, motivational fitness atmosphere, wide cinematic establishing shot",
      "Personal trainer coaching a client through an exercise with motivational energy, dynamic movement, fitness lifestyle commercial",
      "Athlete celebrating a personal milestone, triumphant moment, natural outdoor light, fitness transformation commercial",
    ],
    music: "High-energy motivational instrumental background music, fitness and wellness commercial, powerful and inspiring",
  },
  food: {
    prompts: [
      "Beautifully lit professional kitchen or catering setup, elegant food presentation on pristine surfaces, cinematic food photography",
      "Professional chef artfully plating an elegant dish or serving guests, culinary mastery close-up, warm inviting lighting",
      "Guests delighting in beautifully presented food at an elegant table setting, food lifestyle commercial, warm ambient glow",
    ],
    music: "Warm inviting instrumental background music, food and catering commercial, appetizing and premium",
  },
  general: {
    prompts: [
      "Confident professional in clean uniform standing in their modern work environment, polished look, commercial advertisement",
      "Business owner providing excellent service to a genuinely satisfied customer, positive interaction, modern commercial advertisement",
      "Wide shot of a thriving local business with customers coming and going, community trust, neighborhood business commercial",
    ],
    music: "Professional modern instrumental background music, business services advertisement, confident and trustworthy",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeDt(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\u2019")
    .replace(/:/g, "\\:")
    .replace(/,/g, " ")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .slice(0, 50);
}

async function downloadTmp(url: string, ext: string): Promise<string> {
  const out = path.join(os.tmpdir(), `adir_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  return out;
}

async function generateClipsBatched(
  prompts: string[],
  generateFn: (p: { prompt: string; durationSeconds: number }) => Promise<{ videoUrl: string; jobId: string }>,
  batchSize = 4,
): Promise<Array<{ videoUrl: string; jobId: string }>> {
  const results: Array<{ videoUrl: string; jobId: string }> = [];
  for (let i = 0; i < prompts.length; i += batchSize) {
    const batch = prompts.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((p) => generateFn({ prompt: p, durationSeconds: 10 })));
    results.push(...batchResults);
  }
  return results;
}

function buildClipPrompts(
  cfg: CatConfig,
  params: { businessName: string; tagline: string; description: string },
  nClips: number,
): string[] {
  const SCENE_TYPES = ["establishing shot", "detail shot", "lifestyle shot", "action shot", "result shot"];
  return Array.from({ length: nClips }, (_, i) => {
    const basePrompt = cfg.prompts[i % 3];
    const sceneHint = SCENE_TYPES[i % SCENE_TYPES.length];
    const context = i % 2 === 0
      ? `Business: "${params.businessName}". ${params.description || ""}`.trim()
      : `Tagline: "${params.tagline}". Business: "${params.businessName}".`;
    return `${basePrompt}. ${context} Scene style: ${sceneHint}.`.replace(/\.\s*\./g, ".").trim();
  });
}

// Build FFmpeg video filter for N clips: normalize → xfade chain → end card
function buildVideoFilter(nClips: number, n: string, t: string, c: string): string {
  const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  const NEON = "0x39FF14";
  const FADE = 0.5;
  const CLIP_DUR = 10;
  const STEP = CLIP_DUR - FADE; // 9.5s net contribution per clip

  const normalized = Array.from({ length: nClips }, (_, i) =>
    `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,` +
    `settb=AVTB,fps=24,format=yuv420p,setsar=1[v${i}]`,
  );

  const chain: string[] = [];
  let prev = "v0";
  for (let i = 1; i < nClips; i++) {
    const out = i === nClips - 1 ? "xv" : `x${i}`;
    const offset = (i * STEP).toFixed(1);
    chain.push(`[${prev}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset}[${out}]`);
    prev = out;
  }
  if (nClips === 1) chain.push(`[v0]null[xv]`);

  const footageDur = nClips * CLIP_DUR - (nClips - 1) * FADE;
  const ecOffset = (footageDur - FADE).toFixed(1);

  const ecFilter =
    `color=c=black:s=1920x1080:d=3:r=24[ec_base];` +
    `[ec_base]drawtext=fontfile=${FONT}:text='${n}':fontsize=82:fontcolor=white:` +
      `x=(w-text_w)/2:y=420:alpha='if(lt(t,0.4),t/0.4,1)'[ec1];` +
    `[ec1]drawtext=fontfile=${FONT}:text='${t}':fontsize=48:fontcolor=${NEON}:` +
      `x=(w-text_w)/2:y=545:alpha='if(lt(t,0.8),0,if(lt(t,1.3),(t-0.8)/0.5,1))'[ec2];` +
    `[ec2]drawtext=fontfile=${FONT}:text='${c}':fontsize=40:fontcolor=white@0.75:` +
      `x=(w-text_w)/2:y=645:alpha='if(lt(t,1.4),0,if(lt(t,1.9),(t-1.4)/0.5,1))'[ec]`;

  return [
    ...normalized,
    ...chain,
    ecFilter,
    `[xv][ec]xfade=transition=fadeblack:duration=${FADE}:offset=${ecOffset}[vout]`,
  ].join(";");
}

// Music is at input index nClips (stream-looped), VO at nClips+1 if present.
function buildAudioFilter(nClips: number, hasVo: boolean, footageDur: number): string {
  const totalDur = footageDur + 3;
  const fadeOutStart = Math.max(1, totalDur - 2);
  const musIdx = nClips;
  const voIdx = nClips + 1;

  if (hasVo) {
    return (
      `[${musIdx}:a]volume=0.28,afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutStart.toFixed(1)}:d=2[mus];` +
      `[${voIdx}:a]volume=1.2[voc];` +
      `[mus][voc]amix=inputs=2:duration=longest:normalize=0[aout]`
    );
  }
  return `[${musIdx}:a]volume=0.55,afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutStart.toFixed(1)}:d=2[aout]`;
}

// ── Main job runner ───────────────────────────────────────────────────────────
export async function runDirectorJob(
  job: DirectorJob,
  params: {
    category: DirectorCategory;
    businessName: string;
    tagline: string;
    description: string;
    cta: string;
    nClips: number;
  },
  storage: any,
  db: any,
  sessionId: number,
): Promise<void> {
  const upd = (status: DirectorJobStatus, stage: string) => { job.status = status; job.stage = stage; };
  const tmp: string[] = [];
  const cleanup = () => { for (const f of tmp) try { fs.unlinkSync(f); } catch {} };

  try {
    const cfg = CAT[params.category];
    const nClips = Math.max(2, Math.min(36, params.nClips));
    const footageDur = nClips * 10 - (nClips - 1) * 0.5;
    const totalDur = footageDur + 3;
    const { generateWanMotion, generateMiniMaxMusic } = await import("../fal");

    // ── 1. Video clips (batched, 4 at a time) ─────────────────────────────────
    const batchCount = Math.ceil(nClips / 4);
    upd("generating_clips", `Generating ${nClips} scenes… (${batchCount} batch${batchCount > 1 ? "es" : ""})`);
    const clipPrompts = buildClipPrompts(cfg, params, nClips);
    const clipResults = await generateClipsBatched(clipPrompts, generateWanMotion);

    // ── 2. Music + TTS voiceover (parallel) ───────────────────────────────────
    upd("generating_audio", "Composing music and voiceover…");

    const voScript = [
      params.businessName,
      params.tagline,
      params.description ? params.description + "." : "",
      params.cta || "Call us today.",
    ].filter(Boolean).join(". ");

    let ttsBuffer: Buffer | null = null;
    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI();
      const ttsRes = await openai.audio.speech.create({ model: "tts-1", voice: "onyx", input: voScript, response_format: "mp3" });
      ttsBuffer = Buffer.from(await (ttsRes as any).arrayBuffer());
    } catch (e: any) {
      console.warn("[ai-director] TTS unavailable, continuing without VO:", e.message);
    }

    const musicResult = await (async () => {
      for (let i = 0; i < 2; i++) {
        try { return await generateMiniMaxMusic({ prompt: cfg.music }); } catch (e: any) { if (i === 1) throw e; }
      }
      throw new Error("unreachable");
    })();

    // ── 3. Download to /tmp ───────────────────────────────────────────────────
    upd("assembling", `Assembling ~${Math.round(totalDur)}s commercial…`);

    const clipPaths: string[] = [];
    for (const r of clipResults) {
      const p = await downloadTmp(r.videoUrl, "mp4");
      tmp.push(p);
      clipPaths.push(p);
    }

    const musPath = await downloadTmp(musicResult.audioUrl, "mp3");
    tmp.push(musPath);

    let voPath: string | null = null;
    if (ttsBuffer) {
      voPath = path.join(os.tmpdir(), `adir_vo_${Date.now()}.mp3`);
      fs.writeFileSync(voPath, ttsBuffer);
      tmp.push(voPath);
    }

    const outPath = path.join(os.tmpdir(), `adir_out_${Date.now()}.mp4`);
    tmp.push(outPath);

    // ── 4. FFmpeg assembly ────────────────────────────────────────────────────
    const n = safeDt(params.businessName);
    const t = safeDt(params.tagline);
    const c = safeDt(params.cta || "Call us today");

    const videoFilter = buildVideoFilter(nClips, n, t, c);
    const audioFilter = buildAudioFilter(nClips, !!voPath, footageDur);

    // Clip inputs, then music with -stream_loop -1 (loops indefinitely; -shortest trims)
    const inputArgs: string[] = [];
    for (const cp of clipPaths) inputArgs.push("-i", cp);
    inputArgs.push("-stream_loop", "-1", "-i", musPath);
    if (voPath) inputArgs.push("-i", voPath);

    const ffArgs: string[] = [
      "-y",
      ...inputArgs,
      "-filter_complex", `${videoFilter};${audioFilter}`,
      "-map", "[vout]", "-map", "[aout]",
      "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "24",
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
      "-shortest",
      outPath,
    ];

    await execFile("ffmpeg", ffArgs, { maxBuffer: 1024 * 1024 * 256 });

    // ── 5. Upload to Cloudinary ───────────────────────────────────────────────
    upd("uploading", "Uploading finished video…");
    let finalUrl = `file://${outPath}`;
    let cloudPublicId: string | null = null;

    if (process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const cloudinary = (await import("../cloudinary.js")).default;
        const up = await cloudinary.uploader.upload(outPath, {
          resource_type: "video",
          folder: "guber-studio-ai-director",
          use_filename: false,
        });
        finalUrl = up.secure_url;
        cloudPublicId = up.public_id;
      } catch (e: any) {
        console.warn("[ai-director] Cloudinary upload failed:", e.message);
      }
    }

    // ── 6. Store in session + log ─────────────────────────────────────────────
    const { studioModelPricing: pricingTable } = await import("../../shared/schema");
    await db.insert(pricingTable).values({
      toolKey: "ai_director",
      label: "AI Director",
      description: "Complete assembled commercial ad: clips, music, and voiceover.",
      providerEndpoint: "fal-ai/wan-motion",
      creditsCost: job.creditsDebited,
      durationSeconds: Math.round(totalDur),
      active: true,
    }).onConflictDoNothing();

    await storage.addStudioSessionFile({
      sessionId, userId: job.userId,
      fileType: "output_video",
      providerUrl: finalUrl,
      cloudinaryPublicId: cloudPublicId,
      resourceType: "video",
      meta: {
        toolKey: "ai_director",
        creditsCost: job.creditsDebited,
        businessName: params.businessName,
        tagline: params.tagline,
        category: params.category,
        nClips,
        totalDurSeconds: Math.round(totalDur),
      },
    });

    await storage.logStudioGeneration({
      userId: job.userId, sessionId,
      toolKey: "ai_director",
      prompt: voScript.slice(0, 500),
      creditsCost: job.creditsDebited,
      durationSeconds: Math.round(totalDur),
      providerJobId: clipResults[0]?.jobId ?? null,
      status: "success",
      errorReason: null,
    });

    job.outputUrl = finalUrl;
    job.cloudinaryPublicId = cloudPublicId ?? undefined;
    upd("complete", "Your commercial is ready!");

  } catch (err: any) {
    job.error = err.message || "Unknown error";
    upd("failed", "Generation failed — credits returned.");
    try {
      await storage.incrementStudioCredits(job.userId, job.creditsDebited);
      await storage.logStudioGeneration({
        userId: job.userId, sessionId,
        toolKey: "ai_director",
        prompt: "",
        creditsCost: job.creditsDebited,
        durationSeconds: 0,
        providerJobId: null,
        status: "refunded",
        errorReason: err.message?.slice(0, 500),
      });
    } catch {}
  } finally {
    cleanup();
  }
}
