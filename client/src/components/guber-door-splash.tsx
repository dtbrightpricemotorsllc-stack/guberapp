/**
 * GuberDoorSplash — single entry controller for the GUBER experience.
 *
 * Flow: CLOSED → UNLOCKING → OPENING → OPEN → CONVERSATION (voice|text) → EXIT
 *
 * Spec: GUBER_JAC_INTERACTIVE_VIRTUAL_CHARACTER_PROMPT (see attached_assets)
 *   • JAC has four live states: idle | listening | thinking | speaking
 *   • Voice session is continuous (ElevenLabs turn-detection, no push-to-talk)
 *   • Greeting fires EXACTLY ONCE per tab session (module-level guard)
 *   • Conversation stays inside the scene — no navigation
 *   • One visible JAC — live character layer only
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { jacSpeak, cancelAllJacAudio, unlockAudioContext } from "@/lib/jac-tts";
import {
  ConversationProvider,
} from "@elevenlabs/react";
import {
  JacConvaiSession,
  type JacConvaiSessionHandle,
  type ConvaiPhase,
} from "@/components/jac/jac-convai-session";
import { SignupCard } from "@/components/jac/jac-signup-card";
import {
  getGuestSessionId,
  transferGuestJacSession,
} from "@/hooks/use-guest-jac-session";
import { saveServiceOfferPrefill } from "@/lib/jac-listing-prefill";
import {
  appendSharedJacMessage,
  JAC_WELCOME_GREETING,
} from "@/lib/jac-live-coordination";
import {
  claimAndResolveCampaignPath,
  getActiveCampaignSessionId,
  updateCampaignSession,
  withCampaignSession,
} from "@/lib/campaign-onboarding";

// ── Greeting guard: fires at most once per browser tab session ────────────────
// ── Cinematic assets ─────────────────────────────────────────────────────────
// The reference plates used to generate this shot are intentionally not loaded
// by the app. The browser receives one cohesive film plus a tiny fallback poster.
const DOOR_CINEMATIC = "/splash/guber-door-cinematic-1080.mp4";
const DOOR_POSTER    = "/splash/guber-door-cinematic-poster.webp";

const GREETING_TEXT = JAC_WELCOME_GREETING;
const VOICE_CONNECTION_DEADLINE_MS = 12_000;
const VOICE_FALLBACK_TEXT = "Voice couldn’t connect. You can keep chatting here.";

// ── Types ────────────────────────────────────────────────────────────────────
type DoorPhase = "closed" | "unlocking" | "opening" | "open" | "exiting";
type ConvMode  = "none" | "voice" | "text";
interface Msg   { role: "jac" | "user"; text: string }
type VoiceIssue = {
  kind: "microphone-denied" | "microphone-unavailable" | "session" | "audio" | "transport";
  message: string;
};

export interface GuberDoorSplashProps {
  onEnterVoice: () => void;
  onEnterText:  () => void;
  skip?: boolean;
}

// ── Waveform bars (listening visualisation) ───────────────────────────────
function ListenWave({ active }: { active: boolean }) {
  const BARS = 18;
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:2,
      height:24, opacity: active ? 1 : 0,
      transition:"opacity 400ms ease",
    }}>
      {Array.from({ length: BARS }, (_, i) => (
        <div key={i} style={{
          width:2, borderRadius:2,
          background:`rgba(0,220,170,${0.5 + 0.5 * Math.sin(i / BARS * Math.PI)})`,
          animation:`wave-bar ${0.55 + (i % 5) * 0.09}s ease-in-out infinite alternate`,
          animationDelay:`${i * 0.04}s`,
          height:"60%",
        }} />
      ))}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export function GuberDoorSplash({ onEnterVoice, onEnterText, skip }: GuberDoorSplashProps) {
  // Door animation
  const [phase,        setPhase]        = useState<DoorPhase>("closed");
  const [showGreeting, setShowGreeting] = useState(false);
  const [showButtons,  setShowButtons]  = useState(false);
  const [mounted,      setMounted]      = useState(true);
  const [useLightweightFallback, setUseLightweightFallback] = useState(false);

  // JAC greeting TTS
  const [greetingPlaying, setGreetingPlaying] = useState(false);

  // Conversation state
  const [convMode,     setConvMode]     = useState<ConvMode>("none");
  const [messages,     setMessages]     = useState<Msg[]>([]);
  const [inputText,    setInputText]    = useState("");
  const [textLoading,  setTextLoading]  = useState(false);
  const [jacSpeakingTx,setJacSpeakingTx] = useState(false); // TTS for text replies
  const [convaiPhase,  setConvaiPhase]  = useState<ConvaiPhase>("idle");
  const [convaiActive, setConvaiActive] = useState(false);
  const [, setVoiceIssue] = useState<VoiceIssue | null>(null);
  const [voiceRetryAvailable, setVoiceRetryAvailable] = useState(false);
  const [showSignup,   setShowSignup]   = useState(false);
  const [signupReturnTo, setSignupReturnTo] = useState<string | undefined>();
  const [campaignSessionId] = useState(() => getActiveCampaignSessionId());
  const [campaignKind] = useState<"consumer" | "business" | null>(() => {
    try {
      const value = new URLSearchParams(window.location.search).get("campaignKind");
      return value === "consumer" || value === "business" ? value : null;
    } catch {
      return null;
    }
  });

  const timerRefs      = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cinematicRef   = useRef<HTMLVideoElement>(null);
  const convaiRef      = useRef<JacConvaiSessionHandle | null>(null);
  const phaseRef       = useRef<DoorPhase>("closed");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const signupOffered  = useRef(false); // in-scene signup card fires at most once per conversation
  const greetingHasFired = useRef(false);
  const convaiConnected = useRef(false);
  const convaiIssueRef = useRef<VoiceIssue | null>(null);
  const voiceDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualRetryUsedRef = useRef(false);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timerRefs.current.push(t);
    return t;
  }, []);

  const clearVoiceDeadline = useCallback(() => {
    if (voiceDeadlineRef.current === null) return;
    clearTimeout(voiceDeadlineRef.current);
    voiceDeadlineRef.current = null;
  }, []);

  const enterVoiceFallback = useCallback((
    kind: VoiceIssue["kind"],
    technicalMessage: string,
  ) => {
    clearVoiceDeadline();
    convaiConnected.current = false;
    const issue = { kind, message: technicalMessage };
    convaiIssueRef.current = issue;
    setVoiceIssue(issue);
    setConvaiPhase("error");
    setConvaiActive(false);
    setConvMode("text");
    setVoiceRetryAvailable(!manualRetryUsedRef.current);
    cancelAllJacAudio();
    setGreetingPlaying(false);
    setMessages(current => {
      if (current.some(message => message.text === VOICE_FALLBACK_TEXT)) return current;
      return [...current, { role: "jac", text: VOICE_FALLBACK_TEXT }];
    });
  }, [clearVoiceDeadline]);

  const armVoiceDeadline = useCallback(() => {
    clearVoiceDeadline();
    voiceDeadlineRef.current = setTimeout(() => {
      console.warn("[JAC voice]", {
        category: "transport",
        kind: "connection-deadline",
        connectedBeforeFailure: convaiConnected.current,
      });
      enterVoiceFallback("transport", "connection deadline exceeded");
    }, VOICE_CONNECTION_DEADLINE_MS);
  }, [clearVoiceDeadline, enterVoiceFallback]);

  useEffect(() => {
    if (skip) setMounted(false);
    return () => {
      timerRefs.current.forEach(clearTimeout);
      clearVoiceDeadline();
    };
  }, [clearVoiceDeadline, skip]);

  useEffect(() => {
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const constrainedConnection = connection?.saveData === true || connection?.effectiveType === "2g";
    setUseLightweightFallback(reducedMotion || constrainedConnection);
  }, []);

  // Auto-scroll message list
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Door open sequence ───────────────────────────────────────────────────
  const finishCinematic = useCallback(() => {
    phaseRef.current = "open";
    setPhase("open");
    setShowGreeting(true);
    setMessages(current => {
      if (current.length) return current;
      if (!greetingHasFired.current) {
        greetingHasFired.current = true;
        appendSharedJacMessage({ role: "assistant", content: GREETING_TEXT, source: "homepage" });
      }
      return [{ role: "jac", text: GREETING_TEXT }];
    });
    schedule(() => setShowButtons(true), 420);
  }, [schedule]);

  function handleEnter() {
    if (phase !== "closed") return;
    unlockAudioContext();
    // ENTER is the one user-activation gesture for the live voice path:
    // prime the microphone and start ConvAI before the cinematic so mobile
    // browsers preserve the gesture and the reveal lands in a live session.
    convaiConnected.current = false;
    convaiIssueRef.current = null;
    setVoiceIssue(null);
    setVoiceRetryAvailable(false);
    convaiRef.current?.activate();
    setConvMode("voice");
    setConvaiPhase("connecting");
    setConvaiActive(true);
    armVoiceDeadline();
    phaseRef.current = "opening";
    setPhase("opening");

    if (useLightweightFallback || !cinematicRef.current) {
      schedule(finishCinematic, 220);
      return;
    }

    cinematicRef.current.currentTime = 0;
    cinematicRef.current.play().catch(() => {
      setUseLightweightFallback(true);
      finishCinematic();
    });
  }

  // ── Voice mode entry ──────────────────────────────────────────────────────
  function enterVoice() {
    if (phase !== "open") return;
    cancelAllJacAudio();
    setGreetingPlaying(false);
    setConvMode("voice");
    setConvaiPhase("connecting");
    setConvaiActive(true);
    convaiRef.current?.activate();
    armVoiceDeadline();
  }

  // ── Text mode entry ───────────────────────────────────────────────────────
  function enterText() {
    if (phase !== "open") return;
    cancelAllJacAudio();
    setGreetingPlaying(false);
    clearVoiceDeadline();
    setConvaiActive(false);
    setConvMode("text");
    setTimeout(() => inputRef.current?.focus(), 300);
  }

  // ── Text conversation ─────────────────────────────────────────────────────
  async function sendText(textOverride?: string) {
    const text = (textOverride ?? inputText).trim();
    if (!text || textLoading) return;
    setInputText("");
    const userMsg: Msg = { role: "user", text };
    appendSharedJacMessage({ role: "user", content: text, source: "homepage" });
    setMessages(prev => [...prev, userMsg]);
    setTextLoading(true);

    try {
      const history = [...messages, userMsg].map(m => ({
        role:    m.role === "jac" ? "assistant" : "user",
        content: m.text,
      }));
      const res = await fetch("/api/jac/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          mode: "homepage",
          surface: "door",
          guest_session_id: getGuestSessionId(),
          ...(campaignSessionId ? { campaign_session_id: campaignSessionId } : {}),
        }),
      });
      const data = await res.json();
      const modelRoute = typeof data.route === "string" && data.route ? data.route : null;
      const rawRoute = campaignKind === "business" && modelRoute?.startsWith("/signup")
        ? "/business-signup"
        : modelRoute;
      const campaignRoute = withCampaignSession(rawRoute, campaignSessionId);
      const reply = (data.message || data.reply || "").trim();

      if (campaignSessionId && reply) {
        const intent = typeof data.intent === "string"
          ? data.intent
          : typeof data.tracking?.intent === "string"
            ? data.tracking.intent
            : undefined;
        await updateCampaignSession(campaignSessionId, {
          intent,
          resumePath: rawRoute || undefined,
          context: {
            lastUserMessage: text.slice(0, 300),
            conversation: [...history, { role: "assistant", content: reply }].slice(-12),
            guestDraft: data.guestDraft || undefined,
            tracking: data.tracking || undefined,
          },
          guestSessionId: getGuestSessionId(),
        });
      }
      if (data.guestDraft?.type === "service_offer") {
        saveServiceOfferPrefill(data.guestDraft.data || {});
        setSignupReturnTo(campaignRoute || "/offer-service");
        if (!signupOffered.current) {
          signupOffered.current = true;
          setShowSignup(true);
        }
      }
      // JAC can surface an in-scene signup card when she's gathered enough
      // signal — at most once per conversation (server also guards per session)
      if (!signupOffered.current &&
          Array.isArray(data.actions) && data.actions.some((a: any) => a?.action === "show_signup")) {
        signupOffered.current = true;
        if (campaignRoute) setSignupReturnTo(campaignRoute);
        setShowSignup(true);
      }
      if (reply) {
        appendSharedJacMessage({ role: "assistant", content: reply, source: "homepage" });
        setMessages(prev => [...prev, { role: "jac", text: reply }]);
        setJacSpeakingTx(true);
        // sendText is the text-mode path. ElevenLabs owns every voice-mode
        // response, so a second local speech call would duplicate JAC.
        jacSpeak(reply).catch(() => {}).finally(() => setJacSpeakingTx(false));
      }
    } catch {
      setMessages(prev => [...prev, {
        role: "jac",
        text: "Give me a second — try sending that again.",
      }]);
    } finally {
      setTextLoading(false);
    }
  }

  // ── ConvAI callbacks ───────────────────────────────────────────────────────
  const handleConvaiPhase = useCallback((p: ConvaiPhase) => {
    if (p === "idle" && convaiIssueRef.current) return;
    setConvaiPhase(p);
    if (p === "listening" || p === "speaking" || p === "thinking" || p === "muted") {
      clearVoiceDeadline();
      convaiConnected.current = true;
      convaiIssueRef.current = null;
      setVoiceIssue(null);
      setVoiceRetryAvailable(false);
    }
  }, [clearVoiceDeadline]);

  const handleConvaiError = useCallback((message: string, kind: VoiceIssue["kind"] = "transport") => {
    const microphoneFailure = kind === "microphone-denied" || kind === "microphone-unavailable";
    console.warn("[JAC voice]", {
      category: microphoneFailure ? "microphone" : kind === "session" ? "session-issuance" : "transport",
      kind,
      doorPhase: phaseRef.current,
      connectedBeforeFailure: convaiConnected.current,
    });
    enterVoiceFallback(kind, message);
  }, [enterVoiceFallback]);

  const retryVoice = useCallback(() => {
    if (manualRetryUsedRef.current) return;
    manualRetryUsedRef.current = true;
    convaiConnected.current = false;
    convaiIssueRef.current = null;
    setVoiceIssue(null);
    setVoiceRetryAvailable(false);
    setConvMode("voice");
    setConvaiPhase("connecting");
    convaiRef.current?.activate();
    setConvaiActive(true);
    armVoiceDeadline();
  }, [armVoiceDeadline]);

  const handleConvaiUser = useCallback((text: string) => {
    const t = text.trim();
    if (!t || /^[.\s!?,]*$/.test(t)) return;
    appendSharedJacMessage({ role: "user", content: t, source: "homepage" });
    setMessages(prev => [...prev, { role: "user", text: t }]);
  }, []);

  const handleConvaiJac = useCallback((text: string) => {
    const t = text.replace(/\[.*?\]/g, "").trim();
    if (!t) return;
    setMessages(prev => {
      if (prev.at(-1)?.role === "jac" && prev.at(-1)?.text === t) return prev;
      appendSharedJacMessage({ role: "assistant", content: t, source: "homepage" });
      return [...prev, { role: "jac", text: t }];
    });
  }, []);

  // ── Exit scene → main app ─────────────────────────────────────────────────
  function exitToApp(voice: boolean) {
    phaseRef.current = "exiting";
    setPhase("exiting");
    cancelAllJacAudio();
    setConvaiActive(false);
    schedule(() => {
      // End the door-owned session before revealing the text-only full-app
      // surface. This keeps the door as the sole live-voice owner and prevents
      // duplicate hidden inputs/controllers after Explore.
      setMounted(false);
      if (voice) onEnterVoice(); else onEnterText();
    }, 440);
  }

  if (!mounted) return null;

  const isClosed  = phase === "closed" || phase === "unlocking";
  const isOpening = phase === "opening";
  const exiting   = phase === "exiting";
  const inConv    = convMode !== "none";
  const conversationVisible = phase === "open" && inConv;
  const isMuted       = convaiPhase === "muted";
  const isVoiceLive   = convMode === "voice" &&
    (convaiPhase === "listening" || convaiPhase === "speaking" || convaiPhase === "thinking" || convaiPhase === "muted");
  const statusLabel   =
    convaiPhase === "connecting" ? "Connecting to JAC…" :
    convaiPhase === "thinking"   ? "JAC is thinking…" :
    convaiPhase === "speaking"   ? "JAC is speaking" :
    convaiPhase === "listening"  ? "Listening…" :
    convaiPhase === "muted"      ? "Muted — tap 🎙️ to unmute" : "JAC is here";

  return (
    <>
      {/* ── Global keyframes ─────────────────────────────────────────────── */}
      <style>{`
        @keyframes seam-burst {
          0%   { opacity:0; width:3px; box-shadow:none }
          8%   { opacity:1; width:6px; box-shadow:0 0 24px 12px rgba(120,220,255,1),0 0 60px 20px rgba(80,160,255,.8) }
          40%  { opacity:.6; width:3px; box-shadow:0 0 14px 6px rgba(100,200,255,.7) }
          100% { opacity:0; width:2px; box-shadow:none }
        }
        @keyframes seam-spark-top {
          0%   { opacity:0;  height:0 }
          15%  { opacity:1;  height:42% }
          70%  { opacity:.4; height:55% }
          100% { opacity:0;  height:58% }
        }
        @keyframes seam-spark-bot {
          0%   { opacity:0;  height:0 }
          15%  { opacity:1;  height:42% }
          70%  { opacity:.4; height:55% }
          100% { opacity:0;  height:58% }
        }
        @keyframes door-flash {
          0%  { opacity:0 }
          20% { opacity:.5 }
          100%{ opacity:0 }
        }
        @keyframes energy-burst {
          0%   { opacity:0; transform:translate(-50%,-50%) scale(.35) rotate(-8deg) }
          16%  { opacity:1 }
          62%  { opacity:.82; transform:translate(-50%,-50%) scale(1.18) rotate(4deg) }
          100% { opacity:0; transform:translate(-50%,-50%) scale(1.55) rotate(12deg) }
        }
        @keyframes camera-push {
          0%   { transform:scale(.96) }
          100% { transform:scale(1.075) }
        }
        @keyframes jac-arrive {
          0%   { opacity:0; transform:translateY(240px) scale(.42) rotate(-2.8deg) }
          28%  { opacity:.45; transform:translateY(112px) scale(.63) rotate(-1.6deg) }
          58%  { opacity:1; transform:translateY(18px) scale(.91) rotate(.8deg) }
          78%  { opacity:1; transform:translateY(-11px) scale(1.045) rotate(-.35deg) }
          100% { opacity:1; transform:translateY(0) scale(1) rotate(0) }
        }
        @keyframes jac-door-idle {
          0%,100% { transform:translateY(0) scale(1) rotate(-.2deg) }
          50%     { transform:translateY(-7px) scale(1.008) rotate(.2deg) }
        }
        @keyframes gubee-arrive {
          0%   { opacity:0; transform:translate(168px,190px) scale(.38) rotate(4deg) }
          30%  { opacity:.42; transform:translate(78px,94px) scale(.59) rotate(2deg) }
          60%  { opacity:1; transform:translate(16px,10px) scale(.9) rotate(-.8deg) }
          80%  { opacity:1; transform:translate(-5px,-7px) scale(1.04) rotate(.25deg) }
          100% { opacity:1; transform:translate(0,0) scale(1) rotate(0) }
        }
        @keyframes gubee-door-idle {
          0%,100% { transform:translateY(0) scale(1) }
          50%     { transform:translateY(-5px) scale(1.012) }
        }
        @keyframes dd-arrive {
          0%   { opacity:0; transform:translate(-154px,178px) scale(.4) rotate(-4deg) }
          31%  { opacity:.42; transform:translate(-72px,92px) scale(.6) rotate(-2deg) }
          61%  { opacity:1; transform:translate(-14px,10px) scale(.9) rotate(1deg) }
          80%  { opacity:1; transform:translate(5px,-6px) scale(1.04) rotate(-.3deg) }
          100% { opacity:1; transform:translate(0,0) scale(1) rotate(0) }
        }
        @keyframes dd-door-idle {
          0%,100% { transform:translateY(0) rotate(-1deg) }
          50%     { transform:translateY(-8px) rotate(1deg) }
        }
        @keyframes jac-door-speak {
          0%,100% { transform:translateY(0) scale(1) rotate(-.2deg) }
          18%     { transform:translateY(-5px) scale(1.012) rotate(.3deg) }
          42%     { transform:translateY(-1px) scale(1.006) rotate(-.2deg) }
          68%     { transform:translateY(-6px) scale(1.014) rotate(.2deg) }
        }
        @keyframes jac-door-listen {
          0%,100% { transform:translateY(0) rotate(-.35deg) }
          50%     { transform:translateY(-4px) rotate(.35deg) }
        }
        @keyframes jac-door-think {
          0%,100% { transform:translateY(0) scale(1) }
          50%     { transform:translateY(-5px) scale(1.008) }
        }
        @keyframes jac-idle {
          0%,100%{ transform:translateY(0px)  rotate(-.3deg) scale(1) }
          25%    { transform:translateY(-5px) rotate(.3deg)  scale(1.004) }
          50%    { transform:translateY(0px)  rotate(.5deg)  scale(1) }
          75%    { transform:translateY(4px)  rotate(-.2deg) scale(.998) }
        }
        @keyframes jac-listen {
          0%,100%{ transform:translateY(0px)  rotate(-.8deg) scale(1) }
          33%    { transform:translateY(-3px) rotate(.4deg)  scale(.999) }
          66%    { transform:translateY(-1px) rotate(-1.1deg)scale(1.001) }
        }
        @keyframes jac-think {
          0%,100%{ transform:translateY(0px)  rotate(-1.5deg) scale(1) }
          50%    { transform:translateY(-6px) rotate(1.5deg)  scale(1.005) }
        }
        @keyframes jac-talk {
          0%,100%{ transform:translateY(0px)  scale(1)     rotate(0) }
          10%    { transform:translateY(-6px) scale(1.009) rotate(.4deg) }
          25%    { transform:translateY(-2px) scale(.997)  rotate(-.2deg) }
          40%    { transform:translateY(-7px) scale(1.007) rotate(.3deg) }
          55%    { transform:translateY(-1px) scale(.999)  rotate(0) }
          70%    { transform:translateY(-5px) scale(1.006) rotate(-.3deg) }
          85%    { transform:translateY(-3px) scale(1.003) rotate(.2deg) }
        }
        @keyframes jac-blink {
          0%,88%,100%{ filter:brightness(1) saturate(1) }
          91%        { filter:brightness(.88) saturate(.85) }
          93%        { filter:brightness(1) saturate(1) }
        }
        @keyframes dd-hover {
          0%,100%{ transform:translateY(-8px) scale(1) }
          50%    { transform:translateY(10px)  scale(1.02) }
        }
        @keyframes gubee-breathe {
          0%,100%{ transform:scale(1) translateY(0) }
          50%    { transform:scale(1.04) translateY(-5px) }
        }
        @keyframes jac-glow-pulse {
          0%,100%{ opacity:.45; transform:scale(1) }
          50%    { opacity:.9;  transform:scale(1.1) }
        }
        @keyframes jac-listen-glow {
          0%,100%{ opacity:.35 }
          50%    { opacity:.75 }
        }
        @keyframes jac-think-glow {
          0%,100%{ opacity:.25 }
          50%    { opacity:.6 }
        }
        @keyframes floor-ring {
          0%,100%{ opacity:.35; transform:translateX(-50%) scale(1) }
          50%    { opacity:.65; transform:translateX(-50%) scale(1.06) }
        }
        @keyframes wave-bar {
          0%  { transform:scaleY(0.3) }
          100%{ transform:scaleY(1.0) }
        }
        @keyframes speak-dot {
          0%,100%{ opacity:.3;  transform:translateY(0) }
          50%    { opacity:1;   transform:translateY(-4px) }
        }
        @keyframes welcome-in {
          from{ opacity:0; transform:translateY(-14px) }
          to  { opacity:1; transform:translateY(0) }
        }
        @keyframes conv-in {
          from{ opacity:0; transform:translateY(16px) }
          to  { opacity:1; transform:translateY(0) }
        }
        @keyframes scene-conv-in {
          from{ opacity:0; transform:translate(-50%,16px) }
          to  { opacity:1; transform:translate(-50%,0) }
        }
        @keyframes seam-pulse {
          0%,100%{ opacity:.15 }
          50%    { opacity:.45 }
        }
        @keyframes btn-appear {
          from{ opacity:0; transform:translateY(24px) scale(.93) }
          to  { opacity:1; transform:translateY(0)    scale(1) }
        }
        @keyframes bubble-in {
          from{ opacity:0; transform:translateY(10px) scale(.97) }
          to  { opacity:1; transform:translateY(0)    scale(1) }
        }
         @keyframes transcript-rise {
           from { opacity:0; transform:translate(-50%, 12px) }
           to   { opacity:1; transform:translate(-50%, 0) }
         }
         .gdoor-transcript-scroll {
           scrollbar-width:thin;
           scrollbar-color:rgba(0,220,190,.55) transparent;
         }
         .gdoor-transcript-scroll::-webkit-scrollbar { width:4px; }
         .gdoor-transcript-scroll::-webkit-scrollbar-track { background:transparent; }
         .gdoor-transcript-scroll::-webkit-scrollbar-thumb {
           background:rgba(0,220,190,.55);
           border-radius:999px;
         }
        @keyframes think-pulse {
          0%,100%{ box-shadow:0 0 0 0 rgba(130,80,255,0) }
          50%    { box-shadow:0 0 18px 6px rgba(130,80,255,.4) }
        }
        .gdoor-send:active   { transform:scale(.92) !important }
        .gdoor-mode-btn:active{ transform:scale(.95) !important }
        .gdoor-mute-btn:active{ transform:scale(.9) !important }
        @media (prefers-reduced-motion: reduce) {
           .gdoor-motion,
           .gdoor-transcript { animation:none !important; transition:none !important; }
        }
      `}</style>

      {/* ── Root overlay ──────────────────────────────────────────────────── */}
      <div
        role="region"
        aria-label={isClosed ? "GUBER entry — tap to open" : "Team GUBER HQ"}
        data-testid="guber-door-scene"
        data-phase={phase}
        style={{
          position:"fixed", inset:0, zIndex:9999,
          background:"#000", overflow:"hidden",
          opacity: exiting ? 0 : 1,
          pointerEvents: exiting ? "none" : "auto",
          transition: exiting ? "opacity 440ms ease-in" : "none",
        }}
      >

            {/* The film is a portrait composition. Keeping one fixed-ratio stage
                prevents the single generated set from being stretched or cropped. */}
        <div style={{
          position:"absolute", top:0, bottom:0, left:"50%",
          width:"min(100vw, 56.25vh)",
          transform:"translateX(-50%)",
          overflow:"hidden", background:"#000",
        }}>

        {/* ── ONE COHESIVE GENERATED CINEMATIC ──────────────────────────── */}
        {useLightweightFallback ? (
          <img
            src={DOOR_POSTER}
            alt=""
            draggable={false}
            data-testid="guber-door-cinematic-fallback"
            style={{
              position:"absolute", inset:0, width:"100%", height:"100%",
              objectFit:"cover", display:"block", userSelect:"none",
            }}
          />
        ) : (
          <video
            ref={cinematicRef}
            aria-hidden="true"
            data-testid="guber-door-cinematic"
            data-playing={isOpening ? "true" : "false"}
            poster={DOOR_POSTER}
            preload="metadata"
            playsInline
            muted
            disablePictureInPicture
            onEnded={finishCinematic}
            onError={() => setUseLightweightFallback(true)}
            style={{
              position:"absolute", inset:0, width:"100%", height:"100%",
              objectFit:"cover", display:"block", background:"#000",
            }}
          >
            <source src={DOOR_CINEMATIC} type="video/mp4" />
          </video>
        )}

        {conversationVisible && (
          <div aria-hidden="true" style={{
            position:"absolute", left:0, right:0, top:"82%", bottom:0,
            zIndex:1, pointerEvents:"none",
            background:"linear-gradient(to bottom,rgba(0,0,8,0) 0%,rgba(0,0,8,.94) 38%,#000008 100%)",
          }} />
        )}


        {/* ── TAP TARGET (closed only) ───────────────────────────────────── */}
        {isClosed && (
          <button onClick={handleEnter} aria-label="Enter Team GUBER" style={{
            position:"absolute", inset:0,
            background:"transparent", border:"none",
            cursor:"pointer", zIndex:5,
          }} />
        )}

        </div>

        {/* ═══════════════════════════════════════════════════════════════
            OPEN SCENE OVERLAY
            ═══════════════════════════════════════════════════════════════ */}
        {showGreeting && (
          <>
            <div
              role="status"
              aria-live="polite"
              aria-busy={greetingPlaying}
              data-testid="guber-greeting"
              style={{
                position:"absolute", width:1, height:1, padding:0,
                margin:-1, overflow:"hidden", clip:"rect(0,0,0,0)",
                whiteSpace:"nowrap", border:0,
              }}
            >
              {GREETING_TEXT}
            </div>
            {!inConv && showButtons && (
              <div style={{
                position:"absolute", left:"50%", width:"min(100vw, 56.25vh)",
                transform:"translateX(-50%)",
                bottom:"clamp(32px,4.5vh,44px)",
                padding:"0 9%",
                display:"flex", gap:"clamp(10px,3vw,28px)",
                zIndex:7,
                animation:"btn-appear 400ms cubic-bezier(.34,1.1,.64,1) both",
              }}>
                <button
                  onClick={enterVoice}
                  aria-label="Talk to JAC with voice"
                  className="gdoor-mode-btn"
                  style={{
                    flex:1, minHeight:"clamp(52px,7.5vh,68px)",
                    background:"transparent", border:"1px solid transparent",
                    borderRadius:16, cursor:"pointer",
                    transition:"transform 120ms ease, filter 120ms ease",
                  }}
                />
                <button
                  onClick={enterText}
                  aria-label="Type to JAC instead"
                  className="gdoor-mode-btn"
                  style={{
                    flex:1, minHeight:"clamp(52px,7.5vh,68px)",
                    background:"transparent", border:"1px solid transparent",
                    borderRadius:16, cursor:"pointer",
                    transition:"transform 120ms ease, filter 120ms ease",
                  }}
                />
              </div>
            )}
          </>
        )}

        {/* Once a mode is chosen, this upper scene region becomes the
            conversation itself. The translucent transcript rail keeps every
            line legible while preserving the HQ lighting and characters below. */}
        {conversationVisible && (
          <div
            className="gdoor-transcript"
            data-testid="guber-scene-conversation"
            role="log"
            aria-live="polite"
            style={{
              position:"absolute", top:"clamp(12px,3.5vh,38px)",
              left:"50%", width:"min(100vw,56.25vh)",
              height:"clamp(248px,38svh,430px)",
              transform:"translateX(-50%)",
              zIndex:6, pointerEvents:"auto",
              padding:"clamp(10px,2.2vh,22px) 5% 0",
              boxSizing:"border-box",
              display:"flex", flexDirection:"column",
               overflow:"hidden",
              background:"linear-gradient(180deg,rgba(3,10,26,.94) 0%,rgba(4,13,30,.9) 72%,rgba(4,13,30,.45) 100%)",
              border:"1px solid rgba(0,220,190,.2)",
              borderRadius:20,
              boxShadow:"0 16px 40px rgba(0,0,12,.28), inset 0 1px 0 rgba(255,255,255,.07)",
              backdropFilter:"blur(5px)",
              animation:"transcript-rise 420ms cubic-bezier(.22,1,.36,1) both",
            }}
          >
            <div className="gdoor-transcript-scroll" style={{
              display:"flex", flexDirection:"column", gap:8,
               flex:"1 1 auto",
               minHeight:0,
               width:"100%",
              overflowY:"auto",
               padding:"4px 8px clamp(20px,3vh,28px) 0",
              boxSizing:"border-box",
              overscrollBehavior:"contain",
              WebkitOverflowScrolling:"touch",
               touchAction:"pan-y",
            }}>
              {messages.map((m, i) => (
                <div key={`${m.role}-${i}-${m.text.slice(0, 12)}`} style={{
                  alignSelf:m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth:"min(96%, 420px)",
                  textAlign:m.role === "user" ? "right" : "left",
                  animation:"bubble-in 280ms cubic-bezier(.22,1,.36,1) both",
                  padding:"9px 12px 10px",
                  borderRadius:m.role === "user" ? "16px 16px 5px 16px" : "16px 16px 16px 5px",
                  background:m.role === "user"
                    ? "rgba(49,36,91,.88)"
                    : "rgba(7,67,70,.88)",
                  border:`1px solid ${m.role === "user" ? "rgba(255,189,122,.3)" : "rgba(0,220,190,.28)"}`,
                  boxShadow:"0 5px 16px rgba(0,0,10,.22)",
                  overflowWrap:"anywhere",
                }}>
                  <div style={{
                    color:m.role === "user" ? "#ffc58e" : "#69f1d3",
                    fontSize:"clamp(10px,2.5vw,12px)",
                    fontFamily:"'Oxanium',sans-serif",
                    fontWeight:700,
                    letterSpacing:".13em", textTransform:"uppercase",
                    marginBottom:4,
                  }}>
                    {m.role === "user" ? "You" : "JAC"}
                  </div>
                  <p style={{
                    margin:0, color:"#f7fbff",
                    fontSize:"clamp(15px,3.9vw,18px)",
                    lineHeight:1.48,
                    fontFamily:"'Plus Jakarta Sans',sans-serif",
                    letterSpacing:"-.01em",
                  }}>{m.text}</p>
                </div>
              ))}
              {(textLoading || convaiPhase === "thinking" || convaiPhase === "connecting") && (
                <div style={{
                  alignSelf:"flex-start", color:"rgba(0,220,190,.95)",
                  fontSize:"clamp(14px,3.8vw,18px)",
                  letterSpacing:".18em", padding:"8px 12px",
                  background:"rgba(7,67,70,.64)",
                  border:"1px solid rgba(0,220,190,.2)",
                  borderRadius:"16px 16px 16px 5px",
                }}>
                  <span style={{ animation:"speak-dot .9s ease-in-out infinite" }}>•</span>
                  <span style={{ animation:"speak-dot .9s ease-in-out .2s infinite" }}>•</span>
                  <span style={{ animation:"speak-dot .9s ease-in-out .4s infinite" }}>•</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            IN-CONVERSATION UI
            ═══════════════════════════════════════════════════════════ */}
            {inConv && (
              <div style={{
                position:"absolute", bottom:0, left:0, right:0,
                zIndex:7, display:"flex", flexDirection:"column",
                animation:"conv-in 400ms cubic-bezier(.22,1,.36,1) both",
              }}>

                {/* ── INLINE SIGNUP CARD — in the scene, above the bubbles ── */}
                {showSignup && (
                  <div style={{ position:"relative", zIndex:8, background:"rgba(0,0,15,.74)" }}>
                    <SignupCard
                      returnTo={signupReturnTo}
                      onDismiss={() => setShowSignup(false)}
                      onAuthed={async (accountType) => {
                        // Door scene exits → standard new-user onboarding/dashboard
                        await transferGuestJacSession();
                        const fallback = signupReturnTo || (accountType === "business" ? "/biz/dashboard" : "/dashboard");
                        const destination = await claimAndResolveCampaignPath(fallback);
                        setPhase("exiting");
                        setConvaiActive(false);
                        cancelAllJacAudio();
                        schedule(() => {
                          setMounted(false);
                          window.location.href = destination;
                        }, 440);
                      }}
                    />
                  </div>
                )}


                {/* ── VOICE MODE CONTROLS ─────────────────────────────── */}
                {convMode === "voice" && (
                  <div style={{
                    padding:"10px 14px calc(14px + env(safe-area-inset-bottom,0px))",
                    display:"flex", alignItems:"center", gap:10,
                    background:"rgba(0,0,15,.9)",
                    borderTop:"1px solid rgba(0,180,220,.2)",
                  }}>
                    {/* Status + waveform */}
                    <div style={{
                      flex:1, display:"flex", flexDirection:"column", gap:4,
                    }}>
                      <span style={{
                        fontSize:"clamp(11px,3vw,13px)",
                        color:
                          convaiPhase === "speaking"  ? "rgba(130,100,255,.95)" :
                          convaiPhase === "listening" ? "rgba(0,220,140,.95)" :
                          convaiPhase === "thinking"  ? "rgba(180,140,255,.85)" :
                          "rgba(255,255,255,.5)",
                        fontFamily:"'Inter',sans-serif", letterSpacing:".04em",
                        transition:"color 300ms ease",
                      }}>
                        {statusLabel}
                      </span>
                      <ListenWave active={convaiPhase === "listening"} />
                    </div>

                    {/* MUTE / UNMUTE toggle (replaces push-to-talk) */}
                    {isVoiceLive && <button
                      onClick={() => convaiRef.current?.toggleMute()}
                      aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
                      className="gdoor-mute-btn"
                      style={{
                        width:46, height:46, borderRadius:"50%", flexShrink:0,
                        background: isMuted
                          ? "rgba(255,50,50,.3)"
                          : isVoiceLive
                          ? "rgba(0,200,140,.25)"
                          : "rgba(255,255,255,.1)",
                        border: `1.5px solid ${isMuted ? "rgba(255,80,80,.6)" : isVoiceLive ? "rgba(0,200,140,.45)" : "rgba(255,255,255,.2)"}`,
                        cursor:"pointer",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:20, color:"#fff",
                        transition:"background 200ms ease, border 200ms ease",
                        animation: !isMuted && convaiPhase === "listening"
                          ? "think-pulse 2s ease-in-out infinite" : "none",
                      }}
                    >
                      {isMuted ? "🔇" : "🎙️"}
                    </button>}

                    {convaiPhase === "error" && (
                      <button
                        onClick={retryVoice}
                        aria-label="Retry JAC voice"
                        style={{
                          fontSize:12, color:"rgba(0,220,140,.9)",
                          background:"none", border:"1px solid rgba(0,220,140,.35)",
                          borderRadius:12, padding:"7px 10px", cursor:"pointer",
                          fontFamily:"'Inter',sans-serif", flexShrink:0,
                        }}
                      >Retry voice</button>
                    )}

                    {/* Type Instead remains available while auto-started voice is live. */}
                    <button
                      onClick={() => {
                        clearVoiceDeadline();
                        setConvMode("text");
                        setConvaiActive(false);
                        setTimeout(() => inputRef.current?.focus(), 300);
                      }}
                      aria-label="Switch to typing"
                      style={{
                        fontSize:12, color:"rgba(255,255,255,.45)",
                        background:"none", border:"none", cursor:"pointer",
                        fontFamily:"'Inter',sans-serif", letterSpacing:".04em",
                        flexShrink:0, padding:"4px 0",
                      }}
                     >Type Instead</button>

                    {/* Explore → */}
                    <button onClick={() => exitToApp(true)} aria-label="Go to full app"
                      style={{
                        fontSize:12, color:"rgba(0,200,140,.75)",
                        background:"none", border:"none", cursor:"pointer",
                        fontFamily:"'Inter',sans-serif", flexShrink:0, padding:"4px 0",
                      }}
                    >explore →</button>
                  </div>
                )}


                {/* ── TEXT MODE CONTROLS ──────────────────────────────── */}
                {convMode === "text" && (
                  <div style={{
                    padding:"10px 12px calc(14px + env(safe-area-inset-bottom,0px))",
                    display:"flex", alignItems:"flex-end", gap:8,
                    background:"rgba(0,0,15,.9)",
                    borderTop:"1px solid rgba(0,180,220,.2)",
                  }}>
                    <textarea
                      ref={inputRef}
                      value={inputText}
                      aria-label="Message JAC"
                      onChange={e => setInputText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
                      }}
                      placeholder="Tell JAC what you need…"
                      rows={1}
                      style={{
                        flex:1,
                        background:"rgba(255,255,255,.07)",
                        border:"1px solid rgba(0,180,220,.3)",
                        borderRadius:20, padding:"10px 16px",
                        color:"#fff", fontSize:"clamp(13px,3.8vw,15px)",
                        fontFamily:"'Inter',sans-serif",
                        resize:"none", outline:"none",
                        lineHeight:1.4, maxHeight:100, overflowY:"auto",
                        WebkitOverflowScrolling:"touch",
                      }}
                    />

                    {/* Send */}
                    <button
                      onClick={() => void sendText()}
                      disabled={!inputText.trim() || textLoading}
                      aria-label="Send message"
                      className="gdoor-send"
                      style={{
                        width:44, height:44, borderRadius:"50%", flexShrink:0,
                        background: (inputText.trim() && !textLoading)
                          ? "rgba(0,200,140,.85)" : "rgba(255,255,255,.1)",
                        border:"none",
                        cursor: inputText.trim() ? "pointer" : "default",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:20,
                        transition:"background 200ms ease, transform 120ms ease",
                      }}
                    >↑</button>

                    {voiceRetryAvailable && (
                      <button
                        onClick={retryVoice}
                        aria-label="Retry JAC voice"
                        style={{
                          minHeight:44, flexShrink:0, padding:"0 11px",
                          borderRadius:14, cursor:"pointer",
                          background:"rgba(0,200,140,.14)",
                          border:"1px solid rgba(0,220,140,.42)",
                          color:"rgba(105,241,211,.95)",
                          fontFamily:"'Inter',sans-serif", fontSize:12,
                        }}
                      >
                        Retry voice
                      </button>
                    )}

                    {/* Explore → */}
                    <button onClick={() => exitToApp(false)} aria-label="Go to full app"
                      style={{
                        fontSize:12, color:"rgba(0,200,140,.7)",
                        background:"none", border:"none", cursor:"pointer",
                        fontFamily:"'Inter',sans-serif", alignSelf:"center",
                        flexShrink:0, padding:"4px 0",
                      }}
                    >explore →</button>
                  </div>
                )}

              </div>
            )}
            {/* ── end in-conversation UI ─────────────────────────────── */}
        {/* ── end open-scene UI ─────────────────────────────────────────── */}


        {/* The reference canonical voice path uses one invisible ConvAI owner.
            It stays mounted through the door transition so the Talk gesture can
            synchronously prime mic/audio before the provider opens its stream. */}
        <ConversationProvider>
          <JacConvaiSession
            ref={convaiRef}
            active={convaiActive}
            sessionEndpoint="/api/jac/convai/public-session"
            e2eTarget="homepage"
            onPhaseChange={handleConvaiPhase}
            onUserTranscript={handleConvaiUser}
            onJacResponse={handleConvaiJac}
            onError={handleConvaiError}
          />
        </ConversationProvider>

      </div>
    </>
  );
}
