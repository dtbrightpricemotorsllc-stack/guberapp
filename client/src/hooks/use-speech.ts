import { useState, useCallback, useRef, useEffect } from "react";
import { loadJacVoice, applyJacVoice } from "@/lib/jac-voice";
import { getSTTProvider } from "@/lib/voice";

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
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (supported) loadJacVoice();
  }, [supported]);

  const speak = useCallback((text: string) => {
    if (!supported || muted) return;
    try {
      window.speechSynthesis.cancel();
      const normalized = text
        .replace(/[*_#`[\]]/g, "")
        .replace(/(?<!\d)(\d{5})(?!\d)/g, (_, z) => z.split("").join(" "))
        .replace(/\bDay[-\s]?1\s+OG\b/gi, "Day One Oh Gee")
        .replace(/\bOG\b/g, "Oh Gee")
        .replace(/\bJAC\b/g, "Jack")
        .replace(/\bGUBER\b/g, "Goober")
        .slice(0, 500);
      const utt = new SpeechSynthesisUtterance(normalized);
      applyJacVoice(utt);
      utt.rate  = 1.05;
      utt.pitch = 1.1;
      utt.volume = 1.0;
      window.speechSynthesis.speak(utt);
    } catch {}
  }, [supported, muted]);

  const cancel = useCallback(() => {
    if (supported) try { window.speechSynthesis.cancel(); } catch {}
  }, [supported]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try { localStorage.setItem("jac_muted", next ? "1" : "0"); } catch {}
      if (next) try { window.speechSynthesis?.cancel(); } catch {}
      return next;
    });
  }, []);

  return { speak, cancel, muted, toggleMute, supported };
}
