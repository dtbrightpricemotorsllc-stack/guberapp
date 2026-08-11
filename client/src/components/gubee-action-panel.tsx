/**
 * GubeeActionPanel
 *
 * Renders at every human-action gate in the JAC/Gubee/Team GUBER flow.
 * JAC coordinates → Gubee represents progress visually → Team GUBER acts.
 * The user always controls consequential decisions — this panel surfaces them.
 *
 * Usage:
 *   <GubeeActionPanel
 *     title="Cash Drop Mission Ready"
 *     subtitle="Gubee located a drop zone 3.2 miles away."
 *     sponsorAttribution="Presented by Luca's Pizza"
 *     details={[{ label: "Reward", value: "$40" }, { label: "Est. time", value: "25 min" }]}
 *     actions={[
 *       { label: "ACCEPT MISSION", onClick: handleAccept, primary: true },
 *       { label: "Not now", onClick: handleDecline },
 *     ]}
 *   />
 */

import { useEffect, useState } from "react";
import { MapPin, Clock, DollarSign, Shield, ChevronRight } from "lucide-react";

export interface GubeeAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  testId?: string;
}

export interface GubeeDetail {
  label: string;
  value: string;
  icon?: "map" | "clock" | "dollar" | "shield";
}

export interface GubeeActionPanelProps {
  title: string;
  subtitle?: string;
  /** Transparent sponsor attribution — e.g. "Presented by Luca's Pizza" */
  sponsorAttribution?: string;
  details?: GubeeDetail[];
  actions: GubeeAction[];
  /** "ready" = badger neutral, "active" = badger aiming up (action imminent) */
  mascotMode?: "ready" | "active";
  /** Optional extra note shown below actions */
  footerNote?: string;
  className?: string;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  map:    MapPin,
  clock:  Clock,
  dollar: DollarSign,
  shield: Shield,
};

const BADGER_READY  = "/loading-badger.png";
const BADGER_ACTIVE = "/loading-badger-aiming-up.png";

export function GubeeActionPanel({
  title,
  subtitle,
  sponsorAttribution,
  details,
  actions,
  mascotMode = "ready",
  footerNote,
  className = "",
}: GubeeActionPanelProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const badgerSrc = mascotMode === "active" ? BADGER_ACTIVE : BADGER_READY;

  return (
    <div
      className={className}
      style={{
        borderRadius: 20,
        background: "linear-gradient(160deg, hsl(222 47% 7%) 0%, hsl(38 60% 6%) 100%)",
        border: "1.5px solid rgba(245,158,11,0.22)",
        boxShadow: "0 8px 40px rgba(245,158,11,0.08), 0 2px 12px rgba(0,0,0,0.4)",
        overflow: "hidden",
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(6px)",
        transition: "opacity 0.28s ease, transform 0.28s ease",
      }}
      data-testid="gubee-action-panel"
    >
      {/* Header row — mascot + title */}
      <div className="flex items-center gap-4 px-5 pt-5 pb-3">
        <div
          className="flex-shrink-0"
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <img
            src={badgerSrc}
            alt="Gubee"
            style={{ width: 44, height: 44, objectFit: "contain" }}
            data-testid="gubee-mascot-img"
          />
        </div>
        <div className="flex-1 min-w-0">
          {sponsorAttribution && (
            <p
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(245,158,11,0.6)",
                marginBottom: 2,
              }}
            >
              {sponsorAttribution}
            </p>
          )}
          <h3
            style={{
              fontSize: 15,
              fontWeight: 900,
              letterSpacing: "0.02em",
              color: "rgba(255,255,255,0.95)",
              lineHeight: 1.2,
              margin: 0,
            }}
            className="font-display"
          >
            {title}
          </h3>
          {subtitle && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3, lineHeight: 1.4 }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Detail pills */}
      {details && details.length > 0 && (
        <div
          className="flex flex-wrap gap-2 px-5 pb-3"
        >
          {details.map((d, i) => {
            const IconComp = d.icon ? ICON_MAP[d.icon] : null;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 10px",
                  borderRadius: 99,
                  background: "rgba(245,158,11,0.07)",
                  border: "1px solid rgba(245,158,11,0.18)",
                }}
              >
                {IconComp && <IconComp className="w-3 h-3" style={{ color: "rgba(245,158,11,0.7)" }} />}
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(245,158,11,0.6)", textTransform: "uppercase" }}>
                  {d.label}
                </span>
                <span style={{ fontSize: 12, fontWeight: 900, color: "rgba(245,200,100,0.9)" }}>
                  {d.value}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(245,158,11,0.10)", margin: "0 20px" }} />

      {/* Actions */}
      <div className="flex flex-col gap-2 px-5 py-4">
        {actions.map((action, i) => (
          <button
            key={i}
            onClick={action.onClick}
            disabled={action.disabled || action.loading}
            data-testid={action.testId}
            style={{
              width: "100%",
              height: 48,
              borderRadius: 14,
              border: action.primary
                ? "1.5px solid rgba(245,158,11,0.5)"
                : "1px solid rgba(255,255,255,0.1)",
              background: action.primary
                ? "linear-gradient(135deg, #d97706, #b45309, #d97706)"
                : "rgba(255,255,255,0.04)",
              color: action.primary ? "#000" : "rgba(255,255,255,0.65)",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: "0.15em",
              cursor: (action.disabled || action.loading) ? "not-allowed" : "pointer",
              opacity: (action.disabled || action.loading) ? 0.5 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "opacity 0.2s, transform 0.15s",
            }}
            className="font-display active:scale-95"
          >
            {action.loading ? (
              <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            ) : (
              <>
                {action.label}
                {action.primary && <ChevronRight className="w-4 h-4" />}
              </>
            )}
          </button>
        ))}
      </div>

      {/* Footer note */}
      {footerNote && (
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "0 20px 14px", lineHeight: 1.5 }}>
          {footerNote}
        </p>
      )}
    </div>
  );
}
