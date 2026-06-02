import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, DollarSign, AlertTriangle, XCircle, CheckCircle2,
  Info, TrendingUp, Loader2, Activity,
  CreditCard, BarChart3, Zap, ShieldAlert, FlaskConical, Trash2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────────────

type AlertSeverity = "critical" | "high" | "medium" | "low";

interface CFOAlert {
  severity: AlertSeverity;
  type: string;
  message: string;
  value?: number;
  valueLabel?: string;
}

interface CFOMetrics {
  generatedAt: string;
  productionOnly: boolean;
  revenue: {
    gmv30d: number; gmv7d: number; gmv24h: number;
    platformFees30d: number; platformFees7d: number; platformFees24h: number;
    workerPayouts30d: number; workerPayouts7d: number;
    refunds30d: number; refundRate30d: number;
    netRevenue30d: number; feeMargin30d: number;
  };
  jobs: {
    completed30d: number; completed7d: number;
    avgJobValue30d: number;
    unpaidCompleted: number; unpaidValue: number;
    topCategories: Array<{ category: string; count: number; totalValue: number; avgValue: number }>;
  };
  studio: {
    creditsConsumed30d: number; generations30d: number;
    activeSubscriptions: number; paidTierUsers: number;
  };
  stripe: {
    availableBalance: number | null; pendingBalance: number | null;
    currency: string; reachable: boolean; error?: string;
  };
  alerts: CFOAlert[];
  healthScore: number;
  executiveSummary: string;
}

