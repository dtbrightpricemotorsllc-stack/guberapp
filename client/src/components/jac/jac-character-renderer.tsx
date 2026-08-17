/**
 * JacCharacterRenderer
 *
 * Persistent animated 2-D character. The same image stays on screen
 * at all times. Only CSS animation class + canvas mouth overlay change.
 *
 * States
 *   idle        — slow breathe + random blink
 *   listening   — forward lean, cyan floor glow, small waveform
 *   thinking    — drift, purple glow, 3 pulsing dots near forehead
 *   speaking    — energetic pulse, animated mouth canvas, white/purple glow
 *   interrupted — immediate snap to listening posture
 */

import { useEffect, useRef } from "react";

export type JacState = "idle" | "listening" | "thinking" | "speaking" | "interrupted";

interface Props {
  state: JacState;
  /** Rendered height in px. Width scales proportionally. */
  heightPx?: number;
  className?: string;
}

// ── Measured from char-jac-v2.png (574 × 1046 RGBA) ─────────────────────────
const MOUTH_X_PCT = 0.571;   // mouth center-x as fraction of image width
const MOUTH_Y_PCT = 0.296;   // mouth center-y as fraction of image height
const MOUTH_W_PCT = 0.190;   // mouth width as fraction of image width

// ── CSS keyframes (injected once) ────────────────────────────────────────────
const CSS = `
@keyframes jac-breathe {
  0%,100% { transform: translateY(0px) scale(1); }
  50%      { transform: translateY(-7px) scale(1.008); }
}
@keyframes jac-listen-lean {
  0%,100% { transform: translateY(-2px) scale(1.014) rotate(-0.4deg); }
  50%      { transform: translateY(-6px) scale(1.018) rotate(0.4deg); }
}
@keyframes jac-think-drift {
  0%,100% { transform: translateY(0px) rotate(0deg); }
  30%     { transform: translateY(-5px) rotate(-1.4deg); }
  70%     { transform: translateY(-7px) rotate(1deg); }
}
@keyframes jac-speak-pulse {
  0%,100% { transform: translateY(-4px) scale(1.01); }
  25%     { transform: translateY(-9px) scale(1.022) rotate(-0.5deg); }
  75%     { transform: translateY(-3px) scale(1.014) rotate(0.5deg); }
}
@keyframes jac-think-dot {
  0%,100% { opacity: 0.15; transform: translateY(0) scale(0.75); }
  50%     { opacity: 1;    transform: translateY(-4px) scale(1.25); }
}
@keyframes jac-glow-pulse {
  0%,100% { opacity: 0.5; }
  50%     { opacity: 1; }
}
@keyframes jac-listen-ring {
  0%,100% { transform: translateX(-50%) scaleX(1) scaleY(1); opacity: 0.6; }
  50%     { transform: translateX(-50%) scaleX(1.12) scaleY(1.3); opacity: 1; }
}
`;
let _cssInjected = false;
function injectCss() {
  if (_cssInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.textContent = CSS;
  document.head.appendChild(el);
  _cssInjected = true;
}

// ── Per-state animation + glow ────────────────────────────────────────────────
const ANIM: Record<JacState, string> = {
  idle:        "jac-breathe 4.2s ease-in-out infinite",
  listening:   "jac-listen-lean 3s ease-in-out infinite",
  thinking:    "jac-think-drift 2.4s ease-in-out infinite",
  speaking:    "jac-speak-pulse 0.48s ease-in-out infinite",
  interrupted: "jac-listen-lean 2s ease-in-out infinite",
};

const GLOW: Record<JacState, { color: string; opacity: number }> = {
  idle:        { color: "hsl(270 60% 45%)",   opacity: 0.28 },
  listening:   { color: "hsl(152 100% 44%)",  opacity: 0.55 },
  thinking:    { color: "hsl(270 100% 65%)",  opacity: 0.60 },
  speaking:    { color: "hsl(270 100% 78%)",  opacity: 0.75 },
  interrupted: { color: "hsl(152 100% 44%)",  opacity: 0.55 },
};

export function JacCharacterRenderer({ state, heightPx = 420, className = "" }: Props) {
  injectCss();

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const blinkElRef = useRef<HTMLDivElement>(null);
  const rafRef     = useRef<number>(0);
  const ampRef     = useRef(0);
  const velRef     = useRef(0);
  const phaseRef   = useRef(0);

  // ── Blink loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    function next() {
      const delay = 2800 + Math.random() * 3500;
      timeout = setTimeout(() => {
        const el = blinkElRef.current;
        if (el) {
          el.style.opacity = "1";
          setTimeout(() => { if (blinkElRef.current) blinkElRef.current.style.opacity = "0"; }, 110);
        }
        next();
      }, delay);
    }
    next();
    return () => clearTimeout(timeout);
  }, []);

  // ── Mouth canvas (speaking only) ──────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (state !== "speaking") {
      cancelAnimationFrame(rafRef.current);
      ampRef.current = 0;
      velRef.current = 0;
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // Multi-frequency oscillator → speech-like amplitude envelope
    const FREQS = [3.1, 5.7, 8.3, 11.2, 2.3];
    const MAGS  = [0.42, 0.28, 0.14, 0.10, 0.06];
    let lastT = performance.now();

    function tick(now: number) {
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      phaseRef.current += dt;

      let osc = 0;
      for (let i = 0; i < FREQS.length; i++) {
        osc += MAGS[i] * Math.sin(2 * Math.PI * FREQS[i] * phaseRef.current);
      }
      const target = Math.max(0, osc);

      // Spring: k=22, b=8
      const err = target - ampRef.current;
      velRef.current += (22 * err - 8 * velRef.current) * dt;
      ampRef.current += velRef.current * dt;
      ampRef.current  = Math.max(0, Math.min(1, ampRef.current));

      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const amp = ampRef.current;
        if (amp >= 0.02) {
          const cx = MOUTH_X_PCT * canvas.width;
          const cy = MOUTH_Y_PCT * canvas.height;
          const mw = MOUTH_W_PCT * canvas.width;
          const oh = amp * mw * 0.52;   // open height

          ctx.save();
          ctx.shadowColor = "hsl(270 100% 78% / 0.7)";
          ctx.shadowBlur  = 10;

          // Upper lip
          ctx.beginPath();
          ctx.ellipse(cx, cy - oh * 0.38, mw * 0.48, Math.max(2.5, oh * 0.17), 0, 0, Math.PI * 2);
          ctx.fillStyle = "hsl(342 58% 54%)";
          ctx.fill();

          // Lower lip
          ctx.beginPath();
          ctx.ellipse(cx, cy + oh * 0.52, mw * 0.50, Math.max(2.5, oh * 0.21), 0, 0, Math.PI * 2);
          ctx.fillStyle = "hsl(342 52% 44%)";
          ctx.fill();

          // Interior
          if (oh > 4) {
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.ellipse(cx, cy + oh * 0.06, mw * 0.40, oh * 0.52, 0, 0, Math.PI);
            ctx.fillStyle = "hsl(240 35% 9%)";
            ctx.fill();
          }
          ctx.restore();
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [state]);

  const glow = GLOW[state];
  const showThinkingDots = state === "thinking";
  const showListenRing   = state === "listening" || state === "interrupted";

  return (
    <div
      className={`relative select-none ${className}`}
      style={{
        height: heightPx,
        display: "inline-flex",
        alignItems: "flex-end",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {/* Ambient glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `radial-gradient(ellipse 75% 85% at 50% 85%, ${glow.color} / ${glow.opacity}, transparent 70%)`,
          filter: "blur(28px)",
          animation: "jac-glow-pulse 2.2s ease-in-out infinite",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Listening floor ring */}
      {showListenRing && (
        <div
          style={{
            position: "absolute",
            bottom: "1%",
            left: "50%",
            width: "55%",
            height: 16,
            background: "radial-gradient(ellipse, hsl(152 100% 44% / 0.55), transparent 72%)",
            borderRadius: "50%",
            filter: "blur(6px)",
            animation: "jac-listen-ring 1.4s ease-in-out infinite",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}

      {/* JAC character image */}
      <img
        src="/splash/char-jac-v2.png"
        alt="JAC"
        draggable={false}
        style={{
          height: "100%",
          width: "auto",
          objectFit: "contain",
          objectPosition: "bottom",
          animation: ANIM[state],
          position: "relative",
          zIndex: 1,
          willChange: "transform",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      />

      {/* Canvas mouth overlay (natural pixel dimensions → scales via CSS) */}
      <canvas
        ref={canvasRef}
        width={574}
        height={1046}
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          height: "100%",
          width: "auto",
          pointerEvents: "none",
          zIndex: 2,
          opacity: state === "speaking" ? 1 : 0,
          transition: "opacity 0.15s ease",
        }}
      />

      {/* Blink overlay */}
      <div
        ref={blinkElRef}
        style={{
          position: "absolute",
          top: "13.5%",
          left: "50%",
          transform: "translateX(-46%)",
          width: "38%",
          height: "3.5%",
          background: "linear-gradient(180deg, hsl(222 47% 5%) 50%, transparent)",
          borderRadius: "0 0 50% 50%",
          opacity: 0,
          transition: "opacity 0.06s linear",
          pointerEvents: "none",
          zIndex: 3,
        }}
      />

      {/* Thinking dots */}
      {showThinkingDots && (
        <div
          style={{
            position: "absolute",
            top: "27%",
            left: "57%",
            display: "flex",
            gap: 5,
            zIndex: 4,
          }}
        >
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "hsl(270 100% 72%)",
                animation: `jac-think-dot 1.1s ease-in-out infinite ${i * 0.22}s`,
                boxShadow: "0 0 8px hsl(270 100% 65% / 0.8)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
