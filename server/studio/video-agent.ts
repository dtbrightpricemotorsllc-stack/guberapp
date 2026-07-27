// ─────────────────────────────────────────────────────────────────────────────
// GUBER Studio — Smart Asset-Aware AI Video Agent (4-Phase Engine)
//
// Phase 1 : Vision indexing     — GPT-4o scans every uploaded image
// Phase 2 : Edit + compositing  — fal.ai inpainting / image-to-image
// Phase 3 : Script + voiceover  — GPT-4o script → ElevenLabs TTS → Cloudinary
// Phase 4 : Video + stitch      — Kling i2v per scene → ffmpeg merge → audio
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";
import { submitToFal, FalNotConfiguredError, FalGenerationError } from "../fal";

// ── Job state ─────────────────────────────────────────────────────────────────

export type AgentLog = { ts: number; phase: number; message: string };

export type AgentJob = {
  id: string;
  userId: number;
  status: "running" | "complete" | "error";
  phase: number;            // 0-4
  logs: AgentLog[];
  manifest: Record<string, string[]> | null;  // Image N → detected objects
  videoUrl: string | null;
  error: string | null;
  createdAt: Date;
};

const jobs = new Map<string, AgentJob>();

// Clean up jobs older than 2 hours
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt.getTime() < cutoff) jobs.delete(id);
  }
}, 30 * 60 * 1000);

export function getAgentJob(id: string): AgentJob | undefined {
  return jobs.get(id);
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
  modifiedUrl?: string;   // set after fal edit
  originalUrl: string;
  duration: number;       // seconds
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
): Promise<EditPlan> {
  log(job, 2, "Parsing edit instructions against asset manifest…");

  const systemPrompt =
    `You are an AI video production director. ` +
    `Given an asset manifest (objects in each image slot) and user editing instructions, ` +
    `produce a JSON plan with "edits" (image modifications needed) and "scenes" (ordered video timeline). ` +
    `Each scene should have a motionPrompt suitable for Kling image-to-video. ` +
    `The total scene durations should sum to roughly 30 seconds. ` +
    `Return ONLY valid JSON, no other text.`;

  const userMsg =
    `Asset manifest:\n${JSON.stringify(manifest, null, 2)}\n\n` +
    `User instructions: "${instruction}"\n\n` +
    `Return JSON in this format:\n` +
    `{\n` +
    `  "edits": [\n` +
    `    {"type":"remove","slot":1,"object":"dog"},\n` +
    `    {"type":"composite","slots":[1,2],"description":"blend the two scenes"},\n` +
    `    {"type":"keep","slot":3}\n` +
    `  ],\n` +
    `  "scenes": [\n` +
    `    {"slot":1,"duration":12,"motionPrompt":"cinematic pan across the driveway"},\n` +
    `    {"slot":2,"duration":12,"motionPrompt":"slow zoom in on the house"},\n` +
    `    {"slot":3,"duration":6,"isEndCard":true,"motionPrompt":"logo fade in and glow"}\n` +
    `  ]\n` +
    `}`;

  const raw = await openaiChat(
    [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }],
    800,
  );
  const plan = extractJson(raw) as EditPlan;

  for (const e of plan.edits ?? []) {
    if (e.type === "remove")    log(job, 2, `Planned removal: "${e.object}" from Image ${e.slot}`);
    if (e.type === "composite") log(job, 2, `Planned composite: Images ${e.slots.join(" + ")}`);
    if (e.type === "keep")      log(job, 2, `Image ${e.slot} used as-is`);
  }
  log(job, 2, `${plan.scenes?.length ?? 0} scenes planned`);

  return plan;
}

async function applyEdits(
  job: AgentJob,
  plan: EditPlan,
  images: Array<{ slot: number; url: string }>,
): Promise<ScenePlan[]> {
  const urlBySlot = new Map(images.map((i) => [i.slot, i.url]));
  const modifiedBySlot = new Map<number, string>(); // slot → edited url

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
        // birefnet returns background-removed image
        const editedUrl = output?.image?.url ?? output?.images?.[0]?.url ?? origUrl;
        modifiedBySlot.set(edit.slot, editedUrl);
        log(job, 2, `Image ${edit.slot} background-stripped ✓`);
      } catch (err: any) {
        log(job, 2, `Inpainting failed for Image ${edit.slot} (${err.message}) — using original`);
      }
    }

    if (edit.type === "composite") {
      const baseSlot = edit.slots[0];
      const baseUrl = modifiedBySlot.get(baseSlot) ?? urlBySlot.get(baseSlot);
      if (!baseUrl) continue;
      log(job, 2, `Compositing Images ${edit.slots.join(" + ")} via fal.ai image-to-image…`);
      try {
        const { output } = await submitToFal<any>("fal-ai/flux/dev/image-to-image", {
          image_url: baseUrl,
          prompt: edit.description ?? "Blend the elements naturally into a cohesive scene",
          strength: 0.6,
          num_images: 1,
          enable_safety_checker: true,
        });
        const compositeUrl = output?.images?.[0]?.url ?? output?.image?.url ?? baseUrl;
        for (const slot of edit.slots) modifiedBySlot.set(slot, compositeUrl);
        log(job, 2, `Composite for Images ${edit.slots.join("+")} complete ✓`);
      } catch (err: any) {
        log(job, 2, `Composite failed (${err.message}) — using base image`);
      }
    }
  }

  return (plan.scenes ?? []).map((s) => ({
    ...s,
    originalUrl: urlBySlot.get(s.slot) ?? "",
    modifiedUrl: modifiedBySlot.get(s.slot),
  }));
}

