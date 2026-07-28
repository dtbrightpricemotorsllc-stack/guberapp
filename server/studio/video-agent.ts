// ─────────────────────────────────────────────────────────────────────────────
// GUBER Studio — Smart Asset-Aware AI Video Agent (4-Phase Engine)
//
// Phase 1 : Vision indexing     — GPT-4o scans every uploaded image
// Phase 2 : Edit + compositing  — fal.ai inpainting / image-to-image
// Phase 3 : Script + voiceover  — GPT-4o script → ElevenLabs TTS → Cloudinary
// Phase 4 : Video + stitch      — Kling i2v per scene → ffmpeg merge → audio
//
// Jobs are persisted to studio_video_jobs for 24 hours so users can close the
// app and return to find their video ready.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";
import { pool } from "../db";
import { submitToFal } from "../fal";

// ── Job state ─────────────────────────────────────────────────────────────────

export type AgentLog = { ts: number; phase: number; message: string };

export type AgentJob = {
  id: string;
  userId: number;
  status: "running" | "complete" | "error";
  phase: number;
  logs: AgentLog[];
  manifest: Record<string, string[]> | null;
  videoUrl: string | null;
  error: string | null;
  targetDuration: number;
  jobType: "video" | "promo";
  createdAt: Date;
};

// In-memory map for active jobs (fast log streaming during processing)
const jobs = new Map<string, AgentJob>();

// Flush job state to DB (called on phase changes and completion)
async function persist(job: AgentJob): Promise<void> {
  try {
    await pool.query(
      `UPDATE studio_video_jobs
          SET status = $1, phase = $2, logs = $3, manifest = $4,
              video_url = $5, error = $6
        WHERE id = $7`,
      [
        job.status,
        job.phase,
        JSON.stringify(job.logs),
        job.manifest ? JSON.stringify(job.manifest) : null,
        job.videoUrl,
        job.error,
        job.id,
      ],
    );
  } catch (err: any) {
    console.error(`[video-agent][${job.id}] DB persist error: ${err.message}`);
  }
}

// Clean up in-memory entries older than 2 hours (DB row lives 24 h)
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt.getTime() < cutoff) jobs.delete(id);
  }
}, 30 * 60 * 1000);

// Purge expired DB rows daily
setInterval(async () => {
  try {
    await pool.query("DELETE FROM studio_video_jobs WHERE expires_at < NOW()");
  } catch {}
}, 60 * 60 * 1000);

export function getAgentJob(id: string): AgentJob | undefined {
  return jobs.get(id);
}

