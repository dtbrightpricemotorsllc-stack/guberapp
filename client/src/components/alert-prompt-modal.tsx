import { useState } from "react";
import { Bell, X } from "lucide-react";
import { subscribeToPush, getPushStatus } from "@/lib/push";
import { useAuth } from "@/lib/auth-context";

// ─── 3-state permission tracking ─────────────────────────────────────────────

const ALERT_STATUS_KEY = "guber_alert_status";
export type AlertStatus = "never_asked" | "declined" | "granted";

export function getAlertStatus(): AlertStatus {
  if (typeof window === "undefined") return "never_asked";
  return (localStorage.getItem(ALERT_STATUS_KEY) as AlertStatus) || "never_asked";
}

export function setAlertStatus(status: AlertStatus): void {
  localStorage.setItem(ALERT_STATUS_KEY, status);
}

/** True if we should prompt — covers both never_asked and declined */
export function shouldShowAlertPrompt(): boolean {
  const pushStatus = getPushStatus();
  if (pushStatus === "granted" || pushStatus === "unsupported" || pushStatus === "ios-needs-install") return false;
  return getAlertStatus() !== "granted";
}

// ─── Full modal (shown on first load, status="never_asked") ──────────────────

interface AlertPromptModalProps {
  onClose: () => void;
}

export function AlertPromptModal({ onClose }: AlertPromptModalProps) {
  const { user } = useAuth();
  const [enabling, setEnabling] = useState(false);
  const [done, setDone] = useState(false);

  const handleEnable = async () => {
    if (!user?.id) return;
    setEnabling(true);
    await subscribeToPush(user.id);
    const status = getPushStatus();
    setEnabling(false);
    setAlertStatus(status === "granted" ? "granted" : "declined");
    if (status === "granted") {
      setDone(true);
      setTimeout(onClose, 1600);
    } else {
      onClose();
    }
  };

  const handleNotNow = () => {
    setAlertStatus("declined");
    onClose();
  };

  if (done) {
    return (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 10000,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        }}
        data-testid="modal-alert-success"
      >
        <div style={{
          background: "#111", borderRadius: 24, padding: "32px 24px",
          width: "min(340px, 90vw)", textAlign: "center",
          border: "1px solid rgba(34,197,94,0.3)",
          animation: "scale-in 0.3s cubic-bezier(0.34,1.4,0.64,1)",
        }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
          <p style={{ color: "#22C55E", fontWeight: 900, fontSize: 18, fontFamily: "Oxanium, sans-serif", letterSpacing: "0.04em", margin: "0 0 6px" }}>
            ALERTS ARE ON
          </p>
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, margin: 0 }}>
            You won't miss a job or cash drop
          </p>
        </div>
        <style>{`@keyframes scale-in { from { transform: scale(0.88); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleNotNow(); }}
      data-testid="modal-alert-prompt"
    >
      <div style={{
        background: "linear-gradient(180deg,#0f0f0f 0%,#141414 100%)",
        borderRadius: "24px 24px 0 0",
        borderTop: "1px solid rgba(201,168,76,0.25)",
        padding: "28px 24px 48px",
        width: "100%",
        maxWidth: 480,
        animation: "slide-up 0.4s cubic-bezier(0.34,1.2,0.64,1)",
        position: "relative",
      }}>
        <button
          onClick={handleNotNow}
          style={{ position: "absolute", top: 16, right: 18, background: "none", border: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer", padding: 4 }}
          data-testid="button-close-alert-modal"
        >
          <X style={{ width: 18, height: 18 }} />
        </button>

        <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
          <Bell style={{ width: 24, height: 24, color: "#C9A84C" }} />
        </div>

        <p style={{ color: "#fff", fontWeight: 900, fontSize: 20, fontFamily: "Oxanium, sans-serif", letterSpacing: "-0.01em", margin: "0 0 10px", lineHeight: 1.2 }}>
          💰 Don't miss jobs or cash drops
        </p>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, margin: "0 0 28px", lineHeight: 1.55 }}>
          GUBER moves fast. Jobs and money can be gone in seconds.
        </p>

        <button
          onClick={handleEnable}
          disabled={enabling}
          data-testid="button-turn-on-alerts"
          style={{
            width: "100%", background: enabling ? "rgba(201,168,76,0.4)" : "linear-gradient(135deg,#C9A84C,#a8873c)",
            color: "#000", border: "none", borderRadius: 14,
            padding: "15px 0", fontWeight: 900, fontSize: 15,
            fontFamily: "Oxanium, sans-serif", letterSpacing: "0.08em",
            cursor: enabling ? "not-allowed" : "pointer",
            boxShadow: "0 0 20px rgba(201,168,76,0.25)",
            marginBottom: 12, textTransform: "uppercase",
          }}
        >
          {enabling ? "Enabling…" : "Turn On Alerts"}
        </button>

        <button
          onClick={handleNotNow}
          data-testid="button-not-now-alerts"
          style={{
            width: "100%", background: "none", border: "none",
            color: "rgba(255,255,255,0.85)", fontSize: 13,
            cursor: "pointer", fontFamily: "Oxanium, sans-serif",
            letterSpacing: "0.04em", padding: "8px 0",
          }}
        >
          Not now
        </button>
      </div>
      <style>{`@keyframes slide-up { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );
}

