import { useEffect, useState } from "react";
import { Download, X, Share, Plus } from "lucide-react";

// iOS 13+ iPads report as Macintosh — check for touch support too
function isIOSDevice() {
  const ua = navigator.userAgent;
  const isClassicIOS = /iPad|iPhone|iPod/.test(ua);
  const isModernIPad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return isClassicIOS || isModernIPad;
}

function isIOSSafari() {
  if (!isIOSDevice()) return false;
  const ua = navigator.userAgent;
  const isChrome = /CriOS/.test(ua);
  const isFirefox = /FxiOS/.test(ua);
  const isEdge = /EdgiOS/.test(ua);
  const isWebkit = /WebKit/.test(ua);
  return isWebkit && !isChrome && !isFirefox && !isEdge;
}

function isIOSChrome() {
  return isIOSDevice() && /CriOS/.test(navigator.userAgent);
}

function isIOSOtherBrowser() {
  if (!isIOSDevice()) return false;
  const ua = navigator.userAgent;
  return /FxiOS|EdgiOS/.test(ua);
}

function isAndroid() {
  return /Android/.test(navigator.userAgent) && !isIOSDevice();
}

function isAndroidNonChrome() {
  if (!isAndroid()) return false;
  const ua = navigator.userAgent;
  const supportsNative = /Chrome\/|SamsungBrowser|EdgA\//.test(ua);
  return !supportsNative;
}

function isAlreadyInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

const SNOOZE_KEY = "guber-install-snoozed-until";
const SESSION_DISMISS_KEY = "pwa-install-dismissed";
const BANNER_DISMISS_KEY = "guber-install-banner-dismissed";
const OPEN_EVENT = "guber:open-install";

function isSnoozed() {
  const until = localStorage.getItem(SNOOZE_KEY);
  if (!until) return false;
  return Date.now() < Number(until);
}

function snooze() {
  const thirtyDays = Date.now() + 30 * 24 * 60 * 60 * 1000;
  localStorage.setItem(SNOOZE_KEY, String(thirtyDays));
}

function detectMode(): "safari" | "not-safari" | "android-chrome" | "native" | null {
  if (isIOSSafari()) return "safari";
  if (isIOSChrome() || isIOSOtherBrowser()) return "not-safari";
  if (isAndroidNonChrome()) return "android-chrome";
  if ((window as any).__installPromptEvent) return "native";
  return null;
}

function isInstallEligible(): boolean {
  if (isAlreadyInstalled()) return false;
  if (isSnoozed()) return false;
  if (sessionStorage.getItem(SESSION_DISMISS_KEY)) return false;
  return detectMode() !== null;
}

