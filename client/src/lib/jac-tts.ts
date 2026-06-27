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

export function cancelElevenLabsAudio() {
  if (_currentAudio) {
    _currentAudio.pause();
    _currentAudio.src = "";
    _currentAudio = null;
  }
}

/**
 * Call this on ANY user interaction (button tap, send, mic press) before speaking.
 * Unlocks audio playback on mobile browsers that require a gesture.
 */
export function unlockAudioContext() {
  if (_audioUnlocked) return;
  // Tiny silent MP3 (base64) — triggers browser audio permission without audible sound
  const SILENT_MP3 = "data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSVQyAAAABgAAAzIyMzUAVFNTRQAAAA8AAANMYXZmNTcuODMuMTAwAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";
  const a = new Audio(SILENT_MP3);
  a.volume = 0;
  a.play().then(() => { _audioUnlocked = true; }).catch(() => {});
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
 * Speak text using ElevenLabs (cached → live → Web Speech fallback).
 * Returns a promise that resolves when audio ends (or immediately on error).
 */
export async function jacSpeak(
  rawText: string,
  opts: { muted?: boolean; onFallback?: () => void } = {}
): Promise<void> {
  if (opts.muted) return;

  // Cancel any ongoing speech from either JAC component before starting
  cancelAllJacAudio();

  const text = normalizeTtsText(rawText);
  if (!text.trim()) return;

  // ── Tier 1: static cache (free, instant, all platforms) ──────────────────
  const slug = detectCacheSlug(rawText);
  if (slug) {
    const played = await tryPlayAudio(`/jac-audio/${slug}.mp3`);
    if (played) return;
  }

  // ── Tier 2: Web Speech (Android + web; iOS WKWebView doesn't support it) ───
  // ElevenLabs parked — latency + voice inconsistency across responses.
  if (isIOS) return;
  opts.onFallback?.();
  webSpeechFallback(text);
}

function tryPlayAudio(url: string, isBlob = false): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.preload = "auto";
    _currentAudio = audio;
    const cleanup = () => {
      if (isBlob) URL.revokeObjectURL(url);
      _currentAudio = null;
    };
    audio.onended  = () => { cleanup(); resolve(true); };
    audio.onerror  = () => { cleanup(); resolve(false); };
    audio.play().catch(() => { cleanup(); resolve(false); });
  });
}

function webSpeechFallback(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const ss = window.speechSynthesis;
  ss.cancel();
  // Chrome/WebView bug: cancel() followed immediately by speak() can silently
  // drop the utterance. A 60 ms gap lets cancel() finish before we enqueue.
  setTimeout(() => {
    const utt = new SpeechSynthesisUtterance(text);
    applyJacVoice(utt);
    utt.rate   = 1.08;
    utt.pitch  = 1.15;
    utt.volume = 1.0;
    ss.speak(utt);
  }, 60);
}
