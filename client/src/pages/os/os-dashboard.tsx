import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity, AlertTriangle, CheckCircle, Clock, Database,
  Eye, FileText, ShieldCheck, Users, Zap, ChevronRight,
  Radio, Cpu, TrendingUp, Circle
} from "lucide-react";

type DashboardData = {
  health: {
    userCount: number;
    jobCount: number;
    openDisputeCount: number;
    studioSessionCount: number;
    systemStatus: string;
  };
  revenue: {
    totalGmv: number;
    totalPayouts: number;
    totalRefunds: number;
    periodLabel: string;
  };
  growth: {
    totalUsers: number;
    newUsersLast7d: number;
    newUsersLast30d: number;
    verifiedUsers: number;
  };
  recentBriefings: any[];
  pendingActions: any[];
  recentEvents: any[];
  recentRuns: any[];
};

type HealthData = {
  status: string;
  platform: any;
  os: {
    agentsInRegistry: number;
    eventsLogged: number;
    pendingActions: number;
    auditEntries: number;
  };
  timestamp: string;
};

const TIER_COLORS: Record<string, string> = {
  read: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  low: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  medium: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  founder: "bg-red-500/20 text-red-300 border-red-500/30",
};

function fmt(n: number) {
  return n.toLocaleString();
}
function fmtUsd(n: number) {
  return `$${n.toFixed(2)}`;
}
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function OSDashboard() {
  const [, nav] = useLocation();
  const { toast } = useToast();

  const { data: dash, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/os/dashboard"],
  });

  const { data: health } = useQuery<HealthData>({
    queryKey: ["/api/os/health"],
    refetchInterval: 30_000,
  });

  const testEventMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/os/events/test", {
        eventType: "system.health_check",
        payload: { triggeredBy: "founder_dashboard", timestamp: new Date().toISOString() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/os/dashboard"] });
      toast({ title: "Test event emitted", description: "system.health_check" });
    },
  });

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#0d0d14]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">GUBER OS</h1>
              <p className="text-xs text-white/40">Phase 1 — Foundation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {health?.status === "operational" ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <Circle className="w-2 h-2 fill-emerald-400" /> Operational
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-amber-400">
                <Circle className="w-2 h-2 fill-amber-400" /> Degraded
              </span>
            )}
          </div>
        </div>
        {/* Nav */}
        <div className="max-w-7xl mx-auto px-6 flex gap-1 pb-0">
          {[
            { label: "Command Center", path: "/os/command-center" },
            { label: "Dashboard", path: "/os/dashboard", active: true },
            { label: "Approvals", path: "/os/approve" },
            { label: "Memory", path: "/os/memory" },
            { label: "Agents", path: "/os/agents" },
            { label: "Audit Log", path: "/os/logs" },
            { label: "Events", path: "/os/events" },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => nav(item.path)}
              data-testid={`nav-${item.label.toLowerCase().replace(" ", "-")}`}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                item.active
                  ? "border-violet-500 text-white"
                  : "border-transparent text-white/50 hover:text-white/80"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* OS Health Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Agents in Registry",
              value: health?.os.agentsInRegistry ?? "—",
              icon: <Cpu className="w-4 h-4 text-violet-400" />,
              note: "Phase 2: COO, CFO, CTO, Growth, Support",
            },
            {
              label: "Events Logged",
              value: fmt(health?.os.eventsLogged ?? 0),
              icon: <Radio className="w-4 h-4 text-blue-400" />,
              note: "Event bus active",
            },
            {
              label: "Pending Approvals",
              value: health?.os.pendingActions ?? 0,
              icon: <Clock className="w-4 h-4 text-amber-400" />,
              note: "Awaiting decision",
              urgent: (health?.os.pendingActions ?? 0) > 0,
            },
            {
              label: "Audit Entries",
              value: fmt(health?.os.auditEntries ?? 0),
              icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />,
              note: "Write-once log",
            },
          ].map((s) => (
            <Card
              key={s.label}
              className="bg-[#12121a] border-white/10"
              data-testid={`os-stat-${s.label.toLowerCase().replace(/\s/g, "-")}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-white/40 mb-1">{s.label}</p>
                    <p
                      className={`text-2xl font-bold ${
                        s.urgent ? "text-amber-400" : "text-white"
                      }`}
                    >
                      {s.value}
                    </p>
                    <p className="text-xs text-white/30 mt-1">{s.note}</p>
                  </div>
                  <div className="mt-0.5">{s.icon}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Platform Health + Revenue */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-[#12121a] border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white/60 font-medium flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" /> Platform Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Active Users", value: fmt(dash?.health.userCount ?? 0) },
                { label: "Total Jobs", value: fmt(dash?.health.jobCount ?? 0) },
                { label: "Open Disputes", value: fmt(dash?.health.openDisputeCount ?? 0), alert: (dash?.health.openDisputeCount ?? 0) > 0 },
                { label: "Studio Sessions (24h)", value: fmt(dash?.health.studioSessionCount ?? 0) },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-xs text-white/50">{item.label}</span>
                  <span className={`text-sm font-medium ${item.alert ? "text-amber-400" : "text-white"}`}>
                    {item.value}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-[#12121a] border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white/60 font-medium flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" /> Revenue ({dash?.revenue.periodLabel})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "GMV", value: fmtUsd(dash?.revenue.totalGmv ?? 0) },
                { label: "Payouts", value: fmtUsd(dash?.revenue.totalPayouts ?? 0) },
                { label: "Refunds", value: fmtUsd(dash?.revenue.totalRefunds ?? 0), alert: (dash?.revenue.totalRefunds ?? 0) > 100 },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-xs text-white/50">{item.label}</span>
                  <span className={`text-sm font-medium ${item.alert ? "text-amber-400" : "text-white"}`}>
                    {item.value}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-[#12121a] border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white/60 font-medium flex items-center gap-2">
                <Users className="w-3.5 h-3.5" /> User Growth
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Total Users", value: fmt(dash?.growth.totalUsers ?? 0) },
                { label: "New (7d)", value: fmt(dash?.growth.newUsersLast7d ?? 0) },
                { label: "New (30d)", value: fmt(dash?.growth.newUsersLast30d ?? 0) },
                { label: "ID Verified", value: fmt(dash?.growth.verifiedUsers ?? 0) },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-xs text-white/50">{item.label}</span>
                  <span className="text-sm font-medium text-white">{item.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Pending Actions + Recent Events */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pending Actions */}
          <Card className="bg-[#12121a] border-white/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400" /> Pending Approvals
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-white/40 h-6 px-2"
                  onClick={() => nav("/os/approve")}
                >
                  View all <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {dash?.pendingActions.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-white/40 py-4 justify-center">
                  <CheckCircle className="w-4 h-4 text-emerald-500" /> All clear — no pending actions
                </div>
              )}
              {dash?.pendingActions.slice(0, 5).map((action: any) => (
                <div
                  key={action.id}
                  className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0"
                  data-testid={`pending-action-${action.id}`}
                >
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded border font-mono ${
                      TIER_COLORS[action.riskTier] ?? TIER_COLORS.medium
                    }`}
                  >
                    {action.riskTier}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{action.actionType}</p>
                    <p className="text-xs text-white/40 truncate">{action.rationale}</p>
                  </div>
                  <span className="text-xs text-white/30 shrink-0">
                    {timeAgo(action.createdAt)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recent Events */}
          <Card className="bg-[#12121a] border-white/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-blue-400" /> Event Bus
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-white/40 h-6 px-2"
                  onClick={() => testEventMut.mutate()}
                  disabled={testEventMut.isPending}
                  data-testid="button-emit-test-event"
                >
                  {testEventMut.isPending ? "Emitting…" : "+ Test event"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {dash?.recentEvents.length === 0 && (
                <p className="text-sm text-white/40 py-4 text-center">No events yet — emit one above</p>
              )}
              {dash?.recentEvents.slice(0, 8).map((ev: any) => (
                <div
                  key={ev.id}
                  className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0"
                  data-testid={`event-row-${ev.id}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="text-xs font-mono text-white/70 flex-1 truncate">{ev.eventType}</span>
                  <span className="text-xs text-white/30 shrink-0">{timeAgo(ev.createdAt)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Briefings */}
        {(dash?.recentBriefings.length ?? 0) > 0 && (
          <Card className="bg-[#12121a] border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-violet-400" /> Latest Briefings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dash?.recentBriefings.map((b: any) => (
                <div key={b.id} className="p-3 rounded-lg bg-white/5 border border-white/8">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{b.title}</span>
                    <Badge
                      variant="outline"
                      className={
                        b.priority === "urgent" || b.priority === "critical"
                          ? "text-red-400 border-red-400/30"
                          : "text-white/40 border-white/20"
                      }
                    >
                      {b.priority}
                    </Badge>
                  </div>
                  <p className="text-xs text-white/50 line-clamp-2">{b.body}</p>
                  <p className="text-xs text-white/30 mt-1">{timeAgo(b.createdAt)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Phase status */}
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-violet-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-violet-300 mb-1">
                Phase 1 Foundation — Active
              </p>
              <p className="text-xs text-white/50 leading-relaxed">
                Event bus, approval engine, memory system, and audit logger are operational.
                No agents are active yet. Phase 2 adds COO + CFO agents with daily briefings.
                All actions require your approval before execution — no automation is running.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
