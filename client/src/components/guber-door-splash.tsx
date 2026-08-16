import { useEffect, useRef, useState, useCallback } from "react";
import { jacSpeak, unlockAudioContext } from "@/lib/jac-tts";

// ── Static assets ─────────────────────────────────────────────────────────────
const DOOR_CLOSED = "/splash/door-closed.png";
const HQ_BG       = "/splash/hq-new-bg.jpg";
const CHAR_JAC    = "/splash/char-jac-v2.png";
const CHAR_DD     = "/splash/char-dd-v2.png";
const CHAR_GUBEE  = "/splash/char-gubee-v2.png";
const BTN_TALK    = "/splash/btn-talk.png";
const BTN_TYPE    = "/splash/btn-type.png";

// ── Timing (ms) ───────────────────────────────────────────────────────────────
const SEAM_FLASH_MS  = 320;   // how long the seam lightning burst lasts
const DOORS_START_AT = 280;
const DOORS_END_AT   = 1380;
const WELCOME_AT     = 1420;
const GREETING_AT    = 1700;
const SPEAKING_DUR   = 9000;
const BUTTONS_AT     = 2200;
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

    // seam flash / lightning crack
    schedule(() => setSeamFlash(true),   80);
    schedule(() => setSeamFlash(false),  80 + SEAM_FLASH_MS);

    schedule(() => setPhase("opening"),  DOORS_START_AT);
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
  const isClosed    = phase === "closed" || phase === "unlocking";
  const exiting     = phase === "exiting";

  const doorTransition = (isOpening || isOpen)
    ? `transform ${DOOR_SLIDE_MS}ms cubic-bezier(0.42, 0, 0.12, 1)`
    : "none";

  return (
    <>
      <style>{`
        /* ── Seam lightning burst ── */
        @keyframes seam-burst {
          0%   { opacity: 0;   width: 3px;  box-shadow: none; }
          8%   { opacity: 1;   width: 6px;  box-shadow: 0 0 24px 12px rgba(120,220,255,1), 0 0 60px 20px rgba(80,160,255,0.8); }
          30%  { opacity: 0.9; width: 4px;  box-shadow: 0 0 18px 8px  rgba(100,200,255,0.9); }
          60%  { opacity: 0.5; width: 2px;  box-shadow: 0 0 10px 4px  rgba(80,180,255,0.6); }
          100% { opacity: 0;   width: 2px;  box-shadow: none; }
        }
        @keyframes seam-spark-top {
          0%   { opacity: 0;   height: 0;  }
          15%  { opacity: 1;   height: 38%; }
          60%  { opacity: 0.4; height: 52%; }
          100% { opacity: 0;   height: 55%; }
        }
        @keyframes seam-spark-bot {
          0%   { opacity: 0;   height: 0;  }
          15%  { opacity: 1;   height: 38%; }
          60%  { opacity: 0.4; height: 52%; }
          100% { opacity: 0;   height: 55%; }
        }

        /* ── Door open white flash ── */
        @keyframes door-flash {
          0%   { opacity: 0; }
          20%  { opacity: 0.55; }
          100% { opacity: 0; }
        }

        /* ── JAC idle sway ── */
        @keyframes jac-idle {
          0%,100% { transform: translateX(-50%) translateY(0px)  rotate(-0.3deg) scale(1);     }
          25%      { transform: translateX(-50%) translateY(-5px) rotate(0.3deg)  scale(1.004); }
          50%      { transform: translateX(-50%) translateY(0px)  rotate(0.5deg)  scale(1);     }
          75%      { transform: translateX(-50%) translateY(4px)  rotate(-0.2deg) scale(0.998); }
        }

        /* ── JAC talking micro-motion ── */
        @keyframes jac-talk {
          0%,100% { transform: translateX(-50%) translateY(0px)  scale(1)     rotate(0deg);   }
          10%      { transform: translateX(-50%) translateY(-6px) scale(1.009) rotate(0.4deg); }
          20%      { transform: translateX(-50%) translateY(-2px) scale(0.997) rotate(-0.2deg);}
          30%      { transform: translateX(-50%) translateY(-7px) scale(1.007) rotate(0.3deg); }
          40%      { transform: translateX(-50%) translateY(-1px) scale(0.999) rotate(0deg);   }
          50%      { transform: translateX(-50%) translateY(-5px) scale(1.006) rotate(-0.3deg);}
          60%      { transform: translateX(-50%) translateY(-3px) scale(1.003) rotate(0.2deg); }
          70%      { transform: translateX(-50%) translateY(-6px) scale(1.005) rotate(-0.1deg);}
          80%      { transform: translateX(-50%) translateY(-2px) scale(1.001) rotate(0.3deg); }
          90%      { transform: translateX(-50%) translateY(-4px) scale(1.004) rotate(-0.2deg);}
        }

        /* ── JAC blink ── */
        @keyframes jac-blink {
          0%,88%,100% { filter: brightness(1) saturate(1); }
          91%          { filter: brightness(0.88) saturate(0.85); }
          93%          { filter: brightness(1) saturate(1); }
        }

        /* ── D.D. hover float ── */
        @keyframes dd-hover {
          0%,100% { transform: translateY(-8px) scale(1); }
          50%      { transform: translateY(10px) scale(1.02); }
        }

        /* ── Gubee breathe ── */
        @keyframes gubee-breathe {
          0%,100% { transform: scale(1) translateY(0); }
          50%      { transform: scale(1.045) translateY(-6px); }
        }

        /* ── JAC speak-glow ring ── */
        @keyframes jac-speak-glow {
          0%,100% { opacity: 0.5; transform: translateX(-50%) scale(1);    }
          50%      { opacity: 0.9; transform: translateX(-50%) scale(1.08); }
        }

        /* ── Floor ring pulse ── */
        @keyframes floor-ring {
          0%,100% { opacity: 0.35; transform: translateX(-50%) scale(1);    }
          50%      { opacity: 0.65; transform: translateX(-50%) scale(1.06); }
        }

        /* ── Speaking dots ── */
        @keyframes speak-dot {
          0%,100% { opacity: 0.3;  transform: translateY(0);    }
          50%      { opacity: 1;   transform: translateY(-4px); }
        }

        /* ── Text reveals ── */
        @keyframes welcome-in {
          from { opacity: 0; transform: translateY(-14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes greeting-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes btn-appear {
          from { opacity: 0; transform: translateY(24px) scale(0.93); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }

        /* ── Seam ambient pulse (hint it's tappable) ── */
        @keyframes seam-pulse {
          0%, 100% { opacity: 0.18; }
          50%       { opacity: 0.55; }
        }

        /* ── Button press ── */
        .guber-enter-btn {
          transition: transform 120ms ease, filter 120ms ease, box-shadow 120ms ease;
        }
        .guber-enter-btn:active {
          transform: scale(0.95) !important;
          filter: brightness(1.18) !important;
        }
      `}</style>

      {/* ── Root overlay ─────────────────────────────────────────────────────── */}
      <div
        role="region"
        aria-label={isClosed ? "GUBER entry — tap to enter" : "Team GUBER"}
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

        {/* ══════════════════════════════════════════════════════════════════════
            HQ SCENE — corridor + characters, sits behind door panels
            ══════════════════════════════════════════════════════════════════════ */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            transform: (isOpening || isOpen) ? "scale(1)" : "scale(0.94)",
            transition: (isOpening || isOpen)
              ? `transform 900ms cubic-bezier(0.4, 0, 0.2, 1) ${Math.round(DOOR_SLIDE_MS * 0.55)}ms`
              : "none",
            willChange: "transform",
          }}
        >
          {/* Corridor background */}
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

          {/* Depth gradient */}
          <div style={{
            position: "absolute",
            inset: 0,
            background: [
              "linear-gradient(to bottom,",
              "  rgba(0,0,10,0.68) 0%,",
              "  rgba(0,0,10,0.08) 28%,",
              "  rgba(0,0,10,0.04) 55%,",
              "  rgba(0,0,10,0.75) 100%)",
            ].join(""),
            pointerEvents: "none",
          }} />

          {/* Gubee — right */}
          <img
            src={CHAR_GUBEE}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              right: "-3%",
              bottom: "12%",
              height: "clamp(145px, 42vh, 320px)",
              width: "auto",
              objectFit: "contain",
              userSelect: "none",
              mixBlendMode: "screen",
              filter: "brightness(1.12) saturate(1.15) contrast(1.05)",
              willChange: "transform",
              animation: isOpen ? "gubee-breathe 3.5s ease-in-out infinite" : "none",
              opacity: (isOpening || isOpen) ? 1 : 0,
              transition: "opacity 500ms ease",
            }}
          />

          {/* JAC speak-glow ring */}
          {(isOpening || isOpen) && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "50%",
                bottom: "11%",
                width: "clamp(180px, 58vw, 370px)",
                height: "clamp(180px, 58vw, 370px)",
                borderRadius: "50%",
                transform: "translateX(-50%)",
                background: "radial-gradient(ellipse, rgba(110,60,255,0.3) 0%, rgba(0,160,255,0.12) 52%, transparent 78%)",
                animation: isSpeaking ? "jac-speak-glow 1.3s ease-in-out infinite" : "none",
                opacity: isSpeaking ? 1 : 0,
                transition: "opacity 700ms ease",
                pointerEvents: "none",
              }}
            />
          )}

          {/* JAC — center */}
          <img
            src={CHAR_JAC}
            alt="JAC — Team GUBER AI Coordinator"
            draggable={false}
            style={{
              position: "absolute",
              left: "50%",
              bottom: "13%",
              height: "clamp(210px, 60vh, 450px)",
              width: "auto",
              objectFit: "contain",
              transform: "translateX(-50%)",
              userSelect: "none",
              willChange: "transform",
              zIndex: 2,
              animation: isOpen
                ? isSpeaking
                  ? "jac-talk 0.62s ease-in-out infinite, jac-blink 4.2s ease-in-out infinite 0.8s"
                  : "jac-idle 4s ease-in-out infinite, jac-blink 5.5s ease-in-out infinite 2s"
                : "none",
              filter: isSpeaking
                ? "drop-shadow(0 0 20px rgba(130,70,255,0.8)) drop-shadow(0 0 40px rgba(0,170,255,0.45)) drop-shadow(0 8px 24px rgba(0,0,0,0.7))"
                : "drop-shadow(0 8px 30px rgba(0,0,0,0.7))",
              transition: "filter 700ms ease",
              opacity: (isOpening || isOpen) ? 1 : 0,
              transitionProperty: "filter, opacity",
            }}
          />

          {/* D.D. — left */}
          <img
            src={CHAR_DD}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: "1%",
              bottom: "16%",
              height: "clamp(88px, 26vh, 200px)",
              width: "auto",
              objectFit: "contain",
              userSelect: "none",
              mixBlendMode: "screen",
              filter: "brightness(1.2) saturate(1.25) contrast(1.08)",
              willChange: "transform",
              animation: isOpen ? "dd-hover 2.1s ease-in-out infinite" : "none",
              opacity: (isOpening || isOpen) ? 1 : 0,
              transition: "opacity 500ms ease",
            }}
          />

          {/* Floor holographic ring */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              bottom: "8%",
              width: "clamp(190px, 64vw, 400px)",
              height: 36,
              borderRadius: "50%",
              transform: "translateX(-50%)",
              background: "radial-gradient(ellipse, rgba(80,60,255,0.45) 0%, rgba(0,190,255,0.2) 55%, transparent 80%)",
              animation: isOpen ? "floor-ring 2.8s ease-in-out infinite" : "none",
              pointerEvents: "none",
              opacity: (isOpening || isOpen) ? 1 : 0,
              transition: "opacity 600ms ease",
            }}
          />
        </div>
        {/* ═════════════════ end HQ scene ═════════════════════════════════════ */}


        {/* ══════════════════════════════════════════════════════════════════════
            DOOR — LEFT panel (shows left half of door-closed.png)
            ══════════════════════════════════════════════════════════════════════ */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0, top: 0,
            width: "50%", height: "100%",
            overflow: "hidden",
            willChange: "transform",
            transform: (isOpening || isOpen) ? "translateX(-100%)" : "translateX(0)",
            transition: doorTransition,
          }}
        >
          <img
            src={DOOR_CLOSED}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: 0, top: 0,
              width: "200%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "left center",
              display: "block",
              userSelect: "none",
            }}
          />
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            DOOR — RIGHT panel (shows right half of door-closed.png)
            ══════════════════════════════════════════════════════════════════════ */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 0, top: 0,
            width: "50%", height: "100%",
            overflow: "hidden",
            willChange: "transform",
            transform: (isOpening || isOpen) ? "translateX(100%)" : "translateX(0)",
            transition: doorTransition,
          }}
        >
          <img
            src={DOOR_CLOSED}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              right: 0, top: 0,
              width: "200%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "right center",
              display: "block",
              userSelect: "none",
            }}
          />
        </div>


        {/* ══════════════════════════════════════════════════════════════════════
            SEAM — center crack / lightning on tap
            ══════════════════════════════════════════════════════════════════════ */}
        {/* Base seam line (always visible on closed door) */}
        {isClosed && !seamFlash && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              top: 0, bottom: 0,
              width: 1,
              transform: "translateX(-50%)",
              background: "linear-gradient(to bottom, transparent 0%, rgba(0,200,255,0.15) 30%, rgba(0,200,255,0.22) 50%, rgba(0,200,255,0.15) 70%, transparent 100%)",
              pointerEvents: "none",
              zIndex: 3,
            }}
          />
        )}

        {/* Lightning burst when tapped */}
        {seamFlash && (
          <>
            {/* Main bolt — top half */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "50%",
                top: 0,
                width: 5,
                transform: "translateX(-50%)",
                background: "linear-gradient(to bottom, rgba(200,240,255,1) 0%, rgba(80,200,255,0.9) 60%, transparent 100%)",
                animation: `seam-spark-top ${SEAM_FLASH_MS}ms ease-out forwards`,
                zIndex: 10,
                pointerEvents: "none",
              }}
            />
            {/* Main bolt — bottom half */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "50%",
                bottom: 0,
                width: 5,
                transform: "translateX(-50%)",
                background: "linear-gradient(to top, rgba(200,240,255,1) 0%, rgba(80,200,255,0.9) 60%, transparent 100%)",
                animation: `seam-spark-bot ${SEAM_FLASH_MS}ms ease-out forwards`,
                zIndex: 10,
                pointerEvents: "none",
              }}
            />
            {/* Center burst glow */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 6,
                transform: "translate(-50%, -50%)",
                height: "100%",
                background: "transparent",
                boxShadow: "0 0 60px 28px rgba(100,210,255,0.9), 0 0 120px 48px rgba(60,160,255,0.5)",
                animation: `seam-burst ${SEAM_FLASH_MS}ms ease-out forwards`,
                zIndex: 11,
                pointerEvents: "none",
              }}
            />
          </>
        )}

        {/* White flash on door open */}
        {(isOpening || isOpen) && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(180,240,255,0.6)",
              animation: `door-flash 500ms ease-out forwards`,
              zIndex: 4,
              pointerEvents: "none",
            }}
          />
        )}


        {/* ══════════════════════════════════════════════════════════════════════
            CLOSED-DOOR TAP TARGET — full-screen invisible button
            The door image already shows the ENTER GUBER button visually;
            tapping anywhere on the door triggers the open sequence.
            ══════════════════════════════════════════════════════════════════════ */}
        {isClosed && (
          <button
            onClick={handleEnter}
            aria-label="Enter Team GUBER"
            style={{
              position: "absolute",
              inset: 0,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              zIndex: 3,
            }}
          />
        )}

        {/* Ambient seam pulse — subtle glow so it reads as interactive */}
        {isClosed && !seamFlash && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              top: 0, bottom: 0,
              width: 2,
              transform: "translateX(-50%)",
              background: "linear-gradient(to bottom, transparent 0%, rgba(0,220,200,0.22) 30%, rgba(0,220,200,0.35) 50%, rgba(0,220,200,0.22) 70%, transparent 100%)",
              animation: "seam-pulse 2.6s ease-in-out infinite",
              pointerEvents: "none",
              zIndex: 4,
            }}
          />
        )}


        {/* ══════════════════════════════════════════════════════════════════════
            WELCOME HEADLINE — fades in as doors finish opening
            ══════════════════════════════════════════════════════════════════════ */}
        {showWelcome && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              paddingTop: "max(16px, env(safe-area-inset-top, 16px))",
              paddingBottom: 14,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              zIndex: 5,
              background: "linear-gradient(to bottom, rgba(0,0,10,0.84) 0%, rgba(0,0,10,0.48) 65%, transparent 100%)",
              animation: "welcome-in 560ms cubic-bezier(0.22, 1, 0.36, 1) both",
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
              fontSize: "clamp(38px, 11vw, 68px)",
              fontWeight: 700,
              letterSpacing: "0.16em",
              lineHeight: 1,
              color: "#fff",
              textShadow: [
                "0 0 24px rgba(110,60,255,0.8)",
                "0 0 52px rgba(0,180,255,0.4)",
                "0 2px 0 rgba(0,0,0,0.55)",
              ].join(", "),
              margin: 0,
              userSelect: "none",
            }}>GUBER</p>

            <p style={{
              fontFamily: "'Bebas Neue', 'Inter', sans-serif",
              fontSize: "clamp(8px, 2.2vw, 11px)",
              letterSpacing: "0.30em",
              color: "rgba(0,230,120,0.9)",
              margin: "7px 0 0 0",
              userSelect: "none",
            }}>YOUR GO-TO FOR WHAT YOU GO THROUGH.</p>
          </div>
        )}


        {/* ══════════════════════════════════════════════════════════════════════
            JAC GREETING — appears as JAC speaks
            ══════════════════════════════════════════════════════════════════════ */}
        {showGreeting && (
          <div
            aria-live="polite"
            style={{
              position: "absolute",
              bottom: showButtons
                ? "calc(126px + env(safe-area-inset-bottom, 0px))"
                : "calc(21% + env(safe-area-inset-bottom, 0px))",
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
            {isSpeaking && (
              <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: "rgba(0,230,120,0.95)",
                    animation: `speak-dot 0.85s ease-in-out infinite ${i * 0.22}s`,
                  }} />
                ))}
              </div>
            )}

            <p style={{
              fontFamily: "'Bebas Neue', 'Inter', sans-serif",
              fontSize: "clamp(16px, 4.8vw, 22px)",
              letterSpacing: "0.09em",
              lineHeight: 1.25,
              color: "#fff",
              textShadow: "0 0 14px rgba(120,70,255,0.55), 0 2px 8px rgba(0,0,0,0.7)",
              margin: 0,
              textAlign: "center",
              userSelect: "none",
            }}>
              I'M JAC. TELL ME WHAT YOU'RE TRYING TO GET DONE!
            </p>
          </div>
        )}


        {/* ══════════════════════════════════════════════════════════════════════
            CTA BUTTONS
            ══════════════════════════════════════════════════════════════════════ */}
        {showButtons && (
          <div
            style={{
              position: "absolute",
              bottom: 0, left: 0, right: 0,
              zIndex: 10,
              padding: "0 20px calc(18px + env(safe-area-inset-bottom, 0px))",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              background: "linear-gradient(to top, rgba(0,0,10,0.94) 0%, rgba(0,0,10,0.55) 55%, transparent 100%)",
              animation: "btn-appear 400ms cubic-bezier(0.34, 1.1, 0.64, 1) both",
            }}
          >
            {/* TALK TO JAC */}
            <button
              onClick={() => choose(true)}
              aria-label="Talk to JAC with voice"
              style={{
                background: "none", border: "none", padding: 0,
                cursor: "pointer", display: "block", width: "100%",
                lineHeight: 0, borderRadius: 12, overflow: "hidden",
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
              <img src={BTN_TALK} alt="Talk to JAC" draggable={false}
                style={{ width: "100%", height: "auto", display: "block" }} />
            </button>

            {/* TYPE INSTEAD */}
            <button
              onClick={() => choose(false)}
              aria-label="Type to JAC instead"
              style={{
                background: "none", border: "none", padding: 0,
                cursor: "pointer", display: "block", width: "100%",
                lineHeight: 0, borderRadius: 12, overflow: "hidden",
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
              <img src={BTN_TYPE} alt="Type instead" draggable={false}
                style={{ width: "100%", height: "auto", display: "block" }} />
            </button>
          </div>
        )}

      </div>
    </>
  );
}
