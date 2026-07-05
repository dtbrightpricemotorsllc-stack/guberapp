/**
 * Shared speech-to-text helpers used by both the tap-to-talk WhisperProvider
 * and the always-listening ConversationEngine. Keeping this in one place
 * avoids the two providers drifting out of sync on MIME handling or the
 * /api/jac/stt contract.
 */

/**
 * Returns the best MIME type for the current platform, or "" if none of the
 * known types are supported (caller should create MediaRecorder without
 * specifying a mimeType and let the browser choose).
 *
 * Priority order:
 *  1. audio/webm;codecs=opus  — Chrome / Android / desktop
 *  2. audio/webm               — Chrome fallback
 *  3. audio/mp4;codecs=mp4a.40.2 — iOS WKWebView (Capacitor)
 *  4. audio/mp4                — iOS fallback
 *  5. audio/ogg;codecs=opus   — Firefox
 */
export function getBestMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

/** Safe base64 encode that works on large buffers (no reduce/call-stack risk). */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

/**
 * Sends a recorded audio blob to the /api/jac/stt endpoint and returns the
 * transcribed text, or one of the `__whisper_*` / `__mic_*` sentinel strings
 * on failure/empty result (matching WhisperProvider's existing contract).
 */
export async function transcribeBlob(blob: Blob, mimeType: string): Promise<string> {
  if (!blob.size) return "__whisper_empty__";
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);

    const res = await fetch("/api/jac/stt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioBase64: base64, mimeType }),
    });

    if (!res.ok) {
      console.warn("[sttUtils] STT server error", res.status);
      return "__whisper_error__";
    }

    const data = (await res.json()) as { text?: string };
    const text = (data.text ?? "").trim();
    return text || "__whisper_empty__";
  } catch (e) {
    console.error("[sttUtils] transcription error", e);
    return "__whisper_error__";
  }
}

/** True if the given transcription result is a sentinel (error/empty/denied), not real text. */
export function isSttSentinel(text: string): boolean {
  return text.startsWith("__") && text.endsWith("__");
}
