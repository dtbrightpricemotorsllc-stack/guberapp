/**
 * ConversationEngine — "Live Conversation Mode" for JAC.
 *
 * Keeps a single mic stream open and runs a lightweight, local (no extra
 * API cost) voice-activity detector so the user never has to tap a mic
 * button: JAC listens continuously, transcribes each utterance via the
 * existing /api/jac/stt endpoint, and — while she's speaking — keeps
 * listening so the user can talk over her and interrupt instantly.
 *
 * This intentionally does NOT use ElevenLabs' Conversational AI Agents
 * platform (per-minute billing, separate managed pipeline). It reuses the
 * same cheap per-character TTS / per-minute Whisper STT stack JAC already
 * uses, just orchestrated continuously instead of push-to-talk.
 */

import { getBestMimeType, transcribeBlob, isSttSentinel } from "./sttUtils";
import { cancelAllJacAudio, isJacSpeaking } from "../jac-tts";

export type ConversationState = "idle" | "listening" | "recording" | "processing" | "speaking";

export interface ConversationEngineCallbacks {
  /** Fires with the transcribed text once an utterance is finalized. */
  onUtterance: (text: string) => void;
  /** Fires whenever the internal state changes — drive UI status text from this. */
  onStateChange?: (state: ConversationState) => void;
  /** Fires on unrecoverable mic errors (denied permission, no support, etc). */
  onError?: (reason: "mic_denied" | "mic_error" | "unsupported") => void;
}

// Voice-activity detection tuning. These are local heuristics (RMS-based),
// not network calls, so they cost nothing — they just decide when to start/
// stop recording and when to treat playback-time noise as an interruption.
const VAD_CHECK_INTERVAL_MS = 60;
const SPEECH_RMS_THRESHOLD = 0.016; // while listening for a fresh utterance (slightly more sensitive so trailing-off words at end of a sentence still register as speech)
const INTERRUPT_RMS_THRESHOLD = 0.045; // higher bar while JAC is speaking (avoid self-echo false triggers)
const SPEECH_ONSET_MS = 150; // sustained volume needed before we call it "speech started"
const INTERRUPT_SUSTAIN_MS = 220; // sustained volume needed before we call it a real interruption
// Silence needed before we finalize an utterance. 700ms was too aggressive —
// it cut people off during completely normal mid-sentence pauses (taking a
// breath, thinking of a word, "um..."). 1600ms gives people room to breathe
// and think without JAC yet cutting them off, while still feeling responsive
// once they're actually done.
const SILENCE_END_MS = 1600;
const PLAYBACK_IGNORE_MS = 250; // ignore VAD right as TTS playback starts (ramp-up/echo)
const MAX_UTTERANCE_MS = 30_000;

export class ConversationEngine {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private vadTimer: ReturnType<typeof setInterval> | null = null;

  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mimeType = "";

  private state: ConversationState = "idle";
  private speechAboveThresholdSince: number | null = null;
  private silenceSince: number | null = null;
  private speakingStartedAt: number | null = null;
  private utteranceStartedAt: number | null = null;
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;

  // Android audio routing: releasing the mic stream while JAC speaks
  // lets Android's AudioManager leave MODE_IN_COMMUNICATION so the TTS
  // audio routes to the loudspeaker instead of the earpiece.
  private _micConstraints: MediaStreamConstraints["audio"] = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  private _reacquiringMic = false;

  private callbacks: ConversationEngineCallbacks;

  constructor(callbacks: ConversationEngineCallbacks) {
    this.callbacks = callbacks;
  }

  isActive(): boolean {
    return this.state !== "idle";
  }

  getState(): ConversationState {
    return this.state;
  }

  private setState(next: ConversationState) {
    if (this.state === next) return;
    this.state = next;
    this.callbacks.onStateChange?.(next);
  }

  /** Starts the persistent mic stream + VAD loop. Call from a user-gesture handler. */
  async start(): Promise<void> {
    if (this.state !== "idle") return;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      this.callbacks.onError?.("unsupported");
      return;
    }

