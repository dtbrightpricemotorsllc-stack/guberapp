/**
 * Auto-summarize POV (hands-free) proof videos.
 *
 * Hands-Free clips can be up to 15 minutes long. Hirers won't watch all of it.
 * This module extracts evenly-spaced thumbnails from a Cloudinary-hosted clip,
 * sends them to OpenAI vision along with the job's proof checklist, and asks
 * the model to map each checklist item to the timestamp where it appears in
 * the footage. The result is stored on `proof_submissions.pov_summary` and
 * rendered as click-to-seek "scene chips" in the hirer review card.
 *
 * Gating (per task-458): generation is gated on FAL_KEY presence so this
 * follows the same dark-launch pattern as the AI Studio. We additionally
 * require OpenAI vision to be configured. If either is missing we set
 * status="skipped" and never enqueue the call — no charges, no errors.
 */
import OpenAI from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { isFalConfigured } from "./fal";
import { storage } from "./storage";
import type { ProofSubmission, proofSubmissions } from "@shared/schema";

type ProofSummaryPatch = Pick<typeof proofSubmissions.$inferInsert, "povSummary">;

const MODEL = "gpt-5.1";
// Sample at most this many frames — keeps the vision call fast & cheap. With
// a 15-min clip and 10 samples we get one frame every ~90s which is plenty
// to anchor 4–8 checklist items.
const MAX_SAMPLES = 10;
const MIN_SAMPLES = 4;

export type PovChecklistInput = {
  label: string;
  instruction?: string | null;
};

export type PovSummaryItem = {
  label: string;
  instruction?: string;
  matched: boolean;
  timestampSec?: number;
  thumbnailUrl?: string;
  note?: string;
};

export type PovSummary = {
  status: "pending" | "ready" | "failed" | "skipped";
  durationSec?: number;
  generatedAt?: string;
  modelVersion?: string;
  items?: PovSummaryItem[];
  error?: string;
};

/**
 * Build a Cloudinary still-frame URL from a hosted .mp4 by injecting a
 * `so_<seconds>` transformation and rewriting the extension to .jpg.
 *
 * Input:  https://res.cloudinary.com/<cloud>/video/upload/v123/guber-proof/foo.mp4
 * Output: https://res.cloudinary.com/<cloud>/video/upload/so_42,w_640,h_360,c_fill,q_auto,f_jpg/v123/guber-proof/foo.jpg
 *
 * Returns null if the URL doesn't look like a Cloudinary video upload — in
 * that case we skip summarization rather than guessing.
 */
export function buildThumbnailUrl(videoUrl: string, atSec: number): string | null {
  const marker = "/video/upload/";
  const i = videoUrl.indexOf(marker);
  if (i < 0) return null;
  const head = videoUrl.slice(0, i + marker.length);
  let tail = videoUrl.slice(i + marker.length);
  // Drop trailing extension and replace with .jpg
  tail = tail.replace(/\.[a-z0-9]+$/i, ".jpg");
  const rounded = Math.max(0, Math.round(atSec * 10) / 10);
  const tx = `so_${rounded},w_640,h_360,c_fill,q_auto,f_jpg`;
  return `${head}${tx}/${tail}`;
}

function pickSampleSeconds(durationSec: number): number[] {
  const safeDur = Math.max(1, Math.floor(durationSec));
  const target = Math.min(MAX_SAMPLES, Math.max(MIN_SAMPLES, Math.ceil(safeDur / 60)));
  const out: number[] = [];
  // Skip the very first second (often a hand covering the lens) and the very
  // last (often the worker reaching to stop). Sample evenly in between.
  const start = Math.min(1, safeDur * 0.05);
  const end = Math.max(safeDur - 1, safeDur * 0.95);
  if (target === 1) return [Math.round(safeDur / 2)];
  for (let k = 0; k < target; k++) {
    const t = start + ((end - start) * k) / (target - 1);
    out.push(Math.round(t));
  }
  // Dedupe (short clips can collapse to the same int) while preserving order
  return Array.from(new Set(out));
}

const SYSTEM_PROMPT = `You are reviewing a sequence of still frames sampled from a worker's hands-free POV proof video for a Verify & Inspect job. Each frame is captioned with the timestamp (in seconds) at which it was taken.

You will be given a checklist of items the worker was supposed to capture. For each checklist item, decide which single frame BEST shows that item, and report the timestamp of that frame. If no frame plausibly shows the item, mark it as not matched.

Return ONLY a JSON object (no markdown fences) with this exact shape:
{
  "items": [
    {
      "label": string,           // exact checklist label you were given
      "matched": boolean,        // true if at least one frame shows this item
      "timestampSec": number | null,  // seconds into the video, matching one of the frame captions exactly
      "note": string             // 6-12 words describing what you saw, or why no match
    }
  ]
}

Rules:
- Use ONLY timestamps from the frame captions provided.
- Be conservative: if you're not confident, set matched=false and timestampSec=null.
- Notes must be terse and factual ("front bumper visible, no damage"), never speculative.
- Return one entry per checklist item, in the order given.`;

/**
 * Run the OpenAI vision summarization. Returns a populated `PovSummary` with
 * status="ready" on success, "failed" on error, or "skipped" if not configured.
 *
 * This function NEVER throws — failures land in `summary.error` so callers
 * can persist the failure state and surface it in support tooling.
 */
