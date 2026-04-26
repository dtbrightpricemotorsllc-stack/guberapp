import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, Users, Clock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type JobTypeConfig,
  type GuidedSection,
  TIME_TYPES,
  ESTIMATED_TIMES,
  computeAutoTitle,
  computeEffort,
  computeHelpers,
  computeSuggestedPrice,
  detectContactBlock,
} from "@/lib/job-builder-config";

type Props = {
  config: JobTypeConfig;
  jobDetails: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
  notes: string;
  onNotesChange: (next: string) => void;
  estimatedMinutes: number; // 0 if not set
  urgent: boolean;
  finalPrice: number;
  onValidationChange?: (state: { isValid: boolean; missingReason: string; contactBlockHit: boolean }) => void;
};

const TIME_TO_MINUTES: Record<string, number> = {
  "Under 1 hour": 45,
  "1–2 hours": 90,
  "Half day": 240,
  "Full day": 480,
  "Multi-day": 960,
};

function chipClass(active: boolean) {
  return [
    "px-3 py-1.5 h-auto text-xs rounded-full font-display font-medium transition-all border",
    active
      ? "bg-primary text-primary-foreground border-primary shadow-[0_0_8px_hsl(152_100%_44%/0.35)]"
      : "bg-muted/20 text-muted-foreground border-border hover:bg-muted/40 hover:text-foreground",
  ].join(" ");
}

function asArr(v: any): string[] {
  if (Array.isArray(v)) return v;
  if (v == null || v === "") return [];
  return [String(v)];
}

