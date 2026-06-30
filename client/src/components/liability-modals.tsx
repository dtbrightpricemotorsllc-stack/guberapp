import { Loader2, Shield, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  GLOBAL_LIABILITY_DISCLAIMER,
  CATEGORY_DISCLAIMERS,
  STATEMENTS,
  type CategoryDisclaimer,
  type SafetyTriggerHit,
} from "@shared/liability";

// =============================================================================
// GUBER Liability modals (Task #318)
// =============================================================================
// Three lightweight, single-tap modals reused by post-job, job-detail and the
// V&I flow. They never block business state — they only surface the legal /
// safety acknowledgement required by the liability protection layer.
// =============================================================================

type GlobalDisclaimerModalProps =
  | { open: boolean; readOnly: true; onAccept?: never; onDismiss: () => void; isPending?: never }
  | { open: boolean; readOnly?: false; onAccept: () => void; onDismiss?: () => void; isPending?: boolean };

export function GlobalDisclaimerModal({
  open,
  onAccept,
  onDismiss,
  isPending,
  readOnly,
}: GlobalDisclaimerModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center p-4"
      data-testid="modal-global-liability-disclaimer"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={readOnly ? onDismiss : undefined} />
      <div className="relative bg-card rounded-3xl border border-border/20 p-6 w-full max-w-lg space-y-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3
              className="font-display font-black text-base"
              data-testid="text-global-disclaimer-title"
            >
              {GLOBAL_LIABILITY_DISCLAIMER.title}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {readOnly ? "Review only — no action required" : "One-time acknowledgement"}
            </p>
          </div>
          {(readOnly || onDismiss) && (
            <button
              onClick={onDismiss}
              aria-label="Close"
              className="p-2 rounded-full hover:bg-muted text-muted-foreground"
              data-testid="button-close-global-disclaimer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p
            className="text-[12px] text-muted-foreground leading-relaxed"
            data-testid="text-global-disclaimer-body"
          >
            {GLOBAL_LIABILITY_DISCLAIMER.body}
          </p>
        </div>

        {readOnly ? (
          <Button
            onClick={onDismiss}
            variant="outline"
            className="w-full h-12 font-display tracking-wider rounded-xl"
            data-testid="button-close-global-disclaimer-readonly"
          >
            Close
          </Button>
        ) : (
          <Button
            onClick={onAccept}
            disabled={!!isPending}
            className="w-full h-12 font-display tracking-wider bg-primary text-primary-foreground rounded-xl"
            data-testid="button-accept-global-disclaimer"
          >
            {isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              GLOBAL_LIABILITY_DISCLAIMER.ctaLabel
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

interface SafetyGateModalProps {
  open: boolean;
  hits: SafetyTriggerHit[];
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}

export function SafetyGateModal({
  open,
  hits,
  onConfirm,
  onCancel,
  isPending,
}: SafetyGateModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center p-4"
      data-testid="modal-safety-gate"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative bg-card rounded-3xl border border-amber-500/30 p-6 w-full max-w-lg space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/30">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="font-display font-black text-base">Safety check</h3>
            <p className="text-[11px] text-muted-foreground">
              This task triggers extra safety reminders
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {hits.map((h) => (
            <div
              key={h.trigger}
              className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3"
              data-testid={`safety-trigger-${h.trigger}`}
            >
              <p className="text-[10px] font-display font-bold tracking-widest text-amber-400/80 uppercase mb-1">
                {h.trigger.replace(/_/g, " ")}
              </p>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                {h.message}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={!!isPending}
            className="h-12 font-display tracking-wider rounded-xl"
            data-testid="button-cancel-safety-gate"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!!isPending}
            className="h-12 font-display tracking-wider bg-amber-500 hover:bg-amber-600 text-black rounded-xl"
            data-testid="button-confirm-safety-gate"
          >
            {isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "I UNDERSTAND, CONTINUE"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface CategoryDisclaimerCardProps {
  disclaimer: CategoryDisclaimer | null;
  className?: string;
}

/** Inline card meant to appear next to the post / accept buttons. */
export function CategoryDisclaimerCard({
  disclaimer,
  className,
}: CategoryDisclaimerCardProps) {
  if (!disclaimer) return null;
  return (
    <div
      className={`rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3 ${className ?? ""}`}
      data-testid={`category-disclaimer-${disclaimer.bucket}`}
    >
      <p className="text-[10px] font-display font-bold tracking-widest text-amber-400/80 uppercase mb-1">
        {disclaimer.title}
      </p>
      <p className="text-[12px] text-muted-foreground leading-relaxed">
        {disclaimer.body}
      </p>
    </div>
  );
}

interface HelperStartConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}

export function HelperStartConfirmModal({
  open,
  onConfirm,
  onCancel,
  isPending,
}: HelperStartConfirmModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center p-4"
      data-testid="modal-helper-start-confirm"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative bg-card rounded-3xl border border-emerald-500/30 p-6 w-full max-w-lg space-y-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/30">
            <Shield className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-display font-black text-base">
              Confirm before you start
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Single tap — required by GUBER
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-2">
          <p
            className="text-[12px] text-muted-foreground leading-relaxed"
            data-testid="text-helper-start-confirm-body"
          >
            {STATEMENTS.helperStartConfirm}
          </p>
          <p className="text-[11px] text-muted-foreground/80 italic">
            {STATEMENTS.noEmployment}
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={!!isPending}
            className="h-12 font-display tracking-wide rounded-xl shrink-0"
            data-testid="button-cancel-helper-start"
          >
            Not yet
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!!isPending}
            className="h-12 font-display tracking-wide bg-emerald-500 hover:bg-emerald-600 text-black rounded-xl flex-1 whitespace-nowrap"
            data-testid="button-confirm-helper-start"
          >
            {isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "I'M READY — START"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Slim inline statement: "GUBER does not employ users…" */
export function NoEmploymentStatement({ className }: { className?: string }) {
  return (
    <p
      className={`text-[10px] text-muted-foreground/80 leading-relaxed ${className ?? ""}`}
      data-testid="text-no-employment-statement"
    >
      {STATEMENTS.noEmployment}
    </p>
  );
}

/** Slim inline statement: "Payments are processed through GUBER…" */
export function PaymentSafetyStatement({ className }: { className?: string }) {
  return (
    <p
      className={`text-[10px] text-muted-foreground/80 leading-relaxed ${className ?? ""}`}
      data-testid="text-payment-safety-statement"
    >
      {STATEMENTS.paymentSafety}
    </p>
  );
}

/** Inline safety warning: "For your safety and protection, keep
 * communication and payment inside GUBER." Use anywhere we filter
 * contact info or off-platform phrases out of user-typed text. */
export function OffPlatformWarning({ className }: { className?: string }) {
  return (
    <p
      className={`text-[10px] text-amber-400/80 leading-relaxed ${className ?? ""}`}
      data-testid="text-off-platform-warning"
    >
      {STATEMENTS.offPlatform}
    </p>
  );
}

/** Persistent V&I label: "Visual documentation only…" */
export function VisualOnlyLabel({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-1.5 ${className ?? ""}`}
      data-testid="label-visual-only"
    >
      <Shield className="w-3 h-3 text-amber-400/80 shrink-0" />
      <span className="text-[10px] font-display font-bold tracking-widest text-amber-400/80 uppercase">
        {STATEMENTS.visualOnly}
      </span>
    </div>
  );
}

export { CATEGORY_DISCLAIMERS };
