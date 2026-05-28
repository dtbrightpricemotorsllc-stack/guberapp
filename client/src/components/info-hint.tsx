import { useState } from "react";
import { X, Info } from "lucide-react";

interface InfoHintProps {
  title: string;
  description: string;
  bullets?: string[];
  warning?: string;
  learnMoreHref?: string;
  learnMoreLabel?: string;
  size?: "sm" | "md";
}

export function InfoHint({
  title,
  description,
  bullets,
  warning,
  learnMoreHref,
  learnMoreLabel = "Learn more",
  size = "sm",
}: InfoHintProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        aria-label={`Info: ${title}`}
        data-testid={`info-hint-${title.toLowerCase().replace(/\s+/g, "-")}`}
        className={`inline-flex items-center justify-center rounded-full text-gray-500 hover:text-gray-300 transition-colors align-middle ${size === "sm" ? "w-4 h-4 ml-1" : "w-5 h-5 ml-1.5"}`}
        style={{ verticalAlign: "middle", flexShrink: 0 }}
      >
        <Info className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl p-5 pb-8 space-y-3"
            style={{ background: "#111", border: "1px solid rgba(0,229,118,0.55)", borderBottom: "none" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center mb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "rgba(0,229,118,0.7)", border: "1px solid rgba(0,229,118,0.25)" }}>
                  <Info className="w-3.5 h-3.5 text-primary" />
                </div>
                <h3 className="font-display font-bold text-white text-sm">{title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10 transition-colors shrink-0"
                data-testid="info-hint-close"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-300 leading-relaxed pl-9">{description}</p>

            {/* Bullets */}
            {bullets && bullets.length > 0 && (
              <ul className="pl-9 space-y-1.5">
                {bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            )}

            {/* Warning */}
            {warning && (
              <div className="ml-9 p-3 rounded-xl text-xs text-amber-300 leading-relaxed"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                ⚠ {warning}
              </div>
            )}

            {/* Learn More */}
            {learnMoreHref && (
              <div className="pl-9">
                <a
                  href={learnMoreHref}
                  className="text-xs font-display font-bold text-primary hover:underline"
                  onClick={() => setOpen(false)}
                >
                  {learnMoreLabel} →
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
