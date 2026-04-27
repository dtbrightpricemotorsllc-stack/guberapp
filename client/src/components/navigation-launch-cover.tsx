import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Navigation, Car, Map as MapIcon, CheckCircle } from "lucide-react";
import shieldLogo from "@assets/__favicon_1773034423924.png";

export type NavProvider = "google" | "waze" | "apple";

type NavLaunchOpts = {
  provider: NavProvider;
  url: string;
  destLabel?: string;
};

type CoverState = (NavLaunchOpts & { status: "launching" | "launched" }) | null;

const PROVIDERS: Record<NavProvider, { name: string; color: string; Icon: typeof Navigation }> = {
  google: { name: "Google Maps", color: "#4285F4", Icon: Navigation },
  waze: { name: "Waze", color: "#22C55E", Icon: Car },
  apple: { name: "Apple Maps", color: "#94A3B8", Icon: MapIcon },
};

function NavigationLaunchCover({ state, onClose }: { state: NonNullable<CoverState>; onClose: () => void }) {
  const cfg = PROVIDERS[state.provider];
  const Icon = cfg.Icon;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 10010, background: "#000", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
      data-testid="cover-navigation-launch"
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 14px)", left: 14, zIndex: 10012,
          height: 38, paddingLeft: 12, paddingRight: 16, borderRadius: 14,
          background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.12)",
          display: "flex", alignItems: "center", gap: 6,
          cursor: "pointer", boxShadow: "0 2px 12px rgba(0,0,0,0.6)",
          color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
          fontFamily: "Oxanium, sans-serif",
        }}
        data-testid="button-nav-cover-back"
      >
        <ArrowLeft style={{ width: 16, height: 16 }} />
        BACK TO GUBER
      </button>

      <img
        src={shieldLogo}
        alt="GUBER"
        style={{ width: 110, height: 110, objectFit: "contain", filter: "drop-shadow(0 0 24px rgba(180,60,255,0.55)) drop-shadow(0 0 12px rgba(0,230,200,0.4))", marginBottom: 22 }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderRadius: 999, background: `${cfg.color}1F`, border: `1px solid ${cfg.color}55`, marginBottom: 14 }}>
        <Icon style={{ width: 16, height: 16, color: cfg.color }} />
        <span style={{ color: cfg.color, fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", fontFamily: "Oxanium, sans-serif" }}>
          {state.status === "launched" ? `${cfg.name.toUpperCase()} OPENED` : `OPENING ${cfg.name.toUpperCase()}`}
        </span>
      </div>

      <p style={{ color: "#fff", fontWeight: 800, fontSize: 18, margin: 0, fontFamily: "Oxanium, sans-serif", letterSpacing: "-0.01em", textAlign: "center", padding: "0 32px" }}>
        {state.destLabel ? `Heading to ${state.destLabel}` : "Powered by GUBER"}
      </p>
      <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 8, textAlign: "center", padding: "0 36px", lineHeight: 1.5 }}>
        Your job is still active in GUBER. Come back anytime — your progress is saved.
      </p>

      {state.status === "launching" ? (
        <div style={{ display: "flex", gap: 7, marginTop: 24 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 8, height: 8, borderRadius: "50%",
                background: cfg.color,
                animation: `nav-cover-bounce 1.3s ease-in-out ${i * 0.22}s infinite`,
              }}
            />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 22, color: "#22C55E" }}>
          <CheckCircle style={{ width: 16, height: 16 }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", fontFamily: "Oxanium, sans-serif" }}>
            LAUNCHED IN NEW TAB
          </span>
        </div>
      )}

      <button
        onClick={onClose}
        style={{
          marginTop: 36,
          background: "linear-gradient(135deg, hsl(80 100% 55%), hsl(80 100% 40%))",
          color: "#000",
          fontWeight: 800, fontSize: 13, fontFamily: "Oxanium, sans-serif",
          letterSpacing: "0.08em",
          border: "none", borderRadius: 14,
          padding: "12px 28px", cursor: "pointer",
          boxShadow: "0 0 18px hsl(80 100% 50% / 0.45)",
        }}
        data-testid="button-nav-cover-done"
      >
        BACK TO JOB
      </button>

      <style>{`
        @keyframes nav-cover-bounce {
          0%, 80%, 100% { transform: scale(0.55); opacity: 0.35; }
          40% { transform: scale(1.1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export function useNavigationCover() {
  const [state, setState] = useState<CoverState>(null);

  // Lock background scroll while the cover is up
  useEffect(() => {
    if (!state) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [state]);

  const launch = useCallback((opts: NavLaunchOpts) => {
    setState({ ...opts, status: "launching" });
    // Defer the actual external open by ~600ms so the cover paints first.
    // Fallback to location.href for waze:// (some browsers refuse window.open
    // for non-https schemes from a setTimeout).
    setTimeout(() => {
      try {
        if (opts.url.startsWith("waze://") || opts.url.startsWith("comgooglemaps://")) {
          window.location.href = opts.url;
        } else {
          window.open(opts.url, "_blank", "noopener");
        }
      } catch {
        // ignore
      }
      setState((prev) => (prev ? { ...prev, status: "launched" } : null));
    }, 600);
  }, []);

  const close = useCallback(() => setState(null), []);

  const cover = state ? <NavigationLaunchCover state={state} onClose={close} /> : null;

  return { cover, launch };
}
