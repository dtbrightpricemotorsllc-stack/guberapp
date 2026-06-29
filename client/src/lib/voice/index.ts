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

  if (isIOS) {
    _cached = new WhisperProvider();
    console.info("[JAC Voice] STT provider: Whisper (iOS)");
    return _cached;
  }

  const ws = new WebSpeechProvider();
  if (ws.isSupported()) {
    _cached = ws;
    console.info("[JAC Voice] STT provider: WebSpeech");
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
