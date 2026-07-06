/**
 * Internal test page for the flag-gated ElevenLabs ConvAI voice pipeline
 * (voice_pipeline_v2). Not linked from anywhere in the app nav — reach it
 * directly at /jac-voice-test while logged in as an allowlisted tester.
 */
import { JacConvaiVoice } from "@/components/jac/jac-convai-voice";

export default function JacVoiceTest() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-lg font-display font-bold" data-testid="text-jac-voice-test-title">
          JAC Voice Test (internal)
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Behind the <code>voice_pipeline_v2</code> flag. If nothing appears
          below, the flag isn't enabled for your account.
        </p>
      </div>
      <JacConvaiVoice />
    </div>
  );
}
