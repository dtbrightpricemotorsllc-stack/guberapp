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

    // NOTE: We intentionally do NOT pre-check navigator.permissions.query()
    // for microphone before calling getUserMedia. Two independent platforms
    // make this pre-check actively harmful:
    //  - iOS Safari/PWA: any `await` before getUserMedia burns the transient
    //    user-gesture activation token, so getUserMedia then silently fails
    //    with NotAllowedError even when mic permission was already granted.
    //  - Android Capacitor WebView: permissions.query({name:"microphone"})
    //    is known to misreport "denied" even when the OS-level app permission
    //    is actually granted (confirmed live: users with mic allowed in
    //    Android Settings still got __mic_denied__ from this pre-check for
    //    days). The WebView's permission-delegation state doesn't reliably
    //    track the real OS grant.
    // getUserMedia itself is the source of truth on every platform — its
    // NotAllowedError catch below already handles the genuinely-denied case,
    // so we go straight there instead of trusting the flaky pre-check.
    const isIosSafari =
      typeof navigator !== "undefined" &&
      /iP(hone|ad|od)/i.test(navigator.userAgent);

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
