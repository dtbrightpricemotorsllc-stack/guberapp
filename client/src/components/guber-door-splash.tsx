import { useEffect, useRef, useState, useCallback } from "react";
import { jacSpeak, cancelAllJacAudio, unlockAudioContext } from "@/lib/jac-tts";
import { ConversationProvider } from "@elevenlabs/react";
import {
  JacConvaiSession,
  type JacConvaiSessionHandle,
  type ConvaiPhase,
} from "@/components/jac/jac-convai-session";

// ── Assets ────────────────────────────────────────────────────────────────────
const DOOR_CLOSED = "/splash/door-closed.png";
const HQ_BG       = "/splash/hq-new-bg.jpg";
const CHAR_JAC    = "/splash/char-jac-v2.png";
const CHAR_DD     = "/splash/char-dd-v2.png";
const CHAR_GUBEE  = "/splash/char-gubee-v2.png";
const BTN_TALK    = "/splash/btn-talk.png";
const BTN_TYPE    = "/splash/btn-type.png";

// ── Timing (ms) ───────────────────────────────────────────────────────────────
const SEAM_FLASH_MS  = 340;
const DOORS_START_AT = 280;
const DOORS_END_AT   = 1380;
const WELCOME_AT     = 1420;
const GREETING_AT    = 1700;
const SPEAKING_DUR   = 9000;
const BUTTONS_AT     = 2200;
const DOOR_SLIDE_MS  = DOORS_END_AT - DOORS_START_AT;

const GREETING_TEXT =
  "I'm JAC. What's on your mind? Let's get the vision you see behind your eyes in front of your eyes.";

// ── Types ─────────────────────────────────────────────────────────────────────
type DoorPhase = "closed" | "unlocking" | "opening" | "open" | "exiting";
type ConvMode  = "none" | "voice" | "text";
interface Msg   { role: "jac" | "user"; text: string; }

export interface GuberDoorSplashProps {
  onEnterVoice: () => void;
  onEnterText:  () => void;
  skip?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function GuberDoorSplash({ onEnterVoice, onEnterText, skip }: GuberDoorSplashProps) {
  // Door animation
  const [phase,        setPhase]        = useState<DoorPhase>("closed");
  const [seamFlash,    setSeamFlash]    = useState(false);
  const [showWelcome,  setShowWelcome]  = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);
  const [showButtons,  setShowButtons]  = useState(false);
  const [mounted,      setMounted]      = useState(true);

  // JAC greeting TTS state
  const [greetingPlaying, setGreetingPlaying] = useState(false);

  // Conversation
  const [convMode,      setConvMode]      = useState<ConvMode>("none");
  const [messages,      setMessages]      = useState<Msg[]>([]);
  const [inputText,     setInputText]     = useState("");
  const [textLoading,   setTextLoading]   = useState(false);
  const [jacSpeakingTx, setJacSpeakingTx] = useState(false); // TTS for text-mode responses
  const [convaiPhase,   setConvaiPhase]   = useState<ConvaiPhase>("idle");
  const [convaiActive,  setConvaiActive]  = useState(false);

  const timerRefs      = useRef<ReturnType<typeof setTimeout>[]>([]);
  const convaiRef      = useRef<JacConvaiSessionHandle | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const isSpeakingRef  = useRef(false); // echo suppression

