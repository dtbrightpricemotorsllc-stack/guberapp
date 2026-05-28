import { useEffect, useRef, useState } from "react";
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

const SNOOZE_KEY = "guber-install-snoozed-until";
const SESSION_DISMISS_KEY = "pwa-install-dismissed";
const BANNER_DISMISS_KEY = "guber-install-banner-dismissed";
const INSTALLED_KEY = "guber-pwa-installed";
const POSTAUTH_KEY = "guber-install-postauth-until";
const OPEN_EVENT = "guber:open-install";

function isStandaloneNow() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

// Once we've ever seen standalone mode, remember it. Google OAuth bounces the
// user out to the system browser tab, which momentarily breaks the standalone
// check on return — so the persisted flag is what we trust after install.
function isAlreadyInstalled() {
  if (isStandaloneNow()) {
    if (localStorage.getItem(INSTALLED_KEY) !== "1") {
      localStorage.setItem(INSTALLED_KEY, "1");
    }
    return true;
  }
  return localStorage.getItem(INSTALLED_KEY) === "1";
}

function isSnoozed() {
  const until = localStorage.getItem(SNOOZE_KEY);
  if (!until) return false;
  return Date.now() < Number(until);
}

function isPostAuthCooldown() {
  const until = sessionStorage.getItem(POSTAUTH_KEY);
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

// Base eligibility used by the InstallHint button — the user-initiated entry
// point. The hint is never suppressed by the post-OAuth cooldown so a
// determined user can still self-trigger the install flow right away.
function isInstallEligible(): boolean {
  if (isAlreadyInstalled()) return false;
  if (isSnoozed()) return false;
  if (sessionStorage.getItem(SESSION_DISMISS_KEY)) return false;
  return detectMode() !== null;
}

// Eligibility for the unsolicited mascot auto-fire — adds the post-OAuth
// cooldown so the bubble doesn't pop up the moment the user lands back from
// Google sign-in.
function isMascotEligible(): boolean {
  if (!isInstallEligible()) return false;
  if (isPostAuthCooldown()) return false;
  return true;
}

// Shared eligibility hook — also schedules a recheck when the post-OAuth
// cooldown is set to expire so the prompt becomes available again without a
// page reload, and re-evaluates whenever the tab returns to foreground.
function useInstallEligible(check: () => boolean = isInstallEligible) {
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    let cooldownTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleCooldownRecheck = () => {
      if (cooldownTimer) {
        clearTimeout(cooldownTimer);
        cooldownTimer = null;
      }
      const until = Number(sessionStorage.getItem(POSTAUTH_KEY) || "0");
      const remaining = until - Date.now();
      if (remaining > 0) {
        // small buffer so the recheck happens just after expiry
        cooldownTimer = setTimeout(() => {
          cooldownTimer = null;
          recheck();
        }, remaining + 50);
      }
    };

    const recheck = () => {
      setEligible(check());
      scheduleCooldownRecheck();
    };

    recheck();

    const onVisibility = () => {
      if (document.visibilityState === "visible") recheck();
    };

    const handler = () => recheck();
    const onInstalled = () => {
      // Persist the flag now even if standalone hasn't been observed yet —
      // covers cases where the OS installs the PWA without an immediate
      // standalone launch.
      try {
        localStorage.setItem(INSTALLED_KEY, "1");
      } catch {}
      setEligible(false);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", onInstalled);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
      document.removeEventListener("visibilitychange", onVisibility);
      if (cooldownTimer) clearTimeout(cooldownTimer);
    };
  }, [check]);

  return eligible;
}

// ── Tiny right-aligned text-button hint (replaces full banner) ────────────────
export function InstallHint() {
  // Hint stays available even during the post-OAuth cooldown so a determined
  // user can self-trigger the install flow immediately.
  const eligible = useInstallEligible(isInstallEligible);

  if (!eligible) return null;

  return (
    <div className="flex justify-end -mt-1 mb-1.5">
      <button
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT))}
        className="text-[10px] font-display tracking-[0.12em] text-emerald-400/70 hover:text-emerald-400 transition-colors px-1 py-0.5"
        data-testid="link-install-hint"
      >
        Install ⚡
      </button>
    </div>
  );
}

