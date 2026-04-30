import { useEffect, useState } from "react";

const MESSAGES = [
  "80% of buyers get misled online… Use Verify & Inspect",
  "Need money fast? Accept a job instantly",
  "Need something done? Post → Get help immediately",
  "Not sure if it's real? AI or Not has you covered",
  "Buying out of state? Have it verified before you pay",
  "No waiting. No guessing. Just real results",
  "GUBER is loading opportunity…",
];

const MSG_INTERVAL_MS = 1500;
const SAFETY_CAP_MS = 12000;

interface SplashScreenProps {
  onDone: () => void;
}

export default function SplashScreen({ onDone }: SplashScreenProps) {
  const [phase, setPhase] = useState(0);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [msgIndex, setMsgIndex] = useState(-1);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setDoorsOpen(true), 300));
    timers.push(setTimeout(() => setPhase(1), 600));
    timers.push(setTimeout(() => setPhase(2), 820));
    timers.push(setTimeout(() => {
      setPhase(3);
      setMsgIndex(0);
    }, 1040));

    let count = 0;
    const msgTimer = setInterval(() => {
      count++;
      if (count < MESSAGES.length) {
        setMsgIndex(count);
      } else {
        clearInterval(msgTimer);
        setExiting(true);
        setTimeout(() => onDone(), 450);
      }
    }, MSG_INTERVAL_MS);

    const safety = setTimeout(() => {
      clearInterval(msgTimer);
      setExiting(true);
      setTimeout(() => onDone(), 450);
    }, SAFETY_CAP_MS);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(msgTimer);
      clearTimeout(safety);
    };
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "radial-gradient(ellipse 80% 60% at 50% 40%, #0a0a0a 0%, #000 100%)", // dark-gradient-allow: full-screen splash backdrop, no text rendered on this surface
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: exiting ? 0 : 1,
        transition: exiting ? "opacity 0.42s cubic-bezier(0.4,0,1,1)" : "none",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* Ambient corner glows */}
      <div style={{ position: "absolute", top: "-15%", left: "-10%", width: "55%", height: "55%", background: "radial-gradient(circle, rgba(201,168,76,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-15%", right: "-10%", width: "50%", height: "50%", background: "radial-gradient(circle, rgba(88,28,135,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Subtle grid overlay */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: "linear-gradient(rgba(201,168,76,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.025) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
        mask: "radial-gradient(ellipse 70% 70% at 50% 50%, black 30%, transparent 100%)",
        WebkitMask: "radial-gradient(ellipse 70% 70% at 50% 50%, black 30%, transparent 100%)",
        pointerEvents: "none",
        opacity: 0.6,
      }} />

      {/* Logo image + ring stack */}
      <div style={{ position: "relative", width: "min(280px, 80vw)", aspectRatio: "1 / 1.08" }}>

        {/* Outer rotating ring — phase 2+ */}
        {phase >= 2 && (
          <div
            style={{
              position: "absolute",
              inset: -20,
              borderRadius: "50%",
              border: "1.5px solid transparent",
              background: "conic-gradient(from 0deg, rgba(201,168,76,0) 0%, rgba(201,168,76,0.55) 20%, rgba(201,168,76,0) 40%, transparent 100%) border-box",
              WebkitMask: "linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)",
              WebkitMaskComposite: "destination-out",
              maskComposite: "exclude",
              animation: "guber-ring-spin 2.4s linear infinite",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Second ring — slower, opposite direction — phase 2+ */}
        {phase >= 2 && (
          <div
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: "50%",
              border: "1px solid transparent",
              background: "conic-gradient(from 180deg, rgba(201,168,76,0) 0%, rgba(201,168,76,0.28) 25%, rgba(201,168,76,0) 50%, transparent 100%) border-box",
              WebkitMask: "linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)",
              WebkitMaskComposite: "destination-out",
              maskComposite: "exclude",
              animation: "guber-ring-spin-rev 3.8s linear infinite",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Glow halo behind image — phase 1+ */}
        {phase >= 1 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(201,168,76,0.12) 0%, transparent 70%)",
              animation: "guber-halo-breathe 2.2s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Image */}
        <img
          src="/splash-bg.png"
          alt="GUBER"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
            position: "relative",
            zIndex: 1,
            filter: phase >= 1 ? "drop-shadow(0 0 18px rgba(201,168,76,0.3))" : "none",
            transition: "filter 0.6s ease",
          }}
        />

        {/* Scan line sweep — phase 3+ */}
        {phase >= 3 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "3px",
              background: "linear-gradient(90deg, transparent 0%, rgba(201,168,76,0.6) 50%, transparent 100%)",
              animation: "guber-scan 1.6s ease-in-out 1",
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
        )}
      </div>

      {/* Text block */}
      <div style={{ textAlign: "center", marginTop: 26, padding: "0 24px" }}>
        <p
          style={{
            color: "#fff",
            fontWeight: 900,
            fontSize: 32,
            letterSpacing: "-0.03em",
            margin: 0,
            fontFamily: "Oxanium, sans-serif",
            animation: phase >= 1 ? "guber-text-reveal 0.7s ease-out both" : "none",
          }}
        >
          GUBER
          <sup style={{ fontSize: 13, fontWeight: 600, opacity: 0.45, verticalAlign: "super", marginLeft: 2 }}>™</sup>
        </p>

        {/* Tagline — phase 1+ */}
        <p
          style={{
            color: phase >= 1 ? "rgba(201,168,76,0.55)" : "transparent",
            fontSize: 10,
            marginTop: 6,
            letterSpacing: "0.22em",
            fontFamily: "Oxanium, sans-serif",
            fontWeight: 700,
            textTransform: "uppercase",
            transition: "color 0.6s ease 0.3s",
          }}
        >
          LOCAL TRUST NETWORK
        </p>

        {/* Rotating educational message — phase 3+ */}
        <div style={{ height: 36, marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {msgIndex >= 0 && (
            <p
              key={msgIndex}
              style={{
                color: "rgba(201,168,76,0.75)",
                fontSize: 12,
                margin: 0,
                letterSpacing: "0.03em",
                fontFamily: "Oxanium, sans-serif",
                fontWeight: 500,
                maxWidth: 280,
                lineHeight: 1.4,
                animation: "guber-msg-cycle 1.4s ease both",
              }}
            >
              {MESSAGES[msgIndex]}
            </p>
          )}
        </div>
      </div>

      {/* Activity dots — phase 3+ */}
      <div style={{ display: "flex", gap: 7, marginTop: 10, alignItems: "center" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              width: i === 2 ? 8 : 5,
              height: i === 2 ? 8 : 5,
              borderRadius: "50%",
              background: i === 2 ? "#C9A84C" : "rgba(201,168,76,0.4)",
              opacity: phase >= 3 ? 1 : 0,
              animation: phase >= 3 ? `guber-dot-pulse 1.2s ease-in-out ${i * 0.18}s infinite` : "none",
              transition: "opacity 0.4s ease",
            }}
          />
        ))}
      </div>

      {/* Version tag */}
      <p style={{
        position: "absolute",
        bottom: 28,
        color: "rgba(255,255,255,0.85)",
        fontSize: 10,
        fontFamily: "Oxanium, sans-serif",
        letterSpacing: "0.08em",
        opacity: phase >= 3 ? 1 : 0,
        transition: "opacity 0.6s ease",
      }}>
        guberapp.app
      </p>

      {/* Left door panel */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "50%",
          height: "65%",
          overflow: "hidden",
          zIndex: 10,
          transform: doorsOpen ? "translateX(-100%)" : "translateX(0)",
          transition: doorsOpen ? "transform 1.2s ease-in-out" : "none",
          willChange: "transform",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "200%",
            height: "100%",
            backgroundImage: "url('/doors.png')",
            backgroundSize: "cover",
            backgroundPosition: "left top",
            backgroundRepeat: "no-repeat",
          }}
        />
      </div>

      {/* Right door panel */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "50%",
          height: "65%",
          overflow: "hidden",
          zIndex: 10,
          transform: doorsOpen ? "translateX(100%)" : "translateX(0)",
          transition: doorsOpen ? "transform 1.2s ease-in-out" : "none",
          willChange: "transform",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "200%",
            height: "100%",
            backgroundImage: "url('/doors.png')",
            backgroundSize: "cover",
            backgroundPosition: "right top",
            backgroundRepeat: "no-repeat",
          }}
        />
      </div>

      <style>{`
        @keyframes guber-ring-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes guber-ring-spin-rev {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
        @keyframes guber-halo-breathe {
          0%, 100% { opacity: 0.6; transform: scale(0.95); }
          50%       { opacity: 1;   transform: scale(1.05); }
        }
        @keyframes guber-text-reveal {
          0%   { opacity: 0; transform: translateY(6px); text-shadow: none; }
          40%  { text-shadow: 0 0 28px rgba(201,168,76,0.55), 0 0 60px rgba(201,168,76,0.2); }
          100% { opacity: 1; transform: translateY(0); text-shadow: 0 0 8px rgba(201,168,76,0.08); }
        }
        @keyframes guber-scan {
          0%   { top: -4px;   opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.8; }
          100% { top: 100%;  opacity: 0; }
        }
        @keyframes guber-dot-pulse {
          0%, 80%, 100% { transform: scale(0.55); opacity: 0.25; }
          40%           { transform: scale(1);    opacity: 1; }
        }
        @keyframes guber-msg-cycle {
          0%   { opacity: 0; transform: translateY(5px); }
          15%  { opacity: 1; transform: translateY(0); }
          78%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
