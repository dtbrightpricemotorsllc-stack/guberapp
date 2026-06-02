import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, TrendingUp, TrendingDown, Loader2, MapPin,
  Users, Zap, AlertTriangle, CheckCircle2, Target,
  Mail, DollarSign, Activity,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────────────

type GrowthSignalLevel = "opportunity" | "healthy" | "warning" | "critical";

interface ZipInsight {
  zip: string;
  demandJobs: number;
  workerCount: number;
  hirersCount: number;
  supplyRatio: number;
  avgJobValue: number;
  cashDropProposed: boolean;
}

interface FunnelMetrics {
  newUsers30d: number;
  newUsers7d: number;
  newUsersToday: number;
  verifiedRate30d: number;
  profileCompleteRate30d: number;
  firstJobPostedRate30d: number;
  workerActivationRate30d: number;
}

interface GrowthAlert {
  level: GrowthSignalLevel;
  type: string;
  message: string;
  zip?: string;
  value?: number;
}

interface GrowthMetrics {
  generatedAt: string;
  productionOnly: boolean;
  funnel: FunnelMetrics;
  zipInsights: ZipInsight[];
  totalDemandZips: number;
  zipsWithNoWorkers: number;
  avgPlatformSupplyRatio: number;
  alerts: GrowthAlert[];
  proposedActions: Array<{ actionType: string; actionId: number; zip?: string }>;
  growthScore: number;
  executiveSummary: string;
}

interface GrowthBriefing {
  id?: number;
  generatedAt: string;
  metrics: GrowthMetrics;
  title: string;
  body: string;
  priority: string;
}

// ── Nav ────────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: "Command Center", path: "/os/command-center" },
  { label: "Daily Briefing",  path: "/os/briefing" },
  { label: "COO Agent",       path: "/os/coo" },
  { label: "CFO Agent",       path: "/os/cfo" },
  { label: "Growth Agent",    path: "/os/growth", active: true },
  { label: "Dashboard",       path: "/os/dashboard" },
  { label: "Approvals",       path: "/os/approve" },
  { label: "Memory",          path: "/os/memory" },
  { label: "Agents",          path: "/os/agents" },
  { label: "Audit Log",       path: "/os/logs" },
  { label: "Events",          path: "/os/events" },
];

