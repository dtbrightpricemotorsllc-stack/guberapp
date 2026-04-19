import { useEffect, useState } from "react";
import { MapPin, ShieldCheck } from "lucide-react";
import { acceptGpsDisclaimer } from "@/lib/gps";

export function GpsDisclaimerModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("guber:show-gps-disclaimer", handler);
    return () => window.removeEventListener("guber:show-gps-disclaimer", handler);
  }, []);

  if (!open) return null;

  const handleConfirm = () => {
    acceptGpsDisclaimer();
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-5 bg-black/60 backdrop-blur-sm"
      data-testid="modal-gps-disclaimer"
    >
      <div
        className="w-full max-w-sm rounded-3xl p-6 space-y-4"
        style={{ background: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)", border: "1.5px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.25)" }}>
            <MapPin className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-display font-black text-foreground tracking-wide">Location Access</p>
            <p className="text-[10px] text-muted-foreground font-display tracking-wider uppercase">GUBER GPS Notice</p>
          </div>
        </div>

        <div className="rounded-2xl p-4 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/90 leading-relaxed">
              GUBER uses your GPS location to verify your position and improve your experience.
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed pl-5">
            By continuing, you agree that GUBER is not liable for any personal injury, loss, property damage, or incidents that occur while traveling to or participating in any location-based activity. Always obey traffic laws and be aware of your surroundings. Participation is at your own risk.
          </p>
        </div>

        <button
          onClick={handleConfirm}
          className="w-full rounded-2xl py-3 text-sm font-display font-black tracking-wider text-black transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #22C55E, #16A34A)" }}
          data-testid="button-gps-disclaimer-confirm"
        >
          Got it, continue
        </button>
      </div>
    </div>
  );
}
