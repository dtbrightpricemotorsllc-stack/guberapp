import { useState, useCallback, useRef, useEffect } from "react";

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
      rec.onerror = () => setListening(false);
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

  const speak = useCallback((text: string) => {
    if (!supported || muted) return;
    try {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(
        text.replace(/[*_#`[\]]/g, "").slice(0, 500)
      );
      utt.rate = 1.05;
      utt.pitch = 1.0;
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
