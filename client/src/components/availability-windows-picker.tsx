import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Calendar as CalendarIcon, Clock } from "lucide-react";

export type AvailabilityWindow = {
  date: string;
  startTime: string;
  endTime: string;
};

type Props = {
  value: AvailabilityWindow[];
  onChange: (next: AvailabilityWindow[]) => void;
  className?: string;
  variant?: "default" | "biz";
  helperText?: string;
};

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isPastWindow(w: AvailabilityWindow): boolean {
  if (!w.date || !w.endTime) return false;
  const [eh, em] = w.endTime.split(":").map(Number);
  const [y, mo, d] = w.date.split("-").map(Number);
  const end = new Date(y, (mo ?? 1) - 1, d ?? 1, eh ?? 0, em ?? 0, 0, 0);
  return end.getTime() <= Date.now();
}

export function isValidWindow(w: AvailabilityWindow): boolean {
  if (!w.date || !w.startTime || !w.endTime) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(w.date)) return false;
  if (!/^\d{2}:\d{2}$/.test(w.startTime) || !/^\d{2}:\d{2}$/.test(w.endTime)) return false;
  if (w.startTime >= w.endTime) return false;
  if (isPastWindow(w)) return false;
  return true;
}

export function hasAtLeastOneFutureWindow(arr: AvailabilityWindow[]): boolean {
  return Array.isArray(arr) && arr.some(isValidWindow);
}

export function AvailabilityWindowsPicker({
  value,
  onChange,
  className = "",
  variant = "default",
  helperText,
}: Props) {
  const [error, setError] = useState<string>("");

  const blank = (): AvailabilityWindow => ({ date: todayLocal(), startTime: "09:00", endTime: "12:00" });

  const addWindow = () => {
    const next = [...value, blank()];
    onChange(next);
    setError("");
  };

  const removeWindow = (i: number) => {
    const next = value.filter((_, idx) => idx !== i);
    onChange(next);
  };

  const updateWindow = (i: number, patch: Partial<AvailabilityWindow>) => {
    const next = value.map((w, idx) => (idx === i ? { ...w, ...patch } : w));
    onChange(next);
    const candidate = next[i];
    if (candidate.startTime && candidate.endTime && candidate.startTime >= candidate.endTime) {
      setError("End time must be after start time.");
    } else if (isPastWindow(candidate)) {
      setError("Window is in the past — pick a future date or time.");
    } else {
      setError("");
    }
  };

  const isBiz = variant === "biz";
  const accent = isBiz ? "#C9A84C" : undefined;
  const cyanLabel = "text-[10px] text-[#00E5E5] uppercase tracking-wider font-display font-bold";
  const bizLabel = "text-[10px] uppercase tracking-widest font-bold";
  const labelClass = isBiz ? bizLabel : cyanLabel;
  const cellInput = isBiz
    ? "w-full rounded-xl px-3 py-2 text-sm outline-none"
    : "w-full bg-background border border-border/30 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50";
  const cellInputStyle = isBiz
    ? { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,118,0.55)", color: "#F4F4F5" }
    : undefined;

  if (value.length === 0) {
    return (
      <div
        className={`rounded-xl p-4 space-y-3 ${className}`}
        style={isBiz
          ? { background: "rgba(201,168,76,0.06)", border: `1px solid rgba(201,168,76,0.25)` }
          : { background: "rgba(20,184,166,0.06)", border: "1px solid rgba(20,184,166,0.22)" }}
        data-testid="availability-windows-empty"
      >
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4" style={{ color: accent ?? "#14B8A6" }} />
          <p className={labelClass} style={accent ? { color: accent } : { color: "#14B8A6" }}>Your Availability</p>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {helperText || "Add at least one window when you're free for this job. The worker will pick a start time inside one of these windows."}
        </p>
        <Button
          type="button"
          onClick={addWindow}
          variant="outline"
          className="w-full h-9 rounded-xl border-border/30 text-xs font-display tracking-wider gap-2"
          data-testid="button-add-first-window"
        >
          <Plus className="w-3.5 h-3.5" /> ADD AVAILABILITY WINDOW
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl p-4 space-y-3 ${className}`}
      style={isBiz
        ? { background: "rgba(201,168,76,0.06)", border: `1px solid rgba(201,168,76,0.25)` }
        : { background: "rgba(20,184,166,0.06)", border: "1px solid rgba(20,184,166,0.22)" }}
      data-testid="availability-windows-picker"
    >
      <div className="flex items-center gap-2">
        <CalendarIcon className="w-4 h-4" style={{ color: accent ?? "#14B8A6" }} />
        <p className={labelClass} style={accent ? { color: accent } : { color: "#14B8A6" }}>Your Availability</p>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {helperText || "Add one or more windows when you're free. The worker will pick a start time inside one of them."}
      </p>

      <div className="space-y-3">
        {value.map((w, i) => (
          <div
            key={i}
            className="rounded-lg p-3 space-y-2"
            style={{ background: "rgba(0,0,0,0.18)", border: "1px solid rgba(0,229,118,0.55)" }}
            data-testid={`window-row-${i}`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Window {i + 1}</p>
              <button
                type="button"
                onClick={() => removeWindow(i)}
                className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                aria-label={`Remove window ${i + 1}`}
                data-testid={`button-remove-window-${i}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground block mb-1">Date</label>
                <input
                  type="date"
                  value={w.date}
                  min={todayLocal()}
                  onChange={(e) => updateWindow(i, { date: e.target.value })}
                  className={cellInput}
                  style={cellInputStyle}
                  data-testid={`input-window-date-${i}`}
                />
              </div>
              <div>
                <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground block mb-1 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> Start
                </label>
                <input
                  type="time"
                  value={w.startTime}
                  onChange={(e) => updateWindow(i, { startTime: e.target.value })}
                  className={cellInput}
                  style={cellInputStyle}
                  data-testid={`input-window-start-${i}`}
                />
              </div>
              <div>
                <label className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground block mb-1 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> End
                </label>
                <input
                  type="time"
                  value={w.endTime}
                  onChange={(e) => updateWindow(i, { endTime: e.target.value })}
                  className={cellInput}
                  style={cellInputStyle}
                  data-testid={`input-window-end-${i}`}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-[11px] text-destructive font-medium" data-testid="text-window-error">{error}</p>
      )}

      <Button
        type="button"
        onClick={addWindow}
        variant="outline"
        className="w-full h-8 rounded-xl border-border/30 text-[11px] font-display tracking-wider gap-2"
        data-testid="button-add-window"
      >
        <Plus className="w-3 h-3" /> ADD ANOTHER WINDOW
      </Button>
    </div>
  );
}
