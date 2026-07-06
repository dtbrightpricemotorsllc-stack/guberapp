/**
 * JAC Voice (v2) — ElevenLabs Conversational AI web client.
 *
 * VOICE ONLY: ElevenLabs owns the microphone, turn-taking, STT and TTS. All of
 * JAC's reasoning, memory, permissions and workflows stay in GUBER — ElevenLabs
 * reaches JAC's own brain through our custom-LLM adapter (/api/jac/convai/llm),
 * so the voice provider stays swappable.
 *
 * Gated behind the `voice_pipeline_v2` flag (default OFF). The server mint
 * endpoint also returns 403 when the flag is off, so this is inert in prod even
 * if it were mounted. Not wired into any page yet — web rollout (with cost caps
 * and user sign-off) happens in a later phase. The old STT/TTS pipeline remains
 * the fallback until then.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { apiRequest } from "@/lib/queryClient";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { Button } from "@/components/ui/button";
import { Mic, PhoneOff, Loader2 } from "lucide-react";

/**
 * Screen Wake Lock helper. Audio-only calls don't count as "user activity" to
 * mobile browsers, so without this the screen dims/locks mid-conversation and
 * kills the mic. Not in older TS DOM libs, so accessed via `any`. Best-effort:
 * unsupported browsers (older Safari/iOS) just fall back to normal behavior.
 */
function useScreenWakeLock(active: boolean) {
  const sentinelRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function acquire() {
      try {
        const nav = navigator as any;
        if (!nav.wakeLock) return;
        const sentinel = await nav.wakeLock.request("screen");
        if (cancelled) {
          sentinel.release?.().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // Denied, unsupported, or backgrounded — non-fatal, call still works.
      }
    }

    function release() {
      sentinelRef.current?.release?.().catch(() => {});
      sentinelRef.current = null;
    }

    if (active) {
      acquire();
      // The lock auto-releases when the tab is backgrounded; re-acquire on
      // return so a phone call/app-switch during the conversation doesn't
      // leave the screen sleeping for the rest of the session.
      const onVisibility = () => {
        if (document.visibilityState === "visible" && !sentinelRef.current) {
          acquire();
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        cancelled = true;
        document.removeEventListener("visibilitychange", onVisibility);
        release();
      };
    }

    return () => {
      cancelled = true;
      release();
    };
  }, [active]);
}

interface ConvaiSessionResponse {
  agentId: string;
  signedUrl: string;
  voiceToken: string;
  /** Name of the SECRET dynamic variable the agent maps to x-jac-voice-token. */
  dynamicVariableName: string;
}

type Phase = "idle" | "connecting" | "live" | "error";

function JacConvaiControl() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const conversation = useConversation({
    onConnect: () => setPhase("live"),
    onDisconnect: () => setPhase("idle"),
    onError: (message: string) => {
      setErrorMsg(message || "Voice error");
      setPhase("error");
    },
  });

  useScreenWakeLock(phase === "live");

  const start = useCallback(async () => {
    setErrorMsg(null);
    setPhase("connecting");
    try {
      // Prime mic permission before the realtime socket opens, then release the
      // priming stream immediately — the SDK opens its own stream in
      // startSession, so leaving this one live would keep the mic indicator lit.
      const primeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      primeStream.getTracks().forEach((t) => t.stop());
      const res = await apiRequest("POST", "/api/jac/convai/session", { platform: "web" });
      const session = (await res.json()) as ConvaiSessionResponse;
      // Private agent → connect via the short-lived signed URL. The identity
      // token rides as a SECRET dynamic variable; ElevenLabs forwards it to our
      // adapter as a header and never exposes it to the model.
      conversation.startSession({
        signedUrl: session.signedUrl,
        dynamicVariables: { [session.dynamicVariableName]: session.voiceToken },
      });
    } catch (err: any) {
      setErrorMsg(err?.message || "Could not start voice");
      setPhase("error");
    }
  }, [conversation]);

  const stop = useCallback(() => {
    try {
      conversation.endSession();
    } catch {
      /* already closed */
    }
    setPhase("idle");
  }, [conversation]);

  const live = phase === "live";
  const connecting = phase === "connecting";

  return (
    <div className="flex flex-col items-center gap-2" data-testid="jac-convai-voice">
      {live ? (
        <Button
          type="button"
          variant="destructive"
          onClick={stop}
          data-testid="button-jac-convai-stop"
        >
          <PhoneOff className="mr-2 h-4 w-4" />
          End voice
        </Button>
      ) : (
        <Button
          type="button"
          onClick={start}
          disabled={connecting}
          data-testid="button-jac-convai-start"
        >
          {connecting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Mic className="mr-2 h-4 w-4" />
          )}
          {connecting ? "Connecting…" : "Talk to JAC"}
        </Button>
      )}

      {live && (
        <span
          className="text-xs text-muted-foreground"
          data-testid="status-jac-convai"
        >
          {conversation.isSpeaking ? "JAC is speaking…" : "Listening…"}
        </span>
      )}

      {errorMsg && (
        <span className="text-xs text-destructive" data-testid="text-jac-convai-error">
          {errorMsg}
        </span>
      )}
    </div>
  );
}

/**
 * Flag-gated entry point. Renders nothing unless `voice_pipeline_v2` is enabled
 * for the current viewer. `ConversationProvider` is required by useConversation.
 */
export function JacConvaiVoice() {
  const { enabled, isLoading } = useFeatureFlag("voice_pipeline_v2");
  if (isLoading || !enabled) return null;
  return (
    <ConversationProvider>
      <JacConvaiControl />
    </ConversationProvider>
  );
}
