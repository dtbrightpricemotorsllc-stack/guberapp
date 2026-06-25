/**
 * JAC Voice Selector — Web Speech API voice picker
 *
 * Priority: "Flicker" (target) → ranked cheerful/bright/feminine fallbacks.
 * Logs the selected voice on every resolution so it shows in DevTools console.
 */

export const JAC_TARGET_VOICE = "Flicker";

/** Ordered fallback list — first match in getVoices() wins */
const FALLBACK_VOICE_NAMES: string[] = [
  // Chrome / Chromium
  "Google UK English Female",
  "Google US English Female",
  // Windows SAPI / Edge
  "Microsoft Zira - English (United States)",
  "Microsoft Zira Desktop - English (United States)",
  "Microsoft Zira",
  // macOS / iOS
  "Samantha",                // warm, clear, friendly
  "Karen",                   // Australian, bright and cheerful
  "Victoria",
  "Moira",                   // Irish, warm
  // Android fallbacks
  "en-us-x-sfg-local",
  "en-US-language",
  // Generic feminine signals (matched by substring)
  "Female",
  "female",
  "Girl",
  "girl",
  // Absolute last resort — just needs to be English
  "Google US English",
  "en-US",
  "en_US",
];

/** localStorage key — admin can override */
const LS_KEY = "jac_voice_override";

let _resolvedVoice: SpeechSynthesisVoice | null = null;
let _resolvedName = "(not yet loaded)";
let _loadPromise: Promise<void> | null = null;

function score(v: SpeechSynthesisVoice): number {
  const n = v.name;
  if (n === JAC_TARGET_VOICE) return 1000;
  for (let i = 0; i < FALLBACK_VOICE_NAMES.length; i++) {
    const cand = FALLBACK_VOICE_NAMES[i];
    if (cand.length > 6 ? n === cand : n.includes(cand)) return 900 - i;
  }
  // Boost any English voice with "female"/"girl" anywhere in name
  if (/female|girl|woman/i.test(n) && /en[-_]?/i.test(v.lang)) return 200;
  return 0;
}

function pickFromList(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  // Check admin override first
  const override = (() => { try { return localStorage.getItem(LS_KEY); } catch { return null; } })();
  if (override) {
    const found = voices.find((v) => v.name === override);
    if (found) return found;
    console.warn(`[JAC voice] Override "${override}" not found — ignoring`);
  }

  const english = voices.filter((v) => /^en/i.test(v.lang) || v.lang === "");
  const pool = english.length ? english : voices;

  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -1;
  for (const v of pool) {
    const s = score(v);
    if (s > bestScore) { bestScore = s; best = v; }
  }

  return best;
}

function resolveAndLog(voices: SpeechSynthesisVoice[]) {
  _resolvedVoice = pickFromList(voices);
  _resolvedName = _resolvedVoice?.name ?? "(none)";

  const wasFlicker = _resolvedVoice?.name === JAC_TARGET_VOICE;

  if (!wasFlicker) {
    console.warn(
      `[JAC voice] ⚠ Target voice "${JAC_TARGET_VOICE}" not available in this browser/OS.\n` +
      `[JAC voice]   Active voice: "${_resolvedName}" (${_resolvedVoice?.lang ?? "?"}).\n` +
      `[JAC voice]   Available voices: ${voices.map((v) => `"${v.name}"`).join(", ")}\n` +
      `[JAC voice]   To override, run: localStorage.setItem("jac_voice_override", "<voice name>") and reload.`
    );
  } else {
    console.info(`[JAC voice] ✓ Using target voice "${JAC_TARGET_VOICE}".`);
  }
}

/** Returns a promise that resolves when voices are loaded and picked. */
export function loadJacVoice(): Promise<void> {
  if (_loadPromise) return _loadPromise;
  _loadPromise = new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      _resolvedName = "(not supported)";
      resolve();
      return;
    }

    function tryLoad() {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length) {
        resolveAndLog(voices);
        resolve();
        return true;
      }
      return false;
    }

    if (!tryLoad()) {
      window.speechSynthesis.onvoiceschanged = () => {
        tryLoad();
        resolve();
      };
      // Some browsers fire the event synchronously — belt-and-suspenders
      setTimeout(() => {
        tryLoad();
        resolve();
      }, 800);
    }
  });
  return _loadPromise;
}

/** Apply JAC's chosen voice to a SpeechSynthesisUtterance. */
export function applyJacVoice(utt: SpeechSynthesisUtterance) {
  if (_resolvedVoice) utt.voice = _resolvedVoice;
  utt.lang = "en-US";
}

/** For display in admin/debug UI. */
export function getActiveJacVoiceName(): string { return _resolvedName; }

/** Reset cache (used after admin override change). */
export function resetJacVoiceCache() {
  _resolvedVoice = null;
  _resolvedName = "(not yet loaded)";
  _loadPromise = null;
}

/** List all voices available in this browser (for admin UI). */
export function listAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}
