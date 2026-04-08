import { useState, useEffect } from "react";
import { BellRing, BellOff, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPushStatus, subscribeToPush, type PushStatus } from "@/lib/push";
import { useAuth } from "@/lib/auth-context";

const DISMISS_KEY = "guber_push_banner_dismissed";

export function PushNotificationBanner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    const wasDismissed = localStorage.getItem(DISMISS_KEY) === "1";
    setDismissed(wasDismissed);
    setStatus(getPushStatus());
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const handleEnable = async () => {
    if (!user?.id) return;
    setEnabling(true);
    await subscribeToPush(user.id);
    const next = getPushStatus();
    setStatus(next);
    if (next === "granted") {
      localStorage.removeItem(DISMISS_KEY);
      setDismissed(true);
    }
    setEnabling(false);
  };

  if (!status || dismissed) return null;
  if (status === "granted" || status === "unsupported") return null;

  if (status === "ios-needs-install") {
    return (
      <div
        className="mx-4 mt-3 mb-0 rounded-xl border border-blue-500/30 bg-blue-500/[0.08] p-3 flex items-start gap-3"
        data-testid="banner-push-ios"
      >
        <Smartphone className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-blue-300">Add to Home Screen to get alerts</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            Push alerts only work when GUBER is installed. In Safari, tap{" "}
            <span className="text-blue-300 font-semibold">Share → "Add to Home Screen"</span>.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0 mt-0.5"
          data-testid="button-dismiss-push-banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div
        className="mx-4 mt-3 mb-0 rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3 flex items-start gap-3"
        data-testid="banner-push-denied"
      >
        <BellOff className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-red-300">Alerts are blocked</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            Go to your browser or phone settings and allow notifications for{" "}
            <span className="text-foreground/70 font-semibold">guberapp.app</span> to receive job updates.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0 mt-0.5"
          data-testid="button-dismiss-push-banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="mx-4 mt-3 mb-0 rounded-xl border border-yellow-500/30 bg-yellow-500/[0.07] p-3 flex items-center gap-3"
      data-testid="banner-push-default"
    >
      <BellRing className="w-4 h-4 text-yellow-400 shrink-0 animate-pulse" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-yellow-300">Turn on job alerts</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
          Get instant push alerts when someone accepts your job or pays you
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="sm"
          className="bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-black font-bold text-[11px] h-7 px-3"
          onClick={handleEnable}
          disabled={enabling}
          data-testid="button-enable-push"
        >
          {enabling ? "…" : "Enable"}
        </Button>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-0.5"
          data-testid="button-dismiss-push-banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
