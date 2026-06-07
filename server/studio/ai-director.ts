// server/studio/ai-director.ts
// Async job engine for GUBER AI Director — generates 2 Fal.ai clips,
// mixes AI music + OpenAI TTS voiceover, assembles via FFmpeg, uploads
// to Cloudinary, and stores in the Studio session library.
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execFile = promisify(execFileCb);

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

const jobStore = new Map<string, DirectorJob>();

export function getDirectorJob(jobId: string): DirectorJob | undefined {
  return jobStore.get(jobId);
}

export function createDirectorJob(
  jobId: string,
  userId: number,
  creditsDebited: number,
): DirectorJob {
  const job: DirectorJob = {
    jobId, userId,
    status: "pending",
    stage: "Queued…",
    creditsDebited,
    createdAt: new Date(),
  };
  jobStore.set(jobId, job);
  return job;
}

// Sweep stale jobs every 30 min (entries older than 2h)
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of jobStore) {
    if (job.createdAt.getTime() < cutoff) jobStore.delete(id);
  }
}, 30 * 60 * 1000).unref();

// ── Category config ──────────────────────────────────────────────────────────
const CAT: Record<DirectorCategory, { clip1: string; clip2: string; music: string }> = {
  home_services: {
    clip1: "Cinematic aerial establishing shot of a clean suburban home with perfect landscaping, bright sunny day, professional commercial photography, wide angle",
    clip2: "Professional home service worker in branded uniform working efficiently inside a bright modern home, skilled hands close-up, natural lighting, high-quality commercial advertisement",
    music: "Uplifting friendly instrumental background music, modern home services commercial, warm and trustworthy",
  },
  auto: {
    clip1: "Cinematic wide shot of a gleaming luxury car in a professional auto detailing bay, dramatic spotlighting, commercial photography",
    clip2: "Professional auto detailer's skilled gloved hands polishing a car with precision, studio lighting, premium commercial quality close-up",
    music: "Sleek modern instrumental background music, premium automotive advertisement, confident and polished",
  },
  beauty: {
    clip1: "Upscale modern salon interior, warm soft lighting, luxury atmosphere, establishing wide shot, beauty commercial",
    clip2: "Professional stylist or barber at work with skilled hands close-up, satisfied client, warm inviting lighting, premium beauty advertisement",
    music: "Smooth sophisticated instrumental background music, luxury beauty commercial, elegant and stylish",
  },
  moving: {
    clip1: "Clean professional moving truck parked in front of a house on a bright sunny day, uniformed movers in position, wide establishing shot",
    clip2: "Professional movers carefully loading furniture as a team with care and efficiency, bright sunlight, reliable service commercial",
    music: "Upbeat energetic instrumental background music, moving and delivery commercial, reliable and efficient",
  },
  events: {
    clip1: "Elegant event venue with beautiful ambient lighting and tasteful decorations, wide cinematic establishing shot, luxury events advertisement",
    clip2: "Professional photographer or DJ captured at work during a lively event, dynamic ambient lighting, skilled professional in action",
    music: "Vibrant celebratory instrumental background music, events and entertainment commercial, exciting and memorable",
  },
  fitness: {
    clip1: "Modern gym or scenic outdoor training location at golden hour, motivational fitness atmosphere, wide cinematic establishing shot",
    clip2: "Personal trainer coaching a client through an exercise with motivational energy, dynamic movement, fitness lifestyle commercial",
    music: "High-energy motivational instrumental background music, fitness and wellness commercial, powerful and inspiring",
  },
  food: {
    clip1: "Beautifully lit professional kitchen or catering setup, elegant food presentation on pristine surfaces, cinematic food photography",
    clip2: "Professional chef artfully plating an elegant dish or serving guests, culinary mastery close-up, warm inviting lighting",
    music: "Warm inviting instrumental background music, food and catering commercial, appetizing and premium",
  },
  general: {
    clip1: "Confident professional in clean uniform standing in their modern work environment, polished look, commercial advertisement",
    clip2: "Business owner providing excellent service to a genuinely satisfied customer, positive interaction, modern commercial advertisement",
    music: "Professional modern instrumental background music, business services advertisement, confident and trustworthy",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── Main job runner ──────────────────────────────────────────────────────────
export async function runDirectorJob(
  job: DirectorJob,
  params: {
    category: DirectorCategory;
    businessName: string;
    tagline: string;
    description: string;
    cta: string;
  },
  storage: any,
  db: any,
  sessionId: number,
): Promise<void> {
  const upd = (status: DirectorJobStatus, stage: string) => {
    job.status = status;
    job.stage = stage;
  };

  const tmp: string[] = [];
  const cleanup = () => { for (const f of tmp) try { fs.unlinkSync(f); } catch {} };

  try {
    const cfg = CAT[params.category];
    const { generateWanMotion, generateMiniMaxMusic } = await import("../fal");

    // ── 1. Video clips (parallel) ────────────────────────────────────────────
    upd("generating_clips", "Generating video scenes… (1–2 min)");

    const clip1Prompt = `${cfg.clip1}. Business: "${params.businessName}". ${params.description}`;
    const clip2Prompt = `${cfg.clip2}. Business: "${params.businessName}". Tagline: "${params.tagline}".`;

    const [r1, r2] = await Promise.all([
      generateWanMotion({ prompt: clip1Prompt, durationSeconds: 5 }),
      generateWanMotion({ prompt: clip2Prompt, durationSeconds: 5 }),
    ]);

    // ── 2. Music + TTS (parallel) ────────────────────────────────────────────
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
      const ttsRes = await openai.audio.speech.create({
        model: "tts-1",
        voice: "onyx",
        input: voScript,
        response_format: "mp3",
      });
      ttsBuffer = Buffer.from(await (ttsRes as any).arrayBuffer());
    } catch (e: any) {
      console.warn("[ai-director] TTS unavailable, continuing without VO:", e.message);
    }

    const musicResult = await (async () => {
      for (let i = 0; i < 2; i++) {
        try { return await generateMiniMaxMusic({ prompt: cfg.music }); } catch (e: any) {
          if (i === 1) throw e;
        }
      }
      throw new Error("unreachable");
    })();

    // ── 3. Download to /tmp ──────────────────────────────────────────────────
    upd("assembling", "Assembling your commercial…");

    const c1Path = await downloadTmp(r1.videoUrl, "mp4"); tmp.push(c1Path);
    const c2Path = await downloadTmp(r2.videoUrl, "mp4"); tmp.push(c2Path);
    const musPath = await downloadTmp(musicResult.audioUrl, "mp3"); tmp.push(musPath);

    let voPath: string | null = null;
    if (ttsBuffer) {
      voPath = path.join(os.tmpdir(), `adir_vo_${Date.now()}.mp3`);
      fs.writeFileSync(voPath, ttsBuffer);
      tmp.push(voPath);
    }

    const outPath = path.join(os.tmpdir(), `adir_out_${Date.now()}.mp4`);
    tmp.push(outPath);

    // ── 4. FFmpeg assembly ───────────────────────────────────────────────────
    const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
    const NEON = "0x39FF14";

    const n = safeDt(params.businessName);
    const t = safeDt(params.tagline);
    const c = safeDt(params.cta || "Call us today");

    // End card: 3s black, staged fade-in of name → tagline → CTA
    const ecFilter =
      `color=c=black:s=1920x1080:d=3:r=24[ec_base];` +
      `[ec_base]drawtext=fontfile=${FONT}:text='${n}':fontsize=82:fontcolor=white:` +
        `x=(w-text_w)/2:y=420:alpha='if(lt(t,0.4),t/0.4,1)'[ec1];` +
      `[ec1]drawtext=fontfile=${FONT}:text='${t}':fontsize=48:fontcolor=${NEON}:` +
        `x=(w-text_w)/2:y=545:alpha='if(lt(t,0.8),0,if(lt(t,1.3),(t-0.8)/0.5,1))'[ec2];` +
      `[ec2]drawtext=fontfile=${FONT}:text='${c}':fontsize=40:fontcolor=white@0.75:` +
        `x=(w-text_w)/2:y=645:alpha='if(lt(t,1.4),0,if(lt(t,1.9),(t-1.4)/0.5,1))'[ec]`;

    // Normalize clip resolution + fps, xfade into end card
    const videoFilter =
      `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,` +
        `settb=AVTB,fps=24,format=yuv420p,setsar=1[v0];` +
      `[1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,` +
        `settb=AVTB,fps=24,format=yuv420p,setsar=1[v1];` +
      `[v0][v1]xfade=transition=fade:duration=0.5:offset=4.5[xv];` +
      ecFilter + `;` +
      `[xv][ec]xfade=transition=fadeblack:duration=0.5:offset=9[vout]`;

    // Audio: music under VO (or music only)
    const audioFilter = voPath
      ? `[2:a]volume=0.28,afade=t=in:st=0:d=0.8,afade=t=out:st=10:d=2[mus];` +
        `[3:a]volume=1.2[voc];` +
        `[mus][voc]amix=inputs=2:duration=longest:normalize=0[aout]`
      : `[2:a]volume=0.55,afade=t=in:st=0:d=0.8,afade=t=out:st=10:d=2[aout]`;

    const ffArgs: string[] = [
      "-y",
      "-i", c1Path, "-i", c2Path, "-i", musPath,
      ...(voPath ? ["-i", voPath] : []),
      "-filter_complex", `${videoFilter};${audioFilter}`,
      "-map", "[vout]", "-map", "[aout]",
      "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "24",
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
      "-shortest",
      outPath,
    ];

    await execFile("ffmpeg", ffArgs, { maxBuffer: 1024 * 1024 * 64 });

    // ── 5. Upload to Cloudinary ──────────────────────────────────────────────
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

    // ── 6. Store in session + log ────────────────────────────────────────────
    const { studioModelPricing: pricingTable } = await import("../../shared/schema");
    await db.insert(pricingTable).values({
      toolKey: "ai_director",
      label: "AI Director",
      description: "Complete assembled commercial ad: clips, music, and voiceover.",
      providerEndpoint: "fal-ai/wan-motion",
      creditsCost: job.creditsDebited,
      durationSeconds: 12,
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
      },
    });

    await storage.logStudioGeneration({
      userId: job.userId, sessionId,
      toolKey: "ai_director",
      prompt: voScript.slice(0, 500),
      creditsCost: job.creditsDebited,
      durationSeconds: 12,
      providerJobId: r1.jobId,
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
        durationSeconds: 12,
        providerJobId: null,
        status: "refunded",
        errorReason: err.message?.slice(0, 500),
      });
    } catch {}
  } finally {
    cleanup();
  }
}
