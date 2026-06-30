/**
 * JAC Voice — Platform Provider Picker
 *
 * Import from here, never from individual provider files.
 * Swap providers here without touching JAC components.
 */

import { isIOS } from "@/lib/platform";
import { WebSpeechProvider } from "./WebSpeechProvider";
import { WhisperProvider } from "./WhisperProvider";
import type { STTProvider } from "./VoiceProvider";

/**
 * Returns true when running in Safari (desktop or mobile) but NOT inside the
 * Capacitor iOS app. webkitSpeechRecognition on Safari is unreliable — it
 * doesn't persist the mic permission grant and frequently returns no results.
 */
function isSafariBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // Safari UA contains "Safari" but Chrome/Chromium/Edge/Android also contain
  // "Safari" — exclude them with the negative pattern.
  return /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Android|Edg\//i.test(ua);
}

export type { STTProvider, STTCallback } from "./VoiceProvider";
export { WakeWordDetector } from "./WakeWordDetector";

let _cached: STTProvider | null = null;

/**
 * Returns the best STT provider for the current platform.
 * On iOS Capacitor → WhisperProvider (WKWebView SpeechRecognition is unreliable).
 * On Web/Android → WebSpeechProvider if available, else WhisperProvider.
 *
 * Call once and cache — the result is stable for the lifetime of the page.
 */
export function getSTTProvider(): STTProvider {
  if (_cached) return _cached;

  const nativePlatform =
    typeof window !== "undefined"
      ? (window as any).Capacitor?.getPlatform?.() ?? "web"
      : "web";

  // iOS Capacitor app → Whisper (WKWebView SpeechRecognition unreliable)
  if (isIOS || nativePlatform === "ios") {
    _cached = new WhisperProvider();
    console.info("[JAC Voice] STT provider: Whisper (iOS Capacitor)");
    return _cached;
  }

  // Android Capacitor app → Whisper.
  // webkitSpeechRecognition inside the Capacitor WebView has inconsistent
  // permission grant flow on Android; Whisper via getUserMedia is more reliable.
  if (nativePlatform === "android") {
    _cached = new WhisperProvider();
    console.info("[JAC Voice] STT provider: Whisper (Android Capacitor)");
    return _cached;
  }

  // Safari browser (desktop or mobile) → Whisper.
  // webkitSpeechRecognition on Safari doesn't persist the mic permission grant
  // and frequently returns no results — Whisper is more reliable here.
  if (isSafariBrowser()) {
    _cached = new WhisperProvider();
    console.info("[JAC Voice] STT provider: Whisper (Safari)");
    return _cached;
  }

  const ws = new WebSpeechProvider();
  if (ws.isSupported()) {
    _cached = ws;
    console.info("[JAC Voice] STT provider: WebSpeech (Chrome/Android)");
    return _cached;
  }

  _cached = new WhisperProvider();
  console.info("[JAC Voice] STT provider: Whisper (WebSpeech unavailable)");
  return _cached;
}

/**
 * Request microphone permission explicitly.
 * Returns { granted: true } or { granted: false, platform, reason }.
 */
export async function requestMicPermission(): Promise<{
  granted: boolean;
  platform?: string;
  reason?: string;
}> {
  const platform =
    (typeof window !== "undefined" && (window as any).Capacitor?.getPlatform?.()) ?? "web";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { granted: true };
  } catch (err: any) {
    return {
      granted: false,
      platform,
      reason: err?.name ?? "unknown",
    };
  }
}
