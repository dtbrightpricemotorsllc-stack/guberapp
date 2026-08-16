import { useEffect, useRef, useState, useCallback } from "react";
import { jacSpeak, unlockAudioContext } from "@/lib/jac-tts";

// ── Static assets ────────────────────────────────────────────────────────────
const DOOR_CLOSED  = "/splash/door-closed.png";
const HQ_BG        = "/splash/hq-new-bg.jpg";     // neon corridor reveal
const CHAR_JAC     = "/splash/char-jac-v2.png";   // transparent bg — center host
const CHAR_DD      = "/splash/char-dd-v2.png";    // black bg → screen blend
const CHAR_GUBEE   = "/splash/char-gubee-v2.png"; // black bg → screen blend
const BTN_TALK     = "/splash/btn-talk.png";
const BTN_TYPE     = "/splash/btn-type.png";

// ── Timing (ms from handleEnter) ────────────────────────────────────────────
const SEAM_FLASH_AT  = 100;
const DOORS_START_AT = 300;
const DOORS_END_AT   = 1300;
const WELCOME_AT     = 1350;  // headline appears right as doors finish
const GREETING_AT    = 1650;  // JAC speaks + greeting text
const SPEAKING_DUR   = 9000;  // approx TTS audio duration
const BUTTONS_AT     = 2100;  // CTA buttons fade in
const DOOR_SLIDE_MS  = DOORS_END_AT - DOORS_START_AT;

const GREETING_TEXT =
  "I'm JAC. What's on your mind? Let's get the vision behind your eyes in front of your eyes.";

type Phase = "closed" | "unlocking" | "opening" | "open" | "exiting";

export interface GuberDoorSplashProps {
  onEnterVoice: () => void;
  onEnterText:  () => void;
  skip?: boolean;
}

