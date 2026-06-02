import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, Cpu, AlertTriangle, XCircle, CheckCircle2, Info,
  TrendingDown, Inbox, Send, ChevronDown, ChevronUp, ShieldAlert,
  Activity, BarChart3, Loader2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type ImpactLevel = "critical" | "high" | "medium" | "low";

interface COOFinding {
  id: string;
  category: string;
  categoryLabel: string;
  issue: string;
  detail: string;
  whyItMatters: string;
  impactLevel: ImpactLevel;
  recommendation: string;
  data: Record<string, any>;
  score: number;
}

interface COOBriefing {
  id?: number;
  generatedAt: string;
  platformHealthScore: number;
  executiveSummary: string;
  top5: COOFinding[];
  allFindings: COOFinding[];
  categoryCounts: Record<string, number>;
  totalFindings: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const IMPACT_CFG: Record<ImpactLevel, {
  label: string; dot: string; text: string; bg: string; border: string; Icon: any;
}> = {
  critical: { label: "Critical",  dot: "bg-red-400 animate-pulse",  text: "text-red-400",    bg: "bg-red-500/5",    border: "border-red-500/30",    Icon: XCircle },
  high:     { label: "High",      dot: "bg-orange-400",              text: "text-orange-400", bg: "bg-orange-500/5", border: "border-orange-500/30", Icon: AlertTriangle },
  medium:   { label: "Medium",    dot: "bg-amber-400",               text: "text-amber-400",  bg: "bg-amber-500/5",  border: "border-amber-400/20",  Icon: Info },
  low:      { label: "Low",       dot: "bg-blue-400",                text: "text-blue-400",   bg: "bg-blue-500/5",   border: "border-blue-500/20",   Icon: Activity },
};

const CATEGORY_ICON: Record<string, any> = {
  disputes:       ShieldAlert,
  stuck_jobs:     Activity,
  cancellations:  TrendingDown,
  failed_flows:   XCircle,
  marketplace:    Inbox,
  vi_bottleneck:  AlertTriangle,
  load_board:     BarChart3,
  trends:         TrendingDown,
};

const NAV = [
  { label: "Command Center", path: "/os/command-center" },
  { label: "Daily Briefing",  path: "/os/briefing" },
  { label: "COO Agent",       path: "/os/coo", active: true },
  { label: "Dashboard",       path: "/os/dashboard" },
  { label: "Approvals",       path: "/os/approve" },
  { label: "Memory",          path: "/os/memory" },
  { label: "Agents",          path: "/os/agents" },
  { label: "Audit Log",       path: "/os/logs" },
  { label: "Events",          path: "/os/events" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function healthColor(score: number) {
  if (score >= 90) return { text: "text-emerald-400", ring: "ring-emerald-400/30", label: "Excellent" };
  if (score >= 70) return { text: "text-green-400",   ring: "ring-green-400/30",   label: "Good" };
  if (score >= 50) return { text: "text-amber-400",   ring: "ring-amber-400/30",   label: "Attention" };
  if (score >= 30) return { text: "text-orange-400",  ring: "ring-orange-400/30",  label: "Concerning" };
  return                  { text: "text-red-400",      ring: "ring-red-400/30",     label: "Critical" };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FindingCard({
  finding, rank, showQueue, queued, queueing, onQueue,
}: {
  finding: COOFinding;
  rank?: number;
  showQueue: boolean;
  queued: boolean;
  queueing: boolean;
  onQueue: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = IMPACT_CFG[finding.impactLevel];
  const CatIcon = CATEGORY_ICON[finding.category] ?? Activity;

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {rank != null && (
            <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ring-1 ${
              rank === 1 ? "ring-violet-500/40 bg-violet-500/15 text-violet-400"
              : rank <= 3 ? `ring-1 ${cfg.border} text-white/40`
              : "ring-white/10 bg-white/5 text-white/25"
            }`}>
              {rank}
            </div>
          )}
          {!rank && (
            <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${cfg.bg} border ${cfg.border}`}>
              <CatIcon className={`w-3.5 h-3.5 ${cfg.text}`} />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">
                {finding.categoryLabel}
              </span>
              <span className={`flex items-center gap-1 text-[10px] font-semibold ${cfg.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
            </div>
            <p className="text-sm font-semibold text-white/90 leading-snug">{finding.issue}</p>
            <p className="text-xs text-white/35 mt-0.5 font-mono">{finding.detail}</p>
          </div>

          <button
            onClick={() => setExpanded(e => !e)}
            className="flex-shrink-0 text-white/25 hover:text-white/60 transition-colors mt-0.5"
            data-testid={`btn-expand-finding-${finding.id}`}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Expanded body */}
        {expanded && (
          <div className="mt-4 ml-10 space-y-3">
            <div>
              <p className="text-[10px] font-semibold tracking-widest text-white/25 uppercase mb-1">Why It Matters</p>
              <p className="text-sm text-white/60 leading-relaxed">{finding.whyItMatters}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-widest text-white/25 uppercase mb-1">Recommended Action</p>
              <p className="text-sm text-amber-400/80 leading-relaxed">{finding.recommendation}</p>
            </div>
          </div>
        )}
      </div>

      {/* Queue button row */}
      {showQueue && (
        <div className={`px-5 py-3 border-t ${cfg.border} flex items-center justify-between`}>
          <p className="text-[10px] text-white/20">Advisory only — no actions taken automatically</p>
          {queued ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="w-3 h-3" /> Queued for review
            </span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onQueue}
              disabled={queueing}
              className={`h-7 text-xs border-white/20 text-white/60 hover:text-white hover:border-white/40`}
              data-testid={`btn-queue-${finding.id}`}
            >
              {queueing ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Send className="w-3 h-3 mr-1.5" />}
              Queue for Founder Review
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OSCOOAgent() {
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const [queueingId, setQueueingId] = useState<string | null>(null);
  const [view, setView] = useState<"top5" | "all">("top5");

  const { data, isLoading } = useQuery<{ briefing: COOBriefing | null }>({
    queryKey: ["/api/os/coo/briefing"],
    queryFn: async () => {
      const r = await fetch("/api/os/coo/briefing", { credentials: "include" });
      return r.json();
    },
    staleTime: 10 * 60_000,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/os/coo/generate", { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/os/coo/briefing"] }),
  });

  const queueMutation = useMutation({
    mutationFn: async (finding: COOFinding) => {
      setQueueingId(finding.id);
      const r = await fetch("/api/os/coo/queue", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finding }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (_data, finding) => {
      setQueuedIds(s => new Set([...s, finding.id]));
      setQueueingId(null);
    },
    onError: () => setQueueingId(null),
  });

  const briefing = data?.briefing ?? null;
  const hc = briefing ? healthColor(briefing.platformHealthScore) : null;
  const critCount = briefing?.allFindings.filter(f => f.impactLevel === "critical").length ?? 0;
  const highCount = briefing?.allFindings.filter(f => f.impactLevel === "high").length ?? 0;
  const displayFindings = view === "top5" ? (briefing?.top5 ?? []) : (briefing?.allFindings ?? []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Top nav */}
      <div className="border-b border-white/10 bg-[#0d0d14]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-violet-400" />
          </div>
          <h1 className="text-lg font-semibold">GUBER OS</h1>
          <div className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            <span className="text-[10px] font-semibold tracking-widest text-violet-400 uppercase">Advisory Only</span>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-6 flex gap-1 pb-0 overflow-x-auto scrollbar-none">
          {NAV.map(item => (
            <button
              key={item.path}
              onClick={() => nav(item.path)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                item.active ? "border-violet-500 text-white" : "border-transparent text-white/50 hover:text-white/80"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-xs font-semibold tracking-widest text-white/30 uppercase mb-1">COO Agent</p>
            <h2 className="text-2xl font-semibold">Morning Operational Briefing</h2>
            <p className="text-sm text-white/30 mt-1">
              {briefing ? `Generated ${fmtDate(briefing.generatedAt)}` : "No briefing yet — generate your first one below"}
            </p>
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="bg-violet-600 hover:bg-violet-500 text-white h-9 text-sm"
            data-testid="btn-coo-generate"
          >
            {generateMutation.isPending
              ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Analyzing…</>
              : <><RefreshCw className="w-3.5 h-3.5 mr-2" />{briefing ? "Regenerate" : "Generate Briefing"}</>
            }
          </Button>
        </div>

        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-[#12121a] p-6 animate-pulse">
                <div className="h-3 w-24 bg-white/5 rounded mb-3" />
                <div className="h-4 w-3/4 bg-white/5 rounded" />
              </div>
            ))}
          </div>
        )}

        {generateMutation.isPending && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-8 text-center mb-6">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-white/70">Running COO Analysis…</p>
            <p className="text-xs text-white/30 mt-1">
              Analyzing disputes · stuck jobs · cancellations · failed flows · marketplace · V&I · load board · trends
            </p>
          </div>
        )}

        {briefing && !generateMutation.isPending && (
          <>
            {/* Health Score + Summary row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Health score */}
              <div className="rounded-xl border border-white/10 bg-[#12121a] p-5 flex flex-col items-center justify-center">
                <p className="text-[10px] font-semibold tracking-widest text-white/25 uppercase mb-3">Platform Health</p>
                <div className={`text-5xl font-bold tabular-nums ${hc!.text} ring-4 ${hc!.ring} rounded-full w-24 h-24 flex items-center justify-center`}>
                  {briefing.platformHealthScore}
                </div>
                <p className={`text-xs font-semibold mt-3 ${hc!.text}`}>{hc!.label}</p>
                <p className="text-[10px] text-white/20 mt-1">out of 100</p>
              </div>

              {/* Issue summary */}
              <div className="md:col-span-2 rounded-xl border border-white/10 bg-[#12121a] p-5">
                <p className="text-[10px] font-semibold tracking-widest text-white/25 uppercase mb-3">Executive Summary</p>
                <p className="text-sm text-white/70 leading-relaxed mb-4">{briefing.executiveSummary}</p>
                <div className="flex flex-wrap gap-2">
                  {critCount > 0 && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20">
                      <XCircle className="w-3 h-3" /> {critCount} critical
                    </span>
                  )}
                  {highCount > 0 && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-400 text-xs font-medium border border-orange-500/20">
                      <AlertTriangle className="w-3 h-3" /> {highCount} high
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 text-white/40 text-xs font-medium border border-white/10">
                    {briefing.totalFindings} finding{briefing.totalFindings !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 text-white/40 text-xs font-medium border border-white/10">
                    {Object.keys(briefing.categoryCounts).length} area{Object.keys(briefing.categoryCounts).length !== 1 ? "s" : ""} flagged
                  </span>
                </div>
              </div>
            </div>

            {briefing.totalFindings === 0 && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                <p className="text-base font-semibold text-emerald-400">All clear</p>
                <p className="text-sm text-white/40 mt-1">No operational issues detected across all 8 analysis categories.</p>
              </div>
            )}

            {briefing.totalFindings > 0 && (
              <>
                {/* View toggle */}
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => setView("top5")}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      view === "top5" ? "bg-violet-600 text-white" : "text-white/40 hover:text-white/70"
                    }`}
                    data-testid="btn-view-top5"
                  >
                    Top 5 Priorities
                  </button>
                  <button
                    onClick={() => setView("all")}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      view === "all" ? "bg-violet-600 text-white" : "text-white/40 hover:text-white/70"
                    }`}
                    data-testid="btn-view-all"
                  >
                    All Findings ({briefing.totalFindings})
                  </button>
                  <span className="ml-auto text-[10px] text-white/20">
                    Each recommendation must go through the founder approval queue before any action is taken.
                  </span>
                </div>

                {/* Findings list */}
                <div className="space-y-3">
                  {displayFindings.map((finding, i) => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      rank={view === "top5" ? i + 1 : undefined}
                      showQueue
                      queued={queuedIds.has(finding.id)}
                      queueing={queueingId === finding.id}
                      onQueue={() => queueMutation.mutate(finding)}
                    />
                  ))}
                </div>

                {/* Footer note */}
                <div className="mt-8 rounded-xl border border-white/5 bg-white/2 p-4">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-white/50">COO Agent — Advisory Mode</p>
                      <p className="text-xs text-white/25 mt-0.5 leading-relaxed">
                        This agent analyzes platform data and generates recommendations only. It cannot message users, issue refunds, suspend accounts, modify jobs, or take any automated action. All recommendations sent to the approval queue require explicit founder approval before anything happens.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {!isLoading && !briefing && !generateMutation.isPending && (
          <div className="rounded-xl border border-white/10 bg-[#12121a] p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
              <Activity className="w-7 h-7 text-violet-400" />
            </div>
            <p className="text-base font-semibold text-white/70 mb-1">No briefing generated yet</p>
            <p className="text-sm text-white/30 mb-6">
              The COO Agent will analyze 8 operational categories and surface the top issues requiring your attention.
            </p>
            <Button
              onClick={() => generateMutation.mutate()}
              className="bg-violet-600 hover:bg-violet-500 text-white"
              data-testid="btn-coo-generate-empty"
            >
              <Activity className="w-4 h-4 mr-2" />
              Generate First Briefing
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
