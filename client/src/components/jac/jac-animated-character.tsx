/**
 * JacAnimatedCharacter
 *
 * Renders JAC as a live interactive character.
 * Four distinct states: idle | listening | thinking | speaking
 *
 * Mouth animation: canvas overlay positioned over the face using measured
 * pixel-data percentages from char-jac-v2.png (574×1046 RGBA).
 *
 * Face skin starts at ~y=17%, mouth/lips at ~y=29%, center x at ~57%.
 *
 * Audio amplitude: spring-physics simulation — no CORS-risky AudioContext
 * tapping needed; simulated amplitude sounds convincingly organic.
 */

import { useEffect, useRef, useCallback } from "react";

// ── Character proportions (measured from char-jac-v2.png 574×1046) ─────────
const MOUTH_Y_PCT  = 0.296;  // 29.6% from top of image
const MOUTH_X_PCT  = 0.571;  // 57.1% from left (face center, slightly right)
const MOUTH_W_PCT  = 0.115;  // 11.5% of image width = mouth half-width
const MOUTH_H_PCT  = 0.008;  // closed height as fraction of image height

// Skin tone sampled from face at y=190-230, x=328 → approx rgb(227,206,180)
const MOUTH_LIP_COLOR   = "rgba(155, 60, 40, 0.85)";  // lips outline
const MOUTH_INNER_COLOR = "rgba(28, 8, 6, 0.92)";      // mouth interior

// ── Spring physics constants ──────────────────────────────────────────────────
const SPRING_STIFFNESS = 180;
const SPRING_DAMPING   = 14;
const MAX_DT = 0.05;

// ── Syllable oscillation (speaking amplitude simulation) ─────────────────────
const SYL_FREQS = [3.4, 7.8, 1.9, 5.1]; // Hz, multiple speech harmonics

export type JacState = "idle" | "listening" | "thinking" | "speaking";

interface SpringState { value: number; velocity: number }

function springStep(s: SpringState, target: number, dt: number): SpringState {
  const clampedDt = Math.min(dt, MAX_DT);
  const force = (target - s.value) * SPRING_STIFFNESS - s.velocity * SPRING_DAMPING;
  const velocity = s.velocity + force * clampedDt;
  const value    = s.value + velocity * clampedDt;
  return { value, velocity };
}

interface Props {
  state:   JacState;
  style?:  React.CSSProperties;
  /** px — used to derive canvas overlay sizes */
  heightPx: number;
}

