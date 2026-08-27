import { JAC_ELEVENLABS_VOICE_ID } from "@shared/jac-voice";

/**
 * Add this to every JAC ConvAI session request. Keeping it in one helper
 * prevents individual JAC surfaces from accidentally starting with the agent's
 * default or a browser-selected voice.
 */
export function createJacConvaiVoiceOverride() {
  return { tts: { voiceId: JAC_ELEVENLABS_VOICE_ID } };
}