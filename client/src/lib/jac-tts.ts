/**
 * JAC TTS — ElevenLabs via the server proxy.
 *
 * JAC always speaks with the approved ElevenLabs voice. Static clips and
 * browser speech are intentionally not fallbacks: either could make JAC sound
 * like a different assistant.
 */

import { isIOS } from "./platform";
import { registerJacAnalyser, unlockJacAnalyserContext } from "./jac-audio-analyser";

/** Pronunciation rewrites applied before any TTS call */
export function normalizeTtsText(text: string): string {
  return text
    .replace(/[*_#`[\]]/g, "")
    .replace(/(?<!\d)(\d{5})(?!\d)/g, (_, z) => z.split("").join(" "))
    .replace(/\bDay[-\s]?1\s+OG\b/gi, "Day One Oh Gee")
    .replace(/\bOG\b/g, "Oh Gee")
    .replace(/\bJAC\b/g, "Jack")
    .replace(/\bGUBER\b/gi, "Goober")
    .slice(0, 800);
}

let _currentAudio: HTMLAudioElement | null = null;
let _audioUnlocked = false;
let _currentAbort: AbortController | null = null;

// ── ConvAI ownership flag ──────────────────────────────────────────────────
// When ElevenLabs ConvAI is active it is the sole audio owner.
// jacSpeak() no-ops while this is true, preventing direct TTS from firing
// alongside the ConvAI voice.
let _convaiActive = false;
export function setJacConvaiActive(active: boolean): void {
  _convaiActive = active;
  if (active) cancelAllJacAudio(); // evict any in-flight TTS immediately
}

// AudioContext — routes to the loudspeaker on iOS instead of the earpiece
// (the default for <audio> elements). Created inside the first user gesture
// via unlockAudioContext() so iOS allows it.
let _audioCtx: AudioContext | null = null;
let _audioCtxSource: AudioBufferSourceNode | null = null;

// ── User-controllable volume ───────────────────────────────────────────────
// Stored in localStorage as "jac_volume" (float 0.5 – 6.0).
// Gain pipeline: source → GainNode → Limiter → destination.
// Gain goes FIRST so we amplify everything; the limiter then
// catches only true peaks to prevent clipping — NOT an aggressive hard limiter.
// v4 key — clears 3.0/8.0 savings; no limiter so higher gain stays clean.
const JAC_VOLUME_KEY = "jac_volume_v4";
const JAC_VOLUME_DEFAULT = 2.0;
const JAC_VOLUME_MIN = 0.5;
const JAC_VOLUME_MAX = 6.0;

function _loadVolume(): number {
  try {
    const v = parseFloat(localStorage.getItem(JAC_VOLUME_KEY) ?? "");
    if (!isNaN(v) && v >= JAC_VOLUME_MIN && v <= JAC_VOLUME_MAX) return v;
  } catch {}
  return JAC_VOLUME_DEFAULT;
}

let _jacVolume: number = JAC_VOLUME_DEFAULT;
// Load persisted value once on module init (browser only).
if (typeof window !== "undefined") {
  _jacVolume = _loadVolume();
}

export function getJacVolume(): number { return _jacVolume; }

export function setJacVolume(v: number) {
  _jacVolume = Math.max(JAC_VOLUME_MIN, Math.min(JAC_VOLUME_MAX, v));
  try { localStorage.setItem(JAC_VOLUME_KEY, String(_jacVolume)); } catch {}
}

export const JAC_VOLUME_BOUNDS = { min: JAC_VOLUME_MIN, max: JAC_VOLUME_MAX, default: JAC_VOLUME_DEFAULT };

export function cancelElevenLabsAudio() {
  if (_currentAbort) {
    try { _currentAbort.abort(); } catch {}
    _currentAbort = null;
  }
  if (_audioCtxSource) {
    try { _audioCtxSource.stop(); } catch {}
    _audioCtxSource = null;
  }
  if (_currentAudio) {
    _currentAudio.pause();
    _currentAudio.src = "";
    _currentAudio = null;
  }
}

/**
 * True while JAC is actively producing direct ElevenLabs audio. Used by the
 * live-conversation engine to know when interruption should be armed.
 */
export function isJacSpeaking(): boolean {
  if (_audioCtxSource) return true;
  if (_currentAudio && !_currentAudio.paused) return true;
  return false;
}

/**
 * Call this on ANY user interaction (button tap, send, mic press) before speaking.
 * Unlocks audio playback on all platforms (mobile browsers, PWA, native Capacitor).
 */
export function unlockAudioContext() {
  // Unlock the mouth-animation analyser context inside this same gesture so
  // the ConvAI WebRTC audio tap works on gesture-gated browsers (iOS Safari).
  unlockJacAnalyserContext();
  // Create / resume the Web Audio API context inside this user gesture.
  // AudioContext routes audio through the main speaker on all platforms;
  // raw <audio> elements can default to earpiece routing on some phones.
  // Must be called synchronously inside the gesture handler — browsers block
  // AudioContext creation/resume in async callbacks.
  try {
    if (typeof window !== "undefined") {
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (AC) {
        if (!_audioCtx || _audioCtx.state === "closed") {
          _audioCtx = new AC();
        }
        const ctx = _audioCtx;
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }
        // Play a 1-sample silent buffer to fully unlock the AudioContext
        // inside a user gesture so that subsequent async calls (API fetch
        // + play) are routed through the main speaker on all platforms.
        if (ctx.state === "running" || ctx.state === "suspended") {
          try {
            const silent = ctx.createBuffer(1, 1, 22050);
            const src = ctx.createBufferSource();
            src.buffer = silent;
            src.connect(ctx.destination);
            src.start(0);
          } catch { /* non-fatal */ }
        }
      }
    }
  } catch {}

  // Unlock HTML5 audio (autoplay gate) — skipped ONLY on iOS Capacitor because
  // playing an <audio> element there resets the AVAudioSession category from
  // .playback (loudspeaker) back to .soloAmbient (earpiece).
  // Android Capacitor, Android browser, PWA, and all desktop browsers need
  // this unlock — it's NOT skipped there.
  const onIosCapacitor =
    typeof window !== "undefined" &&
    !!(window as any).Capacitor?.isNativePlatform?.() &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!_audioUnlocked && !onIosCapacitor) {
    const SILENT_MP3 = "data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSVQyAAAABgAAAzIyMzUAVFNTRQAAAA8AAANMYXZmNTcuODMuMTAwAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";
    const a = new Audio(SILENT_MP3);
    a.volume = 0;
    a.play().then(() => { _audioUnlocked = true; }).catch(() => {});
  }
}

