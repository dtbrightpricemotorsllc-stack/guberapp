/**
 * JacLiveExperience
 *
 * The primary JAC interface — two surfaces:
 *   Surface 1 (left / top)   — JAC character + conversation controls
 *   Surface 2 (right / bottom) — context-driven action area
 *
 * Voice: ElevenLabs ConvAI, starts only from the explicit mic control.
 * Text:  /api/jac/onboard with full conversation history.
 * Both modes share the same message history and Surface 2 state.
 */

import {
  useState, useEffect, useRef, useCallback, useId,
} from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import {
  Mic, MicOff, Send, Loader2, RefreshCw, ChevronDown,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { JacCharacterRenderer, type JacState } from "@/components/jac/jac-character-renderer";
import { Link } from "wouter";
import { useGuestJacSession } from "@/hooks/use-guest-jac-session";
import { jacSpeak, cancelAllJacAudio, setJacConvaiActive } from "@/lib/jac-tts";
import { createJacConvaiVoiceOverride } from "@/lib/jac-convai-voice-lock";
import {
  appendSharedJacMessage,
  claimJacWelcomeGreeting,
  createJacAutomaticVoiceStartClaim,
  getJacQuickActions,
  isServiceDiscoveryIntent,
  isJacMicrophoneReady,
  JAC_WELCOME_GREETING,
  readSharedJacConversation,
} from "@/lib/jac-live-coordination";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  buttons?: Array<{ label: string; message: string }>;
  surface?: Surface2Kind;
}

type Surface2Kind =
  | "welcome"
  | "jobs"
  | "transport"
  | "vi"
  | "studio"
  | "cash"
  | "marketplace"
  | "services"
  | "signup"
  | "draft";

interface Surface2State {
  kind: Surface2Kind;
  data?: Record<string, any>;
}

const WELCOME_GREETING = JAC_WELCOME_GREETING;

export function getJacLiveSessionEndpoint(isAuthenticated: boolean): string {
  return isAuthenticated
    ? "/api/jac/convai/session"
    : "/api/jac/convai/public-session";
}

// ── Session storage persistence ──────────────────────────────────────────────
const SESSION_KEY = "jac_live_msgs_v1";
function loadMsgs(): Msg[] {
  try {
    const shared = readSharedJacConversation();
    if (shared.length) {
      return shared.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.content,
      }));
    }
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      return [{ id: "jac-welcome", role: "assistant", text: WELCOME_GREETING, surface: "welcome" }];
    }
    return JSON.parse(raw) as Msg[];
  } catch { return []; }
}
function saveMsgs(msgs: Msg[]) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(msgs.slice(-40))); } catch {}
}

function uid() { return Math.random().toString(36).slice(2); }

// ── Surface-2 inference from assistant text ──────────────────────────────────
function inferSurface(text: string): Surface2Kind {
  const t = text.toLowerCase();
  if (t.includes("sign up") || t.includes("create an account")) return "signup";
  if (isServiceDiscoveryIntent(t)) return "services";
  if (t.includes("studio") || t.includes("video") || t.includes("music") || t.includes("content")) return "studio";
  if (t.includes("cash drop") || t.includes("drop") && t.includes("earn")) return "cash";
  if (t.includes("verify") || t.includes("inspect") || t.includes("see for me")) return "vi";
  if (t.includes("transport") || t.includes("load board") || t.includes("tow") || t.includes("haul")) return "transport";
  if (t.includes("marketplace") || t.includes("sell") || t.includes("buy") || t.includes("listing")) return "marketplace";
  if (t.includes("job") || t.includes("work") || t.includes("earn") || t.includes("gig") || t.includes("labor")) return "jobs";
  return "welcome";
}

