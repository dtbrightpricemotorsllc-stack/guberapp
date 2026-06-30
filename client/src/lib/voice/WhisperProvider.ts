import type { STTProvider, STTCallback } from "./VoiceProvider";

/** Max recording duration before auto-stop (ms) */
const MAX_RECORD_MS = 30_000;

function getBestMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "audio/webm";
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
    const mimeType = getBestMimeType();
    const rec = new MediaRecorder(stream, { mimeType });

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) this._chunks.push(e.data);
    };

    rec.onstop = () => { this._finalize(mimeType); };

    rec.start(250);
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

  private async _finalize(mimeType: string): Promise<void> {
    const chunks = this._chunks;
    this._chunks = [];
    this._recorder = null;

    if (!chunks.length || !this._onResult) return;
    const onResult = this._onResult;
    this._transcribing = true;

    try {
      const blob = new Blob(chunks, { type: mimeType });
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((acc, byte) => acc + String.fromCharCode(byte), "")
      );

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
