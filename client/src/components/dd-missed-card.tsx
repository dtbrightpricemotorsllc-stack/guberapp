import { useLocation } from "wouter";
import { X, ChevronRight, Clock } from "lucide-react";

export interface DDMissedItem {
  id: string;
  emoji: string;
  title: string;
  description: string;
  action: string;
  route: string;
}

interface Props {
  items: DDMissedItem[];
  onDismiss: () => void;
  onRemindLater: () => void;
}

export function DDMissedCard({ items, onDismiss, onRemindLater }: Props) {
  const [, navigate] = useLocation();

  if (!items.length) return null;

  return (
    <div
      className="rounded-2xl p-4 mb-4 space-y-3 relative animate-fade-in"
      style={{
        background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(0,229,118,0.07))",
        border: "1.5px solid rgba(139,92,246,0.28)",
      }}
      data-testid="card-dd-missed"
    >
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-white/30 hover:text-white/70 transition-colors"
        style={{ background: "rgba(255,255,255,0.04)" }}
        data-testid="button-dd-dismiss-x"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div>
        <p className="text-[10px] font-display font-bold tracking-widest uppercase mb-0.5"
           style={{ color: "hsl(270 100% 75%)" }}>
          Jac · Welcome Back
        </p>
        <p className="text-sm font-display font-bold text-white">Here's what you missed.</p>
      </div>

      <div className="space-y-1.5">
        {items.slice(0, 5).map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(item.route)}
            className="w-full flex items-center gap-3 text-left rounded-xl px-3 py-2.5 transition-all active:scale-[0.98]"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
            data-testid={`button-dd-missed-${item.id}`}
          >
            <span className="text-base flex-shrink-0 leading-none">{item.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white leading-snug truncate">{item.title}</p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{item.description}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-[10px] font-display font-bold" style={{ color: "hsl(270 100% 75%)" }}>
                {item.action}
              </span>
              <ChevronRight className="w-3 h-3" style={{ color: "hsl(270 100% 75%)" }} />
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-0.5">
        <button
          onClick={onRemindLater}
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-white/70 transition-colors font-display tracking-wide"
          data-testid="button-dd-remind-later"
        >
          <Clock className="w-3 h-3" /> Remind me later
        </button>
        <span className="text-muted-foreground/30 text-[10px]">·</span>
        <button
          onClick={onDismiss}
          className="text-[10px] text-muted-foreground hover:text-white/70 transition-colors font-display tracking-wide"
          data-testid="button-dd-dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