    let stream: MediaStream;
    try {
      // Race getUserMedia against an 8-second timeout. Samsung Browser (and some
      // Android WebViews) can hang indefinitely on getUserMedia with no error or
      // resolution, leaving the mic button spinner stuck forever.
      const micTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("getUserMedia timeout")), 8000)
      );
      stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: this._micConstraints }),
        micTimeout,
      ]);
    } catch (err: any) {
      this.callbacks.onError?.(err?.name === "NotAllowedError" ? "mic_denied" : "mic_error");
      return;
    }

    this.stream = stream;
    this.mimeType = getBestMimeType();

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      // iOS WebKit can start the context "suspended" if there was any async
      // gap (e.g. the getUserMedia await above) between the user gesture and
      // context creation. If we don't resume it here, getByteTimeDomainData
      // silently returns dead-flat data forever and the VAD never fires —
      // Live Conversation Mode looks "on" but never hears anything on iOS.
      if (this.audioCtx.state === "suspended") {
        try { await this.audioCtx.resume(); } catch { /* best effort */ }
      }
      const source = this.audioCtx.createMediaStreamSource(stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.2;
      source.connect(this.analyser);
      this.dataArray = new Uint8Array(this.analyser.fftSize);
    } catch (e) {
      console.error("[ConversationEngine] AudioContext setup failed", e);
      this.teardownStream();
      this.callbacks.onError?.("mic_error");
      return;
    }

    this.setState("listening");
    this.vadTimer = setInterval(() => this.tick(), VAD_CHECK_INTERVAL_MS);
  }

  /** Fully stops listening, tears down the mic stream, and returns to idle. */
  stop(): void {
    if (this.vadTimer) { clearInterval(this.vadTimer); this.vadTimer = null; }
    if (this.autoStopTimer) { clearTimeout(this.autoStopTimer); this.autoStopTimer = null; }
    try { this.recorder?.stop(); } catch {}
    this.recorder = null;
    this.chunks = [];
    this.speechAboveThresholdSince = null;
    this.silenceSince = null;
    this.speakingStartedAt = null;
    this.utteranceStartedAt = null;
    this.teardownStream();
    this.setState("idle");
  }

  /**
   * Call this the moment JAC's TTS reply starts playing (from onStart callback).
   * The mic is released earlier (in finishRecording → "processing") so Android
   * has already had ~400-800 ms to switch audio routing back to the loudspeaker
   * before the first byte of audio plays.
   */
  notifySpeakingStarted(): void {
    if (this.state === "idle") return;
    this.speakingStartedAt = Date.now();
    this.speechAboveThresholdSince = null;
    this.setState("speaking");
    // Safety net: release mic if somehow still held (e.g. greeting TTS
    // triggered without going through the processing state).
    if (this.stream) this._releaseMic();
  }

  /** Call this when JAC's TTS reply finishes (naturally, not via interruption). */
  notifySpeakingEnded(): void {
    // Also accept "processing": if TTS fails before audio starts, onStart
    // never fires so notifySpeakingStarted() is never called — engine stays
    // stuck in "processing" forever.  Accepting it here lets the .catch()
    // path in speak() unstick the spinner in that case.
    if (this.state !== "speaking" && this.state !== "processing") return;
    this.speakingStartedAt = null;
    this.setState("listening");
    // Re-acquire mic so we can hear the next utterance.
    void this._reacquireMic();
  }

  /**
   * Stop all mic tracks without tearing down the engine.
   * Also closes the analyser AudioContext so Android fully releases audio focus.
   */
  private _releaseMic(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try { this.audioCtx?.close(); } catch {}
    this.audioCtx = null;
    this.analyser = null;
    this.dataArray = null;
  }

  /**
   * Re-open the mic stream after TTS finishes.
   * Idempotent — if already re-acquiring or already has a stream, no-op.
   */
  private async _reacquireMic(): Promise<void> {
    if (this._reacquiringMic || this.stream || this.state === "idle") return;
    this._reacquiringMic = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: this._micConstraints });
      // Engine may have been stopped while we awaited.
      if (this.state === "idle") {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      // Re-wire the analyser for VAD.
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass() as AudioContext;
      if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch {}
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);
      this.audioCtx = ctx;
      this.analyser = analyser;
      this.dataArray = new Uint8Array(analyser.fftSize);
    } catch {
      // Mic re-acquisition failed (permission revoked, hardware busy, etc.).
      // Stay in listening state but without VAD — the VAD tick will just read
      // RMS=0 and never trigger recording, which is safe.
    } finally {
      this._reacquiringMic = false;
    }
  }

  private teardownStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try { this.audioCtx?.close(); } catch {}
    this.audioCtx = null;
    this.analyser = null;
    this.dataArray = null;
  }

  private getRms(): number {
    if (!this.analyser || !this.dataArray) return 0;
    this.analyser.getByteTimeDomainData(this.dataArray);
    let sumSquares = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const normalized = (this.dataArray[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    return Math.sqrt(sumSquares / this.dataArray.length);
  }

  private tick(): void {
    // Safety net: iOS can suspend the AudioContext again if the tab/app
    // briefly backgrounds (app switcher, incoming call, lock screen) even
    // after our initial resume() in start(). Without this the VAD would go
    // permanently silent until the user manually toggles the mode off/on.
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }

    const rms = this.getRms();
    const now = Date.now();

    if (this.state === "listening") {
      this.handleListeningTick(rms, now);
    } else if (this.state === "recording") {
      this.handleRecordingTick(rms, now);
    } else if (this.state === "speaking") {
      this.handleSpeakingTick(rms, now);
    }
    // "processing" — JAC is waiting on the network round-trip; VAD is idle.
  }

  private handleListeningTick(rms: number, now: number): void {
    if (rms >= SPEECH_RMS_THRESHOLD) {
      if (this.speechAboveThresholdSince === null) this.speechAboveThresholdSince = now;
      if (now - this.speechAboveThresholdSince >= SPEECH_ONSET_MS) {
        this.speechAboveThresholdSince = null;
        this.beginRecording();
      }
    } else {
      this.speechAboveThresholdSince = null;
    }
  }

  private handleRecordingTick(rms: number, now: number): void {
    if (this.utteranceStartedAt && now - this.utteranceStartedAt >= MAX_UTTERANCE_MS) {
      this.finishRecording();
      return;
    }
    if (rms >= SPEECH_RMS_THRESHOLD) {
      this.silenceSince = null;
    } else {
      if (this.silenceSince === null) this.silenceSince = now;
      if (now - this.silenceSince >= SILENCE_END_MS) {
        this.finishRecording();
      }
    }
  }

  private handleSpeakingTick(rms: number, now: number): void {
    if (!this.speakingStartedAt || now - this.speakingStartedAt < PLAYBACK_IGNORE_MS) return;

    if (rms >= INTERRUPT_RMS_THRESHOLD) {
      if (this.speechAboveThresholdSince === null) this.speechAboveThresholdSince = now;
      if (now - this.speechAboveThresholdSince >= INTERRUPT_SUSTAIN_MS) {
        this.speechAboveThresholdSince = null;
        // Real interruption: kill JAC's audio immediately and start capturing
        // what the user is saying right now.
        cancelAllJacAudio();
        this.speakingStartedAt = null;
        this.beginRecording();
      }
    } else {
      this.speechAboveThresholdSince = null;
    }
  }

  private beginRecording(): void {
    if (!this.stream) return;
    this.chunks = [];
    this.silenceSince = null;
    this.utteranceStartedAt = Date.now();

    let rec: MediaRecorder;
    try {
      rec = this.mimeType
        ? new MediaRecorder(this.stream, { mimeType: this.mimeType })
        : new MediaRecorder(this.stream);
    } catch {
      try {
        rec = new MediaRecorder(this.stream);
      } catch (e) {
        console.error("[ConversationEngine] MediaRecorder init failed", e);
        return;
      }
    }
    this.mimeType = rec.mimeType || this.mimeType || "audio/webm";

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    rec.onstop = () => this.transcribeAndDispatch();

    try {
      rec.start(250);
    } catch {
      try { rec.start(); } catch { /* give up on this utterance */ }
    }

    this.recorder = rec;
    this.setState("recording");
  }

  private finishRecording(): void {
    if (this.state !== "recording") return;
    try { this.recorder?.stop(); } catch {}
    this.recorder = null;
    this.setState("processing");
    // Release the mic NOW so Android's AudioManager has ~400-800 ms to
    // switch from MODE_IN_COMMUNICATION (earpiece) back to MODE_NORMAL
    // (loudspeaker) before JAC's TTS audio starts playing.
    this._releaseMic();
  }

  private async transcribeAndDispatch(): Promise<void> {
    const chunks = this.chunks;
    const mimeType = this.mimeType;
    this.chunks = [];

    if (!chunks.length) {
      // Nothing meaningful captured — go back to listening rather than
      // spamming the STT endpoint with an empty request.
      if (this.state !== "idle") {
        this.setState("listening");
        void this._reacquireMic(); // mic was released in finishRecording
      }
      return;
    }

    const blob = new Blob(chunks, { type: mimeType });
    const result = await transcribeBlob(blob, mimeType);

    if (this.state === "idle") return; // engine was stopped mid-transcription

    if (isSttSentinel(result)) {
      if (result === "__whisper_empty__") {
        this.setState("listening");
        void this._reacquireMic(); // mic was released in finishRecording
        return;
      }
      // __mic_denied__ / __mic_error__ / __whisper_error__ — surface once
      // and fall back to plain listening rather than looping errors.
      this.callbacks.onError?.(result === "__mic_denied__" ? "mic_denied" : "mic_error");
      this.setState("listening");
      void this._reacquireMic();
      return;
    }

    this.callbacks.onUtterance(result);
    // Caller drives the "speaking" transition via notifySpeakingStarted()
    // once JAC's reply actually starts playing; until then we stay in
    // "processing" so the VAD doesn't fire on the network round-trip.
    // Mic stays released until notifySpeakingEnded() → _reacquireMic().
  }
}

export { isJacSpeaking };
