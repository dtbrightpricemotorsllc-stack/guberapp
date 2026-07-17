import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { Send, Mic, Volume2, ArrowRight, MessageSquare, Minus, Loader2 } from "lucide-react";
import { useSpeechInput, useSpeechOutput } from "@/hooks/use-speech";
import { jacSpeak, cancelAllJacAudio, unlockAudioContext, getJacVolume, setJacVolume, JAC_VOLUME_BOUNDS } from "@/lib/jac-tts";
import { ConversationEngine, type ConversationState } from "@/lib/voice/ConversationEngine";
import jacFull from "@assets/Picsart_26-06-23_12-22-52-096_1782235908382.png";
import jacPortrait from "@assets/Picsart_26-06-23_12-26-51-004_1782235908420.png";

interface JacPendingAction {
  id: number;
  type: string;
  summary: string;
  status: "pending" | "confirming" | "confirmed" | "cancelled" | "failed";
  resultMessage?: string;
}

interface JacMsg {
  role: "user" | "assistant";
  content: string;
  buttons?: Array<{ label: string; message: string }>;
  signupRoute?: string;
  pendingAction?: JacPendingAction;
}

interface JacJobPrefill {
  category?: string | null;
  serviceType?: string | null;
  descriptionSeed?: string | null;
  budgetHint?: number | null;
  details?: Record<string, any>;
  readyToPost?: boolean;
  zip?: string | null;
  user_type?: string | null;
  business_owner?: boolean;
  intent?: string | null;
  detected_language?: string;
}

interface JacTracking {
  intent?: string;
  user_type?: string;
  service_requested?: string | null;
  transport_need?: boolean;
  content_creator?: boolean;
  business_owner?: boolean;
  retired?: boolean;
  zip?: string | null;
  confusing_point?: string | null;
  cash_drop_interest?: boolean;
  treasure_hunt_interest?: boolean;
  promotion_interest?: boolean;
  misunderstood_as_job?: boolean;
  detected_language?: string;
  job_prefill?: JacJobPrefill;
}

export function saveJacPrefill(tracking: JacTracking) {
  try {
    const pf = tracking.job_prefill;
    if (!pf?.category && !pf?.serviceType && !pf?.readyToPost) return;
    const stored: JacJobPrefill = {
      ...pf,
      zip: pf.zip ?? tracking.zip ?? null,
      user_type: tracking.user_type ?? null,
      business_owner: tracking.business_owner ?? false,
      intent: tracking.intent ?? null,
      detected_language: tracking.detected_language ?? "en",
    };
    localStorage.setItem("jac_job_prefill", JSON.stringify(stored));
  } catch {}
}

export function readJacPrefill(): JacJobPrefill | null {
  try {
    const raw = localStorage.getItem("jac_job_prefill");
    if (!raw) return null;
    return JSON.parse(raw) as JacJobPrefill;
  } catch { return null; }
}

export function clearJacPrefill() {
  try { localStorage.removeItem("jac_job_prefill"); } catch {}
}

const OPENING_OPTIONS = [
  { label: "I need help",           message: "I need help" },
  { label: "I need work",           message: "I need work" },
  { label: "I need money today",    message: "I need money today" },
  { label: "I want to sell something", message: "I want to sell something" },
  { label: "I need transport",      message: "I need transport" },
  { label: "I own a business",      message: "I own a business" },
  { label: "I provide services",    message: "I provide services" },
  { label: "I create content",      message: "I create content" },
  { label: "I'm retired",           message: "I'm retired" },
  { label: "I'm just exploring",    message: "I'm just exploring" },
  { label: "I'm not sure yet",      message: "I'm not sure yet" },
];

const GREETING: JacMsg = {
  role: "assistant",
  content: "Welcome to GUBER — the land of opportunities. I'm JAC, your Job Assisting Coordinator. What brings you to GUBER?",
  buttons: OPENING_OPTIONS,
};

function toSpeechText(text: string): string {
  return text.replace(/GUBER/g, "Goober").replace(/Guber/g, "Goober").replace(/guber/g, "goober");
}