export async function summarizePovVideo(opts: {
  videoUrl: string;
  durationSec: number;
  checklist: PovChecklistInput[];
}): Promise<PovSummary> {
  const { videoUrl, durationSec, checklist } = opts;

  // Gating: dark launch alongside the rest of the AI Studio. No FAL_KEY ⇒
  // no spend, no retries, no surprise vision invoices.
  if (!isFalConfigured()) {
    return { status: "skipped", error: "FAL_KEY not configured" };
  }
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    return { status: "skipped", error: "OpenAI vision not configured" };
  }
  if (!checklist || checklist.length === 0) {
    return { status: "skipped", error: "no checklist items for this job" };
  }
  if (!durationSec || durationSec < 2) {
    return { status: "skipped", error: "clip too short to summarize" };
  }

  const sampleSecs = pickSampleSeconds(durationSec);
  const frames: { sec: number; url: string }[] = [];
  for (const sec of sampleSecs) {
    const url = buildThumbnailUrl(videoUrl, sec);
    if (url) frames.push({ sec, url });
  }
  if (frames.length === 0) {
    return { status: "skipped", error: "video URL not transformable to thumbnails" };
  }

  const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  const checklistText = checklist
    .map((c, i) => `${i + 1}. ${c.label}${c.instruction ? ` — ${c.instruction}` : ""}`)
    .join("\n");

  const userContent: ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Checklist for this job (return one entry per item, in this order):\n${checklistText}\n\nFrames follow, each captioned with its timestamp.`,
    },
  ];
  for (const f of frames) {
    userContent.push({ type: "text", text: `Frame at ${f.sec}s:` });
    userContent.push({ type: "image_url", image_url: { url: f.url } });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      max_completion_tokens: 800,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    if (!raw) {
      return { status: "failed", error: "empty model response", durationSec, modelVersion: MODEL };
    }

    let parsed: { items?: Array<{ label?: string; matched?: boolean; timestampSec?: number | null; note?: string }> };
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "parse error";
      return { status: "failed", error: `model returned non-JSON: ${msg}`, durationSec, modelVersion: MODEL };
    }

    const allowedSecs = new Set(frames.map((f) => f.sec));
    const items: PovSummaryItem[] = checklist.map((c, idx) => {
      const raw = parsed.items?.[idx];
      const labelMatch = raw?.label && raw.label.trim().toLowerCase() === c.label.trim().toLowerCase();
      const found = labelMatch ? raw : parsed.items?.find((p) => p?.label?.trim().toLowerCase() === c.label.trim().toLowerCase());
      const ts = found?.timestampSec;
      const matched = !!found?.matched && typeof ts === "number" && allowedSecs.has(Math.round(ts));
      const finalSec = matched ? Math.round(ts as number) : undefined;
      return {
        label: c.label,
        instruction: c.instruction || undefined,
        matched,
        timestampSec: finalSec,
        thumbnailUrl: finalSec != null ? buildThumbnailUrl(videoUrl, finalSec) || undefined : undefined,
        note: typeof found?.note === "string" ? found.note.slice(0, 200) : undefined,
      };
    });

    return {
      status: "ready",
      durationSec,
      generatedAt: new Date().toISOString(),
      modelVersion: MODEL,
      items,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "vision call failed";
    return {
      status: "failed",
      error: msg.slice(0, 300),
      durationSec,
      modelVersion: MODEL,
    };
  }
}

/**
 * Fire-and-forget wrapper used by the wearable upload route. Persists a
 * "pending" marker immediately so the UI can render a spinner, then runs
 * the vision call in the background and writes the final result. All errors
 * are caught — the proof submission itself must never fail because the
 * summary did.
 */
export async function summarizePovVideoAsync(opts: {
  proofId: number;
  jobId: number;
  videoUrl: string;
  durationSec: number;
}): Promise<void> {
  const { proofId, jobId, videoUrl, durationSec } = opts;
  try {
    const job = await storage.getJob(jobId);
    if (!job) return;
    let checklist: PovChecklistInput[] = [];
    if (job.proofTemplateId) {
      const items = await storage.getProofChecklistItems(job.proofTemplateId);
      checklist = items.map((i) => ({ label: i.label, instruction: i.instruction || undefined }));
    } else if (job.catalogServiceTypeName) {
      const allSTs = await storage.getCatalogServiceTypes();
      const matched = allSTs.find((st) => st.name === job.catalogServiceTypeName);
      if (matched?.proofTemplateId) {
        const items = await storage.getProofChecklistItems(matched.proofTemplateId);
        checklist = items.map((i) => ({ label: i.label, instruction: i.instruction || undefined }));
      }
    }

    const summary = await summarizePovVideo({ videoUrl, durationSec, checklist });
    const patch: ProofSummaryPatch = { povSummary: summary };
    await storage.updateProofSubmission(proofId, patch);
    console.log(`[GUBER][pov-summary] proof=${proofId} job=${jobId} status=${summary.status} matched=${summary.items?.filter((i) => i.matched).length ?? 0}/${summary.items?.length ?? 0}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "background failure";
    console.error(`[GUBER][pov-summary] proof=${proofId} background failure:`, msg);
    try {
      const patch: ProofSummaryPatch = {
        povSummary: { status: "failed", error: msg.slice(0, 300) },
      };
      await storage.updateProofSubmission(proofId, patch);
    } catch {}
  }
}

/**
 * Synchronously stamp a proof row with `status: "pending"` BEFORE the upload
 * route returns. This guarantees the hirer's first fetch sees a pending
 * marker so the UI can both render the "Analyzing footage…" spinner and
 * activate its 5-second poll loop — eliminating a race where the hirer
 * could open the proof card between the upload response and the background
 * worker's first DB write.
 */
export async function markPovSummaryPending(proofId: number, durationSec: number): Promise<void> {
  const patch: ProofSummaryPatch = {
    povSummary: { status: "pending", durationSec },
  };
  try {
    await storage.updateProofSubmission(proofId, patch);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[GUBER][pov-summary] failed to mark pending for proof=${proofId}:`, msg);
  }
}
