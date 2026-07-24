import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { JacConvaiWrapper } from "@/components/jac/jac-convai-voice";
import { useAuth } from "@/lib/auth-context";
import jacPortrait from "@assets/Picsart_26-06-23_12-26-51-004_1782235908420.png";

const SEEN_KEY = "jac_v1_seen";
const FAB_HINT_KEY = "jac_fab_hint_shown";

function loadSeen(): boolean {
  try { return sessionStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
}

type StoreState = { open: boolean; hasSavedThread: boolean; seen: boolean };
const store: StoreState = { open: false, hasSavedThread: false, seen: loadSeen() };
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function patchStore(p: Partial<StoreState>) { Object.assign(store, p); emit(); }
function useAssistantStore(): StoreState {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return store;
}

export function useGuberAssistantOpen(): boolean { return useAssistantStore().open; }
export function setGuberAssistantOpen(open: boolean) { if (open) markSeen(); patchStore({ open }); }
function markSeen() {
  try { sessionStorage.setItem(SEEN_KEY, "1"); } catch {}
  patchStore({ seen: true });
}

// ── Header trigger button (used in guber-layout header) ─────────────────────
export function GUBERAssistantHeaderButton() {
  const s = useAssistantStore();
  const showBadge = s.hasSavedThread && !s.seen && !s.open;
  return (
    <button
      type="button"
      onClick={() => { markSeen(); patchStore({ open: true }); }}
      className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/[0.04] active:scale-95"
      aria-label={showBadge ? "Open Jac (saved conversation)" : "Open Jac"}
      data-testid="button-guber-assistant"
    >
      <span
        className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0"
        style={{ boxShadow: "0 2px 10px hsl(270 100% 65% / 0.45), 0 1px 4px rgba(0,0,0,0.35)" }}
      >
        <img src={jacPortrait} alt="Jac" className="w-full h-full object-cover object-top" />
      </span>
      {showBadge && (
        <span
          className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full pointer-events-none"
          style={{
            background: "hsl(152 100% 44%)",
            border: "2px solid hsl(222 47% 7%)",
            boxShadow: "0 0 6px hsl(152 100% 44% / 0.85)",
          }}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

// ── Floating Jac bubble (FAB, rendered in guber-layout) ─────────────────────
export function DDFloatingButton() {
  const s = useAssistantStore();
  const [location] = useLocation();
  const isMapPage = location === "/map";

  const [showHint, setShowHint] = useState(() => {
    try { return localStorage.getItem(FAB_HINT_KEY) !== "1"; } catch { return false; }
  });

  const [mapPanelExpanded, setMapPanelExpanded] = useState(false);
  const [mapOverlay, setMapOverlay] = useState(false);
  const [mapInteracting, setMapInteracting] = useState(false);
  const [userExpandedOnMap, setUserExpandedOnMap] = useState(false);

  useEffect(() => {
    if (!showHint) return;
    const t = setTimeout(() => {
      setShowHint(false);
      try { localStorage.setItem(FAB_HINT_KEY, "1"); } catch {}
    }, 4000);
    return () => clearTimeout(t);
  }, [showHint]);

  useEffect(() => {
    function onMapPanel(e: Event) {
      const { expanded, overlay } = (e as CustomEvent<{ expanded: boolean; overlay: boolean }>).detail;
      setMapPanelExpanded(expanded);
      setMapOverlay(overlay);
      setUserExpandedOnMap(false);
    }
    window.addEventListener("jac:map-panel", onMapPanel);
    return () => window.removeEventListener("jac:map-panel", onMapPanel);
  }, []);

  useEffect(() => {
    if (!isMapPage) {
      setMapPanelExpanded(false);
      setMapOverlay(false);
      setMapInteracting(false);
      setUserExpandedOnMap(false);
    }
  }, [isMapPage]);

  useEffect(() => {
    if (!isMapPage) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    function onInteract(e: Event) {
      if ((e.target as HTMLElement)?.closest("[data-testid='button-dd-floating']")) return;
      setMapInteracting(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMapInteracting(false), 1500);
    }
    document.addEventListener("touchstart", onInteract, { passive: true });
    document.addEventListener("pointerdown", onInteract, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onInteract);
      document.removeEventListener("pointerdown", onInteract);
      if (timer) clearTimeout(timer);
    };
  }, [isMapPage]);

  if (s.open) return null;

  const needsMinimize = isMapPage && (mapPanelExpanded || mapOverlay) && !userExpandedOnMap;
  const isFaded = isMapPage && mapInteracting;
  const size = needsMinimize ? 36 : 56;

  function handleClick() {
    if (needsMinimize) { setUserExpandedOnMap(true); return; }
    markSeen();
    patchStore({ open: true });
  }

  return (
    <div
      className="fixed z-[150]"
      style={{
        bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
        right: "16px",
        opacity: isFaded ? 0.4 : 1,
        transition: "opacity 0.3s ease, bottom 0.3s ease",
        pointerEvents: isFaded ? "none" : "auto",
      }}
    >
      {showHint && !needsMinimize && (
        <div
          className="absolute bottom-16 right-0 whitespace-nowrap rounded-xl px-3 py-1.5 text-[11px] font-display font-semibold text-white animate-fade-in mb-1"
          style={{ background: "hsl(270 100% 65% / 0.95)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
        >
          I'm always here — just tap!
        </div>
      )}
      <button
        type="button"
        onClick={handleClick}
        data-testid="button-dd-floating"
        aria-label={needsMinimize ? "Show Jac" : "Open Jac"}
        className="rounded-full overflow-hidden active:scale-95"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          transition: "width 0.25s ease, height 0.25s ease, box-shadow 0.25s ease, border 0.25s ease",
          boxShadow: needsMinimize
            ? "0 2px 10px hsl(270 100% 65% / 0.35), 0 1px 4px rgba(0,0,0,0.5)"
            : "0 4px 24px hsl(270 100% 65% / 0.55), 0 2px 8px rgba(0,0,0,0.6)",
          border: needsMinimize
            ? "1.5px solid hsl(270 100% 65% / 0.4)"
            : "2px solid hsl(270 100% 65% / 0.6)",
        }}
      >
        <img src={jacPortrait} alt="Jac" className="w-full h-full object-cover object-top" />
      </button>
    </div>
  );
}

// ── Main JAC — pure ElevenLabs ConvAI ────────────────────────────────────────
export function GUBERAssistant() {
  const s = useAssistantStore();
  const { user } = useAuth();

  if (!s.open) return null;

  return (
    <JacConvaiWrapper
      onClose={() => patchStore({ open: false })}
      sessionEndpoint={user ? "/api/jac/convai/session" : undefined}
    />
  );
}
