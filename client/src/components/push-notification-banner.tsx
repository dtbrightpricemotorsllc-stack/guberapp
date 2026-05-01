import { useState, useEffect } from "react";
import { BellRing, BellOff, Smartphone, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPushStatus, subscribeToPush, type PushStatus } from "@/lib/push";
import { useAuth } from "@/lib/auth-context";
import { isIOS as isNativeIOS } from "@/lib/platform";
import { useLocation } from "wouter";

const DISMISS_KEY = "guber_push_banner_dismissed";
const IOS_SOUND_HINT_KEY = "guber_ios_sound_hint_dismissed";

function isIPhoneUser(): boolean {
  if (isNativeIOS) return true;
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function PushNotificationBanner() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [iosSoundHintDismissed, setIosSoundHintDismissed] = useState(true);

  useEffect(() => {
    const wasDismissed = localStorage.getItem(DISMISS_KEY) === "1";
    setDismissed(wasDismissed);
    setIosSoundHintDismissed(localStorage.getItem(IOS_SOUND_HINT_KEY) === "1");
    setStatus(getPushStatus());
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const handleDismissIosSoundHint = () => {
    localStorage.setItem(IOS_SOUND_HINT_KEY, "1");
    setIosSoundHintDismissed(true);
  };

  const handleEnable = async () => {
    if (!user?.id) return;
    setEnabling(true);
    // Trust the boolean result — getPushStatus() always returns "default"
    // on native iOS/Android, so we'd otherwise never advance to "granted".
    const granted = await subscribeToPush(user.id);
    if (granted) {
      setStatus("granted");
      localStorage.removeItem(DISMISS_KEY);
      setDismissed(true);
    } else {
      // Refresh from getPushStatus() to catch web "denied" transitions; on
      // native this still returns "default", which is harmless because the
      // banner re-renders on next mount once the in-memory hint changes.
      setStatus(getPushStatus());
    }
    setEnabling(false);
  };

  if (!status) return null;

  if (status === "granted") {
    if (!iosSoundHintDismissed && isIPhoneUser()) {
      return (
        <div
          className="mx-4 mt-3 mb-0 rounded-xl border border-blue-500/30 bg-blue-500/[0.08] p-3 flex items-start gap-3"
          data-testid="banner-ios-sound-hint"
        >
          <Volume2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blue-300">Heads up about iPhone alert sounds</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              iOS plays GUBER's custom alert sounds while the app is open. Locked-screen alerts use your iPhone's default notification sound — make sure your ringer is on and Focus is off.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                className="bg-blue-500 hover:bg-blue-400 active:scale-95 text-white font-semibold text-[11px] h-7 px-3"
                onClick={handleDismissIosSoundHint}
                data-testid="button-dismiss-ios-sound-hint"
              >
                Got it
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-blue-300 hover:text-blue-200 hover:bg-blue-500/10 active:scale-95 font-semibold text-[11px] h-7 px-3"
                onClick={() => {
                  handleDismissIosSoundHint();
                  setLocation("/account-settings#test-sounds");
                }}
                data-testid="button-test-sounds-link"
              >
                Test sounds
              </Button>
            </div>
          </div>
          <button
            onClick={handleDismissIosSoundHint}
            className="text-muted-foreground hover:text-muted-foreground transition-colors shrink-0 mt-0.5"
            data-testid="button-close-ios-sound-hint"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }
    return null;
  }

  if (dismissed) return null;
  if (status === "unsupported") return null;

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
          className="text-muted-foreground hover:text-muted-foreground transition-colors shrink-0 mt-0.5"
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
            <span className="text-foreground font-semibold">guberapp.app</span> to receive job updates.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-muted-foreground transition-colors shrink-0 mt-0.5"
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
          className="text-muted-foreground hover:text-muted-foreground transition-colors p-0.5"
          data-testid="button-dismiss-push-banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
