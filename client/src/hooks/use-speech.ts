import { useState, useCallback, useRef, useEffect } from "react";
import { getSTTProvider } from "@/lib/voice";
import { cancelAllJacAudio, jacSpeak } from "@/lib/jac-tts";

/**
 * useSpeechInput — platform-aware STT hook.
 *
 * On iOS → WhisperProvider (MediaRecorder → /api/jac/stt)
 * On Web/Android → WebSpeechProvider (native SpeechRecognition)
 *
 * Consumers see the same API regardless of provider:
 *   { listening, transcribing, start, stop, supported }
 *
 * `transcribing` is only true during Whisper upload/processing.
 * The mic button should show a spinner while transcribing.
 */
export function useSpeechInput(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const providerRef = useRef(getSTTProvider());
  const cbRef = useRef(onResult);
  cbRef.current = onResult;

  // Poll provider state so React re-renders on provider transitions
  useEffect(() => {
    const p = providerRef.current;
    const id = setInterval(() => {
      const l = p.isListening();
      const t = p.isTranscribing();
      setListening(l);
      setTranscribing(t);
    }, 150);
    return () => clearInterval(id);
  }, []);

  const start = useCallback(() => {
    const p = providerRef.current;
    if (!p.isSupported() || p.isListening() || p.isTranscribing()) return;
    p.startListening((text) => {
      // Pass ALL sentinels through to the consumer so it can show the user
      // actionable feedback instead of silently doing nothing.
      cbRef.current(text);
    });
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    providerRef.current.stopListening();
    // transcribing state will be picked up by the poll above
  }, []);

  useEffect(() => () => { try { providerRef.current.stopListening(); } catch {} }, []);

  return {
    listening,
    transcribing,
    start,
    stop,
    supported: providerRef.current.isSupported(),
    providerName: providerRef.current.name,
  };
}

export function useSpeechOutput() {
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem("jac_muted") === "1"; } catch { return false; }
  });
  // Direct JAC speech is served by ElevenLabs, not a browser-installed voice.
  const supported = typeof window !== "undefined";

  const speak = useCallback((text: string) => {
    if (!supported || muted) return;
    void jacSpeak(text, { muted });
  }, [supported, muted]);

  const cancel = useCallback(() => {
    cancelAllJacAudio();
  }, [supported]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try { localStorage.setItem("jac_muted", next ? "1" : "0"); } catch {}
      if (next) cancelAllJacAudio();
      return next;
    });
  }, []);

  return { speak, cancel, muted, toggleMute, supported };
}
