import { useState, useEffect } from "react";
import { X, ArrowLeft } from "lucide-react";

function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function hasPurchaseParam(): boolean {
  if (typeof window === "undefined") return false;
  const sp = new URLSearchParams(window.location.search);
  return sp.get("purchased") === "1" || sp.get("purchase") === "success";
}

interface MobileReturnBannerProps {
  show: boolean;
  /**
   * Query-param keys to strip from the URL once the banner has mounted.
   * Only pass params that are no longer needed by the host page after the
   * banner appears. Pages that need their params for ongoing logic (e.g.
   * ai-or-not polling, og-success mutation) should omit this and do their
   * own cleanup.
   */
  paramsToStrip?: string[];
}

export function MobileReturnBanner({ show, paramsToStrip }: MobileReturnBannerProps) {
  // Latch shouldShow in state so that stripping the URL params (which causes
  // the parent to re-render with show=false) doesn't make the banner disappear
  // before the user has a chance to see or dismiss it.
  const [shouldShow] = useState(() => show || hasPurchaseParam());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!shouldShow || !isMobileBrowser()) return;
    const url = new URL(window.location.href);
    // Always strip the params that hasPurchaseParam() detects — they are
    // never used for ongoing page logic.
    const toStrip = ["purchased", "purchase", ...(paramsToStrip ?? [])];
    let changed = false;
    for (const key of toStrip) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) {
      window.history.replaceState({}, "", url.pathname + (url.search || ""));
    }
  }, []); // run once on mount — params are stable

  if (!shouldShow || dismissed || !isMobileBrowser()) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-3 bg-emerald-600 text-white shadow-lg"
      data-testid="banner-mobile-return"
      role="alert"
    >
      <ArrowLeft className="w-4 h-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">Purchase complete</p>
        <a
          href="guber://"
          className="text-xs text-white/90 underline underline-offset-2"
          data-testid="link-return-to-app"
        >
          Tap here to return to the GUBER app
        </a>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 rounded-full hover:bg-white/20 transition-colors shrink-0"
        aria-label="Dismiss"
        data-testid="button-dismiss-return-banner"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