// ── Floating mascot helper (subtle, anchored bottom-right) ────────────────────
export function InstallMascot() {
  // Mascot honors the post-OAuth cooldown so the unsolicited bubble doesn't
  // pop up right after a Google sign-in round trip.
  const eligible = useInstallEligible(isMascotEligible);
  const [showBubble, setShowBubble] = useState(false);
  const bubbleShownRef = useRef(
    typeof window !== "undefined" && sessionStorage.getItem("guber-mascot-bubble-shown") === "1"
  );
  const triggerArmedRef = useRef(false);

  // Arm the speech-bubble trigger once eligible — first scroll OR ~6s timer.
  // The 6s timer requires the page to actually be visible for the full delay,
  // so it doesn't fire while the tab is backgrounded during a Google OAuth
  // round trip and pop up the moment the user lands back on the dashboard.
  useEffect(() => {
    if (!eligible || bubbleShownRef.current || triggerArmedRef.current) return;
    triggerArmedRef.current = true;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const VISIBLE_DELAY_MS = 6000;

    const fire = () => {
      if (bubbleShownRef.current) return;
      bubbleShownRef.current = true;
      sessionStorage.setItem("guber-mascot-bubble-shown", "1");
      setShowBubble(true);
      setTimeout(() => setShowBubble(false), 3000);
      window.removeEventListener("scroll", scrollTrigger);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
    };

    const scrollTrigger = () => {
      if (document.visibilityState === "visible") fire();
    };

    const startTimer = () => {
      if (timer || bubbleShownRef.current) return;
      timer = setTimeout(() => {
        timer = null;
        if (document.visibilityState === "visible") fire();
      }, VISIBLE_DELAY_MS);
    };

    const cancelTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") startTimer();
      else cancelTimer();
    };

    if (document.visibilityState === "visible") startTimer();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("scroll", scrollTrigger, { passive: true });

    return () => {
      cancelTimer();
      window.removeEventListener("scroll", scrollTrigger);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [eligible]);

  if (!eligible) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 10,
        bottom: 84, // safe margin above bottom nav (~64px)
        zIndex: 40, // below modal (9999) and toasts but above content
        pointerEvents: "none",
      }}
      data-testid="install-mascot-anchor"
    >
      {showBubble && (
        <div
          style={{
            position: "absolute",
            bottom: 70,
            right: 0,
            background: "#fff",
            borderRadius: 12,
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 800,
            color: "#111",
            fontFamily: "Oxanium, sans-serif",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            animation: "mascot-bubble-in 0.28s cubic-bezier(0.34,1.4,0.64,1)",
            pointerEvents: "none",
          }}
        >
          Install GUBER ⚡
          <div
            style={{
              position: "absolute",
              bottom: -7,
              right: 18,
              width: 0,
              height: 0,
              borderLeft: "7px solid transparent",
              borderRight: "7px solid transparent",
              borderTop: "8px solid #fff",
            }}
          />
        </div>
      )}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT))}
        aria-label="Install GUBER"
        data-testid="button-install-mascot"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          pointerEvents: "auto",
          filter: "drop-shadow(0 0 10px rgba(34,197,94,0.35))",
          transition: "transform 0.18s ease",
        }}
        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.94)")}
        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        <img
          src={mascotImg}
          alt="GUBER mascot"
          style={{ width: 64, height: "auto", display: "block", objectFit: "contain" }}
        />
      </button>
      <style>{`@keyframes mascot-bubble-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
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
    const onInstalled = () => {
      setInstalled(true);
      setOpen(false);
      setShowInstalledConfirm(true);
      setTimeout(() => setShowInstalledConfirm(false), 3000);
    };
    window.addEventListener("appinstalled", onInstalled);

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
      window.removeEventListener("appinstalled", onInstalled);
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
            border: "1px solid rgba(0,229,118,0.55)", borderRadius: 12,
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