/** Return a job from DB — used by the status endpoint when the job is no longer in memory */
export async function getAgentJobFromDb(id: string): Promise<AgentJob | null> {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, status, phase, logs, manifest, video_url, error,
              target_duration, job_type, created_at
         FROM studio_video_jobs WHERE id = $1 AND expires_at > NOW()`,
      [id],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      status: r.status,
      phase: r.phase,
      logs: r.logs ?? [],
      manifest: r.manifest ?? null,
      videoUrl: r.video_url,
      error: r.error,
      targetDuration: r.target_duration ?? 15,
      jobType: (r.job_type as "video" | "promo") ?? "video",
      createdAt: r.created_at,
    };
  } catch {
    return null;
  }
}

/** Return the most-recent non-expired job for a user, optionally filtered by jobType */
export async function getUserLatestJob(userId: number, jobType?: "video" | "promo"): Promise<AgentJob | null> {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, status, phase, logs, manifest, video_url, error,
              target_duration, job_type, created_at
         FROM studio_video_jobs
        WHERE user_id = $1 AND expires_at > NOW()
          AND ($2::text IS NULL OR job_type = $2)
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId, jobType ?? null],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    const live = jobs.get(r.id);
    if (live) return live;
    return {
      id: r.id,
      userId: r.user_id,
      status: r.status,
      phase: r.phase,
      logs: r.logs ?? [],
      manifest: r.manifest ?? null,
      videoUrl: r.video_url,
      error: r.error,
      targetDuration: r.target_duration ?? 15,
      jobType: (r.job_type as "video" | "promo") ?? "video",
      createdAt: r.created_at,
    };
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(job: AgentJob, phase: number, message: string) {
  job.logs.push({ ts: Date.now(), phase, message });
  console.log(`[video-agent][${job.id}] Phase ${phase}: ${message}`);
}

async function openaiChat(messages: any[], maxTokens = 800): Promise<string> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI not configured — set AI_INTEGRATIONS_OPENAI_API_KEY");
  const base = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o", messages, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  return data.choices?.[0]?.message?.content ?? "";
}

function extractJson(text: string): any {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON found in AI response");
  return JSON.parse(m[0]);
}

// ── Duration → scene plan ─────────────────────────────────────────────────────
// Kling only supports 5 s or 10 s clips.
// Map target total duration → { sceneCount, clipDuration }
function durationPlan(targetSeconds: number): { sceneCount: number; clipDuration: 5 | 10 } {
  if (targetSeconds <= 5)  return { sceneCount: 1, clipDuration: 5 };
  if (targetSeconds <= 10) return { sceneCount: 2, clipDuration: 5 };
  if (targetSeconds <= 15) return { sceneCount: 3, clipDuration: 5 };
  if (targetSeconds <= 20) return { sceneCount: 2, clipDuration: 10 };
  return                          { sceneCount: 3, clipDuration: 10 }; // 30 s
}

// ── Phase 1 — Vision indexing ─────────────────────────────────────────────────

async function indexAssets(
  job: AgentJob,
  images: Array<{ slot: number; name: string; url: string }>,
): Promise<Record<string, string[]>> {
  log(job, 1, `Indexing assets across ${images.length} image${images.length > 1 ? "s" : ""}…`);

  const content: any[] = [
    {
      type: "text",
      text:
        `Analyze each of the following ${images.length} image(s). ` +
        `For each numbered image slot, list every key object, person, text, logo, or background element you can see. ` +
        `Return ONLY valid JSON, no other text, in this exact format: ` +
        `{"Image 1": ["car", "dog", "driveway"], "Image 2": ["house", "lawn", "company logo"]}`,
    },
    ...images.map((img) => ({
      type: "image_url",
      image_url: { url: img.url, detail: "low" },
    })),
  ];

  const raw = await openaiChat([{ role: "user", content }], 600);
  const manifest = extractJson(raw) as Record<string, string[]>;

  for (const img of images) {
    const key = `Image ${img.slot}`;
    const tags = manifest[key] ?? [];
    log(job, 1, `${key}: detected [${tags.slice(0, 6).join(", ")}${tags.length > 6 ? "…" : ""}]`);
  }

  return manifest;
}

// ── Phase 2 — Edit instruction parsing + image modification ───────────────────

type EditAction =
  | { type: "remove"; slot: number; object: string }
  | { type: "composite"; slots: number[]; description: string }
  | { type: "keep"; slot: number };

type ScenePlan = {
  slot: number;
  modifiedUrl?: string;
  originalUrl: string;
  duration: number;
  isEndCard?: boolean;
  motionPrompt: string;
};

type EditPlan = {
  edits: EditAction[];
  scenes: Omit<ScenePlan, "modifiedUrl">[];
};

async function parseEdits(
  job: AgentJob,
  manifest: Record<string, string[]>,
  instruction: string,
  images: Array<{ slot: number; url: string }>,
  targetDuration: number,
): Promise<EditPlan> {
  log(job, 2, "Parsing edit instructions against asset manifest…");

  const availableSlots = images.map((i) => i.slot);
  const slotList = availableSlots.join(", ");
  const { sceneCount, clipDuration } = durationPlan(targetDuration);

  const systemPrompt =
    `You are an AI video production director. ` +
    `Given an asset manifest (objects in each image slot) and user editing instructions, ` +
    `produce a JSON plan with "edits" (image modifications needed) and "scenes" (ordered video timeline). ` +
    `Each scene should have a motionPrompt suitable for Kling image-to-video. ` +
    `CRITICAL: scenes MUST only reference slot numbers from this list: [${slotList}]. ` +
    `If only one image is available, all scenes must use that same slot with different motionPrompts. ` +
    `Plan EXACTLY ${sceneCount} scene${sceneCount > 1 ? "s" : ""}, each ${clipDuration} seconds long ` +
    `(total = ${targetDuration} seconds). ` +
    `Return ONLY valid JSON, no other text.`;

  const exampleScenes = Array.from({ length: sceneCount }, (_, i) => {
    const prompts = [
      "cinematic slow zoom in on subject",
      "gentle pan left to right across scene",
      "slow fade out with warm glow",
      "dramatic push-in with lens flare",
    ];
    return `    {"slot":${availableSlots[0]},"duration":${clipDuration},"motionPrompt":"${prompts[i % prompts.length]}"}`;
  }).join(",\n");

  const userMsg =
    `Available image slots: [${slotList}]\n` +
    `Asset manifest:\n${JSON.stringify(manifest, null, 2)}\n\n` +
    `User instructions: "${instruction}"\n` +
    `Target video length: ${targetDuration} seconds (${sceneCount} scene${sceneCount > 1 ? "s" : ""} × ${clipDuration}s each)\n\n` +
    `Return JSON (scenes MUST use only slots: [${slotList}], EXACTLY ${sceneCount} scenes):\n` +
    `{\n` +
    `  "edits": [{"type":"keep","slot":${availableSlots[0]}}],\n` +
    `  "scenes": [\n${exampleScenes}\n  ]\n` +
    `}`;

  const raw = await openaiChat(
    [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }],
    900,
  );
  const plan = extractJson(raw) as EditPlan;

  // Enforce slot constraints — remap any invalid slot to the first available
  const validSlots = new Set(availableSlots);
  const fallbackSlot = availableSlots[0];
  if (plan.scenes) {
    plan.scenes = plan.scenes.map((s) => ({
      ...s,
      slot: validSlots.has(s.slot) ? s.slot : fallbackSlot,
      duration: clipDuration,
    }));
  }

  for (const e of plan.edits ?? []) {
    if (e.type === "remove")    log(job, 2, `Planned removal: "${e.object}" from Image ${e.slot}`);
    if (e.type === "composite") log(job, 2, `Planned composite: Images ${(e as any).slots.join(" + ")}`);
    if (e.type === "keep")      log(job, 2, `Image ${e.slot} used as-is`);
  }
  log(job, 2, `${plan.scenes?.length ?? 0} scene${plan.scenes?.length === 1 ? "" : "s"} planned (${targetDuration}s total)`);

  return plan;
}

async function applyEdits(
  job: AgentJob,
  plan: EditPlan,
  images: Array<{ slot: number; url: string }>,
): Promise<ScenePlan[]> {
  const urlBySlot = new Map(images.map((i) => [i.slot, i.url]));
  const modifiedBySlot = new Map<number, string>();

  for (const edit of plan.edits ?? []) {
    if (edit.type === "remove") {
      const origUrl = urlBySlot.get(edit.slot);
      if (!origUrl) continue;
      log(job, 2, `Removing "${edit.object}" from Image ${edit.slot} via fal.ai inpainting…`);
      try {
        const { output } = await submitToFal<any>("fal-ai/birefnet", {
          image_url: origUrl,
          model: "General Use (Light)",
        });
        const editedUrl = output?.image?.url ?? output?.images?.[0]?.url ?? origUrl;
        modifiedBySlot.set(edit.slot, editedUrl);
        log(job, 2, `Image ${edit.slot} background-stripped ✓`);
      } catch (err: any) {
        log(job, 2, `Inpainting failed for Image ${edit.slot} (${err.message}) — using original`);
      }
    }

    if (edit.type === "composite") {
      const slots = (edit as any).slots as number[];
      const baseSlot = slots[0];
      const baseUrl = modifiedBySlot.get(baseSlot) ?? urlBySlot.get(baseSlot);
      if (!baseUrl) continue;
      log(job, 2, `Compositing Images ${slots.join(" + ")} via fal.ai image-to-image…`);
      try {
        const { output } = await submitToFal<any>("fal-ai/flux/dev/image-to-image", {
          image_url: baseUrl,
          prompt: (edit as any).description ?? "Blend the elements naturally into a cohesive scene",
          strength: 0.6,
          num_images: 1,
          enable_safety_checker: true,
        });
        const compositeUrl = output?.images?.[0]?.url ?? output?.image?.url ?? baseUrl;
        for (const slot of slots) modifiedBySlot.set(slot, compositeUrl);
        log(job, 2, `Composite for Images ${slots.join("+")} complete ✓`);
      } catch (err: any) {
        log(job, 2, `Composite failed (${err.message}) — using base image`);
      }
    }
  }

  const anyUrl = images[0]?.url ?? "";

  return (plan.scenes ?? []).map((s) => ({
    ...s,
    originalUrl: urlBySlot.get(s.slot) ?? anyUrl,
    modifiedUrl: modifiedBySlot.get(s.slot),
  }));
}

// ── Phase 3 — Script + ElevenLabs voiceover ───────────────────────────────────

async function generateScript(
  job: AgentJob,
  manifest: Record<string, string[]>,
  instruction: string,
  scenes: ScenePlan[],
  targetDuration: number,
): Promise<string> {
  const approxWords = Math.round(targetDuration * 2.3); // ~140 wpm
  log(job, 3, `Generating ${targetDuration}s voiceover script via GPT-4o…`);

  const raw = await openaiChat(
    [
      {
        role: "system",
        content:
          `You are a professional video scriptwriter. Write a compelling ~${approxWords}-word voiceover script ` +
          `(approximately ${targetDuration} seconds when read aloud at a natural pace) ` +
          `that flows naturally across the visual scenes described. ` +
          `Return ONLY the script text, no stage directions, no JSON.`,
      },
      {
        role: "user",
        content:
          `Visual scenes: ${scenes.map((s, i) => `Scene ${i + 1}: ${s.motionPrompt}`).join("; ")}.\n` +
          `User's creative intent: "${instruction}".\n` +
          `Write the voiceover script now (target ~${approxWords} words / ${targetDuration} seconds).`,
      },
    ],
    400,
  );

  log(job, 3, `Script generated (${raw.trim().split(/\s+/).length} words)`);
  return raw.trim();
}