// ─── Action-triggered inline banner (stays until manually dismissed) ──────────

interface AlertActionPromptProps {
  onEnable: () => void;
  onDismiss: () => void;
  message?: string;
}

export function AlertActionPrompt({ onEnable, onDismiss, message }: AlertActionPromptProps) {
  return (
    <div
      style={{
        position: "fixed", bottom: 76, left: "50%", transform: "translateX(-50%)",
        width: "calc(100% - 24px)", maxWidth: 448,
        zIndex: 9998,
        background: "linear-gradient(135deg,#0f0f0f,#1c1c1c)",
        border: "1px solid rgba(201,168,76,0.35)",
        borderRadius: 16, padding: "14px 16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.65), 0 0 0 1px rgba(201,168,76,0.08)",
        animation: "slide-up-sm 0.35s cubic-bezier(0.34,1.2,0.64,1)",
        display: "flex", alignItems: "center", gap: 12,
      }}
      data-testid="banner-alert-action-prompt"
    >
      <span style={{ fontSize: 22, flexShrink: 0 }}>⚡</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: "Oxanium, sans-serif", margin: "0 0 2px", letterSpacing: "0.02em" }}>
          {message || "Stay in sync"}
        </p>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, margin: 0, lineHeight: 1.4 }}>
          You'll miss jobs and money without alerts.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0, alignItems: "flex-end" }}>
        <button
          onClick={onEnable}
          data-testid="button-enable-alerts-action"
          style={{
            background: "#C9A84C", color: "#000", border: "none",
            borderRadius: 8, padding: "7px 13px",
            fontWeight: 900, fontSize: 11, fontFamily: "Oxanium, sans-serif",
            letterSpacing: "0.06em", cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          ENABLE ALERTS
        </button>
        <button
          onClick={onDismiss}
          data-testid="button-dismiss-action-prompt"
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 10, cursor: "pointer", padding: "2px 0", fontFamily: "Oxanium, sans-serif" }}
        >
          Skip
        </button>
      </div>
      <style>{`@keyframes slide-up-sm { from { transform: translateX(-50%) translateY(20px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }`}</style>
    </div>
  );
}

// ─── Missed event banner (shown on return when alerts are off + missed things) ─

interface MissedEventBannerProps {
  type: "job" | "cash_drop" | "generic";
  onEnable: () => void;
  onDismiss: () => void;
}

export function MissedEventBanner({ type, onEnable, onDismiss }: MissedEventBannerProps) {
  const label = type === "cash_drop"
    ? "You missed a cash drop nearby"
    : type === "job"
    ? "You missed a job update"
    : "You missed activity while away";

  return (
    <div
      style={{
        position: "fixed", top: 64, left: "50%", transform: "translateX(-50%)",
        width: "calc(100% - 24px)", maxWidth: 448,
        zIndex: 9997,
        background: "linear-gradient(135deg,#1a0a00,#2a1000)",
        border: "1px solid rgba(245,158,11,0.4)",
        borderRadius: 14, padding: "12px 14px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(245,158,11,0.08)",
        animation: "drop-in 0.4s cubic-bezier(0.34,1.2,0.64,1)",
        display: "flex", alignItems: "center", gap: 10,
      }}
      data-testid="banner-missed-event"
    >
      <span style={{ fontSize: 18, flexShrink: 0 }}>{type === "cash_drop" ? "💰" : "📋"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: "#F59E0B", fontWeight: 900, fontSize: 12, fontFamily: "Oxanium, sans-serif", margin: "0 0 1px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {label}
        </p>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, margin: 0, lineHeight: 1.3 }}>
          Turn on alerts so this doesn't happen again.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0, alignItems: "flex-end" }}>
        <button
          onClick={onEnable}
          data-testid="button-enable-alerts-missed"
          style={{
            background: "#F59E0B", color: "#000", border: "none",
            borderRadius: 7, padding: "5px 10px",
            fontWeight: 900, fontSize: 10, fontFamily: "Oxanium, sans-serif",
            letterSpacing: "0.06em", cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          ENABLE ALERTS
        </button>
        <button
          onClick={onDismiss}
          data-testid="button-dismiss-missed-event"
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 10, cursor: "pointer", padding: "1px 0", fontFamily: "Oxanium, sans-serif" }}
        >
          Dismiss
        </button>
      </div>
      <style>{`@keyframes drop-in { from { transform: translateX(-50%) translateY(-12px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }`}</style>
    </div>
  );
}
