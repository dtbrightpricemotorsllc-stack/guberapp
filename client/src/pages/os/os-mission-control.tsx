import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Zap, ShieldAlert, MapPin, TrendingUp, AlertTriangle,
  Check, Copy, Share2, Activity, Users, Award, CreditCard, RefreshCw,
  CheckCircle2, XCircle, HelpCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GrowthSnapshot {
  totalUsers: number; newUsersToday: number; newUsersThisWeek: number;
  activeZipCodes: number; deadZipCodes: number; day1OgCount: number;
  trustToolboxSubscriptions: number;
}
interface ZipHealth {
  code: string; users: number; workers: number; openJobs: number;
  completedJobs: number; businesses: number; listings: number;
  healthStatus: "Healthy"|"Hot Zone"|"Needs Users"|"Needs Jobs"|"Needs Workers";
}
interface AIRecommendation {
  id: number; zipCode: string; category: string; guidance: string;
  actionType: string; targetType: string;
}
interface MarketingDraft {
  id: number; platform: string; timeSlot: string;
  targetCityOrZip: string|null; reasonGenerated: string;
  headline: string; body: string;
}
interface HealthCheck {
  key: string; name: string;
  status: "healthy"|"warning"|"critical"|"unknown";
  value: string|number|null; detail: string;
  lastSuccess: string|null; lastFailure: string|null;
  failureReason: string|null; recommendedAction: string|null;
}
interface AppHealthGroup { id: string; label: string; checks: HealthCheck[]; }
interface AppHealthReport {
  generatedAt: string; criticalCount: number; warningCount: number;
  groups: AppHealthGroup[];
}

// ── Nav ───────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: "Command Center", path: "/os/command-center" },
  { label: "Daily Briefing",  path: "/os/briefing" },
  { label: "COO Agent",       path: "/os/coo" },
  { label: "CFO Agent",       path: "/os/cfo" },
  { label: "Growth Agent",    path: "/os/growth" },
  { label: "Mission Control", path: "/os/mission-control" },
  { label: "Dashboard",       path: "/os/dashboard" },
  { label: "Approvals",       path: "/os/approve" },
  { label: "Memory",          path: "/os/memory" },
  { label: "Agents",          path: "/os/agents" },
  { label: "Audit Log",       path: "/os/logs" },
  { label: "Events",          path: "/os/events" },
];

