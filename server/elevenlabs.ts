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

/**
 * Synthesizes speech via ElevenLabs. Returns either the raw upstream Response
 * (caller streams/pipes the body) or a classified error — never throws.
 */
export async function synthesizeSpeech(
  text: string,
  opts: { voiceId?: string } = {}
): Promise<ElevenLabsResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { ok: false, code: "missing_key", message: "ELEVENLABS_API_KEY is not configured." };
  }

  const voiceId = opts.voiceId || process.env.JAC_ELEVENLABS_VOICE_ID || DEFAULT_JAC_VOICE_ID;

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.55, similarity_boost: 0.70, style: 0.08, use_speaker_boost: false },
        }),
      }
    );

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