function getVisitorId(): string {
  try {
    let id = localStorage.getItem("jac_visitor_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("jac_visitor_id", id); }
    return id;
  } catch { return "anonymous"; }
}

let _interactionId: number | null = null;
let _lastTracking: JacTracking = {};

async function logInteraction(
  msgs: JacMsg[],
  extra: { intent?: string; zip?: string; converted?: boolean; userType?: string; tracking?: JacTracking } = {}
) {
  try {
    const merged: JacTracking = { ..._lastTracking, ...extra.tracking };
    const body = {
      visitorId: getVisitorId(),
      messages: msgs.map(m => ({ role: m.role, content: m.content })),
      ...(extra.intent || merged.intent ? { intent: extra.intent ?? merged.intent } : {}),
      ...(extra.zip || merged.zip ? { zip: extra.zip ?? merged.zip } : {}),
      ...(extra.converted !== undefined ? { converted: extra.converted } : {}),
      ...(extra.userType || merged.user_type ? { userType: extra.userType ?? merged.user_type } : {}),
      ...(Object.keys(merged).length ? { tracking: merged } : {}),
      ...(_interactionId ? { id: _interactionId } : {}),
    };
    const res = await fetch("/api/jac/interaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) { const d = await res.json(); if (d.id) _interactionId = d.id; }
  } catch {}
}

interface JacUpdates {
  loggedIn: boolean;
  firstName?: string | null;
  workerActive?: number;
  hirerOpen?: number;
  unreadNotifs?: number;
  walletBalance?: number;
}

function buildReturningGreeting(data: JacUpdates): string {
  const name = data.firstName ? `, ${data.firstName}` : "";
  const parts: string[] = [];
  if ((data.workerActive ?? 0) > 0)
    parts.push(`${data.workerActive} active job${data.workerActive! > 1 ? "s" : ""} in progress`);
  if ((data.hirerOpen ?? 0) > 0)
    parts.push(`${data.hirerOpen} open job${data.hirerOpen! > 1 ? "s" : ""} you posted`);
  if ((data.unreadNotifs ?? 0) > 0)
    parts.push(`${data.unreadNotifs} new notification${data.unreadNotifs! > 1 ? "s" : ""}`);
  if ((data.walletBalance ?? 0) > 0)
    parts.push(`$${(data.walletBalance!).toFixed(2)} in your wallet`);
  if (parts.length === 0)
    return `Welcome back${name}! Good to see you again. What can I help you with today?`;
  if (parts.length === 1)
    return `Welcome back${name}! Quick update — ${parts[0]}. What else can I help you with?`;
  const last = parts.pop();
  return `Welcome back${name}! Quick update — ${parts.join(", ")} and ${last}. What can I help you with?`;
}

const JAC_FLOAT_HINT_KEY = "jac_float_hint_shown";

export function JacHomepage() {
  // "splash" = gesture gate (required by browsers before any audio)
  // "chat"   = full chat panel + auto-speak fires immediately on enter
  // "intro"  = minimized chip selector (reached via minimize button)
  const [mode, setMode] = useState<"splash" | "intro" | "chat">("chat");
  const [messages, setMessages] = useState<JacMsg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [showFloatHint, setShowFloatHint] = useState(() => {
    try { return localStorage.getItem(JAC_FLOAT_HINT_KEY) !== "1"; } catch { return false; }
  });
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const feedbackDraftRef = useRef<{ ready: boolean; category: string; description: string } | null>(null);

  const { cancel: cancelSpeech, muted, supported: ttsSupported, toggleMute } = useSpeechOutput();
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  // Auto-send when mic result arrives — no send button tap required
  const { listening, transcribing, start: startListening, stop: stopListening, supported: micSupported } =
    useSpeechInput((text) => processInput(text));

  // ── Live Conversation Mode — always-listening, interruptible voice loop ──
  // Reuses the existing per-character ElevenLabs TTS + Whisper STT stack
  // (no ElevenLabs Conversational Agents / per-minute billing).
  const [liveMode, setLiveMode] = useState(false);
  const [liveState, setLiveState] = useState<ConversationState>("idle");
  const [jacVolume, setJacVolumeState] = useState(() => getJacVolume());
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const engineRef = useRef<ConversationEngine | null>(null);

  function getEngine(): ConversationEngine {
    if (!engineRef.current) {
      engineRef.current = new ConversationEngine({
        onUtterance: (text) => { processInput(text); },
        onStateChange: setLiveState,
        onError: (reason) => {
          setLiveMode(false);
          setLiveState("idle");
          const sentinel = reason === "mic_denied" ? "__mic_denied__" : "__mic_error__";
          processInput(sentinel);
        },
      });
    }
    return engineRef.current;
  }

  function stopLiveMode() {
    engineRef.current?.stop();
    setLiveMode(false);
    setLiveState("idle");
  }

  async function toggleLiveMode() {
    if (liveMode) {
      stopLiveMode();
      return;
    }
    // unlockAudioContext() MUST run synchronously inside this gesture handler
    // so the AudioContext is in "running" state before any async work starts.
    // After this call, audio will route through the loudspeaker on iOS/Android.
    unlockAudioContext();
    cancelSpeech();
    cancelAllJacAudio();
    if (listening) stopListening();

    // Play greeting NOW — AudioContext is running (unlocked above), so the
    // audio goes through the loudspeaker on every platform.  The ref guard
    // prevents double-play if the document click listener also fires.
    if (!greetingSpokenRef.current) {
      greetingSpokenRef.current = true;
      const greetingText = messages[0]?.content ?? GREETING.content;
      setTimeout(() => speak(greetingText), 200);
    }

    setLiveMode(true);
    await getEngine().start();
  }

  // Wrapper around jacSpeak that keeps the live-mode VAD in sync with
  // playback so it knows when to arm interruption detection and when to
  // go back to plain listening once JAC finishes talking.
  const speak = useCallback((text: string) => {
    if (mutedRef.current) return;
    const engine = engineRef.current;
    jacSpeak(text, {
      muted: mutedRef.current,
      onStart: () => engine?.notifySpeakingStarted(),
    }).then(() => engine?.notifySpeakingEnded()).catch(() => engine?.notifySpeakingEnded());
  }, []);

  // Tear down the live mic stream on unmount, tab hide, or app background.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") stopLiveMode();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!(typeof window !== "undefined" && (window as any).Capacitor?.isNativePlatform?.())) return;
    let handle: any;
    (async () => {
      try {
        const { App: CapApp } = await import("@capacitor/app");
        handle = CapApp.addListener("appStateChange", ({ isActive }: { isActive: boolean }) => {
          if (!isActive) stopLiveMode();
        });
      } catch {}
    })();
    return () => { handle?.then?.((h: any) => h.remove()).catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { engineRef.current?.stop(); }, []);

  // Dismiss float hint after 4s
  useEffect(() => {
    if (!showFloatHint) return;
    const t = setTimeout(() => {
      setShowFloatHint(false);
      try { localStorage.setItem(JAC_FLOAT_HINT_KEY, "1"); } catch {}
    }, 4000);
    return () => clearTimeout(t);
  }, [showFloatHint]);

  // Greeting spoken flag — shared between the useEffect listener path
  // (user types before tapping mic) and toggleLiveMode (user taps mic first).
  const greetingSpokenRef = useRef(false);

  // Auto-speak greeting on first user interaction.
  // All platforms need a user gesture before audio plays — on iOS/Android the
  // AudioContext starts suspended even in Capacitor native builds, so firing
  // before a gesture sends audio to the earpiece (or nowhere).  Waiting for
  // the gesture guarantees the AudioContext is running and audio goes to the
  // loudspeaker.  The mic-button path is handled inside toggleLiveMode so this
  // listener is only the fallback for users who type or tap elsewhere first.
  useEffect(() => {
    if (mode !== "chat") return;
    if (greetingSpokenRef.current) return;

    const currentGreeting = messages[0]?.content ?? GREETING.content;

    function speakGreeting() {
      if (greetingSpokenRef.current) return;
      greetingSpokenRef.current = true;
      unlockAudioContext();
      setTimeout(() => speak(currentGreeting), 120);
    }

    const opts = { once: true, passive: true } as const;
    const cleanup = () => {
      document.removeEventListener("click",      speakGreeting, opts);
      document.removeEventListener("touchstart", speakGreeting, opts);
      document.removeEventListener("keydown",    speakGreeting, opts);
    };
    document.addEventListener("click",      speakGreeting, opts);
    document.addEventListener("touchstart", speakGreeting, opts);
    document.addEventListener("keydown",    speakGreeting, opts);
    return cleanup;
  }, [mode, messages]);

  function enterChat() {
    unlockAudioContext();
    setMode("chat");
  }

  // Personalise greeting for returning visitors
  useEffect(() => {
    const returning = localStorage.getItem("jac_returning") === "1";
    if (!returning) return;
    fetch("/api/jac/updates")
      .then((r) => r.json())
      .then((data: JacUpdates) => {
        const content = buildReturningGreeting(data);
        setMessages([{ role: "assistant", content }]);
      })
      .catch(() => {
        setMessages([{ role: "assistant", content: "Welcome back! Good to see you again. What can I help you with today?" }]);
      });
  }, []);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    setTimeout(() => { el.scrollTop = el.scrollHeight; }, 60);
  }, [messages, typing]);

  async function processInput(text: string) {
    unlockAudioContext();
    const trimmed = text.trim();
    if (!trimmed || typing) return;

    // ── Navigation sentinels (guest D.D. sign-in invite) — handled client-side ─
    if (trimmed === "__goto_signup__") { window.location.href = "/signup"; return; }
    if (trimmed === "__goto_login__") { window.location.href = "/login"; return; }

    // ── Voice sentinels — never leak to JAC as text ─────────────────────────
    if (trimmed === "__mic_denied__") {
      setMessages(prev => [...prev,
        { role: "assistant", content: "Looks like mic access was blocked. What device are you using?", buttons: [
          { label: "Samsung", message: "Samsung" },
          { label: "Pixel", message: "Pixel" },
          { label: "iPhone", message: "iPhone" },
          { label: "Other Android", message: "Other Android" },
        ]},
      ]);
      if (!muted) speak("Looks like mic access was blocked. What device are you using?");
      return;
    }
    if (
      trimmed === "__whisper_empty__" ||
      trimmed === "__whisper_error__" ||
      trimmed === "__mic_error__"
    ) {
      return;
    }

    // ── Feedback report sentinel ─────────────────────────────────────────────
    if (trimmed === "__submit_feedback_report__") {
      const draft = feedbackDraftRef.current;
      const platform = (typeof window !== "undefined" && (window as any).Capacitor?.getPlatform?.()) ?? "web";
      const currentMsgs = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const confirmMsg = "Got it — your report is on its way to the GUBER team. They'll review it shortly. Anything else I can help you with?";
      setMessages(prev => [...prev,
        { role: "user", content: "Yes, send report" },
        { role: "assistant", content: confirmMsg, buttons: OPENING_OPTIONS },
      ]);
      if (!muted) speak(confirmMsg);
      fetch("/api/jac/feedback-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          deviceInfo: typeof window !== "undefined" ? (navigator.userAgent ?? null) : null,
          currentRoute: typeof window !== "undefined" ? window.location.pathname : null,
          issueCategory: draft?.category ?? "general",
          userDescription: draft?.description ?? null,
          jacMessages: currentMsgs,
        }),
      }).catch(() => {});
      feedbackDraftRef.current = null;
      return;
    }

    const userMsg: JacMsg = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setTyping(true);
    cancelSpeech();
    cancelAllJacAudio();
    try {
      const res = await fetch("/api/jac/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();

      if (data.tracking && typeof data.tracking === "object") {
        _lastTracking = { ..._lastTracking, ...data.tracking };
        saveJacPrefill(_lastTracking);
      }
      if (data.feedbackDraft?.ready) {
        feedbackDraftRef.current = data.feedbackDraft;
      }

      const aMsg: JacMsg = {
        role: "assistant",
        content: data.reply || "What brings you to GUBER today?",
        signupRoute: typeof data.route === "string" && data.route ? data.route : undefined,
        buttons: [
          ...(Array.isArray(data.actions) ? data.actions : []),
          ...(Array.isArray(data.options) ? data.options : []),
        ].filter((b: any) => b?.label && b?.message).slice(0, 11),
        pendingAction: (data.pendingAction && typeof data.pendingAction === "object" && data.pendingAction.id && data.pendingAction.summary)
          ? { id: data.pendingAction.id, type: data.pendingAction.type, summary: data.pendingAction.summary, status: "pending" }
          : undefined,
      };

      const final = [...next, aMsg];
      setMessages(final);
      if (!muted) speak(aMsg.content);
      try { localStorage.setItem("jac_returning", "1"); } catch {}

      await logInteraction(final, {
        tracking: data.tracking,
        converted: !!aMsg.signupRoute,
      });
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Something went sideways — I'm JAC, still here. What brings you to GUBER today?",
        buttons: OPENING_OPTIONS,
      }]);
    } finally {
      setTyping(false);
    }
  }

  function updatePendingAction(id: number, patch: Partial<JacPendingAction>) {
    setMessages(prev => prev.map(m =>
      m.pendingAction?.id === id ? { ...m, pendingAction: { ...m.pendingAction, ...patch } } : m
    ));
  }

  async function confirmPendingAction(pa: JacPendingAction) {
    if (pa.status !== "pending") return;
    updatePendingAction(pa.id, { status: "confirming" });
    try {
      const res = await fetch(`/api/jac/actions/${pa.id}/confirm`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        updatePendingAction(pa.id, { status: "confirmed" });
        const confirmMsg = "Done — that's submitted. Anything else you need?";
        setMessages(prev => [...prev, { role: "assistant", content: confirmMsg, buttons: OPENING_OPTIONS }]);
        if (!muted) speak(confirmMsg);
      } else {
        updatePendingAction(pa.id, { status: "failed", resultMessage: data?.message || "That didn't go through." });
      }
    } catch {
      updatePendingAction(pa.id, { status: "failed", resultMessage: "Something went wrong confirming this." });
    }
  }

  async function cancelPendingAction(pa: JacPendingAction) {
    if (pa.status !== "pending") return;
    updatePendingAction(pa.id, { status: "cancelled" });
    fetch(`/api/jac/actions/${pa.id}/cancel`, { method: "POST" }).catch(() => {});
  }

  function openChat(initial?: string) {
    unlockAudioContext(); // must run synchronously inside gesture handler
    setMode("chat");
    if (initial) { setTimeout(() => processInput(initial), 120); }
    else { setTimeout(() => inputRef.current?.focus(), 120); }
  }

  function openChatMic() {
    unlockAudioContext(); // must run synchronously inside gesture handler
    setMode("chat");
    setTimeout(() => startListening(), 300);
  }

  const ctaLabel = (route?: string) => {
    if (!route) return null;
    if (route.startsWith("/login")) return "Log In";
    if (route.startsWith("/post-job")) return "Post This Job";
    if (route.includes("seller_vehicle")) return "List Your Vehicle";
    if (route.includes("seller")) return "List on Marketplace";
    if (route.includes("business")) return "Set Up Business Account";
    return "Create Free Account";
  };

  if (mode === "splash") {
    return (
      <section className="relative z-10 px-4 sm:px-5 py-8 sm:py-12 max-w-6xl mx-auto w-full" data-testid="section-jac-splash">
        <button
          onClick={enterChat}
          className="w-full rounded-3xl overflow-hidden text-left transition-all active:scale-[0.99] cursor-pointer"
          style={{
            background: "linear-gradient(160deg, hsl(222 47% 8%), hsl(270 60% 6%))",
            border: "1px solid hsl(270 100% 65% / 0.28)",
            boxShadow: "0 8px 64px hsl(270 100% 65% / 0.12), 0 2px 20px rgba(0,0,0,0.5)",
          }}
          data-testid="button-jac-splash"
          aria-label="Tap to meet JAC"
        >
          <div className="flex flex-col md:flex-row items-center gap-0 md:gap-8">
            {/* JAC portrait */}
            <div className="relative flex-shrink-0 w-full md:w-56 h-52 md:h-64 overflow-hidden">
              <img
                src={jacFull}
                alt="JAC"
                className="absolute bottom-0 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-0 h-full w-auto object-contain object-bottom"
                style={{ filter: "drop-shadow(0 0 40px hsl(270 100% 65% / 0.35))" }}
              />
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(to top, hsl(222 47% 8%) 0%, transparent 40%)" }}
              />
            </div>

            {/* Text + CTA */}
            <div className="flex-1 px-6 pb-8 md:py-10 md:px-0 md:pr-10 text-center md:text-left">
              <p
                className="text-[10px] font-display font-black tracking-[0.25em] mb-2"
                style={{ color: "hsl(270 100% 65%)" }}
              >
                GUBER — THE LAND OF OPPORTUNITIES
              </p>
              <h2 className="text-2xl sm:text-3xl font-display font-black text-white leading-tight mb-2">
                Meet JAC
              </h2>
              <p className="text-sm text-white/60 font-display leading-relaxed mb-6">
                Your Job Assisting Coordinator. She'll guide you to work, income, or anything GUBER has to offer — all by voice or tap.
              </p>
              {/* Pulsing CTA */}
              <div className="flex items-center gap-3 justify-center md:justify-start">
                <span
                  className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-display font-black tracking-wide text-black animate-pulse"
                  style={{ background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))" }}
                >
                  🎙 Tap to hear JAC
                </span>
                <span className="text-xs text-white/30 font-display">or scroll past →</span>
              </div>
            </div>
          </div>
        </button>
      </section>
    );
  }

  if (mode === "intro") {
    return (
      <>
      <section className="relative z-10 px-4 sm:px-5 py-8 sm:py-12 max-w-6xl mx-auto w-full" data-testid="section-jac-homepage">
        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: "linear-gradient(160deg, hsl(222 47% 8%), hsl(270 60% 6%))",
            border: "1px solid hsl(270 100% 65% / 0.18)",
            boxShadow: "0 8px 64px hsl(270 100% 65% / 0.07), 0 2px 20px rgba(0,0,0,0.45)",
          }}
        >
          <div className="flex flex-col md:flex-row items-center md:items-end">

            {/* JAC character */}
            <div className="flex-shrink-0 md:w-[220px] flex justify-center md:justify-start pt-6 md:pt-0 px-6 md:px-0">
              <img
                src={jacFull}
                alt="JAC"
                className="h-[180px] md:h-[240px] w-auto object-contain object-bottom"
                style={{ filter: "drop-shadow(0 0 40px hsl(270 100% 65% / 0.28))" }}
                data-testid="img-jac-hero"
              />
            </div>

            {/* Text + actions */}
            <div className="flex-1 px-5 sm:px-8 pb-8 pt-3 md:pt-10 text-center md:text-left">

              <div
                className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full text-[10px] font-display tracking-widest"
                style={{ background: "hsl(270 100% 65% / 0.1)", border: "1px solid hsl(270 100% 65% / 0.25)", color: "hsl(270 100% 78%)" }}
              >
                ✦ JUST ASK JAC
              </div>

              <h2 className="font-display font-black text-3xl sm:text-4xl text-white tracking-tight leading-tight">
                Hi, I'm JAC.
              </h2>
              <p className="font-display font-bold text-lg text-white/60 mt-1 mb-2">
                Your Job Assisting Coordinator.
              </p>
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto md:mx-0">
                Tell me what you need and I'll guide you step by step — no account required to start.
              </p>

              {/* CTA buttons */}
              <div className="flex flex-wrap gap-2 justify-center md:justify-start mb-5">
                {micSupported && (
                  <button
                    onClick={openChatMic}
                    className="flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-display font-bold tracking-wide transition-all active:scale-95"
                    style={{
                      background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))",
                      color: "black",
                      boxShadow: "0 0 20px hsl(270 100% 65% / 0.3)",
                    }}
                    data-testid="button-jac-talk"
                  >
                    <Mic className="w-3.5 h-3.5" /> Talk to JAC
                  </button>
                )}
                <button
                  onClick={() => openChat()}
                  className="flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-display font-bold tracking-wide transition-all active:scale-95"
                  style={{
                    background: "hsl(222 47% 12%)",
                    border: "1px solid hsl(270 100% 65% / 0.3)",
                    color: "hsl(270 100% 78%)",
                  }}
                  data-testid="button-jac-type"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> Type to JAC
                </button>
                <Link
                  href="/get-started"
                  className="flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-display font-bold tracking-wide transition-all active:scale-95 no-underline"
                  style={{ background: "hsl(222 47% 12%)", border: "1px solid hsl(222 47% 22%)", color: "hsl(0 0% 65%)" }}
                  data-testid="link-jac-get-started"
                >
                  Get Started <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Quick chips — the 11 opening options */}
              <div className="flex flex-wrap gap-1.5 justify-center md:justify-start">
                {OPENING_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => openChat(opt.message)}
                    className="px-3 py-1.5 rounded-full text-xs font-display font-semibold transition-all active:scale-95 hover:border-purple-500/40"
                    style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 20%)", color: "rgba(255,255,255,0.65)" }}
                    data-testid={`chip-jac-${opt.label.toLowerCase().replace(/[\s']+/g, "-")}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Floating JAC bubble — visible while minimized so users know she's always available */}

      <button
        onClick={() => { unlockAudioContext(); setMode("chat"); }}
        className="fixed z-[150] w-14 h-14 rounded-full overflow-hidden transition-all active:scale-95"
        style={{
          bottom: "24px",
          right: "16px",
          boxShadow: "0 4px 24px hsl(270 100% 65% / 0.55), 0 2px 8px rgba(0,0,0,0.6)",
          border: "2px solid hsl(270 100% 65% / 0.6)",
        }}
        data-testid="button-jac-float-mini"
        aria-label="Open JAC"
      >
        <img src={jacPortrait} alt="JAC" className="w-full h-full object-cover object-top" />
        {showFloatHint && (
          <span
            className="absolute bottom-16 right-0 whitespace-nowrap rounded-xl px-3 py-1.5 text-[11px] font-display font-semibold text-white animate-fade-in"
            style={{ background: "hsl(270 100% 65% / 0.95)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
          >
            I'm always here ↓
          </span>
        )}
      </button>
      </>
    );
  }

  return (
    <section className="relative z-10 px-4 sm:px-5 py-8 sm:py-12 max-w-6xl mx-auto w-full" data-testid="section-jac-chat">
      <div
        className="rounded-3xl flex flex-col"
        style={{
          background: "linear-gradient(160deg, hsl(222 47% 8%), hsl(270 60% 6%))",
          border: "1px solid hsl(270 100% 65% / 0.18)",
          boxShadow: "0 8px 64px hsl(270 100% 65% / 0.07), 0 2px 20px rgba(0,0,0,0.45)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid hsl(222 47% 13%)" }}>
          <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0" style={{ border: "1.5px solid hsl(270 100% 65% / 0.4)" }}>
            <img src={jacPortrait} alt="JAC" className="w-full h-full object-cover object-top" />
          </div>
          <div>
            <p className="text-sm font-display font-black text-white tracking-wide leading-none">JAC</p>
            <p className="text-[10px] text-muted-foreground font-display tracking-wider mt-0.5">Job Assisting Coordinator</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {ttsSupported && (
              <button
                onClick={toggleMute}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-white transition-colors text-[10px]"
                style={{ background: "hsl(222 47% 12%)" }}
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? "🔇" : "🔊"}
              </button>
            )}
            <button
              onClick={() => setMode("intro")}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-muted-foreground hover:text-white transition-colors text-[10px] font-display tracking-wide"
              style={{ background: "hsl(222 47% 12%)" }}
              data-testid="button-jac-minimize"
              aria-label="Minimize JAC to corner"
            >
              <Minus className="w-3 h-3" />
              Minimize
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={messagesRef} className="overflow-y-auto px-5 py-4 space-y-3" style={{ maxHeight: "420px" }}>
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              data-testid={`jac-msg-${i}`}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0 mt-0.5" style={{ border: "1px solid hsl(270 100% 65% / 0.35)" }}>
                  <img src={jacPortrait} alt="JAC" className="w-full h-full object-cover object-top" />
                </div>
              )}
              <div className="max-w-[85%] space-y-2 flex flex-col">
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.role === "user" ? "rounded-tr-sm font-medium text-black" : "rounded-tl-sm text-white/90"}`}
                  style={
                    msg.role === "user"
                      ? { background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))" }
                      : { background: "hsl(222 47% 12%)", border: "1px solid hsl(222 47% 20%)" }
                  }
                >
                  {msg.content}
                </div>

                {/* Signup CTA */}
                {msg.role === "assistant" && msg.signupRoute && ctaLabel(msg.signupRoute) && (
                  <Link
                    href={msg.signupRoute}
                    className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-display font-black transition-all active:scale-[0.97] no-underline"
                    style={{ background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))", color: "black" }}
                    data-testid={`jac-cta-${i}`}
                    onClick={() => logInteraction(messages, { converted: true })}
                  >
                    {ctaLabel(msg.signupRoute)} <ArrowRight className="w-4 h-4" />
                  </Link>
                )}

                {/* Confirm-before-submit workflow card */}
                {msg.role === "assistant" && msg.pendingAction && (
                  <div
                    className="rounded-2xl px-4 py-3 space-y-2.5"
                    style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(270 100% 65% / 0.35)" }}
                    data-testid={`jac-pending-action-${msg.pendingAction.id}`}
                  >
                    <p className="text-[10px] font-display font-black tracking-widest" style={{ color: "hsl(270 100% 78%)" }}>
                      REVIEW BEFORE SUBMITTING
                    </p>
                    <p className="text-sm text-white/90 leading-relaxed">{msg.pendingAction.summary}</p>
                    {msg.pendingAction.status === "pending" && (
                      <div className="flex gap-2 pt-0.5">
                        <button
                          onClick={() => confirmPendingAction(msg.pendingAction!)}
                          className="flex-1 rounded-xl px-4 py-2 text-sm font-display font-black transition-all active:scale-[0.97]"
                          style={{ background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))", color: "black" }}
                          data-testid={`jac-confirm-action-${msg.pendingAction.id}`}
                        >
                          Confirm & Submit
                        </button>
                        <button
                          onClick={() => cancelPendingAction(msg.pendingAction!)}
                          className="rounded-xl px-4 py-2 text-sm font-display font-semibold transition-all active:scale-[0.97]"
                          style={{ background: "hsl(222 47% 15%)", border: "1px solid hsl(222 47% 22%)", color: "rgba(255,255,255,0.7)" }}
                          data-testid={`jac-cancel-action-${msg.pendingAction.id}`}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    {msg.pendingAction.status === "confirming" && (
                      <p className="text-xs text-white/50 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Submitting…</p>
                    )}
                    {msg.pendingAction.status === "confirmed" && (
                      <p className="text-xs font-semibold" style={{ color: "hsl(152 100% 55%)" }}>✓ Submitted</p>
                    )}
                    {msg.pendingAction.status === "cancelled" && (
                      <p className="text-xs text-white/40">Cancelled — nothing was submitted.</p>
                    )}
                    {msg.pendingAction.status === "failed" && (
                      <p className="text-xs" style={{ color: "hsl(0 80% 65%)" }}>{msg.pendingAction.resultMessage || "That didn't go through."}</p>
                    )}
                  </div>
                )}

                {/* Follow-up buttons / option chips */}
                {msg.role === "assistant" && msg.buttons && msg.buttons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.buttons.map((btn) => (
                      <button
                        key={btn.label}
                        onClick={() => processInput(btn.message)}
                        className="rounded-full px-3 py-1.5 text-xs font-display font-semibold transition-all active:scale-95"
                        style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 20%)", color: "rgba(255,255,255,0.8)" }}
                        data-testid={`jac-btn-${btn.label.toLowerCase().replace(/[\s']+/g, "-")}`}
                        disabled={typing}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {typing && (
            <div className="flex gap-2.5 justify-start" data-testid="jac-typing">
              <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0" style={{ border: "1px solid hsl(270 100% 65% / 0.35)" }}>
                <img src={jacPortrait} alt="JAC" className="w-full h-full object-cover object-top" />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5"
                style={{ background: "hsl(222 47% 12%)", border: "1px solid hsl(222 47% 20%)" }}>
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "hsl(270 100% 78%)", animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "hsl(270 100% 78%)", animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "hsl(270 100% 78%)", animationDelay: "300ms" }} />
              </div>
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="px-5 pb-5 pt-3 flex-shrink-0" style={{ borderTop: "1px solid hsl(222 47% 13%)" }}>
          {/* Volume slider — shown when user taps the volume icon */}
          {showVolumeSlider && (
            <div className="flex items-center gap-3 mb-2 px-1">
              <Volume2 className="w-4 h-4 flex-shrink-0" style={{ color: "hsl(270 100% 78%)" }} />
              <input
                type="range"
                min={JAC_VOLUME_BOUNDS.min}
                max={JAC_VOLUME_BOUNDS.max}
                step={0.1}
                value={jacVolume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setJacVolume(v);
                  setJacVolumeState(v);
                }}
                className="flex-1 accent-purple-400"
                data-testid="slider-jac-volume"
              />
              <span className="text-xs w-6 text-right flex-shrink-0" style={{ color: "hsl(270 100% 78%)" }}>
                {Math.round((jacVolume / JAC_VOLUME_BOUNDS.max) * 100)}%
              </span>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl px-3 py-2" style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(222 47% 16%)" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); processInput(input); } }}
              placeholder="Tell JAC what you need…"
              className="flex-1 bg-transparent border-0 resize-none text-sm text-white placeholder:text-muted-foreground outline-none min-h-[36px] max-h-[100px] py-1.5 px-0 leading-relaxed"
              rows={1}
              disabled={typing}
              data-testid="input-jac-homepage"
            />
            {/* Volume toggle */}
            <button
              onClick={() => setShowVolumeSlider(v => !v)}
              className="w-8 h-8 rounded-xl flex-shrink-0 mb-0.5 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{ color: showVolumeSlider ? "hsl(270 100% 78%)" : "hsl(0 0% 45%)" }}
              data-testid="button-jac-volume"
              aria-label="Adjust JAC volume"
            >
              <Volume2 className="w-4 h-4" />
            </button>
            {micSupported && (
              <button
                onClick={toggleLiveMode}
                className={`relative w-12 h-12 rounded-2xl flex-shrink-0 mb-0.5 flex items-center justify-center transition-all duration-200 ${liveMode ? "scale-110" : "hover:scale-105 active:scale-95"}`}
                style={{
                  background: liveMode
                    ? liveState === "speaking"
                      ? "linear-gradient(135deg, hsl(152 90% 40%), hsl(152 70% 30%))"
                      : liveState === "recording"
                        ? "linear-gradient(135deg, hsl(0 85% 52%), hsl(15 90% 48%))"
                        : "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))"
                    : "linear-gradient(135deg, hsl(270 70% 25%), hsl(152 60% 16%))",
                  color: "white",
                  boxShadow: liveMode
                    ? "0 0 0 3px hsl(270 100% 65% / 0.35), 0 0 20px hsl(270 100% 65% / 0.5)"
                    : "0 0 10px hsl(270 100% 65% / 0.35), inset 0 1px 0 hsl(270 100% 70% / 0.15)",
                }}
                data-testid="button-jac-mic"
                disabled={typing}
                aria-label={liveMode ? "End conversation" : "Call JAC"}
              >
                {liveMode && (
                  <span className="absolute inset-0 rounded-2xl animate-ping opacity-25" style={{ background: "hsl(270 100% 65%)" }} />
                )}
                {liveMode
                  ? liveState === "recording"
                    ? <Mic className="w-6 h-6" />
                    : liveState === "speaking"
                      ? <Volume2 className="w-6 h-6" />
                      : <Loader2 className="w-6 h-6 animate-spin" />
                  : <Mic className="w-6 h-6" />}
              </button>
            )}
            <button
              onClick={() => processInput(input)}
              disabled={!input.trim() || typing}
              className="w-8 h-8 rounded-xl flex-shrink-0 mb-0.5 flex items-center justify-center transition-all disabled:opacity-40"
              style={{
                background: input.trim() && !typing ? "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))" : "hsl(222 47% 15%)",
                color: input.trim() && !typing ? "black" : "hsl(0 0% 40%)",
              }}
              data-testid="button-jac-send"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground/40 mt-2 font-display tracking-wide">
            JUST ASK JAC · Free to start · No account needed to chat
          </p>
        </div>
      </div>
    </section>
  );
}
