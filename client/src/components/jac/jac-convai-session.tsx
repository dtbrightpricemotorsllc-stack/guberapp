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

// ── Mic + WebRTC diagnostic patches ──────────────────────────────────────────
//
// These patches intercept EVERY getUserMedia call (including ElevenLabs SDK
// internal ones) and EVERY RTCPeerConnection.addTrack call, so we can trace
// the complete microphone flow end-to-end in adb logcat / browser console.
//
// Idempotent — guarded by __guberMicDiagInstalled so hot-reloads don't
// double-wrap.  Only installed in a browser context.
//
// Test 1: permission-check stream (our getUserMedia call in boot())
// Test 2: ElevenLabs internal stream (SDK's own getUserMedia + addTrack)
if (typeof window !== "undefined" && !(window as any).__guberMicDiagInstalled) {
  (window as any).__guberMicDiagInstalled = true;

  // Patch navigator.mediaDevices.getUserMedia ──────────────────────────────
  if (navigator?.mediaDevices?.getUserMedia) {
    const _origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function (constraints: MediaStreamConstraints) {
      console.log("[JAC MIC DIAG] getUserMedia called — constraints:", JSON.stringify(constraints));
      try {
        const stream = await _origGUM(constraints);
        const audioTracks = stream.getAudioTracks();
        console.log(`[JAC MIC DIAG] getUserMedia SUCCESS — ${audioTracks.length} audio track(s), ${stream.getVideoTracks().length} video track(s)`);
        audioTracks.forEach((t, i) => {
          console.log(
            `[JAC MIC DIAG] audio track[${i}]: label="${t.label}" ` +
            `enabled=${t.enabled} muted=${t.muted} readyState="${t.readyState}"`
          );
        });
        return stream;
      } catch (err: any) {
        console.error(`[JAC MIC DIAG] getUserMedia FAILED: ${err?.name} — ${err?.message}`);
        throw err;
      }
    };
  }

  // Patch RTCPeerConnection.addTrack ───────────────────────────────────────
  // Fires when ElevenLabs SDK feeds the mic stream into the WebRTC peer.
  if (typeof RTCPeerConnection !== "undefined") {
    const _origAddTrack = RTCPeerConnection.prototype.addTrack;
    RTCPeerConnection.prototype.addTrack = function (
      track: MediaStreamTrack,
      ...streams: MediaStream[]
    ) {
      if (track.kind === "audio") {
        console.log(
          `[JAC MIC DIAG] RTCPeerConnection.addTrack — kind=audio ` +
          `label="${track.label}" enabled=${track.enabled} muted=${track.muted} readyState="${track.readyState}"`
        );
      }
      return _origAddTrack.call(this, track, ...streams);
    };
  }
}

