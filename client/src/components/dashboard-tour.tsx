import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { X, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ─── localStorage helpers ────────────────────────────────────────────────────
export function isTourComplete() {
  return localStorage.getItem("guber_tour_complete") === "true";
}
export function resetTour() {
  localStorage.removeItem("guber_tour_complete");
  localStorage.removeItem("guber_tour_step");
}

// ─── Tour step definitions ────────────────────────────────────────────────────

interface TourStep {
  id: string;
  targetTestId: string;
  title: string;
  body: string;
  position: "top" | "bottom" | "center";
  requireTap?: boolean;      // user must tap the highlighted element to advance
  autoAdvanceMs?: number;    // auto-advance after N ms
}

const INDIVIDUAL_STEPS: TourStep[] = [
  {
    id: "work",
    targetTestId: "button-work-mode",
    title: "WORK",
    body: "Find local opportunities and earn money. Toggle yourself available and start accepting jobs.",
    position: "bottom",
    requireTap: true,
  },
  {
    id: "work-revealed",
    targetTestId: "card-mode-action-work",
    title: "WORK = Earn Money",
    body: "Find jobs, earn, and build your reputation.",
    position: "bottom",
    autoAdvanceMs: 2200,
  },
  {
    id: "hire",
    targetTestId: "button-hire-mode",
    title: "HIRE",
    body: "Need help? Post a task in minutes and let local people complete it.",
    position: "bottom",
    requireTap: true,
  },
  {
    id: "hire-revealed",
    targetTestId: "card-mode-action-hire",
    title: "HIRE = Get Things Done",
    body: "Post jobs, find help, move fast.",
    position: "bottom",
    autoAdvanceMs: 2200,
  },
  {
    id: "vi",
    targetTestId: "card-category-verify-inspect",
    title: "VERIFY & INSPECT",
    body: "Need eyes on something before spending money? Request GPS-verified photos and videos from real people — vehicle checks, property checks, marketplace items, storage units, salvage yards.",
    position: "bottom",
  },
  {
    id: "map",
    targetTestId: "section-nearby-jobs",
    title: "LIVE MAP",
    body: "See opportunities, jobs, inspections, and cash drops happening around you.",
    position: "top",
  },
  {
    id: "marketplace",
    targetTestId: "card-category-marketplace",
    title: "MARKETPLACE",
    body: "Buy and sell vehicles, equipment, property, and more.",
    position: "bottom",
  },
  {
    id: "ai-or-not",
    targetTestId: "card-category-ai-or-not",
    title: "AI OR NOT",
    body: "Test images, videos, and text to see if they appear AI-generated.",
    position: "top",
  },
  {
    id: "cash-drops",
    targetTestId: "card-city-activation-unified",
    title: "CASH DROPS",
    body: "Find sponsored rewards and community challenges. Help unlock your city.",
    position: "top",
  },
  {
    id: "profile",
    targetTestId: "tab-profile",
    title: "PROFILE / REPUTATION",
    body: "Every completed task builds credibility, ratings, reviews, and trust.",
    position: "top",
  },
];

const BUSINESS_STEPS: TourStep[] = [
  {
    id: "hire",
    targetTestId: "button-hire-mode",
    title: "HIRE",
    body: "Post jobs, find workers, and get real-world help when your business needs action.",
    position: "bottom",
    requireTap: true,
  },
  {
    id: "hire-revealed",
    targetTestId: "card-mode-action-hire",
    title: "HIRE = Get Things Done",
    body: "Post jobs, find help, move fast.",
    position: "bottom",
    autoAdvanceMs: 2200,
  },
  {
    id: "vi",
    targetTestId: "card-category-verify-inspect",
    title: "VERIFY & INSPECT",
    body: "Request visual verification of vehicles, properties, equipment, inventory, or other assets before buying, funding, or sending someone out.",
    position: "bottom",
  },
  {
    id: "marketplace",
    targetTestId: "card-category-marketplace",
    title: "MARKETPLACE",
    body: "List, source, or review vehicles, property, equipment, and business-related assets.",
    position: "bottom",
  },
  {
    id: "cash-drops",
    targetTestId: "card-city-activation-unified",
    title: "SPONSORED CASH DROPS",
    body: "Drive attention, foot traffic, and local engagement through sponsored GUBER cash drops.",
    position: "top",
  },
  {
    id: "biz-dashboard",
    targetTestId: "tab-admin",
    title: "BUSINESS DASHBOARD",
    body: "Manage requests, jobs, verification orders, activity, and future business tools from one place.",
    position: "top",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface DashboardTourProps {
  accountType: string;
  onModeChange?: (mode: "hire" | "work") => void;
}

export function DashboardTour({ accountType, onModeChange }: DashboardTourProps) {
  const isBusiness = accountType === "business";
  const steps = isBusiness ? BUSINESS_STEPS : INDIVIDUAL_STEPS;

  const [step, setStep] = useState(0);
  const [showFinal, setShowFinal] = useState(false);
  const [, navigate] = useLocation();

  const current = steps[step];

  const completeTour = useCallback(async () => {
    localStorage.setItem("guber_tour_complete", "true");
    apiRequest("POST", "/api/users/me/onboarding-complete", {
      onboardingType: isBusiness ? "business" : "individual",
    }).catch(() => {});
    // Force a page reload so the dashboard re-renders without the tour overlay
    window.location.reload();
  }, [isBusiness]);

  const advance = useCallback(() => {
    const next = step + 1;
    if (next >= steps.length) {
      setShowFinal(true);
    } else {
      setStep(next);
      localStorage.setItem("guber_tour_step", String(next));
    }
  }, [step, steps.length]);

  // Auto-advance for steps with autoAdvanceMs
  useEffect(() => {
    if (!current?.autoAdvanceMs) return;
    const t = setTimeout(() => advance(), current.autoAdvanceMs);
    return () => clearTimeout(t);
  }, [current, advance]);

  // Mode switching side-effect for requireTap steps
  useEffect(() => {
    if (current?.requireTap && onModeChange) {
      if (current.id === "work" || current.id === "work-revealed") {
        onModeChange("work");
      } else if (current.id === "hire" || current.id === "hire-revealed") {
        onModeChange("hire");
      }
    }
  }, [current, onModeChange]);

  // Listen for tap on highlighted element (for requireTap steps)
  useEffect(() => {
    if (!current?.requireTap) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const el = document.querySelector(`[data-testid="${current.targetTestId}"]`);
      if (el && (el === target || el.contains(target))) {
        advance();
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [current, advance]);

  // ── Final screen ──────────────────────────────────────────────────────────
  if (showFinal) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 px-6" data-testid="tour-final-screen">
        <div className="w-full max-w-sm rounded-3xl p-6 text-center"
          style={{ background: "rgba(5,5,5,0.98)", border: "1.5px solid rgba(0,229,118,0.3)" }}>
          <p className="text-[10px] font-display font-black tracking-[0.25em] text-primary/50 mb-3 uppercase">Perfect.</p>
          <h2 className="font-display font-black text-2xl text-white tracking-tight mb-1">
            {isBusiness ? "Welcome to GUBER Business" : "Welcome to GUBER"}
          </h2>
          <p className="text-sm text-white/50 mb-6">
            {isBusiness ? "Hire • Verify • Promote • Grow" : "Work • Hire • Verify • Earn"}
          </p>

          {!isBusiness && (
            <div className="rounded-2xl p-4 mb-5 text-left space-y-2"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-xs text-white/40 font-display font-bold tracking-widest uppercase mb-3">GUBER has two sides</p>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-display font-black px-3 py-1 rounded-full" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}>WORK</span>
                <span className="text-sm text-white/70">= Earn Money</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-display font-black px-3 py-1 rounded-full" style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.3)" }}>HIRE</span>
                <span className="text-sm text-white/70">= Get Things Done</span>
              </div>
              <p className="text-[10px] text-white/30 mt-2">Switch anytime from the top of your dashboard.</p>
            </div>
          )}

          <button
            onClick={completeTour}
            className="w-full h-14 rounded-2xl font-display font-black text-sm tracking-[0.12em] text-black transition-all active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg,#00e676,#00c853)", boxShadow: "0 0 24px rgba(0,229,118,0.3)" }}
            data-testid="button-tour-finish"
          >
            START EXPLORING →
          </button>
        </div>
      </div>
    );
  }

  // ── Find target element position ─────────────────────────────────────────
  const targetEl = document.querySelector(`[data-testid="${current.targetTestId}"]`);
  const rect = targetEl?.getBoundingClientRect();

  const tooltipStyle: React.CSSProperties = rect
    ? current.position === "bottom"
      ? { top: rect.bottom + 12, left: Math.max(12, Math.min(rect.left, window.innerWidth - 300)), position: "fixed" }
      : { bottom: window.innerHeight - rect.top + 12, left: Math.max(12, Math.min(rect.left, window.innerWidth - 300)), position: "fixed" }
    : { top: "50%", left: "50%", transform: "translate(-50%,-50%)", position: "fixed" };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[199] pointer-events-none" style={{ background: "rgba(0,0,0,0.75)" }} />

      {/* Spotlight ring around target */}
      {rect && (
        <div
          className="fixed z-[200] pointer-events-none rounded-2xl"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: "0 0 0 4px rgba(0,229,118,0.7), 0 0 24px rgba(0,229,118,0.4)",
            border: "1.5px solid rgba(0,229,118,0.6)",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="z-[201] w-[280px] rounded-2xl p-4"
        style={{
          ...tooltipStyle,
          background: "rgba(5,5,5,0.97)",
          border: "1px solid rgba(0,229,118,0.3)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}
        data-testid="tour-tooltip"
      >
        <p className="font-display font-black text-sm text-white mb-1">{current.title}</p>
        <p className="text-[11px] text-white/60 leading-snug mb-3">{current.body}</p>

        {current.requireTap ? (
          <p className="text-[10px] text-primary/70 font-display font-bold animate-pulse">
            ↑ Tap to continue
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={advance}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl font-display font-black text-xs text-black transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg,#00e676,#00c853)" }}
              data-testid="button-tour-next"
            >
              Next <ChevronRight className="w-3 h-3" />
            </button>
            <button
              onClick={() => setShowFinal(true)}
              className="text-[10px] text-muted-foreground/50 font-display hover:text-muted-foreground transition-colors"
              data-testid="button-tour-skip"
            >
              Skip Tour
            </button>
          </div>
        )}

        <div className="flex gap-1 mt-3">
          {steps.map((_, i) => (
            <div key={i} className="h-[3px] flex-1 rounded-full transition-all"
              style={{ background: i === step ? "#00e676" : "rgba(255,255,255,0.12)" }} />
          ))}
        </div>
      </div>
    </>
  );
}
