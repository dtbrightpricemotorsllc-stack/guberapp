/**
 * JAC Voice — ElevenLabs Conversational AI, production UI.
 *
 * ElevenLabs owns STT, TTS, the LLM, voice, personality, and guardrails.
 * GUBER provides a server-minted session credential, user context as dynamic
 * variables, and webhook endpoints the agent tools may call for GUBER actions.
 *
 * Exports:
 *   <JacConvaiVoice />    full "Talk to JAC" button + panel (hero / homepage)
 *   <JacConvaiBubble />   compact mic bubble for toolbars (guber-assistant)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { apiRequest } from "@/lib/queryClient";
import { Mic, MicOff, PhoneOff, Loader2, Radio, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Global session guard — only one ConvAI session at a time ─────────────────
let _convaiSessions = 0;
export function isConvaiActive(): boolean { return _convaiSessions > 0; }
function _openSession()  { _convaiSessions++; }
function _closeSession() { _convaiSessions = Math.max(0, _convaiSessions - 1); }

// ── Screen wake-lock (prevents screen sleeping mid-call) ─────────────────────
function useScreenWakeLock(active: boolean) {
  const sentinelRef = useRef<any>(null);
  useEffect(() => {
    let cancelled = false;
    async function acquire() {
      try {
        const nav = navigator as any;
        if (!nav.wakeLock) return;
        const s = await nav.wakeLock.request("screen");
        if (cancelled) { s.release?.().catch(() => {}); return; }
        sentinelRef.current = s;
      } catch { /* unsupported / backgrounded — non-fatal */ }
    }
    function release() {
      sentinelRef.current?.release?.().catch(() => {});
      sentinelRef.current = null;
    }
    if (active) {
      acquire();
      const onVis = () => {
        if (document.visibilityState === "visible" && !sentinelRef.current) acquire();
      };
      document.addEventListener("visibilitychange", onVis);
      return () => { cancelled = true; document.removeEventListener("visibilitychange", onVis); release(); };
    }
    return () => { cancelled = true; release(); };
  }, [active]);
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ConvaiSessionResponse {
  agentId: string;
  signedUrl?: string;
  voiceToken: string;
  dynamicVariableName: string;
  userContext?: { firstName?: string; role?: string; platform?: string };
}

interface TranscriptLine {
  id: number;
  source: "ai" | "user";
  text: string;
}

type DisplayPhase =
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "muted"
  | "error"
  | "ended";

const PHASE_COLOR: Record<DisplayPhase, string> = {
  connecting: "hsl(270 100% 65%)",
  listening:  "hsl(152 100% 44%)",
  thinking:   "hsl(270 100% 65%)",
  speaking:   "hsl(270 100% 78%)",
  muted:      "hsl(0 0% 50%)",
  error:      "hsl(0 85% 60%)",
  ended:      "hsl(0 0% 45%)",
};

const PHASE_LABEL: Record<DisplayPhase, string> = {
  connecting: "Connecting…",
  listening:  "Listening",
  thinking:   "Thinking…",
  speaking:   "JAC is speaking",
  muted:      "Muted",
  error:      "Connection failed",
  ended:      "Conversation ended",
};

let _lineId = 0;