import { Component, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { ReactNode } from "react";
import { useConversation } from "@elevenlabs/react";
import { apiRequest } from "@/lib/queryClient";
import { unlockAudioContext, setJacConvaiActive, cancelAllJacAudio } from "@/lib/jac-tts";

// ── Voice telemetry beacon ────────────────────────────────────────────────────
// Fire-and-forget POST so the server can log connection outcomes without any
// client-side latency impact. Errors are silently swallowed — telemetry must
// never break the voice session itself.
function sendVoiceTelemetry(
  event: "connect" | "timeout" | "error" | "disconnect",
  platform: string,
  reason?: string,
  voiceToken?: string | null,
): void {
  try {
    const body: Record<string, string> = { event, platform };
    if (reason)      body.reason     = reason.slice(0, 120);
    // Include the server-issued voice token so the server can verify this is a
    // real session outcome (not a forged beacon from an anonymous caller).
    if (voiceToken)  body.voiceToken = voiceToken;
    fetch("/api/jac/convai/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // swallow — telemetry must never throw
  }
}

// ── Test 1: Mic input diagnostic helper ──────────────────────────────────────
//
// Logs track metadata + measures audio levels via AnalyserNode for 600 ms.
// Treated as a separate test from Test 2 (JAC audio output / ElevenLabs TTS).
//
// Does NOT stop the stream — caller is responsible for .stop().
// Non-blocking: resolves after the sampling window or 1 s hard timeout.
async function diagnoseMicStream(stream: MediaStream, platform: string): Promise<void> {
  const tracks = stream.getAudioTracks();
  console.log(`[JAC MIC TEST 1] platform=${platform} — permission-check stream open`);

  if (tracks.length === 0) {
    console.warn("[JAC MIC TEST 1] ⚠️  getUserMedia returned 0 audio tracks — mic may not be accessible");
    return;
  }

  tracks.forEach((t, i) => {
    console.log(
      `[JAC MIC TEST 1] track[${i}]:` +
      ` label="${t.label || "(empty)"}` +
      ` enabled=${t.enabled}` +
      ` muted=${t.muted}` +
      ` readyState="${t.readyState}"`
    );
  });

  if (tracks[0].readyState !== "live") {
    console.warn(`[JAC MIC TEST 1] ⚠️  track readyState="${tracks[0].readyState}" — expected "live"`);
    return;
  }

  // Measure audio levels for 600 ms to confirm non-zero microphone capture.
  // A maxRMS of 0 means the mic is open but no sound is reaching the app.
  await new Promise<void>((resolve) => {
    const hardTimeout = setTimeout(resolve, 1000);
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      let maxRMS = 0;
      const deadline = Date.now() + 600;

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let j = 0; j < buf.length; j++) sum += (buf[j] - 128) ** 2;
        const rms = Math.sqrt(sum / buf.length);
        if (rms > maxRMS) maxRMS = rms;

        if (Date.now() < deadline) { requestAnimationFrame(tick); return; }

        const detected = maxRMS > 0.5;
        console.log(
          `[JAC MIC TEST 1] Audio level: maxRMS=${maxRMS.toFixed(2)}` +
          (detected
            ? " ✅ NON-ZERO AUDIO DETECTED — mic is capturing sound"
            : " ⚠️  SILENT — mic open but no audio captured; check if muted or speak closer")
        );
        clearTimeout(hardTimeout);
        try { ctx.close(); } catch { /* ignore */ }
        resolve();
      };

      requestAnimationFrame(tick);
    } catch (levelErr) {
      console.warn("[JAC MIC TEST 1] Level check skipped (AnalyserNode error):", levelErr);
      clearTimeout(hardTimeout);
      resolve();
    }
  });
}

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

    // Platform ref — written by boot() so onConnect/onError/onDisconnect can
    // include it in telemetry without relying on a closure over a stale value.
    const platformRef = useRef<string>("unknown");

    // Stores the server-issued voice token once the session fetch resolves.
    // Passed to sendVoiceTelemetry so the server can verify each beacon is
    // tied to a real session (not an unauthenticated forged POST).
    const voiceTokenRef = useRef<string | null>(null);

    // Track the active prop in a ref so async callbacks (onDisconnect, timeout)
    // can read the current value without stale closures.
    const activeRef = useRef(active);
    useEffect(() => { activeRef.current = active; });

    // Connection-timeout handle — cleared on connect, disconnect, or error.
    // If JAC never reaches "connected" within CONNECTION_TIMEOUT_MS, we fire
    // onError so the UI never stays stuck on "connecting…" indefinitely.
    const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const CONNECTION_TIMEOUT_MS = 12_000;

    function clearConnectTimeout() {
      if (connectTimeoutRef.current !== null) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
    }

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
        clearConnectTimeout();
        setJacConvaiActive(true);
        cancelAllJacAudio();
        sendVoiceTelemetry("connect", platformRef.current, undefined, voiceTokenRef.current);
      },
      onDisconnect: () => {
        // Release audio ownership so text-mode TTS can resume if needed.
        clearConnectTimeout();
        setJacConvaiActive(false);
        // If the session ended while active is still true (i.e. NOT because
        // the user tapped the mic button off), this is an unexpected disconnect
        // (network drop, ElevenLabs timeout, etc.).  Without this error, the
        // phase calculation below would loop back to "connecting…" forever
        // because active stays true but status goes to "disconnected".
        if (activeRef.current && !cancelRef.current) {
          sendVoiceTelemetry("disconnect", platformRef.current, "unexpected_disconnect", voiceTokenRef.current);
          cbRef.current.onError("Voice disconnected. Tap the mic to retry.");
        }
      },
      onError: (msg: string) => {
        clearConnectTimeout();
        setJacConvaiActive(false);
        sendVoiceTelemetry("error", platformRef.current, msg || "unknown_error", voiceTokenRef.current);
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
          platformRef.current = platform; // capture for use by onConnect/onError/onDisconnect
          const isIAB = /iab/.test(platform); // facebook_iab, instagram_iab, etc.

          // In-app browsers (Facebook, Instagram, Messenger, TikTok, LinkedIn)
          // block WebRTC mic access and ElevenLabs WebSockets. Attempting
          // getUserMedia hangs indefinitely instead of rejecting, so JAC would
          // stay in "connecting…" forever. Abort immediately and fall back to
          // text-only mode with a clear message.
          if (isIAB) {
            cbRef.current.onError("IAB_NO_VOICE");
            return;
          }

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
            const micErr = micResult.reason as any;
            // Log the full error name + message so adb logcat / browser console
            // shows exactly why getUserMedia failed (NotAllowedError, etc.).
            console.error(
              `[JAC MIC TEST 1] getUserMedia FAILED: ${micErr?.name ?? "unknown"} — ${micErr?.message ?? "(no message)"}`
            );
            cbRef.current.onError(
              isIAB
                ? "Open this page in Chrome or Safari to use JAC voice — in-app browsers block the mic."
                : platform === "android_native"
                ? `Microphone blocked on Android (${micErr?.name ?? "unknown error"}). Grant mic permission in App Settings.`
                : "Mic access denied — allow mic in your browser settings."
            );
            return;
          }

          // ── Test 1: Mic input (permission-check stream) ─────────────────────
          // diagnoseMicStream logs track details + measures audio levels for 600 ms.
          // This is a separate test from Test 2 (ElevenLabs audio output below).
          await diagnoseMicStream(micResult.value as MediaStream, platform);
          (micResult.value as MediaStream).getTracks().forEach(t => t.stop());
          console.log(
            "[JAC MIC TEST 1] Permission-check stream stopped. " +
            "[JAC MIC TEST 2] ElevenLabs will now open its own getUserMedia stream + " +
            "RTCPeerConnection.addTrack — watch for [JAC MIC DIAG] log lines above."
          );

          if (sessionResult.status === "rejected") {
            const err = sessionResult.reason as any;
            if (err?.status === 401) { cbRef.current.onError("Sign in to use JAC voice."); return; }
            cbRef.current.onError("Could not reach JAC voice. Try again.");
            return;
          }

          const session = sessionResult.value;
          if (!session) { cbRef.current.onError("Voice session error. Try again."); return; }
          if (cancelRef.current) return;

          // Store the server-issued token so telemetry beacons can be verified.
          voiceTokenRef.current = session.voiceToken ?? null;

          const dynVars: Record<string, string> = {
            [session.dynamicVariableName]: session.voiceToken,
          };
          if (session.userContext?.firstName) dynVars["user_first_name"] = session.userContext.firstName;
          if (session.userContext?.role)      dynVars["user_role"]        = session.userContext.role;
          if (session.userContext?.platform)  dynVars["user_platform"]    = platform; // actual detected platform
          if (session.userContext?.jac_mode)  dynVars["jac_mode"]         = session.userContext.jac_mode;
          if (session.userContext?.userId != null) dynVars["user_id"]     = String(session.userContext.userId);
          // Pass the user's numeric ID (or "anon" for public sessions) so JAC tool
          // calls (create_job_draft, publish_job, open_guber_screen) can resolve
          // the caller without a separate auth lookup. ElevenLabs injects this into
          // every tool call payload automatically via the dynamic variable.
          dynVars["user_id"] = session.userContext?.userId != null
            ? String(session.userContext.userId)
            : "anon";

          const params: Record<string, any> = {
            dynamicVariables: dynVars,
            // Force WebSocket for every session regardless of whether we have a
            // signedUrl or fall back to agentId (public-agent mode).
            //
            // Without this, the SDK infers the connection type: signedUrl → WebSocket,
            // agentId-only → WebRTC.  WebRTC requires LiveKit ICE negotiation which
            // hangs indefinitely on Samsung Internet (and some other Android browsers)
            // without ever calling onConnect or onError, leaving JAC stuck on
            // "connecting…" forever.  WebSocket is reliable across all browsers and
            // is the correct transport for ElevenLabs ConvAI.
            connectionType: "websocket",
          };
          if (session.signedUrl) params.signedUrl = session.signedUrl;
          else                   params.agentId   = session.agentId;

          // firstMessage is overridden so ElevenLabs TTS says "Jack" (not "J-A-C" from the
          // dashboard-configured greeting which uses all-caps "JAC" — TTS spells it out as letters).
          // NOTE: overrides.agent only accepts { prompt, firstMessage, language } in SDK v1.9.0.
          // The `turn` field (turn_timeout, mode) is NOT in the SDK type and is silently dropped
          // by constructOverrides() — it never reaches ElevenLabs.  Do not add it here.
          const jacFirstMessage = suppressFirstMessage
            ? ""
            : "Hey, I'm Jack — GUBER's opportunity assistant. What can I help you with today?";
          params.overrides = {
            agent: { firstMessage: jacFirstMessage },
          };

          // Skip the SDK's built-in Android audio-mode delay (3 s).  That delay
          // was added for WebRTC/LiveKit which needs the Android AudioManager to
          // switch modes.  We force WebSocket above, so the delay is unnecessary
          // and only makes the "connecting…" state feel sluggish on Android.
          params.connectionDelay = { default: 0, android: 0, ios: 0 };

          // AudioContext was already unlocked above — start session immediately.
          if (cancelRef.current) return;
          startSession(params as any);

          // Guard against an indefinite "connecting…" state.  If the SDK's
          // webSessionSetup or WebSocket handshake hangs (network timeout,
          // STUN failure, slow ElevenLabs response, etc.), the status never
          // reaches "connected" and onConnect never fires — leaving the UI
          // stuck.  This timeout fires onError so the parent can show a
          // retry state.  It is cleared by onConnect / onDisconnect / onError.
          connectTimeoutRef.current = setTimeout(() => {
            if (!cancelRef.current) {
              sendVoiceTelemetry("timeout", platformRef.current, `no_connect_in_${CONNECTION_TIMEOUT_MS}ms`, voiceTokenRef.current);
              try { endSession(); } catch {}
              cbRef.current.onError("Voice connection timed out. Tap the mic to retry.");
            }
          }, CONNECTION_TIMEOUT_MS);

        } catch (err: any) {
          clearConnectTimeout();
          if (!cancelRef.current) cbRef.current.onError(err?.message || "Could not start JAC voice.");
        }
      }

      bootRef.current = boot;
      boot();

      return () => {
        cancelRef.current = true;
        clearConnectTimeout();
      };
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