export function GuberDoorSplash({ onEnterVoice, onEnterText, skip }: GuberDoorSplashProps) {
  const [phase,        setPhase]        = useState<Phase>("closed");
  const [seamFlash,    setSeamFlash]    = useState(false);
  const [showWelcome,  setShowWelcome]  = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);
  const [isSpeaking,   setIsSpeaking]  = useState(false);
  const [showButtons,  setShowButtons]  = useState(false);
  const [mounted,      setMounted]      = useState(true);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timerRefs.current.push(t);
    return t;
  }, []);

  useEffect(() => {
    if (skip) setMounted(false);
    return () => { timerRefs.current.forEach(clearTimeout); };
  }, [skip]);

  function handleEnter() {
    if (phase !== "closed") return;
    unlockAudioContext();
    setPhase("unlocking");

    schedule(() => setSeamFlash(true),  SEAM_FLASH_AT);
    schedule(() => setSeamFlash(false), SEAM_FLASH_AT + 220);
    schedule(() => setPhase("opening"), DOORS_START_AT);
    schedule(() => setShowWelcome(true), WELCOME_AT);
    schedule(() => {
      setPhase("open");
      setShowGreeting(true);
      setIsSpeaking(true);
      jacSpeak(GREETING_TEXT, { staticSrc: "/jac-audio/homepage-welcome.mp3" }).catch(() => {});
    }, GREETING_AT);
    schedule(() => setIsSpeaking(false), GREETING_AT + SPEAKING_DUR);
    schedule(() => setShowButtons(true), BUTTONS_AT);
  }

  function choose(voice: boolean) {
    if (phase !== "open") return;
    unlockAudioContext();
    setPhase("exiting");
    schedule(() => {
      setMounted(false);
      if (voice) onEnterVoice(); else onEnterText();
    }, 420);
  }

  if (!mounted) return null;

  const isOpen      = phase === "open" || phase === "exiting";
  const isOpening   = phase === "opening";
  const isUnlocking = phase === "unlocking";
  const exiting     = phase === "exiting";

  const doorsTransition = (isOpening || isOpen)
    ? `transform ${DOOR_SLIDE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
    : "none";

  const hqRevealTransition = (isOpening || isOpen)
    ? `transform 820ms cubic-bezier(0.4, 0, 0.2, 1) ${Math.round(DOOR_SLIDE_MS * 0.65)}ms`
    : "none";

  return (
    <>
      <style>{`
        /* ── Seam flash ── */
        @keyframes guber-seam-flash {
          0%   { opacity: 0; }
          15%  { opacity: 1; box-shadow: 0 0 32px 14px rgba(0,220,255,0.9); }
          40%  { opacity: 0.7; }
          100% { opacity: 0; }
        }

        /* ── JAC idle (standing by after doors open) ── */
        @keyframes jac-idle {
          0%, 100% { transform: translateX(-50%) translateY(0px)    rotate(-0.4deg) scale(1);     }
          25%       { transform: translateX(-50%) translateY(-4px)   rotate(0.3deg)  scale(1.005); }
          50%       { transform: translateX(-50%) translateY(0px)    rotate(0.5deg)  scale(1);     }
          75%       { transform: translateX(-50%) translateY(3px)    rotate(-0.2deg) scale(0.998); }
        }

        /* ── JAC talking — active head + body micro-motion ── */
        @keyframes jac-talk {
          0%,100% { transform: translateX(-50%) translateY(0px)    scale(1)     rotate(0deg);   }
          7%       { transform: translateX(-50%) translateY(-5px)   scale(1.009) rotate(0.4deg); }
          14%      { transform: translateX(-50%) translateY(-2px)   scale(0.997) rotate(-0.2deg);}
          21%      { transform: translateX(-50%) translateY(-6px)   scale(1.007) rotate(0.3deg); }
          28%      { transform: translateX(-50%) translateY(-1px)   scale(0.999) rotate(0deg);   }
          35%      { transform: translateX(-50%) translateY(-4px)   scale(1.006) rotate(-0.3deg);}
          42%      { transform: translateX(-50%) translateY(-3px)   scale(1.003) rotate(0.2deg); }
          49%      { transform: translateX(-50%) translateY(-5px)   scale(1.005) rotate(-0.1deg);}
          56%      { transform: translateX(-50%) translateY(-2px)   scale(1.001) rotate(0.3deg); }
          63%      { transform: translateX(-50%) translateY(-4px)   scale(1.004) rotate(-0.2deg);}
          70%      { transform: translateX(-50%) translateY(-1px)   scale(0.998) rotate(0.1deg); }
          77%      { transform: translateX(-50%) translateY(-5px)   scale(1.006) rotate(-0.3deg);}
          84%      { transform: translateX(-50%) translateY(-3px)   scale(1.002) rotate(0.2deg); }
          91%      { transform: translateX(-50%) translateY(-4px)   scale(1.004) rotate(-0.1deg);}
        }

        /* ── JAC blink (periodic) ── */
        @keyframes jac-blink {
          0%, 88%, 100% { filter: brightness(1) saturate(1); }
          91%            { filter: brightness(0.88) saturate(0.85); }
          93%            { filter: brightness(1) saturate(1); }
        }

        /* ── D.D. hover float ── */
        @keyframes dd-hover {
          0%, 100% { transform: translateY(-10px) scale(1); }
          50%       { transform: translateY(10px)  scale(1.02); }
        }

        /* ── Gubee breathe ── */
        @keyframes gubee-breathe {
          0%, 100% { transform: scale(1) translateY(0); }
          50%       { transform: scale(1.045) translateY(-5px); }
        }

        /* ── Speak glow pulse around JAC ── */
        @keyframes jac-speak-glow {
          0%, 100% { opacity: 0.55; transform: translateX(-50%) scale(1);    }
          50%       { opacity: 0.9;  transform: translateX(-50%) scale(1.08); }
        }

        /* ── Floor ring pulse ── */
        @keyframes floor-ring {
          0%, 100% { opacity: 0.35; transform: translateX(-50%) scale(1);    }
          50%       { opacity: 0.65; transform: translateX(-50%) scale(1.06); }
        }

        /* ── Speak dots ── */
        @keyframes speak-dot {
          0%, 100% { opacity: 0.3;  transform: translateY(0px);  }
          50%       { opacity: 1;    transform: translateY(-3px); }
        }

        /* ── Entry animations ── */
        @keyframes welcome-in {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes greeting-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes btn-appear {
          from { opacity: 0; transform: translateY(22px) scale(0.94); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes enter-pulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 0.75; }
        }
      `}</style>

      {/* ── Root fixed overlay ───────────────────────────────────────────────── */}
      <div
        role="region"
        aria-label={phase === "closed" ? "GUBER entry — tap to enter" : "Team GUBER"}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "#000",
          overflow: "hidden",
          opacity: exiting ? 0 : 1,
          transition: exiting ? "opacity 420ms ease-in" : "none",
        }}
      >

        {/* ════════════════════════════════════════════════════════════════════
            HQ REVEAL SCENE — sits behind both door panels
            ════════════════════════════════════════════════════════════════════ */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            willChange: "transform",
            transform: (isOpening || isOpen) ? "scale(1)" : "scale(0.93)",
            transition: hqRevealTransition,
          }}
        >
          {/* — Neon corridor background — */}
          <img
            src={HQ_BG}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center top",
              display: "block",
              userSelect: "none",
            }}
          />

          {/* — Depth gradient for legibility — */}
          <div style={{
            position: "absolute",
            inset: 0,
            background: [
              "linear-gradient(to bottom,",
              "  rgba(0,0,10,0.65) 0%,",
              "  rgba(0,0,10,0.1)  30%,",
              "  rgba(0,0,10,0.05) 55%,",
              "  rgba(0,0,10,0.72) 100%)",
            ].join(""),
            pointerEvents: "none",
          }} />

          {/* ── Gubee — right side, neon badger with gold cape ── */}
          <img
            src={CHAR_GUBEE}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              right: "-4%",
              bottom: "13%",
              height: "clamp(140px, 40vh, 310px)",
              width: "auto",
              objectFit: "contain",
              userSelect: "none",
              /* black background knocked out by screen blend on dark corridor */
              mixBlendMode: "screen",
              filter: "brightness(1.12) saturate(1.15) contrast(1.05)",
              willChange: "transform",
              animation: isOpen ? "gubee-breathe 3.4s ease-in-out infinite" : "none",
            }}
          />

          {/* ── JAC speaking glow ring (shows while TTS plays) ── */}
          {(isOpen || isOpening) && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "50%",
                bottom: "12%",
                width: "clamp(180px, 55vw, 360px)",
                height: "clamp(180px, 55vw, 360px)",
                borderRadius: "50%",
                transform: "translateX(-50%)",
                background: "radial-gradient(ellipse, rgba(110,60,255,0.28) 0%, rgba(0,160,255,0.12) 50%, transparent 75%)",
                animation: isSpeaking ? "jac-speak-glow 1.3s ease-in-out infinite" : "none",
                opacity: isSpeaking ? 1 : 0,
                transition: "opacity 600ms ease",
                pointerEvents: "none",
              }}
            />
          )}

          {/* ── JAC — center, main character, transparent background ── */}
          <img
            src={CHAR_JAC}
            alt="JAC — Team GUBER AI Coordinator"
            draggable={false}
            style={{
              position: "absolute",
              left: "50%",
              bottom: "14%",
              height: "clamp(200px, 58vh, 430px)",
              width: "auto",
              objectFit: "contain",
              transform: "translateX(-50%)",
              userSelect: "none",
              willChange: "transform",
              zIndex: 2,
              /* talking vs idle vs static */
              animation: isOpen
                ? isSpeaking
                  ? "jac-talk 0.65s ease-in-out infinite, jac-blink 4.2s ease-in-out infinite 0.8s"
                  : "jac-idle 4s ease-in-out infinite, jac-blink 5.5s ease-in-out infinite 2s"
                : "none",
              /* neon glow when speaking */
              filter: isSpeaking
                ? "drop-shadow(0 0 18px rgba(130,70,255,0.7)) drop-shadow(0 0 36px rgba(0,170,255,0.4)) drop-shadow(0 8px 24px rgba(0,0,0,0.7))"
                : "drop-shadow(0 8px 28px rgba(0,0,0,0.65))",
              transition: "filter 700ms ease",
            }}
          />

          {/* ── D.D. — left side, floating neon robot ── */}
          <img
            src={CHAR_DD}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: "0%",
              bottom: "17%",
              height: "clamp(90px, 28vh, 210px)",
              width: "auto",
              objectFit: "contain",
              userSelect: "none",
              /* black background knocked out by screen blend on dark corridor */
              mixBlendMode: "screen",
              filter: "brightness(1.2) saturate(1.25) contrast(1.08)",
              willChange: "transform",
              animation: isOpen ? "dd-hover 2.1s ease-in-out infinite" : "none",
            }}
          />

          {/* ── Floor holographic ring ── */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              bottom: "10%",
              width: "clamp(180px, 60vw, 380px)",
              height: 32,
              borderRadius: "50%",
              transform: "translateX(-50%)",
              background: "radial-gradient(ellipse, rgba(80,60,255,0.4) 0%, rgba(0,190,255,0.18) 55%, transparent 80%)",
              animation: isOpen ? "floor-ring 2.8s ease-in-out infinite" : "none",
              pointerEvents: "none",
            }}
          />
        </div>
        {/* ═════════════════ end HQ scene ═════════════════════════════════════ */}


        {/* ════════════════════════════════════════════════════════════════════
            WELCOME HEADLINE — fades in after doors open
            ════════════════════════════════════════════════════════════════════ */}
        {showWelcome && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              paddingTop: "max(14px, env(safe-area-inset-top, 14px))",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              zIndex: 5,
              background: "linear-gradient(to bottom, rgba(0,0,12,0.82) 0%, rgba(0,0,12,0.45) 65%, transparent 100%)",
              animation: "welcome-in 550ms cubic-bezier(0.22, 1, 0.36, 1) both",
              paddingBottom: 12,
            }}
          >
            <p style={{
              fontFamily: "'Bebas Neue', 'Inter', sans-serif",
              fontSize: "clamp(10px, 2.8vw, 13px)",
              letterSpacing: "0.38em",
              color: "rgba(255,255,255,0.5)",
              margin: "0 0 2px 0",
              userSelect: "none",
            }}>WELCOME TO</p>

            <p style={{
              fontFamily: "'Bebas Neue', 'Inter', sans-serif",
              fontSize: "clamp(36px, 10.5vw, 64px)",
              fontWeight: 700,
              letterSpacing: "0.16em",
              lineHeight: 1,
              color: "#fff",
              textShadow: [
                "0 0 22px rgba(110,60,255,0.75)",
                "0 0 48px rgba(0,180,255,0.35)",
                "0 2px 0 rgba(0,0,0,0.5)",
              ].join(", "),
              margin: 0,
              userSelect: "none",
            }}>TEAM GUBER</p>

            <p style={{
              fontFamily: "'Bebas Neue', 'Inter', sans-serif",
              fontSize: "clamp(8px, 2.2vw, 11px)",
              letterSpacing: "0.30em",
              color: "rgba(0,230,120,0.85)",
              margin: "7px 0 0 0",
              userSelect: "none",
            }}>YOUR GO-TO FOR WHAT YOU GO THROUGH.</p>
          </div>
        )}


        {/* ════════════════════════════════════════════════════════════════════
            JAC GREETING TEXT — appears as JAC speaks
            ════════════════════════════════════════════════════════════════════ */}
        {showGreeting && (
          <div
            aria-live="polite"
            style={{
              position: "absolute",
              bottom: showButtons
                ? "calc(118px + env(safe-area-inset-bottom, 0px))"
                : "calc(22% + env(safe-area-inset-bottom, 0px))",
              left: 0,
              right: 0,
              zIndex: 6,
              padding: "0 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              animation: "greeting-in 480ms cubic-bezier(0.22, 1, 0.36, 1) both",
              transition: "bottom 300ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            {/* Speaking indicator dots */}
            {isSpeaking && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                marginBottom: 7,
              }}>
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "rgba(0,230,120,0.95)",
                      animation: `speak-dot 0.85s ease-in-out infinite ${i * 0.22}s`,
                    }}
                  />
                ))}
              </div>
            )}

            <p style={{
              fontFamily: "'Bebas Neue', 'Inter', sans-serif",
              fontSize: "clamp(15px, 4.5vw, 20px)",
              letterSpacing: "0.09em",
              lineHeight: 1.25,
              color: "#fff",
              textShadow: "0 0 14px rgba(120,70,255,0.55), 0 2px 8px rgba(0,0,0,0.7)",
              margin: 0,
              textAlign: "center",
              userSelect: "none",
            }}>
              I'M JAC. WHAT'S ON YOUR MIND?
            </p>

            <p style={{
              fontFamily: "'Bebas Neue', 'Inter', sans-serif",
              fontSize: "clamp(10px, 2.8vw, 13px)",
              letterSpacing: "0.06em",
              color: "rgba(255,255,255,0.55)",
              margin: "5px 0 0 0",
              textAlign: "center",
              userSelect: "none",
              lineHeight: 1.4,
            }}>
              LET'S GET THE VISION BEHIND YOUR EYES IN FRONT OF YOUR EYES.
            </p>
          </div>
        )}


        {/* ════════════════════════════════════════════════════════════════════
            DOOR PANELS — slide left/right on open
            ════════════════════════════════════════════════════════════════════ */}

        {/* Left panel */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0, top: 0,
            width: "50%", height: "100%",
            overflow: "hidden",
            willChange: "transform",
            transform: (isOpening || isOpen) ? "translateX(-100%)" : "translateX(0)",
            transition: doorsTransition,
          }}
        >
          <img
            src={DOOR_CLOSED}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: 0, top: 0,
              width: "200%", height: "100%",
              objectFit: "cover",
              objectPosition: "left center",
              display: "block",
              userSelect: "none",
            }}
          />
        </div>

        {/* Right panel */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 0, top: 0,
            width: "50%", height: "100%",
            overflow: "hidden",
            willChange: "transform",
            transform: (isOpening || isOpen) ? "translateX(100%)" : "translateX(0)",
            transition: doorsTransition,
          }}
        >
          <img
            src={DOOR_CLOSED}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              right: 0, top: 0,
              width: "200%", height: "100%",
              objectFit: "cover",
              objectPosition: "right center",
              display: "block",
              userSelect: "none",
            }}
          />
        </div>


        {/* ════════════════════════════════════════════════════════════════════
            CENTER SEAM LINE
            ════════════════════════════════════════════════════════════════════ */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%", top: 0, bottom: 0,
            width: 2,
            transform: "translateX(-50%)",
            background: "rgba(0,185,255,0.28)",
            opacity: (isOpening || isOpen) ? 0 : 1,
            transition: (isOpening || isOpen) ? "opacity 180ms" : "none",
            animation: seamFlash ? "guber-seam-flash 220ms ease-out forwards" : "none",
          }}
        />


        {/* ════════════════════════════════════════════════════════════════════
            CLOSED-DOOR OVERLAY — ENTER only (no TEAM GUBER text)
            ════════════════════════════════════════════════════════════════════ */}
        {!isOpening && !isOpen && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <p style={{
              fontFamily: "'Bebas Neue', 'Inter', sans-serif",
              fontSize: "clamp(11px, 3vw, 14px)",
              letterSpacing: "0.50em",
              color: "rgba(255,255,255,0.42)",
              margin: 0,
              userSelect: "none",
              animation: "enter-pulse 2.4s ease-in-out infinite 0.6s",
            }}>ENTER</p>
          </div>
        )}


        {/* ════════════════════════════════════════════════════════════════════
            TAP TARGET — transparent button covers full screen while closed
            ════════════════════════════════════════════════════════════════════ */}
        {(phase === "closed" || isUnlocking) && (
          <button
            onClick={handleEnter}
            aria-label="Enter Team GUBER"
            style={{
              position: "absolute",
              inset: 0,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              zIndex: 2,
            }}
          />
        )}


        {/* ════════════════════════════════════════════════════════════════════
            CTA BUTTONS — branded PNG images as real interactive elements
            ════════════════════════════════════════════════════════════════════ */}
        {showButtons && (
          <div
            style={{
              position: "absolute",
              bottom: 0, left: 0, right: 0,
              zIndex: 10,
              padding: "0 20px calc(16px + env(safe-area-inset-bottom, 0px))",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              background: "linear-gradient(to top, rgba(0,0,10,0.92) 0%, rgba(0,0,10,0.55) 55%, transparent 100%)",
              animation: "btn-appear 400ms cubic-bezier(0.34, 1.1, 0.64, 1) both",
            }}
          >
            {/* TALK TO JAC */}
            <button
              onClick={() => choose(true)}
              aria-label="Talk to JAC with voice"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                display: "block",
                width: "100%",
                lineHeight: 0,
                borderRadius: 12,
                overflow: "hidden",
                transition: "transform 120ms ease, filter 120ms ease",
              }}
              onPointerDown={e => {
                e.currentTarget.style.transform = "scale(0.96)";
                e.currentTarget.style.filter = "brightness(1.12)";
              }}
              onPointerUp={e => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.filter = "brightness(1)";
              }}
              onPointerLeave={e => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.filter = "brightness(1)";
              }}
            >
              <img
                src={BTN_TALK}
                alt="Talk to JAC"
                draggable={false}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            </button>

            {/* TYPE INSTEAD */}
            <button
              onClick={() => choose(false)}
              aria-label="Type to JAC instead"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                display: "block",
                width: "100%",
                lineHeight: 0,
                borderRadius: 12,
                overflow: "hidden",
                transition: "transform 120ms ease, filter 120ms ease",
              }}
              onPointerDown={e => {
                e.currentTarget.style.transform = "scale(0.96)";
                e.currentTarget.style.filter = "brightness(1.12)";
              }}
              onPointerUp={e => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.filter = "brightness(1)";
              }}
              onPointerLeave={e => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.filter = "brightness(1)";
              }}
            >
              <img
                src={BTN_TYPE}
                alt="Type instead"
                draggable={false}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            </button>
          </div>
        )}

      </div>
    </>
  );
}