/**
 * Cancel ALL active direct ElevenLabs JAC audio.
 * Safe to call from any component; prevents simultaneous speech.
 */
export function cancelAllJacAudio() {
  cancelElevenLabsAudio();
}

/**
 * Records unavailable ElevenLabs speech so failures are observable without
 * substituting a browser voice.
 */
function reportVoiceUnavailable(reason: string) {
  try {
    fetch("/api/jac/tts/fallback-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

/**
 * Speak text with the locked ElevenLabs voice.
 * Returns true when audio played; returns false when the fixed voice is
 * unavailable. It never substitutes another voice.
 * `onStart` fires the moment audible playback actually begins — use it to
 * measure end-to-end latency from STT completion to first sound.
 *
 */
export async function jacSpeak(
  rawText: string,
  opts: { muted?: boolean; onStart?: () => void; onError?: (message: string) => void } = {}
): Promise<boolean> {
  if (opts.muted) return false;
  // ConvAI owns audio — silently discard any TTS request while a session is active
  if (_convaiActive) return false;

  // Cancel any ongoing speech from either JAC component before starting
  cancelAllJacAudio();

  const text = normalizeTtsText(rawText);
  if (!text.trim()) return false;

  // ── Tier 2: live ElevenLabs via backend proxy ─────────────────────────────
  // ALL platforms use the buffered path (fetch-all → ArrayBuffer → AudioContext).
  //
  // Why not the streaming path (MediaSource)?
  //   The streaming path creates a plain `new Audio()` backed by a MediaSource
  //   object URL — it never touches AudioContext, so it gets NO gain boost and
  //   NO DynamicsCompressor.  On Android this is especially bad: the audio plays
  //   at system default volume (quiet) through whatever routing Android chose.
  //   The buffered path routes the decoded PCM through:
  //     BufferSource → DynamicsCompressor → GainNode (4× default) → destination
  //   which is audibly much louder and goes through the loudspeaker.
  //
  // Latency difference is negligible: ElevenLabs responses for typical
  // utterances (~5 s audio) are ~80 KB and download in ~100–200 ms.
  const played = await tryLiveElevenLabsBuffered(text, opts.onStart);
  if (played) return true;

  const message = "JAC's voice is temporarily unavailable. Please try again.";
  console.warn("[JAC TTS] Fixed ElevenLabs voice unavailable; no alternate voice will be used.");
  reportVoiceUnavailable("fixed_elevenlabs_voice_unavailable");
  opts.onError?.(message);
  return false;
}

/**
 * Calls the backend ElevenLabs TTS proxy (server holds the API key — never
 * exposed to the client) and plays the returned audio. Streams audio via
 * MediaSource so playback can start before the full response has arrived
 * (item A — start playback ASAP). Falls back to full-blob buffering when
 * MediaSource / streaming isn't available or fails partway through.
 * Returns false on any failure so the caller can fall back to Web Speech.
 */
async function tryLiveElevenLabs(text: string, onStart?: () => void): Promise<boolean> {
  const canStream =
    typeof window !== "undefined" &&
    "MediaSource" in window &&
    MediaSource.isTypeSupported("audio/mpeg");

  if (canStream) {
    const streamed = await tryLiveElevenLabsStreaming(text, onStart);
    if (streamed) return true;
    // Streaming attempt failed partway — don't double-fetch, just fall
    // through to Web Speech via the buffered path's own failure below only
    // if we never got a response at all (handled inside the streaming fn).
  }
  return tryLiveElevenLabsBuffered(text, onStart);
}

/** Progressive playback via MediaSource Extensions — audio starts as soon as the first chunk lands. */
async function tryLiveElevenLabsStreaming(text: string, onStart?: () => void): Promise<boolean> {
  const controller = new AbortController();
  _currentAbort = controller;
  let res: Response;
  try {
    res = await fetch("/api/jac/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
  } catch {
    return false;
  }
  if (!res.ok || !res.body) return false;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ok);
    };

    const mediaSource = new MediaSource();
    const objectUrl = URL.createObjectURL(mediaSource);
    const audio = new Audio(objectUrl);
    audio.preload = "auto";
    _currentAudio = audio;

    let started = false;
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      if (_currentAudio === audio) _currentAudio = null;
      if (_currentAbort === controller) _currentAbort = null;
    };

    audio.onplay = () => { if (!started) { started = true; onStart?.(); } };
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);

    mediaSource.addEventListener("sourceopen", async () => {
      let sourceBuffer: SourceBuffer;
      try {
        sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
      } catch {
        finish(false);
        return;
      }

      const reader = res.body!.getReader();
      let playStarted = false;
      let gotAnyData = false;

      const appendChunk = (chunk: Uint8Array) =>
        new Promise<void>((resolveAppend, rejectAppend) => {
          const onUpdateEnd = () => {
            sourceBuffer.removeEventListener("updateend", onUpdateEnd);
            resolveAppend();
          };
          sourceBuffer.addEventListener("updateend", onUpdateEnd);
          try {
            sourceBuffer.appendBuffer(chunk);
          } catch (e) {
            sourceBuffer.removeEventListener("updateend", onUpdateEnd);
            rejectAppend(e);
          }
        });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || !value.length) continue;
          gotAnyData = true;
          if (sourceBuffer.updating) {
            await new Promise<void>((r) => sourceBuffer.addEventListener("updateend", () => r(), { once: true }));
          }
          await appendChunk(value);
          if (!playStarted) {
            playStarted = true;
            audio.play().catch(() => {});
          }
        }
        if (!gotAnyData) {
          finish(false);
          return;
        }
        if (mediaSource.readyState === "open") {
          try { mediaSource.endOfStream(); } catch {}
        }
      } catch {
        finish(false);
      }
    });
  });
}
/** Full-blob buffering fallback — used when MediaSource streaming is unsupported or fails (e.g. iOS Safari). */
async function tryLiveElevenLabsBuffered(text: string, onStart?: () => void): Promise<boolean> {
  const controller = new AbortController();
  _currentAbort = controller;
  try {
    const res = await fetch("/api/jac/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (_currentAbort === controller) _currentAbort = null;
    if (!res.ok) return false;
    const arrayBuffer = await res.arrayBuffer();
    if (!arrayBuffer.byteLength) return false;
    // Use AudioContext to route through the loudspeaker on iOS.
    const played = await playViaAudioCtx(arrayBuffer, onStart);
    if (played) return true;
    // AudioContext not available — fall back to <audio> element.
    const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    return await playViaAudioElement(url, true, onStart);
  } catch {
    return false;
  }
}

/**
 * Decode and play an ArrayBuffer via AudioContext (all platforms).
 * AudioContext routes audio through the main speaker on all devices — raw
 * <audio> elements can default to earpiece routing on some phones.
 * Only used when the context is "running" — a suspended context hangs forever
 * because source.onended never fires until the context is resumed, which
 * breaks the greeting and any audio triggered from a non-gesture path.
 * Returns false immediately if the context isn't running so callers fall
 * back to <audio>.
 */
async function playViaAudioCtx(arrayBuffer: ArrayBuffer, onStart?: () => void): Promise<boolean> {
  const ctx = _audioCtx;
  if (!ctx) return false;
  // After mic release/re-acquire the context can be suspended even though
  // it was running at unlock time.  Try one resume before giving up.
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch {}
  }
  if (ctx.state !== "running") return false;
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    if (ctx.state !== "running") return false;
    const source = ctx.createBufferSource();
    source.buffer = decoded;

    // ── Loudness pipeline: source → GainNode → destination ───────────────
    // Plain gain only — NO DynamicsCompressor of any kind.
    // Any compressor/limiter on speech causes audible pumping ("cassette-tape
    // wind noise") because speech dynamics make it engage and release
    // constantly.  A simple gain node is transparent and artefact-free.
    // ElevenLabs audio is already well-levelled; 2× is enough to be
    // clearly louder through the phone speaker without clipping.
    const gain = ctx.createGain();
    gain.gain.value = _jacVolume; // 0.5 – 6.0, default 2.0

    // Inline analyser tap — lets the JAC character read real speech amplitude
    // (jac-audio-analyser.ts). AnalyserNode is a pass-through: no audio change.
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    const unregisterAnalyser = registerJacAnalyser(analyser, ctx);

    source.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);
    _audioCtxSource = source;
    return new Promise<boolean>((resolve) => {
      source.onended = () => {
        if (_audioCtxSource === source) _audioCtxSource = null;
        unregisterAnalyser();
        resolve(true);
      };
      source.start(0);
      onStart?.();
    });
  } catch {
    _audioCtxSource = null;
    return false;
  }
}

function tryPlayAudio(url: string, isBlob = false, onStart?: () => void): Promise<boolean> {
  // Fetch the audio, then play via AudioContext (loudspeaker) when running.
  // Falls back to <audio> element if AudioContext is not yet unlocked/running
  // (e.g. greeting fired from useEffect before any user gesture).
  if (_audioCtx && _audioCtx.state === "running") {
    return fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((buf) => playViaAudioCtx(buf, onStart))
      .catch(() => playViaAudioElement(url, isBlob, onStart));
  }
  return playViaAudioElement(url, isBlob, onStart);
}

function playViaAudioElement(url: string, isBlob = false, onStart?: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.preload = "auto";
    _currentAudio = audio;
    let started = false;
    const cleanup = () => {
      if (isBlob) URL.revokeObjectURL(url);
      if (_currentAudio === audio) _currentAudio = null;
    };
    audio.onplay  = () => { if (!started) { started = true; onStart?.(); } };
    audio.onended = () => { cleanup(); resolve(true); };
    audio.onerror = () => { cleanup(); resolve(false); };
    audio.play().catch(() => { cleanup(); resolve(false); });
  });
} // end playViaAudioElement
