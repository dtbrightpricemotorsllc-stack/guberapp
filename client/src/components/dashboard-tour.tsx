import { useState, useEffect, useRef, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";

// ─── localStorage helpers ─────────────────────────────────────────────────────
const TOUR_KEY = "guber_tour_v2_complete";

export function isTourComplete() {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(TOUR_KEY) === "true";
}
export function resetTour() {
  localStorage.removeItem(TOUR_KEY);
  localStorage.removeItem("guber_tour_step");
}

// ─── Steps (6 tiles → HIRE → WORK) ──────────────────────────────────────────
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
    desc: "Tap HIRE when you need help. Post jobs, browse local workers, and manage requests. Blue means you're hiring.",
    phase: "mode",
    mode: "hire" as const,
    radius: 20,
  },
  {
    testId: "button-work-mode",
    title: "WORK Mode 🟢",
    desc: "Tap WORK when you're ready to earn. Browse open jobs, clock in, and get paid locally. Green means you're working.",
    phase: "mode",
    mode: "work" as const,
    radius: 20,
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface DashboardTourProps {
  accountType: string;
  onComplete: () => void;
  onModeChange?: (mode: "hire" | "work") => void;
}

interface SpotRect {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
  radius: number;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function DashboardTour({ accountType, onComplete, onModeChange }: DashboardTourProps) {
  const [step, setStep] = useState(0);
  const [showFinal, setShowFinal] = useState(false);
  const [spotRect, setSpotRect] = useState<SpotRect | null>(null);
  const completeFnRef = useRef<((mode?: string) => void) | null>(null);

  const current = STEPS[step];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const PAD = 10;

  // ── completeTour — just unmounts the overlay, no reload ──────────────────
  const completeTour = useCallback((mode?: string) => {
    localStorage.setItem(TOUR_KEY, "true");
    apiRequest("POST", "/api/users/me/onboarding-complete", {
      onboardingType: accountType,
    }).catch(() => {});
    if (mode && onModeChange) onModeChange(mode as "hire" | "work");
    onComplete();
  }, [accountType, onModeChange, onComplete]);

  // keep ref in sync so event listeners can call latest version
  useEffect(() => { completeFnRef.current = completeTour; }, [completeTour]);

  // ── Lock user scroll ──────────────────────────────────────────────────────
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    document.addEventListener("touchmove", block, { passive: false });
    document.addEventListener("wheel", block, { passive: false });
    return () => {
      document.removeEventListener("touchmove", block);
      document.removeEventListener("wheel", block);
    };
  }, []);

  // ── Measure spotlight for regular steps ──────────────────────────────────
  useEffect(() => {
    if (showFinal) return;
    setSpotRect(null);

    const snap = () => {
      const el = document.querySelector(
        `[data-testid="${current.testId}"]`
      ) as HTMLElement | null;
      if (!el) return false;

      // Scroll element to center of viewport (works with any scroll container)
      el.scrollIntoView({ behavior: "smooth", block: "center" });

      setTimeout(() => {
        const r2 = el.getBoundingClientRect();
        setSpotRect({
          top: r2.top - PAD,
          left: r2.left - PAD,
          bottom: r2.bottom + PAD,
          right: r2.right + PAD,
          width: r2.width + PAD * 2,
          height: r2.height + PAD * 2,
          radius: current.radius,
        });
      }, 500);
      return true;
    };

    if (!snap()) {
      const t = setTimeout(snap, 250);
      return () => clearTimeout(t);
    }
  }, [step, showFinal]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mode switch side-effect ───────────────────────────────────────────────
  useEffect(() => {
    if (current.phase === "mode" && current.mode && onModeChange) {
      onModeChange(current.mode);
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Final screen: scroll to top and measure both toggle buttons ───────────
  useEffect(() => {
    if (!showFinal) return;
    setSpotRect(null);

    const hEl = document.querySelector('[data-testid="button-hire-mode"]') as HTMLElement | null;
    if (hEl) hEl.scrollIntoView({ behavior: "smooth", block: "center" });

    const snap = () => {
      const hEl2 = document.querySelector('[data-testid="button-hire-mode"]');
      const wEl = document.querySelector('[data-testid="button-work-mode"]');
      if (!hEl2 || !wEl) return false;
      const hr = hEl2.getBoundingClientRect();
      const wr = wEl.getBoundingClientRect();
      const top = Math.min(hr.top, wr.top) - PAD;
      const left = Math.min(hr.left, wr.left) - PAD;
      const right = Math.max(hr.right, wr.right) + PAD;
      const bottom = Math.max(hr.bottom, wr.bottom) + PAD;
      setSpotRect({ top, left, bottom, right, width: right - left, height: bottom - top, radius: 22 });
      return true;
    };

    const t = setTimeout(() => {
      if (!snap()) setTimeout(snap, 300);
    }, 500);
    return () => clearTimeout(t);
  }, [showFinal]);

  // ── Final screen: wire actual HIRE/WORK button clicks ────────────────────
  useEffect(() => {
    if (!showFinal) return;
    const hireEl = document.querySelector('[data-testid="button-hire-mode"]');
    const workEl = document.querySelector('[data-testid="button-work-mode"]');
    const onHire = () => completeFnRef.current?.("hire");
    const onWork = () => completeFnRef.current?.("work");
    hireEl?.addEventListener("click", onHire);
    workEl?.addEventListener("click", onWork);
    return () => {
      hireEl?.removeEventListener("click", onHire);
      workEl?.removeEventListener("click", onWork);
    };
  }, [showFinal]);

  // ── NEXT handler ──────────────────────────────────────────────────────────
  const handleNext = () => {
    const next = step + 1;
    if (next >= STEPS.length) {
      setShowFinal(true);
    } else {
      setStep(next);
    }
  };

  // ── Derived spotlight geometry ────────────────────────────────────────────
  const sTop = spotRect?.top ?? 0;
  const sLeft = spotRect?.left ?? 0;
  const sBottom = spotRect?.bottom ?? vh;
  const sRight = spotRect?.right ?? vw;
  const sW = sRight - sLeft;
  const sH = sBottom - sTop;
  const sRadius = spotRect?.radius ?? 18;

  // ── Tooltip card position: prefer below, fall back to above ───────────────
  const CARD_H = 220;
  const CARD_MARGIN = 14;
  const SKIP_H = 44;
  const spaceBelow = vh - sBottom - CARD_MARGIN - SKIP_H;
  const spaceAbove = sTop - CARD_MARGIN;
  const cardBelow = spaceBelow >= CARD_H || spaceBelow >= spaceAbove;
  const cardTop = cardBelow ? sBottom + CARD_MARGIN : undefined;
  const cardBottom = !cardBelow ? vh - sTop + CARD_MARGIN : undefined;

  const DARK = "rgba(0,0,0,0.88)";

  // ─────────────────────────────────────────────────────────────────────────
  // FINAL SCREEN — both toggles spotlighted, card below, actual btns clickable
  // ─────────────────────────────────────────────────────────────────────────
  if (showFinal) {
    return (
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9999 }}
        data-testid="tour-final-screen"
      >
        {/* Dark visual panels (pointer-events: none — buttons show through) */}
        {spotRect ? (
          <>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: Math.max(0, sTop), background: DARK, pointerEvents: "none", zIndex: 1 }} />
            <div style={{ position: "absolute", top: Math.max(0, sBottom), left: 0, right: 0, bottom: 0, background: DARK, pointerEvents: "none", zIndex: 1 }} />
            <div style={{ position: "absolute", top: sTop, left: 0, width: Math.max(0, sLeft), height: sH, background: DARK, pointerEvents: "none", zIndex: 1 }} />
            <div style={{ position: "absolute", top: sTop, left: sRight, right: 0, height: sH, background: DARK, pointerEvents: "none", zIndex: 1 }} />
            {/* Glow ring */}
            <div style={{ position: "absolute", top: sTop, left: sLeft, width: sW, height: sH, borderRadius: sRadius, border: "1.5px solid rgba(255,255,255,0.4)", boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 0 32px rgba(255,255,255,0.14)", pointerEvents: "none", zIndex: 2 }} />
            {/* Click-blockers OUTSIDE the spotlight only */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: Math.max(0, sTop), pointerEvents: "all", zIndex: 3 }} />
            <div style={{ position: "absolute", top: Math.max(0, sBottom), left: 0, right: 0, bottom: 0, pointerEvents: "all", zIndex: 3 }} />
            <div style={{ position: "absolute", top: sTop, left: 0, width: Math.max(0, sLeft), height: sH, pointerEvents: "all", zIndex: 3 }} />
            <div style={{ position: "absolute", top: sTop, left: sRight, right: 0, height: sH, pointerEvents: "all", zIndex: 3 }} />
          </>
        ) : (
          <div style={{ position: "absolute", inset: 0, background: DARK, zIndex: 1, pointerEvents: "all" }} />
        )}

        {/* Label above spotlight */}
        {spotRect && (
          <div style={{ position: "absolute", top: Math.max(8, sTop - 36), left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 10, pointerEvents: "none" }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.22em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
              tap your mode to begin ↓
            </span>
          </div>
        )}

        {/* Floating question card — below the spotlighted buttons */}
        {spotRect && (
          <div
            style={{
              position: "absolute",
              top: sBottom + 16,
              left: 14,
              right: 14,
              zIndex: 10,
              background: "rgba(6,6,6,0.97)",
              borderRadius: 24,
              padding: "20px 20px 18px",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
              pointerEvents: "all",
            }}
          >
            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.22em", color: "rgba(255,255,255,0.28)", textTransform: "uppercase", marginBottom: 8 }}>
              All done!
            </p>
            <h3 style={{ fontSize: 20, fontWeight: 900, color: "#fff", lineHeight: 1.15, marginBottom: 7, letterSpacing: "-0.01em" }}>
              Where are you starting today?
            </h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.55, marginBottom: 18 }}>
              Tap <strong style={{ color: "hsl(220 70% 75%)" }}>HIRE</strong> or <strong style={{ color: "hsl(152 70% 65%)" }}>WORK</strong> above to jump in — or explore first.
            </p>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
            </div>

            <button
              onClick={() => completeTour()}
              style={{ width: "100%", padding: "14px 20px", borderRadius: 14, cursor: "pointer", background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}
              data-testid="button-tour-explore"
            >
              Would you rather just explore? →
            </button>
          </div>
        )}

        {/* Fallback if rect not yet measured */}
        {!spotRect && (
          <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.3)", borderTopColor: "#22c55e", animation: "spin 0.8s linear infinite" }} />
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REGULAR STEPS (tiles + mode buttons)
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999 }} data-testid="tour-overlay">

      {/* Full-screen transparent click-blocker (z:1) — prevents ALL dashboard taps */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "all" }} />

      {/* Dark visual panels (z:2, pointer-events:none — pure visual) */}
      {spotRect ? (
        <>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: Math.max(0, sTop), background: DARK, pointerEvents: "none", zIndex: 2 }} />
          <div style={{ position: "absolute", top: Math.max(0, sBottom), left: 0, right: 0, bottom: 0, background: DARK, pointerEvents: "none", zIndex: 2 }} />
          <div style={{ position: "absolute", top: sTop, left: 0, width: Math.max(0, sLeft), height: sH, background: DARK, pointerEvents: "none", zIndex: 2 }} />
          <div style={{ position: "absolute", top: sTop, left: sRight, right: 0, height: sH, background: DARK, pointerEvents: "none", zIndex: 2 }} />
          {/* Glow ring */}
          <div style={{ position: "absolute", top: sTop, left: sLeft, width: sW, height: sH, borderRadius: sRadius, border: "1.5px solid rgba(255,255,255,0.32)", boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 0 28px rgba(255,255,255,0.12)", pointerEvents: "none", zIndex: 3 }} />
        </>
      ) : (
        /* No rect yet — full black cover */
        <div style={{ position: "absolute", inset: 0, background: DARK, pointerEvents: "none", zIndex: 2 }} />
      )}

      {/* Progress dots (z:10) */}
      <div style={{ position: "absolute", top: 14, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 5, pointerEvents: "none", zIndex: 10 }}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === step ? 22 : 6,
              height: 6,
              borderRadius: 3,
              background: i === step ? "#22c55e" : "rgba(255,255,255,0.18)",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>

      {/* Floating explanation card — above or below the spotlight (z:10) */}
      {spotRect && (
        <div
          style={{
            position: "absolute",
            top: cardTop,
            bottom: cardBottom,
            left: 14,
            right: 14,
            zIndex: 10,
            pointerEvents: "all",
            background: "rgba(6,6,6,0.97)",
            borderRadius: 24,
            padding: "18px 20px 16px",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          }}
          data-testid="tour-tooltip"
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.22em", color: "rgba(255,255,255,0.28)", textTransform: "uppercase" }}>
              {step + 1} / {STEPS.length}
            </span>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: current.phase === "mode" ? "rgba(34,197,94,0.6)" : "rgba(255,255,255,0.18)" }}>
              {current.phase === "tile" ? "CATEGORY" : "MODE"}
            </span>
          </div>

          <h3 style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginBottom: 6, lineHeight: 1.15, letterSpacing: "-0.01em" }}>
            {current.title}
          </h3>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, marginBottom: 16 }}>
            {current.desc}
          </p>

          <button
            onClick={handleNext}
            style={{ width: "100%", height: 50, borderRadius: 15, background: "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff", fontWeight: 900, fontSize: 14, letterSpacing: "0.1em", border: "none", cursor: "pointer", boxShadow: "0 4px 20px rgba(22,163,74,0.35)" }}
            data-testid="button-tour-next"
          >
            {step < STEPS.length - 1 ? "NEXT →" : "CONTINUE →"}
          </button>
        </div>
      )}

      {/* Loading state — no rect yet */}
      {!spotRect && (
        <div style={{ position: "absolute", bottom: 60, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 10, pointerEvents: "none" }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.25)", borderTopColor: "#22c55e" }} />
        </div>
      )}

      {/* Skip — always at the very bottom (z:10) */}
      <button
        onClick={() => completeTour()}
        style={{
          position: "absolute",
          bottom: 16,
          left: 0,
          right: 0,
          zIndex: 10,
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.25)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.18em",
          cursor: "pointer",
          padding: "8px 0",
          textTransform: "uppercase",
          pointerEvents: "all",
        }}
        data-testid="button-tour-skip"
      >
        skip tutorial
      </button>
    </div>
  );
}