export function JacAnimatedCharacter({ state, style, heightPx }: Props) {
  const imgRef    = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  // Mutable animation state (not React state — avoids re-renders on RAF)
  const amp    = useRef<SpringState>({ value: 0, velocity: 0 });
  const phaseT = useRef(0);
  const lastTs = useRef(0);
  const stateRef = useRef(state);

  useEffect(() => { stateRef.current = state; }, [state]);

  // ── Canvas animation loop ─────────────────────────────────────────────────
  const draw = useCallback((ts: number) => {
    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }

    const dt = lastTs.current ? Math.min((ts - lastTs.current) / 1000, MAX_DT) : 0.016;
    lastTs.current = ts;

    const curState = stateRef.current;
    const isSpeaking = curState === "speaking";

    // ── Advance oscillator (always running for smooth transitions)
    phaseT.current += dt;
    const t = phaseT.current;

    // Target amplitude: when speaking use multi-freq speech sim
    let target = 0;
    if (isSpeaking) {
      const raw =
        0.40 * Math.sin(2 * Math.PI * SYL_FREQS[0] * t) +
        0.25 * Math.sin(2 * Math.PI * SYL_FREQS[1] * t + 1.1) +
        0.20 * Math.sin(2 * Math.PI * SYL_FREQS[2] * t + 2.3) +
        0.15 * Math.sin(2 * Math.PI * SYL_FREQS[3] * t + 0.7);
      target = Math.max(0, raw);   // clamp — mouth only opens
    }

    amp.current = springStep(amp.current, target, dt);
    const a = Math.max(0, amp.current.value);

    // ── Draw to canvas
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

    ctx.clearRect(0, 0, w, h);

    // Only draw when there's something to show (perf: skip if amplitude tiny)
    if (a < 0.01 && !isSpeaking) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    // Mouth center in canvas coords
    const mx = w * MOUTH_X_PCT;
    const my = h * MOUTH_Y_PCT;
    const mw = w * MOUTH_W_PCT;           // half-width of mouth
    const mhBase = h * MOUTH_H_PCT;       // minimum mouth height (closed)
    const mhOpen = mhBase + a * h * 0.038; // max adds ~3.8% of image height

    // Draw mouth interior (inner dark fill)
    ctx.beginPath();
    ctx.ellipse(mx, my + mhOpen * 0.5, mw, Math.max(mhBase, mhOpen), 0, 0, Math.PI * 2);
    ctx.fillStyle = MOUTH_INNER_COLOR;
    ctx.fill();

    // Draw lip outline (subtle)
    if (mhOpen > mhBase * 1.4) {
      ctx.beginPath();
      ctx.ellipse(mx, my + mhOpen * 0.5, mw + 2, mhOpen + 3, 0, 0, Math.PI * 2);
      ctx.strokeStyle = MOUTH_LIP_COLOR;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // ── LISTENING: soft cyan inner-glow on face region
    if (curState === "listening") {
      const grad = ctx.createRadialGradient(mx, my - h * 0.06, 0, mx, my - h * 0.06, w * 0.25);
      grad.addColorStop(0, "rgba(0,220,190,0.08)");
      grad.addColorStop(1, "rgba(0,220,190,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // ── THINKING: pulsing purple dot cluster near forehead
    if (curState === "thinking") {
      const thinkPulse = 0.5 + 0.5 * Math.sin(t * 4.2);
      const dotY = my - h * 0.09;
      for (let i = 0; i < 3; i++) {
        const ox = (i - 1) * w * 0.04;
        const delay = i * 0.3;
        const pulse = 0.4 + 0.6 * Math.sin(t * 4.2 + delay);
        ctx.beginPath();
        ctx.arc(mx + ox, dotY, w * 0.018, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(140,80,255,${pulse * 0.7})`;
        ctx.fill();
      }
      // Subtle glow
      const g2 = ctx.createRadialGradient(mx, dotY, 0, mx, dotY, w * 0.18);
      g2.addColorStop(0, `rgba(120,60,255,${thinkPulse * 0.12})`);
      g2.addColorStop(1, "rgba(120,60,255,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);
    }

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // ── Resize canvas when heightPx changes ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;
    // Keep canvas dimensions proportional to rendered image
    const scale = heightPx / 1046;
    canvas.width  = Math.round(574 * scale);
    canvas.height = heightPx;
  }, [heightPx]);

  // ── CSS animation class per state ─────────────────────────────────────────
  const bodyAnim =
    state === "speaking"  ? "jac-talk 0.58s ease-in-out infinite"   :
    state === "listening" ? "jac-listen 3.0s ease-in-out infinite"  :
    state === "thinking"  ? "jac-think 2.4s ease-in-out infinite"   :
    /* idle */              "jac-idle 4.2s ease-in-out infinite";

  const blinkAnim =
    state === "speaking"  ? "jac-blink 2.8s ease-in-out infinite 0.6s" :
    state === "thinking"  ? "jac-blink 4.0s ease-in-out infinite 1.2s" :
    "jac-blink 5.5s ease-in-out infinite 2.0s";

  const bodyFilter =
    state === "speaking"
      ? "drop-shadow(0 0 22px rgba(130,70,255,.85)) drop-shadow(0 0 44px rgba(0,170,255,.5)) drop-shadow(0 8px 28px rgba(0,0,0,.7))"
      : state === "listening"
      ? "drop-shadow(0 0 14px rgba(0,200,180,.6)) drop-shadow(0 8px 28px rgba(0,0,0,.7))"
      : "drop-shadow(0 8px 28px rgba(0,0,0,.7))";

  return (
    <div style={{ position: "relative", display: "inline-block", ...style }}>
      {/* Base character image */}
      <img
        ref={imgRef}
        src="/splash/char-jac-v2.png"
        alt="JAC — Team GUBER AI Coordinator"
        draggable={false}
        style={{
          display:  "block",
          height:   heightPx,
          width:    "auto",
          objectFit:"contain",
          userSelect:"none",
          animation:`${bodyAnim}, ${blinkAnim}`,
          filter:   bodyFilter,
          transition:"filter 700ms ease",
          willChange:"transform, filter",
        }}
      />

      {/* Canvas mouth/expression overlay — exactly the same size */}
      <canvas
        ref={canvasRef}
        width={Math.round(574 * (heightPx / 1046))}
        height={heightPx}
        style={{
          position:      "absolute",
          top:           0,
          left:          0,
          pointerEvents: "none",
          imageRendering:"crisp-edges",
        }}
      />
    </div>
  );
}