function OSNav() {
  const [location, nav] = useLocation();
  return (
    <div className="border-b border-white/10 bg-[#0d0d14]">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
          <Zap className="w-4 h-4 text-emerald-400" />
        </div>
        <h1 className="text-lg font-semibold text-white">GUBER OS</h1>
      </div>
      <div className="max-w-7xl mx-auto px-6 flex gap-1 pb-0 overflow-x-auto">
        {NAV_ITEMS.map((item) => (
          <button key={item.path} onClick={() => nav(item.path)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              location === item.path
                ? "border-[#39FF14] text-[#39FF14]"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Health Monitor helpers ─────────────────────────────────────────────────────

const STATUS_CFG = {
  healthy:  { label: "Healthy",       color: "text-[#39FF14]",  bg: "bg-[#39FF14]/5 border-[#39FF14]/30",  Icon: CheckCircle2 },
  warning:  { label: "Warning",       color: "text-yellow-400", bg: "bg-yellow-500/5 border-yellow-500/20", Icon: AlertTriangle },
  critical: { label: "Broken",        color: "text-red-400",    bg: "bg-red-500/5 border-red-500/30",       Icon: XCircle },
  unknown:  { label: "Not Configured",color: "text-gray-400",   bg: "bg-gray-800/30 border-gray-700/30",    Icon: HelpCircle },
};

const GROUP_ICONS: Record<string, React.ComponentType<{className?:string}>> = {
  maps: MapPin, auth: ShieldAlert, payments: CreditCard,
  notifications: Zap, production: Activity,
};

function StatusBadge({ status }: { status: HealthCheck["status"] }) {
  const cfg = STATUS_CFG[status];
  return (
    <span className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${cfg.bg} ${cfg.color}`}>
      <cfg.Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function HealthGroupCard({ group }: { group: AppHealthGroup }) {
  const [open, setOpen] = useState(true);
  const GroupIcon = GROUP_ICONS[group.id] ?? Activity;
  const critical = group.checks.filter(c => c.status === "critical").length;
  const warning  = group.checks.filter(c => c.status === "warning").length;

  return (
    <div className="bg-[#0D0D0D] border border-gray-900 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/2 transition-colors"
      >
        <div className="flex items-center gap-3">
          <GroupIcon className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-mono font-bold text-gray-200 uppercase tracking-wider">{group.label}</span>
          {critical > 0 && (
            <span className="bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-mono px-2 py-0.5 rounded uppercase">
              {critical} broken
            </span>
          )}
          {warning > 0 && (
            <span className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-[10px] font-mono px-2 py-0.5 rounded uppercase">
              {warning} warning
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-600" /> : <ChevronDown className="w-4 h-4 text-gray-600" />}
      </button>

      {open && (
        <div className="border-t border-gray-900 divide-y divide-gray-900/60">
          {group.checks.map(check => {
            const cfg = STATUS_CFG[check.status];
            return (
              <div key={check.key} className="px-5 py-3.5" data-testid={`check-${check.key}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <cfg.Icon className={`w-3.5 h-3.5 flex-shrink-0 ${cfg.color}`} />
                      <span className="text-sm font-medium text-gray-200">{check.name}</span>
                      {check.value != null && (
                        <span className="text-xs font-mono text-gray-500 truncate">{check.value}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{check.detail}</p>
                    {check.recommendedAction && check.status !== "healthy" && (
                      <p className="text-xs text-[#A020F0] mt-1.5 leading-relaxed">
                        → {check.recommendedAction}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={check.status} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

const ZIP_STATUS_STYLES: Record<string, string> = {
  "Healthy":       "bg-[#39FF14]/5 border-[#39FF14]/30 text-[#39FF14]",
  "Hot Zone":      "bg-[#A020F0]/10 border-[#A020F0]/40 text-purple-400 font-extrabold",
  "Needs Users":   "bg-blue-500/5 border-blue-500/20 text-blue-400",
  "Needs Jobs":    "bg-yellow-500/5 border-yellow-500/20 text-yellow-400",
  "Needs Workers": "bg-orange-500/5 border-orange-500/20 text-orange-400",
};

function SectionError({ msg = "Production data unavailable" }: { msg?: string }) {
  return (
    <div className="p-6 bg-black border border-red-950/40 rounded-lg text-center font-mono text-xs text-red-400">
      {msg}
    </div>
  );
}

function SectionEmpty() {
  return (
    <div className="p-6 bg-black rounded-lg border border-gray-950 text-center">
      <p className="text-gray-500 text-sm font-mono">No production activity yet.</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OSMissionControl() {
  const qc = useQueryClient();
  const [copiedId, setCopiedId] = useState<number|null>(null);
  const [publishedIds, setPublishedIds] = useState<number[]>([]);

  const refreshAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["/api/admin/growth-snapshot"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/zip-health"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/ai-recommendations"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/marketing-queue"] });
  }, [qc]);

  const runHealthCheck = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["/api/admin/app-health"] });
  }, [qc]);

  const snapshotQ = useQuery<GrowthSnapshot>({ queryKey: ["/api/admin/growth-snapshot"] });
  const zipQ      = useQuery<ZipHealth[]>({ queryKey: ["/api/admin/zip-health"] });
  const recsQ     = useQuery<AIRecommendation[]>({ queryKey: ["/api/admin/ai-recommendations"] });
  const mktQ      = useQuery<MarketingDraft[]>({ queryKey: ["/api/admin/marketing-queue"] });
  const healthQ   = useQuery<AppHealthReport>({ queryKey: ["/api/admin/app-health"] });

  const publishMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/admin/marketing/publish/${id}`),
    onSuccess: (_: unknown, id: number) => {
      setPublishedIds(prev => [...prev, id]);
      qc.invalidateQueries({ queryKey: ["/api/admin/marketing-queue"] });
    },
  });

  const isRefreshing = snapshotQ.isFetching || zipQ.isFetching || recsQ.isFetching || mktQ.isFetching;

  const snap   = snapshotQ.data;
  const zips   = zipQ.data ?? [];
  const recs   = recsQ.data ?? [];
  const mkt    = mktQ.data ?? [];
  const health = healthQ.data;

  const copyText = (text: string, id: number) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // All critical checks across all groups (for top alert strip)
  const criticalChecks = health?.groups.flatMap(g => g.checks).filter(c => c.status === "critical") ?? [];
  const warningChecks  = health?.groups.flatMap(g => g.checks).filter(c => c.status === "warning") ?? [];

  return (
    <div className="min-h-screen bg-[#080810] text-gray-100">
      <OSNav />

      <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">

        {/* Header */}
        <div className="border-b border-[#39FF14]/20 pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tighter bg-gradient-to-r from-white via-gray-400 to-[#A020F0] bg-clip-text text-transparent uppercase">
              GUBER MISSION CONTROL
            </h1>
            <p className="text-xs font-mono text-[#39FF14]/70 mt-1 uppercase tracking-wider">
              Growth Engine V1 &bull; Production Workspace
            </p>
          </div>
          <div className="flex items-center gap-3 self-start md:self-center">
            <button onClick={refreshAll} disabled={isRefreshing} data-testid="button-refresh"
              className="flex items-center gap-2 bg-black border border-gray-800 hover:border-[#39FF14] px-4 py-2 rounded-md text-xs font-mono text-gray-400 hover:text-[#39FF14] transition-all disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#39FF14]" : ""}`} />
              <span>{isRefreshing ? "REFRESHING..." : "REFRESH DATA"}</span>
            </button>
            <div className="flex items-center gap-2 bg-[#A020F0]/10 border border-[#A020F0]/30 px-4 py-2 rounded-md text-xs font-bold font-mono tracking-widest text-[#A020F0]">
              <Zap className="w-3.5 h-3.5 animate-pulse text-[#39FF14]" />
              GROWTH ENGINE ONLINE
            </div>
          </div>
        </div>

        {/* ── App Health Monitor ────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-mono font-bold text-gray-400 tracking-widest uppercase flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#39FF14]" /> App Health Monitor
            </h2>
            <button
              onClick={runHealthCheck}
              disabled={healthQ.isFetching}
              data-testid="button-run-health-check"
              className="flex items-center gap-2 bg-black border border-gray-800 hover:border-[#39FF14] px-4 py-2 rounded-md text-xs font-mono text-gray-400 hover:text-[#39FF14] transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${healthQ.isFetching ? "animate-spin text-[#39FF14]" : ""}`} />
              {healthQ.isFetching ? "RUNNING..." : "RUN HEALTH CHECK"}
            </button>
          </div>

          {/* Critical / Warning alert strip */}
          {!healthQ.isLoading && !healthQ.isError && (criticalChecks.length > 0 || warningChecks.length > 0) && (
            <div className="space-y-2 mb-5">
              {criticalChecks.map(c => (
                <div key={c.key} data-testid={`alert-critical-${c.key}`}
                  className="flex items-start gap-3 bg-red-500/5 border border-red-500/30 rounded-lg px-4 py-3">
                  <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-mono font-bold text-red-400 uppercase">{c.name} — Broken</span>
                    <p className="text-xs text-gray-400 mt-0.5">{c.detail}</p>
                    {c.recommendedAction && (
                      <p className="text-xs text-[#A020F0] mt-1">→ {c.recommendedAction}</p>
                    )}
                  </div>
                </div>
              ))}
              {warningChecks.map(c => (
                <div key={c.key} data-testid={`alert-warning-${c.key}`}
                  className="flex items-start gap-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-mono font-bold text-yellow-400 uppercase">{c.name} — Warning</span>
                    <p className="text-xs text-gray-400 mt-0.5">{c.detail}</p>
                    {c.recommendedAction && (
                      <p className="text-xs text-[#A020F0] mt-1">→ {c.recommendedAction}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* All clear banner */}
          {!healthQ.isLoading && !healthQ.isError && criticalChecks.length === 0 && warningChecks.length === 0 && health && (
            <div className="flex items-center gap-3 bg-[#39FF14]/5 border border-[#39FF14]/20 rounded-lg px-4 py-3 mb-5">
              <CheckCircle2 className="w-4 h-4 text-[#39FF14]" />
              <span className="text-xs font-mono text-[#39FF14]">
                All systems healthy — {health.groups.flatMap(g => g.checks).length} checks passed
              </span>
              <span className="ml-auto text-[10px] font-mono text-gray-600">
                {health.generatedAt ? new Date(health.generatedAt).toLocaleTimeString() : ""}
              </span>
            </div>
          )}

          {healthQ.isError && (
            <div className="p-4 bg-black border border-red-950/40 rounded-lg text-center font-mono text-xs text-red-400 mb-5">
              Health check failed — check server logs
            </div>
          )}

          {healthQ.isLoading && (
            <div className="p-6 bg-[#0D0D0D] border border-gray-900 rounded-xl text-center font-mono text-xs text-gray-500 mb-5">
              <RefreshCw className="w-4 h-4 animate-spin text-[#39FF14] mx-auto mb-2" />
              Running diagnostics across all systems…
            </div>
          )}

          {/* Grouped check cards */}
          {health && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {health.groups.map(group => (
                <HealthGroupCard key={group.id} group={group} />
              ))}
            </div>
          )}
        </section>

        {/* ── Growth Dashboard ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left column */}
          <div className="lg:col-span-1 space-y-8">

            {/* 1. Growth Snapshot */}
            <section className="bg-[#0D0D0D] border border-gray-900 rounded-xl p-6 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#A020F0] to-transparent" />
              <h2 className="text-xs font-mono font-bold text-gray-400 tracking-widest uppercase mb-6 flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#39FF14]" /> 1. Growth Snapshot
              </h2>
              {snapshotQ.isError ? <SectionError /> : (
                <div className="space-y-3">
                  {[
                    { label: "Total Platform Users",    val: snap?.totalUsers,               Icon: Users },
                    { label: "New Users Today",         val: snap?.newUsersToday,             Icon: TrendingUp },
                    { label: "New Users This Week",     val: snap?.newUsersThisWeek,          Icon: TrendingUp },
                    { label: "Active ZIP Codes",        val: snap?.activeZipCodes,            Icon: MapPin },
                    { label: "Dead ZIP Codes",          val: snap?.deadZipCodes,              Icon: MapPin },
                    { label: "Day-1 OG Count",          val: snap?.day1OgCount,               Icon: Award },
                    { label: "Trust Box Subscriptions", val: snap?.trustToolboxSubscriptions, Icon: CreditCard },
                  ].map(({ label, val, Icon }) => (
                    <div key={label} className="flex items-center justify-between p-3 bg-[#141414] rounded-lg border border-gray-950">
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-300">{label}</span>
                      </div>
                      <span className="text-base font-bold text-white font-mono" data-testid={`text-snapshot-${label.toLowerCase().replace(/\s+/g,"-")}`}>
                        {snapshotQ.isLoading ? "—" : (val ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 3. AI Growth Recommendations */}
            <section className="bg-[#0D0D0D] border border-gray-900 rounded-xl p-6 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#39FF14] to-transparent" />
              <h2 className="text-xs font-mono font-bold text-gray-400 tracking-widest uppercase mb-6 flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#A020F0]" /> 3. AI Growth Recommendations
              </h2>
              {recsQ.isError ? <SectionError /> :
               recs.length === 0 ? <SectionEmpty /> : (
                <div className="space-y-4">
                  {recs.map((rec) => (
                    <div key={rec.id} className="bg-black border border-gray-950 p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono text-[#39FF14] font-bold">ZIP: {rec.zipCode}</span>
                        <span className="text-[10px] font-mono bg-[#A020F0]/10 border border-[#A020F0]/30 px-2 py-0.5 rounded text-[#A020F0] uppercase">
                          {rec.category}
                        </span>
                      </div>
                      <p className="text-sm text-gray-200 mb-3 leading-relaxed">{rec.guidance}</p>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-gray-400 border-t border-gray-950 pt-2">
                        <div>Action: <span className="text-white">{rec.actionType}</span></div>
                        <div>Tier: <span className="text-white">{rec.targetType}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-8">

            {/* 2. ZIP Health Engine */}
            <section className="bg-[#0D0D0D] border border-gray-900 rounded-xl p-6 shadow-2xl">
              <h2 className="text-xs font-mono font-bold text-gray-400 tracking-widest uppercase mb-6 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#39FF14]" /> 2. ZIP Health Engine
              </h2>
              {zipQ.isError ? <SectionError /> :
               zips.length === 0 ? <SectionEmpty /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-900 text-[11px] font-mono text-gray-500 uppercase tracking-wider">
                        <th className="pb-3 font-medium">ZIP</th>
                        <th className="pb-3 font-medium text-center">Users</th>
                        <th className="pb-3 font-medium text-center">Helpers</th>
                        <th className="pb-3 font-medium text-center">Open / Done</th>
                        <th className="pb-3 font-medium text-center">Biz</th>
                        <th className="pb-3 font-medium text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-950 text-sm font-mono">
                      {zips.map((zip) => (
                        <tr key={zip.code} className="hover:bg-[#141414]/40 transition-colors" data-testid={`row-zip-${zip.code}`}>
                          <td className="py-3.5 font-bold text-white">{zip.code}</td>
                          <td className="py-3.5 text-center text-gray-300">{zip.users}</td>
                          <td className="py-3.5 text-center text-gray-300">{zip.workers}</td>
                          <td className="py-3.5 text-center text-gray-400">
                            <span className="text-white">{zip.openJobs}</span> / {zip.completedJobs}
                          </td>
                          <td className="py-3.5 text-center text-gray-300">{zip.businesses}</td>
                          <td className="py-3.5 text-right">
                            <span className={`inline-block border px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${ZIP_STATUS_STYLES[zip.healthStatus] ?? "border-gray-800 text-gray-400"}`}>
                              {zip.healthStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 4. Marketing Queue */}
            <section className="bg-[#0D0D0D] border border-gray-900 rounded-xl p-6 shadow-2xl">
              <h2 className="text-xs font-mono font-bold text-gray-400 tracking-widest uppercase mb-6 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-[#A020F0]" /> 4. Marketing Queue
              </h2>
              {mktQ.isError ? <SectionError /> :
               mkt.length === 0 ? <SectionEmpty /> : (
                <div className="space-y-6">
                  {mkt.map((draft) => {
                    const isCopied    = copiedId === draft.id;
                    const isPublished = publishedIds.includes(draft.id);
                    return (
                      <div key={draft.id} className="bg-black border border-gray-900 rounded-xl overflow-hidden" data-testid={`card-draft-${draft.id}`}>
                        <div className="bg-[#141414] px-4 py-2.5 border-b border-gray-950 flex flex-wrap items-center justify-between text-[10px] font-mono gap-2">
                          <div className="text-gray-400 font-bold uppercase">
                            {draft.timeSlot} &bull; Target: <span className="text-white">{draft.platform}</span>
                          </div>
                          <div className="text-[#39FF14] bg-[#39FF14]/5 border border-[#39FF14]/20 px-2 py-0.5 rounded uppercase">
                            Region: {draft.targetCityOrZip ?? "All Markets"}
                          </div>
                        </div>
                        <div className="p-5">
                          <div className="mb-4 bg-[#0F0F14] border border-purple-950/40 rounded px-3 py-2 flex items-start gap-2 text-xs text-gray-400 font-mono">
                            <AlertTriangle className="w-3.5 h-3.5 text-[#A020F0] mt-0.5 flex-shrink-0" />
                            <div><span className="text-gray-500 uppercase font-bold">Reason: </span>{draft.reasonGenerated}</div>
                          </div>
                          <div className="bg-[#0A0A0A] border border-gray-950 rounded-lg p-4 mb-4">
                            <h4 className="text-[#39FF14] text-xs font-mono uppercase tracking-wider mb-2">&gt; {draft.headline}</h4>
                            <p className="text-sm text-gray-300 leading-relaxed">{draft.body}</p>
                          </div>
                          <div className="flex justify-end items-center gap-3">
                            <button data-testid={`button-copy-${draft.id}`}
                              onClick={() => copyText(`${draft.headline}\n\n${draft.body}`, draft.id)}
                              className={`flex items-center gap-1.5 px-4 py-2 rounded font-mono text-xs font-semibold transition-all ${
                                isCopied
                                  ? "bg-[#39FF14]/10 border border-[#39FF14] text-[#39FF14]"
                                  : "bg-[#141414] border border-gray-800 text-gray-400 hover:text-white hover:border-gray-700"
                              }`}>
                              <Copy className="w-3.5 h-3.5" />
                              <span>{isCopied ? "Copied" : "Copy Payload"}</span>
                            </button>
                            <button data-testid={`button-publish-${draft.id}`}
                              disabled={isPublished || publishMut.isPending}
                              onClick={() => publishMut.mutate(draft.id)}
                              className={`flex items-center gap-1.5 px-4 py-2 rounded font-mono text-xs font-bold transition-all ${
                                isPublished
                                  ? "bg-gray-950 border border-gray-900 text-gray-600 cursor-not-allowed"
                                  : "bg-[#A020F0] text-white border border-[#A020F0] hover:bg-[#B030FF] shadow-[0_0_15px_rgba(160,32,240,0.15)]"
                              }`}>
                              {isPublished
                                ? <><Check className="w-3.5 h-3.5 text-gray-600" /><span>Dispatched</span></>
                                : <><Share2 className="w-3.5 h-3.5" /><span>Approve & Broadcast</span></>
                              }
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
