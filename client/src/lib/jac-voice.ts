/**
 * JAC Voice Selector — Web Speech API voice picker
 *
 * TTS Provider: Web Speech API (browser built-in, no external service)
 * Voice resolution: attempts "Flicker" first; if not found, scores
 * available voices for feminine / cheerful / bright qualities.
 */

export const TTS_PROVIDER = "Web Speech API (browser built-in)";
export const JAC_TARGET_VOICE = "Flicker";

export interface VoiceDebugInfo {
  provider: string;
  requestedVoice: string;
  targetFound: boolean;
  activeVoiceId: string;   // voiceURI — the actual ID the browser uses
  activeVoiceName: string;
  activeLang: string;
  fallbackUsed: boolean;
  allVoices: Array<{ name: string; voiceId: string; lang: string; local: boolean }>;
}

/** Ordered fallback list — first match in getVoices() wins */
const FALLBACK_VOICE_NAMES: string[] = [
  // Google cloud voices — best quality, sound most natural
  "Google US English Female",
  "Google UK English Female",
  "Google US English",
  // Microsoft Edge neural voices
  "Microsoft Aria Online (Natural) - English (United States)",
  "Microsoft Jenny Online (Natural) - English (United States)",
  "Microsoft Aria - English (United States)",
  // Windows SAPI / Edge desktop
  "Microsoft Zira - English (United States)",
  "Microsoft Zira Desktop - English (United States)",
  "Microsoft Zira",
  // macOS / iOS — Apple voices are high quality
  "Samantha",
  "Karen",
  "Victoria",
  "Moira",
  // Android local (lower quality but better than nothing)
  "en-us-x-sfg-local",
  "en-US-language",
  // Generic feminine signals (substring match)
  "Female",
  "female",
  "Girl",
  "girl",
  // Last resort
  "en-US",
  "en_US",
];

const LS_KEY = "jac_voice_override";

let _resolvedVoice: SpeechSynthesisVoice | null = null;
let _targetFound = false;
let _fallbackUsed = false;
let _loadPromise: Promise<void> | null = null;

function score(v: SpeechSynthesisVoice): number {
  const n = v.name;
  if (n === JAC_TARGET_VOICE) return 1000;
  // Cloud/network voices sound significantly better than local TTS engines
  const cloudBonus = v.localService ? 0 : 150;
  for (let i = 0; i < FALLBACK_VOICE_NAMES.length; i++) {
    const cand = FALLBACK_VOICE_NAMES[i];
    if (cand.length > 6 ? n === cand : n.includes(cand)) return 900 - i + cloudBonus;
  }
  if (/female|girl|woman/i.test(n) && /^en/i.test(v.lang)) return 200 + cloudBonus;
  if (!v.localService && /^en/i.test(v.lang)) return 100; // any cloud en voice beats local
  return 0;
}

function pickFromList(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const override = (() => { try { return localStorage.getItem(LS_KEY); } catch { return null; } })();
  if (override) {
    const found = voices.find((v) => v.name === override || v.voiceURI === override);
    if (found) {
      console.info(`[JAC voice] ✓ Admin override active: "${found.name}" (ID: ${found.voiceURI})`);
      return found;
    }
    console.warn(`[JAC voice] ⚠ Override "${override}" not found in browser voice list — ignoring.`);
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
  _targetFound   = _resolvedVoice?.name === JAC_TARGET_VOICE;
  _fallbackUsed  = !_targetFound;

  const flickerExists = voices.some((v) => v.name === JAC_TARGET_VOICE);

  if (!flickerExists) {
    console.warn(
      `[JAC voice] ✗ "${JAC_TARGET_VOICE}" does NOT exist in this browser's voice list.\n` +
      `[JAC voice]   Provider: ${TTS_PROVIDER}\n` +
      `[JAC voice]   Active voice: "${_resolvedVoice?.name ?? "(none)"}" | ID: ${_resolvedVoice?.voiceURI ?? "?"} | Lang: ${_resolvedVoice?.lang ?? "?"}\n` +
      `[JAC voice]   Fallback used: YES\n` +
      `[JAC voice]   All voices:\n` +
      voices.map((v) => `    ${v.lang.padEnd(8)} ${v.voiceURI.padEnd(50)} "${v.name}"`).join("\n") + "\n" +
      `[JAC voice]   To override: localStorage.setItem("jac_voice_override", "<exact name or voiceURI>") then reload.`
    );
  } else {
    console.info(
      `[JAC voice] ✓ Target voice "${JAC_TARGET_VOICE}" found and active.\n` +
      `[JAC voice]   ID: ${_resolvedVoice?.voiceURI} | Lang: ${_resolvedVoice?.lang}`
    );
  }
}

export function loadJacVoice(): Promise<void> {
  if (_loadPromise) return _loadPromise;
  _loadPromise = new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
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
      window.speechSynthesis.onvoiceschanged = () => { tryLoad(); resolve(); };
      setTimeout(() => { tryLoad(); resolve(); }, 900);
    }
  });
  return _loadPromise;
}

export function applyJacVoice(utt: SpeechSynthesisUtterance) {
  utt.lang = "en-US";

  // Always check the live voice list so admin overrides take effect immediately
  // without needing a cache reset or page reload.
  const voices = (typeof window !== "undefined" && "speechSynthesis" in window)
    ? window.speechSynthesis.getVoices() : [];

  if (voices.length) {
    const override = (() => { try { return localStorage.getItem(LS_KEY); } catch { return null; } })();
    if (override) {
      const v = voices.find((x) => x.name === override || x.voiceURI === override);
      if (v) { utt.voice = v; return; }
    }
    // No override — use the module-cached pick (or re-pick if cache is empty)
    if (!_resolvedVoice) resolveAndLog(voices);
    if (_resolvedVoice) utt.voice = _resolvedVoice;
  } else if (_resolvedVoice) {
    utt.voice = _resolvedVoice;
  }
}

export function getVoiceDebugInfo(): VoiceDebugInfo {
  const voices = (typeof window !== "undefined" && "speechSynthesis" in window)
    ? window.speechSynthesis.getVoices()
    : [];
  return {
    provider:        TTS_PROVIDER,
    requestedVoice:  JAC_TARGET_VOICE,
    targetFound:     _targetFound,
    activeVoiceId:   _resolvedVoice?.voiceURI   ?? "(not loaded)",
    activeVoiceName: _resolvedVoice?.name        ?? "(not loaded)",
    activeLang:      _resolvedVoice?.lang        ?? "(not loaded)",
    fallbackUsed:    _fallbackUsed,
    allVoices:       voices.map((v) => ({
      name:    v.name,
      voiceId: v.voiceURI,
      lang:    v.lang,
      local:   v.localService,
    })),
  };
}

/** @deprecated use getVoiceDebugInfo().activeVoiceName */
export function getActiveJacVoiceName(): string {
  return _resolvedVoice?.name ?? "(not yet loaded)";
}

export function resetJacVoiceCache() {
  _resolvedVoice = null;
  _targetFound   = false;
  _fallbackUsed  = false;
  _loadPromise   = null;
}

export function listAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}
