import { useState } from "react";
import { useLocation } from "wouter";
import { MapPin, Camera, Video, Radio, ClipboardList, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SeeForMeContext {
  title?: string;
  category?: string;
  location?: string;
  listingId?: number;
  listingUrl?: string;
  price?: string;
  imageUrl?: string;
  vin?: string;
  address?: string;
}

interface SeeForMeActionProps {
  context?: SeeForMeContext;
  variant?: "button" | "icon-label" | "compact";
  className?: string;
}

function EyesIcon({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className ?? ""}`} aria-hidden="true">
      <svg width="18" height="12" viewBox="0 0 18 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="4.5" cy="6" rx="4.5" ry="6" fill="currentColor" fillOpacity="0.12"/>
        <ellipse cx="4.5" cy="6" rx="4.5" ry="6" stroke="currentColor" strokeWidth="1.2"/>
        <circle cx="4.5" cy="6" r="2" fill="currentColor"/>
        <ellipse cx="13.5" cy="6" rx="4.5" ry="6" fill="currentColor" fillOpacity="0.12"/>
        <ellipse cx="13.5" cy="6" rx="4.5" ry="6" stroke="currentColor" strokeWidth="1.2"/>
        <circle cx="13.5" cy="6" r="2" fill="currentColor"/>
      </svg>
    </span>
  );
}

const MODES = [
  { id: "photos", icon: Camera, label: "Take photos", desc: "Capture requested shots" },
  { id: "video", icon: Video, label: "Record a video", desc: "Walk-around or specific clips" },
  { id: "live", icon: Radio, label: "Show it live", desc: "Join a live video walkthrough" },
  { id: "checklist", icon: ClipboardList, label: "Follow my checklist", desc: "Custom instructions on location" },
];

export default function SeeForMeAction({ context = {}, variant = "icon-label", className = "" }: SeeForMeActionProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [, navigate] = useLocation();

  function toggleMode(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function handleContinue() {
    const params = new URLSearchParams();
    params.set("sfm", "1");
    if (context.title) params.set("sfm_title", context.title);
    if (context.location || context.address) params.set("sfm_location", context.location || context.address || "");
    if (context.category) params.set("sfm_cat", context.category);
    if (context.listingId) params.set("sfm_listing", String(context.listingId));
    if (selected.length) params.set("sfm_modes", selected.join(","));
    setOpen(false);
    navigate(`/verify-inspect?${params.toString()}`);
  }

  const trigger = variant === "button" ? (
    <Button
      variant="outline"
      size="sm"
      className={`gap-2 font-display tracking-wide text-xs border-primary/40 hover:border-primary hover:bg-primary/5 ${className}`}
      onClick={() => setOpen(true)}
      aria-label="Start a See For Me request"
      data-testid="button-see-for-me"
    >
      <EyesIcon />
      See For Me
    </Button>
  ) : variant === "compact" ? (
    <button
      className={`inline-flex items-center gap-1 text-[11px] font-display font-bold text-primary hover:text-primary/80 transition-colors ${className}`}
      onClick={() => setOpen(true)}
      aria-label="Start a See For Me request"
      data-testid="button-see-for-me-compact"
    >
      <EyesIcon className="text-primary" />
      See For Me
    </button>
  ) : (
    <button
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-display font-bold transition-all active:scale-95 ${className}`}
      style={{ background: "rgba(139,92,246,0.10)", border: "1px solid rgba(139,92,246,0.35)", color: "#a78bfa" }}
      onClick={() => setOpen(true)}
      aria-label="Start a See For Me request"
      data-testid="button-see-for-me-icon-label"
    >
      <EyesIcon />
      See For Me
    </button>
  );

  return (
    <>
      {trigger}

      {open && (
        <div
          className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-card rounded-t-3xl pb-[calc(24px+env(safe-area-inset-bottom,0px))]"
            style={{ border: "1px solid rgba(139,92,246,0.3)", borderBottom: "none" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div className="flex items-center gap-2">
                <EyesIcon className="text-violet-400 scale-125" />
                <span className="font-display font-black tracking-wide text-base">See For Me</span>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-full hover:bg-white/10" aria-label="Close">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <p className="px-5 text-sm text-muted-foreground mb-1">
              Send someone to be your eyes on location.
            </p>

            {context.title && (
              <div className="mx-5 mb-4 mt-2 rounded-xl px-3 py-2.5 flex items-start gap-2"
                style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.2)" }}>
                {context.imageUrl && (
                  <img src={context.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-display font-bold truncate">{context.title}</p>
                  {(context.location || context.address) && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      {context.location || context.address}
                    </p>
                  )}
                </div>
              </div>
            )}

            <p className="px-5 text-[11px] font-display font-bold text-muted-foreground tracking-widest uppercase mb-3">
              What do you want?
            </p>

            <div className="px-5 space-y-2 mb-5">
              {MODES.map(({ id, icon: Icon, label, desc }) => {
                const active = selected.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggleMode(id)}
                    className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all active:scale-[0.99]"
                    style={active
                      ? { background: "rgba(139,92,246,0.14)", border: "1.5px solid rgba(139,92,246,0.55)" }
                      : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                    data-testid={`option-sfm-${id}`}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-violet-400" : "text-muted-foreground"}`} />
                    <div className="flex-1">
                      <p className={`text-sm font-display font-bold ${active ? "text-violet-300" : "text-foreground"}`}>{label}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                    {active && <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(139,92,246,0.5)" }}>
                      <div className="w-2 h-2 rounded-full bg-violet-300" />
                    </div>}
                  </button>
                );
              })}
            </div>

            <div className="px-5 mb-3">
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                The person on location follows your instructions and documents only what they directly observe. They do not guarantee condition, authenticity, safety, or value.
              </p>
            </div>

            <div className="px-5">
              <Button
                className="w-full font-display tracking-wide premium-btn gap-2"
                onClick={handleContinue}
                data-testid="button-sfm-continue"
              >
                <EyesIcon />
                {selected.length ? "Continue to See For Me" : "Browse See For Me"}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
