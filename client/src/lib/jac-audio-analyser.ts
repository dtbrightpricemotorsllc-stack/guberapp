/**
 * JAC live audio amplitude — taps real JAC audio output so the mouth
 * animation can follow the actual voice instead of a simulation.
 *
 * Two capture paths:
 *   1. ElevenLabs ConvAI (WebRTC) — the SDK mounts <audio> elements backed by
 *      a MediaStream. A capture-phase "playing" listener on the document taps
 *      each stream via createMediaStreamSource → AnalyserNode. Tapping a
 *      MediaStream does NOT reroute or mute the element's own playback.
 *   2. Text-mode TTS (jac-tts.ts) — playViaAudioCtx() inserts an AnalyserNode
 *      inline in its own AudioContext pipeline and registers it here.
 *
 * Consumers call getJacLiveAmplitude():
 *   - number 0..1 — current speech amplitude from real audio
 *   - null        — no live tap available; caller should fall back to
 *                   its simulated amplitude.
 */

interface Tap {
  analyser: AnalyserNode;
  buf: Uint8Array;
  ctx: AudioContext;
}

const _taps = new Set<Tap>();

/**
 * Register an existing AnalyserNode (already wired into an audio graph).
 * Returns an unregister function. Used by jac-tts's AudioContext pipeline.
 */
export function registerJacAnalyser(analyser: AnalyserNode, ctx: AudioContext): () => void {
  const tap: Tap = { analyser, buf: new Uint8Array(analyser.frequencyBinCount), ctx };
  _taps.add(tap);
  return () => { _taps.delete(tap); };
}

// ── MediaStream-backed <audio> element tapping (ElevenLabs ConvAI/WebRTC) ────
let _streamCtx: AudioContext | null = null;
const _tappedElements = new WeakSet<HTMLMediaElement>();
let _listenerInstalled = false;

function getStreamCtx(): AudioContext | null {
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as
      | typeof AudioContext
      | undefined;
    if (!AC) return null;
    if (!_streamCtx || _streamCtx.state === "closed") _streamCtx = new AC();
    if (_streamCtx.state === "suspended") _streamCtx.resume().catch(() => {});
    return _streamCtx;
  } catch {
    return null;
  }
}

/**
 * Create + resume the stream-analysis AudioContext INSIDE a user gesture.
 *
 * Gesture-gated browsers (iOS Safari, mobile WebViews) reject resume() calls
 * made outside a user interaction. The "playing" event that fires when the
 * ElevenLabs WebRTC <audio> element starts is NOT gesture-authorized, so the
 * context must already be unlocked by then. Called from:
 *   - jac-tts unlockAudioContext() (fired on every JAC user interaction)
 *   - the capture-phase pointerdown/touchend listeners installed by
 *     ensureJacAudioTapListener() (belt-and-suspenders)
 *
 * Must be invoked synchronously within the gesture handler.
 */
export function unlockJacAnalyserContext(): void {
  try {
    if (typeof window === "undefined") return;
    const ctx = getStreamCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    // Play a 1-sample silent buffer to fully unlock within this gesture.
    if (ctx.state === "running" || ctx.state === "suspended") {
      const silent = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = silent;
      src.connect(ctx.destination);
      src.start(0);
    }
  } catch {
    /* non-fatal — consumer falls back to simulation */
  }
}

function tapMediaStreamElement(el: HTMLMediaElement): void {
  if (_tappedElements.has(el)) return;
  const streamObj = el.srcObject;
  if (!(streamObj instanceof MediaStream)) return;
  const audioTracks = streamObj.getAudioTracks();
  if (audioTracks.length === 0) return;

  const ctx = getStreamCtx();
  if (!ctx) return;

  try {
    const src = ctx.createMediaStreamSource(streamObj);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    src.connect(analyser); // analysis only — element keeps its own output path
    // Pull the graph: some Chromium builds don't process a MediaStreamSource
    // whose subgraph never reaches the destination. Route through a 0-gain
    // sink so the analyser gets data without any audible double-output.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    analyser.connect(sink);
    sink.connect(ctx.destination);
    _tappedElements.add(el);

    const unregister = registerJacAnalyser(analyser, ctx);
    const teardown = () => {
      unregister();
      try { src.disconnect(); } catch {}
      try { sink.disconnect(); } catch {}
    };
    // Tear down when the stream's tracks end or the element empties.
    audioTracks.forEach((t) => t.addEventListener("ended", teardown, { once: true }));
    el.addEventListener("emptied", teardown, { once: true });
  } catch {
    // Tap failure is non-fatal — consumer falls back to simulation.
  }
}

/**
 * Install a document-level capture listener that taps any MediaStream-backed
 * <audio>/<video> element the moment it starts playing (the ElevenLabs SDK
 * mounts one for WebRTC output). Idempotent; call from any JAC UI mount.
 */
export function ensureJacAudioTapListener(): void {
  if (_listenerInstalled || typeof document === "undefined") return;
  _listenerInstalled = true;
  document.addEventListener(
    "playing",
    (e) => {
      const target = e.target;
      if (target instanceof HTMLMediaElement && target.srcObject instanceof MediaStream) {
        tapMediaStreamElement(target);
      }
    },
    true,
  );
  // Unlock the analysis AudioContext during real user gestures so it is
  // already "running" when the (non-gesture) "playing" event later fires.
  const gestureUnlock = () => unlockJacAnalyserContext();
  document.addEventListener("pointerdown", gestureUnlock, true);
  document.addEventListener("touchend", gestureUnlock, true);
  document.addEventListener("keydown", gestureUnlock, true);
}

// ── Amplitude read ───────────────────────────────────────────────────────────

/** RMS byte-deviation → 0..1 amplitude. Speech peaks land around rms ≈ 25–40. */
const RMS_FULL_SCALE = 28;

/**
 * Current live speech amplitude (0..1), or null when no real audio tap is
 * available/running — callers should fall back to simulated amplitude.
 */
export function getJacLiveAmplitude(): number | null {
  if (_taps.size === 0) return null;
  let best: number | null = null;
  for (const tap of Array.from(_taps)) {
    if (tap.ctx.state !== "running") {
      // Try to wake a suspended context; skip it for this frame.
      if (tap.ctx.state === "suspended") tap.ctx.resume().catch(() => {});
      continue;
    }
    try {
      tap.analyser.getByteTimeDomainData(tap.buf);
      let sum = 0;
      for (let i = 0; i < tap.buf.length; i++) {
        const d = tap.buf[i] - 128;
        sum += d * d;
      }
      const rms = Math.sqrt(sum / tap.buf.length);
      const amp = Math.min(1, rms / RMS_FULL_SCALE);
      if (best === null || amp > best) best = amp;
    } catch {
      // Ignore this tap for the frame.
    }
  }
  return best;
}

// ── Test/debug hook — used by e2e/jac-mouth-live-amplitude.spec.ts ───────────
if (typeof window !== "undefined") {
  (window as any).__jacAudioDebug = {
    getJacLiveAmplitude,
    ensureJacAudioTapListener,
    unlockJacAnalyserContext,
  };
}
