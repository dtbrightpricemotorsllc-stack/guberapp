/**
 * JAC TTS — ElevenLabs via server proxy, with static cache + Web Speech fallback.
 *
 * Priority per utterance:
 *   1. /jac-audio/<slug>.mp3  — pre-generated static file (free, instant)
 *   2. POST /api/jac/tts      — live ElevenLabs proxy (real voice, costs credits)
 *   3. Web Speech API         — browser built-in (always works, no cost)
 */

import { applyJacVoice } from "./jac-voice";
import { isIOS } from "./platform";

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

/**
 * Topic slug → static audio file mapping.
 * Keys are matched against the normalized text via simple keyword detection.
 */
const CACHE_MAP: Array<{ slug: string; keywords: string[] }> = [
  { slug: "welcome",           keywords: ["job assisting coordinator", "what brings you"] },
  { slug: "what-is-guber",     keywords: ["what is guber", "what does guber do", "guber stand for", "global unlimited"] },
  { slug: "how-earn-money",    keywords: ["how do i earn", "how to earn", "make money", "earn money"] },
  { slug: "how-post-job",      keywords: ["how do i post", "post a job", "posting a job"] },
  { slug: "what-is-verify",    keywords: ["verify and inspect", "inspection", "inspect a car", "inspect a property"] },
  { slug: "background-check",  keywords: ["background check", "id verification", "identity verify"] },
  { slug: "how-get-paid",      keywords: ["how do i get paid", "when do i get paid", "payout", "get paid"] },
  { slug: "what-is-og",        keywords: ["day-1 og", "day 1 og", "founding member", "og membership", "og member"] },
  { slug: "what-is-cashdrop",  keywords: ["cash drop", "cashdrop"] },
  { slug: "what-is-studio",    keywords: ["guber studio", "ai content", "studio"] },
  { slug: "what-is-marketplace", keywords: ["marketplace", "buy and sell", "cars for sale"] },
  { slug: "what-is-loadboard", keywords: ["load board", "loadboard", "hauling", "transport"] },
  { slug: "how-id-verify",     keywords: ["verify my id", "id verify", "upload id", "photo id"] },
  { slug: "fees",              keywords: ["how much does it cost", "what are the fees", "platform fee", "how much is"] },
  { slug: "how-signup",        keywords: ["how do i sign up", "how to sign up", "create account", "get started"] },
  { slug: "safety",            keywords: ["is it safe", "how safe", "safety", "secure"] },
  { slug: "what-is-barter",    keywords: ["barter", "exchange services", "trade"] },
  { slug: "contact-support",   keywords: ["contact support", "get help", "customer service", "help me"] },
  { slug: "us-only",           keywords: ["available in", "what country", "international", "us only"] },
  { slug: "what-is-trustbox",  keywords: ["trust box", "trustbox", "unlimited plays"] },
];

function detectCacheSlug(text: string): string | null {
  const lower = text.toLowerCase();
  for (const { slug, keywords } of CACHE_MAP) {
    if (keywords.some((k) => lower.includes(k))) return slug;
  }
  return null;
}

let _currentAudio: HTMLAudioElement | null = null;
let _audioUnlocked = false;
let _currentAbort: AbortController | null = null;

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
 * True while JAC is actively producing audible speech (ElevenLabs audio
 * element playing, or Web Speech synthesis speaking/pending). Used by the
 * live-conversation engine to know when interruption should be armed.
 */
export function isJacSpeaking(): boolean {
  if (_audioCtxSource) return true;
  if (_currentAudio && !_currentAudio.paused) return true;
  try {
    return typeof window !== "undefined" && !!window.speechSynthesis?.speaking;
  } catch {
    return false;
  }
}

/**
 * Call this on ANY user interaction (button tap, send, mic press) before speaking.
 * Unlocks audio playback on all platforms (mobile browsers, PWA, native Capacitor).
 */
