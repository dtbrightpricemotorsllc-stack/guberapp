// ─────────────────────────────────────────────────────────────────────────────
// Fal.ai integration for the AI Video Studio.
//
// This module is the SINGLE place that talks to Fal.ai. Everything else just
// calls `generateVideo()` and either gets back a URL or a typed error.
//
// ⚠️  FAL_KEY required. If FAL_KEY is not set we throw FalNotConfiguredError so
// the caller can surface a friendly "AI Studio not configured yet" message
// AND skip charging the user a credit. The route must catch this error and
// return 503 BEFORE deducting credits.
//
// We intentionally keep the model selection here rather than per-route so a
// future tier upgrade (chained 10s clips, image-to-video for Creator tier,
// etc.) is a single-file change.
// ─────────────────────────────────────────────────────────────────────────────

export class FalNotConfiguredError extends Error {
  constructor() {
    super(
      "AI Video Studio is temporarily unavailable. The FAL_KEY API secret has not been configured by GUBER. Please try again later."
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

export type GenerateVideoOpts = {
  prompt: string;
  /** Optional source image (https URL). If provided, we use image-to-video. */
  imageUrl?: string;
  /** 5 (default) or 10 (chained, Premium tier). */
  durationSeconds?: 5 | 10;
};

export type GenerateVideoResult = {
  /** Direct URL to the generated mp4 (Fal-hosted). Caller should re-upload to Cloudinary for permanence. */
  videoUrl: string;
  /** Fal job/request id, persisted for support/debugging. */
  jobId: string;
};

const FAL_API_BASE = "https://queue.fal.run";
// Cheapest fast model for Standard tier — keeps margins healthy at $0.20/clip.
// Switch to a higher-quality model for Creator/Business tiers in a follow-up.
const STANDARD_TEXT_MODEL = "fal-ai/wan/v2.2-5b/text-to-video";
const STANDARD_IMAGE_MODEL = "fal-ai/wan/v2.2-5b/image-to-video";

export function isFalConfigured(): boolean {
  return !!process.env.FAL_KEY;
}

/**
 * Generate a video clip via Fal.ai. Throws FalNotConfiguredError if FAL_KEY
 * is missing (route should catch and refund/skip-charge), FalGenerationError
 * for provider-side failures.
 */
export async function generateVideo(opts: GenerateVideoOpts): Promise<GenerateVideoResult> {
  const key = process.env.FAL_KEY;
  if (!key) throw new FalNotConfiguredError();

  const duration = opts.durationSeconds ?? 5;
  const model = opts.imageUrl ? STANDARD_IMAGE_MODEL : STANDARD_TEXT_MODEL;

  // 1. Submit to queue
  const submitRes = await fetch(`${FAL_API_BASE}/${model}`, {
    method: "POST",
    headers: {
      "Authorization": `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: opts.prompt,
      ...(opts.imageUrl ? { image_url: opts.imageUrl } : {}),
      // Fal accepts num_frames; ~24fps so 5s≈120 frames, 10s≈240
      num_frames: duration === 10 ? 240 : 120,
    }),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text().catch(() => "");
    throw new FalGenerationError(
      `Fal.ai submit failed (${submitRes.status}): ${text.slice(0, 300)}`,
      String(submitRes.status),
    );
  }

  const submitJson = (await submitRes.json()) as { request_id?: string; status_url?: string; response_url?: string };
  const requestId = submitJson.request_id;
  const statusUrl = submitJson.status_url;
  const responseUrl = submitJson.response_url;
  if (!requestId || !statusUrl || !responseUrl) {
    throw new FalGenerationError("Fal.ai submit response missing request_id / status_url / response_url");
  }

  // 2. Poll status (Fal queue) — generations are typically 30–90s
  const startedAt = Date.now();
  const TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes
  while (Date.now() - startedAt < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 3000));
    const stRes = await fetch(statusUrl, {
      headers: { "Authorization": `Key ${key}` },
    });
    if (!stRes.ok) continue;
    const stJson = (await stRes.json()) as { status?: string };
    if (stJson.status === "COMPLETED") break;
    if (stJson.status === "FAILED") {
      throw new FalGenerationError(`Fal.ai generation failed (job ${requestId})`);
    }
  }

  // 3. Fetch final response
  const finalRes = await fetch(responseUrl, {
    headers: { "Authorization": `Key ${key}` },
  });
  if (!finalRes.ok) {
    throw new FalGenerationError(`Fal.ai response fetch failed (${finalRes.status}) for job ${requestId}`);
  }
  const finalJson = (await finalRes.json()) as { video?: { url?: string }; url?: string };
  const videoUrl = finalJson.video?.url || finalJson.url;
  if (!videoUrl) {
    throw new FalGenerationError(`Fal.ai response missing video URL for job ${requestId}`);
  }

  return { videoUrl, jobId: requestId };
}

/**
 * Run a quick text-moderation check on the user's prompt via OpenAI's free
 * moderation endpoint. Returns `{ flagged: true, reason }` if anything is
 * blocked so the route can refuse BEFORE spending a credit.
 *
 * Falls back to "not flagged" if OpenAI is not configured — we never block on
 * an infrastructure error, but we DO log it for ops.
 */
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

/**
 * Image moderation pre-check using OpenAI's omni-moderation-latest model
 * (which natively supports image_url input). Runs BEFORE we spend a Fal credit
 * so users uploading prohibited photos (e.g. CSAM, gore, real-person nudity)
 * are blocked at the upload step. Like text moderation we fail-open on infra
 * errors but log them.
 */
export async function moderateImage(imageUrl: string): Promise<{ flagged: boolean; reason?: string }> {
  return runOmniModeration([{ type: "image_url", image_url: { url: imageUrl } }], "Image");
}

type ModInput =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

// Fail-closed semantics: throws ModerationUnavailableError when OpenAI is
// not configured or the request fails. The route MUST refuse to spend Fal
// credits in that case (return 503) — silently skipping moderation would
// violate our AUP commitment to pre-screen uploaded media and prompts.
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
