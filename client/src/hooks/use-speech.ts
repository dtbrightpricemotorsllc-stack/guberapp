import { useState, useCallback, useRef, useEffect } from "react";
import { loadJacVoice, applyJacVoice } from "@/lib/jac-voice";

const SR: typeof SpeechRecognition | null =
  typeof window !== "undefined"
    ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
    : null;

export function useSpeechInput(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const supported = !!SR;
  const recRef = useRef<SpeechRecognition | null>(null);
  const cbRef = useRef(onResult);
  cbRef.current = onResult;

  const start = useCallback(() => {
    if (!SR) return;
    try {
      const rec = new SR();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";
      rec.onresult = (e) => {
        const text = Array.from(e.results)
          .map((r) => r[0].transcript)
          .join(" ")
          .trim();
        if (text) cbRef.current(text);
      };
      rec.onend = () => setListening(false);
      rec.onerror = (e) => {
        setListening(false);
        // Surface actionable guidance for the two most common native failures
        if ((e as any).error === "not-allowed") {
          // Android: go to Settings → Apps → GUBER → Permissions → Microphone
          // iOS:     Settings → Privacy → Microphone → GUBER
          cbRef.current("__mic_denied__");
        }
        // "network" = webkitSpeechRecognition hit Google's cloud endpoint —
        // this only fires in WebView if the audio capture was actually granted
        // but the network call failed (offline, etc.). No user action needed.
      };
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      setListening(false);
    }
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  useEffect(() => () => { try { recRef.current?.stop(); } catch {} }, []);

  return { listening, start, stop, supported };
}

export function useSpeechOutput() {
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem("jac_muted") === "1"; } catch { return false; }
  });
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  // Kick off voice loading as soon as the hook mounts so the voice is ready
  // before the first utterance.
  useEffect(() => {
    if (supported) loadJacVoice();
  }, [supported]);

  const speak = useCallback((text: string) => {
    if (!supported || muted) return;
    try {
      window.speechSynthesis.cancel();
      const normalized = text
        .replace(/[*_#`[\]]/g, "")
        // Zip codes: exactly 5 digits → space-separated digits (e.g. 27405 → "2 7 4 0 5")
        .replace(/(?<!\d)(\d{5})(?!\d)/g, (_, z) => z.split("").join(" "))
        // Pronunciation overrides — longer phrases first
        .replace(/\bDay[-\s]?1\s+OG\b/gi, "Day One Oh Gee")
        .replace(/\bOG\b/g, "Oh Gee")
        .replace(/\bJAC\b/g, "Jack")
        .replace(/\bGUBER\b/g, "Goober")
        .slice(0, 500);
      const utt = new SpeechSynthesisUtterance(normalized);
      // Voice settings — warm, expressive, slightly sparkly
      applyJacVoice(utt);   // sets .voice + .lang
      utt.rate  = 1.05;     // normal-to-slightly-lively
      utt.pitch = 1.1;      // a touch brighter / friendlier
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
