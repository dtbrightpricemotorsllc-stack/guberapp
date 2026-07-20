/**
 * JAC Voice — ElevenLabs Conversational AI, production UI.
 *
 * ElevenLabs owns STT, TTS, the LLM, voice, personality, and guardrails.
 * GUBER provides a server-minted signed URL (auth + agent identity),
 * user context as a dynamic variable, and webhook endpoints the agent
 * tools may call for GUBER-specific actions.
 *
 * Exports:
 *   <JacConvaiVoice />    full "Talk to JAC" button + modal (hero / homepage)
 *   <JacConvaiBubble />   compact mic bubble for toolbars (guber-assistant)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { apiRequest } from "@/lib/queryClient";
import { Mic, MicOff, PhoneOff, Loader2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Global session guard — only one ConvAI session at a time ─────────────────
let _convaiSessions = 0;
export function isConvaiActive(): boolean { return _convaiSessions > 0; }
function _openSession() { _convaiSessions++; }
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

// ── Types ────────────────────────────────────────────────────────────────────
interface ConvaiSessionResponse {
  agentId: string;
  signedUrl?: string;   // present for private agents; absent for public agents
  voiceToken: string;
  dynamicVariableName: string;
}

type DisplayPhase =
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "muted"
  | "error"
  | "ended";

function phaseLabel(p: DisplayPhase): string {
  switch (p) {
    case "connecting": return "Connecting…";
    case "listening":  return "Listening…";
    case "thinking":   return "JAC is thinking…";
    case "speaking":   return "JAC is speaking";
    case "muted":      return "Microphone muted";
    case "error":      return "Connection failed";
    case "ended":      return "Conversation ended";
  }
}

function phaseSub(p: DisplayPhase): string | null {
  switch (p) {
    case "listening": return "Speak now — JAC is listening";
    case "thinking":  return "JAC is working on a response…";
    case "muted":     return "Tap the mic to unmute";
    default:          return null;
  }
}

const PHASE_COLOR: Record<DisplayPhase, string> = {
  connecting: "hsl(270 100% 65%)",
  listening:  "hsl(152 100% 44%)",
  thinking:   "hsl(270 100% 65%)",
  speaking:   "hsl(270 100% 78%)",
  muted:      "hsl(0 0% 50%)",
  error:      "hsl(0 85% 60%)",
  ended:      "hsl(0 0% 45%)",
};

// ── Modal inner (needs ConversationProvider above) ───────────────────────────
function JacConvaiModal({ onClose }: { onClose: () => void }) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  // Register this session so other entry-points know ConvAI is active.
  useEffect(() => {
    _openSession();
    return () => _closeSession();
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
    onConnect:    () => { setErrorMsg(null); setEnded(false); },
    onDisconnect: () => setEnded(true),
    onError:      (msg: string) => setErrorMsg(msg || "Voice connection failed"),
  });

  const connected = status === "connected";
  useScreenWakeLock(connected);

  // Derive display phase
  let phase: DisplayPhase;
  if (errorMsg)         phase = "error";
  else if (ended)       phase = "ended";
  else if (!connected)  phase = "connecting";
  else if (isMuted)     phase = "muted";
  else if (isSpeaking)  phase = "speaking";
  else if (isListening) phase = "listening";
  else                  phase = "thinking";

  // Auto-start on mount
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        // Prime mic permission before the SDK opens its own stream
        const prime = await navigator.mediaDevices.getUserMedia({ audio: true });
        prime.getTracks().forEach(t => t.stop());
        if (cancelled) return;
        const res = await apiRequest("POST", "/api/jac/convai/session", { platform: "web" });
        const session = (await res.json()) as ConvaiSessionResponse;
        if (cancelled) return;
        const sessionParams: Record<string, any> = {
          dynamicVariables: { [session.dynamicVariableName]: session.voiceToken },
        };
        if (session.signedUrl) {
          sessionParams.signedUrl = session.signedUrl;
        } else {
          sessionParams.agentId = session.agentId;
        }
        startSession(sessionParams as any);
      } catch (err: any) {
        if (!cancelled) setErrorMsg(err?.message || "Could not start voice session");
      }
    }
    boot();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnd = useCallback(() => {
    try { endSession(); } catch { /* already closed */ }
    setEnded(true);
    setTimeout(onClose, 800);
  }, [endSession, onClose]);

  const toggleMute = useCallback(() => {
    if (!connected) return;
    setMuted(!isMuted);
  }, [connected, isMuted, setMuted]);

  const color = PHASE_COLOR[phase];
  const pulse = phase === "listening" || phase === "speaking" || phase === "connecting";
  const isTerminal = ended || phase === "error";

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center"
      data-testid="jac-convai-modal"
      style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full sm:w-[380px] rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-8 flex flex-col items-center gap-5"
        style={{
          background: "linear-gradient(160deg, hsl(222 47% 8%), hsl(270 60% 6%))",
          border: "1px solid hsl(270 100% 65% / 0.22)",
          boxShadow: "0 -8px 64px hsl(270 100% 65% / 0.15), 0 0 120px rgba(0,0,0,0.7)",
        }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5" style={{ color }} />
            <span
              className="text-[10px] font-display font-black tracking-[0.22em] uppercase"
              style={{ color }}
            >
              Talk to JAC
            </span>
          </div>
          {isTerminal && (
            <button
              onClick={onClose}
              className="text-xs text-muted-foreground hover:text-white transition-colors px-2 py-1"
              data-testid="button-convai-close"
            >
              Close
            </button>
          )}
        </div>

        {/* Orb */}
        <div className="relative flex items-center justify-center my-3">
          {pulse && (
            <>
              <span
                className="absolute w-32 h-32 rounded-full animate-ping opacity-[0.08]"
                style={{ background: color }}
              />
              <span
                className="absolute w-22 h-22 rounded-full animate-pulse opacity-[0.12]"
                style={{ background: color, width: 88, height: 88 }}
              />
            </>
          )}
          <div
            className="relative w-18 h-18 rounded-full flex items-center justify-center transition-all duration-500"
            style={{
              width: 72, height: 72,
              background: `radial-gradient(circle at 38% 32%, ${color}30, ${color}0d)`,
              border: `2px solid ${color}44`,
              boxShadow: pulse ? `0 0 48px ${color}44` : `0 0 18px ${color}1a`,
            }}
          >
            {phase === "connecting" && (
              <Loader2 className="w-8 h-8 animate-spin" style={{ color }} />
            )}
            {(phase === "listening" || phase === "thinking") && (
              <Mic className="w-8 h-8" style={{ color }} />
            )}
            {phase === "speaking" && (
              <Radio className="w-8 h-8" style={{ color }} />
            )}
            {phase === "muted" && (
              <MicOff className="w-8 h-8" style={{ color }} />
            )}
            {(phase === "error" || phase === "ended") && (
              <PhoneOff className="w-8 h-8" style={{ color }} />
            )}
          </div>
        </div>

        {/* Status text */}
        <div className="text-center space-y-1">
          <p className="text-base font-display font-bold text-white" data-testid="status-convai-phase">
            {phaseLabel(phase)}
          </p>
          {phaseSub(phase) && (
            <p className="text-xs text-muted-foreground">{phaseSub(phase)}</p>
          )}
          {errorMsg && (
            <p
              className="text-xs text-destructive max-w-[240px] mx-auto leading-snug"
              data-testid="text-convai-error"
            >
              {errorMsg}
            </p>
          )}
        </div>

        {/* Live controls */}
        {!isTerminal && (
          <div className="flex items-center gap-5 mt-1">
            {/* Mute / unmute */}
            <button
              onClick={toggleMute}
              disabled={!connected}
              className="w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
              style={{
                background: isMuted ? "hsl(0 0% 16%)" : "hsl(222 47% 15%)",
                border: isMuted
                  ? "1px solid hsl(0 0% 32%)"
                  : "1px solid hsl(270 100% 65% / 0.28)",
                color: isMuted ? "hsl(0 0% 58%)" : "hsl(270 100% 78%)",
              }}
              data-testid="button-convai-mute"
              aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
            >
              {isMuted
                ? <MicOff className="w-5 h-5" />
                : <Mic className="w-5 h-5" />}
            </button>

            {/* End call */}
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
              <PhoneOff className="w-6 h-6" />
            </button>
          </div>
        )}

        {/* Dismiss after terminal state */}
        {isTerminal && (
          <button
            onClick={onClose}
            className="text-sm font-display font-bold px-6 py-2 rounded-xl transition-all active:scale-95 mt-1"
            style={{
              background: "hsl(222 47% 15%)",
              border: "1px solid hsl(270 100% 65% / 0.28)",
              color: "hsl(270 100% 78%)",
            }}
            data-testid="button-convai-dismiss"
          >
            {ended ? "Done" : "Dismiss"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Public: hero / homepage button + modal ───────────────────────────────────
/**
 * "Talk to JAC" button — tapping opens the full-screen voice modal and
 * auto-starts the session. No feature flags required.
 */
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

// ── Public: compact mic bubble for toolbars ──────────────────────────────────
/**
 * Round mic button for use inside the guber-assistant toolbar.
 * Shares the same modal as JacConvaiVoice.
 */
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
          boxShadow:
            "0 0 10px hsl(270 100% 65% / 0.35), inset 0 1px 0 hsl(270 100% 70% / 0.15)",
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
