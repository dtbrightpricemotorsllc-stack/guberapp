// ─────────────────────────────────────────────────────────────────────────────
// Fal.ai integration for GUBER Studio v2.
//
// Single integration point for every Fal.ai endpoint we expose. Each tool
// here corresponds to exactly one entry in `studio_model_pricing`.
//
// Phase 1 tools:
//   • kling_motion_control — fal-ai/kling-video/v3/pro/motion-control
//   • wan_motion           — fal-ai/wan-motion
//   • minimax_music        — fal-ai/minimax-music/v2
//
// ⚠️  FAL_KEY required. If FAL_KEY is not set we throw FalNotConfiguredError so
// the caller can surface a friendly 503 BEFORE deducting credits.
// ─────────────────────────────────────────────────────────────────────────────

export class FalNotConfiguredError extends Error {
  constructor() {
    super(
      "GUBER Studio is temporarily unavailable. The FAL_KEY API secret has not been configured by GUBER. Please try again later."
    );
    this.name = "FalNotConfiguredError";
  }
}

export class FalGenerationError extends Error {
  constructor(message: string, public providerCode?: string) {
    super(message);
    this.name = "FalGenerationError";
  }
}

const FAL_API_BASE = "https://queue.fal.run";

export function isFalConfigured(): boolean {
  return !!process.env.FAL_KEY;
}

export type FalSubmitResult<T = any> = {
  output: T;
  jobId: string;
};

/**
 * Submit a payload to a Fal.ai queue endpoint, poll until completed, return
 * the final response JSON. Generic — every per-tool helper wraps this.
 */
