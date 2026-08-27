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
import { ConversationProvider } from "@elevenlabs/react";
import {
  JacConvaiSession,
  type JacConvaiSessionHandle,
  type ConvaiPhase,
} from "@/components/jac/jac-convai-session";
import { JacAnimatedCharacter, type JacState } from "@/components/jac/jac-animated-character";
import { SignupCard } from "@/components/jac/jac-signup-card";
import { getGuestSessionId } from "@/hooks/use-guest-jac-session";
import { saveServiceOfferPrefill } from "@/lib/jac-listing-prefill";

// ── Greeting guard: fires at most once per browser tab session ────────────────
let _greetingHasFired = false;

// ── Assets ───────────────────────────────────────────────────────────────────
const DOOR_CLOSED = "/splash/door-closed.png";
const HQ_BG       = "/splash/hq-new-bg.jpg";
const CHAR_DD     = "/splash/char-dd-v2.png";
const CHAR_GUBEE  = "/splash/char-gubee-v2.png";
const BTN_TALK    = "/splash/btn-talk.png";
const BTN_TYPE    = "/splash/btn-type.png";

// ── Timing (ms) ──────────────────────────────────────────────────────────────
const SEAM_FLASH_MS  = 340;
const DOORS_START_AT = 280;
const DOORS_END_AT   = 1380;
const WELCOME_AT     = 1420;
const GREETING_AT    = 1700;
const BUTTONS_AT     = 2200;
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
  const [showWelcome,  setShowWelcome]  = useState(false);
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
  const [convaiPhase,  setConvaiPhase]  = useState<ConvaiPhase>("idle");
  const [convaiActive, setConvaiActive] = useState(false);
  const [showSignup,   setShowSignup]   = useState(false);
  const [signupReturnTo, setSignupReturnTo] = useState<string | undefined>();

  // JAC character dimensions (responsive to viewport)
  const [jacHeightPx, setJacHeightPx]  = useState(380);

  const timerRefs      = useRef<ReturnType<typeof setTimeout>[]>([]);
  const convaiRef      = useRef<JacConvaiSessionHandle | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const echoGuard      = useRef(false); // suppress convai echo during greeting
  const signupOffered  = useRef(false); // in-scene signup card fires at most once per conversation

  const schedule = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timerRefs.current.push(t);
    return t;
  }, []);

  // Responsive JAC height
  useEffect(() => {
    function measure() {
      const vh = window.innerHeight;
      setJacHeightPx(Math.max(200, Math.min(430, Math.round(vh * 0.56))));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (skip) setMounted(false);
    return () => { timerRefs.current.forEach(clearTimeout); };
  }, [skip]);

  // Auto-scroll message list
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Derive JAC animation state ─────────────────────────────────────────────
  const jacState: JacState = (() => {
    if (greetingPlaying)                             return "speaking";
    if (convMode === "none")                         return "idle";
    if (convMode === "text") {
      if (textLoading)   return "thinking";
      if (jacSpeakingTx) return "speaking";
      return "idle";
    }
    // voice mode
    switch (convaiPhase) {
      case "speaking":   return "speaking";
      case "thinking":   return "thinking";
      case "listening":  return "listening";
      case "connecting": return "thinking";
      default:           return "idle";
    }
  })();

  // ── Door open sequence ───────────────────────────────────────────────────
  function handleEnter() {
    if (phase !== "closed") return;
    unlockAudioContext();
    setPhase("unlocking");

    schedule(() => setSeamFlash(true),  80);
    schedule(() => setSeamFlash(false), 80 + SEAM_FLASH_MS);
    schedule(() => setPhase("opening"), DOORS_START_AT);
    schedule(() => setShowWelcome(true), WELCOME_AT);
    schedule(() => {
      setPhase("open");
      setShowGreeting(true);

      // First message bubble (always shown)
      setMessages([{ role: "jac", text: GREETING_TEXT }]);

      // Play greeting TTS exactly once
      if (!_greetingHasFired) {
        _greetingHasFired = true;
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
    echoGuard.current = true; // first convai utterance = JAC greeting replay guard
    setConvMode("voice");
    setConvaiActive(true);
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
  async function sendText() {
    const text = inputText.trim();
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
        body: JSON.stringify({ messages: history, mode: "homepage", surface: "door", guest_session_id: getGuestSessionId() }),
      });
      const data = await res.json();
      if (data.guestDraft?.type === "service_offer") {
        saveServiceOfferPrefill(data.guestDraft.data || {});
        setSignupReturnTo("/offer-service");
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
        setShowSignup(true);
      }
      const reply = (data.message || data.reply || "").trim();
      if (reply) {
        setMessages(prev => [...prev, { role: "jac", text: reply }]);
        setJacSpeakingTx(true);
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

  // ── ConvAI callbacks ──────────────────────────────────────────────────────
  const handleConvaiPhase = useCallback((p: ConvaiPhase) => {
    setConvaiPhase(p);
  }, []);

  const handleConvaiUser = useCallback((text: string) => {
    const t = text.trim();
    if (!t || /^[.\s!?,]*$/.test(t)) return;
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === "user" && last.text === t) return prev;
      return [...prev, { role: "user", text: t }];
    });
  }, []);

  const handleConvaiJac = useCallback((text: string) => {
    const t = text.replace(/\[.*?\]/g, "").trim();
    if (!t) return;

    // Suppress first ConvAI utterance if it echoes the spoken greeting
    if (echoGuard.current) {
      echoGuard.current = false;
      // Only suppress if it looks like the greeting (similarity > 60%)
      const greetNorm = GREETING_TEXT.toLowerCase().slice(0, 30);
      if (t.toLowerCase().includes(greetNorm.slice(0, 15))) return;
    }

    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === "jac" && last.text === t) return prev;
      return [...prev, { role: "jac", text: t }];
    });
  }, []);

  // ── Exit scene → main app ─────────────────────────────────────────────────
  function exitToApp(voice: boolean) {
    setPhase("exiting");
    setConvaiActive(false);
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

  const doorTx = (isOpening || isOpen)
    ? `transform ${DOOR_SLIDE_MS}ms cubic-bezier(0.42,0,0.12,1)`
    : "none";

  const isMuted       = convaiPhase === "muted";
  const isVoiceLive   = convMode === "voice" && convaiPhase !== "idle" && convaiPhase !== "connecting";
  const statusLabel   =
    convaiPhase === "connecting" ? "Connecting…" :
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
      `}</style>

      {/* ── Root overlay ──────────────────────────────────────────────────── */}
      <div
        role="region"
        aria-label={isClosed ? "GUBER entry — tap to open" : "Team GUBER HQ"}
        style={{
          position:"fixed", inset:0, zIndex:9999,
          background:"#000", overflow:"hidden",
          opacity: exiting ? 0 : 1,
          transition: exiting ? "opacity 440ms ease-in" : "none",
        }}
      >

        {/* ── HQ SCENE ──────────────────────────────────────────────────── */}
        <div aria-hidden="true" style={{
          position:"absolute", inset:0,
          transform:(isOpening||isOpen) ? "scale(1)" : "scale(0.94)",
          transition:(isOpening||isOpen)
            ? `transform 900ms cubic-bezier(.4,0,.2,1) ${Math.round(DOOR_SLIDE_MS*.55)}ms`
            : "none",
          willChange:"transform",
        }}>
          {/* Background */}
          <img src={HQ_BG} alt="" draggable={false} style={{
            position:"absolute", inset:0,
            width:"100%", height:"100%",
            objectFit:"cover", objectPosition:"center top",
            display:"block", userSelect:"none",
          }} />
          <div style={{
            position:"absolute", inset:0, pointerEvents:"none",
            background:"linear-gradient(to bottom,rgba(0,0,10,.7) 0%,rgba(0,0,10,.06) 28%,rgba(0,0,10,.04) 55%,rgba(0,0,10,.82) 100%)",
          }} />

          {/* Gubee */}
          <img src={CHAR_GUBEE} alt="" draggable={false} style={{
            position:"absolute", right:"-3%", bottom:"11%",
            height:"clamp(120px,38vh,290px)", width:"auto",
            objectFit:"contain", userSelect:"none",
            mixBlendMode:"screen",
            filter:"brightness(1.12) saturate(1.15) contrast(1.05)",
            animation: isOpen ? "gubee-breathe 3.5s ease-in-out infinite" : "none",
            opacity:(isOpening||isOpen) ? 1 : 0,
            transition:"opacity 600ms ease",
          }} />

          {/* JAC glow — color/animation changes by state */}
          {(isOpening||isOpen) && (
            <div aria-hidden="true" style={{
              position:"absolute", left:"50%", bottom: inConv ? "13%" : "11%",
              width:"clamp(150px,52vw,340px)", height:"clamp(150px,52vw,340px)",
              borderRadius:"50%", transform:"translateX(-50%)",
              background:
                jacState === "speaking"  ? "radial-gradient(ellipse,rgba(110,60,255,.35) 0%,rgba(0,160,255,.15) 52%,transparent 78%)" :
                jacState === "listening" ? "radial-gradient(ellipse,rgba(0,200,180,.30) 0%,rgba(0,150,220,.12) 52%,transparent 78%)" :
                jacState === "thinking"  ? "radial-gradient(ellipse,rgba(100,50,220,.28) 0%,rgba(80,40,180,.10) 52%,transparent 78%)" :
                                          "radial-gradient(ellipse,rgba(60,40,180,.18) 0%,rgba(0,100,200,.07) 52%,transparent 78%)",
              animation:
                jacState === "speaking"  ? "jac-glow-pulse 1.3s ease-in-out infinite" :
                jacState === "listening" ? "jac-listen-glow 2.0s ease-in-out infinite" :
                jacState === "thinking"  ? "jac-think-glow 1.8s ease-in-out infinite" :
                "none",
              pointerEvents:"none",
              transition:"background 600ms ease",
            }} />
          )}

          {/* ── JAC (animated character) ─────────────────────────────── */}
          <div style={{
            position:"absolute", left:"50%",
            bottom: inConv ? "14%" : "12%",
            transform:"translateX(-50%)",
            zIndex:2,
            opacity:(isOpening||isOpen) ? 1 : 0,
            transition:"opacity 700ms ease, bottom 400ms ease",
            willChange:"transform",
          }}>
            <JacAnimatedCharacter
              state={jacState}
              heightPx={jacHeightPx}
            />
          </div>

          {/* D.D. */}
          <img src={CHAR_DD} alt="" draggable={false} style={{
            position:"absolute", left:"1%", bottom:"15%",
            height:"clamp(75px,22vh,180px)", width:"auto",
            objectFit:"contain", userSelect:"none",
            mixBlendMode:"screen",
            filter:"brightness(1.2) saturate(1.25) contrast(1.08)",
            animation: isOpen ? "dd-hover 2.1s ease-in-out infinite" : "none",
            opacity:(isOpening||isOpen) ? 1 : 0,
            transition:"opacity 600ms ease",
          }} />

          {/* Floor ring */}
          <div aria-hidden="true" style={{
            position:"absolute", left:"50%", bottom:"7%",
            width:"clamp(170px,60vw,380px)", height:32,
            borderRadius:"50%", transform:"translateX(-50%)",
            background:"radial-gradient(ellipse,rgba(80,60,255,.45) 0%,rgba(0,190,255,.2) 55%,transparent 80%)",
            animation: isOpen ? "floor-ring 2.8s ease-in-out infinite" : "none",
            pointerEvents:"none",
            opacity:(isOpening||isOpen) ? 1 : 0,
            transition:"opacity 700ms ease",
          }} />
        </div>
        {/* ── end HQ scene ──────────────────────────────────────────────── */}


        {/* ── DOOR PANELS ───────────────────────────────────────────────── */}
        <div aria-hidden="true" style={{
          position:"absolute", left:0, top:0,
          width:"50%", height:"100%", overflow:"hidden",
          willChange:"transform",
          transform:(isOpening||isOpen)?"translateX(-100%)":"translateX(0)",
          transition:doorTx,
        }}>
          <img src={DOOR_CLOSED} alt="" draggable={false} style={{
            position:"absolute", left:0, top:0,
            width:"200%", height:"100%",
            objectFit:"cover", objectPosition:"left center",
            display:"block", userSelect:"none",
          }} />
        </div>
        <div aria-hidden="true" style={{
          position:"absolute", right:0, top:0,
          width:"50%", height:"100%", overflow:"hidden",
          willChange:"transform",
          transform:(isOpening||isOpen)?"translateX(100%)":"translateX(0)",
          transition:doorTx,
        }}>
          <img src={DOOR_CLOSED} alt="" draggable={false} style={{
            position:"absolute", right:0, top:0,
            width:"200%", height:"100%",
            objectFit:"cover", objectPosition:"right center",
            display:"block", userSelect:"none",
          }} />
        </div>


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


        {/* ── TAP TARGET (closed only) ───────────────────────────────────── */}
        {isClosed && (
          <button onClick={handleEnter} aria-label="Enter Team GUBER" style={{
            position:"absolute", inset:0,
            background:"transparent", border:"none",
            cursor:"pointer", zIndex:5,
          }} />
        )}


        {/* ═══════════════════════════════════════════════════════════════
            OPEN SCENE OVERLAY
            ═══════════════════════════════════════════════════════════════ */}
        {showWelcome && (
          <>
            {/* ── WELCOME HEADER (collapses when conversation starts) ─── */}
            <div style={{
              position:"absolute", top:0, left:0, right:0,
              paddingTop:"max(16px,env(safe-area-inset-top,16px))",
              display:"flex", flexDirection:"column", alignItems:"center",
              zIndex:6,
              background:"linear-gradient(to bottom,rgba(0,0,10,.88) 0%,rgba(0,0,10,.5) 72%,transparent 100%)",
              animation:"welcome-in 560ms cubic-bezier(.22,1,.36,1) both",
              maxHeight: inConv ? "48px" : "220px",
              overflow:"hidden",
              transition:"max-height 500ms cubic-bezier(.4,0,.2,1)",
            }}>
              {!inConv && (
                <p style={{
                  fontFamily:"'Bebas Neue','Inter',sans-serif",
                  fontSize:"clamp(10px,2.8vw,13px)", letterSpacing:".38em",
                  color:"rgba(255,255,255,.5)", margin:"0 0 2px 0", userSelect:"none",
                }}>WELCOME TO</p>
              )}
              <p style={{
                fontFamily:"'Bebas Neue','Inter',sans-serif",
                fontSize: inConv ? "clamp(12px,3.2vw,17px)" : "clamp(36px,11vw,66px)",
                fontWeight:700, letterSpacing:".16em", lineHeight:1,
                color:"#fff",
                textShadow:"0 0 22px rgba(110,60,255,.75),0 0 50px rgba(0,180,255,.35),0 2px 0 rgba(0,0,0,.5)",
                margin:0, userSelect:"none",
                transition:"font-size 400ms ease",
              }}>TEAM GUBER</p>
              {!inConv && (
                <p style={{
                  fontFamily:"'Bebas Neue','Inter',sans-serif",
                  fontSize:"clamp(8px,2.2vw,11px)", letterSpacing:".30em",
                  color:"rgba(0,230,120,.9)", margin:"7px 0 0 0", userSelect:"none",
                }}>YOUR GO-TO FOR WHAT YOU GO THROUGH.</p>
              )}
            </div>


            {/* ── PRE-CONVERSATION: greeting + TALK/TYPE buttons ─────── */}
            {!inConv && showGreeting && (
              <div style={{
                position:"absolute", bottom:0, left:0, right:0, zIndex:7,
                display:"flex", flexDirection:"column", alignItems:"center",
                animation:"conv-in 480ms cubic-bezier(.22,1,.36,1) both",
              }}>
                {/* Speaking dots while greeting plays */}
                {greetingPlaying && (
                  <div style={{ display:"flex", gap:5, marginBottom:6 }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{
                        width:5, height:5, borderRadius:"50%",
                        background:"rgba(0,230,120,.95)",
                        animation:`speak-dot .85s ease-in-out infinite ${i*.22}s`,
                      }} />
                    ))}
                  </div>
                )}
                <p style={{
                  fontFamily:"'Bebas Neue','Inter',sans-serif",
                  fontSize:"clamp(14px,4.2vw,20px)", letterSpacing:".06em",
                  lineHeight:1.3, color:"#fff",
                  textShadow:"0 0 14px rgba(120,70,255,.55),0 2px 8px rgba(0,0,0,.7)",
                  margin:"0 24px 6px", textAlign:"center", userSelect:"none",
                }}>
                  I'M JAC. TELL ME WHAT YOU'RE TRYING TO GET DONE!
                </p>

                {showButtons && (
                  <div style={{
                    width:"100%",
                    padding:"0 20px calc(20px + env(safe-area-inset-bottom,0px))",
                    display:"flex", flexDirection:"column", gap:10,
                    background:"linear-gradient(to top,rgba(0,0,10,.94) 0%,rgba(0,0,10,.55) 55%,transparent 100%)",
                    animation:"btn-appear 400ms cubic-bezier(.34,1.1,.64,1) both",
                  }}>
                    <button
                      onClick={enterVoice}
                      aria-label="Talk to JAC with voice"
                      className="gdoor-mode-btn"
                      style={{
                        background:"none", border:"none", padding:0,
                        cursor:"pointer", display:"block", width:"100%",
                        lineHeight:0, borderRadius:12, overflow:"hidden",
                        transition:"transform 120ms ease, filter 120ms ease",
                      }}
                    >
                      <img src={BTN_TALK} alt="Talk to JAC" draggable={false}
                        style={{ width:"100%", height:"auto", display:"block" }} />
                    </button>
                    <button
                      onClick={enterText}
                      aria-label="Type to JAC instead"
                      className="gdoor-mode-btn"
                      style={{
                        background:"none", border:"none", padding:0,
                        cursor:"pointer", display:"block", width:"100%",
                        lineHeight:0, borderRadius:12, overflow:"hidden",
                        transition:"transform 120ms ease, filter 120ms ease",
                      }}
                    >
                      <img src={BTN_TYPE} alt="Type instead" draggable={false}
                        style={{ width:"100%", height:"auto", display:"block" }} />
                    </button>
                  </div>
                )}
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

                {/* Message bubbles */}
                <div style={{
                  overflowY:"auto", padding:"8px 16px",
                  display:"flex", flexDirection:"column", gap:8,
                  maxHeight:"38vh",
                  background:"linear-gradient(to top,rgba(0,0,15,.74) 0%,rgba(0,0,15,.46) 72%,transparent 100%)",
                  WebkitOverflowScrolling:"touch",
                }}>
                  {messages.map((m, i) => (
                    <div key={i} style={{
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      maxWidth:"82%",
                      animation:"bubble-in 280ms cubic-bezier(.22,1,.36,1) both",
                    }}>
                      <div style={{
                        background: m.role === "user"
                          ? "rgba(100,60,255,.55)"
                          : "rgba(0,20,40,.72)",
                        border: m.role === "user"
                          ? "1px solid rgba(130,80,255,.6)"
                          : "1px solid rgba(0,180,220,.35)",
                        borderRadius: m.role === "user"
                          ? "16px 16px 4px 16px"
                          : "16px 16px 16px 4px",
                        padding:"10px 14px",
                        backdropFilter:"blur(8px)",
                      }}>
                        <p style={{
                          margin:0,
                          fontSize:"clamp(13px,3.8vw,16px)",
                          lineHeight:1.4, color:"#fff",
                          fontFamily:"'Inter',sans-serif",
                          textShadow:"0 1px 4px rgba(0,0,0,.6)",
                        }}>{m.text}</p>
                      </div>
                    </div>
                  ))}

                  {/* Typing / thinking indicator */}
                  {(textLoading || convaiPhase === "thinking" || convaiPhase === "connecting") && (
                    <div style={{ alignSelf:"flex-start" }}>
                      <div style={{
                        background:"rgba(0,20,40,.72)",
                        border:"1px solid rgba(0,180,220,.35)",
                        borderRadius:"16px 16px 16px 4px",
                        padding:"10px 18px",
                        animation: convaiPhase === "thinking" ? "think-pulse 1.4s ease-in-out infinite" : "none",
                      }}>
                        <div style={{ display:"flex", gap:4 }}>
                          {[0,1,2].map(i => (
                            <div key={i} style={{
                              width:6, height:6, borderRadius:"50%",
                              background:"rgba(0,200,160,.8)",
                              animation:`speak-dot .9s ease-in-out infinite ${i*.25}s`,
                            }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* ── INLINE SIGNUP CARD — in the scene, above the bubbles ── */}
                {showSignup && (
                  <div style={{ position:"relative", zIndex:8, background:"rgba(0,0,15,.74)" }}>
                    <SignupCard
                      returnTo={signupReturnTo}
                      onDismiss={() => setShowSignup(false)}
                      onAuthed={(accountType) => {
                        // Door scene exits → standard new-user onboarding/dashboard
                        setPhase("exiting");
                        setConvaiActive(false);
                        cancelAllJacAudio();
                        schedule(() => {
                          setMounted(false);
                          window.location.href = signupReturnTo || (accountType === "business" ? "/biz/dashboard" : "/dashboard");
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
                    <button
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
                    </button>

                    {/* Switch to type */}
                    <button
                      onClick={() => {
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
                      onClick={sendText}
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
                        setConvaiActive(true);
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

          </>
        )}
        {/* ── end open-scene UI ─────────────────────────────────────────── */}


        {/* ── ConvAI session ─────────────────────────────────────────────── */}
        {convMode === "voice" && (
          <ConversationProvider>
            <JacConvaiSession
              ref={convaiRef}
              active={convaiActive}
              sessionEndpoint="/api/jac/convai/session"
              suppressFirstMessage={true}
              onPhaseChange={handleConvaiPhase}
              onUserTranscript={handleConvaiUser}
              onJacResponse={handleConvaiJac}
              onError={() => setConvaiPhase("idle")}
            />
          </ConversationProvider>
        )}

      </div>
    </>
  );
}
