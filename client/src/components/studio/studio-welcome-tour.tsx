// ─────────────────────────────────────────────────────────────────────────────
// Studio first-time welcome tour (task-552)
//
// Renders a 4-step coachmark walkthrough the first time a signed-in user
// opens /studio. Each step highlights a real DOM element on the page (via
// data-testid lookup) and shows a small explainer card pinned near it.
//
// Persistence: localStorage key `guber.studio.tourSeen.v1.<userId>`. Once
// the user finishes or skips, we never show it again on that device for
// that user. Cheap, dependency-free, no schema migration needed.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, X, ChevronRight } from "lucide-react";

type Step = {
  testid: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    testid: "group-studio-credits-plan",
    title: "Credits & your plan",
    body:
      "Your credit balance and current plan live up here. Tap either to top up or upgrade — subscribers get bigger monthly drops at a lower per-credit price.",
  },
  {
    testid: "section-tool-tiles",
    title: "Pick a tool to create",
    body:
      "Quick Pic is free (3/day). The other four tiles open dedicated makers for video, mirror motion, full ads and music.",
  },
  {
    testid: "textarea-prompt",
    title: "Describe what you want",
    body:
      "Type a short cinematic moment, hit Generate, and your clip lands in 30–90 seconds.",
  },
  {
    testid: "section-library",
    title: "Your clips live here",
    body:
      "Everything you make in this session shows up in your library — replay, download or share. Sessions stick around for 24 hours.",
  },
];

const STORAGE_PREFIX = "guber.studio.tourSeen.v1.";

function tourSeen(userId: number | string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + userId) === "1";
  } catch {
    return true; // localStorage blocked → treat as seen, never block UI
  }
}
function markSeen(userId: number | string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, "1");
  } catch {}
}

export function StudioWelcomeTour({ userId }: { userId: number | string | null | undefined }) {
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Decide whether to show the tour. Wait one tick so the page has
  // mounted its anchors before we measure.
  useEffect(() => {
    if (userId == null) return;
    if (tourSeen(userId)) return;
    const t = window.setTimeout(() => setActive(true), 350);
    return () => window.clearTimeout(t);
  }, [userId]);

  // Measure the current step's anchor + scroll it into view. Recompute
  // on scroll/resize so the highlight box tracks the element.
  useLayoutEffect(() => {
    if (!active) return;
    const step = STEPS[stepIdx];
    if (!step) return;
    let raf = 0;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${step.testid}"]`);
      if (!el) { setRect(null); return; }
      setRect(el.getBoundingClientRect());
    };
    const el = document.querySelector<HTMLElement>(`[data-testid="${step.testid}"]`);
    if (el) {
      try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
    }
    // Initial + a couple of late re-measures to catch the smooth-scroll
    // landing without subscribing to scroll events while animating.
    raf = window.requestAnimationFrame(measure);
    const t1 = window.setTimeout(measure, 250);
    const t2 = window.setTimeout(measure, 600);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [active, stepIdx]);

  function dismiss() {
    if (userId != null) markSeen(userId);
    setActive(false);
  }
  function next() {
    if (stepIdx >= STEPS.length - 1) { dismiss(); return; }
    setStepIdx((i) => i + 1);
  }

  if (!active || userId == null) return null;
  const step = STEPS[stepIdx];
  const total = STEPS.length;
  const isLast = stepIdx === total - 1;

  // Highlight box geometry — pad slightly so the ring sits outside the
  // element. When the anchor is missing (rare), we just show the card
  // centered with no spotlight.
  const PAD = 8;
  const highlight = rect ? {
    top: Math.max(rect.top - PAD, 4),
    left: Math.max(rect.left - PAD, 4),
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  } : null;

  return (
    <div
      className="fixed inset-0 z-[80] pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-tour-title"
      data-testid="studio-welcome-tour"
    >
      {/* Dimmed backdrop. Pointer-events on so taps outside the card don't
          accidentally hit page controls during the tour. Tapping the dim
          area advances — feels natural for coachmarks. */}
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px] pointer-events-auto"
        onClick={next}
        aria-label="Next tour step"
        data-testid="studio-tour-backdrop"
      />

      {/* Spotlight ring around the current anchor. */}
      {highlight && (
        <div
          className="absolute rounded-2xl ring-2 ring-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] transition-all duration-300 pointer-events-none"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
          }}
          data-testid="studio-tour-spotlight"
        />
      )}

      {/* Step card — pinned bottom-center on phones, comfortable read width. */}
      <div
        ref={cardRef}
        className="absolute left-1/2 -translate-x-1/2 bottom-6 sm:bottom-10 w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-neutral-950/95 border border-emerald-400/30 shadow-[0_0_60px_-15px_rgba(34,197,94,0.6)] p-5 pointer-events-auto"
        data-testid="studio-tour-card"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-violet-500 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-300/80 font-bold">
              Tour · {stepIdx + 1} / {total}
            </p>
            <h3
              id="studio-tour-title"
              className="text-base font-black tracking-tight text-white mt-0.5"
              data-testid="text-studio-tour-title"
            >
              {step.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="text-white/50 hover:text-white p-1 -m-1 rounded-md hover:bg-white/10 transition shrink-0"
            data-testid="button-studio-tour-close"
            aria-label="Dismiss tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-white/75 mt-3 leading-relaxed">{step.body}</p>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="text-xs font-semibold text-white/60 hover:text-white px-2 py-1 rounded-md hover:bg-white/5 transition"
            data-testid="button-studio-tour-skip"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === stepIdx ? "w-6 bg-emerald-400" : "w-1.5 bg-white/20"
                }`}
              />
            ))}
          </div>
          <Button
            type="button"
            onClick={next}
            size="sm"
            className="bg-emerald-400 hover:bg-emerald-300 text-black font-bold rounded-full px-4"
            data-testid="button-studio-tour-next"
          >
            {isLast ? "Done" : "Next"}
            {!isLast && <ChevronRight className="w-3.5 h-3.5 ml-1" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
