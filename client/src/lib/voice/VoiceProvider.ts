/**
 * JAC Voice — STT Provider Interface
 *
 * Abstraction layer so the rest of JAC never calls SpeechRecognition
 * or MediaRecorder directly. Swap providers here, not in JAC components.
 *
 * Providers:
 *   WebSpeechProvider  — browser Web Speech API (Chrome, Android, desktop)
 *   WhisperProvider    — MediaRecorder → /api/jac/stt (OpenAI Whisper; iOS-safe)
 */

export type STTCallback = (text: string) => void;

export interface STTProvider {
  /** Human-readable name for debug/logging */
  readonly name: string;
  /** True if this provider can work in the current environment */
  isSupported(): boolean;
  /** Start capturing audio. Calls onResult when transcription is ready. */
  startListening(onResult: STTCallback): void;
  /** Stop capturing. For Whisper this triggers the upload + transcription. */
  stopListening(): void;
  /** True while audio is being captured (mic is open) */
  isListening(): boolean;
  /** True while transcription is in flight (Whisper upload/processing) */
  isTranscribing(): boolean;
}
