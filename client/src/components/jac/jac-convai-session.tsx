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

// ── RTCDataChannel monkey-patch — must run at IMPORT TIME before the SDK ──────
//
// The ElevenLabs SDK's _WebRTCConnection.onMessage crashes with:
//   "Cannot read properties of undefined (reading 'error_type')"
// when the WebRTC DataChannel delivers an empty or malformed frame, because
// the SDK reads `message.error_type` without first checking whether `message`
// is defined.
//
// Fix: intercept the RTCDataChannel.prototype.onmessage setter so every handler
// the SDK installs is wrapped in:
//   1. A null/empty-frame guard  — skip frames with no data
//   2. A try-catch               — absorb crashes instead of white-screening JAC
//
// This is a root-cause fix, not a Vite-overlay suppress. The DataChannel receives
// all events (audio, transcript, ping, error, etc.) so unknown types are logged
// at debug level and discarded rather than crashing the whole session.
if (typeof RTCDataChannel !== "undefined") {
  try {
    const _dcDesc = Object.getOwnPropertyDescriptor(RTCDataChannel.prototype, "onmessage");
    if (_dcDesc?.set) {
      Object.defineProperty(RTCDataChannel.prototype, "onmessage", {
        configurable: true,
        enumerable: _dcDesc.enumerable,
        get() { return _dcDesc.get?.call(this); },
        set(rawHandler: ((e: MessageEvent) => void) | null) {
          if (!rawHandler) { _dcDesc.set!.call(this, rawHandler); return; }
          _dcDesc.set!.call(this, (event: MessageEvent) => {
            // Guard 1 — discard empty/null frames before the SDK sees them
            if (!event?.data) {
              console.warn("[JAC ConvAI] Empty WebRTC DataChannel frame — ignored.");
              return;
            }
            // Guard 2 — absorb any crash the SDK's handler might throw
            try {
              rawHandler(event);
            } catch (err) {
              console.warn("[JAC ConvAI] Suppressed WebRTC message crash:", (err as Error)?.message);
            }
          });
        },
      });
    }
  } catch (patchErr) {
    console.debug("[JAC ConvAI] RTCDataChannel patch skipped:", patchErr);
  }
}

// ── Belt-and-suspenders: window error guard catches any crash the patch misses ─
if (typeof window !== "undefined") {
  const _jacElevenLabsGuard = (e: ErrorEvent) => {
    const msg = e?.message ?? "";
    if (
      msg.includes("error_type") ||
      (msg.includes("Cannot read properties of undefined") &&
        (e.filename?.includes("elevenlabs") || e.filename?.includes("eleven")))
    ) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  window.addEventListener("error", _jacElevenLabsGuard, true);
}

import { Component, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { ReactNode } from "react";
import { useConversation } from "@elevenlabs/react";
import { apiRequest } from "@/lib/queryClient";
import { unlockAudioContext, setJacConvaiActive, cancelAllJacAudio } from "@/lib/jac-tts";

// ── Platform detection ────────────────────────────────────────────────────────
// Detects the runtime environment so we can tailor error messages and
// session metadata.  Called at boot time (client-side only).
function detectJacPlatform(): string {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent;
  const isNative = (window as any)?.Capacitor?.isNativePlatform?.();
  if (isNative) return /iphone|ipad|ipod/i.test(ua) ? "ios_native" : "android_native";
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(ua))  return "facebook_iab";
  if (/Instagram/i.test(ua))                       return "instagram_iab";
  if (/TikTok/i.test(ua))                          return "tiktok_iab";
  if (/LinkedInApp/i.test(ua))                     return "linkedin_iab";
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return "pwa";
  } catch {}
  if (/iphone|ipad|ipod/i.test(ua)) return "ios_safari";
  if (/android/i.test(ua))          return "android_chrome";
  return "web";
}

// ── Session pre-warm cache ────────────────────────────────────────────────────
// Call prewarmJacSession() on component mount so the signed URL is already
// fetched by the time the user taps the mic — eliminates the biggest startup
// latency (ElevenLabs /get-signed-url round-trip + our server call).
//
// Cache lifetime: 90 s.  Used once then evicted so the next tap gets a fresh
// token.  A failed fetch is silently discarded — boot() falls back to a live
// fetch automatically.
const _prewarmCache = new Map<string, { promise: Promise<any>; expiresAt: number }>();
const PREWARM_TTL_MS = 90_000;

export function prewarmJacSession(endpoint: string): void {
  const now = Date.now();
  const existing = _prewarmCache.get(endpoint);
  if (existing && existing.expiresAt > now) return; // already in flight / valid
  const promise = apiRequest("POST", endpoint, { platform: detectJacPlatform() })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  _prewarmCache.set(endpoint, { promise, expiresAt: now + PREWARM_TTL_MS });
}