async function generateVoiceover(job: AgentJob, script: string): Promise<string | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    log(job, 3, "ELEVENLABS_API_KEY not set — skipping voiceover");
    return null;
  }

  const voiceId = "21m00Tcm4TlvDq8ikWAM"; // Rachel — clear, professional
  log(job, 3, "Synthesizing voiceover via ElevenLabs…");

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text: script,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    log(job, 3, `ElevenLabs TTS failed (${res.status}) — skipping audio: ${t.slice(0, 100)}`);
    return null;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  log(job, 3, `Voiceover synthesized (${Math.round(buf.length / 1024)}KB) — uploading…`);

  try {
    const cloudinary = (await import("../cloudinary.js")).default;
    const dataUrl = `data:audio/mpeg;base64,${buf.toString("base64")}`;
    const up = await (cloudinary as any).uploader.upload(dataUrl, {
      resource_type: "video",
      folder: "guber-studio-voiceover",
      format: "mp3",
    });
    log(job, 3, "Voiceover uploaded ✓");
    return up.secure_url as string;
  } catch (err: any) {
    log(job, 3, `Cloudinary upload failed (${err.message}) — no audio`);
    return null;
  }
}

// ── Phase 4 — Video generation + stitching ────────────────────────────────────

async function renderKlingScene(
  job: AgentJob,
  sceneIdx: number,
  imageUrl: string,
  motionPrompt: string,
  duration: 5 | 10,
): Promise<string | null> {
  const key = process.env.FAL_KEY;
  if (!key) { log(job, 4, "FAL_KEY not set — cannot render video"); return null; }

  const endpoint = "fal-ai/kling-video/v1.6/standard/image-to-video";
  const submitRes = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Authorization": `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl, prompt: motionPrompt, duration, aspect_ratio: "16:9" }),
  });
  if (!submitRes.ok) {
    const t = await submitRes.text().catch(() => "");
    throw new Error(`Fal.ai submit ${submitRes.status}: ${t.slice(0, 200)}`);
  }
  const { request_id: requestId, status_url: statusUrl, response_url: responseUrl } =
    (await submitRes.json()) as { request_id?: string; status_url?: string; response_url?: string };
  if (!requestId || !statusUrl || !responseUrl) throw new Error("Fal.ai missing queue fields");

  // Poll up to 12 minutes per scene
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 6000));
    const st = await fetch(statusUrl, { headers: { "Authorization": `Key ${key}` } });
    if (!st.ok) continue;
    const { status } = (await st.json()) as { status?: string };
    if (status === "FAILED") throw new Error("Kling generation failed");
    if (status !== "COMPLETED") { log(job, 4, `Scene ${sceneIdx + 1} rendering… (${status})`); continue; }

    const finalRes = await fetch(responseUrl, { headers: { "Authorization": `Key ${key}` } });
    if (!finalRes.ok) throw new Error(`Response fetch ${finalRes.status}`);
    const out = (await finalRes.json()) as any;
    const vUrl = out?.video?.url ?? out?.url;
    if (!vUrl) throw new Error("No video URL in Kling response");
    return vUrl;
  }
  throw new Error("Kling render timed out after 12 minutes");
}

