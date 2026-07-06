/**
 * JAC Wake Word Detector
 *
 * Listens continuously for "Hey JAC" (and fuzzy variants) and fires
 * a "jac:wake" CustomEvent when detected.
 *
 * Strategy:
 *   - Uses SpeechRecognition in continuous + interim mode (all platforms)
 *   - Auto-restarts on end/error (iOS terminates sessions after ~1 min)
 *   - Only active when voiceActivation preference is enabled
 *   - Never holds audio when screen is hidden (visibility API)
 *   - Dispatches CustomEvent("jac:wake") — guber-assistant listens for it
 */

const WAKE_PATTERNS = [
  /\bh[ae]y\s+ja[ckgq]+\b/i,
  /\bo[kh]+\s+ja[ckgq]+\b/i,
  /\byo\s+ja[ckgq]+\b/i,
  /\bhi\s+ja[ckgq]+\b/i,
];

function isWakeWord(text: string): boolean {
  return WAKE_PATTERNS.some((p) => p.test(text));
}

const SR: typeof SpeechRecognition | null =
  typeof window !== "undefined"
    ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
    : null;

class WakeWordDetectorSingleton {
  private _enabled = false;
  private _rec: SpeechRecognition | null = null;
  private _restartTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastWakeAt = 0;

  enable(): void {
    if (this._enabled) return;
    this._enabled = true;
    console.info("[WakeWord] enabled");
    this._startLoop();
    document.addEventListener("visibilitychange", this._onVisibility);
  }

  disable(): void {
    if (!this._enabled) return;
    this._enabled = false;
    console.info("[WakeWord] disabled");
    this._stop();
    document.removeEventListener("visibilitychange", this._onVisibility);
  }

  private _onVisibility = () => {
    if (!this._enabled) return;
    if (document.visibilityState === "visible") this._startLoop();
    else this._stop();
  };

  private _startLoop(): void {
    if (!SR || !this._enabled || document.visibilityState !== "visible") return;
    if (this._rec) return;

    try {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.maxAlternatives = 1;

      rec.onresult = (e: SpeechRecognitionEvent) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i][0].transcript;
          if (isWakeWord(text)) {
            const now = Date.now();
            if (now - this._lastWakeAt < 2000) return;
            this._lastWakeAt = now;
            console.info("[WakeWord] detected:", text);
            window.dispatchEvent(new CustomEvent("jac:wake"));
          }
        }
      };

      rec.onend = () => {
        this._rec = null;
        if (!this._enabled) return;
        this._restartTimer = setTimeout(() => this._startLoop(), 800);
      };

      rec.onerror = (e) => {
        this._rec = null;
        const err = (e as any).error;
        if (err === "not-allowed" || err === "service-not-allowed") {
          console.warn("[WakeWord] mic denied — disabling");
          this.disable();
          return;
        }
        if (!this._enabled) return;
        this._restartTimer = setTimeout(() => this._startLoop(), 1500);
      };

      rec.start();
      this._rec = rec;
    } catch (err) {
      console.warn("[WakeWord] failed to start:", err);
    }
  }

  private _stop(): void {
    if (this._restartTimer) { clearTimeout(this._restartTimer); this._restartTimer = null; }
    if (this._rec) {
      // Detach handlers FIRST — calling stop() fires onend, which would
      // otherwise schedule a restart even though we're intentionally
      // stopping (e.g. tab hidden or toggled off), causing zombie
      // recognition instances / a runaway restart loop ("goes crazy").
      this._rec.onend = null;
      this._rec.onerror = null;
      this._rec.onresult = null;
      try { this._rec.stop(); } catch {}
    }
    this._rec = null;
  }

  get isEnabled(): boolean { return this._enabled; }
}

export const WakeWordDetector = new WakeWordDetectorSingleton();
