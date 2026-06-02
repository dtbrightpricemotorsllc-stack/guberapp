import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Cpu, RefreshCw, ChevronDown, ChevronRight,
  Circle, CheckCircle2, AlertTriangle, XCircle, HelpCircle,
  Zap, Activity, TrendingUp, Shield, Server,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type Status = "healthy" | "warning" | "critical" | "unknown";
interface ServiceItem {
  key: string;
  name: string;
  status: Status;
  value: string | number | null;
  detail: string;
  lastSuccess: string | null;
  lastFailure: string | null;
  failureReason: string | null;
  recommendedAction: string | null;
}
interface CommandCenterData {
  technical: ServiceItem[];
  operations: ServiceItem[];
  business: ServiceItem[];
  growth: ServiceItem[];
  admin: ServiceItem[];
  generatedAt: string;
}

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS = {
  healthy:  { dot: "bg-emerald-400",                       text: "text-emerald-400",  label: "Healthy",  Icon: CheckCircle2 },
  warning:  { dot: "bg-amber-400 animate-pulse",           text: "text-amber-400",    label: "Warning",  Icon: AlertTriangle },
  critical: { dot: "bg-red-400 animate-pulse",             text: "text-red-400",      label: "Critical", Icon: XCircle },
  unknown:  { dot: "bg-white/20",                          text: "text-white/30",     label: "Unknown",  Icon: HelpCircle },
};

function statusCounts(items: ServiceItem[]) {
  return items.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1;
    return acc;
  }, {} as Record<Status, number>);
}

