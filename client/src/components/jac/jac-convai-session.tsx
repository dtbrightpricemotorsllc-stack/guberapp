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

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  Component,
} from "react";
import type { ReactNode } from "react";
import { useConversation } from "@elevenlabs/react";
import { apiRequest } from "@/lib/queryClient";
import { unlockAudioContext, setJacConvaiActive, cancelAllJacAudio } from "@/lib/jac-tts";
import { createJacConvaiVoiceOverride } from "@/lib/jac-convai-voice-lock";
import {
  isJacE2EVoiceHarnessEnabled,
  subscribeToJacE2EVoiceEvents,
} from "@/lib/jac-live-coordination";

const JAC_MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};
const ECHO_TRANSCRIPT_WINDOW_MS = 5_000;

function normalizeTranscriptForEchoCheck(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Reject an echoed copy of JAC's own recent output without suppressing a different user barge-in. */
export function isJacEchoTranscript(userText: string, assistantText: string | null, spokenAt: number, now = Date.now()): boolean {
  if (!assistantText || now - spokenAt > ECHO_TRANSCRIPT_WINDOW_MS) return false;
  const user = normalizeTranscriptForEchoCheck(userText);
  const assistant = normalizeTranscriptForEchoCheck(assistantText);
  if (user.length < 8 || assistant.length < 8) return false;
  return user === assistant || (user.length >= 16 && (assistant.includes(user) || user.includes(assistant)));
}

let convaiMicConstraintLeases = 0;

function acquireConvaiMicConstraints(): void {
  convaiMicConstraintLeases++;
}

function releaseConvaiMicConstraints(): void {
  convaiMicConstraintLeases = Math.max(0, convaiMicConstraintLeases - 1);
}

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

  if (navigator.mediaDevices) {
    const _origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function (constraints: MediaStreamConstraints) {
      const requested = convaiMicConstraintLeases > 0 && constraints?.audio !== false
        ? {
            ...constraints,
            audio: {
              ...(typeof constraints.audio === "object" ? constraints.audio : {}),
              ...JAC_MIC_CONSTRAINTS,
            },
          }
        : constraints;
      console.log("[JAC MIC DIAG] getUserMedia called — constraints:", JSON.stringify(requested));
      try {
        const stream = await _origGUM(requested);
        const audioTracks = stream.getAudioTracks();
        console.log(`[JAC MIC DIAG] getUserMedia SUCCESS — ${audioTracks.length} audio track(s), ${stream.getVideoTracks().length} video track(s)`);
        audioTracks.forEach((t, i) => {
          console.log(
            `[JAC MIC DIAG] audio track[${i}]: label="${t.label}" ` +
            `enabled=${t.enabled} muted=${t.muted} readyState="${t.readyState}"`
          );
          // ── Mid-session mic revocation guard ──────────────────────────────
          t.addEventListener("ended", () => {
            console.warn(`[JAC ConvAI] Mic track[${i}] ended mid-session — signalling mic-lost`);
            _fireMicLost();
          });
          t.addEventListener("mute", () => {
            console.warn(
              `[JAC ConvAI] Mic track[${i}] muted mid-session — readyState="${t.readyState}"`
            );
            _fireMicLost();
          });
        });
        return stream;
      } catch (err: any) {
        console.error(`[JAC MIC DIAG] getUserMedia FAILED: ${err?.name} — ${err?.message}`);
        throw err;
      }
    };
  }

  // Patch RTCPeerConnection.addTrack ───────────────────────────────────────
  // Belt-and-suspenders: also attaches _fireMicLost() listeners at the WebRTC
  // layer so revocation is caught even if the WebSocket transport switches paths.
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
        track.addEventListener("ended", () => {
          console.warn("[JAC ConvAI] Mic track ended mid-session — signalling mic-lost");
          _fireMicLost();
        });
        track.addEventListener("mute", () => {
          console.warn(
            `[JAC ConvAI] Mic track muted mid-session — readyState="${track.readyState}"`
          );
          _fireMicLost();
        });
      }
      return _origAddTrack.call(this, track, ...streams);
    };
  }
}

// ── Voice telemetry ───────────────────────────────────────────────────────────
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
// Logs track metadata + measures audio levels via AnalyserNode for 150 ms.
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
      const deadline = Date.now() + 150;

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
  /** true when the ElevenLabs WebSocket is fully connected */
  readonly connected: boolean;
  /** true when the mic is currently muted */
  readonly isMuted: boolean;
}

