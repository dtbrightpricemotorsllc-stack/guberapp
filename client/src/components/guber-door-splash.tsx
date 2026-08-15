import { useEffect, useRef, useState, useCallback } from "react";
import { jacSpeak, unlockAudioContext } from "@/lib/jac-tts";

// ── Source images (served statically from public/splash/) ──────────────────
const DOOR_CLOSED = "/splash/door-closed.png";
const HQ_REVEAL   = "/splash/hq-reveal.png";

// ── Animation timing (ms from the moment ENTER GUBER is tapped) ───────────
const SEAM_FLASH_AT   = 100;  // neon seam flashes
const DOORS_START_AT  = 300;  // doors begin sliding
const DOORS_END_AT    = 1300; // doors fully open
const HQ_SCALE_START  = 1000; // HQ scene starts scaling in
const HQ_SCALE_END    = 1800; // HQ at 100 %
const GREETING_AT     = 1500; // JAC speaks + text appears
const BUTTONS_AT      = 1900; // TALK / TYPE buttons fade in
const DOOR_SLIDE_MS   = DOORS_END_AT - DOORS_START_AT; // 1000 ms
const HQ_SCALE_MS     = HQ_SCALE_END - HQ_SCALE_START; // 800 ms

const GREETING_TEXT = "Hey, welcome to Team GUBER. What are you trying to make happen?";

type Phase =
  | "closed"     // standing by, ENTER GUBER tap target
  | "unlocking"  // 0 – 300 ms: neon flash + seam crack
  | "opening"    // 300 – 1300 ms: doors slide, HQ scales
  | "open"       // idle, waiting for TALK / TYPE choice
  | "exiting";   // fade-out before handing off

export interface GuberDoorSplashProps {
  onEnterVoice: () => void;
  onEnterText:  () => void;
  /** Skip the whole splash — used on native or ?nosplash */
  skip?: boolean;
}

