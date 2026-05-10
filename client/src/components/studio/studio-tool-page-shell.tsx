import { ReactNode, useEffect } from "react";
import { Link, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Coins, Plus, Crown, Sparkles, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isStoreBuild } from "@/lib/platform";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";

type StudioMe = {
  credits: number;
  tier: "free" | "standard" | "business" | "enterprise";
  providerReady: boolean;
};

const TIER_LABEL: Record<string, string> = {
  free:       "Free Plan",
  standard:   "Standard Plan",
  business:   "Business Plan",
  enterprise: "Enterprise Plan",
};

export function StudioToolPageShell({
  title,
  subtitle,
  iconAccent = "from-emerald-400 to-emerald-600",
  children,
}: {
  title: string;
  subtitle: string;
  iconAccent?: string;
  children: ReactNode;
}) {
  // Mirror the rollout gate from /studio: tool pages are admin-only until
  // the studio_v2 feature flag is opened up. Bouncing non-admins back to
  // /studio shows them the StudioComingSoon screen there in one place.
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const meQuery = useQuery<StudioMe>({ queryKey: ["/api/studio/me"], enabled: isAdmin });
  const me = meQuery.data;

  // Session bootstrap: open + heartbeat. NO exit-on-unmount — sessions
  // now live 24h after last activity (handled by cron). We never warn
  // the user that leaving discards their work because it doesn't.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/studio/session", { method: "POST", credentials: "include" });
        if (!cancelled && res.ok) {
          queryClient.invalidateQueries({ queryKey: ["/api/studio/session/current"] });
        }
      } catch {}
    })();
    const touchTimer = window.setInterval(() => {
      fetch("/api/studio/session/touch", { method: "POST", credentials: "include" }).catch(() => {});
    }, 4 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(touchTimer);
    };
  }, [isAdmin]);

  if (!isAdmin) return <Redirect to="/studio" />;

  const credits = me?.credits ?? 0;
  const tier = me?.tier ?? "free";

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-neutral-950 to-black text-white pb-24" data-testid="page-studio-tool">
      {/* sticky header */}
      <div className="sticky top-0 z-30 backdrop-blur-md bg-black/40 border-b border-white/5">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <Link
            href="/studio"
            className="flex items-center gap-1.5 text-xs text-white/80 hover:text-white px-2 py-1.5 rounded-lg hover:bg-white/5 transition no-underline"
            data-testid="button-tool-back"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Studio
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${iconAccent} flex items-center justify-center shrink-0 shadow-[0_0_18px_rgba(34,197,94,0.4)]`}>
              <Wand2 className="w-3.5 h-3.5 text-black" />
            </div>
            <p className="text-[13px] font-black tracking-tight truncate">{title}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isStoreBuild ? (
              <div className="flex items-center gap-1 rounded-full bg-white/10 border border-white/15 px-2 py-1" data-testid="text-tool-credits">
                <Coins className="w-3 h-3 text-amber-300" />
                <span className="text-[11px] font-bold tabular-nums">{credits}</span>
              </div>
            ) : (
              <Link
                href="/studio/credits"
                className="flex items-center gap-1 rounded-full bg-white/10 border border-white/15 px-2 py-1 hover:bg-white/15 transition no-underline"
                data-testid="text-tool-credits"
                aria-label="Open credit packs"
              >
                <Coins className="w-3 h-3 text-amber-300" />
                <span className="text-[11px] font-bold tabular-nums">{credits}</span>
                <Plus className="w-2.5 h-2.5 text-white/60" />
              </Link>
            )}
            {isStoreBuild ? (
              <Badge variant="outline" className="text-[9px] border-white/20 bg-white/5 px-2 py-0.5 hidden sm:inline-flex" data-testid="badge-tool-tier">
                {TIER_LABEL[tier] || tier}
              </Badge>
            ) : (
              <Link
                href="/studio/credits"
                className={`hidden sm:flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold transition border no-underline ${
                  tier === "free"
                    ? "bg-emerald-400/15 border-emerald-400/40 text-emerald-100 hover:bg-emerald-400/25"
                    : "bg-gradient-to-r from-emerald-400/30 via-violet-400/30 to-fuchsia-400/30 border-white/20 text-white"
                }`}
                data-testid="badge-tool-tier"
              >
                {tier === "free" ? <Sparkles className="w-3 h-3" /> : <Crown className="w-3 h-3" />}
                <span>{TIER_LABEL[tier] || tier}</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-5 pt-6 sm:pt-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight" data-testid="text-tool-title">{title}</h1>
          <p className="text-sm text-white/65 mt-2 leading-relaxed">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
