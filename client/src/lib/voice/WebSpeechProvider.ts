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
        if ((e as any).error === "not-allowed") onResult("__mic_denied__");
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
