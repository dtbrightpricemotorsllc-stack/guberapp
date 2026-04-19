import { useEffect, useState } from "react";
import { Download, X, Share, Plus } from "lucide-react";
import mascotImg from "@assets/Picsart_26-02-04_14-41-36-216_1772938444282.png";

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

const IOS_SNOOZE_KEY = "guber-ios-install-snoozed-until";

function isSnoozed() {
  const until = localStorage.getItem(IOS_SNOOZE_KEY);
  if (!until) return false;
  return Date.now() < Number(until);
}

function snooze() {
  const thirtyDays = Date.now() + 30 * 24 * 60 * 60 * 1000;
  localStorage.setItem(IOS_SNOOZE_KEY, String(thirtyDays));
}

export default function InstallPrompt() {
  const [prompt, setPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showInstalledConfirm, setShowInstalledConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [iosMode, setIosMode] = useState<"safari" | "not-safari" | "android-chrome" | null>(null);

  useEffect(() => {
    if (isAlreadyInstalled()) { setInstalled(true); return; }
    if (isSnoozed()) { setDismissed(true); return; }
    if (sessionStorage.getItem("pwa-install-dismissed")) { setDismissed(true); return; }

    if (isIOSSafari()) {
      setTimeout(() => setIosMode("safari"), 2500);
      return;
    }

    if (isIOSChrome() || isIOSOtherBrowser()) {
      setTimeout(() => setIosMode("not-safari"), 2500);
      return;
    }

    if (isAndroidNonChrome()) {
      setTimeout(() => setIosMode("android-chrome"), 2500);
      return;
    }

    const alreadyCaptured = (window as any).__installPromptEvent;
    if (alreadyCaptured) {
      setPrompt(alreadyCaptured);
    }

    const handler = (e: any) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setShowInstalledConfirm(true);
      setTimeout(() => setShowInstalledConfirm(false), 3000);
    });
    return () => window.removeEventListener("beforeinstallprompt", handler);
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
  };

  const handleDismiss = (persistent = false) => {
    if (persistent) snooze();
    else sessionStorage.setItem("pwa-install-dismissed", "1");
    setDismissed(true);
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

  // iOS Safari — icon-only step-by-step sheet
  if (iosMode === "safari" && !dismissed && !installed) return (
    <div
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
        background: "linear-gradient(135deg, #0d0d0d 0%, #181818 100%)",
        borderTop: "1px solid rgba(34,197,94,0.35)",
        borderRadius: "20px 20px 0 0",
        padding: "18px 16px 40px",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.7)",
        animation: "slide-up 0.45s cubic-bezier(0.34,1.4,0.64,1)",
      }}
    >
      <button
        onClick={() => handleDismiss(true)}
        style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer", padding: 4 }}
        aria-label="Not now"
        data-testid="button-dismiss-ios"
      >
        <X style={{ width: 17, height: 17 }} />
      </button>

      <p style={{ color: "#fff", fontWeight: 900, fontSize: 16, margin: "0 0 18px", fontFamily: "Oxanium, sans-serif", letterSpacing: "-0.02em" }}>
        Add GUBER to your home screen
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Step n={1}>
          <Pill><Share style={{ width: 14, height: 14 }} />Share</Pill>
        </Step>

        <Step n={2}>
          <Pill><Plus style={{ width: 14, height: 14 }} />Add to Home Screen</Pill>
        </Step>

        <Step n={3}>
          <Pill style={{ background: "rgba(10,132,255,0.18)", borderColor: "rgba(10,132,255,0.4)", color: "#0A84FF" }}>Add</Pill>
        </Step>
      </div>

      <AppCard />

      <button
        onClick={() => handleDismiss(true)}
        style={{ marginTop: 14, width: "100%", background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 12, cursor: "pointer", fontFamily: "Oxanium, sans-serif", letterSpacing: "0.04em", padding: "6px 0" }}
        data-testid="button-not-now-ios"
      >
        Not now
      </button>

      <style>{`@keyframes slide-up { from { transform: translateY(120px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );

  // iOS Chrome / Firefox — redirect to Safari
  if (iosMode === "not-safari" && !dismissed && !installed) return (
    <div
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
        background: "linear-gradient(135deg, #0d0d0d 0%, #181818 100%)",
        borderTop: "1px solid rgba(34,197,94,0.35)",
        borderRadius: "20px 20px 0 0",
        padding: "18px 16px 40px",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.7)",
        animation: "slide-up 0.45s cubic-bezier(0.34,1.4,0.64,1)",
      }}
    >
      <button
        onClick={() => handleDismiss(true)}
        style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer", padding: 4 }}
        aria-label="Not now"
        data-testid="button-dismiss-ios-chrome"
      >
        <X style={{ width: 17, height: 17 }} />
      </button>

      <p style={{ color: "#fff", fontWeight: 900, fontSize: 16, margin: "0 0 18px", fontFamily: "Oxanium, sans-serif", letterSpacing: "-0.02em" }}>
        Best experience in Safari
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(10,132,255,0.08)", borderRadius: 12, border: "1px solid rgba(10,132,255,0.2)" }}>
        <span style={{ fontSize: 22 }}>🧭</span>
        <div>
          <p style={{ color: "#0A84FF", fontWeight: 700, fontSize: 12, margin: 0, fontFamily: "Oxanium, sans-serif" }}>Open in Safari</p>
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, margin: "2px 0 0" }}>guberapp.app — then tap Share ↑</p>
        </div>
      </div>

      <button
        onClick={() => handleDismiss(true)}
        style={{ marginTop: 14, width: "100%", background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 12, cursor: "pointer", fontFamily: "Oxanium, sans-serif", letterSpacing: "0.04em", padding: "6px 0" }}
        data-testid="button-not-now-ios-chrome"
      >
        Not now
      </button>

      <style>{`@keyframes slide-up { from { transform: translateY(120px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );

  // Android non-Chrome — deep-link to Chrome
  if (iosMode === "android-chrome" && !dismissed && !installed) {
    const chromeUrl = `intent://guberapp.app/#Intent;scheme=https;package=com.android.chrome;end`;
    const fallbackUrl = `https://guberapp.app`;

    const openInChrome = () => { window.location.href = chromeUrl; };

    const copyUrl = async () => {
      await navigator.clipboard.writeText(fallbackUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    };

    return (
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
          background: "linear-gradient(135deg, #0d0d0d 0%, #181818 100%)",
          borderTop: "1px solid rgba(34,197,94,0.35)",
          borderRadius: "20px 20px 0 0",
          padding: "18px 16px 40px",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.7)",
          animation: "slide-up 0.45s cubic-bezier(0.34,1.4,0.64,1)",
        }}
      >
        <button
          onClick={() => handleDismiss(true)}
          style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer", padding: 4 }}
          aria-label="Not now"
          data-testid="button-dismiss-android-chrome"
        >
          <X style={{ width: 17, height: 17 }} />
        </button>

        <p style={{ color: "#fff", fontWeight: 900, fontSize: 16, margin: "0 0 18px", fontFamily: "Oxanium, sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Best experience in Chrome
        </p>

        <button
          onClick={openInChrome}
          data-testid="button-open-in-chrome"
          style={{
            width: "100%", background: "#22C55E", color: "#000", border: "none",
            borderRadius: 12, padding: "13px 0", fontWeight: 900, fontSize: 14,
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
            padding: "11px 0", fontWeight: 700, fontSize: 13,
            fontFamily: "Oxanium, sans-serif", color: copied ? "#22C55E" : "rgba(255,255,255,0.5)",
            cursor: "pointer", letterSpacing: "0.04em", transition: "color 0.2s",
          }}
        >
          {copied ? "✓ Link Copied — Paste in Chrome" : "Copy Link Instead"}
        </button>

        <button
          onClick={() => handleDismiss(true)}
          style={{ marginTop: 12, width: "100%", background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 12, cursor: "pointer", fontFamily: "Oxanium, sans-serif", letterSpacing: "0.04em", padding: "4px 0" }}
          data-testid="button-not-now-android-chrome"
        >
          Not now
        </button>

        <style>{`@keyframes slide-up { from { transform: translateY(120px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
      </div>
    );
  }

  if (!prompt || dismissed || installed) return null;

  // Android / Desktop Chrome — native install prompt
  return (
    <>
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          pointerEvents: "none",
          animation: "slide-up 0.45s cubic-bezier(0.34,1.4,0.64,1)",
        }}
      >
        <div style={{ position: "relative", width: "100%", maxWidth: 480 }}>
          <img
            src={mascotImg}
            alt="GUBER mascot"
            style={{ position: "absolute", bottom: 100, left: -8, width: 160, height: "auto", objectFit: "contain", zIndex: 2, filter: "drop-shadow(0 0 16px rgba(34,197,94,0.35))", pointerEvents: "none" }}
          />
          <div style={{ position: "absolute", bottom: 232, left: 108, background: "#fff", borderRadius: 14, padding: "8px 12px", fontSize: 13, fontWeight: 800, color: "#111", fontFamily: "Oxanium, sans-serif", whiteSpace: "nowrap", zIndex: 3, boxShadow: "0 4px 20px rgba(0,0,0,0.4)", pointerEvents: "none" }}>
            Download GUBER! 📲
            <div style={{ position: "absolute", bottom: -8, left: 18, width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: "9px solid #fff" }} />
          </div>
          <div
            style={{ background: "linear-gradient(135deg, #111 0%, #1a1a1a 100%)", border: "1px solid rgba(34,197,94,0.3)", borderBottom: "none", borderRadius: "20px 20px 0 0", padding: "18px 16px 28px 148px", boxShadow: "0 -8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(34,197,94,0.08)", pointerEvents: "all", position: "relative", zIndex: 1 }}
          >
            <button
              onClick={() => handleDismiss()}
              style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
              data-testid="button-dismiss-install"
              aria-label="Dismiss"
            >
              <X style={{ width: 17, height: 17 }} />
            </button>
            <p style={{ color: "#fff", fontWeight: 900, fontSize: 17, margin: "0 0 3px", fontFamily: "Oxanium, sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>INSTALL GUBER</p>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, margin: "0 0 14px", lineHeight: 1.4 }}>Install GUBER — takes 2 seconds</p>
            <button
              onClick={handleInstall}
              style={{ background: "#22C55E", color: "#000", border: "none", borderRadius: 12, padding: "11px 22px", fontWeight: 900, fontSize: 14, fontFamily: "Oxanium, sans-serif", letterSpacing: "0.06em", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7, boxShadow: "0 0 20px rgba(34,197,94,0.4)" }}
              data-testid="button-install-pwa"
            >
              <Download style={{ width: 15, height: 15 }} />
              INSTALL FREE
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes slide-up { from { transform: translateY(120px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </>
  );
}

// ── Small shared sub-components ──────────────────────────────────────────────

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 900, color: "#22C55E", fontFamily: "Oxanium, sans-serif" }}>{n}</span>
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

function AppCard() {
  return (
    <div style={{ marginTop: 18, padding: "10px 14px", background: "rgba(34,197,94,0.08)", borderRadius: 12, border: "1px solid rgba(34,197,94,0.15)", display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, background: "#22C55E", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 14, fontWeight: 900, color: "#000", fontFamily: "Oxanium, sans-serif" }}>G</div>
      <div>
        <p style={{ color: "#fff", fontWeight: 700, fontSize: 12, margin: 0, fontFamily: "Oxanium, sans-serif" }}>GUBER</p>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 10, margin: 0 }}>guberapp.app</p>
      </div>
      <div style={{ marginLeft: "auto" }}>
        <div style={{ background: "#22C55E", color: "#000", borderRadius: 8, padding: "4px 12px", fontSize: 11, fontWeight: 900, fontFamily: "Oxanium, sans-serif" }}>FREE</div>
      </div>
    </div>
  );
}