async function generateSceneVideos(job: AgentJob, scenes: ScenePlan[]): Promise<string[]> {
  const videoUrls: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const imageUrl = scene.modifiedUrl ?? scene.originalUrl;
    if (!imageUrl) {
      log(job, 4, `Scene ${i + 1}: no image URL — skipping`);
      continue;
    }

    log(job, 4, `Rendering Scene ${i + 1}/${scenes.length} via Kling Standard…`);

    try {
      const dur: 5 | 10 = scene.duration <= 5 ? 5 : 10;
      const vUrl = await renderKlingScene(job, i, imageUrl, scene.motionPrompt, dur);
      if (!vUrl) throw new Error("No video URL returned");
      videoUrls.push(vUrl);
      log(job, 4, `Scene ${i + 1} rendered ✓`);
      await persist(job); // checkpoint after each successful clip
    } catch (err: any) {
      log(job, 4, `Scene ${i + 1} failed (${err.message}) — skipped`);
    }
  }

  return videoUrls;
}

async function stitchVideos(job: AgentJob, videoUrls: string[]): Promise<string | null> {
  if (videoUrls.length === 0) return null;
  if (videoUrls.length === 1) return videoUrls[0];

  log(job, 4, `Stitching ${videoUrls.length} clips into final MP4…`);
  try {
    const { output } = await submitToFal<any>("fal-ai/ffmpeg-api/merge-videos", {
      video_urls: videoUrls,
    });
    const merged = output?.video?.url ?? output?.url ?? output?.video_url;
    if (!merged) throw new Error("No merged video URL");
    log(job, 4, "Clips stitched ✓");
    return merged;
  } catch (err: any) {
    log(job, 4, `Stitch failed (${err.message}) — returning first clip`);
    return videoUrls[0];
  }
}

