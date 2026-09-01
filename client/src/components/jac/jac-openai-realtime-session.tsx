import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  JacOpenAIRealtimeTransport,
  type JacRealtimePhase,
} from "@/lib/jac-openai-realtime-transport";
import {
  isJacE2EVoiceHarnessEnabled,
  subscribeToJacE2EVoiceEvents,
} from "@/lib/jac-live-coordination";

export interface JacOpenAIRealtimeSessionHandle {
  activate(): void;
  toggleMute(): void;
  reconnect(): void;
  end(): void;
  speakApprovedText(text: string): void;
  readonly connected: boolean;
  readonly isMuted: boolean;
}

interface Props {
  active: boolean;
  sessionEndpoint: string;
  e2eTarget?: "homepage" | "assistant";
  onPhaseChange(phase: JacRealtimePhase): void;
  onUserTranscript(text: string): void;
  onJacResponse(text: string): void;
  onError(message: string): void;
}

/** Invisible OpenAI Realtime session controller. It stays resident so a user
 * gesture can prime browser-gated audio and microphone work before activation. */
export const JacOpenAIRealtimeSession = forwardRef<JacOpenAIRealtimeSessionHandle, Props>(
  function JacOpenAIRealtimeSession(props, ref) {
    const callbacks = useRef(props);
    callbacks.current = props;
    const transport = useRef<JacOpenAIRealtimeTransport | null>(null);
    const harness = isJacE2EVoiceHarnessEnabled();
    const harnessConnected = useRef(false);
    const harnessMuted = useRef(false);
    const gestureStartRequested = useRef(false);

    useEffect(() => {
      if (harness) {
        return subscribeToJacE2EVoiceEvents(props.e2eTarget ?? "assistant", event => {
          if (event.kind === "connect" || event.kind === "listening") {
            harnessConnected.current = true;
            callbacks.current.onPhaseChange(harnessMuted.current ? "muted" : "listening");
          } else if (event.kind === "thinking" || event.kind === "speaking") {
            harnessConnected.current = true;
            callbacks.current.onPhaseChange(event.kind);
          }
          else if (event.kind === "user-transcript" && event.text?.trim()) callbacks.current.onUserTranscript(event.text.trim());
          else if (event.kind === "assistant-response" && event.text?.trim()) callbacks.current.onJacResponse(event.text.trim());
          else if (event.kind === "error") {
            harnessConnected.current = false;
            callbacks.current.onError(event.text?.trim() || "Voice connection lost.");
          } else if (event.kind === "disconnect") {
            harnessConnected.current = false;
            callbacks.current.onError("Voice disconnected.");
          }
        });
      }

      const instance = new JacOpenAIRealtimeTransport({
        sessionEndpoint: props.sessionEndpoint,
        onPhaseChange: phase => callbacks.current.onPhaseChange(phase),
        onUserTranscript: text => callbacks.current.onUserTranscript(text),
        onJacResponse: text => callbacks.current.onJacResponse(text),
        onError: message => callbacks.current.onError(message),
      });
      transport.current = instance;
      return () => {
        if (transport.current === instance) transport.current = null;
        void instance.end();
      };
    }, [harness, props.sessionEndpoint, props.e2eTarget]);

    useEffect(() => {
      if (harness) {
        if (!props.active) {
          harnessConnected.current = false;
          callbacks.current.onPhaseChange("idle");
        } else if (!harnessConnected.current) {
          callbacks.current.onPhaseChange("connecting");
        }
        return;
      }
      const instance = transport.current;
      if (!instance) return;
      if (props.active) {
        if (!gestureStartRequested.current) void instance.start();
      } else {
        gestureStartRequested.current = false;
        void instance.end();
      }
    }, [harness, props.active, props.sessionEndpoint]);

    useImperativeHandle(ref, () => ({
      activate: () => {
        gestureStartRequested.current = true;
        if (harness) {
          callbacks.current.onPhaseChange("connecting");
          return;
        }
        transport.current?.prepareForUserGesture();
        void transport.current?.start();
      },
      toggleMute: () => {
        if (harness) {
          harnessMuted.current = !harnessMuted.current;
          callbacks.current.onPhaseChange(harnessMuted.current ? "muted" : "listening");
        } else {
          transport.current?.toggleMute();
        }
      },
      reconnect: () => {
        if (harness) callbacks.current.onPhaseChange("connecting");
        else void transport.current?.reconnect();
      },
      end: () => {
        if (harness) {
          harnessConnected.current = false;
          callbacks.current.onPhaseChange("idle");
        } else {
          void transport.current?.end();
        }
      },
      speakApprovedText: text => transport.current?.speakApprovedText(text),
      get connected() { return harness ? harnessConnected.current : (transport.current?.connected ?? false); },
      get isMuted() { return harness ? harnessMuted.current : (transport.current?.isMuted ?? false); },
    }), [harness]);

    return null;
  },
);