export function GuberDoorSplash({ onEnterVoice, onEnterText, skip }: GuberDoorSplashProps) {
  const [phase,       setPhase]       = useState<Phase>("closed");
  const [seamFlash,   setSeamFlash]   = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  const [mounted,     setMounted]     = useState(true);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timerRefs.current.push(t);
  }, []);

  useEffect(() => {
    if (skip) { setMounted(false); }
    return () => { timerRefs.current.forEach(clearTimeout); };
  }, [skip]);

  function handleEnter() {
    if (phase !== "closed") return;
    unlockAudioContext();
    setPhase("unlocking");

    schedule(() => setSeamFlash(true),              SEAM_FLASH_AT);
    schedule(() => setSeamFlash(false),             SEAM_FLASH_AT + 220);
    schedule(() => setPhase("opening"),             DOORS_START_AT);
    schedule(() => {
      setPhase("open");
      // JAC greeting — static pre-generated MP3 plays instantly with zero
      // API round-trip.  Falls back to live ElevenLabs / Web Speech if the
      // file is absent (GREETING_TEXT keywords match the homepage-welcome slug).
      jacSpeak(GREETING_TEXT, { staticSrc: "/jac-audio/homepage-welcome.mp3" }).catch(() => {});
    }, GREETING_AT);
    schedule(() => setShowButtons(true),            BUTTONS_AT);
  }

  function choose(voice: boolean) {
    if (phase !== "open") return;
    unlockAudioContext(); // lock in audio permission within this gesture
    setPhase("exiting");
    schedule(() => {
      setMounted(false);
      if (voice) onEnterVoice(); else onEnterText();
    }, 400);
  }

  if (!mounted) return null;

  const isOpen      = phase === "open" || phase === "exiting";
  const isOpening   = phase === "opening";
  const isUnlocking = phase === "unlocking";
  const exiting     = phase === "exiting";

  // Door slide progress (0 → 1 over DOOR_SLIDE_MS)
  const doorsSlideDuration = `${DOOR_SLIDE_MS}ms`;
  const doorsTransition = (isOpening || isOpen)
    ? `transform ${doorsSlideDuration} cubic-bezier(0.4, 0, 0.2, 1)`
    : "none";

  // HQ scale progress
  const hqScaleDuration = `${HQ_SCALE_MS}ms`;
  const hqTransition = (isOpening || isOpen)
    ? `transform ${hqScaleDuration} cubic-bezier(0.4, 0, 0.2, 1) ${HQ_SCALE_START - DOORS_START_AT}ms`
    : "none";

  return (
    <>
      <style>{`
        @keyframes guber-seam-flash {
          0%   { opacity: 0; background: rgba(255,255,255,0); }
          15%  { opacity: 1; background: rgba(255,255,255,0.95); box-shadow: 0 0 30px 12px rgba(0,220,255,0.9); }
          40%  { opacity: 0.7; background: rgba(0,220,255,0.7); box-shadow: 0 0 20px 8px rgba(0,220,255,0.6); }
          100% { opacity: 0; }
        }
        @keyframes guber-door-glow {
          0%, 100% { box-shadow: inset 0 0 40px rgba(0,0,0,0.7); }
          50%       { box-shadow: inset 0 0 40px rgba(100,80,255,0.15); }
        }
        @keyframes guber-hq-idle-pulse {
          0%, 100% { filter: brightness(1) saturate(1); }
          50%       { filter: brightness(1.04) saturate(1.06); }
        }
        @keyframes guber-floor-ring {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50%       { opacity: 0.7; transform: scale(1.04); }
        }
        @keyframes guber-fade-in-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes guber-btn-appear {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes guber-lock-crack {
          0%   { transform: translateX(-50%) scaleX(1); }
          30%  { transform: translateX(-50%) scaleX(2.5); }
          100% { transform: translateX(-50%) scaleX(0); }
        }
      `}</style>

      {/* ── Root overlay ─────────────────────────────────────────────────── */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "#000",
          overflow: "hidden",
          opacity: exiting ? 0 : 1,
          transition: exiting ? "opacity 380ms ease-in" : "none",
        }}
        aria-label={phase === "closed" ? "GUBER entry — tap to enter" : "Loading Team GUBER"}
        role="region"
      >

        {/* ── HQ reveal layer (behind doors) ──────────────────────────────── */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            // Subtle idle breathing when fully open
            animation: isOpen ? "guber-hq-idle-pulse 3.5s ease-in-out infinite" : "none",
          }}
        >
          <img
            src={HQ_REVEAL}
            alt=""
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top center",
              display: "block",
              userSelect: "none",
              willChange: "transform",
              // Scale 94 % → 100 % as doors open (perspective push effect)
              transform: (isOpening || isOpen) ? "scale(1)" : "scale(0.94)",
              transition: hqTransition,
            }}
          />
        </div>

        {/* ── Left door panel ─────────────────────────────────────────────── */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "50%",
            height: "100%",
            overflow: "hidden",
            willChange: "transform",
            transform: (isOpening || isOpen) ? "translateX(-100%)" : "translateX(0)",
            transition: doorsTransition,
            animation: (!isOpening && !isOpen) ? "guber-door-glow 4s ease-in-out infinite" : "none",
          }}
        >
          <img
            src={DOOR_CLOSED}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "200%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "left center",
              userSelect: "none",
              display: "block",
            }}
          />
        </div>

        {/* ── Right door panel ────────────────────────────────────────────── */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            width: "50%",
            height: "100%",
            overflow: "hidden",
            willChange: "transform",
            transform: (isOpening || isOpen) ? "translateX(100%)" : "translateX(0)",
            transition: doorsTransition,
            animation: (!isOpening && !isOpen) ? "guber-door-glow 4s ease-in-out infinite 2s" : "none",
          }}
        >
          <img
            src={DOOR_CLOSED}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              width: "200%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "right center",
              userSelect: "none",
              display: "block",
            }}
          />
        </div>

        {/* ── Center seam line (always present, flashes on unlock) ────────── */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 2,
            transform: "translateX(-50%)",
            background: "rgba(0,180,255,0.25)",
            opacity: (isOpening || isOpen) ? 0 : 1,
            transition: (isOpening || isOpen) ? "opacity 200ms" : "none",
            animation: seamFlash ? "guber-seam-flash 220ms ease-out forwards" : "none",
          }}
        />

        {/* ── ENTER GUBER tap target (doors-closed state) ─────────────────── */}
        {(phase === "closed" || isUnlocking) && (
          <button
            onClick={handleEnter}
            aria-label="Enter GUBER"
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

        {/* ── Post-open CTA buttons ────────────────────────────────────────── */}
        {showButtons && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "20px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
              display: "flex",
              gap: 12,
              zIndex: 10,
              // Gradient so buttons sit on a dark base regardless of image content
              background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)",
              animation: "guber-btn-appear 380ms cubic-bezier(0.34,1.1,0.64,1) both",
            }}
          >
            {/* TALK TO JAC */}
            <button
              onClick={() => choose(true)}
              style={{
                flex: 1,
                height: 52,
                borderRadius: 14,
                border: "1.5px solid rgba(0,229,118,0.7)",
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(8px)",
                color: "#00E576",
                fontFamily: "'Bebas Neue', 'Inter', sans-serif",
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: "0.12em",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "0 0 18px rgba(0,229,118,0.25), inset 0 0 14px rgba(0,229,118,0.05)",
                transition: "transform 120ms, box-shadow 120ms",
              }}
              onPointerDown={e => (e.currentTarget.style.transform = "scale(0.97)")}
              onPointerUp={e => (e.currentTarget.style.transform = "scale(1)")}
              onPointerLeave={e => (e.currentTarget.style.transform = "scale(1)")}
              aria-label="Talk to JAC with voice"
            >
              {/* waveform icon */}
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
                <rect x="0"  y="4" width="2" height="6"  rx="1" fill="currentColor" opacity="0.6"/>
                <rect x="3"  y="2" width="2" height="10" rx="1" fill="currentColor" opacity="0.8"/>
                <rect x="6"  y="0" width="2" height="14" rx="1" fill="currentColor"/>
                <rect x="9"  y="2" width="2" height="10" rx="1" fill="currentColor" opacity="0.8"/>
                <rect x="12" y="4" width="2" height="6"  rx="1" fill="currentColor" opacity="0.6"/>
                <rect x="15" y="5" width="2" height="4"  rx="1" fill="currentColor" opacity="0.4"/>
              </svg>
              TALK TO JAC
            </button>

            {/* TYPE INSTEAD */}
            <button
              onClick={() => choose(false)}
              style={{
                flex: 1,
                height: 52,
                borderRadius: 14,
                border: "1.5px solid rgba(0,229,118,0.35)",
                background: "rgba(0,0,0,0.45)",
                backdropFilter: "blur(8px)",
                color: "rgba(0,229,118,0.75)",
                fontFamily: "'Bebas Neue', 'Inter', sans-serif",
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: "0.12em",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "0 0 10px rgba(0,229,118,0.1)",
                transition: "transform 120ms",
              }}
              onPointerDown={e => (e.currentTarget.style.transform = "scale(0.97)")}
              onPointerUp={e => (e.currentTarget.style.transform = "scale(1)")}
              onPointerLeave={e => (e.currentTarget.style.transform = "scale(1)")}
              aria-label="Type to JAC instead"
            >
              {/* keyboard icon */}
              <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden="true">
                <rect x="0" y="0" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                <rect x="2" y="2.5" width="2" height="2" rx="0.5" fill="currentColor" opacity="0.7"/>
                <rect x="5" y="2.5" width="2" height="2" rx="0.5" fill="currentColor" opacity="0.7"/>
                <rect x="8" y="2.5" width="2" height="2" rx="0.5" fill="currentColor" opacity="0.7"/>
                <rect x="11" y="2.5" width="3" height="2" rx="0.5" fill="currentColor" opacity="0.7"/>
                <rect x="2" y="6"   width="2" height="2" rx="0.5" fill="currentColor" opacity="0.7"/>
                <rect x="5" y="6"   width="6" height="2" rx="0.5" fill="currentColor" opacity="0.9"/>
                <rect x="12" y="6"  width="2" height="2" rx="0.5" fill="currentColor" opacity="0.7"/>
              </svg>
              TYPE INSTEAD
            </button>
          </div>
        )}

      </div>
    </>
  );
}
