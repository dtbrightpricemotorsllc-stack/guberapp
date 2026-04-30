import { useCallback, useEffect, useRef, useState } from "react";

const LOGO_SRC = "/icon-1024-transparent.png";

/**
 * GUBER cinematic splash screen.
 *
 * Sequence (≈ 3.5s minimum, hard cap 6s):
 *   0–150ms     pure black hold
 *   150–550ms   shield logo SLAMS in (scale 1.65 → 1, neon ignite)
 *   550ms+      color glow starts cycling: purple → green → gold → cyan
 *   700–3100ms  4 message pairs rotate, each 600ms (slide in w/ motion blur)
 *   3100–3500ms final GUBER tagline reveal w/ pulsing glow
 *   3500ms+     waits for appReady, then fades out (logo flies upward)
 */

const TIMING = {
  BLACK_HOLD: 150,
  MESSAGE_START: 700,
  MESSAGE_DURATION: 600,
  MESSAGE_COUNT: 4,
  TAGLINE_START: 700 + 600 * 4,         // 3100ms
  EARLIEST_EXIT: 700 + 600 * 4 + 400,   // 3500ms — tagline has been visible 400ms
  EXIT_FADE_MS: 500,
  HARD_CAP: 6000,
};

const MESSAGES: Array<readonly [string, string]> = [
  ["Need cash?", "Accept jobs."],
  ["Avoid scams.", "Verify first."],
  ["Need help?", "Post it."],
  ["Anywhere.", "Anytime."],
];

interface SplashScreenProps {
  onDone: () => void;
  appReady?: boolean;
}