export function GuidedJobBuilder({
  config,
  jobDetails,
  onChange,
  notes,
  onNotesChange,
  estimatedMinutes,
  urgent,
  finalPrice,
  onValidationChange,
}: Props) {
  // Local state for time-type and estimated-time chips so we don't have to
  // thread two more props through every job page. Stored back into jobDetails
  // so it ships with the post.
  const timeType = (jobDetails.timeType as string) || "";
  const estimatedTime = (jobDetails.estimatedTime as string) || "";

  const setField = (name: string, value: any) => {
    onChange({ ...jobDetails, [name]: value });
  };

  const setManyFields = (patch: Record<string, any>) => {
    onChange({ ...jobDetails, ...patch });
  };

  // Derived metrics — recompute every render
  const computedMinutes = useMemo(() => {
    if (estimatedMinutes > 0) return estimatedMinutes;
    return TIME_TO_MINUTES[estimatedTime] || 0;
  }, [estimatedMinutes, estimatedTime]);

  const effort = useMemo(
    () => computeEffort(config, jobDetails, urgent, computedMinutes),
    [config, jobDetails, urgent, computedMinutes],
  );
  const helpers = useMemo(
    () => computeHelpers(config, jobDetails),
    [config, jobDetails],
  );
  const pricing = useMemo(
    () => computeSuggestedPrice(config, jobDetails, urgent),
    [config, jobDetails, urgent],
  );
  const autoTitle = useMemo(
    () => computeAutoTitle(config, jobDetails),
    [config, jobDetails],
  );

  const contactBlockHit = useMemo(() => {
    const hit = detectContactBlock(notes, config.blockKeywords);
    return hit;
  }, [notes, config.blockKeywords]);

  // Validation: required sections must have selections, and "Other" picks
  // require a short note in the matching <name>_other field.
  const missingReason = useMemo(() => {
    for (const s of config.sections) {
      const v = jobDetails[s.name];
      if (s.required) {
        if (Array.isArray(v) ? v.length === 0 : !v) return `Pick ${s.label}`;
      }
      if (s.hasOther) {
        const arr = asArr(v);
        if (arr.includes("Other")) {
          const other = (jobDetails[`${s.name}_other`] as string | undefined) || "";
          if (other.trim().length < 3) return `Describe "Other" for ${s.label}`;
        }
      }
    }
    if (!timeType) return "Pick a Time Type";
    if (!estimatedTime) return "Pick an Estimated Time";
    if (contactBlockHit) return `Notes can't include ${contactBlockHit} — keep contact and payment on GUBER`;
    return "";
  }, [config.sections, jobDetails, timeType, estimatedTime, contactBlockHit]);

  // Notify parent of validation state changes
  useEffect(() => {
    onValidationChange?.({
      isValid: !missingReason,
      missingReason,
      contactBlockHit: !!contactBlockHit,
    });
  }, [missingReason, contactBlockHit, onValidationChange]);

  // ---- helpers for chip rendering ----
  function renderChips(s: GuidedSection) {
    const v = jobDetails[s.name];
    const selected = asArr(v);
    const others: string[] = s.hasOther ? ["Other"] : [];
    const opts = [...s.options, ...others];

    return (
      <div className="flex flex-wrap gap-2">
        {opts.map((opt) => {
          const isActive = s.multi
            ? selected.includes(opt)
            : v === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                if (s.multi) {
                  const next = isActive
                    ? selected.filter((x) => x !== opt)
                    : [...selected, opt];
                  setField(s.name, next);
                  // clear "Other" text if user deselects
                  if (opt === "Other" && isActive) {
                    setManyFields({ [s.name]: next, [`${s.name}_other`]: "" });
                  }
                } else {
                  if (opt === "Other" && v === "Other") {
                    setManyFields({ [s.name]: "", [`${s.name}_other`]: "" });
                  } else {
                    setField(s.name, opt);
                    if (opt !== "Other") {
                      setManyFields({ [s.name]: opt, [`${s.name}_other`]: "" });
                    }
                  }
                }
              }}
              className={chipClass(isActive)}
              data-testid={`chip-${s.name}-${opt.replace(/\s+/g, "-").toLowerCase()}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    );
  }

  function renderOtherInput(s: GuidedSection) {
    const v = jobDetails[s.name];
    const arr = asArr(v);
    const showOther = s.hasOther && arr.includes("Other");
    if (!showOther) return null;
    const otherKey = `${s.name}_other`;
    const otherVal = (jobDetails[otherKey] as string) || "";
    return (
      <Input
        type="text"
        className="premium-input rounded-md mt-2"
        value={otherVal}
        onChange={(e) => setField(otherKey, e.target.value.slice(0, 120))}
        placeholder={`Describe "Other" — short and specific`}
        data-testid={`input-${s.name}-other`}
        maxLength={120}
      />
    );
  }

  return (
    <div className="space-y-5" data-testid="guided-job-builder">
      {config.warning && (
        <div className="flex items-start gap-2 rounded-xl p-3"
          style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.25)" }}>
          <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-orange-300/90 leading-relaxed">{config.warning}</p>
        </div>
      )}

      {config.sections.map((s) => (
        <div key={s.name} className="space-y-2" data-testid={`section-${s.name}`}>
          <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">
            {s.label} {s.required && <span className="text-destructive">*</span>}
          </Label>
          {renderChips(s)}
          {renderOtherInput(s)}
        </div>
      ))}

      {/* Universal: Time Type */}
      <div className="space-y-2" data-testid="section-timeType">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display flex items-center gap-1">
          <Clock className="w-3 h-3" /> Time Type <span className="text-destructive">*</span>
        </Label>
        <div className="flex flex-wrap gap-2">
          {TIME_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={chipClass(timeType === t)}
              onClick={() => setField("timeType", t)}
              data-testid={`chip-timeType-${t.toLowerCase()}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Universal: Estimated Time */}
      <div className="space-y-2" data-testid="section-estimatedTime">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display flex items-center gap-1">
          <Clock className="w-3 h-3" /> Estimated Time <span className="text-destructive">*</span>
        </Label>
        <div className="flex flex-wrap gap-2">
          {ESTIMATED_TIMES.map((t) => (
            <button
              key={t}
              type="button"
              className={chipClass(estimatedTime === t)}
              onClick={() => setField("estimatedTime", t)}
              data-testid={`chip-estimatedTime-${t.replace(/\s+/g, "-").toLowerCase()}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Universal: Helpers Needed (override) */}
      <div className="space-y-2" data-testid="section-helpersNeeded">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display flex items-center gap-1">
          <Users className="w-3 h-3" /> Helpers Needed <span className="text-muted-foreground/60 text-[10px] ml-1">(suggested: {helpers})</span>
        </Label>
        <div className="flex flex-wrap gap-2">
          {["1", "2", "3+"].map((opt) => (
            <button
              key={opt}
              type="button"
              className={chipClass(jobDetails.helpersNeeded === opt)}
              onClick={() => setField("helpersNeeded", jobDetails.helpersNeeded === opt ? "" : opt)}
              data-testid={`chip-helpersNeeded-${opt}`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Universal: Notes (with contact-block) */}
      <div className="space-y-2" data-testid="section-notes">
        <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">
          Notes <span className="text-muted-foreground/60 text-[10px] ml-1">(optional)</span>
        </Label>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value.slice(0, 500))}
          placeholder="Anything specific the helper should know? (Keep contact and payment on GUBER.)"
          rows={2}
          maxLength={500}
          className="premium-input rounded-md text-sm"
          data-testid="textarea-guided-notes"
        />
        {contactBlockHit && (
          <div className="flex items-start gap-2 rounded-md p-2 bg-destructive/10 border border-destructive/30">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
            <p className="text-[11px] text-destructive">
              Notes look like they include a {contactBlockHit}. Please remove it — all contact and payment must stay on GUBER.
            </p>
          </div>
        )}
      </div>

      {config.disclaimer && (
        <div className="flex items-start gap-2 rounded-md p-2 bg-muted/20 border border-border/40">
          <FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground italic leading-snug">{config.disclaimer}</p>
        </div>
      )}

      {/* Live Job Summary panel */}
      <div className="rounded-xl p-4 space-y-3 animate-fade-in"
        style={{ background: "rgba(0,229,229,0.05)", border: "1px solid rgba(0,229,229,0.20)" }}
        data-testid="panel-job-summary">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4" style={{ color: "#00E5E5" }} />
          <span className="text-xs font-display font-bold uppercase tracking-wider" style={{ color: "#00E5E5" }}>
            Live Job Summary
          </span>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider font-display text-muted-foreground">
            Auto-Generated Title
          </Label>
          <p className="text-sm font-display font-semibold leading-snug" data-testid="text-summary-title">
            {autoTitle}
          </p>
          <p className="text-[11px] text-muted-foreground">
            You're posting: <span className="font-medium text-foreground">{config.category} → {config.jobType}</span>
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md p-2 bg-muted/20 premium-border">
            <p className="text-[9px] uppercase tracking-wider font-display text-muted-foreground">Effort</p>
            <p className="text-sm font-display font-bold"
              style={{ color: effort === "Easy" ? "#22C55E" : effort === "Moderate" ? "#F59E0B" : "#EF4444" }}
              data-testid="text-summary-effort">
              {effort}
            </p>
          </div>
          <div className="rounded-md p-2 bg-muted/20 premium-border">
            <p className="text-[9px] uppercase tracking-wider font-display text-muted-foreground">Time</p>
            <p className="text-sm font-display font-bold" data-testid="text-summary-time">
              {estimatedTime || "—"}
            </p>
          </div>
          <div className="rounded-md p-2 bg-muted/20 premium-border">
            <p className="text-[9px] uppercase tracking-wider font-display text-muted-foreground">Helpers</p>
            <p className="text-sm font-display font-bold flex items-center gap-1" data-testid="text-summary-helpers">
              <Users className="w-3 h-3" /> {helpers}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md p-2 bg-muted/20 premium-border">
            <p className="text-[9px] uppercase tracking-wider font-display text-muted-foreground">Suggested</p>
            <p className="text-sm font-display font-bold guber-text-green" data-testid="text-summary-suggested-price">
              ${pricing.low}–${pricing.high}
            </p>
          </div>
          <div className="rounded-md p-2 bg-muted/20 premium-border">
            <p className="text-[9px] uppercase tracking-wider font-display text-muted-foreground">Final</p>
            <p className="text-sm font-display font-bold" data-testid="text-summary-final-price">
              {finalPrice > 0 ? `$${finalPrice}` : "Set price below"}
            </p>
          </div>
        </div>

        {pricing.reasons.length > 0 && (
          <div className="pt-1 border-t border-border/20">
            <p className="text-[10px] text-muted-foreground">
              <span className="text-foreground/80">Why this price:</span>{" "}
              {pricing.reasons.join(", ")}
            </p>
          </div>
        )}

        {/* Selection list */}
        <div className="pt-1 border-t border-border/20 space-y-1">
          {config.sections.map((s) => {
            const v = jobDetails[s.name];
            const arr = asArr(v).filter((x) => x !== "Other");
            const otherTxt = (jobDetails[`${s.name}_other`] as string) || "";
            const display = [
              ...arr,
              otherTxt ? `Other: ${otherTxt}` : "",
            ].filter(Boolean).join(", ");
            if (!display) return null;
            return (
              <div key={s.name} className="flex justify-between gap-2 text-[11px]">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-display font-medium text-right max-w-[60%] truncate">{display}</span>
              </div>
            );
          })}
          {timeType && (
            <div className="flex justify-between gap-2 text-[11px]">
              <span className="text-muted-foreground">Time Type</span>
              <span className="font-display font-medium">{timeType}</span>
            </div>
          )}
          {jobDetails.helpersNeeded && jobDetails.helpersNeeded !== String(helpers) && (
            <div className="flex justify-between gap-2 text-[11px]">
              <span className="text-muted-foreground">Helpers (your pick)</span>
              <span className="font-display font-medium">{jobDetails.helpersNeeded}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
