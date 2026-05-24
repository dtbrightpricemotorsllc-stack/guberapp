import { useState, useEffect, useRef, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";

// ─── localStorage helpers ─────────────────────────────────────────────────────
export function isTourComplete() {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem("guber_tour_complete") === "true";
}
export function resetTour() {
  localStorage.removeItem("guber_tour_complete");
  localStorage.removeItem("guber_tour_step");
}

// ─── Steps ────────────────────────────────────────────────────────────────────
const STEPS = [
  {
    testId: "card-category-on-demand-help",
    title: "On-Demand Help",
    desc: "Need something done today? Post a quick task and get matched with available locals near you in minutes.",
    phase: "tile",
    radius: 18,
  },
  {
    testId: "card-category-skilled-labor",
    title: "Skilled Labor",
    desc: "Find licensed pros for specialized work — plumbing, electrical, carpentry, and more.",
    phase: "tile",
    radius: 18,
  },
  {
    testId: "card-category-general-labor",
    title: "General Labor",
    desc: "Everyday tasks, yard work, moving help — reliable locals ready to get it done fast.",
    phase: "tile",
    radius: 18,
  },
  {
    testId: "card-category-verify-inspect",
    title: "Verify & Inspect",
    desc: "Book a verified local to take photos, check on assets, or inspect a property on your behalf.",
    phase: "tile",
    radius: 18,
  },
  {
    testId: "card-category-marketplace",
    title: "Marketplace",
    desc: "Buy, sell, and verify local items. Every listing can be backed by a real local on the ground.",
    phase: "tile",
    radius: 18,
  },
  {
    testId: "card-category-barter-labor",
    title: "Barter Labor",
    desc: "No cash? No problem. Trade your skills with locals — swap services and build community.",
    phase: "tile",
    radius: 18,
  },
  {
    testId: "button-hire-mode",
    title: "HIRE Mode 🔵",
    desc: "Tap HIRE when you need help. Post jobs, browse local workers, and manage all requests. Blue = you're hiring.",
    phase: "mode",
    mode: "hire" as const,
    radius: 22,
  },
  {
    testId: "button-work-mode",
    title: "WORK Mode 🟢",
    desc: "Tap WORK when you're ready to earn. Browse open jobs, clock in, and get paid locally. Green = you're working.",
    phase: "mode",
    mode: "work" as const,
    radius: 22,
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────
interface DashboardTourProps {
  accountType: string;
  onModeChange?: (mode: "hire" | "work") => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function DashboardTour({ accountType, onModeChange }: DashboardTourProps) {
  const [step, setStep] = useState(0);
  const [showFinal, setShowFinal] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const preventFnRef = useRef<((e: Event) => void) | null>(null);

  const current = STEPS[step];

  // ── Lock user scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = (e: Event) => e.preventDefault();
    preventFnRef.current = fn;
    document.addEventListener("touchmove", fn, { passive: false });
    document.addEventListener("wheel", fn, { passive: false });
    return () => {
      document.removeEventListener("touchmove", fn);
      document.removeEventListener("wheel", fn);
    };
  }, []);

  // ── Scroll to target + measure its rect ────────────────────────────────────
  useEffect(() => {
    if (showFinal) return;
    setTargetRect(null);

    const doMeasure = () => {
      const el = document.querySelector(`[data-testid="${current.testId}"]`) as HTMLElement | null;
      if (!el) return false;

      const r = el.getBoundingClientRect();
      // Card height ~230px; keep element in upper 55% of screen
      const cardH = 240;
      const desiredTop = (window.innerHeight - cardH) * 0.30;
      const scrollTarget = window.scrollY + r.top - desiredTop;
      window.scrollTo({ top: Math.max(0, scrollTarget), behavior: "smooth" });

      setTimeout(() => {
        setTargetRect(el.getBoundingClientRect());
      }, 420);
      return true;
    };

    if (!doMeasure()) {
      const t = setTimeout(doMeasure, 250);
      return () => clearTimeout(t);
    }
  }, [step, showFinal, current?.testId]);

  // ── Mode switch side-effect ─────────────────────────────────────────────────
  useEffect(() => {
    if (current?.phase === "mode" && current.mode && onModeChange) {
      onModeChange(current.mode);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Complete tour ──────────────────────────────────────────────────────────
  const completeTour = useCallback((mode?: string) => {
    localStorage.setItem("guber_tour_complete", "true");
    apiRequest("POST", "/api/users/me/onboarding-complete", {
      onboardingType: accountType,
    }).catch(() => {});
    if (mode && onModeChange) onModeChange(mode as "hire" | "work");
    window.location.reload();
  }, [accountType, onModeChange]);

  const handleNext = () => {
    const next = step + 1;
    if (next >= STEPS.length) {
      setShowFinal(true);
    } else {
      setStep(next);
    }
  };

  // ── Final screen ───────────────────────────────────────────────────────────
  if (showFinal) {
    return (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.94)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "0 24px",
        }}
        data-testid="tour-final-screen"
      >
        <div style={{ width: "100%", maxWidth: 360 }}>
          <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.25em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", textAlign: "center", marginBottom: 14 }}>
            You're all set!
          </p>
          <h2 style={{ fontSize: 27, fontWeight: 900, color: "#fff", textAlign: "center", lineHeight: 1.15, marginBottom: 8, letterSpacing: "-0.02em" }}>
            Where are you<br />starting today?
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center", marginBottom: 32, lineHeight: 1.5 }}>
            Pick your mode — you can switch anytime.
          </p>

          {/* HIRE / WORK choice */}
          <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
            <button
              onClick={() => completeTour("hire")}
              style={{
                flex: 1, padding: "22px 14px", borderRadius: 22, cursor: "pointer", outline: "none",
                background: "linear-gradient(135deg,hsl(220 60% 18%),hsl(220 70% 12%))",
                border: "2px solid rgba(59,130,246,0.75)",
                boxShadow: "0 0 24px rgba(59,130,246,0.28)",
              }}
              data-testid="button-tour-hire"
            >
              <div style={{ color: "hsl(220 70% 78%)", fontSize: 14, fontWeight: 900, letterSpacing: "0.18em", marginBottom: 6 }}>HIRE</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, lineHeight: 1.4 }}>Post jobs &amp; get help</div>
            </button>
            <button
              onClick={() => completeTour("work")}
              style={{
                flex: 1, padding: "22px 14px", borderRadius: 22, cursor: "pointer", outline: "none",
                background: "linear-gradient(135deg,hsl(142 60% 10%),hsl(152 70% 8%))",
                border: "2px solid rgba(34,197,94,0.75)",
                boxShadow: "0 0 24px rgba(34,197,94,0.28)",
              }}
              data-testid="button-tour-work"
            >
              <div style={{ color: "hsl(152 70% 70%)", fontSize: 14, fontWeight: 900, letterSpacing: "0.18em", marginBottom: 6 }}>WORK</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, lineHeight: 1.4 }}>Find jobs &amp; earn</div>
            </button>
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
          </div>

          {/* Just explore */}
          <button
            onClick={() => completeTour()}
            style={{
              width: "100%", padding: "15px 20px", borderRadius: 16, cursor: "pointer",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em",
            }}
            data-testid="button-tour-explore"
          >
            Just explore the app →
          </button>
        </div>
      </div>
    );
  }

  // ── Spotlight geometry ─────────────────────────────────────────────────────
  const pad = 10;
  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  const sTop = targetRect ? Math.max(0, targetRect.top - pad) : 0;
  const sBottom = targetRect ? Math.min(vh, targetRect.bottom + pad) : vh;
  const sLeft = targetRect ? Math.max(0, targetRect.left - pad) : 0;
  const sRight = targetRect ? Math.min(vw, targetRect.right + pad) : vw;
  const sW = sRight - sLeft;
  const sH = sBottom - sTop;
  const sRadius = current?.radius ?? 18;

  const dark = "rgba(0,0,0,0.88)";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999 }} data-testid="tour-overlay">

      {/* ── 4 dark panels around spotlight ────────────────────────────────── */}
      {targetRect ? (
        <>
          {/* Top panel */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: sTop, background: dark, pointerEvents: "all" }} />
          {/* Bottom panel */}
          <div style={{ position: "absolute", top: sBottom, left: 0, right: 0, bottom: 0, background: dark, pointerEvents: "all" }} />
          {/* Left panel */}
          <div style={{ position: "absolute", top: sTop, left: 0, width: sLeft, height: sH, background: dark, pointerEvents: "all" }} />
          {/* Right panel */}
          <div style={{ position: "absolute", top: sTop, left: sRight, right: 0, height: sH, background: dark, pointerEvents: "all" }} />
          {/* Spotlight border glow */}
          <div style={{
            position: "absolute", top: sTop, left: sLeft,
            width: sW, height: sH,
            borderRadius: sRadius,
            border: "1.5px solid rgba(255,255,255,0.3)",
            boxShadow: "0 0 0 1.5px rgba(255,255,255,0.08), 0 0 28px rgba(255,255,255,0.1)",
            pointerEvents: "none",
          }} />
          {/* Click blocker over spotlight (tile is visible but not tappable) */}
          <div style={{
            position: "absolute", top: sTop, left: sLeft,
            width: sW, height: sH,
            borderRadius: sRadius,
            pointerEvents: "all",
            cursor: "default",
          }} />
        </>
      ) : (
        <div style={{ position: "absolute", inset: 0, background: dark, pointerEvents: "all" }} />
      )}

      {/* ── Step progress dots (top) ───────────────────────────────────────── */}
      <div style={{
        position: "absolute", top: 14, left: 0, right: 0,
        display: "flex", justifyContent: "center", gap: 5,
        pointerEvents: "none",
      }}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === step ? 20 : 6,
              height: 6,
              borderRadius: 3,
              background: i === step ? "#22c55e" : "rgba(255,255,255,0.18)",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>

      {/* ── Bottom explanation card ────────────────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "0 14px 28px",
        pointerEvents: "all",
      }}>
        <div style={{
          background: "rgba(6,6,6,0.97)",
          borderRadius: 26,
          padding: "20px 20px 18px",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 -10px 50px rgba(0,0,0,0.6)",
        }}>
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.22em", color: "rgba(255,255,255,0.28)", textTransform: "uppercase" }}>
              {step + 1} / {STEPS.length}
            </span>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.18em", color: current.phase === "mode" ? "rgba(34,197,94,0.6)" : "rgba(255,255,255,0.2)", textTransform: "uppercase" }}>
              {current.phase === "tile" ? "CATEGORY" : "MODE TOGGLE"}
            </span>
          </div>

          <h3 style={{ fontSize: 21, fontWeight: 900, color: "#fff", marginBottom: 7, lineHeight: 1.15, letterSpacing: "-0.01em" }}>
            {current.title}
          </h3>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, marginBottom: 18 }}>
            {current.desc}
          </p>

          <button
            onClick={handleNext}
            style={{
              width: "100%", height: 52, borderRadius: 16,
              background: "linear-gradient(135deg,#16a34a,#15803d)",
              color: "#fff", fontWeight: 900, fontSize: 14,
              letterSpacing: "0.1em", border: "none", cursor: "pointer",
              boxShadow: "0 4px 22px rgba(22,163,74,0.38)",
            }}
            data-testid="button-tour-next"
          >
            {step < STEPS.length - 1 ? "NEXT →" : "CONTINUE →"}
          </button>
        </div>

        {/* Skip */}
        <button
          onClick={() => completeTour()}
          style={{
            width: "100%", marginTop: 10,
            background: "transparent", border: "none",
            color: "rgba(255,255,255,0.25)", fontSize: 11,
            fontWeight: 700, letterSpacing: "0.18em",
            cursor: "pointer", padding: "8px 0",
            textTransform: "uppercase",
          }}
          data-testid="button-tour-skip"
        >
          skip tutorial
        </button>
      </div>
    </div>
  );
}