interface CFOBriefing {
  id?: number;
  generatedAt: string;
  metrics: CFOMetrics;
  title: string;
  body: string;
  priority: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ALERT_CFG: Record<AlertSeverity, {
  label: string; dot: string; text: string; bg: string; border: string; Icon: any;
}> = {
  critical: { label: "Critical", dot: "bg-red-400 animate-pulse",  text: "text-red-400",    bg: "bg-red-500/5",    border: "border-red-500/30",    Icon: XCircle },
  high:     { label: "High",     dot: "bg-orange-400",              text: "text-orange-400", bg: "bg-orange-500/5", border: "border-orange-500/30", Icon: AlertTriangle },
  medium:   { label: "Medium",   dot: "bg-amber-400",               text: "text-amber-400",  bg: "bg-amber-500/5",  border: "border-amber-400/20",  Icon: Info },
  low:      { label: "Low",      dot: "bg-blue-400",                text: "text-blue-400",   bg: "bg-blue-500/5",   border: "border-blue-500/20",   Icon: Activity },
};

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function scoreColor(s: number): string {
  if (s >= 85) return "text-emerald-400";
  if (s >= 65) return "text-amber-400";
  if (s >= 40) return "text-orange-400";
  return "text-red-400";
}

// ── OS Nav ─────────────────────────────────────────────────────────────────────

function OSNav({ active }: { active: string }) {
  const [, nav] = useLocation();
  const items = [
    { label: "Command Center", path: "/os/command-center" },
    { label: "Daily Briefing",  path: "/os/briefing" },
    { label: "COO Agent",       path: "/os/coo" },
    { label: "CFO Agent",       path: "/os/cfo" },
    { label: "Growth Agent",    path: "/os/growth" },
    { label: "Dashboard",       path: "/os/dashboard" },
    { label: "Approvals",       path: "/os/approve" },
    { label: "Memory",          path: "/os/memory" },
    { label: "Agents",          path: "/os/agents" },
    { label: "Audit Log",       path: "/os/logs" },
    { label: "Events",          path: "/os/events" },
  ];
  return (
    <div className="max-w-7xl mx-auto px-6 flex gap-1 pb-0 overflow-x-auto">
      {items.map((item) => (
        <button
          key={item.path}
          onClick={() => nav(item.path)}
          data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors shrink-0 ${
            active === item.path
              ? "border-emerald-500 text-white"
              : "border-transparent text-white/50 hover:text-white/80"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ── Metric Row ─────────────────────────────────────────────────────────────────

function MetricRow({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
      <div>
        <span className="text-xs text-white/50">{label}</span>
        {sub && <span className="text-xs text-white/25 ml-2">{sub}</span>}
      </div>
      <span className={`text-sm font-medium tabular-nums ${alert ? "text-amber-400" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function OSCFOAgent() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const [simResult, setSimResult] = useState<Record<string, any> | null>(null);

  const { data, isLoading, error } = useQuery<{ briefing: CFOBriefing | null }>({
    queryKey: ["/api/os/cfo/briefing"],
  });

  const generateMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/os/cfo/generate", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/os/cfo/briefing"] });
      toast({ title: "CFO briefing generated", description: "Production financial analysis complete." });
    },
    onError: (e: any) => {
      toast({ title: "Generation failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const seedMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/os/simulation/seed", {}),
    onSuccess: (data: any) => {
      setSimResult(data);
      qc.invalidateQueries({ queryKey: ["/api/os/cfo/briefing"] });
      toast({ title: "Simulation seeded", description: `${data.summary?.jobs} jobs, ${(data.summary?.hirers ?? 0) + (data.summary?.workers ?? 0)} users. Fresh briefing generated.` });
    },
    onError: (e: any) => {
      toast({ title: "Seed failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const cleanupMut = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/os/simulation/cleanup"),
    onSuccess: (data: any) => {
      setSimResult(null);
      qc.invalidateQueries({ queryKey: ["/api/os/cfo/briefing"] });
      toast({ title: "Simulation cleaned up", description: `Removed ${data.deleted?.users ?? 0} users, ${data.deleted?.jobs ?? 0} jobs.` });
    },
    onError: (e: any) => {
      toast({ title: "Cleanup failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const briefing = data?.briefing ?? null;
  const m = briefing?.metrics;

  const critCount = m?.alerts.filter(a => a.severity === "critical").length ?? 0;
  const highCount = m?.alerts.filter(a => a.severity === "high").length ?? 0;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#0d0d14]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">CFO Agent</h1>
              <p className="text-xs text-white/40">Financial Intelligence — Production data only</p>
            </div>
          </div>
          <Button
            onClick={() => generateMut.mutate()}
            disabled={generateMut.isPending}
            data-testid="button-generate-cfo"
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm h-8 px-4"
          >
            {generateMut.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Analyzing…</>
            ) : (
              <><RefreshCw className="w-3.5 h-3.5 mr-2" /> Generate Briefing</>
            )}
          </Button>
        </div>
        <OSNav active="/os/cfo" />
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-24 text-white/40">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading CFO briefing…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
            Failed to load briefing. Try generating a new one.
          </div>
        )}

        {/* No briefing yet */}
        {!isLoading && !briefing && (
          <div className="rounded-xl border border-white/10 bg-white/3 p-10 text-center">
            <DollarSign className="w-10 h-10 text-emerald-400/40 mx-auto mb-3" />
            <p className="text-white/60 mb-2 font-medium">No CFO briefing generated yet</p>
            <p className="text-white/30 text-sm mb-6">
              Click "Generate Briefing" to run a full production financial analysis.
            </p>
            <Button
              onClick={() => generateMut.mutate()}
              disabled={generateMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {generateMut.isPending ? "Analyzing…" : "Generate First Briefing"}
            </Button>
          </div>
        )}

        {/* Briefing content */}
        {briefing && m && (
          <>
            {/* Meta strip */}
            <div className="flex items-center justify-between text-xs text-white/30">
              <span>
                Last generated {timeAgo(briefing.generatedAt)} ·{" "}
                <span className="text-white/50">{new Date(briefing.generatedAt).toLocaleString()}</span>
              </span>
              <div className="flex items-center gap-3">
                <span
                  className="px-2 py-0.5 rounded border text-xs font-mono"
                  style={{
                    borderColor: briefing.priority === "critical" ? "rgba(239,68,68,.4)" :
                                 briefing.priority === "high"     ? "rgba(249,115,22,.4)" :
                                                                    "rgba(255,255,255,.15)",
                    color:       briefing.priority === "critical" ? "#f87171" :
                                 briefing.priority === "high"     ? "#fb923c" :
                                                                    "rgba(255,255,255,.4)",
                  }}
                >
                  {briefing.priority}
                </span>
                <span className="text-white/20">Production-only · test users excluded</span>
              </div>
            </div>

            {/* Top stat strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: "Financial Health",
                  value: `${m.healthScore}/100`,
                  cls: scoreColor(m.healthScore),
                  note: m.healthScore >= 85 ? "All clear" : m.healthScore >= 65 ? "Attention needed" : "Critical issues",
                  icon: <Activity className="w-4 h-4 text-emerald-400" />,
                },
                {
                  label: "GMV (30d)",
                  value: fmtUsd(m.revenue.gmv30d),
                  cls: "text-white",
                  note: `7d: ${fmtUsd(m.revenue.gmv7d)}`,
                  icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,
                },
                {
                  label: "Platform Fees (30d)",
                  value: fmtUsd(m.revenue.platformFees30d),
                  cls: "text-white",
                  note: m.revenue.feeMargin30d > 0 ? `${m.revenue.feeMargin30d.toFixed(1)}% of GMV` : "From guber_payments",
                  icon: <DollarSign className="w-4 h-4 text-emerald-400" />,
                },
                {
                  label: "Alerts",
                  value: `${critCount + highCount}`,
                  cls: critCount > 0 ? "text-red-400" : highCount > 0 ? "text-orange-400" : "text-emerald-400",
                  note: critCount > 0 ? `${critCount} critical` : highCount > 0 ? `${highCount} high` : "All clear",
                  icon: critCount > 0 ? <ShieldAlert className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl bg-[#12121a] border border-white/10 p-4"
                  data-testid={`cfo-stat-${s.label.toLowerCase().replace(/\s/g, "-")}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-white/40 mb-1">{s.label}</p>
                      <p className={`text-2xl font-bold tabular-nums ${s.cls}`}>{s.value}</p>
                      <p className="text-xs text-white/30 mt-1">{s.note}</p>
                    </div>
                    <div className="mt-0.5">{s.icon}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Alerts */}
            {m.alerts.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider px-1">Financial Alerts</h3>
                {m.alerts.map((alert, i) => {
                  const cfg = ALERT_CFG[alert.severity];
                  return (
                    <div
                      key={i}
                      className={`rounded-xl border p-4 flex items-start gap-3 ${cfg.bg} ${cfg.border}`}
                      data-testid={`cfo-alert-${i}`}
                    >
                      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-xs font-mono font-medium ${cfg.text}`}>{cfg.label}</span>
                          <span className="text-xs text-white/30 font-mono">{alert.type}</span>
                        </div>
                        <p className="text-sm text-white/80">{alert.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Revenue + Jobs grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Revenue */}
              <div className="rounded-xl bg-[#12121a] border border-white/10 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  <h3 className="text-sm font-medium">Revenue</h3>
                  <span className="ml-auto text-xs text-white/25 font-mono">PRODUCTION</span>
                </div>
                <MetricRow label="GMV" sub="last 30d" value={fmtUsd(m.revenue.gmv30d)} />
                <MetricRow label="GMV" sub="last 7d" value={fmtUsd(m.revenue.gmv7d)} />
                <MetricRow label="GMV" sub="last 24h" value={fmtUsd(m.revenue.gmv24h)} />
                <MetricRow label="Platform fees" sub="30d" value={fmtUsd(m.revenue.platformFees30d)} />
                <MetricRow label="Platform fees" sub="7d" value={fmtUsd(m.revenue.platformFees7d)} />
                <MetricRow label="Worker payouts" sub="30d" value={fmtUsd(m.revenue.workerPayouts30d)} />
                <MetricRow
                  label="Refunds" sub="30d"
                  value={`${fmtUsd(m.revenue.refunds30d)} (${m.revenue.refundRate30d.toFixed(1)}%)`}
                  alert={m.revenue.refundRate30d > 8}
                />
                <MetricRow
                  label="Net revenue" sub="fees − refunds 30d"
                  value={fmtUsd(m.revenue.netRevenue30d)}
                  alert={m.revenue.netRevenue30d < 0}
                />
              </div>

              {/* Jobs */}
              <div className="rounded-xl bg-[#12121a] border border-white/10 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                  <h3 className="text-sm font-medium">Job Economics</h3>
                  <span className="ml-auto text-xs text-white/25 font-mono">PRODUCTION</span>
                </div>
                <MetricRow label="Completed jobs" sub="30d" value={m.jobs.completed30d.toLocaleString()} />
                <MetricRow label="Completed jobs" sub="7d"  value={m.jobs.completed7d.toLocaleString()} />
                <MetricRow label="Avg job value" sub="30d" value={fmtUsd(m.jobs.avgJobValue30d)} />
                <MetricRow
                  label="Unpaid completed jobs"
                  value={m.jobs.unpaidCompleted.toString()}
                  alert={m.jobs.unpaidCompleted > 0}
                />
                {m.jobs.unpaidCompleted > 0 && (
                  <MetricRow
                    label="Unpaid value at risk"
                    value={fmtUsd(m.jobs.unpaidValue)}
                    alert
                  />
                )}
              </div>
            </div>

            {/* Stripe + Studio */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Stripe Balance */}
              <div className="rounded-xl bg-[#12121a] border border-white/10 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                  <h3 className="text-sm font-medium">Stripe Balance</h3>
                  {m.stripe.reachable ? (
                    <span className="ml-auto text-xs text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> Live
                    </span>
                  ) : (
                    <span className="ml-auto text-xs text-red-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" /> Unreachable
                    </span>
                  )}
                </div>
                {m.stripe.reachable ? (
                  <>
                    <MetricRow label="Available" value={fmtUsd(m.stripe.availableBalance ?? 0)} alert={(m.stripe.availableBalance ?? 0) < 500} />
                    <MetricRow label="Pending"   value={fmtUsd(m.stripe.pendingBalance   ?? 0)} />
                    <MetricRow label="Currency"  value={m.stripe.currency.toUpperCase()} />
                  </>
                ) : (
                  <div className="py-3 text-xs text-red-400/80">
                    {m.stripe.error ?? "Stripe API unreachable at time of analysis."}
                  </div>
                )}
              </div>

              {/* Studio */}
              <div className="rounded-xl bg-[#12121a] border border-white/10 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-3.5 h-3.5 text-violet-400" />
                  <h3 className="text-sm font-medium">Studio</h3>
                  <span className="ml-auto text-xs text-white/25 font-mono">PRODUCTION</span>
                </div>
                <MetricRow label="Credits consumed" sub="30d" value={m.studio.creditsConsumed30d.toLocaleString()} />
                <MetricRow label="Generations"       sub="30d" value={m.studio.generations30d.toLocaleString()} />
                <MetricRow label="Paid-tier users"   value={m.studio.paidTierUsers.toLocaleString()} />
                <MetricRow label="Active subscriptions" value={m.studio.activeSubscriptions.toLocaleString()} />
              </div>
            </div>

            {/* Top Categories */}
            {m.jobs.topCategories.length > 0 && (
              <div className="rounded-xl bg-[#12121a] border border-white/10 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                  <h3 className="text-sm font-medium">Top Categories by GMV</h3>
                  <span className="text-xs text-white/25 ml-1">last 30d</span>
                </div>
                <div className="space-y-2">
                  {m.jobs.topCategories.map((cat, i) => {
                    const maxVal = m.jobs.topCategories[0]?.totalValue ?? 1;
                    const pct    = Math.round((cat.totalValue / maxVal) * 100);
                    return (
                      <div
                        key={cat.category}
                        className="cursor-pointer"
                        onClick={() => setExpandedCategory(expandedCategory === cat.category ? null : cat.category)}
                        data-testid={`cfo-category-${i}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-white/70 truncate max-w-[200px]">{cat.category}</span>
                          <div className="flex items-center gap-3 text-xs text-white/40 tabular-nums">
                            <span>{cat.count} jobs</span>
                            <span className="text-white font-medium">{fmtUsd(cat.totalValue)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500/60 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {expandedCategory === cat.category && (
                          <div className="mt-1.5 text-xs text-white/30 flex gap-4 pl-1">
                            <span>Avg: {fmtUsd(cat.avgValue)}</span>
                            <span>{cat.count} completed jobs</span>
                            <span>Total: {fmtUsd(cat.totalValue)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
                    Generated {new Date(briefing.generatedAt).toLocaleString()} · Production data only
                  </p>
                </div>
              </div>
            </div>

            {/* No alerts message */}
            {m.alerts.length === 0 && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <p className="text-sm text-emerald-300">No financial alerts — all systems operating normally.</p>
              </div>
            )}
          </>
        )}

        {/* Simulation Controls */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 mt-2">
          <div className="flex items-center gap-2 mb-4">
            <FlaskConical className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium text-white/70">Simulation Data</span>
            <span className="ml-auto text-xs text-white/30">Injects realistic test transactions for agent verification</span>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button
              data-testid="button-sim-seed"
              size="sm"
              variant="outline"
              className="border-violet-500/40 text-violet-300 hover:bg-violet-500/10 gap-2"
              disabled={seedMut.isPending || cleanupMut.isPending}
              onClick={() => seedMut.mutate()}
            >
              {seedMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
              Seed Simulation
            </Button>
            <Button
              data-testid="button-sim-cleanup"
              size="sm"
              variant="outline"
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-2"
              disabled={seedMut.isPending || cleanupMut.isPending}
              onClick={() => cleanupMut.mutate()}
            >
              {cleanupMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Cleanup
            </Button>
          </div>
          {simResult && (
            <div className="mt-4 rounded-lg bg-black/30 border border-violet-500/20 p-4 space-y-2">
              <p className="text-xs font-medium text-violet-300">Seed complete — post-seed analysis</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <span className="text-xs text-white/40">Hirers</span>
                <span className="text-xs text-white/80">{simResult.summary?.hirers}</span>
                <span className="text-xs text-white/40">Workers</span>
                <span className="text-xs text-white/80">{simResult.summary?.workers}</span>
                <span className="text-xs text-white/40">Jobs</span>
                <span className="text-xs text-white/80">{simResult.summary?.jobs}</span>
                <span className="text-xs text-white/40">Transactions</span>
                <span className="text-xs text-white/80">{simResult.summary?.transactions}</span>
                <span className="text-xs text-white/40">Disputes</span>
                <span className="text-xs text-white/80">{simResult.summary?.disputes}</span>
              </div>
              {simResult.analysis && (
                <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-x-6 gap-y-1">
                  <span className="text-xs text-white/40">GMV</span>
                  <span className="text-xs text-emerald-400">${Number(simResult.analysis.gmv ?? 0).toFixed(2)}</span>
                  <span className="text-xs text-white/40">Platform fees</span>
                  <span className="text-xs text-emerald-400">${Number(simResult.analysis.platformFees ?? 0).toFixed(2)}</span>
                  <span className="text-xs text-white/40">Payouts</span>
                  <span className="text-xs text-white/80">${Number(simResult.analysis.workerPayouts ?? 0).toFixed(2)}</span>
                  <span className="text-xs text-white/40">Active jobs</span>
                  <span className="text-xs text-white/80">{simResult.analysis.activeJobs}</span>
                </div>
              )}
              <p className="text-xs text-white/30 pt-1">Regenerate CFO briefing to see these figures reflected above.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
