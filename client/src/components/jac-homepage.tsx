import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { Send, Mic, Volume2, ArrowRight, MessageSquare, Minus, Loader2 } from "lucide-react";
import { JacConvaiVoice } from "@/components/jac/jac-convai-voice";
import { useSpeechInput, useSpeechOutput } from "@/hooks/use-speech";
import { jacSpeak, cancelAllJacAudio, unlockAudioContext, getJacVolume, setJacVolume, JAC_VOLUME_BOUNDS } from "@/lib/jac-tts";
import { ConversationProvider } from "@elevenlabs/react";
import { JacConvaiSession, prewarmJacSession, type JacConvaiSessionHandle, type ConvaiPhase } from "@/components/jac/jac-convai-session";
type ConversationState = "idle" | "listening" | "recording" | "processing" | "speaking";
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
  content: "To talk to me, tap the mic button! 🎤",
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
const JAC_MIC_HINT_KEY   = "jac_hp_mic_hint_done";

// ── GUBER context detection for phone content cards ───────────────────
type GuberCtx = "jobs" | "cash" | "vi" | "business" | "studio" | "default";
function detectGuberContext(text: string): GuberCtx {
  const t = text.toLowerCase();
  if (t.includes("studio") || t.includes("video") || t.includes("music") || t.includes("content create")) return "studio";
  if (t.includes("cash drop") || t.includes("cash reward") || t.includes("drop") && t.includes("earn")) return "cash";
  if (t.includes("verify") || t.includes("inspect") || t.includes("v&i")) return "vi";
  if (t.includes("business") || t.includes("scout") || t.includes("biz ") || t.includes("post job")) return "business";
  if (t.includes("job") || t.includes("work") || t.includes("earn") || t.includes("gig") || t.includes("labor") || t.includes("service")) return "jobs";
  return "default";
}