// ── Modal inner (needs ConversationProvider above) ────────────────────────────
function JacConvaiModal({ onClose }: { onClose: () => void }) {
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  const [ended, setEnded]           = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const transcriptEndRef            = useRef<HTMLDivElement>(null);
  const bootRef                     = useRef<(() => void) | null>(null);

  // Register session so other entry-points know ConvAI is active.
  useEffect(() => {
    _openSession();
    return () => _closeSession();
  }, []);

  const addLine = useCallback((source: "ai" | "user", text: string) => {
    setTranscript(prev => [...prev, { id: _lineId++, source, text }]);
  }, []);

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
      console.log("[JAC] ✅ Connected");
      setErrorMsg(null);
      setEnded(false);
      setReconnecting(false);
    },
    onDisconnect: () => {
      console.log("[JAC] 🔴 Disconnected");
      setEnded(true);
    },
    onError: (msg: string) => {
      console.warn("[JAC] ⚠️ Error:", msg);
      setErrorMsg(msg || "Voice connection failed");
    },
    onMessage: ({ source, message }: { source: "ai" | "user"; message: string }) => {
      if (message?.trim()) {
        console.log(`[JAC] 💬 ${source === "ai" ? "JAC" : "You"}: ${message}`);
        addLine(source, message.trim());
      }
    },
  } as any);

  // Auto-scroll transcript to bottom whenever a new line arrives
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const connected = status === "connected";
  useScreenWakeLock(connected);

  // Phase
  let phase: DisplayPhase;
  if (errorMsg)        phase = "error";
  else if (ended)      phase = "ended";
  else if (!connected) phase = "connecting";
  else if (isMuted)    phase = "muted";
  else if (isSpeaking) phase = "speaking";
  else if (isListening) phase = "listening";
  else                 phase = "thinking";

  const color = PHASE_COLOR[phase];
  const pulse = phase === "listening" || phase === "speaking" || phase === "connecting";

  // Boot — mic + session fetched in parallel for speed
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setErrorMsg(null);
      setEnded(false);
      try {
        console.log("[JAC] 🚀 Booting (mic + session in parallel)…");

        // Kick both off simultaneously
        const [micResult, sessionResult] = await Promise.allSettled([
          navigator.mediaDevices.getUserMedia({ audio: true }),
          apiRequest("POST", "/api/jac/convai/session", { platform: "web" }),
        ]);

        if (cancelled) return;

        // Handle mic
        if (micResult.status === "fulfilled") {
          micResult.value.getTracks().forEach(t => t.stop());
          console.log("[JAC] 🎤 Mic granted");
        } else {
          throw new Error("Microphone access denied — allow mic in browser settings");
        }

        // Handle session
        if (sessionResult.status === "rejected" || !sessionResult.value.ok) {
          const code = sessionResult.status === "fulfilled" ? sessionResult.value.status : 0;
          throw new Error(`Session error ${code || "(network)"}`);
        }
        const session = (await sessionResult.value.json()) as ConvaiSessionResponse;
        if (cancelled) return;

        const aid = session.agentId;
        const maskedAid = aid.length > 12 ? aid.slice(0, 8) + "…" + aid.slice(-4) : aid.slice(0, 4) + "…";
        console.log(`[JAC] 🆔 Agent: ${maskedAid} | mode: ${session.signedUrl ? "signed" : "public"}`);

        const dynVars: Record<string, string> = {
          [session.dynamicVariableName]: session.voiceToken,
        };
        if (session.userContext?.firstName) dynVars["user_first_name"] = session.userContext.firstName;
        if (session.userContext?.role)      dynVars["user_role"]        = session.userContext.role;
        if (session.userContext?.platform)  dynVars["user_platform"]    = session.userContext.platform;

        const params: Record<string, any> = { dynamicVariables: dynVars };
        if (session.signedUrl) params.signedUrl = session.signedUrl;
        else                   params.agentId   = session.agentId;

        console.log("[JAC] 🔗 Starting session…");
        startSession(params as any);
      } catch (err: any) {
        if (!cancelled) {
          console.error("[JAC] ❌", err?.message);
          setErrorMsg(err?.message || "Could not connect to JAC");
        }
      }
    }

    bootRef.current = boot;
    boot();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReconnect = useCallback(() => {
    setReconnecting(true);
    setEnded(false);
    setErrorMsg(null);
    setTranscript([]);
    try { endSession(); } catch { /* already closed */ }
    setTimeout(() => { bootRef.current?.(); setReconnecting(false); }, 400);
  }, [endSession]);

  const handleEnd = useCallback(() => {
    console.log("[JAC] 📴 User ended");
    try { endSession(); } catch { /* already closed */ }
    setEnded(true);
    // No auto-close — panel stays on screen showing transcript
  }, [endSession]);

  const toggleMute = useCallback(() => {
    if (!connected) return;
    setMuted(!isMuted);
  }, [connected, isMuted, setMuted]);

  const isTerminal = ended || phase === "error";

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center"
      data-testid="jac-convai-modal"
      style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full sm:w-[400px] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
        style={{
          maxHeight: "90dvh",
          background: "linear-gradient(160deg, hsl(222 47% 8%), hsl(270 60% 6%))",
          border: "1px solid hsl(270 100% 65% / 0.22)",
          boxShadow: "0 -8px 64px hsl(270 100% 65% / 0.15), 0 0 120px rgba(0,0,0,0.7)",
        }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5" style={{ color }} />
            <span
              className="text-[10px] font-display font-black tracking-[0.22em] uppercase"
              style={{ color }}
            >
              Talk to JAC
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/10 transition-all"
            data-testid="button-convai-close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Orb + status row ── */}
        <div className="flex items-center gap-4 px-5 pb-4 flex-shrink-0">
          {/* Compact orb */}
          <div className="relative flex-shrink-0 flex items-center justify-center">
            {pulse && (
              <span
                className="absolute w-16 h-16 rounded-full animate-ping opacity-[0.10]"
                style={{ background: color }}
              />
            )}
            <div
              className="relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500"
              style={{
                background: `radial-gradient(circle at 38% 32%, ${color}28, ${color}0a)`,
                border: `2px solid ${color}44`,
                boxShadow: pulse ? `0 0 32px ${color}40` : `0 0 12px ${color}18`,
              }}
            >
              {phase === "connecting" && <Loader2 className="w-5 h-5 animate-spin" style={{ color }} />}
              {(phase === "listening" || phase === "thinking") && <Mic className="w-5 h-5" style={{ color }} />}
              {phase === "speaking" && <Radio className="w-5 h-5" style={{ color }} />}
              {phase === "muted" && <MicOff className="w-5 h-5" style={{ color }} />}
              {(phase === "error" || phase === "ended") && <PhoneOff className="w-5 h-5" style={{ color }} />}
            </div>
          </div>

          {/* Status text */}
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-display font-bold truncate"
              style={{ color }}
              data-testid="status-convai-phase"
            >
              {PHASE_LABEL[phase]}
            </p>
            {errorMsg ? (
              <p className="text-xs text-destructive leading-snug mt-0.5 line-clamp-2" data-testid="text-convai-error">
                {errorMsg}
              </p>
            ) : phase === "listening" ? (
              <p className="text-xs text-muted-foreground mt-0.5">Speak now…</p>
            ) : phase === "connecting" ? (
              <p className="text-xs text-muted-foreground mt-0.5">Starting Jac…</p>
            ) : null}
          </div>
        </div>

        {/* ── Transcript ── */}
        <div
          className="flex-1 overflow-y-auto px-4 pb-3 space-y-2"
          style={{ minHeight: 120 }}
          data-testid="jac-transcript"
        >
          {transcript.length === 0 && !ended && (
            <p className="text-xs text-center text-muted-foreground/50 py-4 select-none">
              {connected ? "Jac is ready — start talking" : "Connecting to Jac…"}
            </p>
          )}
          {transcript.map(line => (
            <div
              key={line.id}
              className={cn(
                "flex",
                line.source === "ai" ? "justify-start" : "justify-end"
              )}
              data-testid={`transcript-line-${line.source}`}
            >
              <div
                className={cn(
                  "max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-snug",
                  line.source === "ai"
                    ? "rounded-tl-sm text-white"
                    : "rounded-tr-sm text-white/90"
                )}
                style={
                  line.source === "ai"
                    ? {
                        background: "linear-gradient(135deg, hsl(270 60% 20%), hsl(270 60% 15%))",
                        border: "1px solid hsl(270 100% 65% / 0.18)",
                      }
                    : {
                        background: "hsl(222 47% 16%)",
                        border: "1px solid hsl(222 47% 25%)",
                      }
                }
              >
                {line.text}
              </div>
            </div>
          ))}
          {ended && transcript.length > 0 && (
            <p className="text-xs text-center text-muted-foreground/60 py-1 select-none">
              — conversation ended —
            </p>
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* ── Controls ── */}
        <div
          className="flex-shrink-0 px-5 py-4 flex items-center justify-between gap-3"
          style={{ borderTop: "1px solid hsl(270 100% 65% / 0.10)" }}
        >
          {/* Mute */}
          <button
            onClick={toggleMute}
            disabled={!connected}
            className="w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-30"
            style={{
              background: isMuted ? "hsl(0 0% 16%)" : "hsl(222 47% 15%)",
              border: isMuted ? "1px solid hsl(0 0% 32%)" : "1px solid hsl(270 100% 65% / 0.28)",
              color: isMuted ? "hsl(0 0% 58%)" : "hsl(270 100% 78%)",
            }}
            data-testid="button-convai-mute"
            aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Reconnect (terminal) or End (active) */}
          {isTerminal ? (
            <button
              onClick={handleReconnect}
              disabled={reconnecting}
              className="flex-1 h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-display font-bold transition-all active:scale-95 disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))",
                color: "black",
              }}
              data-testid="button-convai-reconnect"
            >
              <RefreshCw className={cn("w-4 h-4", reconnecting && "animate-spin")} />
              {reconnecting ? "Reconnecting…" : "Reconnect"}
            </button>
          ) : (
            <button
              onClick={handleEnd}
              className="w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95"
              style={{
                background: "hsl(0 85% 50%)",
                boxShadow: "0 0 24px hsl(0 85% 50% / 0.45)",
                color: "white",
              }}
              data-testid="button-convai-end"
              aria-label="End conversation"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          )}

          {/* Volume / spacer to keep layout balanced */}
          <div className="w-11 h-11" />
        </div>
      </div>
    </div>
  );
}

