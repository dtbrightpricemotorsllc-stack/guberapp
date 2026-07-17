import { useEffect, useState } from "react";
import { MapPin, Navigation, ShieldCheck, X } from "lucide-react";
import {
  dismissBackgroundLocationDisclosure,
  requestBackgroundLocationFromOS,
  resolveBackgroundLocationDisclosure,
} from "@/lib/background-location";

type Context = "job" | "load_board" | "asset_protection";
type Platform = "android" | "ios";

interface ModalCopy {
  title: string;
  reason: string;
  platformNote: string;
  enableLabel: string;
}

function getCopy(context: Context, platform: Platform): ModalCopy {
  const reasons: Record<Context, string> = {
    job: "GUBER needs to track your location while the app is in the background so hirers receive live updates during your active job. Tracking stops automatically when the job ends.",
    load_board: "Shippers need real-time location updates while you're hauling their load. GUBER only tracks your location during an active transport job — never otherwise.",
    asset_protection: "GUBER needs continuous location access to monitor and report on your protected asset during the trip. Tracking is active only for the duration of the protection job.",
  };

  const titles: Record<Context, string> = {
    job: "Background Location Access",
    load_board: "Background Location for Transport",
    asset_protection: "Background Location for Asset Protection",
  };

  const platformNote =
    platform === "ios"
      ? 'iOS will ask you to allow location access \u201CAlways\u201D. This is only used while a job is active \u2014 GUBER never tracks you outside of active sessions.'
      : 'On Android 11+, tapping Enable will open your device\'s location settings — select "Allow all the time" to enable background tracking.';

  const enableLabel =
    platform === "ios" ? "Allow Background Location" : "Enable Background Location";

  return { title: titles[context], reason: reasons[context], platformNote, enableLabel };
}

export function BackgroundLocationModal() {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<Context>("job");
  const [platform, setPlatform] = useState<Platform>("android");
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { context?: Context; platform?: Platform } | undefined;
      const ctx = detail?.context;
      const plt = detail?.platform;
      setContext(ctx && ["job", "load_board", "asset_protection"].includes(ctx) ? ctx : "job");
      setPlatform(plt === "ios" ? "ios" : "android");
      setOpen(true);
    };
    window.addEventListener("guber:show-bg-location-disclosure", handler);
    return () => window.removeEventListener("guber:show-bg-location-disclosure", handler);
  }, []);

  if (!open) return null;

  const copy = getCopy(context, platform);

  const handleEnable = async () => {
    setRequesting(true);
    try {
      if (platform === "ios") {
        // On iOS, we just acknowledge the disclosure — bgStartWatch's
        // requestPermissions:true will trigger the actual OS dialog immediately after.
        resolveBackgroundLocationDisclosure(true);
      } else {
        const status = await requestBackgroundLocationFromOS();
        resolveBackgroundLocationDisclosure(status === "granted");
      }
    } catch {
      resolveBackgroundLocationDisclosure(false);
    } finally {
      setRequesting(false);
      setOpen(false);
    }
  };

  const handleDismiss = () => {
    setOpen(false);
    dismissBackgroundLocationDisclosure();
  };

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center px-5 bg-black/65 backdrop-blur-sm"
      data-testid="modal-background-location"
      onClick={handleDismiss}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)",
          border: "1.5px solid rgba(0,229,229,0.45)",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(0,229,229,0.12)", border: "1px solid rgba(0,229,229,0.25)" }}
            >
              <Navigation className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-display font-black text-foreground tracking-wide">{copy.title}</p>
              <p className="text-[10px] text-muted-foreground font-display tracking-wider uppercase">
                GUBER Location Notice
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0"
            aria-label="Dismiss"
            data-testid="button-bg-location-dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Disclosure body */}
        <div
          className="rounded-2xl p-4 space-y-2"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,229,229,0.3)" }}
        >
          <div className="flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/90 leading-relaxed">{copy.reason}</p>
          </div>
          <div className="flex items-start gap-2 pt-1">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {copy.platformNote}
            </p>
          </div>
        </div>

        {/* Actions */}
        <button
          onClick={handleEnable}
          disabled={requesting}
          className="w-full rounded-2xl py-3 text-sm font-display font-black tracking-wider text-black transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #00E5E5, #0099AA)" }}
          data-testid="button-bg-location-enable"
        >
          {requesting ? "Opening settings…" : copy.enableLabel}
        </button>

        <button
          onClick={handleDismiss}
          className="w-full rounded-2xl py-2.5 text-xs font-display font-bold tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-bg-location-not-now"
        >
          Not now — track only while app is open
        </button>
      </div>
    </div>
  );
}
