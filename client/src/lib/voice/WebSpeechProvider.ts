import type { STTProvider, STTCallback } from "./VoiceProvider";

const SR: typeof SpeechRecognition | null =
  typeof window !== "undefined"
    ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
    : null;

export class WebSpeechProvider implements STTProvider {
  readonly name = "webspeech";
  private _rec: SpeechRecognition | null = null;
  private _listening = false;
  private _transcribing = false;

  isSupported(): boolean { return !!SR; }
  isListening(): boolean { return this._listening; }
  isTranscribing(): boolean { return this._transcribing; }

  startListening(onResult: STTCallback): void {
    if (!SR || this._listening) return;
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
        if (text) onResult(text);
      };

      rec.onend = () => { this._listening = false; };

      rec.onerror = (e) => {
        this._listening = false;
        const err = (e as any).error;
        if (err === "not-allowed" || err === "service-not-allowed") onResult("__mic_denied__");
        else if (err === "no-speech") onResult("__whisper_empty__");
        else if (err === "aborted") { /* user or system cancelled — no feedback needed */ }
        else onResult("__mic_error__");
      };

      rec.start();
      this._rec = rec;
      this._listening = true;
    } catch {
      this._listening = false;
    }
  }

  stopListening(): void {
    try { this._rec?.stop(); } catch {}
    this._listening = false;
  }
}