export default function SplashScreen({ onDone, appReady = false }: SplashScreenProps) {
  const [logoIn, setLogoIn] = useState(false);
  const [messageIdx, setMessageIdx] = useState(-1);
  const [showTagline, setShowTagline] = useState(false);
  const [exiting, setExiting] = useState(false);

  const finishedRef = useRef(false);
  const earliestExitReachedRef = useRef(false);
  const appReadyRef = useRef(appReady);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => { appReadyRef.current = appReady; }, [appReady]);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    setExiting(true);
    // Track the exit timer so unmount during fade doesn't fire onDone()
    // after the parent has already discarded the splash.
    const exitTimer = setTimeout(() => onDone(), TIMING.EXIT_FADE_MS);
    timersRef.current.push(exitTimer);
  }, [onDone]);

  // If the app is already ready by the time we finish the cinematic, exit.
  useEffect(() => {
    if (appReady && earliestExitReachedRef.current) finish();
  }, [appReady, finish]);

  useEffect(() => {
    const t = (delay: number, fn: () => void) => {
      const id = setTimeout(fn, delay);
      timersRef.current.push(id);
    };

    // Logo slams in after the black hold
    t(TIMING.BLACK_HOLD, () => setLogoIn(true));

    // Cycle through the 4 message pairs
    for (let i = 0; i < TIMING.MESSAGE_COUNT; i++) {
      t(TIMING.MESSAGE_START + i * TIMING.MESSAGE_DURATION, () => setMessageIdx(i));
    }

    // Hide messages, reveal final tagline
    t(TIMING.TAGLINE_START, () => {
      setMessageIdx(-1);
      setShowTagline(true);
    });

    // Cinematic complete — exit if app is ready
    t(TIMING.EARLIEST_EXIT, () => {
      earliestExitReachedRef.current = true;
      if (appReadyRef.current) finish();
    });

    // Hard safety cap
    t(TIMING.HARD_CAP, finish);

    return () => {
      timersRef.current.forEach((id) => clearTimeout(id));
      timersRef.current = [];
    };
  }, [finish]);

  const currentMessage = messageIdx >= 0 && messageIdx < MESSAGES.length ? MESSAGES[messageIdx] : null;

  return (
    <div
      data-testid="splash-screen"
      role="status"
      aria-live="polite"
      aria-label="Loading GUBER"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: exiting ? 0 : 1,
        transition: exiting ? `opacity ${TIMING.EXIT_FADE_MS}ms cubic-bezier(0.4,0,1,1)` : "none",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* ── Shield logo with color-cycling neon glow ── */}
      {/* drop-shadow filters trace the shield's actual outline, so the glow */}
      {/* hugs the neon shape instead of forming a visible square halo. */}
      <div
        className={logoIn ? "guber-logo guber-logo-in" : "guber-logo"}
        style={{
          position: "relative",
          width: 200,
          height: 200,
          opacity: logoIn ? 1 : 0,
          transform: exiting
            ? "scale(0.4) translateY(-46vh)"
            : logoIn
            ? "scale(1) translateY(0)"
            : "scale(1.65) translateY(0)",
          transition: exiting
            ? "transform 0.55s cubic-bezier(0.7,0,0.3,1), opacity 0.55s ease"
            : "opacity 0.45s ease, transform 0.5s cubic-bezier(0.18,0.9,0.3,1.18)",
          zIndex: 2,
          willChange: "transform, opacity",
        }}
        data-testid="splash-logo"
      >
        <img
          src={LOGO_SRC}
          alt="GUBER"
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            objectFit: "contain",
            mixBlendMode: "screen",
          }}
        />
      </div>

      {/* ── Message / tagline slot — fixed height so layout never shifts ── */}
      <div
        style={{
          marginTop: 32,
          height: 96,
          width: "min(420px, 92vw)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          zIndex: 2,
          opacity: exiting ? 0 : 1,
          transition: `opacity 0.35s ease`,
        }}
      >
        {/* Rotating message pair */}
        {currentMessage && !showTagline && (
          <div key={`msg-${messageIdx}`} className="guber-msg" data-testid={`text-splash-message-${messageIdx}`}>
            <span className="guber-msg-q">{currentMessage[0]}</span>
            <span className="guber-msg-a">{currentMessage[1]}</span>
          </div>
        )}

        {/* Final tagline */}
        {showTagline && (
          <div className="guber-tagline" data-testid="text-splash-tagline">
            <h1 className="guber-tagline-title">GUBER</h1>
            <p className="guber-tagline-sub">
              WORK OR HIRE.
              <br />
              ANYTIME. ANYWHERE.
            </p>
          </div>
        )}
      </div>

      <style>{`
        /* ── Logo neon ignite + color-cycling glow that hugs the shield outline ── */
        @keyframes guber-logo-glow {
          0%, 100% {
            filter:
              drop-shadow(0 0 12px rgba(168, 80, 255, 0.95))
              drop-shadow(0 0 28px rgba(168, 80, 255, 0.55))
              drop-shadow(0 0 56px rgba(168, 80, 255, 0.30));
          }
          25% {
            filter:
              drop-shadow(0 0 12px rgba(0, 255, 150, 0.95))
              drop-shadow(0 0 28px rgba(0, 255, 150, 0.55))
              drop-shadow(0 0 56px rgba(0, 255, 150, 0.30));
          }
          50% {
            filter:
              drop-shadow(0 0 12px rgba(255, 200, 60, 0.95))
              drop-shadow(0 0 28px rgba(255, 200, 60, 0.55))
              drop-shadow(0 0 56px rgba(255, 200, 60, 0.30));
          }
          75% {
            filter:
              drop-shadow(0 0 12px rgba(0, 225, 255, 0.95))
              drop-shadow(0 0 28px rgba(0, 225, 255, 0.55))
              drop-shadow(0 0 56px rgba(0, 225, 255, 0.30));
          }
        }
        @keyframes guber-logo-breathe {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.04); }
        }
        .guber-logo-in {
          animation: guber-logo-glow 7s linear infinite;
        }
        .guber-logo-in img {
          animation: guber-logo-breathe 3.2s ease-in-out infinite 0.6s;
        }

        /* ── Message pair: question slides in from left, answer from right ── */
        @keyframes guber-msg-q-in {
          0%   { transform: translateX(-72px); opacity: 0; filter: blur(14px); }
          70%  { transform: translateX(0);     opacity: 1; filter: blur(0); }
          100% { transform: translateX(0);     opacity: 1; filter: blur(0); }
        }
        @keyframes guber-msg-a-in {
          0%   { transform: translateX(72px);  opacity: 0; filter: blur(14px); }
          40%  { transform: translateX(72px);  opacity: 0; filter: blur(14px); }
          90%  { transform: translateX(0);     opacity: 1; filter: blur(0); }
          100% { transform: translateX(0);     opacity: 1; filter: blur(0); }
        }
        .guber-msg {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .guber-msg-q {
          font-family: Oxanium, system-ui, sans-serif;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: #ffffff;
          text-shadow:
            0 0 10px rgba(0, 225, 255, 0.75),
            0 0 22px rgba(168, 80, 255, 0.55);
          animation: guber-msg-q-in 0.32s cubic-bezier(0.2,0.85,0.25,1) both;
        }
        .guber-msg-a {
          font-family: Oxanium, system-ui, sans-serif;
          font-size: 20px;
          font-weight: 600;
          letter-spacing: 0.06em;
          color: rgba(255,255,255,0.92);
          text-shadow:
            0 0 10px rgba(255, 200, 60, 0.65),
            0 0 18px rgba(0, 255, 150, 0.35);
          animation: guber-msg-a-in 0.42s cubic-bezier(0.2,0.85,0.25,1) both;
        }

        /* ── Final tagline: gradient text + pulsing glow ── */
        @keyframes guber-tagline-in {
          0%   { transform: translateY(10px) scale(0.94); opacity: 0; filter: blur(10px); }
          100% { transform: translateY(0)    scale(1);    opacity: 1; filter: blur(0); }
        }
        @keyframes guber-tagline-glow {
          0%, 100% { filter: drop-shadow(0 0 14px rgba(168,80,255,0.65)) drop-shadow(0 0 28px rgba(0,225,255,0.32)); }
          50%      { filter: drop-shadow(0 0 22px rgba(0,255,150,0.80)) drop-shadow(0 0 40px rgba(255,200,60,0.45)); }
        }
        .guber-tagline {
          animation: guber-tagline-in 0.55s cubic-bezier(0.2,0.85,0.25,1) both;
        }
        .guber-tagline-title {
          margin: 0 0 8px;
          font-family: Oxanium, system-ui, sans-serif;
          font-size: 42px;
          font-weight: 800;
          letter-spacing: 0.18em;
          background: linear-gradient(90deg, #b85cff 0%, #00d4ff 35%, #00ff9c 65%, #ffd166 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
          animation: guber-tagline-glow 2.6s ease-in-out infinite 0.4s;
          line-height: 1;
        }
        .guber-tagline-sub {
          margin: 0;
          font-family: Oxanium, system-ui, sans-serif;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.22em;
          color: rgba(255,255,255,0.82);
          line-height: 1.55;
          text-shadow: 0 0 8px rgba(0,225,255,0.35);
        }
      `}</style>
    </div>
  );
}