interface MicLostToken {
  cb: (() => void) | null;
}

interface Props {
  active: boolean;
  sessionEndpoint?: string;
  e2eTarget?: "homepage" | "assistant";
  suppressFirstMessage?: boolean;
  onPhaseChange(phase: ConvaiPhase): void;
  onUserTranscript(text: string): void;
  onJacResponse(text: string): void;
  onError(msg: string): void;
}

export const JacConvaiSession = forwardRef<JacConvaiSessionHandle, Props>(
  function JacConvaiSession({ active, sessionEndpoint = "/api/jac/convai/session", e2eTarget = "assistant", suppressFirstMessage = false, onPhaseChange, onUserTranscript, onJacResponse, onError }, ref) {
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

    // Mic-lost flag — set to true by the arm callback before it calls endSession()
    // so onDisconnect (which fires shortly after) can suppress its own second error.
    // Using a dedicated ref instead of cancelRef.current means the normal retry path
    // (active → false → true via tap) still works: cancelRef is reset at the top of
    // the active=true effect, but micLostRef is only ever set/cleared here.
    const micLostRef = useRef(false);
    const intentionalReconnectRef = useRef(false);
    const reconnectEpochRef = useRef(0);

    // Per-instance token for the _micLostRegistry.  Created when the guard is
    // armed (after startSession), removed when the session tears down.  Storing
    // it in a ref means each render/effect closure always touches the same token,
    // and cleanup of THIS instance never touches another instance's token.
    const micLostTokenRef = useRef<MicLostToken | null>(null);
    const latestAssistantSpeechRef = useRef<{ text: string; at: number } | null>(null);
    const micConstraintLeaseRef = useRef(false);
    const e2eHarnessEnabled = isJacE2EVoiceHarnessEnabled();
    const [e2eConnected, setE2EConnected] = useState(false);

    const releaseMicConstraintLease = () => {
      if (!micConstraintLeaseRef.current) return;
      micConstraintLeaseRef.current = false;
      releaseConvaiMicConstraints();
    };

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
        intentionalReconnectRef.current = false;
        // ElevenLabs ConvAI now owns audio — cancel any in-flight text-TTS
        // and block jacSpeak() for the duration of this session.
        console.log("[JAC ConvAI] onConnect — session established ✓ platform=" + platformRef.current);
        clearConnectTimeout();
        setJacConvaiActive(true);
        cancelAllJacAudio();
        sendVoiceTelemetry("connect", platformRef.current, undefined, voiceTokenRef.current);
      },
      onDisconnect: () => {
        releaseMicConstraintLease();
        // Release audio ownership so text-mode TTS can resume if needed.
        console.warn(
          "[JAC ConvAI] onDisconnect — active=" + activeRef.current +
          " cancel=" + cancelRef.current +
          " micLost=" + micLostRef.current +
          " platform=" + platformRef.current
        );
        clearConnectTimeout();
        setJacConvaiActive(false);
        // Disarm this instance's mic-lost token — session is intentionally gone.
        if (micLostTokenRef.current) { _disarmToken(micLostTokenRef.current); micLostTokenRef.current = null; }
        // If micLostRef is set, this disconnect was triggered by our own
        // mic-lost teardown — the caller already surfaced "Mic lost" to the
        // user, so suppress the second "Voice disconnected" bubble here.
        if (micLostRef.current) { micLostRef.current = false; return; }
        if (intentionalReconnectRef.current) {
          return;
        }
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
        releaseMicConstraintLease();
        // Log the full SDK error message so Samsung Browser / Android console
        // captures 401 auth failures, 429 rate limits, WebSocket close codes,
        // and any other status the SDK surfaces — rather than silently swapping
        // to the fallback state loop.
        console.error(
          "[JAC ConvAI] onError — msg=" + (msg || "(empty)") +
          " active=" + activeRef.current +
          " platform=" + platformRef.current
        );
        clearConnectTimeout();
        setJacConvaiActive(false);
        // Disarm this instance's mic-lost token so a track "ended" event that
        // arrives after the ElevenLabs error callback doesn't fire redundantly.
        if (micLostTokenRef.current) { _disarmToken(micLostTokenRef.current); micLostTokenRef.current = null; }
        if (intentionalReconnectRef.current) {
          return;
        }
        // Gate on activeRef so a stale SDK error that arrives after the session
        // was torn down (or before it was ever started) doesn't show an error
        // bubble to a user who never tapped the mic.
        if (!activeRef.current) return;
        sendVoiceTelemetry("error", platformRef.current, msg || "unknown_error", voiceTokenRef.current);
        cbRef.current.onError(msg || "Voice connection lost.");
      },
      onMessage: (({ source, message }: { source: "ai" | "user"; message: string }) => {
        if (!message?.trim()) return;
        const text = message.trim();
        if (source === "user") {
          const recentSpeech = latestAssistantSpeechRef.current;
          if (recentSpeech && isJacEchoTranscript(text, recentSpeech.text, recentSpeech.at)) {
            console.warn("[JAC ConvAI] Ignored echoed assistant audio presented as a user transcript.");
            return;
          }
          cbRef.current.onUserTranscript(text);
        } else {
          latestAssistantSpeechRef.current = { text, at: Date.now() };
          cbRef.current.onJacResponse(text);
        }
      }) as any,
    });

    const connected = e2eHarnessEnabled ? e2eConnected : status === "connected";
    useEffect(() => subscribeToJacE2EVoiceEvents(e2eTarget, (event) => {
      if (event.kind === "connect" || event.kind === "listening") {
        intentionalReconnectRef.current = false;
        setE2EConnected(true);
        cbRef.current.onPhaseChange("listening");
        return;
      }
      if (event.kind === "thinking" || event.kind === "speaking") {
        setE2EConnected(true);
        cbRef.current.onPhaseChange(event.kind);
        return;
      }
      if (event.kind === "user-transcript" && event.text?.trim()) {
        cbRef.current.onUserTranscript(event.text.trim());
        return;
      }
      if (event.kind === "assistant-response" && event.text?.trim()) {
        cbRef.current.onJacResponse(event.text.trim());
        return;
      }
      if (event.kind === "error") {
        setE2EConnected(false);
        cbRef.current.onError(event.text?.trim() || "Voice connection lost.");
        return;
      }
      if (event.kind === "disconnect") {
        setE2EConnected(false);
        cbRef.current.onError("Voice disconnected. Tap the mic to retry.");
      }
    }), [e2eTarget]);

    // Report phase changes — never call setState during render, always via effect
    const prevPhaseRef = useRef<ConvaiPhase>("idle");
    useEffect(() => {
      if (e2eHarnessEnabled) return;
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
    }, [active, connected, e2eHarnessEnabled, isMuted, isSpeaking, isListening]);

    // Suppress ElevenLabs SDK internal WebRTC crash (error_type on undefined)
    // This is an event-handler error so React error boundaries can't catch it.
    // Guard is gated on activeRef so import-time monkey-patch errors (RTCDataChannel,
    // getUserMedia) that fire before the user taps the mic don't incorrectly surface
    // the "Voice is having trouble connecting" bubble (reproduces on Samsung Browser).
    useEffect(() => {
      function guard(e: ErrorEvent) {
        if (!activeRef.current) return; // session not started — ignore
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
          if (isIAB) {
            intentionalReconnectRef.current = false;
            cbRef.current.onError("IAB_NO_VOICE");
            return;
          }

          if (e2eHarnessEnabled) {
            if (cancelRef.current) return;
            const sessionResponse = await apiRequest("POST", sessionEndpoint, { platform });
            if (cancelRef.current) return;
            if (!sessionResponse.ok) {
              throw Object.assign(new Error("session_error"), { status: sessionResponse.status });
            }
            const session = await sessionResponse.json();
            if (cancelRef.current) return;
            if (!session) {
              cbRef.current.onError("Voice session error. Try again.");
              return;
            }
            voiceTokenRef.current = session.voiceToken ?? null;
            intentionalReconnectRef.current = false;
            setE2EConnected(false);
            cbRef.current.onPhaseChange("connecting");
            return;
          }

          // Capability-test getUserMedia with a timeout so browsers that hang
          // the call indefinitely (some IAB environments) resolve within 7 s
          // rather than blocking forever. A timeout rejection is treated the
          // same as an explicit denial: JAC falls back gracefully via onError.
          const getUserMediaWithTimeout = (constraints: MediaStreamConstraints, ms = 7000) =>
            Promise.race([
              navigator.mediaDevices.getUserMedia(constraints),
              new Promise<MediaStream>((_, rej) =>
                setTimeout(() => rej(new Error("getUserMedia timed out after " + ms + "ms")), ms)
              ),
            ]);

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
            getUserMediaWithTimeout({ audio: JAC_MIC_CONSTRAINTS }),
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
            intentionalReconnectRef.current = false;
            cbRef.current.onError(
              platform === "android_native"
                ? `Microphone blocked on Android (${micErr?.name ?? "unknown error"}). Grant mic permission in App Settings.`
                : "Mic access denied."
            );
            return;
          }

          // ── Test 1: Mic input (permission-check stream) ─────────────────────
          // diagnoseMicStream logs track details + measures audio levels for 150 ms.
          // This is a separate test from Test 2 (ElevenLabs audio output below).
          const testStream = micResult.value as MediaStream;
          await diagnoseMicStream(testStream, platform);
          // Do NOT stop the test stream here.  Stopping immediately before
          // startSession() causes a race on Samsung Browser / Android Chrome
          // where the browser is still releasing the mic device when the SDK
          // calls getUserMedia() again — resulting in a silent stream or a
          // second permission prompt.  Instead, stop it 600 ms after
          // startSession() has had time to open its own stream.
          console.log(
            "[JAC MIC TEST 1] Diagnostics complete (stream kept alive). " +
            "[JAC MIC TEST 2] ElevenLabs will now open its own getUserMedia stream — " +
            "watch for [JAC MIC DIAG] log lines."
          );

          if (sessionResult.status === "rejected") {
            const err = sessionResult.reason as any;
            intentionalReconnectRef.current = false;
            if (err?.status === 401) { cbRef.current.onError("Sign in to use JAC voice."); return; }
            cbRef.current.onError("Could not reach JAC voice. Try again.");
            return;
          }

          const session = sessionResult.value;
          if (!session) {
            intentionalReconnectRef.current = false;
            cbRef.current.onError("Voice session error. Try again.");
            return;
          }
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

          // SDK v1.9.0: signedUrl → WebSocket transport (SDK infers this automatically).
          // agentId-only would fall back to WebRTC/LiveKit which hangs indefinitely
          // on Samsung Internet.  We always pass signedUrl so WebSocket is used.
          // NOTE: connectionType and connectionDelay are NOT in the SDK v1.9.0 type
          // and are silently dropped — do not add them.
          const params: Record<string, any> = {
            dynamicVariables: dynVars,
            overrides: createJacConvaiVoiceOverride(),
          };
          if (session.signedUrl) params.signedUrl = session.signedUrl;
          else                   params.agentId   = session.agentId;

          // Do NOT suppress ElevenLabs' firstMessage.  Sending firstMessage:""
          // causes the ElevenLabs server to close the WebSocket immediately after
          // accepting the handshake (telemetry: connect → unexpected_disconnect
          // on every attempt).  Letting ElevenLabs play its configured firstMessage
          // is the correct UX for the splash-tap flow: user taps once and JAC speaks.
          // The static text greeting in the React UI is replaced by the first
          // ConvAI transcript via handleConvaiJacResponse (see jac-homepage.tsx).

          // AudioContext was already unlocked above — start session immediately.
          if (cancelRef.current) return;
          if (!micConstraintLeaseRef.current) {
            micConstraintLeaseRef.current = true;
            acquireConvaiMicConstraints();
          }
          console.log("[JAC ConvAI] startSession — transport=" + (session.signedUrl ? "websocket/signed" : "agentId/public"));
          startSession(params as any);

          // Stop the permission-test stream after the SDK has had time to open its
          // own getUserMedia.  600 ms is generous; SDK typically opens within 100 ms.
          const _ts = testStream;
          setTimeout(() => {
            _ts.getTracks().forEach(t => t.stop());
            console.log("[JAC MIC TEST 1] Permission-check stream stopped (deferred 600 ms).");
          }, 600);

          // ── Mid-session mic-lost guard ──────────────────────────────────────
          // Create a per-instance token and add it to the _micLostRegistry AFTER
          // startSession() so the getUserMedia / addTrack patches have a handler
          // to call when Samsung Internet / Android WebView revokes the mic track
          // (e.g. screen lock or backgrounding mid-session).
          // We delay one tick so cancelRef has a chance to flip true if the
          // effect cleanup runs synchronously (fast un-mount edge case).
          // Using a per-instance token (not a module-global singleton) ensures
          // that two simultaneous JacConvaiSession mounts (homepage + assistant
          // sheet) own independent tokens — unmounting one never disarms the other.
          setTimeout(() => {
            if (cancelRef.current) return;
            const token: MicLostToken = { cb: null };
            micLostTokenRef.current = token;
            _micLostRegistry.add(token);
            token.cb = () => {
              if (cancelRef.current) return; // deliberate teardown already in progress
              console.warn("[JAC ConvAI] Mic lost mid-session — tearing down and surfacing error");
              // self-disarm (_fireMicLost already cleared token.cb, but be explicit)
              token.cb = null;
              _micLostRegistry.delete(token);
              if (micLostTokenRef.current === token) micLostTokenRef.current = null;
              // Signal onDisconnect to suppress its own error bubble — we are
              // about to surface "Mic lost" ourselves.  We use a dedicated ref
              // rather than setting cancelRef.current so the normal retry path
              // (active → false → true on the next mic tap) is not blocked:
              // cancelRef is reset at the top of the active=true effect run,
              // so keeping it false here ensures boot() can start a fresh session.
              micLostRef.current = true;
              try { endSession(); } catch {}
              cbRef.current.onError("Mic lost — tap the mic to reconnect.");
            };
          }, 0);

          // Guard against an indefinite "connecting…" state.  If the SDK's
          // webSessionSetup or WebSocket handshake hangs (network timeout,
          // STUN failure, slow ElevenLabs response, etc.), the status never
          // reaches "connected" and onConnect never fires — leaving the UI
          // stuck.  This timeout fires onError so the parent can show a
          // retry state.  It is cleared by onConnect / onDisconnect / onError.
          connectTimeoutRef.current = setTimeout(() => {
            if (!cancelRef.current) {
              intentionalReconnectRef.current = false;
              sendVoiceTelemetry("timeout", platformRef.current, `no_connect_in_${CONNECTION_TIMEOUT_MS}ms`, voiceTokenRef.current);
              try { endSession(); } catch {}
              cbRef.current.onError("Voice connection timed out. Tap the mic to retry.");
            }
          }, CONNECTION_TIMEOUT_MS);

        } catch (err: any) {
          clearConnectTimeout();
          intentionalReconnectRef.current = false;
          if (!cancelRef.current) cbRef.current.onError(err?.message || "Could not start JAC voice.");
        }
      }

      bootRef.current = boot;
      boot();

      return () => {
        cancelRef.current = true;
        reconnectEpochRef.current += 1;
        intentionalReconnectRef.current = false;
        try { void endSession(); } catch {}
        releaseMicConstraintLease();
        clearConnectTimeout();
        // Disarm THIS instance's mic-lost token — does not affect any other
        // mounted instance's token (e.g. guber-assistant sheet still open).
        if (micLostTokenRef.current) { _disarmToken(micLostTokenRef.current); micLostTokenRef.current = null; }
        micLostRef.current = false;
      };
    }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

    useImperativeHandle(ref, () => ({
      toggleMute() { if (connected) setMuted(!isMuted); },
      reconnect() {
        const epoch = ++reconnectEpochRef.current;
        intentionalReconnectRef.current = true;
        void (async () => {
          try {
            await Promise.resolve(endSession());
          } catch {}
          // Let terminal callbacks queued by endSession flush before the
          // replacement starts. They remain suppressed for this transition.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          if (cancelRef.current || epoch !== reconnectEpochRef.current) return;
          intentionalReconnectRef.current = false;
          bootRef.current?.();
        })();
      },
      connected,
      isMuted,
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

/**
 * Test-only escape hatch — fires _fireMicLost() directly so unit tests can
 * simulate a mid-session mic revocation without having to fake a real
 * MediaStreamTrack "ended" event from inside jsdom.
 *
 * @internal — never import or call this in production code.
 */
export function _testOnlyFireMicLost(): void {
  _fireMicLost();
}

/** Fire every armed token in the registry (then self-disarm them). */
function _fireMicLost(): void {
  for (const token of [..._micLostRegistry]) {
    if (token.cb) {
      const cb = token.cb;
      token.cb = null;
      _micLostRegistry.delete(token);
      cb();
    }
  }
}

const _micLostRegistry = new Set<MicLostToken>();

/** Remove a specific instance's token without affecting others. */
function _disarmToken(token: MicLostToken): void {
  token.cb = null;
  _micLostRegistry.delete(token);
}