// ── Surface 2 content renderer ───────────────────────────────────────────────
function Surface2({ surface, onChipClick }: { surface: Surface2State; onChipClick: (msg: string) => void }) {
  if (surface.kind === "welcome") {
    return (
      <div className="flex flex-col gap-4 h-full justify-center px-2">
        <div style={{ textAlign: "center" }}>
          <div
            className="inline-block mb-3 px-3 py-1 rounded-full text-[10px] font-display font-black tracking-[0.2em]"
            style={{ background: "hsl(270 100% 65% / 0.15)", color: "hsl(270 100% 72%)", border: "1px solid hsl(270 100% 65% / 0.2)" }}
          >
            WHAT DO YOU NEED?
          </div>
          <p className="text-sm text-white/40 mb-5">Tell JAC and she'll guide you.</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          {getJacQuickActions("live", 10).map(({ id, label, message }) => (
            <button
              key={id}
              onClick={() => onChipClick(message)}
              className="px-3 py-2 rounded-full text-xs font-display font-semibold transition-all active:scale-95 hover:border-purple-500/40"
              style={{
                background: "hsl(222 47% 10%)",
                border: "1px solid hsl(222 47% 20%)",
                color: "rgba(255,255,255,0.7)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (surface.kind === "jobs") {
    return (
      <div className="flex flex-col gap-3 h-full">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-display font-black tracking-[0.2em]" style={{ color: "hsl(152 100% 55%)" }}>JOBS NEAR YOU</span>
          <Link href="/browse-jobs" className="text-[10px] text-white/40 hover:text-white/70 transition-colors">View all →</Link>
        </div>
        <div className="rounded-xl p-4" style={{ background: "hsl(152 60% 4%)", border: "1px solid hsl(152 100% 44% / 0.15)" }}>
          <p className="text-sm font-semibold text-white">Browse current opportunities</p>
          <p className="text-xs mt-1 text-white/50">See live job posts in your area. JAC will not show sample jobs as if they are active.</p>
          <Link href="/browse-jobs" className="inline-flex mt-3 text-xs font-display font-bold" style={{ color: "hsl(152 100% 55%)" }}>Browse live jobs <ArrowRight className="w-3 h-3 ml-1" /></Link>
        </div>
        <button
          onClick={() => onChipClick("I want to post a job")}
          className="mt-1 w-full py-2.5 rounded-xl text-xs font-display font-bold transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg,hsl(270 100% 65%),hsl(152 100% 44%))", color: "black" }}
        >
          Post a Job
        </button>
      </div>
    );
  }

  if (surface.kind === "transport") {
    return (
      <div className="flex flex-col gap-3">
        <span className="text-[10px] font-display font-black tracking-[0.2em]" style={{ color: "hsl(270 100% 72%)" }}>LOAD BOARD</span>
        <div className="p-4 rounded-xl" style={{ background: "hsl(270 60% 5%)", border: "1px solid hsl(270 100% 65% / 0.2)" }}>
          <p className="text-sm text-white/80 mb-3">What needs to be transported?</p>
          <div className="flex flex-col gap-2">
            {[
              { q: "Vehicle transport", m: "I need a vehicle transported" },
              { q: "Freight / cargo",   m: "I have freight that needs hauled" },
              { q: "Equipment",         m: "I need equipment transported" },
            ].map(opt => (
              <button
                key={opt.q}
                onClick={() => onChipClick(opt.m)}
                className="text-left px-3 py-2 rounded-lg text-sm text-white/70 transition-all hover:text-white"
                style={{ background: "hsl(270 60% 9%)", border: "1px solid hsl(270 100% 65% / 0.12)" }}
              >
                {opt.q}
              </button>
            ))}
          </div>
        </div>
        <Link href="/load-board" className="text-center text-xs text-white/40 hover:text-white/60 transition-colors">Browse all loads →</Link>
      </div>
    );
  }

  if (surface.kind === "services") {
    return (
      <div className="flex flex-col gap-3 h-full">
        <span className="text-[10px] font-display font-black tracking-[0.2em]" style={{ color: "hsl(152 100% 55%)" }}>SERVICES OFFERED</span>
        <div className="rounded-xl p-4" style={{ background: "hsl(152 60% 4%)", border: "1px solid hsl(152 100% 44% / 0.15)" }}>
          <p className="text-sm font-semibold text-white">Find a verified provider</p>
          <p className="text-xs mt-1.5 text-white/50">Browse only published, approved services. Availability and exact details stay protected until the request flow needs them.</p>
          <Link href="/services" className="inline-flex items-center gap-1 mt-3 text-xs font-display font-bold" style={{ color: "hsl(152 100% 55%)" }}>
            Browse services <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {["I need cleaning help", "I need lawn care", "I need a skilled repair"].map((message) => (
            <button key={message} onClick={() => onChipClick(message)} className="px-3 py-2 rounded-full text-xs text-white/70" style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(222 47% 20%)" }}>{message.replace("I need ", "")}</button>
          ))}
        </div>
      </div>
    );
  }

  if (surface.kind === "vi") {
    return (
      <div className="flex flex-col gap-3">
        <span className="text-[10px] font-display font-black tracking-[0.2em]" style={{ color: "hsl(270 100% 72%)" }}>SEE FOR ME / VERIFY & INSPECT</span>
        <div className="p-4 rounded-xl" style={{ background: "hsl(270 60% 5%)", border: "1px solid hsl(270 100% 65% / 0.2)" }}>
          <p className="text-sm font-semibold text-white mb-1">Remote Verification</p>
          <p className="text-xs text-white/50 mb-3">A GUBER agent physically visits, inspects, and reports back — live.</p>
          {[
            { label: "Car pre-purchase inspection", m: "I need a car inspected before I buy it" },
            { label: "Property walkthrough",        m: "I need a property walked through" },
            { label: "Item verification",           m: "I need an item verified before I buy" },
          ].map(opt => (
            <button
              key={opt.label}
              onClick={() => onChipClick(opt.m)}
              className="block w-full text-left px-3 py-2 mb-1.5 rounded-lg text-sm text-white/70 transition-all hover:text-white"
              style={{ background: "hsl(270 60% 9%)", border: "1px solid hsl(270 100% 65% / 0.12)" }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (surface.kind === "studio") {
    return (
      <div className="flex flex-col gap-3">
        <span className="text-[10px] font-display font-black tracking-[0.2em]" style={{ color: "hsl(270 100% 72%)" }}>GUBER STUDIO</span>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Promo Video",   href: "/studio/promo-clip",  emoji: "🎬" },
            { label: "AI Commercial", href: "/studio/commercial",  emoji: "📺" },
            { label: "Quick Pic",     href: "/studio/quick-pic",   emoji: "📸" },
            { label: "AI Music",      href: "/studio/music",       emoji: "🎵" },
          ].map(item => (
            <Link
              key={item.label}
              href={item.href}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all hover:border-purple-500/30"
              style={{ background: "hsl(270 60% 5%)", border: "1px solid hsl(270 100% 65% / 0.15)", textAlign: "center" }}
            >
              <span className="text-2xl">{item.emoji}</span>
              <span className="text-[11px] font-display font-bold text-white/80">{item.label}</span>
            </Link>
          ))}
        </div>
        <Link href="/studio" className="text-center text-xs text-white/40 hover:text-white/60 transition-colors">Explore all Studio tools →</Link>
      </div>
    );
  }

  if (surface.kind === "signup") {
    return (
      <div className="flex flex-col items-center justify-center gap-5 h-full text-center px-4">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,hsl(270 100% 65%),hsl(152 100% 44%))" }}
        >
          <span className="text-2xl">🚀</span>
        </div>
        <div>
          <p className="text-lg font-display font-black text-white mb-1">Ready to get started?</p>
          <p className="text-sm text-white/50">Create your free account and take action.</p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-[220px]">
          <Link
            href="/get-started"
            className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-display font-black transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg,hsl(270 100% 65%),hsl(152 100% 44%))", color: "black" }}
          >
            Create Account
          </Link>
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-display font-bold text-white/70 transition-all hover:text-white"
            style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(222 47% 20%)" }}
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  // cash, marketplace, draft — fallback to welcome chips
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] font-display font-black tracking-[0.2em] uppercase" style={{ color: "hsl(270 100% 72%)" }}>
        {surface.kind === "cash" ? "CASH DROPS" : surface.kind === "marketplace" ? "MARKETPLACE" : "DRAFT READY"}
      </span>
      <Link
        href={surface.kind === "cash" ? "/cash-drops" : surface.kind === "marketplace" ? "/marketplace" : "/dashboard"}
        className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-display font-bold transition-all active:scale-95"
        style={{ background: "linear-gradient(135deg,hsl(270 100% 65%),hsl(152 100% 44%))", color: "black" }}
      >
        Open {surface.kind === "cash" ? "Cash Drops" : surface.kind === "marketplace" ? "Marketplace" : "Dashboard"} <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

// ── Waveform bars (voice activity indicator) ─────────────────────────────────
function WaveformBars({ active, color }: { active: boolean; color: string }) {
  const bars = [0.4, 0.7, 1, 0.7, 0.5, 0.8, 0.6, 0.9, 0.5, 0.7];
  return (
    <div className="flex items-center gap-[2px]" style={{ height: 20 }}>
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            borderRadius: 2,
            background: color,
            height: active ? `${h * 100}%` : "20%",
            animation: active ? `jac-breathe ${0.4 + i * 0.08}s ease-in-out infinite alternate` : "none",
            transition: "height 0.2s ease",
            opacity: active ? 0.9 : 0.25,
          }}
        />
      ))}
    </div>
  );
}

