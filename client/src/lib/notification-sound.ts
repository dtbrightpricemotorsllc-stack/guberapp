let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  gain: number,
  type: OscillatorType = "sine"
) {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

export function playGuberPing() {
  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;

    // First note — soft low tap (G4)
    playTone(ctx, 392, now, 0.12, 0.18, "sine");

    // Second note — main bright chime (B5) — the "GUBER" ping
    playTone(ctx, 987.77, now + 0.09, 0.35, 0.28, "sine");

    // Harmonic shimmer on the second note (B5 octave down)
    playTone(ctx, 493.88, now + 0.09, 0.35, 0.08, "sine");

  } catch {
    // Audio blocked or unavailable — silent fail
  }
}

export function playGuberCashDrop() {
  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;

    // Ascending three-note cash fanfare
    playTone(ctx, 523.25, now, 0.14, 0.2, "sine");        // C5
    playTone(ctx, 659.25, now + 0.1, 0.14, 0.22, "sine"); // E5
    playTone(ctx, 1046.5, now + 0.2, 0.45, 0.3, "sine");  // C6

    // Soft shimmer
    playTone(ctx, 1318.5, now + 0.22, 0.4, 0.07, "sine"); // E6

  } catch {
    // Silent fail
  }
}

export function unlockAudio() {
  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    // ignore
  }
}