export async function submitToFal<T = any>(endpoint: string, input: Record<string, any>): Promise<FalSubmitResult<T>> {
  const key = process.env.FAL_KEY;
  if (!key) throw new FalNotConfiguredError();

  const submitRes = await fetch(`${FAL_API_BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text().catch(() => "");
    throw new FalGenerationError(
      `Fal.ai submit failed (${submitRes.status}): ${text.slice(0, 300)}`,
      String(submitRes.status),
    );
  }

  const submitJson = (await submitRes.json()) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
  };
  const requestId = submitJson.request_id;
  const statusUrl = submitJson.status_url;
  const responseUrl = submitJson.response_url;
  if (!requestId || !statusUrl || !responseUrl) {
    throw new FalGenerationError("Fal.ai submit response missing request_id / status_url / response_url");
  }

  const startedAt = Date.now();
  const TIMEOUT_MS = 5 * 60 * 1000;
  while (Date.now() - startedAt < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 3000));
    const stRes = await fetch(statusUrl, { headers: { "Authorization": `Key ${key}` } });
    if (!stRes.ok) continue;
    const stJson = (await stRes.json()) as { status?: string };
    if (stJson.status === "COMPLETED") break;
    if (stJson.status === "FAILED") {
      throw new FalGenerationError(`Fal.ai generation failed (job ${requestId})`);
    }
  }

  const finalRes = await fetch(responseUrl, { headers: { "Authorization": `Key ${key}` } });
  if (!finalRes.ok) {
    throw new FalGenerationError(`Fal.ai response fetch failed (${finalRes.status}) for job ${requestId}`);
  }
  const output = (await finalRes.json()) as T;
  return { output, jobId: requestId };
}

// ── Per-tool helpers ───────────────────────────────────────────────────────

export type KlingMotionControlOpts = {
  prompt: string;
  imageUrl: string;
  motionVideoUrl?: string;
  durationSeconds?: 5 | 10;
};

export async function generateKlingMotionControl(opts: KlingMotionControlOpts): Promise<{ videoUrl: string; jobId: string }> {
  const { output, jobId } = await submitToFal<{ video?: { url?: string }; url?: string }>(
    "fal-ai/kling-video/v3/pro/motion-control",
    {
      prompt: opts.prompt,
      image_url: opts.imageUrl,
      ...(opts.motionVideoUrl ? { motion_video_url: opts.motionVideoUrl } : {}),
      duration: String(opts.durationSeconds ?? 5),
    },
  );
  const videoUrl = output.video?.url || output.url;
  if (!videoUrl) throw new FalGenerationError(`Kling motion-control returned no video url (job ${jobId})`);
  return { videoUrl, jobId };
}

export type MirrorMotionOpts = {
  prompt: string;
  imageUrl: string;
  motionVideoUrl: string;
  durationSeconds: 5 | 10;
};

export async function generateMirrorMotion(opts: MirrorMotionOpts): Promise<{ videoUrl: string; jobId: string }> {
  const { output, jobId } = await submitToFal<{ video?: { url?: string }; url?: string }>(
    "fal-ai/kling-video/v3/pro/motion-control",
    {
      prompt: opts.prompt,
      image_url: opts.imageUrl,
      motion_video_url: opts.motionVideoUrl,
      duration: String(opts.durationSeconds),
    },
  );
  const videoUrl = output.video?.url || output.url;
  if (!videoUrl) throw new FalGenerationError(`Mirror Motion returned no video url (job ${jobId})`);
  return { videoUrl, jobId };
}

export type OpenAITtsOpts = {
  text: string;
  voice: string;
};

export class OpenAITtsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAITtsUnavailableError";
  }
}

export function isOpenAITtsConfigured(): boolean {
  return !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
}

/**
 * OpenAI TTS bridge for the Commercial Builder voiceover step (task-521).
 * Returns an mp3 buffer + a base64 dataUrl ready for Cloudinary upload.
 */
export async function generateOpenAITts(opts: OpenAITtsOpts): Promise<{ dataUrl: string; mimeType: string }> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1";
  if (!apiKey) throw new OpenAITtsUnavailableError("OpenAI TTS not configured");
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/audio/speech`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "tts-1", voice: opts.voice, input: opts.text, format: "mp3" }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new FalGenerationError(`OpenAI TTS HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const mimeType = "audio/mpeg";
  const dataUrl = `data:${mimeType};base64,${buf.toString("base64")}`;
  return { dataUrl, mimeType };
}

export type WanMotionOpts = {
  prompt: string;
  imageUrl?: string;
  durationSeconds?: 5 | 10;
};

export async function generateWanMotion(opts: WanMotionOpts): Promise<{ videoUrl: string; jobId: string }> {
  const { output, jobId } = await submitToFal<{ video?: { url?: string }; url?: string }>(
    "fal-ai/wan-motion",
    {
      prompt: opts.prompt,
      ...(opts.imageUrl ? { image_url: opts.imageUrl } : {}),
      duration_seconds: opts.durationSeconds ?? 5,
    },
  );
  const videoUrl = output.video?.url || output.url;
  if (!videoUrl) throw new FalGenerationError(`Wan motion returned no video url (job ${jobId})`);
  return { videoUrl, jobId };
}

export type MiniMaxMusicOpts = {
  prompt: string;
  durationSeconds?: number;
};

export async function generateMiniMaxMusic(opts: MiniMaxMusicOpts): Promise<{ audioUrl: string; jobId: string }> {
  const { output, jobId } = await submitToFal<{ audio?: { url?: string }; url?: string }>(
    "fal-ai/minimax-music/v2",
    {
      prompt: opts.prompt,
      ...(opts.durationSeconds ? { duration: opts.durationSeconds } : {}),
    },
  );
  const audioUrl = output.audio?.url || output.url;
  if (!audioUrl) throw new FalGenerationError(`MiniMax music returned no audio url (job ${jobId})`);
  return { audioUrl, jobId };
}

export type FluxQuickPicOpts = {
  prompt: string;
};

export async function generateFluxQuickPic(opts: FluxQuickPicOpts): Promise<{ imageUrl: string; jobId: string }> {
  const { output, jobId } = await submitToFal<{ images?: Array<{ url?: string }>; image?: { url?: string }; url?: string }>(
    "fal-ai/flux/schnell",
    {
      prompt: opts.prompt,
      image_size: "square_hd",
      num_inference_steps: 4,
      num_images: 1,
      enable_safety_checker: true,
    },
  );
  const imageUrl = output.images?.[0]?.url || output.image?.url || output.url;
  if (!imageUrl) throw new FalGenerationError(`Flux Quick Pic returned no image url (job ${jobId})`);
  return { imageUrl, jobId };
}

// ── Moderation (kept from v1) ─────────────────────────────────────────────

export class ModerationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModerationUnavailableError";
  }
}

export function isModerationConfigured(): boolean {
  return !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
}

export async function moderatePrompt(prompt: string): Promise<{ flagged: boolean; reason?: string }> {
  return runOmniModeration([{ type: "text", text: prompt }], "Prompt");
}

export async function moderateImage(imageUrl: string): Promise<{ flagged: boolean; reason?: string }> {
  return runOmniModeration([{ type: "image_url", image_url: { url: imageUrl } }], "Image");
}

type ModInput =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

async function runOmniModeration(input: ModInput[], label: string): Promise<{ flagged: boolean; reason?: string }> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) {
    throw new ModerationUnavailableError(`${label} moderation unavailable: OpenAI not configured`);
  }
  let res: Response;
  try {
    res = await fetch(`${(baseUrl || "https://api.openai.com/v1").replace(/\/$/, "")}/moderations`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "omni-moderation-latest", input }),
    });
  } catch (err: any) {
    console.warn(`[GUBER][studio] ${label} moderation network error:`, err.message);
    throw new ModerationUnavailableError(`${label} moderation network error: ${err.message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[GUBER][studio] ${label} moderation HTTP`, res.status, body.slice(0, 200));
    throw new ModerationUnavailableError(`${label} moderation HTTP ${res.status}`);
  }
  const data = (await res.json()) as { results?: Array<{ flagged?: boolean; categories?: Record<string, boolean> }> };
  const r = data.results?.[0];
  if (r?.flagged) {
    const cats = r.categories ? Object.entries(r.categories).filter(([_, v]) => v).map(([k]) => k) : [];
    return { flagged: true, reason: cats.length ? `${label} flagged: ${cats.join(", ")}` : `${label} flagged by moderation` };
  }
  return { flagged: false };
}
