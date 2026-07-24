/**
 * JAC Voice — ElevenLabs Conversational AI, production UI.
 *
 * Exports:
 *   <JacConvaiVoice />    full "Talk to JAC" button + panel (hero / homepage)
 *   <JacConvaiBubble />   compact mic bubble for toolbars (guber-assistant)
 */
import { Component, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { apiRequest } from "@/lib/queryClient";
import { Mic, MicOff, PhoneOff, Loader2, Radio, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Global session guard ──────────────────────────────────────────────────────
let _convaiSessions = 0;
export function isConvaiActive(): boolean { return _convaiSessions > 0; }
function _openSession()  { _convaiSessions++; }
function _closeSession() { _convaiSessions = Math.max(0, _convaiSessions - 1); }

// ── Screen wake-lock ──────────────────────────────────────────────────────────
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
      } catch { /* unsupported */ }
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

// ── ErrorBoundary — catches SDK crashes so the page never white-screens ───────
interface EBState { crashed: boolean }
class ConvaiErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, EBState> {
  state: EBState = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidCatch(err: Error) { console.error("[JAC] ConvAI SDK crash caught:", err.message); }
  render() {
    if (this.state.crashed) {
      return (
        <div
          className="fixed bottom-0 left-0 right-0 z-[300] sm:left-auto sm:right-6 sm:bottom-6 sm:w-[360px]"
        >
          <div
            className="rounded-t-2xl sm:rounded-2xl px-5 py-4 flex flex-col gap-3"
            style={{
              background: "linear-gradient(160deg, hsl(222 47% 8%), hsl(270 60% 6%))",
              border: "1px solid hsl(270 100% 65% / 0.22)",
              boxShadow: "0 -4px 32px hsl(270 100% 65% / 0.12)",
            }}
          >
            <p className="text-sm text-white/80">Connection error — tap to retry.</p>
            <button
              onClick={() => { this.setState({ crashed: false }); this.props.onReset(); }}
              className="w-full py-2 rounded-xl text-sm font-bold"
              style={{ background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))", color: "black" }}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
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

type DisplayPhase = "connecting" | "listening" | "thinking" | "speaking" | "muted" | "error" | "ended";

const PHASE_COLOR: Record<DisplayPhase, string> = {
  connecting: "hsl(270 100% 65%)",
  listening:  "hsl(152 100% 44%)",
  thinking:   "hsl(270 100% 65%)",
  speaking:   "hsl(270 100% 78%)",
  muted:      "hsl(0 0% 50%)",
  error:      "hsl(0 85% 60%)",
  ended:      "hsl(0 0% 45%)",
};

let _lineId = 0;

// ── Panel inner (needs ConversationProvider above) ────────────────────────────
function JacConvaiPanel({ onClose, sessionEndpoint = "/api/jac/convai/session" }: { onClose: () => void; sessionEndpoint?: string }) {
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const [ended, setEnded]               = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [transcript, setTranscript]     = useState<TranscriptLine[]>([]);
  const transcriptEndRef                = useRef<HTMLDivElement>(null);
  const bootRef                         = useRef<(() => void) | null>(null);

  useEffect(() => { _openSession(); return () => _closeSession(); }, []);

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
    onConnect:    () => { setErrorMsg(null); setEnded(false); setReconnecting(false); },
    onDisconnect: () => { setEnded(true); },
    onError:      (msg: string) => { setErrorMsg(msg || "Connection failed"); },
    onMessage:    (({ source, message }: { source: "ai" | "user"; message: string }) => {
      if (message?.trim()) addLine(source, message.trim());
    }) as any,
  });

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const connected = status === "connected";
  useScreenWakeLock(connected);

  let phase: DisplayPhase;
  if (errorMsg)         phase = "error";
  else if (ended)       phase = "ended";
  else if (!connected)  phase = "connecting";
  else if (isMuted)     phase = "muted";
  else if (isSpeaking)  phase = "speaking";
  else if (isListening) phase = "listening";
  else                  phase = "thinking";

  const color = PHASE_COLOR[phase];
  const pulse = phase === "listening" || phase === "speaking" || phase === "connecting";
  const isTerminal = ended || phase === "error";

  // Boot — mic + session in parallel
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      setErrorMsg(null);
      setEnded(false);
      try {
        const [micResult, sessionResult] = await Promise.allSettled([
          navigator.mediaDevices.getUserMedia({ audio: true }),
          apiRequest("POST", sessionEndpoint, { platform: "web" }),
        ]);
        if (cancelled) return;

        if (micResult.status === "rejected") {
          throw new Error("Mic access denied — allow mic in browser settings");
        }
        micResult.value.getTracks().forEach(t => t.stop());

        if (sessionResult.status === "rejected" || !sessionResult.value.ok) {
          throw new Error(`Session error ${sessionResult.status === "fulfilled" ? sessionResult.value.status : 0}`);
        }
        const session = (await sessionResult.value.json()) as ConvaiSessionResponse;
        if (cancelled) return;

        const dynVars: Record<string, string> = { [session.dynamicVariableName]: session.voiceToken };
        if (session.userContext?.firstName) dynVars["user_first_name"] = session.userContext.firstName;
        if (session.userContext?.role)      dynVars["user_role"]        = session.userContext.role;
        if (session.userContext?.platform)  dynVars["user_platform"]    = session.userContext.platform;

        const params: Record<string, any> = { dynamicVariables: dynVars };
        if (session.signedUrl) params.signedUrl = session.signedUrl;
        else                   params.agentId   = session.agentId;

        startSession(params as any);
      } catch (err: any) {
        if (!cancelled) setErrorMsg(err?.message || "Could not connect to JAC");
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
    try { endSession(); } catch { /* already closed */ }
    setEnded(true);
  }, [endSession]);

  const toggleMute = useCallback(() => {
    if (!connected) return;
    setMuted(!isMuted);
  }, [connected, isMuted, setMuted]);

  const phaseLabel =
    phase === "connecting" ? "Connecting…" :
    phase === "listening"  ? "Listening…" :
    phase === "thinking"   ? "Thinking…" :
    phase === "speaking"   ? "JAC is speaking" :
    phase === "muted"      ? "Muted" :
    phase === "error"      ? "Connection failed" :
                             "Conversation ended";

  return (
    // Bottom-anchored panel — doesn't cover the page, just slides up from the bottom
    <div
      className="fixed bottom-0 left-0 right-0 z-[300] sm:left-auto sm:right-5 sm:bottom-5 sm:w-[380px]"
      data-testid="jac-convai-modal"
    >
      <div
        className="rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden"
        style={{
          maxHeight: "70dvh",
          background: "linear-gradient(160deg, hsl(222 47% 8%), hsl(270 60% 6%))",
          border: "1px solid hsl(270 100% 65% / 0.22)",
          boxShadow: "0 -6px 40px hsl(270 100% 65% / 0.18), 0 0 0 1px hsl(270 100% 65% / 0.06)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            {pulse ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ background: color }} />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: color }} />
              </span>
            ) : (
              <Radio className="w-3 h-3" style={{ color }} />
            )}
            <span className="text-[10px] font-display font-black tracking-[0.2em] uppercase" style={{ color }}>
              Talk to JAC
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/10 transition-all"
            data-testid="button-convai-close"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Orb + status */}
        <div className="flex items-center gap-3 px-4 pb-3 flex-shrink-0">
          <div className="relative flex-shrink-0 flex items-center justify-center">
            {pulse && (
              <span
                className="absolute w-12 h-12 rounded-full animate-ping opacity-[0.12]"
                style={{ background: color }}
              />
            )}
            <div
              className="relative w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: `radial-gradient(circle at 38% 32%, ${color}22, ${color}08)`,
                border: `2px solid ${color}40`,
                boxShadow: pulse ? `0 0 20px ${color}38` : `0 0 8px ${color}18`,
              }}
            >
              {phase === "connecting" && <Loader2 className="w-4 h-4 animate-spin" style={{ color }} />}
              {(phase === "listening" || phase === "thinking") && <Mic className="w-4 h-4" style={{ color }} />}
              {phase === "speaking"  && <Radio className="w-4 h-4" style={{ color }} />}
              {phase === "muted"     && <MicOff className="w-4 h-4" style={{ color }} />}
              {(phase === "error" || phase === "ended") && <PhoneOff className="w-4 h-4" style={{ color }} />}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-display font-bold" style={{ color }} data-testid="status-convai-phase">
              {phaseLabel}
            </p>
            {errorMsg ? (
              <p className="text-[11px] text-destructive leading-snug mt-0.5 line-clamp-2" data-testid="text-convai-error">{errorMsg}</p>
            ) : phase === "connecting" ? (
              <p className="text-[11px] text-muted-foreground mt-0.5">Starting…</p>
            ) : null}
          </div>
        </div>

        {/* Transcript */}
        <div
          className="flex-1 overflow-y-auto px-3 pb-2 space-y-1.5"
          style={{ minHeight: 80 }}
          data-testid="jac-transcript"
        >
          {transcript.length === 0 && (
            <p className="text-[11px] text-center text-muted-foreground/40 py-3 select-none">
              {connected ? "Start talking to JAC" : "Connecting…"}
            </p>
          )}
          {transcript.map(line => (
            <div key={line.id} className={cn("flex", line.source === "ai" ? "justify-start" : "justify-end")}>
              <div
                className={cn(
                  "max-w-[85%] px-2.5 py-1.5 rounded-xl text-xs leading-snug",
                  line.source === "ai" ? "rounded-tl-sm" : "rounded-tr-sm"
                )}
                style={
                  line.source === "ai"
                    ? { background: "hsl(270 60% 18%)", border: "1px solid hsl(270 100% 65% / 0.15)", color: "white" }
                    : { background: "hsl(222 47% 15%)", border: "1px solid hsl(222 47% 22%)", color: "hsl(0 0% 80%)" }
                }
                data-testid={`transcript-line-${line.source}`}
              >
                {line.text}
              </div>
            </div>
          ))}
          {ended && transcript.length > 0 && (
            <p className="text-[10px] text-center text-muted-foreground/50 py-1 select-none">— ended —</p>
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Controls */}
        <div
          className="flex-shrink-0 px-4 py-3 flex items-center gap-3"
          style={{ borderTop: "1px solid hsl(270 100% 65% / 0.10)" }}
        >
          <button
            onClick={toggleMute}
            disabled={!connected}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-30"
            style={{
              background: isMuted ? "hsl(0 0% 14%)" : "hsl(222 47% 14%)",
              border: isMuted ? "1px solid hsl(0 0% 28%)" : "1px solid hsl(270 100% 65% / 0.24)",
              color: isMuted ? "hsl(0 0% 55%)" : "hsl(270 100% 78%)",
            }}
            data-testid="button-convai-mute"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>

          {isTerminal ? (
            <button
              onClick={handleReconnect}
              disabled={reconnecting}
              className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-display font-bold transition-all active:scale-95 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))", color: "black" }}
              data-testid="button-convai-reconnect"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", reconnecting && "animate-spin")} />
              {reconnecting ? "Reconnecting…" : "Reconnect"}
            </button>
          ) : (
            <button
              onClick={handleEnd}
              className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-display font-bold transition-all active:scale-95"
              style={{ background: "hsl(0 85% 48%)", color: "white", boxShadow: "0 0 16px hsl(0 85% 48% / 0.35)" }}
              data-testid="button-convai-end"
              aria-label="End"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              End
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Wrapper with ConversationProvider + ErrorBoundary ─────────────────────────
export function JacConvaiWrapper({ onClose, sessionEndpoint }: { onClose: () => void; sessionEndpoint?: string }) {
  const [key, setKey] = useState(0);
  return (
    <ConvaiErrorBoundary onReset={() => setKey(k => k + 1)}>
      <ConversationProvider key={key}>
        <JacConvaiPanel onClose={onClose} sessionEndpoint={sessionEndpoint} />
      </ConversationProvider>
    </ConvaiErrorBoundary>
  );
}

// ── Public: hero / homepage button ────────────────────────────────────────────
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
      {open && <JacConvaiWrapper onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Public: investor page voice button (no auth required) ─────────────────────
export function JacConvaiInvestorVoice({
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
        data-testid="button-jac-investor-talk"
      >
        <Mic className="w-3.5 h-3.5" />
        {label}
      </button>
      {open && (
        <JacConvaiWrapper
          onClose={() => setOpen(false)}
          sessionEndpoint="/api/jac/convai/investor-session"
        />
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
      {open && <JacConvaiWrapper onClose={() => setOpen(false)} />}
    </>
  );
}
