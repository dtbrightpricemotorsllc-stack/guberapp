/**
 * GuberDoorSplash — single entry controller for the GUBER experience.
 *
 * Flow: CLOSED → UNLOCKING → OPENING → OPEN → CONVERSATION (voice|text) → EXIT
 *
 * Spec: GUBER_JAC_INTERACTIVE_VIRTUAL_CHARACTER_PROMPT (see attached_assets)
 *   • JAC has four live states: idle | listening | thinking | speaking
 *   • Voice session is continuous (OpenAI Realtime turn-detection, no push-to-talk)
 *   • Greeting fires EXACTLY ONCE per tab session (module-level guard)
 *   • Conversation stays inside the scene — no navigation
 *   • One visible JAC — live character layer only
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { jacSpeak, cancelAllJacAudio, unlockAudioContext } from "@/lib/jac-tts";
import {
  JacOpenAIRealtimeSession,
  type JacOpenAIRealtimeSessionHandle,
} from "@/components/jac/jac-openai-realtime-session";
import type { JacRealtimePhase } from "@/lib/jac-openai-realtime-transport";
import { SignupCard } from "@/components/jac/jac-signup-card";
import { getGuestSessionId } from "@/hooks/use-guest-jac-session";
import { saveServiceOfferPrefill } from "@/lib/jac-listing-prefill";
import {
  claimAndResolveCampaignPath,
  getActiveCampaignSessionId,
  updateCampaignSession,
  withCampaignSession,
} from "@/lib/campaign-onboarding";

// ── Greeting guard: fires at most once per browser tab session ────────────────
// ── Assets ───────────────────────────────────────────────────────────────────
const DOOR_CLOSED = "/splash/door-closed.png";
const HQ_BG       = "/splash/hq-reveal-bg.png";
const CHAR_JAC    = "/splash/hq-char-jac.png";
const CHAR_GUBEE  = "/splash/hq-char-gubee.png";
const CHAR_DD     = "/splash/hq-char-dd.png";

// ── Timing (ms) ──────────────────────────────────────────────────────────────
const SEAM_FLASH_MS  = 340;
const DOORS_START_AT = 280;
const DOORS_END_AT   = 1500;
const GREETING_AT    = 3200;
const BUTTONS_AT     = 3700;
const DOOR_SLIDE_MS  = DOORS_END_AT - DOORS_START_AT;

const GREETING_TEXT = "Welcome to Team Guber. What brings you here?";

// ── Types ────────────────────────────────────────────────────────────────────
type DoorPhase = "closed" | "unlocking" | "opening" | "open" | "exiting";
type ConvMode  = "none" | "voice" | "text";
interface Msg   { role: "jac" | "user"; text: string }

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
  const [seamFlash,    setSeamFlash]    = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);
  const [showButtons,  setShowButtons]  = useState(false);
  const [mounted,      setMounted]      = useState(true);

  // JAC greeting TTS
  const [greetingPlaying, setGreetingPlaying] = useState(false);

  // Conversation state
  const [convMode,     setConvMode]     = useState<ConvMode>("none");
  const [messages,     setMessages]     = useState<Msg[]>([]);
  const [inputText,    setInputText]    = useState("");
  const [textLoading,  setTextLoading]  = useState(false);
  const [jacSpeakingTx,setJacSpeakingTx] = useState(false); // TTS for text replies
  const [realtimePhase,  setRealtimePhase]  = useState<JacRealtimePhase>("idle");
  const [realtimeActive, setRealtimeActive] = useState(false);
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
  const realtimeRef    = useRef<JacOpenAIRealtimeSessionHandle | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const signupOffered  = useRef(false); // in-scene signup card fires at most once per conversation
  const greetingHasFired = useRef(false);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timerRefs.current.push(t);
    return t;
  }, []);

  useEffect(() => {
    if (skip) setMounted(false);
    return () => { timerRefs.current.forEach(clearTimeout); };
  }, [skip]);

  // Auto-scroll message list
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Door open sequence ───────────────────────────────────────────────────
  function handleEnter() {
    if (phase !== "closed") return;
    unlockAudioContext();
    setPhase("unlocking");

    schedule(() => setSeamFlash(true),  80);
    schedule(() => setSeamFlash(false), 80 + SEAM_FLASH_MS);
    schedule(() => setPhase("opening"), DOORS_START_AT);
    schedule(() => {
      // Do not start the character move until the door panels have fully
      // cleared the frame. This is the visual handoff from the door scene to
      // the room beyond it.
      setPhase("open");
    }, DOORS_END_AT);
    schedule(() => {
      setShowGreeting(true);

      // First message bubble (always shown)
      setMessages([{ role: "jac", text: GREETING_TEXT }]);

      // Play greeting TTS exactly once
      if (!greetingHasFired.current) {
        greetingHasFired.current = true;
        setGreetingPlaying(true);
        jacSpeak(GREETING_TEXT)
          .catch(() => {})
          .finally(() => setGreetingPlaying(false));
      }
    }, GREETING_AT);
    schedule(() => setShowButtons(true), BUTTONS_AT);
  }

  // ── Voice mode entry ──────────────────────────────────────────────────────
  function enterVoice() {
    if (phase !== "open") return;
    cancelAllJacAudio();
    setGreetingPlaying(false);
    setConvMode("voice");
    setRealtimeActive(true);
  }

  // ── Text mode entry ───────────────────────────────────────────────────────
  function enterText() {
    if (phase !== "open") return;
    cancelAllJacAudio();
    setGreetingPlaying(false);
    setConvMode("text");
    setTimeout(() => inputRef.current?.focus(), 300);
  }

  // ── Text conversation ─────────────────────────────────────────────────────
  async function sendText(textOverride?: string) {
    const text = (textOverride ?? inputText).trim();
    if (!text || textLoading) return;
    setInputText("");
    const userMsg: Msg = { role: "user", text };
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
        setMessages(prev => [...prev, { role: "jac", text: reply }]);
        setJacSpeakingTx(true);
        if (convMode === "voice") {
          realtimeRef.current?.speakApprovedText(reply);
          setJacSpeakingTx(false);
        } else {
          jacSpeak(reply).catch(() => {}).finally(() => setJacSpeakingTx(false));
        }
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

  // ── Realtime callbacks ────────────────────────────────────────────────────
  const handleRealtimePhase = useCallback((p: JacRealtimePhase) => {
    setRealtimePhase(p);
  }, []);

  const handleRealtimeUser = useCallback((text: string) => {
    const t = text.trim();
    if (!t || /^[.\s!?,]*$/.test(t)) return;
    // sendText is the single owner of guest actions, drafts, history, and the
    // approved response. Do not add a second transcript message here.
    void sendText(t);
  }, [sendText]);

  const handleRealtimeJac = useCallback((_text: string) => {
    // This is the transcript of audio requested by sendText after its brain
    // response was rendered. Adding it here would duplicate the JAC message.
  }, []);

  // ── Exit scene → main app ─────────────────────────────────────────────────
  function exitToApp(voice: boolean) {
    setPhase("exiting");
    setRealtimeActive(false);
    cancelAllJacAudio();
    schedule(() => {
      setMounted(false);
      if (voice) onEnterVoice(); else onEnterText();
    }, 440);
  }

  if (!mounted) return null;

  const isClosed  = phase === "closed" || phase === "unlocking";
  const isOpening = phase === "opening";
  const isOpen    = phase === "open" || phase === "exiting";
  const exiting   = phase === "exiting";
  const inConv    = convMode !== "none";
  const isJacSpeaking = jacSpeakingTx || realtimePhase === "speaking";
  const jacPerformanceAnimation =
    isJacSpeaking ? "jac-door-speak .72s ease-in-out infinite" :
    realtimePhase === "listening" ? "jac-door-listen 2.4s ease-in-out infinite" :
    realtimePhase === "thinking" ? "jac-door-think 1.7s ease-in-out infinite" :
    "none";

  const doorTx = (isOpening || isOpen)
    ? `transform ${DOOR_SLIDE_MS}ms cubic-bezier(0.42,0,0.12,1)`
    : "none";

  const isMuted       = realtimePhase === "muted";
  const isVoiceLive   = convMode === "voice" && realtimePhase !== "idle" && realtimePhase !== "connecting";
  const statusLabel   =
    realtimePhase === "connecting" ? "Connecting…" :
    realtimePhase === "thinking"   ? "JAC is thinking…" :
    realtimePhase === "speaking"   ? "JAC is speaking" :
    realtimePhase === "listening"  ? "Listening…" :
    realtimePhase === "muted"      ? "Muted — tap 🎙️ to unmute" : "JAC is here";

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
        @keyframes think-pulse {
          0%,100%{ box-shadow:0 0 0 0 rgba(130,80,255,0) }
          50%    { box-shadow:0 0 18px 6px rgba(130,80,255,.4) }
        }
        .gdoor-send:active   { transform:scale(.92) !important }
        .gdoor-mode-btn:active{ transform:scale(.95) !important }
        .gdoor-mute-btn:active{ transform:scale(.9) !important }
        @media (prefers-reduced-motion: reduce) {
          .gdoor-motion { animation:none !important; transition:none !important; }
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
          transition: exiting ? "opacity 440ms ease-in" : "none",
        }}
      >

        {/* The art is a portrait composition. Keeping one fixed-ratio stage
            prevents the centered logo and wordmark from being stretched or
            misaligned when the preview is wider than a phone. */}
        <div style={{
          position:"absolute", top:0, bottom:0, left:"50%",
          width:"min(100vw, 56.25vh)",
          transform:"translateX(-50%)",
          overflow:"hidden", background:"#000",
        }}>

        {/* ── HQ SCENE ──────────────────────────────────────────────────── */}
        <div aria-hidden="true" style={{
          position:"absolute", inset:0,
            transform:isOpen ? "scale(1.075)" : "scale(1)",
            transition:isOpen
              ? "transform 1800ms cubic-bezier(.16,1,.3,1)"
            : "none",
          willChange:"transform",
          }} className="gdoor-motion">
          {/* Background */}
          <img src={HQ_BG} alt="" draggable={false} style={{
            position:"absolute", inset:0,
            width:"100%", height:"100%",
            objectFit:"fill", objectPosition:"center top",
            display:"block", userSelect:"none",
          }} />

          {/* The background supplies the depth silhouettes; these sharp,
              transparent character plates arrive as separate layers so they
              can move forward without ever duplicating the visible artwork. */}
          <div aria-hidden="true" style={{
            position:"absolute", inset:0, pointerEvents:"none",
            opacity:isOpen ? 1 : 0,
            animation:isOpen
              ? "jac-arrive 1500ms cubic-bezier(.16,1,.3,1) both, jac-door-idle 4.4s ease-in-out 1500ms infinite"
              : "none",
            transformOrigin:"50% 82%",
            willChange:"transform, opacity",
          }} className="gdoor-motion">
            <img src={CHAR_JAC} alt="" draggable={false} style={{
              width:"100%", height:"100%", objectFit:"fill", display:"block",
              animation:jacPerformanceAnimation,
              transformOrigin:"50% 82%",
              willChange:"transform",
            }} />
          </div>
          <div aria-hidden="true" style={{
            position:"absolute", inset:0, pointerEvents:"none",
            opacity:isOpen ? 1 : 0,
            animation:isOpen
              ? "gubee-arrive 1650ms cubic-bezier(.16,1,.3,1) both, gubee-door-idle 4.8s ease-in-out 1650ms infinite"
              : "none",
            transformOrigin:"50% 82%",
            willChange:"transform, opacity",
          }} className="gdoor-motion">
            <img src={CHAR_GUBEE} alt="" draggable={false} style={{
              width:"100%", height:"100%", objectFit:"fill", display:"block",
            }} />
          </div>
          <div aria-hidden="true" style={{
            position:"absolute", inset:0, pointerEvents:"none",
            opacity:isOpen ? 1 : 0,
            animation:isOpen
              ? "dd-arrive 1550ms cubic-bezier(.16,1,.3,1) both, dd-door-idle 4.2s ease-in-out 1550ms infinite"
              : "none",
            transformOrigin:"50% 82%",
            willChange:"transform, opacity",
          }} className="gdoor-motion">
            <img src={CHAR_DD} alt="" draggable={false} style={{
              width:"100%", height:"100%", objectFit:"fill", display:"block",
            }} />
          </div>
          {(!showButtons || inConv) && (
            <div aria-hidden="true" style={{
              position:"absolute", left:0, right:0, top:"83%", bottom:"7%",
              zIndex:1, pointerEvents:"none",
              background:"linear-gradient(to bottom,rgba(0,0,8,.38) 0%,rgba(0,0,8,.96) 35%,rgba(0,0,8,.98) 100%)",
            }} />
          )}
        </div>
        {/* ── end HQ scene ──────────────────────────────────────────────── */}


        {/* ── DOOR PANELS ───────────────────────────────────────────────── */}
        <div aria-hidden="true" style={{
          position:"absolute", left:0, top:0,
          width:"50%", height:"100%", overflow:"hidden",
          willChange:"transform",
          transform:(isOpening||isOpen)?"translateX(-100%)":"translateX(0)",
          transition:doorTx,
        }} data-testid="guber-door-panel-left" data-open={isOpening || isOpen ? "true" : "false"}>
          <img src={DOOR_CLOSED} alt="" draggable={false} style={{
            position:"absolute", left:0, top:0,
            width:"200%", height:"100%",
            objectFit:"fill", objectPosition:"left center",
            display:"block", userSelect:"none",
          }} />
        </div>
        <div aria-hidden="true" style={{
          position:"absolute", left:"50%", top:0,
          width:"50%", height:"100%", overflow:"hidden",
          willChange:"transform",
          transform:(isOpening||isOpen)?"translateX(100%)":"translateX(0)",
          transition:doorTx,
        }} data-testid="guber-door-panel-right" data-open={isOpening || isOpen ? "true" : "false"}>
          <img src={DOOR_CLOSED} alt="" draggable={false} style={{
            position:"absolute", left:"-100%", top:0,
            width:"200%", height:"100%",
            objectFit:"fill",
            display:"block", userSelect:"none",
          }} />
        </div>

        {/* A single intact plate owns the closed state. The split panels stay
            underneath it until the opening begins, so the wordmark is always
            pixel-perfect on first paint. */}
        {isClosed && (
          <img
            src={DOOR_CLOSED}
            alt=""
            draggable={false}
            data-testid="guber-door-closed-art"
            style={{
              position:"absolute", inset:0, zIndex:3,
              width:"100%", height:"100%",
              objectFit:"fill", display:"block",
              userSelect:"none", pointerEvents:"none",
            }}
          />
        )}


        {/* ── SEAM (closed only) ────────────────────────────────────────── */}
        {isClosed && !seamFlash && (
          <div aria-hidden="true" style={{
            position:"absolute", left:"50%", top:0, bottom:0, width:2,
            transform:"translateX(-50%)",
            background:"linear-gradient(to bottom,transparent 0%,rgba(0,220,200,.22) 30%,rgba(0,220,200,.35) 50%,rgba(0,220,200,.22) 70%,transparent 100%)",
            animation:"seam-pulse 2.6s ease-in-out infinite",
            pointerEvents:"none", zIndex:4,
          }} />
        )}
        {seamFlash && (
          <>
            <div aria-hidden="true" style={{
              position:"absolute", left:"50%", top:0,
              width:5, transform:"translateX(-50%)",
              background:"linear-gradient(to bottom,rgba(200,240,255,1) 0%,rgba(80,200,255,.9) 60%,transparent 100%)",
              animation:`seam-spark-top ${SEAM_FLASH_MS}ms ease-out forwards`,
              zIndex:10, pointerEvents:"none",
            }} />
            <div aria-hidden="true" style={{
              position:"absolute", left:"50%", bottom:0,
              width:5, transform:"translateX(-50%)",
              background:"linear-gradient(to top,rgba(200,240,255,1) 0%,rgba(80,200,255,.9) 60%,transparent 100%)",
              animation:`seam-spark-bot ${SEAM_FLASH_MS}ms ease-out forwards`,
              zIndex:10, pointerEvents:"none",
            }} />
            <div aria-hidden="true" style={{
              position:"absolute", left:"50%", top:"50%",
              width:6, transform:"translate(-50%,-50%)", height:"100%",
              boxShadow:"0 0 60px 28px rgba(100,210,255,.9),0 0 120px 48px rgba(60,160,255,.5)",
              animation:`seam-burst ${SEAM_FLASH_MS}ms ease-out forwards`,
              zIndex:11, pointerEvents:"none",
            }} />
          </>
        )}
        {/* White flash on door open */}
        {(isOpening||isOpen) && (
          <div aria-hidden="true" style={{
            position:"absolute", inset:0,
            background:"rgba(180,240,255,.55)",
            animation:"door-flash 500ms ease-out forwards",
            zIndex:4, pointerEvents:"none",
          }} />
        )}
        {isOpening && (
          <div aria-hidden="true" style={{
            position:"absolute", left:"50%", top:"48%",
            width:"118%", height:"118%",
            transform:"translate(-50%,-50%)",
            background:"radial-gradient(circle,rgba(225,255,255,.95) 0%,rgba(50,220,255,.55) 9%,rgba(40,170,255,.18) 28%,transparent 58%), conic-gradient(from 0deg,transparent 0deg,rgba(90,230,255,.72) 5deg,transparent 11deg,transparent 31deg,rgba(110,120,255,.6) 37deg,transparent 45deg,transparent 74deg,rgba(60,255,210,.56) 80deg,transparent 88deg,transparent 120deg,rgba(70,200,255,.5) 126deg,transparent 135deg,transparent 180deg,rgba(100,100,255,.5) 187deg,transparent 195deg,transparent 240deg,rgba(40,255,220,.5) 247deg,transparent 255deg,transparent 300deg,rgba(80,200,255,.6) 307deg,transparent 315deg,transparent 360deg)",
            mixBlendMode:"screen",
            animation:"energy-burst 1200ms cubic-bezier(.16,1,.3,1) both",
            pointerEvents:"none", zIndex:12,
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
        {showGreeting && !inConv && (
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
            {showButtons && (
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
            conversation itself. It deliberately has no card chrome: the
            gradient hides the baked welcome copy while preserving the HQ
            lighting and the characters below it. */}
        {inConv && (
          <div
            data-testid="guber-scene-conversation"
            role="log"
            aria-live="polite"
            style={{
              position:"absolute", top:0,
              left:"50%", width:"min(100vw,56.25vh)",
              height:"clamp(270px,33vh,330px)",
              transform:"translateX(-50%)",
              zIndex:6, pointerEvents:"none",
              padding:"0 8%",
              boxSizing:"border-box",
              display:"flex", flexDirection:"column",
              justifyContent:"flex-end",
              background:"linear-gradient(to bottom,#00000e 0%,#00000e 76%,rgba(0,0,14,.82) 90%,rgba(0,0,14,0) 100%)",
              animation:"scene-conv-in 420ms cubic-bezier(.22,1,.36,1) both",
            }}
          >
            <div style={{
              display:"flex", flexDirection:"column", gap:8,
              maxHeight:"clamp(128px,18vh,188px)",
              overflowY:"auto", paddingBottom:"8%",
              maskImage:"linear-gradient(to bottom,transparent 0%,black 18%,black 100%)",
              WebkitMaskImage:"linear-gradient(to bottom,transparent 0%,black 18%,black 100%)",
            }}>
              {messages.slice(-4).map((m, i) => (
                <div key={`${m.role}-${i}-${m.text.slice(0, 12)}`} style={{
                  alignSelf:m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth:"94%",
                  textAlign:m.role === "user" ? "right" : "left",
                  animation:"bubble-in 280ms cubic-bezier(.22,1,.36,1) both",
                }}>
                  <div style={{
                    color:m.role === "user" ? "rgba(130,100,255,.95)" : "rgba(0,220,190,.95)",
                    fontSize:"clamp(9px,2.5vw,11px)",
                    fontFamily:"'Oxanium',sans-serif",
                    letterSpacing:".16em", textTransform:"uppercase",
                    marginBottom:3, textShadow:"0 0 12px rgba(0,200,220,.55)",
                  }}>
                    {m.role === "user" ? "You" : "JAC"}
                  </div>
                  <p style={{
                    margin:0, color:"#fff",
                    fontSize:"clamp(14px,3.8vw,18px)",
                    lineHeight:1.32,
                    fontFamily:"'Inter',sans-serif",
                    textShadow:"0 2px 12px rgba(0,0,0,.9)",
                  }}>{m.text}</p>
                </div>
              ))}
              {(textLoading || realtimePhase === "thinking" || realtimePhase === "connecting") && (
                <div style={{
                  alignSelf:"flex-start", color:"rgba(0,220,190,.95)",
                  fontSize:"clamp(14px,3.8vw,18px)",
                  letterSpacing:".18em", textShadow:"0 0 12px rgba(0,200,220,.55)",
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
                        const fallback = signupReturnTo || (accountType === "business" ? "/biz/dashboard" : "/dashboard");
                        const destination = await claimAndResolveCampaignPath(fallback);
                        setPhase("exiting");
                        setRealtimeActive(false);
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
                          realtimePhase === "speaking"  ? "rgba(130,100,255,.95)" :
                          realtimePhase === "listening" ? "rgba(0,220,140,.95)" :
                          realtimePhase === "thinking"  ? "rgba(180,140,255,.85)" :
                          "rgba(255,255,255,.5)",
                        fontFamily:"'Inter',sans-serif", letterSpacing:".04em",
                        transition:"color 300ms ease",
                      }}>
                        {statusLabel}
                      </span>
                      <ListenWave active={realtimePhase === "listening"} />
                    </div>

                    {/* MUTE / UNMUTE toggle (replaces push-to-talk) */}
                    <button
                      onClick={() => realtimeRef.current?.toggleMute()}
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
                        animation: !isMuted && realtimePhase === "listening"
                          ? "think-pulse 2s ease-in-out infinite" : "none",
                      }}
                    >
                      {isMuted ? "🔇" : "🎙️"}
                    </button>

                    {/* Switch to type */}
                    <button
                      onClick={() => {
                        setConvMode("text");
                        setRealtimeActive(false);
                        setTimeout(() => inputRef.current?.focus(), 300);
                      }}
                      aria-label="Switch to typing"
                      style={{
                        fontSize:12, color:"rgba(255,255,255,.45)",
                        background:"none", border:"none", cursor:"pointer",
                        fontFamily:"'Inter',sans-serif", letterSpacing:".04em",
                        flexShrink:0, padding:"4px 0",
                      }}
                    >⌨️</button>

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

                    {/* Switch to voice */}
                    <button
                      onClick={() => {
                        cancelAllJacAudio();
                        setConvMode("voice");
                        setRealtimeActive(true);
                      }}
                      aria-label="Switch to voice"
                      style={{
                        width:44, height:44, borderRadius:"50%", flexShrink:0,
                        background:"rgba(100,60,255,.25)",
                        border:"1px solid rgba(130,80,255,.4)",
                        cursor:"pointer",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:20,
                      }}
                    >🎙️</button>

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


        {/* ── OpenAI Realtime session ────────────────────────────────────── */}
        {convMode === "voice" && (
          <JacOpenAIRealtimeSession
            ref={realtimeRef}
            active={realtimeActive}
            sessionEndpoint="/api/jac/realtime-token/guest"
            onPhaseChange={handleRealtimePhase}
            onUserTranscript={handleRealtimeUser}
            onJacResponse={handleRealtimeJac}
            onError={() => setRealtimePhase("idle")}
          />
        )}

      </div>
    </>
  );
}