// ── Inner component (uses useConversation — must be inside ConversationProvider) ─
function JacLiveInner({ sessionEndpoint, isAuthenticated }: { sessionEndpoint: string; isAuthenticated: boolean }) {
  const { startSession, endSession, status, isSpeaking, isListening, isMuted, setMuted } = useConversation({
    onConnect:    () => {
      setJacConvaiActive(true);
      cancelAllJacAudio();
      setError(null);
      setEnded(false);
    },
    onDisconnect: () => {
      setJacConvaiActive(false);
      setEnded(true);
    },
    onError:      (msg: string) => {
      setJacConvaiActive(false);
      setError(msg || "Connection failed");
    },
    onMessage:    (({ source, message }: { source: "ai" | "user"; message: string }) => {
      if (!message?.trim()) return;
      const text = message.trim();
      addMsg({
        id: uid(),
        role: source === "ai" ? "assistant" : "user",
        text,
      });
      if (source === "ai") {
        const kind = inferSurface(text);
        setSurface({ kind });
      }
    }) as any,
  });

  const [msgs, setMsgs]         = useState<Msg[]>(loadMsgs);
  const [surface, setSurface]   = useState<Surface2State>({ kind: "welcome" });
  const [textInput, setTextInput] = useState("");
  const [textLoading, setTextLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [ended, setEnded]       = useState(false);
  const [voiceStartAttempted, setVoiceStartAttempted] = useState(false);
  const [muted, setMutedLocal]  = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const transcriptEndRef        = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);
  const textId                  = useId();
  const { guestSessionId }      = useGuestJacSession();
  const automaticStartClaimRef = useRef<(() => boolean) | null>(null);
  if (!automaticStartClaimRef.current) {
    automaticStartClaimRef.current = createJacAutomaticVoiceStartClaim();
  }

  // Persist messages
  useEffect(() => { saveMsgs(msgs); }, [msgs]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  function addMsg(m: Msg) {
    appendSharedJacMessage({ id: m.id, role: m.role, content: m.text, source: "live" });
    setMsgs(prev => {
      const updated = [...prev, m];
      saveMsgs(updated);
      return updated;
    });
  }

  // ── Map ConvAI → JacState ─────────────────────────────────────────────────
  const connected = status === "connected";
  let jacState: JacState = "idle";
  if (error || ended || !connected || muted) jacState = "idle";
  else if (isSpeaking)                    jacState = "speaking";
  else if (isListening)                   jacState = "listening";
  else                                    jacState = "thinking";

  // ── Boot session ──────────────────────────────────────────────────────────
  const boot = useCallback(async () => {
    setVoiceStartAttempted(true);
    setError(null);
    setEnded(false);
    // Live voice is the sole audio owner once explicitly requested.
    cancelAllJacAudio();
    try {
      const [micRes, sesRes] = await Promise.allSettled([
        navigator.mediaDevices.getUserMedia({ audio: true }),
        fetch(sessionEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: "web" }),
        }),
      ]);

      if (micRes.status === "rejected") {
        setError("Microphone unavailable. Allow mic access or use text chat.");
        return;
      }
      micRes.value.getTracks().forEach(t => t.stop());

      if (sesRes.status === "rejected" || !sesRes.value.ok) {
        const code = sesRes.status === "fulfilled" ? sesRes.value.status : 0;
        throw new Error(`Session error ${code}`);
      }

      const session = await sesRes.value.json();
      const dynVars: Record<string, string> = {
        [session.dynamicVariableName]: session.voiceToken,
      };
      if (session.userContext?.firstName) dynVars["user_first_name"] = session.userContext.firstName;
      if (session.userContext?.role)      dynVars["user_role"]        = session.userContext.role;
      if (session.userContext?.platform)  dynVars["user_platform"]    = session.userContext.platform;
      if (session.userContext?.jac_mode)  dynVars["jac_mode"]         = session.userContext.jac_mode;
      if (session.userContext?.userId != null) dynVars["user_id"]     = String(session.userContext.userId);

      const params: Record<string, any> = {
        dynamicVariables: dynVars,
        overrides: createJacConvaiVoiceOverride(),
      };
      if (session.signedUrl) params.signedUrl = session.signedUrl;
      else                   params.agentId   = session.agentId;

      startSession(params as any);
    } catch (err: any) {
      setError(err?.message || "Could not connect to JAC");
    }
  }, [sessionEndpoint, startSession]);

  // Choose one welcome owner on entry: a ready live session when permission
  // was already granted, otherwise the output-only greeting. No permission
  // prompt is made here; manual voice remains available in the fallback state.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (
        await isJacMicrophoneReady()
        && !cancelled
        && automaticStartClaimRef.current?.()
      ) {
        await boot();
        return;
      }
      if (!cancelled && claimJacWelcomeGreeting()) void jacSpeak(WELCOME_GREETING);
    })();
    return () => {
      cancelled = true;
      setJacConvaiActive(false);
      try { endSession(); } catch {}
    };
  }, [boot, endSession]);

  // ── Text-mode send ────────────────────────────────────────────────────────
  const sendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || textLoading) return;
    setTextInput("");
    addMsg({ id: uid(), role: "user", text: trimmed });
    setTextLoading(true);
    try {
      const history = msgs.slice(-12).map(m => ({ role: m.role, content: m.text }));
      history.push({ role: "user", content: trimmed });
      const res = await fetch("/api/jac/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          mode: "homepage",
          ...(isAuthenticated ? {} : { guest_session_id: guestSessionId }),
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const reply = (data.message || data.reply || "").trim();
      if (reply) {
        const kind = inferSurface(reply);
        addMsg({
          id: uid(),
          role: "assistant",
          text: reply,
          buttons: data.buttons,
          surface: kind,
        });
        setSurface({ kind });
      }
    } catch {
      addMsg({ id: uid(), role: "assistant", text: "Sorry, I had trouble responding. Try again?" });
    } finally {
      setTextLoading(false);
    }
  }, [guestSessionId, isAuthenticated, msgs, textLoading]);

  const handleChipClick = useCallback((msg: string) => {
    if (isServiceDiscoveryIntent(msg)) setSurface({ kind: "services" });
    sendText(msg);
  }, [sendText]);

  const toggleMute = useCallback(() => {
    if (!connected) return;
    const next = !muted;
    setMuted(next);
    setMutedLocal(next);
  }, [connected, muted, setMuted]);

  const handleReconnect = useCallback(() => {
    try { endSession(); } catch {}
    setEnded(false);
    setError(null);
    setTimeout(() => {
      boot();
    }, 400);
  }, [endSession, boot]);

  // ── Phase indicator ───────────────────────────────────────────────────────
  const phaseColor =
    jacState === "listening"   ? "hsl(152 100% 44%)"  :
    jacState === "speaking"    ? "hsl(270 100% 78%)"  :
    jacState === "thinking"    ? "hsl(270 100% 65%)"  :
                                 "hsl(0 0% 40%)";

  const phaseLabel =
    error      ? "Connection error" :
    ended      ? "Ended" :
    muted      ? "Muted" :
    isSpeaking ? "JAC is speaking" :
    isListening ? "Listening…" :
    connected ? "Processing…" :
    voiceStartAttempted ? "Connecting…" : "Ready";

  const isTerminal = ended || !!error;

  return (
    <div
      className="relative w-full"
      style={{
        minHeight: "min(82vh, 620px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Two-surface layout ────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row flex-1 gap-0 lg:gap-6 items-stretch">

        {/* ── Surface 1 — JAC ──────────────────────────────────────────────── */}
        <div className="relative flex flex-col items-center w-full lg:w-[340px] xl:w-[380px] flex-shrink-0">
          {/* Character */}
          <div className="flex justify-center w-full">
            <JacCharacterRenderer
              state={jacState}
              heightPx={typeof window !== "undefined" && window.innerWidth < 1024
                ? Math.min(230, window.innerHeight * 0.32)
                : 380}
            />
          </div>

          {/* Phase status bar */}
          <div className="flex items-center gap-2 mt-2 mb-1 justify-center w-full">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                background: phaseColor,
                boxShadow: `0 0 6px ${phaseColor}`,
                animation: (connected && (isSpeaking || isListening)) ? "jac-glow-pulse 1.2s ease-in-out infinite" : "none",
              }}
            />
            <span className="text-[11px] font-display font-bold tracking-wide" style={{ color: phaseColor }}>
              {phaseLabel}
            </span>
            {connected && (
              <WaveformBars
                active={isSpeaking || isListening}
                color={phaseColor}
              />
            )}
          </div>

          {/* Voice controls */}
          <div className="flex items-center gap-2 justify-center w-full mb-3">
            {connected ? (
              <button
                onClick={toggleMute}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-display font-bold transition-all active:scale-95"
                style={{
                  background: muted ? "hsl(0 0% 12%)" : "hsl(270 60% 14%)",
                  border: `1px solid ${muted ? "hsl(0 0% 28%)" : "hsl(270 100% 65% / 0.3)"}`,
                  color: muted ? "hsl(0 0% 50%)" : "hsl(270 100% 78%)",
                }}
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                {muted ? "Unmute" : "Mute"}
              </button>
            ) : isTerminal ? (
              <button
                onClick={handleReconnect}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-display font-bold transition-all active:scale-95"
                style={{
                  background: "linear-gradient(135deg,hsl(270 100% 65%),hsl(152 100% 44%))",
                  color: "black",
                }}
              >
                <RefreshCw className="w-3 h-3" /> Reconnect voice
              </button>
            ) : voiceStartAttempted && !isTerminal ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs" style={{ color: "hsl(0 0% 35%)" }}>
                <Loader2 className="w-3 h-3 animate-spin" /> Connecting voice…
              </div>
            ) : (
              <button
                onClick={() => void boot()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-display font-bold transition-all active:scale-95"
                style={{
                  background: "linear-gradient(135deg,hsl(270 100% 65%),hsl(152 100% 44%))",
                  color: "black",
                }}
              >
                <Mic className="w-3 h-3" /> Start voice
              </button>
            )}

            {/* Transcript toggle */}
            <button
              onClick={() => setShowTranscript(s => !s)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-full text-[11px] transition-all"
              style={{ color: "hsl(0 0% 35%)", border: "1px solid hsl(0 0% 18%)" }}
            >
              <ChevronDown className={cn("w-3 h-3 transition-transform", showTranscript && "rotate-180")} />
              Chat
            </button>
          </div>

          {/* Transcript (collapsible) */}
          {showTranscript && msgs.length > 0 && (
            <div
              className="w-full max-h-[160px] overflow-y-auto space-y-1.5 px-1 mb-2"
              style={{ scrollbarWidth: "none" }}
            >
              {msgs.slice(-10).map(m => (
                <div
                  key={m.id}
                  className={cn("flex", m.role === "assistant" ? "justify-start" : "justify-end")}
                >
                  <div
                    className="max-w-[85%] px-3 py-1.5 rounded-xl text-xs leading-snug"
                    style={
                      m.role === "assistant"
                        ? { background: "hsl(270 60% 14%)", border: "1px solid hsl(270 100% 65% / 0.15)", color: "white" }
                        : { background: "hsl(222 47% 14%)", border: "1px solid hsl(222 47% 22%)", color: "hsl(0 0% 78%)" }
                    }
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          )}

          {/* Text input */}
          <div className="w-full flex gap-2 items-center">
            <input
              ref={inputRef}
              id={textId}
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(textInput); } }}
              placeholder="Type to JAC…"
              maxLength={600}
              className="flex-1 px-3 py-2 rounded-xl text-sm outline-none transition-all"
              style={{
                background: "hsl(222 47% 9%)",
                border: "1px solid hsl(222 47% 18%)",
                color: "white",
                caretColor: "hsl(270 100% 65%)",
              }}
              disabled={textLoading}
              aria-label="Message JAC"
            />
            <button
              onClick={() => sendText(textInput)}
              disabled={!textInput.trim() || textLoading}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-95 disabled:opacity-30"
              style={{ background: "linear-gradient(135deg,hsl(270 100% 65%),hsl(152 100% 44%))" }}
              aria-label="Send"
            >
              {textLoading ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : <Send className="w-4 h-4 text-black" />}
            </button>
          </div>

          <p className="text-[10px] mt-2 text-center w-full" style={{ color: "hsl(0 0% 25%)" }}>
            Voice by ElevenLabs · No account required to talk
          </p>
        </div>

        {/* ── Surface 2 — Action / Results ─────────────────────────────────── */}
        <div
          className="flex-1 min-h-[180px] lg:min-h-0 rounded-2xl p-4 lg:p-5 overflow-y-auto"
          style={{
            background: "linear-gradient(160deg, hsl(222 47% 7%), hsl(270 60% 5%))",
            border: "1px solid hsl(270 100% 65% / 0.12)",
            boxShadow: "inset 0 1px 0 hsl(270 100% 65% / 0.05)",
          }}
        >
          <Surface2 surface={surface} onChipClick={handleChipClick} />
        </div>
      </div>

      {/* Mic/session failures stay inline so the character and text chat remain usable. */}
      {voiceStartAttempted && error && (
        <p className="mt-2 text-center text-xs" role="status" style={{ color: "hsl(0 85% 68%)" }}>
          {error} Text chat is still available.
        </p>
      )}
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────
export function JacLiveExperience() {
  const { user } = useAuth();

  // Authentication hydrates after the initial public render. The endpoint is
  // part of the voice-session identity, so a change must recreate the ConvAI
  // wrapper; recent transcript remains available through shared storage.
  const sessionEndpoint = getJacLiveSessionEndpoint(!!user);

  return (
    <ConversationProvider key={sessionEndpoint}>
      <JacLiveInner
        key={sessionEndpoint}
        sessionEndpoint={sessionEndpoint}
        isAuthenticated={!!user}
      />
    </ConversationProvider>
  );
}