// ── Public: hero / homepage button + panel ────────────────────────────────────
export function JacConvaiVoice({
  className,
  label = "Talk to JAC",
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => { if (!isConvaiActive()) setOpen(true); }}
        className={cn(
          "flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-display font-bold tracking-wide transition-all active:scale-95",
          className
        )}
        style={{
          background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))",
          color: "black",
          boxShadow: "0 0 20px hsl(270 100% 65% / 0.3)",
        }}
        data-testid="button-jac-talk"
      >
        <Mic className="w-3.5 h-3.5" />
        {label}
      </button>

      {open && (
        <ConversationProvider>
          <JacConvaiModal onClose={() => setOpen(false)} />
        </ConversationProvider>
      )}
    </>
  );
}

// ── Public: compact mic bubble for toolbars ───────────────────────────────────
export function JacConvaiBubble({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => { if (!isConvaiActive()) setOpen(true); }}
        className={cn(
          "relative w-12 h-12 rounded-full flex-shrink-0 mb-0.5 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95",
          className
        )}
        style={{
          background: "linear-gradient(135deg, hsl(270 70% 25%), hsl(152 60% 16%))",
          color: "white",
          boxShadow: "0 0 10px hsl(270 100% 65% / 0.35), inset 0 1px 0 hsl(270 100% 70% / 0.15)",
        }}
        data-testid="button-dd-mic"
        aria-label="Talk to JAC"
      >
        <Mic className="w-6 h-6" />
      </button>

      {open && (
        <ConversationProvider>
          <JacConvaiModal onClose={() => setOpen(false)} />
        </ConversationProvider>
      )}
    </>
  );
}
