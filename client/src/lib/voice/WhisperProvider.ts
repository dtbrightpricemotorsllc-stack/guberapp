import type { STTProvider, STTCallback } from "./VoiceProvider";
import { getBestMimeType, transcribeBlob, isSttSentinel } from "./sttUtils";

/** Max recording duration before auto-stop (ms) */
const MAX_RECORD_MS = 30_000;

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
    //
    // IMPORTANT: Skip this on iOS/Safari. On iOS Safari and PWA, any `await`
    // before getUserMedia burns the user-gesture activation token. Once the
    // activation is consumed, getUserMedia silently fails with NotAllowedError
    // even when the user granted mic permission. We skip the pre-check on iOS
    // and let getUserMedia handle the NotAllowedError itself.
    const isIosSafari =
      typeof navigator !== "undefined" &&
      /iP(hone|ad|od)/i.test(navigator.userAgent);

    if (!isIosSafari && typeof navigator !== "undefined" && navigator.permissions) {
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
      // Request clean speech capture — noise suppression + echo cancellation +
      // auto gain markedly improve transcription accuracy in noisy/echoey
      // rooms. Browsers that don't honor a constraint just ignore it.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
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

    // On iOS/Safari, timeslice recording is unreliable — the browser may fire
    // ondataavailable with empty chunks and terminate the recorder early.
    // Use no timeslice on iOS/Safari; the final ondataavailable fires on stop.
    try {
      if (isIosSafari) {
        rec.start();
      } else {
        rec.start(250);
      }
    } catch {
      try { rec.start(); } catch { /* give up */ }
    }

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
      const result = await transcribeBlob(blob, mimeType);
      onResult(result);
    } finally {
      this._transcribing = false;
    }
  }
}

export { isSttSentinel };