function worstStatus(items: ServiceItem[]): Status {
  if (items.some(s => s.status === "critical")) return "critical";
  if (items.some(s => s.status === "warning")) return "warning";
  if (items.some(s => s.status === "unknown")) return "unknown";
  return "healthy";
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Row component ──────────────────────────────────────────────────────────────
function ServiceRow({ item }: { item: ServiceItem }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS[item.status];
  const hasDetail = !!(item.failureReason || item.recommendedAction || item.lastSuccess || item.lastFailure);

  return (
    <div data-testid={`cc-row-${item.key}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/3 transition-colors text-left"
        onClick={() => hasDetail && setExpanded(e => !e)}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
        <span className="text-sm font-medium text-white/80 flex-1 min-w-0">{item.name}</span>
        {item.value != null && (
          <span className={`text-sm font-semibold tabular-nums ${cfg.text} flex-shrink-0`}>
            {item.value}
          </span>
        )}
        <span className="text-xs text-white/30 w-28 text-right flex-shrink-0 hidden sm:block truncate">
          {item.detail}
        </span>
        <span className={`text-[10px] font-semibold ${cfg.text} w-14 text-right flex-shrink-0`}>
          {cfg.label}
        </span>
        {hasDetail ? (
          <span className="text-white/20 flex-shrink-0">
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </span>
        ) : <span className="w-3 flex-shrink-0" />}
      </button>

      {/* Mobile detail */}
      <p className="px-4 pb-1.5 text-xs text-white/25 block sm:hidden">{item.detail}</p>

      {/* Expanded detail */}
      {expanded && (
        <div className="mx-4 mb-2 rounded-lg bg-black/30 border border-white/8 px-4 py-3 text-xs space-y-1.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-white/30 mb-0.5">Last success</p>
              <p className="text-white/60">{timeAgo(item.lastSuccess)}</p>
            </div>
            <div>
              <p className="text-white/30 mb-0.5">Last failure</p>
              <p className="text-white/60">{timeAgo(item.lastFailure)}</p>
            </div>
          </div>
          {item.failureReason && (
            <div>
              <p className="text-white/30 mb-0.5">Failure reason</p>
              <p className="text-red-300/80 font-mono text-[11px]">{item.failureReason}</p>
            </div>
          )}
          {item.recommendedAction && (
            <div className="border-t border-white/8 pt-2 mt-1">
              <p className="text-amber-400/70 mb-0.5">⚡ Recommended action</p>
              <p className="text-white/60">{item.recommendedAction}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section component ──────────────────────────────────────────────────────────
const SECTION_ICONS: Record<string, React.ElementType> = {
  technical: Server, operations: Activity, business: TrendingUp, growth: Zap, admin: Shield,
};
const SECTION_LABELS: Record<string, string> = {
  technical: "TECHNICAL", operations: "OPERATIONS", business: "BUSINESS", growth: "GROWTH", admin: "ADMIN",
};

function Section({ id, items, defaultOpen = true }: { id: string; items: ServiceItem[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = SECTION_ICONS[id] ?? Server;
  const worst = worstStatus(items);
  const counts = statusCounts(items);
  const cfg = STATUS[worst];

  return (
    <div className="rounded-xl border border-white/10 bg-[#12121a] overflow-hidden mb-3" data-testid={`cc-section-${id}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5 text-white/50" />
        </div>
        <span className="text-sm font-semibold tracking-wide text-white/70 flex-1">{SECTION_LABELS[id]}</span>
        <div className="flex items-center gap-2 text-[10px]">
          {counts.healthy  ? <span className="text-emerald-400">{counts.healthy} healthy</span> : null}
          {counts.warning  ? <span className="text-amber-400">{counts.warning} warning</span> : null}
          {counts.critical ? <span className="text-red-400">{counts.critical} critical</span> : null}
          {counts.unknown  ? <span className="text-white/30">{counts.unknown} unknown</span> : null}
        </div>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
        {open ? <ChevronDown className="w-3.5 h-3.5 text-white/30 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-white/8">
          {/* Column headers */}
          <div className="grid px-4 py-1.5 border-b border-white/5 hidden sm:flex items-center gap-3">
            <span className="w-2 flex-shrink-0" />
            <span className="text-[10px] text-white/20 flex-1">Service</span>
            <span className="text-[10px] text-white/20 w-20 text-right flex-shrink-0">Value</span>
            <span className="text-[10px] text-white/20 w-28 text-right flex-shrink-0">Detail</span>
            <span className="text-[10px] text-white/20 w-14 text-right flex-shrink-0">Status</span>
            <span className="w-3 flex-shrink-0" />
          </div>
          {items.map(item => <ServiceRow key={item.key} item={item} />)}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function OSCommandCenter() {
  const [, nav] = useLocation();
  const [countdown, setCountdown] = useState(60);

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery<CommandCenterData>({
    queryKey: ["/api/os/command-center"],
    queryFn: async () => {
      const res = await fetch("/api/os/command-center", { credentials: "include" });
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Countdown to next auto-refresh
  useEffect(() => {
    setCountdown(60);
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [dataUpdatedAt]);

  const handleRefresh = useCallback(() => { refetch(); setCountdown(60); }, [refetch]);

  const overallWorst = data
    ? worstStatus([...(data.technical ?? []), ...(data.admin ?? [])])
    : "unknown";
  const overallCfg = STATUS[overallWorst];

  const nav_items = [
    { label: "Command Center", path: "/os/command-center", active: true },
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
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Top nav */}
      <div className="border-b border-white/10 bg-[#0d0d14]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-violet-400" />
          </div>
          <h1 className="text-lg font-semibold">GUBER OS</h1>
        </div>
        <div className="max-w-6xl mx-auto px-6 flex gap-1 pb-0 overflow-x-auto scrollbar-none">
          {nav_items.map(item => (
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

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Page header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <span className={`w-2.5 h-2.5 rounded-full ${overallCfg.dot}`} />
              <h2 className="text-xl font-semibold">GUBER Command Center</h2>
              <span className={`text-xs font-medium ${overallCfg.text}`}>{overallCfg.label}</span>
            </div>
            <p className="text-sm text-white/30">
              {data
                ? `Last updated ${timeAgo(data.generatedAt)} · next refresh in ${countdown}s`
                : "Loading all systems…"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="border-white/20 text-white/60 hover:text-white h-8 text-xs"
            data-testid="btn-cc-refresh"
          >
            <RefreshCw className={`w-3 h-3 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Refreshing…" : "Refresh now"}
          </Button>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {["TECHNICAL","OPERATIONS","BUSINESS","GROWTH","ADMIN"].map(s => (
              <div key={s} className="rounded-xl border border-white/10 bg-[#12121a] p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-white/5 animate-pulse" />
                  <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
                </div>
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-10 bg-white/3 rounded animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {data && !isLoading && (
          <div>
            <Section id="technical"  items={data.technical  ?? []} />
            <Section id="operations" items={data.operations ?? []} />
            <Section id="business"   items={data.business   ?? []} />
            <Section id="growth"     items={data.growth     ?? []} />
            <Section id="admin"      items={data.admin      ?? []} />
          </div>
        )}

        {/* Footer note */}
        <p className="text-center text-[10px] text-white/15 mt-6">
          GUBER OS Command Center · Phase 1 · Health checks run live on each refresh · In-memory history resets on server restart
        </p>
      </div>
    </div>
  );
}
