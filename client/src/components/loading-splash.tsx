import { useEffect, useMemo, useRef, useState } from "react";

const PANDA_SRC = "/loading-panda.png";
const CITY_BG_SRC = "/loading-city-bg.png";

const SOLO_MESSAGES: string[] = [
  "STOP SCROLLING.",
  "GET IT DONE.",
  "VERIFY ANYTHING.",
  "NO GUESSING.",
  "REAL PEOPLE.",
  "REAL MONEY.",
  "REAL FAST.",
  "WORK.",
  "HIRE.",
  "VERIFY.",
  "DONE.",
  "AI OR NOT",
  "REAL OR FAKE",
  "KNOW INSTANTLY",
  "CHECK BEFORE YOU TRUST",
  "SEE THE TRUTH",
];

const PAIR_MESSAGES: Array<readonly [string, string]> = [
  ["NEED MONEY?", "POST A JOB."],
  ["NEED HELP?", "GET IT DONE."],
  ["NEED MONEY?", "WORK."],
  ["NEED HELP?", "HIRE."],
  ["AI OR NOT", "KNOW INSTANTLY"],
  ["REAL OR FAKE", "SEE THE TRUTH"],
];

type SoloSlide = { kind: "solo"; line: string };
type PairSlide = { kind: "pair"; lines: readonly [string, string] };
type Slide = SoloSlide | PairSlide;

const FADE_IN_MS = 400;
const HOLD_MS = 1500;
const FADE_OUT_MS = 400;
const SLIDE_TOTAL_MS = FADE_IN_MS + HOLD_MS + FADE_OUT_MS;
const EXIT_FADE_MS = 450;
const PAIR_PROBABILITY = 0.3;

function pickNextSlide(prev: Slide | null): Slide {
  // ~30% chance of a 2-line pair, else a solo line.
  const wantPair = Math.random() < PAIR_PROBABILITY;
  if (wantPair) {
    let candidate: PairSlide;
    let attempts = 0;
    do {
      const pair = PAIR_MESSAGES[Math.floor(Math.random() * PAIR_MESSAGES.length)];
      candidate = { kind: "pair", lines: pair };
      attempts++;
    } while (
      attempts < 6 &&
      prev &&
      prev.kind === "pair" &&
      prev.lines[0] === candidate.lines[0] &&
      prev.lines[1] === candidate.lines[1]
    );
    return candidate;
  }
  let candidate: SoloSlide;
  let attempts = 0;
  do {
    const line = SOLO_MESSAGES[Math.floor(Math.random() * SOLO_MESSAGES.length)];
    candidate = { kind: "solo", line };
    attempts++;
  } while (
    attempts < 6 &&
    prev &&
    prev.kind === "solo" &&
    prev.line === candidate.line
  );
  return candidate;
}

export interface LoadingSplashProps {
  /** When true, the splash is visible. When flipped to false, fades out smoothly. */
  loading: boolean;
  /** Optional callback fired once the fade-out completes after `loading` flipped false. */
  onDone?: () => void;
  /**
   * Minimum visible duration in ms — even if `loading` flips false sooner, the
   * splash holds long enough to show at least one full message cycle. Defaults
   * to one full slide cycle (~2.3s).
   */
  minVisibleMs?: number;
}

/**
 * Universal GUBER loading splash. Drop-in overlay that shows a centered panda
 * mascot over a blurred neon-city backdrop with a randomized rotating message.
 *
 * Usage:
 *   <LoadingSplash loading={isLoading} />
 *
 * The component:
 *   - fades in from black (fast)
 *   - applies a very subtle slow zoom (push-in)
 *   - softly pulses the panda's neon halo every ~2s
 *   - rotates through one randomized message at a time (no repeats in a row)
 *   - occasionally pairs two related lines (e.g. "NEED MONEY?" → "POST A JOB.")
 *   - holds for at least one full message cycle before exit
 *   - fades out smoothly to the screen behind it
 */