async function mergeAudio(job: AgentJob, videoUrl: string, audioUrl: string): Promise<string> {
  log(job, 4, "Merging voiceover into final video…");
  try {
    const { output } = await submitToFal<any>("fal-ai/ffmpeg-api/merge-audio-video", {
      video_url: videoUrl,
      audio_url: audioUrl,
    });
    const final = output?.video?.url ?? output?.url ?? output?.video_url;
    if (!final) throw new Error("No final video URL");
    log(job, 4, "Audio merged ✓  Final video ready.");
    return final;
  } catch (err: any) {
    log(job, 4, `Audio merge failed (${err.message}) — returning video without voiceover`);
    return videoUrl;
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export interface AgentInput {
  images: Array<{ slot: number; name: string; url: string }>;
  instruction: string;
  targetDuration?: number; // seconds — 5 | 10 | 15 | 20 | 30
  jobType?: "video" | "promo";
}

export async function startAgentJob(userId: number, input: AgentInput): Promise<AgentJob> {
  const id = crypto.randomUUID();
  const targetDuration = [5, 10, 15, 20, 30].includes(input.targetDuration ?? 0)
    ? input.targetDuration!
    : 15;
  const jobType: "video" | "promo" = input.jobType === "promo" ? "promo" : "video";

  const job: AgentJob = {
    id, userId,
    status: "running",
    phase: 0,
    logs: [],
    manifest: null,
    videoUrl: null,
    error: null,
    targetDuration,
    jobType,
    createdAt: new Date(),
  };
  jobs.set(id, job);

  // Create DB row immediately so the client can resume after a page close
  try {
    await pool.query(
      `INSERT INTO studio_video_jobs
         (id, user_id, status, phase, logs, target_duration, job_type)
       VALUES ($1, $2, 'running', 0, '[]', $3, $4)`,
      [id, userId, targetDuration, jobType],
    );
  } catch (err: any) {
    console.error(`[video-agent][${id}] DB insert error: ${err.message}`);
  }

  // Run pipeline in background — do not await
  runPipeline(job, input).catch((err) => {
    job.status = "error";
    job.error = err.message;
    log(job, job.phase, `Fatal error: ${err.message}`);
    persist(job);
  });

  return job;
}

async function runPipeline(job: AgentJob, input: AgentInput): Promise<void> {
  const { images, instruction, targetDuration = 15 } = input;

  // ── Phase 1 ──────────────────────────────────────────────────────────────
  job.phase = 1;
  job.manifest = await indexAssets(job, images);
  await persist(job);

  // ── Phase 2 ──────────────────────────────────────────────────────────────
  job.phase = 2;
  const plan = await parseEdits(job, job.manifest, instruction, images, targetDuration);
  const scenes = await applyEdits(job, plan, images);
  await persist(job);

  // ── Phase 3 ──────────────────────────────────────────────────────────────
  job.phase = 3;
  const script = await generateScript(job, job.manifest, instruction, scenes, targetDuration);
  const audioUrl = await generateVoiceover(job, script);
  await persist(job);

  // ── Phase 4 ──────────────────────────────────────────────────────────────
  job.phase = 4;
  log(job, 4, `Starting video rendering (${scenes.length} scene${scenes.length === 1 ? "" : "s"}, ${targetDuration}s total)…`);
  const clipUrls = await generateSceneVideos(job, scenes);
  if (clipUrls.length === 0) {
    throw new Error("No video clips were generated — check FAL_KEY and image URLs");
  }

  const stitched = await stitchVideos(job, clipUrls);
  if (!stitched) throw new Error("Stitching returned no URL");

  const finalUrl = audioUrl ? await mergeAudio(job, stitched, audioUrl) : stitched;

  job.videoUrl = finalUrl;
  job.status = "complete";
  log(job, 4, "🎬 Video Agent complete — your video is ready!");
  await persist(job);
}