function GuberContextCard({ msg }: { msg: string }) {
  const ctx = detectGuberContext(msg);
  const cardBase: React.CSSProperties = { borderRadius: 14, overflow: "hidden" };

  if (ctx === "jobs") return (
    <div style={{ ...cardBase, background: "hsl(152 60% 4%)", border: "1px solid hsl(152 100% 44% / 0.22)" }}>
      <div style={{ padding: "6px 12px", background: "hsl(152 60% 6%)", borderBottom: "1px solid hsl(152 100% 44% / 0.12)" }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.2em", color: "hsl(152 100% 55%)" }}>JOBS NEAR YOU</span>
      </div>
      {[{ t: "General Labor", r: "$18/hr", s: "TODAY" }, { t: "Delivery Driver", r: "$22/hr", s: "NOW" }, { t: "Landscaping", r: "$20/hr", s: "HIRING" }].map(j => (
        <div key={j.t} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", borderBottom: "1px solid hsl(222 47% 11%)" }}>
          <div><p style={{ fontSize: 11, fontWeight: 600, color: "white", margin: 0 }}>{j.t}</p><p style={{ fontSize: 10, color: "hsl(152 100% 55%)", margin: 0 }}>{j.r}</p></div>
          <span style={{ fontSize: 8, fontWeight: 900, padding: "2px 6px", borderRadius: 4, background: "hsl(152 100% 44% / 0.15)", color: "hsl(152 100% 60%)" }}>{j.s}</span>
        </div>
      ))}
    </div>
  );

  if (ctx === "cash") return (
    <div style={{ ...cardBase, background: "hsl(43 100% 4%)", border: "1px solid hsl(43 100% 60% / 0.28)" }}>
      <div style={{ padding: "6px 12px", background: "hsl(43 100% 6%)", borderBottom: "1px solid hsl(43 100% 60% / 0.12)" }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.2em", color: "hsl(43 100% 65%)" }}>CASH DROPS</span>
      </div>
      <div style={{ padding: "12px", textAlign: "center" }}>
        <p style={{ fontSize: 24, fontWeight: 900, color: "hsl(43 100% 65%)", margin: "0 0 4px" }}>$25–$500</p>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", margin: "0 0 8px" }}>Hidden drops in your city</p>
        <span style={{ fontSize: 18 }}>🗺️ 📍 💰</span>
      </div>
    </div>
  );

  if (ctx === "vi") return (
    <div style={{ ...cardBase, background: "hsl(222 47% 8%)", border: "1px solid hsl(270 100% 65% / 0.22)" }}>
      <div style={{ padding: "6px 12px", background: "hsl(222 47% 10%)", borderBottom: "1px solid hsl(270 100% 65% / 0.1)" }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.2em", color: "hsl(270 100% 78%)" }}>VERIFY & INSPECT</span>
      </div>
      <div style={{ padding: "10px 12px" }}>
        {["📸 Photo documentation", "🔍 Condition reports", "✅ Trust-verified"].map(s => (
          <p key={s} style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", margin: "0 0 4px" }}>{s}</p>
        ))}
      </div>
    </div>
  );

  if (ctx === "business") return (
    <div style={{ ...cardBase, background: "hsl(222 47% 8%)", border: "1px solid hsl(270 100% 65% / 0.22)" }}>
      <div style={{ padding: "6px 12px", background: "hsl(222 47% 10%)", borderBottom: "1px solid hsl(270 100% 65% / 0.1)" }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.2em", color: "hsl(270 100% 78%)" }}>GUBER BUSINESS</span>
      </div>
      <div style={{ padding: "10px 12px" }}>
        {["🏢 Post unlimited jobs", "🎯 Scout top talent", "📊 Business dashboard"].map(s => (
          <p key={s} style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", margin: "0 0 4px" }}>{s}</p>
        ))}
      </div>
    </div>
  );

  if (ctx === "studio") return (
    <div style={{ ...cardBase, background: "hsl(270 60% 6%)", border: "1px solid hsl(270 100% 65% / 0.28)" }}>
      <div style={{ padding: "6px 12px", background: "hsl(270 60% 8%)", borderBottom: "1px solid hsl(270 100% 65% / 0.1)" }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.2em", color: "hsl(270 100% 78%)" }}>GUBER STUDIO</span>
      </div>
      <div style={{ padding: "10px 12px" }}>
        {["🎬 AI Video Generation", "🎵 AI Music Creation", "✨ 2 free trial credits"].map(s => (
          <p key={s} style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", margin: "0 0 4px" }}>{s}</p>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ ...cardBase, background: "hsl(222 47% 8%)", border: "1px solid hsl(270 100% 65% / 0.15)", padding: "14px 12px", textAlign: "center" }}>
      <p style={{ fontSize: 20, margin: "0 0 6px" }}>🌐</p>
      <p style={{ fontSize: 11, fontWeight: 900, color: "hsl(270 100% 72%)", margin: "0 0 4px" }}>GUBER</p>
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, margin: "0 0 10px" }}>Global Unlimited Business & Employment Resources</p>
      <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
        {[{ l: "Jobs", v: "2.4K" }, { l: "Members", v: "41+" }, { l: "States", v: "7" }].map(s => (
          <div key={s.l} style={{ textAlign: "center" }}>
            <p style={{ fontSize: 13, fontWeight: 900, color: "white", margin: 0 }}>{s.v}</p>
            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", margin: 0 }}>{s.l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  // Mic guidance — pulsing button + "Tap to talk" label until first mic use
  const [micHintDone, setMicHintDone] = useState(() => {
    try { return localStorage.getItem(JAC_MIC_HINT_KEY) === "1"; } catch { return false; }
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

  // ── ElevenLabs ConvAI — runs silently behind the mic button ──────────────
  const [liveMode, setLiveMode] = useState(false);
  const [liveState, setLiveState] = useState<ConversationState>("idle");
  const [jacVolume, setJacVolumeState] = useState(() => getJacVolume());
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [convaiKey, setConvaiKey] = useState(0);
  const convaiSessionRef = useRef<JacConvaiSessionHandle | null>(null);
  // Skip the CRT animation for returning visitors — they've seen it.
  // First-timers get the full 3.2s effect; everybody else goes straight to "done".
  const _crtAlreadySeen = typeof window !== "undefined" && localStorage.getItem("jac_crt_seen") === "1";
  const [powerOnPhase, setPowerOnPhase] = useState<"black" | "scanline" | "fadein" | "done">(
    _crtAlreadySeen ? "done" : "black"
  );
  const powerOnPlayedRef = useRef(_crtAlreadySeen);
  const liveModeRef = useRef(false);
  useEffect(() => { liveModeRef.current = liveMode; }, [liveMode]);

  const handleConvaiPhaseChange = useCallback((phase: ConvaiPhase) => {
    if (phase === "error") { setLiveMode(false); setLiveState("idle"); return; }
    if (phase === "speaking") setLiveState("speaking");
    else if (phase === "listening") setLiveState("recording");
    else setLiveState("listening");
  }, []);

  const handleConvaiUserTranscript = useCallback((text: string) => {
    setMessages(prev => [...prev, { role: "user" as const, content: text }]);
  }, []);

  const handleConvaiJacResponse = useCallback((text: string) => {
    setMessages(prev => {
      // Replace the initial static greeting with the first ConvAI transcript
      // so only one greeting bubble is ever shown (ConvAI's own words).
      if (prev.length === 1 && prev[0].role === "assistant") {
        return [{ role: "assistant" as const, content: text }];
      }
      return [...prev, { role: "assistant" as const, content: text }];
    });
  }, []);

  const handleConvaiError = useCallback((_msg: string) => {
    setLiveMode(false);
    setLiveState("idle");
  }, []);

  function stopLiveMode() {
    setLiveMode(false);
    setLiveState("idle");
  }

  function toggleLiveMode() {
    if (liveMode) { stopLiveMode(); return; }
    unlockAudioContext();
    cancelSpeech();
    cancelAllJacAudio();
    if (listening) stopListening();
    // Block text-TTS greeting immediately (sync) so the 120ms deferred speak()
    // call from the touchstart listener no-ops — liveModeRef must be true before
    // that timeout fires, but useEffect only runs after a re-render (too slow).
    greetingSpokenRef.current = true;
    liveModeRef.current = true;   // sync guard — speak() checks this ref directly
    setLiveMode(true);
    setLiveState("listening");
    // Do NOT bump convaiKey here — that remounts the component and wastes ~100ms.
    // The active prop change alone restarts the session correctly.
    // (Key only changes on explicit reconnect after an error.)
    // Mark mic hint done on first use
    if (!micHintDone) {
      setMicHintDone(true);
      try { localStorage.setItem(JAC_MIC_HINT_KEY, "1"); } catch {}
    }
  }

  // speak — text-mode TTS only; no-ops when ConvAI is active (ElevenLabs handles audio)
  const speak = useCallback((text: string) => {
    if (mutedRef.current || liveModeRef.current) return;
    jacSpeak(text, { muted: mutedRef.current });
  }, []);

  // Pre-warm the ConvAI session token on mount so it's ready before the user
  // taps the mic — eliminates the biggest startup latency (~500-1500 ms).
  useEffect(() => {
    prewarmJacSession("/api/jac/convai/investor-session");
  }, []);

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

  // Unlock AudioContext on first user gesture — do NOT speak via text-TTS.
  // ElevenLabs ConvAI is the sole voice; it will play its configured greeting
  // automatically once the session connects (when the user taps the mic button).
  // The greeting text is always shown on screen regardless of voice mode.
  useEffect(() => {
    if (mode !== "chat") return;
    if (greetingSpokenRef.current) return;

    function unlockOnGesture() {
      if (greetingSpokenRef.current) return;
      greetingSpokenRef.current = true;
      unlockAudioContext();
      // No speak() call — ConvAI voices the greeting when the mic is tapped
    }

    const opts = { once: true, passive: true } as const;
    const cleanup = () => {
      document.removeEventListener("click",      unlockOnGesture, opts);
      document.removeEventListener("touchstart", unlockOnGesture, opts);
      document.removeEventListener("keydown",    unlockOnGesture, opts);
    };
    document.addEventListener("click",      unlockOnGesture, opts);
    document.addEventListener("touchstart", unlockOnGesture, opts);
    document.addEventListener("keydown",    unlockOnGesture, opts);
    return cleanup;
  }, [mode]);

  // CRT power-on: plays once for first-time visitors only.
  // Mark as seen in localStorage so subsequent visits skip straight to "done".
  useEffect(() => {
    if (mode !== "chat") return;
    if (powerOnPlayedRef.current) return;
    powerOnPlayedRef.current = true;
    const t1 = setTimeout(() => setPowerOnPhase("scanline"), 500);
    const t2 = setTimeout(() => setPowerOnPhase("fadein"), 1500);
    const t3 = setTimeout(() => {
      setPowerOnPhase("done");
      try { localStorage.setItem("jac_crt_seen", "1"); } catch {}
    }, 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [mode]);

  function enterChat() {
    unlockAudioContext();
    setMode("chat");
  }

  // Returning-visitor personalisation — ConvAI now voices the greeting, so we
  // no longer overwrite the chat bubble here; the static GREETING stays until
  // ConvAI's first transcript replaces it.
  useEffect(() => {
    const returning = localStorage.getItem("jac_returning") === "1";
    if (!returning) return;
    // Pre-fetch updates so they're ready for JAC's backend context, but
    // don't touch the message bubble — ConvAI handles the spoken greeting.
    fetch("/api/jac/updates").catch(() => {});
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
      // In live voice mode use the fast /api/jac/voice endpoint:
      //   • plain text response (no JSON parsing overhead)
      //   • max 80 tokens vs 600, parallel KB context with 300ms timeout
      //   • anti-repetition rules — no "What brings you to GUBER?" loops
      // Text mode keeps the full /api/jac/onboard (buttons, routes, tracking).
      const endpoint = "/api/jac/onboard";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "homepage", messages: next.map(m => ({ role: m.role, content: m.content })) }),
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
                TEAM GUBER · YOUR REAL-WORLD TEAM
              </p>
              <h2 className="text-2xl sm:text-3xl font-display font-black text-white leading-tight mb-2">
                Meet JAC
              </h2>
              <p className="text-sm text-white/60 font-display leading-relaxed mb-6">
                Your Team GUBER coordinator. She helps you earn, get help, move things, explore opportunities, and handle life — all by voice or tap.
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
      <section className="relative z-10 px-4 sm:px-5 py-6 sm:py-10 max-w-6xl mx-auto w-full" data-testid="section-jac-homepage">
        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: "linear-gradient(160deg, hsl(222 47% 7%) 0%, hsl(270 60% 5%) 100%)",
            border: "1px solid hsl(270 100% 65% / 0.22)",
            boxShadow: "0 0 0 1px hsl(270 100% 65% / 0.05), 0 8px 64px hsl(270 100% 65% / 0.1), 0 2px 24px rgba(0,0,0,0.6)",
          }}
        >
          <div className="flex flex-col md:flex-row items-stretch">

            {/* JAC character panel */}
            <div
              className="relative flex-shrink-0 md:w-[280px] flex justify-center md:justify-end items-end overflow-hidden"
              style={{ background: "linear-gradient(135deg, hsl(270 60% 6%), hsl(270 80% 4%))", minHeight: 260 }}
            >
              <img
                src={jacFull}
                alt="JAC"
                className="h-[260px] md:h-[340px] w-auto object-contain object-bottom relative z-10"
                style={{ filter: "drop-shadow(0 0 60px hsl(270 100% 65% / 0.45))" }}
                data-testid="img-jac-hero"
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(to right, transparent 50%, hsl(222 47% 7%))" }}
              />
            </div>

            {/* Text + actions */}
            <div className="flex-1 px-6 sm:px-8 py-8 flex flex-col justify-center text-center md:text-left">

              {/* Online indicator */}
              <div className="inline-flex items-center gap-2 mb-4 justify-center md:justify-start">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                <span className="text-[10px] font-display font-black tracking-[0.25em] text-emerald-400">ONLINE · READY TO HELP</span>
              </div>

              <h2 className="font-display font-black text-4xl sm:text-5xl text-white tracking-tight leading-none mb-2">
                Meet JAC
              </h2>
              <p className="font-display font-bold text-base mb-5 tracking-wide" style={{ color: "hsl(270 100% 72%)" }}>
                Job Assistance Coordinator
              </p>
              <p className="text-sm text-white/55 leading-relaxed mb-6 max-w-md mx-auto md:mx-0">
                Ask JAC about finding work, hiring help, posting tasks, or how GUBER works. No account needed to start — just ask.
              </p>

              {/* Primary CTAs */}
              <div className="flex flex-wrap gap-3 justify-center md:justify-start mb-5">
                <JacConvaiVoice />
                <button
                  onClick={() => openChat()}
                  className="flex items-center gap-2 h-11 px-6 rounded-xl text-sm font-display font-black tracking-wide transition-all active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))",
                    color: "black",
                    boxShadow: "0 0 20px hsl(270 100% 65% / 0.3)",
                  }}
                  data-testid="button-jac-type"
                >
                  <MessageSquare className="w-4 h-4" /> Ask JAC
                </button>
              </div>

              {/* Quick action chips */}
              <p className="text-[10px] font-display tracking-widest mb-2 text-center md:text-left" style={{ color: "hsl(0 0% 35%)" }}>WHAT DO YOU NEED?</p>
              <div className="flex flex-wrap gap-1.5 justify-center md:justify-start">
                {OPENING_OPTIONS.slice(0, 8).map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => openChat(opt.message)}
                    className="px-3 py-1.5 rounded-full text-xs font-display font-semibold transition-all active:scale-95 hover:border-purple-500/50"
                    style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(222 47% 22%)", color: "rgba(255,255,255,0.7)" }}
                    data-testid={`chip-jac-${opt.label.toLowerCase().replace(/[\s']+/g, "-")}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] mt-4 text-center md:text-left" style={{ color: "hsl(0 0% 28%)" }}>
                No account needed · Voice powered by ElevenLabs
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Floating JAC bubble — visible while minimized */}
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

  // Derived display values
  const latestJacMsg = [...messages].slice().reverse().find(m => m.role === "assistant");
  const lastWithButtons = [...messages].slice().reverse().find(m => m.role === "assistant" && m.buttons && m.buttons.length > 0);
  const activeButtons = lastWithButtons?.buttons ?? [];
  // Last up to 3 JAC messages for speech bubbles
  const jacBubbles = messages.filter(m => m.role === "assistant").slice(-3);

  return (
    <ConversationProvider>
    <JacConvaiSession
      key={convaiKey}
      ref={convaiSessionRef}
      active={liveMode}
      sessionEndpoint="/api/jac/convai/investor-session"
      onPhaseChange={handleConvaiPhaseChange}
      onUserTranscript={handleConvaiUserTranscript}
      onJacResponse={handleConvaiJacResponse}
      onError={handleConvaiError}
    />
    <section
      className="relative z-10 w-full overflow-hidden"
      style={{ background: "linear-gradient(170deg, hsl(222 47% 4%) 0%, hsl(270 65% 4%) 100%)", minHeight: 640 }}
      data-testid="section-jac-chat"
    >
      {/* ── CRT POWER-ON OVERLAY ── */}
      {powerOnPhase !== "done" && (
        <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden">
          {/* Black base — fades out during fadein phase */}
          <div style={{
            position: "absolute", inset: 0,
            background: "#000",
            opacity: powerOnPhase === "fadein" ? 0 : 1,
            transition: "opacity 0.5s ease-out",
          }} />
          {/* Scanline texture */}
          {powerOnPhase === "scanline" && (
            <div style={{
              position: "absolute", inset: 0,
              backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(180,100,255,0.04) 3px, rgba(180,100,255,0.04) 4px)",
              animation: "jac-crt-scanlines 0.12s linear infinite",
            }} />
          )}
          {/* Horizontal expansion line */}
          {powerOnPhase === "scanline" && (
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              background: "linear-gradient(to bottom, transparent 49.6%, rgba(200,140,255,0.9) 50%, white 50.15%, rgba(100,255,200,0.8) 50.3%, transparent 50.9%)",
              animation: "jac-crt-line 1s ease-in-out forwards",
              transformOrigin: "center center",
            }} />
          )}
        </div>
      )}

      {/* ── MAIN CONTENT — always rendered so ElevenLabs initialises ── */}
      <div
        className="relative max-w-4xl mx-auto px-3 sm:px-6 flex flex-row items-end gap-2 sm:gap-4 md:gap-6 py-4 md:py-10"
        style={{
          filter: powerOnPhase === "black"   ? "blur(20px) brightness(0)"
                : powerOnPhase === "scanline" ? "blur(7px) brightness(0.06)"
                : undefined,
          animation: powerOnPhase === "fadein" ? "jac-crt-fadein 1.7s ease-out forwards" : undefined,
        }}
      >

        {/* ── PHONE (left) ── */}
        <div className="flex-shrink-0 relative" style={{ width: "min(300px, 52vw)" }}>
          {/* Side buttons */}
          <div className="absolute right-[-5px] top-[120px] w-1 h-14 rounded-r-full" style={{ background: "hsl(222 35% 16%)" }} />
          <div className="absolute left-[-5px] top-[98px] w-1 h-8 rounded-l-full"  style={{ background: "hsl(222 35% 16%)" }} />
          <div className="absolute left-[-5px] top-[134px] w-1 h-12 rounded-l-full" style={{ background: "hsl(222 35% 16%)" }} />
          <div className="absolute left-[-5px] top-[158px] w-1 h-12 rounded-l-full" style={{ background: "hsl(222 35% 16%)" }} />

          {/* Phone body */}
          <div className="relative overflow-hidden flex flex-col" style={{
            borderRadius: "clamp(24px, 6vw, 42px)",
            height: "min(580px, 88vw)",
            background: "hsl(222 47% 6%)",
            border: "9px solid hsl(222 32% 12%)",
            boxShadow: "0 0 0 1px hsl(270 100% 65% / 0.22), 0 32px 90px rgba(0,0,0,0.75), inset 0 1px 0 hsl(270 100% 65% / 0.08)",
          }}>

            {/* Dynamic Island */}
            <div className="flex justify-center pt-3 pb-1.5 flex-shrink-0">
              <div className="flex items-center gap-2 px-3 h-7 rounded-full" style={{ background: "hsl(222 47% 4%)", border: "1px solid hsl(270 100% 65% / 0.12)" }}>
                {liveMode ? (
                  <>
                    <span className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ background: liveState === "speaking" ? "hsl(152 100% 55%)" : liveState === "recording" ? "hsl(0 85% 60%)" : "hsl(270 100% 65%)" }} />
                    <span className="text-[9px] font-display tracking-wider text-white/55">JAC · {liveState === "speaking" ? "speaking" : liveState === "recording" ? "listening" : "connecting…"}</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                    <span className="text-[9px] font-display tracking-wider text-white/45">JAC · GUBER</span>
                  </>
                )}
              </div>
            </div>

            {/* ── PHONE CONTENT — contextual GUBER info ── */}
            <div className="flex-1 overflow-y-auto min-h-0 px-3 py-2 space-y-2.5">

              {/* Priority 1: pending action */}
              {latestJacMsg?.pendingAction && (
                <div className="rounded-2xl px-3 py-2.5 space-y-2"
                  style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(270 100% 65% / 0.32)" }}
                  data-testid={`jac-pending-action-${latestJacMsg.pendingAction.id}`}
                >
                  <p className="text-[9px] font-display font-black tracking-widest" style={{ color: "hsl(270 100% 78%)" }}>REVIEW BEFORE SUBMITTING</p>
                  <p className="text-[11px] text-white/85 leading-relaxed">{latestJacMsg.pendingAction.summary}</p>
                  {latestJacMsg.pendingAction.status === "pending" && (
                    <div className="flex gap-1.5">
                      <button onClick={() => confirmPendingAction(latestJacMsg.pendingAction!)} className="flex-1 rounded-xl py-1.5 text-[11px] font-display font-black transition-all active:scale-95" style={{ background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))", color: "black" }} data-testid={`jac-confirm-action-${latestJacMsg.pendingAction.id}`}>Confirm</button>
                      <button onClick={() => cancelPendingAction(latestJacMsg.pendingAction!)} className="rounded-xl px-3 py-1.5 text-[11px] font-display transition-all active:scale-95" style={{ background: "hsl(222 47% 14%)", border: "1px solid hsl(222 47% 22%)", color: "rgba(255,255,255,0.7)" }} data-testid={`jac-cancel-action-${latestJacMsg.pendingAction.id}`}>Cancel</button>
                    </div>
                  )}
                  {latestJacMsg.pendingAction.status === "confirming" && <p className="text-[11px] text-white/50 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Submitting…</p>}
                  {latestJacMsg.pendingAction.status === "confirmed"  && <p className="text-[11px] font-semibold" style={{ color: "hsl(152 100% 55%)" }}>✓ Submitted</p>}
                  {latestJacMsg.pendingAction.status === "cancelled"  && <p className="text-[11px] text-white/40">Cancelled</p>}
                  {latestJacMsg.pendingAction.status === "failed"     && <p className="text-[11px]" style={{ color: "hsl(0 80% 65%)" }}>{latestJacMsg.pendingAction.resultMessage || "That didn't go through."}</p>}
                </div>
              )}

              {/* Priority 2: CTA card */}
              {latestJacMsg?.signupRoute && ctaLabel(latestJacMsg.signupRoute) && (
                <Link
                  href={latestJacMsg.signupRoute}
                  className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 no-underline transition-all active:scale-95"
                  style={{ background: "linear-gradient(135deg, hsl(270 100% 65% / 0.12), hsl(152 100% 44% / 0.08))", border: "1px solid hsl(270 100% 65% / 0.28)" }}
                  data-testid="jac-cta-phone"
                  onClick={() => logInteraction(messages, { converted: true })}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))" }}>
                    <ArrowRight className="w-4 h-4 text-black" />
                  </div>
                  <div>
                    <p className="text-xs font-display font-black text-white">{ctaLabel(latestJacMsg.signupRoute)}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">Tap to get started →</p>
                  </div>
                </Link>
              )}

              {/* Priority 3: GUBER context card */}
              <GuberContextCard msg={latestJacMsg?.content ?? ""} />
            </div>

            {/* Option chips — single-row horizontal scroll so the mic bar is always visible */}
            {activeButtons.length > 0 && (
              <div
                className="px-3 py-2 flex flex-nowrap gap-1.5 flex-shrink-0 overflow-x-auto"
                style={{ borderTop: "1px solid hsl(222 47% 11%)", background: "hsl(222 47% 5%)", scrollbarWidth: "none" }}
              >
                {activeButtons.map((btn) => (
                  <button
                    key={btn.label}
                    onClick={() => processInput(btn.message)}
                    className="rounded-full px-2.5 py-1 text-[10px] font-display font-semibold transition-all active:scale-95 disabled:opacity-40 flex-shrink-0"
                    style={{ background: "hsl(222 47% 12%)", border: "1px solid hsl(222 47% 24%)", color: "rgba(255,255,255,0.72)" }}
                    data-testid={`jac-btn-${btn.label.toLowerCase().replace(/[\s']+/g, "-")}`}
                    disabled={typing}
                  >{btn.label}</button>
                ))}
              </div>
            )}

            {/* Volume slider */}
            {showVolumeSlider && (
              <div className="px-3.5 py-2 flex items-center gap-2 flex-shrink-0" style={{ borderTop: "1px solid hsl(222 47% 11%)" }}>
                <Volume2 className="w-3 h-3 flex-shrink-0" style={{ color: "hsl(270 100% 78%)" }} />
                <input type="range" min={JAC_VOLUME_BOUNDS.min} max={JAC_VOLUME_BOUNDS.max} step={0.1} value={jacVolume}
                  onChange={(e) => { const v = parseFloat(e.target.value); setJacVolume(v); setJacVolumeState(v); }}
                  className="flex-1 accent-purple-400 h-1" data-testid="slider-jac-volume" />
                <span className="text-[9px] w-5 text-right flex-shrink-0" style={{ color: "hsl(270 100% 78%)" }}>{Math.round((jacVolume / JAC_VOLUME_BOUNDS.max) * 100)}%</span>
              </div>
            )}

            {/* Input bar */}
            <div className="px-3 pb-4 pt-2 flex-shrink-0" style={{ borderTop: "1px solid hsl(222 47% 11%)", background: "hsl(222 47% 5%)" }}>
              <div className="flex items-center gap-1.5 rounded-2xl px-2.5 py-1.5" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 19%)" }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); processInput(input); } }}
                  placeholder="Ask JAC…"
                  className="flex-1 bg-transparent border-0 resize-none text-[11px] text-white placeholder:text-white/22 outline-none min-h-[28px] max-h-[70px] py-1 px-0 leading-relaxed"
                  rows={1}
                  disabled={typing}
                  data-testid="input-jac-homepage"
                />
                <button onClick={() => setShowVolumeSlider(v => !v)} className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors" style={{ color: showVolumeSlider ? "hsl(270 100% 78%)" : "hsl(0 0% 32%)" }} data-testid="button-jac-volume" aria-label="Volume">
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
                {micSupported && (
                  <div className="relative flex flex-col items-center">
                    {/* "Tap to talk" guidance label — shows until first mic use */}
                    {!liveMode && !micHintDone && (
                      <span
                        className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-display font-semibold tracking-wide pointer-events-none select-none"
                        style={{
                          color: "hsl(270 100% 75%)",
                          textShadow: "0 0 8px hsl(270 100% 65% / 0.6)",
                          animation: "pulse 2s ease-in-out infinite",
                        }}
                      >
                        Tap to talk ↓
                      </span>
                    )}
                    <button
                      onClick={toggleLiveMode}
                      className={`relative w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center transition-all duration-200 ${liveMode ? "scale-105" : "hover:scale-105 active:scale-95"}`}
                      style={{
                        background: liveMode
                          ? liveState === "speaking"  ? "linear-gradient(135deg, hsl(152 90% 40%), hsl(152 70% 30%))"
                            : liveState === "recording" ? "linear-gradient(135deg, hsl(0 85% 52%), hsl(15 90% 48%))"
                            : "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))"
                          : "linear-gradient(135deg, hsl(270 70% 22%), hsl(152 60% 14%))",
                        color: "white",
                        boxShadow: liveMode
                          ? "0 0 0 2px hsl(270 100% 65% / 0.4), 0 0 16px hsl(270 100% 65% / 0.5)"
                          : !micHintDone
                            ? "0 0 0 2px hsl(270 100% 65% / 0.5), 0 0 20px hsl(270 100% 65% / 0.4)"
                            : "0 0 8px hsl(270 100% 65% / 0.3)",
                      }}
                      data-testid="button-jac-mic"
                      disabled={typing}
                      aria-label={liveMode ? "End voice chat" : "Start voice chat with JAC"}
                    >
                      {/* Ping ring — active when live OR when hinting user to start */}
                      {(liveMode || !micHintDone) && (
                        <span
                          className="absolute inset-0 rounded-xl animate-ping opacity-25"
                          style={{ background: liveMode ? "hsl(270 100% 65%)" : "hsl(270 80% 60%)" }}
                        />
                      )}
                      {liveMode
                        ? liveState === "recording" ? <Mic className="w-4 h-4 relative" />
                          : liveState === "speaking"  ? <Volume2 className="w-4 h-4 relative" />
                          : <Loader2 className="w-4 h-4 animate-spin relative" />
                        : <Mic className="w-4 h-4 relative" />}
                    </button>
                  </div>
                )}
                <button
                  onClick={() => processInput(input)}
                  disabled={!input.trim() || typing}
                  className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center transition-all disabled:opacity-30"
                  style={{
                    background: input.trim() && !typing ? "linear-gradient(135deg, hsl(270 100% 65%), hsl(152 100% 44%))" : "hsl(222 47% 14%)",
                    color: input.trim() && !typing ? "black" : "hsl(0 0% 32%)",
                  }}
                  data-testid="button-jac-send"
                >
                  <Send className="w-3 h-3" />
                </button>
              </div>
              <p className="text-center text-[8px] text-white/12 mt-2 font-display tracking-wider">JAC · Voice by ElevenLabs</p>
            </div>
          </div>
        </div>

        {/* ── SPEECH BUBBLES + JAC (right) ── */}
        <div className="flex-1 flex flex-col items-stretch min-w-0" style={{ minHeight: "min(580px, 88vw)" }}>

          {/* Speech bubble column — sits ABOVE JAC, tail points down toward her head */}
          <div className="flex-1 flex flex-col justify-end gap-2 sm:gap-3 pb-3 px-1 sm:px-2 min-w-0">
            {jacBubbles.length === 0 && !typing && !liveMode && (
              <p className="text-[11px] text-white/30 text-center font-display px-4 leading-relaxed">
                {micSupported
                  ? <>Tap the <span style={{ color: "hsl(270 100% 72%)" }}>mic</span> to talk · or type below</>
                  : "Type a message below to get started"}
              </p>
            )}
            {/* Instant "connecting" indicator — shows as soon as mic is tapped,
                disappears the moment ConvAI's first transcript replaces the greeting */}
            {liveMode && liveState !== "speaking" && messages.length === 1 && messages[0].content === "To talk to me, tap the mic button! 🎤" && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-[22px] self-start"
                style={{ background: "hsl(0 0% 97%)", border: "2.5px solid hsl(222 30% 30%)" }}>
                <span className="flex gap-0.5 items-end h-4">
                  {[0, 150, 300].map(delay => (
                    <span key={delay} className="w-1 rounded-full animate-bounce"
                      style={{ height: 6 + (delay / 100), background: "hsl(270 100% 55%)", animationDelay: `${delay}ms` }} />
                  ))}
                </span>
                <span className="text-[11px] font-display" style={{ color: "hsl(222 47% 18%)" }}>JAC is connecting…</span>
              </div>
            )}

            {jacBubbles.map((msg, i) => {
              const count = jacBubbles.length;
              const isNewest = i === count - 1;
              const opacity = count === 1 ? 1 : count === 2 ? (i === 0 ? 0.42 : 1) : [0.25, 0.58, 1][i];
              const isSpeaking = isNewest && liveMode && liveState === "speaking";
              const bubbleBg = isNewest ? "hsl(0 0% 97%)" : "hsl(0 0% 89%)";
              const borderCol = isSpeaking ? "hsl(270 100% 65%)" : "hsl(222 30% 30%)";

              return (
                <div key={i} style={{ opacity, transition: "opacity 0.4s" }}>
                  <div
                    className="relative rounded-[22px] px-4 py-3 text-[12px] leading-relaxed"
                    style={{
                      background: bubbleBg,
                      color: "hsl(222 47% 10%)",
                      border: `2.5px solid ${borderCol}`,
                      boxShadow: isSpeaking
                        ? "0 0 18px hsl(270 100% 65% / 0.55), 0 4px 18px rgba(0,0,0,0.45)"
                        : "0 4px 18px rgba(0,0,0,0.4)",
                      transition: "border-color 0.3s, box-shadow 0.3s",
                      wordBreak: "break-word",
                      marginBottom: isNewest ? 6 : 0,
                    }}
                    data-testid={isNewest ? "jac-latest-bubble" : undefined}
                  >
                    {msg.content}

                    {/* Tail — points DOWN toward JAC's head (only on newest bubble) */}
                    {isNewest && <>
                      <div style={{
                        position: "absolute", bottom: -13, left: "50%", transform: "translateX(-50%)",
                        width: 0, height: 0,
                        borderLeft: "9px solid transparent",
                        borderRight: "9px solid transparent",
                        borderTop: `13px solid ${bubbleBg}`,
                      }} />
                      <div style={{
                        position: "absolute", bottom: -17, left: "50%", transform: "translateX(-50%)",
                        width: 0, height: 0,
                        borderLeft: "11px solid transparent",
                        borderRight: "11px solid transparent",
                        borderTop: `16px solid ${borderCol}`,
                        zIndex: -1,
                      }} />
                    </>}
                  </div>
                </div>
              );
            })}

            {/* Typing dots bubble */}
            {typing && (
              <div data-testid="jac-typing" style={{ marginBottom: 6 }}>
                <div className="relative inline-flex rounded-[22px] px-4 py-3 items-center gap-1.5"
                  style={{ background: "hsl(0 0% 93%)", border: "2.5px solid hsl(222 30% 30%)", boxShadow: "0 4px 16px rgba(0,0,0,0.38)" }}
                >
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "hsl(222 40% 35%)", animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "hsl(222 40% 35%)", animationDelay: "160ms" }} />
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "hsl(222 40% 35%)", animationDelay: "320ms" }} />
                  {/* Tail pointing down */}
                  <div style={{ position: "absolute", bottom: -13, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderTop: "13px solid hsl(0 0% 93%)" }} />
                  <div style={{ position: "absolute", bottom: -17, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "11px solid transparent", borderRight: "11px solid transparent", borderTop: "16px solid hsl(222 30% 30%)", zIndex: -1 }} />
                </div>
              </div>
            )}
          </div>

          {/* JAC character — bottom, beneath the bubbles */}
          <div className="flex-shrink-0 relative self-center" style={{ width: "min(210px, 34vw)" }}>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-36 h-5 rounded-full blur-2xl opacity-40" style={{ background: "hsl(270 100% 65%)" }} />
            <img
              src={jacFull}
              alt="JAC"
              className="relative w-full h-auto object-contain object-bottom"
              style={{ maxHeight: 340, filter: "drop-shadow(0 0 30px hsl(270 100% 65% / 0.42))" }}
              data-testid="img-jac-standing"
            />
            <p className="text-center text-[8px] font-display font-black tracking-[0.28em] mt-1" style={{ color: "hsl(270 100% 65% / 0.38)" }}>TEAM GUBER · JAC</p>
          </div>
        </div>

      </div>
    </section>

    </ConversationProvider>
  );
}
