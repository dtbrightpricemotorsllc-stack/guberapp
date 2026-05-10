import { useState } from "react";
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
}

export function MobileReturnBanner({ show }: MobileReturnBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  const shouldShow = show || hasPurchaseParam();
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
          href="guber://purchase-complete"
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
