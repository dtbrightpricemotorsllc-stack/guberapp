// ── ElevenLabs service wrapper ────────────────────────────────────────────────
// Centralizes all direct contact with the ElevenLabs API. The API key is read
// from process.env.ELEVENLABS_API_KEY here ONLY — callers never see the key,
// and it must never be included in logs, error messages, or client responses.

export type ElevenLabsErrorCode =
  | "missing_key"
  | "invalid_key"
  | "credit_limit"
  | "rate_limited"
  | "upstream_error";

export interface ElevenLabsError {
  ok: false;
  code: ElevenLabsErrorCode;
  httpStatus?: number;
  message: string;
}

export interface ElevenLabsSuccess {
  ok: true;
  response: Response;
}

export type ElevenLabsResult = ElevenLabsSuccess | ElevenLabsError;

export const DEFAULT_JAC_VOICE_ID = "9BWtsMINqrJLrRacOk9x";

/**
 * Classifies an ElevenLabs error response into a stable, loggable code.
 * Never includes the API key or raw request body in the returned message.
 */
function classifyError(status: number, bodyText: string): ElevenLabsError {
  let detailStatus: string | undefined;
  try {
    const parsed = JSON.parse(bodyText);
    detailStatus = parsed?.detail?.status ?? parsed?.status;
  } catch {
    // non-JSON body — fall through to status-code based classification
  }

  if (status === 401 || detailStatus === "invalid_api_key") {
    return { ok: false, code: "invalid_key", httpStatus: status, message: "ElevenLabs API key is invalid or unauthorized." };
  }
  if (detailStatus === "quota_exceeded" || status === 402) {
    return { ok: false, code: "credit_limit", httpStatus: status, message: "ElevenLabs credit limit reached." };
  }
  if (status === 429) {
    return { ok: false, code: "rate_limited", httpStatus: status, message: "ElevenLabs rate limit hit." };
  }
  return { ok: false, code: "upstream_error", httpStatus: status, message: `ElevenLabs upstream error (${status}).` };
}

// eleven_flash_v2_5 is ElevenLabs' lowest-latency model (~75ms model latency vs
// ~300-400ms for eleven_multilingual_v2), purpose-built for real-time
// conversational agents. Slight quality tradeoff vs multilingual_v2, but for a
// live voice assistant the latency win is worth far more than it costs.
export const DEFAULT_JAC_MODEL_ID = "eleven_flash_v2_5";

// Tuned for a warmer, more natural conversational read (vs. the flatter
// defaults previously used). Lower stability = more expressive/varied
// delivery; higher similarity_boost + style + speaker_boost = closer to the
// natural human reference recording instead of a flat TTS read.
export const DEFAULT_JAC_VOICE_SETTINGS = {
  stability: 0.42,
  similarity_boost: 0.85,
  style: 0.28,
  use_speaker_boost: true,
};

/**
 * Synthesizes speech via ElevenLabs' streaming endpoint. Returns either the
 * raw upstream Response (caller streams/pipes the body as it arrives — first
 * bytes are usable before the full utterance finishes generating) or a
 * classified error — never throws.
 */
export async function synthesizeSpeech(
  text: string,
  opts: { voiceId?: string; modelId?: string; stream?: boolean } = {}
): Promise<ElevenLabsResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { ok: false, code: "missing_key", message: "ELEVENLABS_API_KEY is not configured." };
  }

  const voiceId = opts.voiceId || process.env.JAC_ELEVENLABS_VOICE_ID || DEFAULT_JAC_VOICE_ID;
  const modelId = opts.modelId || process.env.JAC_ELEVENLABS_MODEL_ID || DEFAULT_JAC_MODEL_ID;
  const stream = opts.stream !== false;
  const path = stream ? "stream" : "";
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}${path ? `/${path}` : ""}?output_format=mp3_44100_64${stream ? "&optimize_streaming_latency=3" : ""}`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: DEFAULT_JAC_VOICE_SETTINGS,
      }),
    });

    if (!upstream.ok) {
      const bodyText = await upstream.text().catch(() => "");
      return classifyError(upstream.status, bodyText);
    }

    return { ok: true, response: upstream };
  } catch (e: any) {
    return { ok: false, code: "upstream_error", message: `ElevenLabs network error: ${e.message?.slice(0, 200) ?? "unknown"}` };
  }
}

/** HTTP status to return to our own clients for a given ElevenLabs error code. */
export function httpStatusForError(code: ElevenLabsErrorCode): number {
  switch (code) {
    case "missing_key": return 503;
    case "invalid_key": return 502;
    case "credit_limit": return 402;
    case "rate_limited": return 429;
    default: return 502;
  }
}

/** Rough cost estimates for admin display only — NOT used for billing logic. */
export function estimateCostUsd(type: "tts" | "stt", units: number): number {
  if (type === "tts") {
    // ElevenLabs Creator-tier list pricing ≈ $0.00018 / character (~$18 / 100k chars)
    return Number((units * 0.00018).toFixed(5));
  }
  // gpt-4o-mini-transcribe ≈ $0.003/minute; approximate 32KB/sec (16kHz mono PCM-ish) → sec = bytes/32000
  const approxSeconds = units / 32000;
  return Number(((approxSeconds / 60) * 0.003).toFixed(5));
}
