/**
 * JacConvaiSession — invisible ElevenLabs ConvAI session controller.
 *
 * Renders null. Manages the full session lifecycle (mic permission +
 * session token + ConvAI connect/disconnect). Reports all state changes
 * via callbacks so the parent JAC UI can reflect them without any
 * ElevenLabs-branded chrome appearing.
 *
 * Must be rendered inside a <ConversationProvider>.
 */
import { Component, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { ReactNode } from "react";
import { useConversation } from "@elevenlabs/react";
import { apiRequest } from "@/lib/queryClient";
import { unlockAudioContext } from "@/lib/jac-tts";

export type ConvaiPhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "muted"
  | "error";

export interface JacConvaiSessionHandle {
  toggleMute(): void;
  reconnect(): void;
}

interface Props {
  active: boolean;
  onPhaseChange(phase: ConvaiPhase): void;
  onUserTranscript(text: string): void;
  onJacResponse(text: string): void;
  onError(msg: string): void;
}

export const JacConvaiSession = forwardRef<JacConvaiSessionHandle, Props>(
  function JacConvaiSession({ active, onPhaseChange, onUserTranscript, onJacResponse, onError }, ref) {
    const cbRef = useRef({ onPhaseChange, onUserTranscript, onJacResponse, onError });
    useEffect(() => {
      cbRef.current = { onPhaseChange, onUserTranscript, onJacResponse, onError };
    });

    const {
      startSession,
      endSession,
      status,
      isSpeaking,
      isListening,
      isMuted,
      setMuted,
    } = useConversation({
      onConnect: () => {},
      onDisconnect: () => {},
      onError: (msg: string) => {
        cbRef.current.onError(msg || "Voice connection lost.");
      },
      onMessage: (({ source, message }: { source: "ai" | "user"; message: string }) => {
        if (!message?.trim()) return;
        if (source === "user") cbRef.current.onUserTranscript(message.trim());
        else cbRef.current.onJacResponse(message.trim());
      }) as any,
    });

    const connected = status === "connected";

    // Report phase changes — never call setState during render, always via effect
    const prevPhaseRef = useRef<ConvaiPhase>("idle");
    useEffect(() => {
      let phase: ConvaiPhase;
      if (!active)      phase = "idle";
      else if (!connected) phase = "connecting";
      else if (isMuted)    phase = "muted";
      else if (isSpeaking) phase = "speaking";
      else if (isListening) phase = "listening";
      else                  phase = "thinking";

      if (prevPhaseRef.current !== phase) {
        prevPhaseRef.current = phase;
        cbRef.current.onPhaseChange(phase);
      }
    }, [active, connected, isMuted, isSpeaking, isListening]);

    // Boot / teardown
    const bootRef = useRef<() => void>();
    const cancelRef = useRef(false);

    useEffect(() => {
      if (!active) {
        try { endSession(); } catch {}
        return;
      }

      cancelRef.current = false;

      async function boot() {
        try {
          unlockAudioContext();

          const [micResult, sessionResult] = await Promise.allSettled([
            navigator.mediaDevices.getUserMedia({ audio: true }),
            apiRequest("POST", "/api/jac/convai/session", { platform: "web" }),
          ]);
          if (cancelRef.current) return;

          if (micResult.status === "rejected") {
            cbRef.current.onError("Mic access denied — allow mic in your browser settings.");
            return;
          }
          (micResult.value as MediaStream).getTracks().forEach(t => t.stop());

          if (sessionResult.status === "rejected") {
            cbRef.current.onError("Could not reach JAC voice. Try again.");
            return;
          }
          const resp = sessionResult.value as Response;
          if (resp.status === 401) {
            cbRef.current.onError("Sign in to use JAC voice.");
            return;
          }
          if (!resp.ok) {
            cbRef.current.onError(`Voice session error (${resp.status}). Try again.`);
            return;
          }

          const session = await resp.json();
          if (cancelRef.current) return;

          const dynVars: Record<string, string> = {
            [session.dynamicVariableName]: session.voiceToken,
          };
          if (session.userContext?.firstName) dynVars["user_first_name"] = session.userContext.firstName;
          if (session.userContext?.role)      dynVars["user_role"]        = session.userContext.role;
          if (session.userContext?.platform)  dynVars["user_platform"]    = session.userContext.platform;

          const params: Record<string, any> = { dynamicVariables: dynVars };
          if (session.signedUrl) params.signedUrl = session.signedUrl;
          else                   params.agentId   = session.agentId;

          startSession(params as any);
        } catch (err: any) {
          if (!cancelRef.current) cbRef.current.onError(err?.message || "Could not start JAC voice.");
        }
      }

      bootRef.current = boot;
      boot();

      return () => { cancelRef.current = true; };
    }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

    useImperativeHandle(ref, () => ({
      toggleMute() { if (connected) setMuted(!isMuted); },
      reconnect() {
        try { endSession(); } catch {}
        setTimeout(() => bootRef.current?.(), 350);
      },
    }), [connected, isMuted, setMuted, endSession]); // eslint-disable-line react-hooks/exhaustive-deps

    return null;
  },
);

// ── Minimal error boundary — prevents SDK crashes from white-screening JAC ───
interface EBState { crashed: boolean }
export class ConvaiCrashBoundary extends Component<
  { children: ReactNode; onCrash(): void },
  EBState
> {
  state: EBState = { crashed: false };
  static getDerivedStateFromError(): EBState { return { crashed: true }; }
  componentDidCatch(err: Error) {
    console.error("[JAC ConvAI] SDK crash caught:", err.message);
    this.props.onCrash();
  }
  reset() { this.setState({ crashed: false }); }
  render() { return this.state.crashed ? null : this.props.children; }
}
