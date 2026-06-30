import type { STTProvider, STTCallback } from "./VoiceProvider";

/** Max recording duration before auto-stop (ms) */
const MAX_RECORD_MS = 30_000;

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
function getBestMimeType(): string {
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
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export class WhisperProvider implements STTProvider {
  readonly name = "whisper";
  private _recorder: MediaRecorder | null = null;
  private _stream: MediaStream | null = null;
  private _chunks: Blob[] = [];
  private _listening = false;
  private _transcribing = false;
  private _autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  private _onResult: STTCallback | null = null;
  private _actualMimeType = "";

  isSupported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined"
    );
  }

  isListening(): boolean { return this._listening; }
  isTranscribing(): boolean { return this._transcribing; }

  async startListening(onResult: STTCallback): Promise<void> {
    if (this._listening || this._transcribing) return;
    this._onResult = onResult;
    this._chunks = [];
    this._actualMimeType = "";

    // Pre-check permission state so we can distinguish "needs dialog" from
    // "hard denied" — avoids a confusing silent failure on Android.
    if (typeof navigator !== "undefined" && navigator.permissions) {
      try {
        const perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (perm.state === "denied") {
          onResult("__mic_denied__");
          return;
        }
      } catch {
        // permissions.query not supported on this platform — fall through
      }
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      const msg = err?.name === "NotAllowedError" ? "__mic_denied__" : "__mic_error__";
      onResult(msg);
      return;
    }

    this._stream = stream;

    // Try with the best supported MIME type first; fall back to no mimeType
    // (browser-default) if the preferred type isn't accepted.
    let rec: MediaRecorder;
    const preferredType = getBestMimeType();
    try {
      rec = preferredType
        ? new MediaRecorder(stream, { mimeType: preferredType })
        : new MediaRecorder(stream);
    } catch {
      try {
        rec = new MediaRecorder(stream);
      } catch (e2) {
        stream.getTracks().forEach((t) => t.stop());
        this._stream = null;
        onResult("__mic_error__");
        return;
      }
    }

    // Use the actual MIME type the recorder chose (may differ from preferred)
    this._actualMimeType = rec.mimeType || preferredType || "audio/webm";

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) this._chunks.push(e.data);
    };

    rec.onstop = () => { this._finalize(); };

    // timeslice 250ms — collects chunks during recording.
    // Some iOS versions only fire ondataavailable on stop; that's fine because
    // _finalize reads this._chunks which gets the single on-stop chunk too.
    try { rec.start(250); } catch { rec.start(); }

    this._recorder = rec;
    this._listening = true;
    this._autoStopTimer = setTimeout(() => this.stopListening(), MAX_RECORD_MS);
  }

  stopListening(): void {
    if (this._autoStopTimer) { clearTimeout(this._autoStopTimer); this._autoStopTimer = null; }
    if (!this._listening) return;
    this._listening = false;
    try { this._recorder?.stop(); } catch {}
    this._stream?.getTracks().forEach((t) => t.stop());
    this._stream = null;
  }

  private async _finalize(): Promise<void> {
    const chunks = this._chunks;
    const mimeType = this._actualMimeType;
    this._chunks = [];
    this._recorder = null;

    if (!chunks.length || !this._onResult) {
      // No audio data captured (e.g. user tapped mic and immediately stopped)
      if (this._onResult) this._onResult("__whisper_empty__");
      return;
    }

    const onResult = this._onResult;
    this._transcribing = true;

    try {
      const blob = new Blob(chunks, { type: mimeType });
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);

      const res = await fetch("/api/jac/stt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: base64, mimeType }),
      });

      if (!res.ok) {
        console.warn("[WhisperProvider] STT server error", res.status);
        onResult("__whisper_error__");
        return;
      }

      const data = await res.json() as { text?: string };
      const text = (data.text ?? "").trim();
      if (text) onResult(text);
      else onResult("__whisper_empty__");
    } catch (e) {
      console.error("[WhisperProvider] transcription error", e);
      onResult("__whisper_error__");
    } finally {
      this._transcribing = false;
    }
  }
}