export function unlockAudioContext() {
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
  // Unlock speechSynthesis on every user gesture.
  // - Chrome Android: resume() lifts suspension caused by mic activity.
  // - iOS Safari PWA: the FIRST speak() call must happen inside a user-gesture
  //   handler or all subsequent async speak() calls are silently blocked.
  //   We speak a zero-volume utterance immediately and cancel it — this primes
  //   the engine so JAC's real responses (which arrive async after an API call)
  //   will actually play.
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const ss = window.speechSynthesis;
      ss.resume();
      // iOS WebKit (Safari + CriOS) requires speechSynthesis.speak() to be
      // called synchronously inside each user-gesture handler before any async
      // speak() will play. volume=0 is discarded by iOS — use 0.01 so the
      // engine registers it. At rate=16 + one space it finishes in <10 ms.
      //
      // On Android/desktop we only need this once (_audioUnlocked gate).
      // On iOS we must re-prime on EVERY gesture because the module-level
      // _audioUnlocked flag persists across SPA navigations, so without this
      // the greeting silently fails after the very first page visit.
      const onIOS = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (!_audioUnlocked || onIOS) {
        const primer = new SpeechSynthesisUtterance(" ");
        primer.volume = 0.01;
        primer.rate   = 16;
        ss.speak(primer);
      }
    }
  } catch {}
}

/**
 * Cancel ALL active JAC audio — both ElevenLabs and Web Speech.
 * Safe to call from any component; prevents simultaneous speech.
 */
export function cancelAllJacAudio() {
  cancelElevenLabsAudio();
  try { window.speechSynthesis?.cancel(); } catch {}
}

/**
 * Reports a silent Web Speech fallback to the server so it shows up in
 * admin-visible JAC voice usage logs (never fail silently — item D).
 */
function reportFallback(reason: string) {
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
 * Speak text using ElevenLabs (cached → live → Web Speech fallback).
 * Returns a promise that resolves when audio ends (or immediately on error).
 * `onStart` fires the moment audible playback actually begins — use it to
 * measure end-to-end latency from STT completion to first sound.
 */
export async function jacSpeak(
  rawText: string,
  opts: { muted?: boolean; onFallback?: () => void; onStart?: () => void } = {}
): Promise<void> {
  if (opts.muted) return;

  // Cancel any ongoing speech from either JAC component before starting
  cancelAllJacAudio();

  const text = normalizeTtsText(rawText);
  if (!text.trim()) return;

  // ── Tier 1: static cache (free, instant, all platforms) ──────────────────
  const slug = detectCacheSlug(rawText);
  if (slug) {
    const played = await tryPlayAudio(`/jac-audio/${slug}.mp3`, false, opts.onStart);
    if (played) return;
  }

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
  if (played) return;

  // ── Tier 3: Web Speech (always available, no cost) ────────────────────────
  opts.onFallback?.();
  reportFallback("live_elevenlabs_failed");
  webSpeechFallback(text, opts.onStart);
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

    source.connect(gain);
    gain.connect(ctx.destination);
    _audioCtxSource = source;
    return new Promise<boolean>((resolve) => {
      source.onended = () => {
        if (_audioCtxSource === source) _audioCtxSource = null;
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
}

/** True for any iOS browser — Safari, CriOS, Firefox iOS, etc. */
function isIOSBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function webSpeechFallback(text: string, onStart?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const ss = window.speechSynthesis;
  ss.cancel();
  // Chrome Android suspends speechSynthesis when the mic is active (or after
  // it stops). We must call resume() BEFORE enqueueing an utterance, otherwise
  // the utterance silently queues but never plays.
  try { ss.resume(); } catch {}

  // Delay rationale:
  //   Android WebView / Chrome Android: cancel() needs a short settle gap or
  //   the first utterance is silently dropped. 220 ms was the original safe
  //   value; with resume() called before AND after the gap, 120 ms is reliable
  //   and removes the noticeable lag users hear on Android.
  //   iOS (Safari + CriOS): cancel→speak race is not an issue on iOS WebKit,
  //   and a long delay risks re-suspension. 50 ms is enough.
  const delay = isIOSBrowser() ? 50 : 120;

  setTimeout(() => {
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang   = "en-US";
    utt.rate   = 1.05;
    utt.pitch  = 1.1;
    utt.volume = 1.0;
    // Only apply a specific voice if voices are already loaded; otherwise let
    // the browser pick the system default (safer on mobile).
    const voices = ss.getVoices();
    if (voices.length > 0) applyJacVoice(utt);
    let started = false;
    utt.onstart = () => { if (!started) { started = true; onStart?.(); } };
    // Resume again right before speaking — both Chrome Android and iOS can
    // re-suspend between the cancel() call and this timeout.
    try { ss.resume(); } catch {}
    ss.speak(utt);
    // Final nudge: if still paused 300 ms after enqueue, force resume.
    setTimeout(() => { try { if (ss.paused) ss.resume(); } catch {} }, 300);
  }, delay);
}