  const schedule = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timerRefs.current.push(t);
    return t;
  }, []);

  useEffect(() => {
    if (skip) setMounted(false);
    return () => { timerRefs.current.forEach(clearTimeout); };
  }, [skip]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Door open sequence ────────────────────────────────────────────────────
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
      setGreetingPlaying(true);
      setMessages([{ role: "jac", text: GREETING_TEXT }]);
      jacSpeak(GREETING_TEXT, { staticSrc: "/jac-audio/homepage-welcome.mp3" })
        .catch(() => {})
        .finally(() => setGreetingPlaying(false));
    }, GREETING_AT);
    schedule(() => setShowButtons(true), BUTTONS_AT);
  }

  // ── Mode selection ────────────────────────────────────────────────────────
  function enterVoice() {
    if (phase !== "open") return;
    cancelAllJacAudio();
    setGreetingPlaying(false);
    setConvMode("voice");
    setConvaiActive(true);
  }

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
        body: JSON.stringify({ messages: history, mode: "homepage" }),
      });
      const data = await res.json();
      const reply = (data.message || data.reply || "").trim();
      if (reply) {
        setMessages(prev => [...prev, { role: "jac", text: reply }]);
        setJacSpeakingTx(true);
        jacSpeak(reply).catch(() => {}).finally(() => setJacSpeakingTx(false));
      }
    } catch {
      setMessages(prev => [...prev, { role: "jac", text: "Give me a second — try sending that again." }]);
    } finally {
      setTextLoading(false);
    }
  }

  // ── ConvAI handlers ───────────────────────────────────────────────────────
  const handleConvaiPhase = useCallback((p: ConvaiPhase) => {
    setConvaiPhase(p);
    isSpeakingRef.current = p === "speaking";
  }, []);

  const handleConvaiUser = useCallback((text: string) => {
    if (isSpeakingRef.current) return;
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
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === "jac" && last.text === t) return prev;
      // Replace initial greeting bubble with ConvAI's first reply
      if (prev.length === 1 && prev[0].role === "jac") return [{ role: "jac", text: t }];
      return [...prev, { role: "jac", text: t }];
    });
  }, []);

  // ── Exit to app ───────────────────────────────────────────────────────────
  function exitToApp(voice: boolean) {
    setPhase("exiting");
    setConvaiActive(false);
    cancelAllJacAudio();
    schedule(() => {
      setMounted(false);
      if (voice) onEnterVoice(); else onEnterText();
    }, 420);
  }

  if (!mounted) return null;

  // ── Derived state ─────────────────────────────────────────────────────────
  const isClosed      = phase === "closed" || phase === "unlocking";
  const isOpening     = phase === "opening";
  const isOpen        = phase === "open" || phase === "exiting";
  const exiting       = phase === "exiting";
  const inConv        = convMode !== "none";

  // JAC animation driving
  const jacIsSpeaking =
    greetingPlaying ||
    (convMode === "voice" && convaiPhase === "speaking") ||
    (convMode === "text"  && jacSpeakingTx);

  const doorTransition = (isOpening || isOpen)
    ? `transform ${DOOR_SLIDE_MS}ms cubic-bezier(0.42, 0, 0.12, 1)`
    : "none";

  const convaiStatusLabel =
    convaiPhase === "connecting" ? "Connecting…" :
    convaiPhase === "speaking"   ? "JAC is speaking" :
    convaiPhase === "listening"  ? "Listening…" :
    convaiPhase === "muted"      ? "Muted" : "";

  return (
    <>
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
          0%,100%{ transform:translateX(-50%) translateY(0px)  rotate(-.3deg) scale(1) }
          25%    { transform:translateX(-50%) translateY(-5px) rotate(.3deg)  scale(1.004) }
          50%    { transform:translateX(-50%) translateY(0px)  rotate(.5deg)  scale(1) }
          75%    { transform:translateX(-50%) translateY(4px)  rotate(-.2deg) scale(.998) }
        }
        @keyframes jac-talk {
          0%,100%{ transform:translateX(-50%) translateY(0px)  scale(1)     rotate(0) }
          10%    { transform:translateX(-50%) translateY(-6px) scale(1.009) rotate(.4deg) }
          25%    { transform:translateX(-50%) translateY(-2px) scale(.997)  rotate(-.2deg) }
          40%    { transform:translateX(-50%) translateY(-7px) scale(1.007) rotate(.3deg) }
          55%    { transform:translateX(-50%) translateY(-1px) scale(.999)  rotate(0) }
          70%    { transform:translateX(-50%) translateY(-5px) scale(1.006) rotate(-.3deg) }
          85%    { transform:translateX(-50%) translateY(-3px) scale(1.003) rotate(.2deg) }
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
          0%,100%{ opacity:.5; transform:translateX(-50%) scale(1) }
          50%    { opacity:.9; transform:translateX(-50%) scale(1.08) }
        }
        @keyframes floor-ring {
          0%,100%{ opacity:.35; transform:translateX(-50%) scale(1) }
          50%    { opacity:.65; transform:translateX(-50%) scale(1.06) }
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
        .gdoor-send:active { transform:scale(.92) !important; filter:brightness(1.2) }
        .gdoor-mode-btn:active { transform:scale(.95) !important }
      `}</style>

      {/* ── Root overlay ─────────────────────────────────────────────────── */}
      <div
        role="region"
        aria-label={isClosed ? "GUBER entry — tap to enter" : "Team GUBER"}
        style={{
          position:"fixed", inset:0, zIndex:9999,
          background:"#000", overflow:"hidden",
          opacity: exiting ? 0 : 1,
          transition: exiting ? "opacity 420ms ease-in" : "none",
        }}
      >

        {/* ── HQ SCENE (behind doors) ───────────────────────────────────── */}
        <div aria-hidden="true" style={{
          position:"absolute", inset:0,
          transform: (isOpening||isOpen) ? "scale(1)" : "scale(0.94)",
          transition: (isOpening||isOpen)
            ? `transform 900ms cubic-bezier(.4,0,.2,1) ${Math.round(DOOR_SLIDE_MS*.55)}ms`
            : "none",
          willChange:"transform",
        }}>
          <img src={HQ_BG} alt="" draggable={false} style={{
            position:"absolute", inset:0,
            width:"100%", height:"100%",
            objectFit:"cover", objectPosition:"center top",
            display:"block", userSelect:"none",
          }} />

          {/* Depth gradient */}
          <div style={{
            position:"absolute", inset:0, pointerEvents:"none",
            background:"linear-gradient(to bottom,rgba(0,0,10,.68) 0%,rgba(0,0,10,.06) 28%,rgba(0,0,10,.04) 55%,rgba(0,0,10,.8) 100%)",
          }} />

          {/* Gubee */}
          <img src={CHAR_GUBEE} alt="" draggable={false} style={{
            position:"absolute", right:"-3%", bottom:"12%",
            height:"clamp(130px,40vh,300px)", width:"auto",
            objectFit:"contain", userSelect:"none",
            mixBlendMode:"screen",
            filter:"brightness(1.12) saturate(1.15) contrast(1.05)",
            animation: isOpen ? "gubee-breathe 3.5s ease-in-out infinite" : "none",
            opacity: (isOpening||isOpen) ? 1 : 0,
            transition:"opacity 600ms ease",
          }} />

          {/* JAC glow ring */}
          {(isOpening||isOpen) && (
            <div aria-hidden="true" style={{
              position:"absolute", left:"50%", bottom:"11%",
              width:"clamp(160px,54vw,350px)", height:"clamp(160px,54vw,350px)",
              borderRadius:"50%", transform:"translateX(-50%)",
              background:"radial-gradient(ellipse,rgba(110,60,255,.3) 0%,rgba(0,160,255,.12) 52%,transparent 78%)",
              animation: jacIsSpeaking ? "jac-glow-pulse 1.3s ease-in-out infinite" : "none",
              opacity: jacIsSpeaking ? 1 : 0,
              transition:"opacity 700ms ease", pointerEvents:"none",
            }} />
          )}

          {/* JAC */}
          <img src={CHAR_JAC} alt="JAC — Team GUBER AI Coordinator" draggable={false} style={{
            position:"absolute", left:"50%",
            bottom: inConv ? "14%" : "13%",
            height:"clamp(200px,57vh,430px)", width:"auto",
            objectFit:"contain", transform:"translateX(-50%)",
            userSelect:"none", willChange:"transform", zIndex:2,
            animation: isOpen
              ? jacIsSpeaking
                ? "jac-talk .62s ease-in-out infinite, jac-blink 4.2s ease-in-out infinite .8s"
                : "jac-idle 4s ease-in-out infinite, jac-blink 5.5s ease-in-out infinite 2s"
              : "none",
            filter: jacIsSpeaking
              ? "drop-shadow(0 0 20px rgba(130,70,255,.8)) drop-shadow(0 0 40px rgba(0,170,255,.45)) drop-shadow(0 8px 24px rgba(0,0,0,.7))"
              : "drop-shadow(0 8px 28px rgba(0,0,0,.7))",
            transition:"filter 700ms ease, bottom 400ms ease",
            opacity: (isOpening||isOpen) ? 1 : 0,
          }} />

          {/* D.D. */}
          <img src={CHAR_DD} alt="" draggable={false} style={{
            position:"absolute", left:"1%", bottom:"16%",
            height:"clamp(80px,24vh,190px)", width:"auto",
            objectFit:"contain", userSelect:"none",
            mixBlendMode:"screen",
            filter:"brightness(1.2) saturate(1.25) contrast(1.08)",
            animation: isOpen ? "dd-hover 2.1s ease-in-out infinite" : "none",
            opacity: (isOpening||isOpen) ? 1 : 0,
            transition:"opacity 600ms ease",
          }} />

          {/* Floor ring */}
          <div aria-hidden="true" style={{
            position:"absolute", left:"50%", bottom:"8%",
            width:"clamp(180px,62vw,390px)", height:34,
            borderRadius:"50%", transform:"translateX(-50%)",
            background:"radial-gradient(ellipse,rgba(80,60,255,.45) 0%,rgba(0,190,255,.2) 55%,transparent 80%)",
            animation: isOpen ? "floor-ring 2.8s ease-in-out infinite" : "none",
            pointerEvents:"none",
            opacity: (isOpening||isOpen) ? 1 : 0,
            transition:"opacity 700ms ease",
          }} />
        </div>
        {/* ── end HQ scene ──────────────────────────────────────────────── */}


        {/* ── DOOR PANELS ───────────────────────────────────────────────── */}
        {/* Left */}
        <div aria-hidden="true" style={{
          position:"absolute", left:0, top:0,
          width:"50%", height:"100%", overflow:"hidden",
          willChange:"transform",
          transform:(isOpening||isOpen)?"translateX(-100%)":"translateX(0)",
          transition:doorTransition,
        }}>
          <img src={DOOR_CLOSED} alt="" draggable={false} style={{
            position:"absolute", left:0, top:0,
            width:"200%", height:"100%",
            objectFit:"cover", objectPosition:"left center",
            display:"block", userSelect:"none",
          }} />
        </div>
        {/* Right */}
        <div aria-hidden="true" style={{
          position:"absolute", right:0, top:0,
          width:"50%", height:"100%", overflow:"hidden",
          willChange:"transform",
          transform:(isOpening||isOpen)?"translateX(100%)":"translateX(0)",
          transition:doorTransition,
        }}>
          <img src={DOOR_CLOSED} alt="" draggable={false} style={{
            position:"absolute", right:0, top:0,
            width:"200%", height:"100%",
            objectFit:"cover", objectPosition:"right center",
            display:"block", userSelect:"none",
          }} />
        </div>


        {/* ── SEAM ──────────────────────────────────────────────────────── */}
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
              background:"transparent",
              boxShadow:"0 0 60px 28px rgba(100,210,255,.9),0 0 120px 48px rgba(60,160,255,.5)",
              animation:`seam-burst ${SEAM_FLASH_MS}ms ease-out forwards`,
              zIndex:11, pointerEvents:"none",
            }} />
          </>
        )}
        {/* White door-open flash */}
        {(isOpening||isOpen) && (
          <div aria-hidden="true" style={{
            position:"absolute", inset:0,
            background:"rgba(180,240,255,.55)",
            animation:"door-flash 500ms ease-out forwards",
            zIndex:4, pointerEvents:"none",
          }} />
        )}


        {/* ── FULL-SCREEN TAP TARGET (closed only) ─────────────────────── */}
        {isClosed && (
          <button onClick={handleEnter} aria-label="Enter Team GUBER" style={{
            position:"absolute", inset:0,
            background:"transparent", border:"none",
            cursor:"pointer", zIndex:5,
          }} />
        )}


        {/* ══════════════════════════════════════════════════════════════
            OPEN SCENE UI
            ══════════════════════════════════════════════════════════════ */}
        {showWelcome && (
          <>
            {/* ── WELCOME HEADER — collapses when conversation starts ── */}
            <div style={{
              position:"absolute", top:0, left:0, right:0,
              paddingTop:"max(16px,env(safe-area-inset-top,16px))",
              paddingBottom: inConv ? 0 : 14,
              display:"flex", flexDirection:"column", alignItems:"center",
              zIndex:6,
              background:"linear-gradient(to bottom,rgba(0,0,10,.86) 0%,rgba(0,0,10,.5) 70%,transparent 100%)",
              animation:"welcome-in 560ms cubic-bezier(.22,1,.36,1) both",
              maxHeight: inConv ? "42px" : "200px",
              overflow:"hidden",
              transition:"max-height 500ms cubic-bezier(.4,0,.2,1), padding 400ms ease",
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
                fontSize: inConv ? "clamp(12px,3vw,16px)" : "clamp(38px,11vw,66px)",
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


            {/* ── PRE-CONVERSATION: JAC greeting + speaking dots + buttons ── */}
            {!inConv && showGreeting && (
              <div style={{
                position:"absolute", bottom:0, left:0, right:0, zIndex:7,
                display:"flex", flexDirection:"column", alignItems:"center",
                animation:"conv-in 480ms cubic-bezier(.22,1,.36,1) both",
              }}>
                {/* Speaking dots */}
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
                  fontSize:"clamp(14px,4.2vw,20px)", letterSpacing:".08em",
                  lineHeight:1.3, color:"#fff",
                  textShadow:"0 0 14px rgba(120,70,255,.55),0 2px 8px rgba(0,0,0,.7)",
                  margin:"0 24px 6px", textAlign:"center", userSelect:"none",
                }}>
                  I'M JAC. TELL ME WHAT YOU'RE TRYING TO GET DONE!
                </p>

                {/* CTA buttons */}
                {showButtons && (
                  <div style={{
                    width:"100%", padding:"0 20px calc(18px + env(safe-area-inset-bottom,0px))",
                    display:"flex", flexDirection:"column", gap:10,
                    background:"linear-gradient(to top,rgba(0,0,10,.94) 0%,rgba(0,0,10,.55) 55%,transparent 100%)",
                    animation:"btn-appear 400ms cubic-bezier(.34,1.1,.64,1) both",
                  }}>
                    <button
                      onClick={enterVoice}
                      aria-label="Talk to JAC with voice"
                      className="gdoor-mode-btn"
                      style={{ background:"none",border:"none",padding:0,cursor:"pointer",
                               display:"block",width:"100%",lineHeight:0,borderRadius:12,
                               overflow:"hidden",transition:"transform 120ms ease,filter 120ms ease" }}
                    >
                      <img src={BTN_TALK} alt="Talk to JAC" draggable={false}
                        style={{ width:"100%",height:"auto",display:"block" }} />
                    </button>
                    <button
                      onClick={enterText}
                      aria-label="Type to JAC instead"
                      className="gdoor-mode-btn"
                      style={{ background:"none",border:"none",padding:0,cursor:"pointer",
                               display:"block",width:"100%",lineHeight:0,borderRadius:12,
                               overflow:"hidden",transition:"transform 120ms ease,filter 120ms ease" }}
                    >
                      <img src={BTN_TYPE} alt="Type instead" draggable={false}
                        style={{ width:"100%",height:"auto",display:"block" }} />
                    </button>
                  </div>
                )}
              </div>
            )}


            {/* ══════════════════════════════════════════════════════════
                IN-CONVERSATION UI (voice or text)
                ══════════════════════════════════════════════════════════ */}
            {inConv && (
              <div style={{
                position:"absolute", bottom:0, left:0, right:0,
                zIndex:7, display:"flex", flexDirection:"column",
                animation:"conv-in 400ms cubic-bezier(.22,1,.36,1) both",
              }}>

                {/* Message bubbles */}
                <div style={{
                  flex:1, overflowY:"auto", padding:"8px 16px",
                  display:"flex", flexDirection:"column", gap:8,
                  maxHeight:"38vh",
                  background:"linear-gradient(to top,rgba(0,0,15,.72) 0%,rgba(0,0,15,.45) 70%,transparent 100%)",
                  WebkitOverflowScrolling:"touch",
                }}>
                  {messages.map((m, i) => (
                    <div key={i} style={{
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      maxWidth:"80%",
                      animation:"bubble-in 280ms cubic-bezier(.22,1,.36,1) both",
                    }}>
                      <div style={{
                        background: m.role === "user"
                          ? "rgba(100,60,255,.55)"
                          : "rgba(0,20,40,.7)",
                        border: m.role === "user"
                          ? "1px solid rgba(130,80,255,.6)"
                          : "1px solid rgba(0,180,220,.35)",
                        borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                        padding:"10px 14px",
                        backdropFilter:"blur(8px)",
                      }}>
                        <p style={{
                          margin:0, fontSize:"clamp(13px,3.8vw,16px)",
                          lineHeight:1.4, color:"#fff",
                          fontFamily:"'Inter',sans-serif",
                          textShadow:"0 1px 4px rgba(0,0,0,.6)",
                        }}>{m.text}</p>
                      </div>
                    </div>
                  ))}

                  {/* Typing indicator */}
                  {(textLoading || convaiPhase === "connecting") && (
                    <div style={{ alignSelf:"flex-start" }}>
                      <div style={{
                        background:"rgba(0,20,40,.7)",
                        border:"1px solid rgba(0,180,220,.35)",
                        borderRadius:"16px 16px 16px 4px",
                        padding:"10px 16px",
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

                {/* ── VOICE MODE controls ─────────────────────────────── */}
                {convMode === "voice" && (
                  <div style={{
                    padding:"10px 16px calc(14px + env(safe-area-inset-bottom,0px))",
                    display:"flex", alignItems:"center", gap:12,
                    background:"rgba(0,0,15,.88)",
                    borderTop:"1px solid rgba(0,180,220,.2)",
                  }}>
                    {/* Status */}
                    <div style={{
                      flex:1, fontSize:"clamp(11px,3vw,13px)",
                      color: convaiPhase === "speaking" ? "rgba(130,100,255,.9)" :
                             convaiPhase === "listening" ? "rgba(0,220,140,.9)" :
                             "rgba(255,255,255,.5)",
                      fontFamily:"'Inter',sans-serif", letterSpacing:".05em",
                    }}>
                      {convaiStatusLabel || "JAC is here"}
                    </div>

                    {/* Mute toggle */}
                    <button
                      onClick={() => convaiRef.current?.toggleMute()}
                      aria-label={convaiPhase === "muted" ? "Unmute" : "Mute mic"}
                      style={{
                        width:44, height:44, borderRadius:"50%",
                        background: convaiPhase === "muted" ? "rgba(255,60,60,.3)" : "rgba(0,180,100,.25)",
                        border: `1px solid ${convaiPhase === "muted" ? "rgba(255,80,80,.5)" : "rgba(0,200,120,.4)"}`,
                        cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:20, color:"#fff", transition:"background 200ms ease,border 200ms ease",
                        flexShrink:0,
                      }}
                    >
                      {convaiPhase === "muted" ? "🔇" : "🎙️"}
                    </button>

                    {/* Switch to type */}
                    <button
                      onClick={() => { setConvMode("text"); setConvaiActive(false); setTimeout(() => inputRef.current?.focus(), 300); }}
                      aria-label="Switch to typing"
                      style={{
                        fontSize:13, color:"rgba(255,255,255,.5)",
                        background:"none", border:"none", cursor:"pointer",
                        fontFamily:"'Inter',sans-serif", letterSpacing:".04em",
                        flexShrink:0,
                      }}
                    >type instead</button>

                    {/* Exit to app */}
                    <button
                      onClick={() => exitToApp(true)}
                      aria-label="Go to full app"
                      style={{
                        fontSize:12, color:"rgba(0,200,140,.7)",
                        background:"none", border:"none", cursor:"pointer",
                        fontFamily:"'Inter',sans-serif",
                        flexShrink:0,
                      }}
                    >explore →</button>
                  </div>
                )}

                {/* ── TEXT MODE input ─────────────────────────────────── */}
                {convMode === "text" && (
                  <div style={{
                    padding:"10px 12px calc(14px + env(safe-area-inset-bottom,0px))",
                    display:"flex", alignItems:"flex-end", gap:8,
                    background:"rgba(0,0,15,.88)",
                    borderTop:"1px solid rgba(0,180,220,.2)",
                  }}>
                    <textarea
                      ref={inputRef}
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }}
                      placeholder="Tell JAC what you need…"
                      rows={1}
                      style={{
                        flex:1, background:"rgba(255,255,255,.07)",
                        border:"1px solid rgba(0,180,220,.3)",
                        borderRadius:20, padding:"10px 16px",
                        color:"#fff", fontSize:"clamp(13px,3.8vw,15px)",
                        fontFamily:"'Inter',sans-serif",
                        resize:"none", outline:"none",
                        lineHeight:1.4, maxHeight:100, overflowY:"auto",
                        WebkitOverflowScrolling:"touch",
                      }}
                    />
                    <button
                      onClick={sendText}
                      disabled={!inputText.trim() || textLoading}
                      aria-label="Send"
                      className="gdoor-send"
                      style={{
                        width:44, height:44, borderRadius:"50%",
                        background: inputText.trim() && !textLoading
                          ? "rgba(0,200,140,.8)" : "rgba(255,255,255,.1)",
                        border:"none", cursor: inputText.trim() ? "pointer" : "default",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:20, flexShrink:0,
                        transition:"background 200ms ease,transform 120ms ease",
                      }}
                    >↑</button>

                    {/* Switch to voice */}
                    <button
                      onClick={() => { cancelAllJacAudio(); setConvMode("voice"); setConvaiActive(true); }}
                      aria-label="Switch to voice"
                      style={{
                        width:44, height:44, borderRadius:"50%",
                        background:"rgba(100,60,255,.25)",
                        border:"1px solid rgba(130,80,255,.4)",
                        cursor:"pointer", display:"flex",
                        alignItems:"center", justifyContent:"center",
                        fontSize:20, flexShrink:0,
                      }}
                    >🎙️</button>

                    {/* Exit to app */}
                    <button
                      onClick={() => exitToApp(false)}
                      aria-label="Go to full app"
                      style={{
                        fontSize:12, color:"rgba(0,200,140,.7)",
                        background:"none", border:"none", cursor:"pointer",
                        fontFamily:"'Inter',sans-serif", alignSelf:"center",
                        flexShrink:0,
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


        {/* ── ConvAI session (voice mode, mounted when active) ─────────── */}
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