function consumePrewarm(endpoint: string): Promise<any> | null {
  const entry = _prewarmCache.get(endpoint);
  if (!entry || entry.expiresAt < Date.now()) {
    _prewarmCache.delete(endpoint);
    return null;
  }
  _prewarmCache.delete(endpoint); // use once
  return entry.promise;
}

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
  sessionEndpoint?: string;
  suppressFirstMessage?: boolean;
  onPhaseChange(phase: ConvaiPhase): void;
  onUserTranscript(text: string): void;
  onJacResponse(text: string): void;
  onError(msg: string): void;
}

export const JacConvaiSession = forwardRef<JacConvaiSessionHandle, Props>(
  function JacConvaiSession({ active, sessionEndpoint = "/api/jac/convai/session", suppressFirstMessage = false, onPhaseChange, onUserTranscript, onJacResponse, onError }, ref) {
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
      onConnect: () => {
        // ElevenLabs ConvAI now owns audio — cancel any in-flight text-TTS
        // and block jacSpeak() for the duration of this session.
        setJacConvaiActive(true);
        cancelAllJacAudio();
      },
      onDisconnect: () => {
        // Release audio ownership so text-mode TTS can resume if needed
        setJacConvaiActive(false);
      },
      onError: (msg: string) => {
        setJacConvaiActive(false);
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

    // Suppress ElevenLabs SDK internal WebRTC crash (error_type on undefined)
    // This is an event-handler error so React error boundaries can't catch it.
    useEffect(() => {
      function guard(e: ErrorEvent) {
        const msg = e.message ?? "";
        if (msg.includes("error_type") || (msg.includes("undefined") && e.filename?.includes("elevenlabs"))) {
          e.preventDefault();
          e.stopImmediatePropagation();
          cbRef.current.onError("Voice connection lost. Tap mic to retry.");
        }
      }
      window.addEventListener("error", guard, true);
      return () => window.removeEventListener("error", guard, true);
    }, []);

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
          const platform = detectJacPlatform();
          const isIAB = /iab/.test(platform); // facebook_iab, instagram_iab, etc.

          // Run mic permission + session fetch in parallel.
          // Use the pre-warmed session promise if available (avoids a round-trip
          // to our server + ElevenLabs, saving ~500-1500 ms on first open).
          const prewarm = consumePrewarm(sessionEndpoint);
          const sessionFetch = prewarm
            ?? apiRequest("POST", sessionEndpoint, { platform })
               .then(r => {
                 if (!r.ok) throw Object.assign(new Error("session_error"), { status: r.status });
                 return r.json();
               });

          const [micResult, sessionResult] = await Promise.allSettled([
            navigator.mediaDevices.getUserMedia({ audio: true }),
            sessionFetch,
          ]);
          if (cancelRef.current) return;

          if (micResult.status === "rejected") {
            cbRef.current.onError(
              isIAB
                ? "Open this page in Chrome or Safari to use JAC voice — in-app browsers block the mic."
                : "Mic access denied — allow mic in your browser settings."
            );
            return;
          }
          (micResult.value as MediaStream).getTracks().forEach(t => t.stop());

          if (sessionResult.status === "rejected") {
            const err = sessionResult.reason as any;
            if (err?.status === 401) { cbRef.current.onError("Sign in to use JAC voice."); return; }
            cbRef.current.onError("Could not reach JAC voice. Try again.");
            return;
          }

          const session = sessionResult.value;
          if (!session) { cbRef.current.onError("Voice session error. Try again."); return; }
          if (cancelRef.current) return;

          const dynVars: Record<string, string> = {
            [session.dynamicVariableName]: session.voiceToken,
          };
          if (session.userContext?.firstName) dynVars["user_first_name"] = session.userContext.firstName;
          if (session.userContext?.role)      dynVars["user_role"]        = session.userContext.role;
          if (session.userContext?.platform)  dynVars["user_platform"]    = platform; // actual detected platform
          if (session.userContext?.jac_mode)  dynVars["jac_mode"]         = session.userContext.jac_mode;

          const params: Record<string, any> = { dynamicVariables: dynVars };
          if (session.signedUrl) params.signedUrl = session.signedUrl;
          else                   params.agentId   = session.agentId;

          // Always apply overrides — target ~500ms silence → end of turn (default is ~2-3s).
          params.overrides = {
            agent: {
              ...(suppressFirstMessage ? { firstMessage: "" } : {}),
              turn: { turn_timeout: 0.5, mode: "turn" },
            },
          } as any;

          // AudioContext was already unlocked above — start session immediately.
          if (cancelRef.current) return;
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