// ── Inline slim banner for the dashboard ──────────────────────────────────────
export function InstallBanner() {
  const [eligible, setEligible] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem(BANNER_DISMISS_KEY) === "1"
  );

  useEffect(() => {
    const recheck = () => setEligible(isInstallEligible());
    recheck();
    const handler = () => recheck();
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setEligible(false));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!eligible || bannerDismissed) return null;

  const open = () => window.dispatchEvent(new CustomEvent(OPEN_EVENT));
  const dismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    sessionStorage.setItem(BANNER_DISMISS_KEY, "1");
    setBannerDismissed(true);
  };

  return (
    <div
      className="mb-3 flex items-center gap-3 rounded-xl px-3 py-2 animate-fade-in"
      style={{
        background: "linear-gradient(135deg,rgba(34,197,94,0.06),rgba(34,197,94,0.02))",
        border: "1px solid rgba(34,197,94,0.18)",
        boxShadow: "0 0 0 1px rgba(34,197,94,0.04)",
      }}
      data-testid="banner-install-inline"
    >
      <p className="flex-1 text-[11px] font-display text-foreground/85 tracking-wide leading-tight m-0">
        Install GUBER for faster access ⚡
      </p>
      <button
        onClick={open}
        className="px-3 py-1 rounded-lg text-[10px] font-display font-black tracking-[0.1em]"
        style={{ background: "#22C55E", color: "#000" }}
        data-testid="button-install-banner"
      >
        INSTALL
      </button>
      <button
        onClick={dismiss}
        className="text-muted-foreground/60 hover:text-muted-foreground p-1"
        aria-label="Dismiss install banner"
        data-testid="button-dismiss-install-banner"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Modal (only opens when banner/event dispatched) ──────────────────────────
export default function InstallPrompt() {
  const [prompt, setPrompt] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showInstalledConfirm, setShowInstalledConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [iosMode, setIosMode] = useState<"safari" | "not-safari" | "android-chrome" | null>(null);

  useEffect(() => {
    if (isAlreadyInstalled()) { setInstalled(true); return; }

    // capture native prompt silently — do NOT auto-open
    const alreadyCaptured = (window as any).__installPromptEvent;
    if (alreadyCaptured) setPrompt(alreadyCaptured);
    const handler = (e: any) => {
      e.preventDefault();
      (window as any).__installPromptEvent = e;
      setPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setOpen(false);
      setShowInstalledConfirm(true);
      setTimeout(() => setShowInstalledConfirm(false), 3000);
    });

    // listen for explicit open requests from InstallBanner / mascot
    const openHandler = () => {
      if (isAlreadyInstalled()) return;
      if (isIOSSafari()) { setIosMode("safari"); setOpen(true); return; }
      if (isIOSChrome() || isIOSOtherBrowser()) { setIosMode("not-safari"); setOpen(true); return; }
      if (isAndroidNonChrome()) { setIosMode("android-chrome"); setOpen(true); return; }
      setIosMode(null);
      setOpen(true); // native modal
    };
    window.addEventListener(OPEN_EVENT, openHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener(OPEN_EVENT, openHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
      setShowInstalledConfirm(true);
      setTimeout(() => setShowInstalledConfirm(false), 3000);
    }
    setPrompt(null);
    setOpen(false);
  };

  const handleDismiss = (persistent = false) => {
    if (persistent) snooze();
    sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    setOpen(false);
    setIosMode(null);
  };

  // Post-install confirmation overlay
  if (showInstalledConfirm) return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10001,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        pointerEvents: "none",
      }}
      data-testid="banner-install-confirmed"
    >
      <div style={{
        width: "100%", maxWidth: 480,
        background: "linear-gradient(135deg,#16a34a,#15803d)",
        padding: "18px 20px",
        borderRadius: "20px 20px 0 0",
        boxShadow: "0 -8px 40px rgba(34,197,94,0.35)",
        animation: "slide-up 0.4s cubic-bezier(0.34,1.4,0.64,1)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <span style={{ fontSize: 26 }}>🎉</span>
        <p style={{ color: "#000", fontWeight: 900, fontSize: 15, fontFamily: "Oxanium, sans-serif", letterSpacing: "0.04em", margin: 0, textTransform: "uppercase" }}>
          GUBER is now on your home screen
        </p>
      </div>
      <style>{`@keyframes slide-up { from { transform: translateY(80px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );

  if (!open || installed) return null;

  // Subtle dim/blur backdrop wrapper used by all modes
  const backdrop = (children: React.ReactNode) => (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "fade-in 0.2s ease",
      }}
      onClick={() => handleDismiss()}
      data-testid="install-modal-backdrop"
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480 }}>
        {children}
      </div>
      <style>{`@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } } @keyframes slide-up { from { transform: translateY(120px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );

  // iOS Safari — icon-only step-by-step sheet (compact)
  if (iosMode === "safari") return backdrop(
    <div
      style={{
        background: "linear-gradient(135deg, #0d0d0d 0%, #181818 100%)", // dark-gradient-allow: install-prompt tray chrome, dark theme surface
        borderTop: "1px solid rgba(34,197,94,0.35)",
        borderRadius: "20px 20px 0 0",
        padding: "16px 16px 32px",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.7)",
        animation: "slide-up 0.35s cubic-bezier(0.34,1.4,0.64,1)",
        position: "relative",
      }}
    >
      <button
        onClick={() => handleDismiss(true)}
        style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer", padding: 4 }}
        aria-label="Close"
        data-testid="button-dismiss-ios"
      >
        <X style={{ width: 17, height: 17 }} />
      </button>
      <p style={{ color: "#fff", fontWeight: 900, fontSize: 15, margin: "0 0 14px", fontFamily: "Oxanium, sans-serif", letterSpacing: "-0.02em" }}>
        Add GUBER to your home screen
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Step n={1}><Pill><Share style={{ width: 14, height: 14 }} />Share</Pill></Step>
        <Step n={2}><Pill><Plus style={{ width: 14, height: 14 }} />Add to Home Screen</Pill></Step>
        <Step n={3}><Pill style={{ background: "rgba(10,132,255,0.18)", borderColor: "rgba(10,132,255,0.4)", color: "#0A84FF" }}>Add</Pill></Step>
      </div>
    </div>
  );

  // iOS Chrome / Firefox — redirect to Safari (compact)
  if (iosMode === "not-safari") return backdrop(
    <div
      style={{
        background: "linear-gradient(135deg, #0d0d0d 0%, #181818 100%)", // dark-gradient-allow: install-prompt tray chrome, dark theme surface
        borderTop: "1px solid rgba(34,197,94,0.35)",
        borderRadius: "20px 20px 0 0",
        padding: "16px 16px 32px",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.7)",
        animation: "slide-up 0.35s cubic-bezier(0.34,1.4,0.64,1)",
        position: "relative",
      }}
    >
      <button
        onClick={() => handleDismiss(true)}
        style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer", padding: 4 }}
        aria-label="Close"
        data-testid="button-dismiss-ios-chrome"
      >
        <X style={{ width: 17, height: 17 }} />
      </button>
      <p style={{ color: "#fff", fontWeight: 900, fontSize: 15, margin: "0 0 12px", fontFamily: "Oxanium, sans-serif", letterSpacing: "-0.02em" }}>
        Best experience in Safari
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(10,132,255,0.08)", borderRadius: 12, border: "1px solid rgba(10,132,255,0.2)" }}>
        <span style={{ fontSize: 22 }}>🧭</span>
        <div>
          <p style={{ color: "#0A84FF", fontWeight: 700, fontSize: 12, margin: 0, fontFamily: "Oxanium, sans-serif" }}>Open in Safari</p>
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, margin: "2px 0 0" }}>guberapp.app — then tap Share ↑</p>
        </div>
      </div>
    </div>
  );

  // Android non-Chrome — deep-link to Chrome (compact)
  if (iosMode === "android-chrome") {
    const chromeUrl = `intent://guberapp.app/#Intent;scheme=https;package=com.android.chrome;end`;
    const fallbackUrl = `https://guberapp.app`;
    const openInChrome = () => { window.location.href = chromeUrl; };
    const copyUrl = async () => {
      await navigator.clipboard.writeText(fallbackUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    };

    return backdrop(
      <div
        style={{
          background: "linear-gradient(135deg, #0d0d0d 0%, #181818 100%)", // dark-gradient-allow: install-prompt tray chrome, dark theme surface
          borderTop: "1px solid rgba(34,197,94,0.35)",
          borderRadius: "20px 20px 0 0",
          padding: "16px 16px 32px",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.7)",
          animation: "slide-up 0.35s cubic-bezier(0.34,1.4,0.64,1)",
          position: "relative",
        }}
      >
        <button
          onClick={() => handleDismiss(true)}
          style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer", padding: 4 }}
          aria-label="Close"
          data-testid="button-dismiss-android-chrome"
        >
          <X style={{ width: 17, height: 17 }} />
        </button>
        <p style={{ color: "#fff", fontWeight: 900, fontSize: 15, margin: "0 0 12px", fontFamily: "Oxanium, sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Best experience in Chrome
        </p>
        <button
          onClick={openInChrome}
          data-testid="button-open-in-chrome"
          style={{
            width: "100%", background: "#22C55E", color: "#000", border: "none",
            borderRadius: 12, padding: "12px 0", fontWeight: 900, fontSize: 14,
            fontFamily: "Oxanium, sans-serif", letterSpacing: "0.06em", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: "0 0 20px rgba(34,197,94,0.35)",
          }}
        >
          <span style={{ fontSize: 17 }}>🌐</span>
          OPEN IN CHROME
        </button>
        <button
          onClick={copyUrl}
          data-testid="button-copy-chrome-link"
          style={{
            marginTop: 10, width: "100%", background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12,
            padding: "10px 0", fontWeight: 700, fontSize: 13,
            fontFamily: "Oxanium, sans-serif", color: copied ? "#22C55E" : "rgba(255,255,255,0.5)",
            cursor: "pointer", letterSpacing: "0.04em", transition: "color 0.2s",
          }}
        >
          {copied ? "✓ Link Copied — Paste in Chrome" : "Copy Link Instead"}
        </button>
      </div>
    );
  }

  // Native install (Android Chrome / Desktop Chrome) — compact, no mascot
  if (!prompt) {
    // No native prompt yet but user tapped INSTALL — show generic guidance
    return backdrop(
      <div
        style={{
          background: "linear-gradient(135deg, #111 0%, #1a1a1a 100%)", // dark-gradient-allow: install-prompt tray chrome, dark theme surface
          border: "1px solid rgba(34,197,94,0.3)", borderBottom: "none",
          borderRadius: "20px 20px 0 0", padding: "16px 18px 28px",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.7)",
          animation: "slide-up 0.35s cubic-bezier(0.34,1.4,0.64,1)",
          position: "relative",
        }}
      >
        <button
          onClick={() => handleDismiss()}
          style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer", padding: 4 }}
          data-testid="button-dismiss-install"
          aria-label="Close"
        >
          <X style={{ width: 17, height: 17 }} />
        </button>
        <p style={{ color: "#fff", fontWeight: 900, fontSize: 16, margin: "0 0 4px", fontFamily: "Oxanium, sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>Install GUBER</p>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, margin: "0 0 12px", lineHeight: 1.4 }}>Add GUBER to your device for faster access and a smoother experience.</p>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, margin: 0, lineHeight: 1.5 }}>
          Use your browser menu and choose <b style={{ color: "#22C55E" }}>Add to Home Screen</b> or <b style={{ color: "#22C55E" }}>Install app</b>.
        </p>
      </div>
    );
  }

  return backdrop(
    <div
      style={{
        background: "linear-gradient(135deg, #111 0%, #1a1a1a 100%)", // dark-gradient-allow: install-prompt tray chrome, dark theme surface
        border: "1px solid rgba(34,197,94,0.3)", borderBottom: "none",
        borderRadius: "20px 20px 0 0", padding: "16px 18px 24px",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(34,197,94,0.08)",
        animation: "slide-up 0.35s cubic-bezier(0.34,1.4,0.64,1)",
        position: "relative",
      }}
    >
      <button
        onClick={() => handleDismiss()}
        style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
        data-testid="button-dismiss-install"
        aria-label="Close"
      >
        <X style={{ width: 17, height: 17 }} />
      </button>
      <p style={{ color: "#fff", fontWeight: 900, fontSize: 16, margin: "0 0 4px", fontFamily: "Oxanium, sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>Install GUBER</p>
      <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, margin: "0 0 12px", lineHeight: 1.4 }}>Add GUBER to your device for faster access and a smoother experience.</p>
      <button
        onClick={handleInstall}
        style={{ background: "#22C55E", color: "#000", border: "none", borderRadius: 12, padding: "11px 22px", fontWeight: 900, fontSize: 14, fontFamily: "Oxanium, sans-serif", letterSpacing: "0.06em", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7, boxShadow: "0 0 20px rgba(34,197,94,0.4)" }}
        data-testid="button-install-pwa"
      >
        <Download style={{ width: 15, height: 15 }} />
        INSTALL FREE
      </button>
    </div>
  );
}

// ── Small shared sub-components ──────────────────────────────────────────────

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 900, color: "#22C55E", fontFamily: "Oxanium, sans-serif" }}>{n}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {children}
      </div>
    </div>
  );
}

function Pill({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span style={{ background: "rgba(255,255,255,0.1)", borderRadius: 8, padding: "5px 12px", display: "inline-flex", alignItems: "center", gap: 6, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "Oxanium, sans-serif", border: "1px solid rgba(255,255,255,0.15)", ...style }}>
      {children}
    </span>
  );
}
