/**
 * JacResumeBanner
 *
 * Shown in the consumer layout whenever a logged-in user has a pending
 * JAC session draft (data they gave JAC before creating their account).
 * One tap applies the draft data to the form-prefill keys and routes
 * them to the correct screen — no starting over.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import {
  getJacSessionDraft,
  clearJacSessionDraft,
  applyJacSessionDraft,
  getIntentLabel,
} from "@/lib/jac-session";
import { ArrowRight, Sparkles, X } from "lucide-react";

export function JacResumeBanner() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState(() => (user ? getJacSessionDraft() : null));

  useEffect(() => {
    if (user) setDraft(getJacSessionDraft());
    else setDraft(null);
  }, [user]);

  if (!user || !draft) return null;

  function handleResume() {
    if (!draft) return;
    const route = applyJacSessionDraft(draft);
    clearJacSessionDraft();
    setDraft(null);
    navigate(route);
  }

  function handleDismiss() {
    clearJacSessionDraft();
    setDraft(null);
  }

  const label = getIntentLabel(draft);

  return (
    <div className="px-3 pt-2" data-testid="banner-jac-resume">
      <div
        className="rounded-2xl px-3.5 py-3 flex items-center gap-3"
        style={{
          background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(16,185,129,0.10))",
          border: "1px solid rgba(139,92,246,0.38)",
        }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(139,92,246,0.18)" }}
        >
          <Sparkles className="w-4 h-4 text-purple-300" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-display font-bold tracking-widest uppercase text-purple-300">
            JAC saved your progress
          </p>
          <p className="text-xs text-foreground/90 truncate">
            Continue your {label} — all fields ready to go
          </p>
        </div>

        <button
          onClick={handleResume}
          className="flex items-center gap-1 text-xs font-semibold text-emerald-400 px-2.5 py-1.5 rounded-xl flex-shrink-0 transition-all active:scale-95"
          style={{
            background: "rgba(16,185,129,0.12)",
            border: "1px solid rgba(16,185,129,0.3)",
          }}
          data-testid="button-jac-resume"
        >
          Continue <ArrowRight className="w-3 h-3" />
        </button>

        <button
          onClick={handleDismiss}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-white flex-shrink-0 transition-colors"
          style={{ background: "rgba(255,255,255,0.05)" }}
          data-testid="button-jac-resume-dismiss"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