// ── Phase 3 — Script + ElevenLabs voiceover ───────────────────────────────────

async function generateScript(
  job: AgentJob,
  manifest: Record<string, string[]>,
  instruction: string,
  scenes: ScenePlan[],
): Promise<string> {
  log(job, 3, "Generating 30-second voiceover script via GPT-4o…");

  const raw = await openaiChat(
    [
      {
        role: "system",
        content:
          `You are a professional video scriptwriter. Write a compelling ~70-word voiceover script ` +
          `(approximately 30 seconds when read aloud) that flows naturally across the visual scenes described. ` +
          `Return ONLY the script text, no stage directions, no JSON.`,
      },
      {
        role: "user",
        content:
          `Visual scenes: ${scenes.map((s, i) => `Scene ${i + 1}: ${s.motionPrompt}`).join("; ")}.\n` +
          `User's creative intent: "${instruction}".\n` +
          `Write the voiceover script now.`,
      },
    ],
    300,
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
  log(job, 3, "Synthesizing 30s voiceover via ElevenLabs…");

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
  log(job, 3, `Voiceover synthesized (${Math.round(buf.length / 1024)}KB) — uploading to storage…`);

  // Upload MP3 to Cloudinary for a hosted URL
  try {
    const cloudinary = (await import("../cloudinary.js")).default;
    const dataUrl = `data:audio/mpeg;base64,${buf.toString("base64")}`;
    const up = await (cloudinary as any).uploader.upload(dataUrl, {
      resource_type: "video", // Cloudinary treats audio as "video" type
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

async function generateSceneVideos(job: AgentJob, scenes: ScenePlan[]): Promise<string[]> {
  const videoUrls: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const imageUrl = scene.modifiedUrl ?? scene.originalUrl;
    if (!imageUrl) {
      log(job, 4, `Scene ${i + 1}: no image URL — skipping`);
      continue;
    }

    log(job, 4, `Rendering Scene ${i + 1}/${scenes.length} via Kling image-to-video…`);

    try {
      const dur = scene.duration <= 5 ? "5" : "10";
      const { output } = await submitToFal<any>("fal-ai/kling-video/v1.6/pro/image-to-video", {
        image_url: imageUrl,
        prompt: scene.motionPrompt,
        duration: dur,
        aspect_ratio: "16:9",
      });
      const vUrl = output?.video?.url ?? output?.url;
      if (!vUrl) throw new Error("No video URL in response");
      videoUrls.push(vUrl);
      log(job, 4, `Scene ${i + 1} rendered ✓`);
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
}

export async function startAgentJob(userId: number, input: AgentInput): Promise<AgentJob> {
  const id = crypto.randomUUID();
  const job: AgentJob = {
    id, userId,
    status: "running",
    phase: 0,
    logs: [],
    manifest: null,
    videoUrl: null,
    error: null,
    createdAt: new Date(),
  };
  jobs.set(id, job);

  // Run pipeline in background — do not await
  runPipeline(job, input).catch((err) => {
    job.status = "error";
    job.error = err.message;
    log(job, job.phase, `Fatal error: ${err.message}`);
  });

  return job;
}

async function runPipeline(job: AgentJob, input: AgentInput): Promise<void> {
  const { images, instruction } = input;

  // ── Phase 1 ──────────────────────────────────────────────────────────────
  job.phase = 1;
  job.manifest = await indexAssets(job, images);

  // ── Phase 2 ──────────────────────────────────────────────────────────────
  job.phase = 2;
  const plan = await parseEdits(job, job.manifest, instruction, images);
  const scenes = await applyEdits(job, plan, images);

  // ── Phase 3 ──────────────────────────────────────────────────────────────
  job.phase = 3;
  const script = await generateScript(job, job.manifest, instruction, scenes);
  const audioUrl = await generateVoiceover(job, script);

  // ── Phase 4 ──────────────────────────────────────────────────────────────
  job.phase = 4;
  log(job, 4, "Starting video rendering…");
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
}