function OSNav() {
  const [, nav] = useLocation();
  return (
    <div className="border-b border-white/10 bg-[#0d0d14]">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
        </div>
        <h1 className="text-lg font-semibold">GUBER OS</h1>
      </div>
      <div className="max-w-5xl mx-auto px-6 flex gap-1 pb-0 overflow-x-auto">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            onClick={() => nav(item.path)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              item.active ? "border-emerald-500 text-white" : "border-transparent text-white/50 hover:text-white/80"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(s: string) {
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SIGNAL_COLORS: Record<GrowthSignalLevel, string> = {
  critical:    "text-red-400 border-red-500/30 bg-red-500/5",
  warning:     "text-amber-400 border-amber-500/30 bg-amber-500/5",
  healthy:     "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
  opportunity: "text-sky-400 border-sky-500/30 bg-sky-500/5",
};

const SIGNAL_ICONS: Record<GrowthSignalLevel, typeof AlertTriangle> = {
  critical:    AlertTriangle,
  warning:     AlertTriangle,
  healthy:     CheckCircle2,
  opportunity: Target,
};

// ── Main ───────────────────────────────────────────────────────────────────────

export default function OSGrowthAgent() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expandedZip, setExpandedZip] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ briefing: GrowthBriefing | null }>({
    queryKey: ["/api/os/growth/briefing"],
  });

  const generateMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/os/growth/generate", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/os/growth/briefing"] });
      qc.invalidateQueries({ queryKey: ["/api/os/actions"] });
      toast({ title: "Growth briefing generated", description: "Market analysis complete — proposed actions queued." });
    },
    onError: (e: any) => {
      toast({ title: "Generation failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const briefing = data?.briefing ?? null;
  const m = briefing?.metrics;

  // Score color
  const scoreColor = !m ? "text-white/40"
    : m.growthScore >= 80 ? "text-emerald-400"
    : m.growthScore >= 60 ? "text-amber-400"
    : "text-red-400";

  const priorityBadge = briefing?.priority === "critical"
    ? "bg-red-500/20 text-red-300 border-red-500/30"
    : briefing?.priority === "high"
    ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <OSNav />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              Growth Agent
            </h2>
            <p className="text-sm text-white/40 mt-0.5">
              Market development · zip-level supply/demand · Cash Drop proposals · outreach queue
            </p>
          </div>
          <Button
            data-testid="button-generate-growth"
            onClick={() => generateMut.mutate()}
            disabled={generateMut.isPending}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 shrink-0"
          >
            {generateMut.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />}
            {generateMut.isPending ? "Analysing…" : "Generate Briefing"}
          </Button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-white/40 gap-3">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading growth briefing…</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 text-red-300 text-sm">
            Failed to load briefing.
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !briefing && !error && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-10 text-center">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 text-emerald-500/40" />
            <p className="text-sm text-white/50 mb-4">No growth briefing yet. Run the first analysis.</p>
            <Button
              onClick={() => generateMut.mutate()}
              disabled={generateMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2"
            >
              {generateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Generate First Briefing
            </Button>
          </div>
        )}

        {/* Briefing content */}
        {briefing && m && (
          <>
            {/* Headline row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-white/40 mb-1">Growth Score</p>
                <p className={`text-2xl font-bold tabular-nums ${scoreColor}`}>{m.growthScore}</p>
                <p className="text-xs text-white/30 mt-1">/ 100</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-white/40 mb-1">New Users 30d</p>
                <p className="text-2xl font-bold tabular-nums text-white">{m.funnel.newUsers30d}</p>
                <p className="text-xs text-white/30 mt-1">{m.funnel.newUsers7d} this week</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-white/40 mb-1">Demand Zips</p>
                <p className="text-2xl font-bold tabular-nums text-white">{m.totalDemandZips}</p>
                <p className="text-xs text-white/30 mt-1">{m.zipsWithNoWorkers} with no workers</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-white/40 mb-1">Actions Proposed</p>
                <p className="text-2xl font-bold tabular-nums text-amber-400">{m.proposedActions.length}</p>
                <p className="text-xs text-white/30 mt-1">pending approval</p>
              </div>
            </div>

            {/* Funnel Metrics */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-white/50" />
                <span className="text-sm font-medium text-white/70">User Funnel (30 days)</span>
                <span className="ml-auto text-xs text-white/30">Production users only</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: "ID Verified", value: `${m.funnel.verifiedRate30d}%`, note: "of new sign-ups" },
                  { label: "Profile Complete", value: `${m.funnel.profileCompleteRate30d}%`, note: "of new sign-ups" },
                  { label: "Hirer Activation", value: `${m.funnel.firstJobPostedRate30d}%`, note: "posted ≥1 job" },
                  { label: "Worker Activation", value: `${m.funnel.workerActivationRate30d}%`, note: "completed ≥1 job" },
                  { label: "New Today", value: m.funnel.newUsersToday.toString(), note: "registrations" },
                  { label: "Supply Ratio", value: m.avgPlatformSupplyRatio.toFixed(2), note: "workers / job" },
                ].map(({ label, value, note }) => (
                  <div key={label} className="space-y-0.5">
                    <p className="text-xs text-white/40">{label}</p>
                    <p className="text-base font-semibold tabular-nums text-white">{value}</p>
                    <p className="text-xs text-white/30">{note}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Proposed Actions */}
            {m.proposedActions.length > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Target className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium text-amber-300">Actions Queued for Approval</span>
                  <span className="ml-auto text-xs text-white/30">Review in Approvals tab</span>
                </div>
                <div className="space-y-2">
                  {m.proposedActions.map((a, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg bg-black/20 border border-white/10 px-4 py-3">
                      {a.actionType === "schedule.cash_drop" && <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />}
                      {a.actionType === "queue.outreach"     && <Mail    className="w-4 h-4 text-sky-400 shrink-0" />}
                      {a.actionType === "alert.founder"      && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
                      <div className="flex-1">
                        <p className="text-xs font-medium text-white/80">{a.actionType}</p>
                        {a.zip && <p className="text-xs text-white/40">Zip: {a.zip}</p>}
                      </div>
                      <span className="text-xs text-white/30">#{a.actionId}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Zip-level supply/demand table */}
            {m.zipInsights.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-4 h-4 text-white/50" />
                  <span className="text-sm font-medium text-white/70">Zip-Level Supply / Demand</span>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-5 gap-2 px-3 text-xs text-white/30 font-medium">
                    <span>Zip</span>
                    <span className="text-right">Jobs (30d)</span>
                    <span className="text-right">Workers</span>
                    <span className="text-right">Ratio</span>
                    <span className="text-right">Avg Value</span>
                  </div>
                  {m.zipInsights.map((z) => (
                    <div
                      key={z.zip}
                      className={`rounded-lg border px-3 py-3 cursor-pointer transition-colors ${
                        z.cashDropProposed
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : z.workerCount === 0
                          ? "border-red-500/20 bg-red-500/5"
                          : "border-white/10 bg-black/20 hover:border-white/20"
                      }`}
                      onClick={() => setExpandedZip(expandedZip === z.zip ? null : z.zip)}
                      data-testid={`zip-row-${z.zip}`}
                    >
                      <div className="grid grid-cols-5 gap-2 items-center">
                        <span className="text-sm font-mono font-medium text-white">{z.zip}</span>
                        <span className="text-sm text-right tabular-nums text-white/80">{z.demandJobs}</span>
                        <span className={`text-sm text-right tabular-nums ${z.workerCount === 0 ? "text-red-400" : "text-white/80"}`}>
                          {z.workerCount}
                        </span>
                        <span className={`text-sm text-right tabular-nums ${z.supplyRatio < 1 ? "text-amber-400" : "text-emerald-400"}`}>
                          {z.supplyRatio.toFixed(1)}x
                        </span>
                        <span className="text-sm text-right tabular-nums text-white/60">${z.avgJobValue}</span>
                      </div>
                      {expandedZip === z.zip && (
                        <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-xs">
                          <span className="text-white/40">Hirers active</span>
                          <span className="text-white/70">{z.hirersCount}</span>
                          <span className="text-white/40">Cash Drop proposed</span>
                          <span className={z.cashDropProposed ? "text-emerald-400" : "text-white/40"}>{z.cashDropProposed ? "Yes" : "No"}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Alerts */}
            {m.alerts.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider px-1">Growth Signals</h3>
                {m.alerts.map((alert, i) => {
                  const Icon = SIGNAL_ICONS[alert.level];
                  return (
                    <div
                      key={i}
                      className={`rounded-xl border p-4 flex items-start gap-3 ${SIGNAL_COLORS[alert.level]}`}
                    >
                      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium capitalize">
                          {alert.level} · {alert.type.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs opacity-80 mt-0.5">{alert.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Executive Summary */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <div className="flex items-start gap-3">
                <DollarSign className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-300 mb-2">Executive Summary</p>
                  <p className="text-xs text-white/60 leading-relaxed">{m.executiveSummary}</p>
                  <p className="text-xs text-white/20 mt-3">
                    Generated {timeAgo(briefing.generatedAt)} · Production data only
                  </p>
                </div>
              </div>
            </div>

            {m.alerts.length === 0 && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <p className="text-sm text-emerald-300">No growth warnings — platform expanding normally.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
