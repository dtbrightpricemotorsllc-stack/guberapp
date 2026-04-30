const SOUND_PREF_KEY = "guber_notif_sound_enabled";
const VIBRATION_PREF_KEY = "guber_notif_vibration_enabled";

export function getNotifSoundEnabled(): boolean {
  const val = localStorage.getItem(SOUND_PREF_KEY);
  return val === null ? true : val === "true";
}

export function setNotifSoundEnabled(enabled: boolean): void {
  localStorage.setItem(SOUND_PREF_KEY, String(enabled));
}

export function getNotifVibrationEnabled(): boolean {
  const val = localStorage.getItem(VIBRATION_PREF_KEY);
  return val === null ? true : val === "true";
}

export function setNotifVibrationEnabled(enabled: boolean): void {
  localStorage.setItem(VIBRATION_PREF_KEY, String(enabled));
}

let audioCtx: AudioContext | null = null;

const AUDIO_UNLOCKED_KEY = "guber_audio_unlocked";

let unlocked: boolean = (() => {
  try {
    return sessionStorage.getItem(AUDIO_UNLOCKED_KEY) === "1";
  } catch {
    return false;
  }
})();

function getCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

export function isAudioUnlocked(): boolean {
  return unlocked;
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
  if (!getNotifSoundEnabled()) return;
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
  if (!getNotifSoundEnabled()) return;
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

// Aggressive iOS-friendly audio unlock. iOS Safari requires *both* an
// AudioContext.resume() call AND a real audio buffer (or HTMLAudioElement)
// playback within the same user gesture before any future programmatic
// playback will be allowed. We try both in parallel, but we only flip the
// `unlocked` flag (and persist it) after one of the paths *actually*
// confirms success — so the layout's gesture listeners keep firing on
// subsequent taps if the first attempt was partial.
function markUnlocked(): void {
  if (unlocked) return;
  unlocked = true;
  try {
    sessionStorage.setItem(AUDIO_UNLOCKED_KEY, "1");
  } catch {
  }
}

export function unlockAudio(): void {
  if (unlocked) return;

  // --- AudioContext path -------------------------------------------------
  try {
    const ctx = getCtx();

    const finalizeContext = () => {
      // Only count as success once the context is actually running. Calling
      // start(0) on a suspended context is silently queued, which is what
      // led to false positives previously.
      if (ctx.state !== "running") return;
      try {
        const buffer = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.start(0);
        markUnlocked();
      } catch {
        // ignore — HTMLAudio path may still succeed
      }
    };

    if (ctx.state === "running") {
      finalizeContext();
    } else {
      const p = ctx.resume();
      if (p && typeof (p as any).then === "function") {
        (p as Promise<void>).then(finalizeContext).catch(() => {});
      } else {
        finalizeContext();
      }
    }
  } catch {
    // AudioContext path failed — keep trying HTMLAudio
  }

  // --- HTMLAudioElement path --------------------------------------------
  try {
    const a = new Audio(
      // tiny silent 8kHz mono WAV
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
    );
    a.muted = true;
    const p = a.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        try { a.pause(); } catch {}
        a.muted = false;
        markUnlocked();
      }).catch(() => {
        // play() rejected — leave `unlocked` false so the next gesture retries.
      });
    }
    // If play() returned no promise (very old browsers), don't speculatively
    // mark unlocked — the AudioContext path is our source of truth there.
  } catch {
    // ignore
  }
}

export type SoundType = "money" | "closed" | "action" | "default" | "nearby";

function vibrateFor(type: SoundType): void {
  if (!getNotifVibrationEnabled()) return;
  if (!("vibrate" in navigator)) return;
  try {
    switch (type) {
      case "money":  navigator.vibrate(200);          break;
      case "action": navigator.vibrate([80, 50, 80]); break;
      case "closed": navigator.vibrate(60);           break;
      // "nearby" and "default": no vibration
    }
  } catch {
    // ignore silently
  }
}

// Returns a promise resolving to true if playback was accepted by the
// browser/OS, false otherwise. Existing fire-and-forget callers still work
// (they just ignore the promise); the test-sound panel awaits it so it can
// warn the user when playback is silently blocked (ringer muted, OS focus,
// autoplay policy, etc.).
export function playGuberSound(type: SoundType): Promise<boolean> {
  vibrateFor(type);
  if (!getNotifSoundEnabled()) return Promise.resolve(false);

  const audio = new Audio(`/sounds/guber_${type}.wav`);
  return audio.play()
    .then(() => true)
    .catch(() => {
      // WAV failed — fall back to the synthesized tones via AudioContext.
      try {
        if (type === "money") playGuberCashDrop();
        else playGuberPing();
        // We can't easily detect AudioContext-level failure, but if it
        // didn't throw the chain is at least scheduled.
        const ctx = audioCtx;
        return !!(ctx && ctx.state === "running");
      } catch {
        return false;
      }
    });
}