export function LoadingSplash({
  loading,
  onDone,
  minVisibleMs = SLIDE_TOTAL_MS,
}: LoadingSplashProps) {
  // Render-mounted vs. visible-on-screen are tracked separately so we can run
  // both an entry fade-in (mount opacity 0 → 1) and an exit fade-out before
  // unmounting.
  const [mounted, setMounted] = useState<boolean>(loading);
  const [visible, setVisible] = useState<boolean>(false);

  // Each load-event picks a fresh random sequence. We re-seed when the splash
  // transitions from hidden → shown so back-to-back loads don't memo-cache the
  // same first message.
  const [seed, setSeed] = useState<number>(0);
  const [slide, setSlide] = useState<Slide | null>(null);
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  const shownAtRef = useRef<number | null>(null);
  const wantHideRef = useRef<boolean>(false);
  const prevLoadingRef = useRef<boolean>(false);
  const slideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showRafRef = useRef<number | null>(null);

  // Mount/unmount + visibility transitions driven by `loading` prop.
  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = loading;

    if (loading) {
      wantHideRef.current = false;
      // Cancel any pending fade-out / unmount from a prior `loading=false`.
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      // A new "loading episode" begins on every false→true transition (or
      // first mount). Re-stamp the shownAt anchor so the minimum-visible
      // guarantee applies per episode, not just per cold mount.
      const newEpisode = !wasLoading;
      if (newEpisode) {
        shownAtRef.current = Date.now();
      }
      if (!mounted) {
        // Cold show: mount opacity-0, re-seed, then flip visible on next
        // frame so the CSS opacity transition actually runs (fade-in).
        setMounted(true);
        setVisible(false);
        setSeed((s) => s + 1);
        if (showRafRef.current) cancelAnimationFrame(showRafRef.current);
        showRafRef.current = requestAnimationFrame(() => {
          showRafRef.current = requestAnimationFrame(() => setVisible(true));
        });
      } else if (!visible) {
        // Re-show during exit fade: bring back to fully visible without
        // resetting the message sequence (less jarring than a fresh seed).
        setVisible(true);
      }
      return;
    }
    // loading flipped false. Honor minimum visible duration.
    wantHideRef.current = true;
    if (!mounted) return;
    const elapsed = Date.now() - (shownAtRef.current ?? Date.now());
    const wait = Math.max(0, minVisibleMs - elapsed);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => {
      // If user re-triggered loading while we were waiting, abort the hide.
      if (!wantHideRef.current) return;
      setVisible(false);
      const t = setTimeout(() => {
        if (!wantHideRef.current) return;
        setMounted(false);
        onDone?.();
      }, EXIT_FADE_MS);
      exitTimerRef.current = t;
    }, wait);
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, [loading, mounted, visible, minVisibleMs, onDone]);

  // Message rotation loop — restarts whenever `seed` changes (fresh show).
  useEffect(() => {
    if (!mounted) return;
    let prev: Slide | null = null;

    const runCycle = () => {
      const next = pickNextSlide(prev);
      prev = next;
      setSlide(next);
      setPhase("in");
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = setTimeout(() => {
        setPhase("hold");
        phaseTimerRef.current = setTimeout(() => {
          setPhase("out");
        }, HOLD_MS);
      }, FADE_IN_MS);
    };

    runCycle();
    slideTimerRef.current = setInterval(runCycle, SLIDE_TOTAL_MS);
    return () => {
      if (slideTimerRef.current) clearInterval(slideTimerRef.current);
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    };
  }, [mounted, seed]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (slideTimerRef.current) clearInterval(slideTimerRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
      if (showRafRef.current) {
        cancelAnimationFrame(showRafRef.current);
        showRafRef.current = null;
      }
    };
  }, []);

  const slideOpacity = useMemo(() => {
    if (!slide) return 0;
    if (phase === "in") return 1;
    if (phase === "hold") return 1;
    return 0;
  }, [slide, phase]);

  const slideTransition = useMemo(() => {
    if (phase === "in") return `opacity ${FADE_IN_MS}ms ease-out`;
    if (phase === "out") return `opacity ${FADE_OUT_MS}ms ease-in`;
    return "none";
  }, [phase]);

  if (!mounted) return null;

  return (
    <>
      <style>{`
        @keyframes guber-loading-zoom {
          from { transform: scale(1); }
          to   { transform: scale(1.06); }
        }
        @keyframes guber-loading-halo-pulse {
          0%, 60%, 100% {
            opacity: 0.55;
            filter: blur(28px);
            transform: translate(-50%, -50%) scale(1);
          }
          30% {
            opacity: 0.95;
            filter: blur(36px);
            transform: translate(-50%, -50%) scale(1.08);
          }
        }
        @keyframes guber-loading-panda-pulse {
          0%, 60%, 100% {
            filter:
              drop-shadow(0 0 6px rgba(0, 255, 150, 0.55))
              drop-shadow(0 0 14px rgba(0, 255, 150, 0.30))
              drop-shadow(0 0 28px rgba(255, 200, 60, 0.18));
          }
          30% {
            filter:
              drop-shadow(0 0 10px rgba(0, 255, 150, 0.85))
              drop-shadow(0 0 22px rgba(0, 255, 150, 0.55))
              drop-shadow(0 0 40px rgba(255, 200, 60, 0.35));
          }
        }
        @keyframes guber-loading-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      <div
        data-testid="loading-splash"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99998,
          background: "#000",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: visible ? 1 : 0,
          transition: visible ? `opacity 220ms ease-out` : `opacity ${EXIT_FADE_MS}ms ease-in`,
          pointerEvents: visible ? "auto" : "none",
          overflow: "hidden",
        }}
      >
        {/* ── Blurred neon-city backdrop with subtle slow zoom ── */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "-6%",
            backgroundImage: `url(${CITY_BG_SRC})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(8px) brightness(0.55) saturate(1.15)",
            animation: "guber-loading-zoom 9s ease-out forwards",
            willChange: "transform",
          }}
        />

        {/* ── Vignette + color tint to deepen blacks and bias toward neon palette ── */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0.95) 100%)",
            mixBlendMode: "multiply",
          }}
        />

        {/* ── Centered panda + halo cluster (vertical 9:16 framing) ── */}
        <div
          style={{
            position: "relative",
            width: "min(78vw, 380px)",
            aspectRatio: "9 / 16",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2,
          }}
        >
          {/* Soft outer halo aura behind the shield — pulses every ~2s */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "38%",
              left: "50%",
              width: "82%",
              aspectRatio: "1 / 1",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(0,255,150,0.50) 0%, rgba(255,200,60,0.28) 35%, rgba(168,80,255,0.10) 60%, rgba(0,0,0,0) 78%)",
              transform: "translate(-50%, -50%)",
              animation: "guber-loading-halo-pulse 2.2s ease-in-out infinite",
              willChange: "opacity, filter, transform",
            }}
          />

          {/* Shield + panda cluster, scaled relative to the framing column.
              The shield SVG sits behind the panda; the panda is positioned
              inside the shield's upper body. Both share a subtle pulse so
              the whole emblem reads as one glowing crest. */}
          <div
            data-testid="loading-shield"
            style={{
              position: "relative",
              width: "78%",
              aspectRatio: "5 / 6",
              animation: "guber-loading-panda-pulse 2.2s ease-in-out infinite",
              willChange: "filter",
            }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 100 120"
              preserveAspectRatio="xMidYMid meet"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                overflow: "visible",
              }}
            >
              <defs>
                {/* Linear gradient for the shield stroke: green → gold → purple,
                    matching the splash palette. */}
                <linearGradient id="guber-shield-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00FF96" />
                  <stop offset="55%" stopColor="#FFC83C" />
                  <stop offset="100%" stopColor="#A850FF" />
                </linearGradient>
                {/* Radial gradient for the inner shield fill — keeps the
                    interior dark so the panda still pops, but adds a soft
                    green wash. */}
                <radialGradient id="guber-shield-fill" cx="50%" cy="42%" r="62%">
                  <stop offset="0%" stopColor="rgba(0,255,150,0.08)" />
                  <stop offset="60%" stopColor="rgba(0,0,0,0.78)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0.92)" />
                </radialGradient>
              </defs>
              {/* Heater shield silhouette */}
              <path
                d="M10 8 L90 8 L90 56 Q90 96 50 116 Q10 96 10 56 Z"
                fill="url(#guber-shield-fill)"
                stroke="url(#guber-shield-stroke)"
                strokeWidth="2.4"
                strokeLinejoin="round"
                style={{
                  filter:
                    "drop-shadow(0 0 4px rgba(0,255,150,0.85)) drop-shadow(0 0 10px rgba(0,255,150,0.55)) drop-shadow(0 0 22px rgba(255,200,60,0.40)) drop-shadow(0 0 36px rgba(168,80,255,0.30))",
                }}
              />
              {/* Inner accent line for extra neon depth */}
              <path
                d="M16 14 L84 14 L84 55 Q84 91 50 109 Q16 91 16 55 Z"
                fill="none"
                stroke="rgba(0,255,150,0.55)"
                strokeWidth="0.8"
                strokeLinejoin="round"
                style={{
                  filter: "drop-shadow(0 0 3px rgba(0,255,150,0.70))",
                }}
              />
            </svg>

            {/* The panda mascot, positioned inside the shield's upper body */}
            <img
              src={PANDA_SRC}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                top: "16%",
                left: "50%",
                transform: "translateX(-50%)",
                width: "62%",
                height: "auto",
                objectFit: "contain",
                userSelect: "none",
                filter:
                  "drop-shadow(0 0 4px rgba(0,255,150,0.65)) drop-shadow(0 0 10px rgba(0,255,150,0.35))",
              }}
              data-testid="img-loading-panda"
            />
          </div>

          {/* Rotating message slot — fixed height to prevent layout jump.
              aria-hidden because the parent already announces "Loading"; we
              don't want screen readers to re-announce a new slogan every cycle. */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: "8%",
              minHeight: "72px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              opacity: slideOpacity,
              transition: slideTransition,
              padding: "0 16px",
              textAlign: "center",
            }}
            data-testid="text-loading-message"
          >
            {slide?.kind === "solo" ? (
              <p
                style={{
                  margin: 0,
                  fontFamily: "'Bebas Neue', 'Inter', sans-serif",
                  fontWeight: 700,
                  fontSize: "clamp(28px, 7vw, 44px)",
                  letterSpacing: "0.06em",
                  lineHeight: 1.05,
                  color: "#E6FFE9",
                  textShadow:
                    "0 0 8px rgba(0,255,150,0.85), 0 0 18px rgba(0,255,150,0.45), 0 0 32px rgba(255,200,60,0.30)",
                }}
              >
                {slide.line}
              </p>
            ) : slide?.kind === "pair" ? (
              <>
                <p
                  style={{
                    margin: 0,
                    fontFamily: "'Bebas Neue', 'Inter', sans-serif",
                    fontWeight: 700,
                    fontSize: "clamp(24px, 6vw, 36px)",
                    letterSpacing: "0.06em",
                    lineHeight: 1.05,
                    color: "#E6FFE9",
                    textShadow:
                      "0 0 8px rgba(0,255,150,0.80), 0 0 18px rgba(0,255,150,0.40)",
                  }}
                >
                  {slide.lines[0]}
                </p>
                <p
                  style={{
                    margin: "6px 0 0 0",
                    fontFamily: "'Bebas Neue', 'Inter', sans-serif",
                    fontWeight: 700,
                    fontSize: "clamp(24px, 6vw, 36px)",
                    letterSpacing: "0.06em",
                    lineHeight: 1.05,
                    color: "#FFE7A8",
                    textShadow:
                      "0 0 8px rgba(255,200,60,0.80), 0 0 18px rgba(255,200,60,0.45), 0 0 32px rgba(168,80,255,0.20)",
                  }}
                >
                  {slide.lines[1]}
                </p>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Hook variant for callers that want to imperatively show/hide the splash
 * (e.g. wrapping a fetch). Mirrors the useNavigationCover pattern.
 *
 * Example:
 *   const { splash, show, hide } = useLoadingSplash();
 *   const handleClick = async () => {
 *     show();
 *     try { await doWork(); } finally { hide(); }
 *   };
 *   return <>{splash}{button}</>;
 */
export function useLoadingSplash(opts?: { minVisibleMs?: number }) {
  const [loading, setLoading] = useState(false);
  const splash = (
    <LoadingSplash
      loading={loading}
      minVisibleMs={opts?.minVisibleMs}
    />
  );
  return {
    splash,
    show: () => setLoading(true),
    hide: () => setLoading(false),
    isLoading: loading,
  };
}
