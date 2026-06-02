import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { RefreshCw, Cpu, AlertTriangle, XCircle, CheckCircle2, HelpCircle, TrendingUp } from "lucide-react";

// ── Types (mirror CommandCenterData shape) ─────────────────────────────────────
type Status = "healthy" | "warning" | "critical" | "unknown";
interface Item {
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
interface CCData {
  technical: Item[];
  operations: Item[];
  business: Item[];
  growth: Item[];
  admin: Item[];
  generatedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function find(items: Item[], key: string): Item | undefined {
  return items.find(i => i.key === key);
}

function num(item: Item | undefined): number {
  if (!item) return 0;
  const v = item.value;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[$,]/g, ""));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

const STATUS_CFG = {
  healthy:  { dot: "bg-emerald-400",        text: "text-emerald-400", Icon: CheckCircle2 },
  warning:  { dot: "bg-amber-400",           text: "text-amber-400",   Icon: AlertTriangle },
  critical: { dot: "bg-red-400 animate-pulse", text: "text-red-400",  Icon: XCircle },
  unknown:  { dot: "bg-white/20",            text: "text-white/30",    Icon: HelpCircle },
};

// ── Attention-item generation ─────────────────────────────────────────────────
interface Attention {
  rank: number;
  category: string;
  name: string;
  status: Status;
  value: string | number | null;
  why: string;
  action: string | null;
}

function buildTop5(data: CCData): Attention[] {
  const pool: Array<{ score: number; a: Omit<Attention, "rank"> }> = [];

  const push = (score: number, a: Omit<Attention, "rank">) => pool.push({ score, a });

  // ── Critical technical services ────────────────────────────────────────
  for (const t of data.technical) {
    if (t.status === "critical") {
      push(95, {
        category: "Technical", name: t.name, status: "critical", value: t.value,
        why: t.failureReason
          ? `${t.name} is down: ${t.failureReason}`
          : `${t.name} failed its health check.`,
        action: t.recommendedAction,
      });
    }
  }

  // ── Open disputes ──────────────────────────────────────────────────────
  const disputes = find(data.admin, "disputes");
  const disputeCount = num(disputes);
  if (disputeCount > 0) {
    push(92, {
      category: "Admin", name: "Open Disputes", status: disputes!.status,
      value: disputes!.value,
      why: `${disputeCount} dispute${disputeCount > 1 ? "s" : ""} open. Each unresolved dispute erodes trust and can escalate to chargebacks.`,
      action: disputes!.recommendedAction,
    });
  }

  // ── Pending approvals ──────────────────────────────────────────────────
  const approvals = find(data.admin, "pending_approvals");
  const approvalCount = num(approvals);
  if (approvalCount > 0) {
    push(88, {
      category: "Admin", name: "Pending Approvals", status: approvals!.status,
      value: approvals!.value,
      why: `${approvalCount} OS action${approvalCount > 1 ? "s" : ""} waiting for founder approval. Platform changes are blocked until reviewed.`,
      action: approvals!.recommendedAction,
    });
  }

  // ── Flagged users ──────────────────────────────────────────────────────
  const flagged = find(data.admin, "flagged_users");
  const flaggedCount = num(flagged);
  if (flaggedCount > 5) {
    push(65, {
      category: "Admin", name: "Flagged Users", status: flagged!.status,
      value: flagged!.value,
      why: `${flaggedCount} users have active strikes. Elevated risk users left unchecked increase dispute probability.`,
      action: "Review Safety Queue.",
    });
  }

  // ── Warning technical services ─────────────────────────────────────────
  for (const t of data.technical) {
    if (t.status === "warning") {
      push(70, {
        category: "Technical", name: t.name, status: "warning", value: t.value,
        why: t.failureReason ? `${t.name} is degraded: ${t.failureReason}` : `${t.name} health check returned warning.`,
        action: t.recommendedAction,
      });
    }
  }

  // ── Failed payments ────────────────────────────────────────────────────
  const failedPay = find(data.admin, "failed_payments");
  const failedPayCount = num(failedPay);
  if (failedPayCount > 0) {
    push(80, {
      category: "Admin", name: "Failed Payments", status: failedPay!.status,
      value: failedPay!.value,
      why: `${failedPayCount} failed payment${failedPayCount > 1 ? "s" : ""} in the last 7 days. Every failed payment is lost revenue and a frustrated user.`,
      action: "Review in Stripe dashboard.",
    });
  }

  // ── Failed notifications ───────────────────────────────────────────────
  const failedNotif = find(data.admin, "failed_notifications");
  const failedNotifCount = num(failedNotif);
  if (failedNotifCount > 10) {
    push(60, {
      category: "Technical", name: "Failed Notifications", status: failedNotif!.status,
      value: failedNotif!.value,
      why: `${failedNotifCount} push notification failures today. Users not getting notified about jobs miss opportunities and disengage.`,
      action: failedNotif!.recommendedAction,
    });
  }

  // ── Revenue / business signals (pad to 5 when everything is healthy) ──
  const revenueToday = find(data.business, "revenue_today");
  const revenueMonth = find(data.business, "revenue_month");
  const newUsers = find(data.growth, "new_users");
  const retention = find(data.growth, "retention");
  const jobs = find(data.operations, "jobs");
  const studio = find(data.operations, "studio");

  push(30, {
    category: "Business", name: "Revenue Today", status: "healthy",
    value: revenueToday?.value ?? null,
    why: `Today's GMV is ${revenueToday?.value ?? "—"}. Month-to-date: ${revenueMonth?.value ?? "—"}. ${revenueToday?.detail ?? ""}`,
    action: null,
  });

  push(25, {
    category: "Growth", name: "New Users", status: "healthy",
    value: newUsers?.value ?? null,
    why: newUsers?.detail ?? "User growth signal.",
    action: null,
  });

  if (jobs) {
    push(20, {
      category: "Operations", name: "Jobs", status: jobs.status,
      value: jobs.value,
      why: jobs.detail,
      action: jobs.recommendedAction,
    });
  }

  if (retention) {
    push(15, {
      category: "Growth", name: "User Engagement", status: "healthy",
      value: retention.value,
      why: retention.detail,
      action: null,
    });
  }

  if (studio) {
    push(12, {
      category: "Operations", name: "GUBER Studio", status: studio.status,
      value: studio.value,
      why: studio.detail,
      action: studio.recommendedAction,
    });
  }

  // Sort descending, dedupe by name, take 5
  const seen = new Set<string>();
  const sorted = pool
    .sort((a, b) => b.score - a.score)
    .filter(p => { if (seen.has(p.a.name)) return false; seen.add(p.a.name); return true; })
    .slice(0, 5);

  return sorted.map((p, i) => ({ rank: i + 1, ...p.a }));
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetricRow({ item }: { item: Item }) {
  const cfg = STATUS_CFG[item.status];
  return (
    <div className="flex items-start justify-between py-2 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${cfg.dot}`} />
        <div className="min-w-0">
          <p className="text-sm text-white/70">{item.name}</p>
          <p className="text-xs text-white/25 truncate mt-0.5">{item.detail}</p>
        </div>
      </div>
      <span className={`text-sm font-semibold tabular-nums flex-shrink-0 ml-4 ${cfg.text}`}>
        {item.value ?? "—"}
      </span>
    </div>
  );
}

function Section({ title, items }: { title: string; items: Item[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#12121a] p-5">
      <h3 className="text-xs font-semibold tracking-widest text-white/30 mb-3 uppercase">{title}</h3>
      {items.length === 0
        ? <p className="text-xs text-white/20">No data</p>
        : items.map(item => <MetricRow key={item.key} item={item} />)
      }
    </div>
  );
}

function TechSummary({ items }: { items: Item[] }) {
  const critical = items.filter(i => i.status === "critical");
  const warning = items.filter(i => i.status === "warning");
  const healthy = items.filter(i => i.status === "healthy");
  const unknown = items.filter(i => i.status === "unknown");

  return (
    <div className="rounded-xl border border-white/10 bg-[#12121a] p-5">
      <h3 className="text-xs font-semibold tracking-widest text-white/30 mb-3 uppercase">Technical</h3>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {healthy.length > 0 && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-400/10 text-emerald-400 text-xs font-medium">
            <CheckCircle2 className="w-3 h-3" /> {healthy.length} healthy
          </span>
        )}
        {warning.length > 0 && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400/10 text-amber-400 text-xs font-medium">
            <AlertTriangle className="w-3 h-3" /> {warning.length} warning
          </span>
        )}
        {critical.length > 0 && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-400/10 text-red-400 text-xs font-medium">
            <XCircle className="w-3 h-3" /> {critical.length} critical
          </span>
        )}
        {unknown.length > 0 && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 text-white/30 text-xs font-medium">
            <HelpCircle className="w-3 h-3" /> {unknown.length} unknown
          </span>
        )}
      </div>

      {/* Only show non-healthy items (critical + warning) */}
      {[...critical, ...warning].length === 0
        ? <p className="text-xs text-emerald-400/60">All {items.length} services healthy — no issues to report.</p>
        : [...critical, ...warning].map(item => <MetricRow key={item.key} item={item} />)
      }
    </div>
  );
}

function AttentionCard({ a }: { a: Attention }) {
  const cfg = STATUS_CFG[a.status];
  return (
    <div className={`rounded-xl border p-5 ${
      a.status === "critical" ? "border-red-500/30 bg-red-500/5"
      : a.status === "warning" ? "border-amber-500/30 bg-amber-500/5"
      : "border-white/10 bg-[#12121a]"
    }`}>
      <div className="flex items-start gap-4">
        {/* Rank */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
          a.rank === 1 ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
          : "bg-white/5 text-white/30 border border-white/10"
        }`}>
          {a.rank}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-semibold tracking-wider text-white/30 uppercase">{a.category}</span>
            <span className={`flex items-center gap-1 text-[10px] font-semibold ${cfg.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {a.status}
            </span>
          </div>
          <p className="text-sm font-semibold text-white/90 mb-1">{a.name}
            {a.value != null && (
              <span className={`ml-2 text-sm ${cfg.text}`}>{a.value}</span>
            )}
          </p>
          <p className="text-sm text-white/50 leading-relaxed">{a.why}</p>
          {a.action && (
            <p className="mt-2 text-xs text-amber-400/70">⚡ {a.action}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── OS nav shared ──────────────────────────────────────────────────────────────
const NAV = [
  { label: "Command Center", path: "/os/command-center" },
  { label: "Daily Briefing",  path: "/os/briefing", active: true },
  { label: "COO Agent",       path: "/os/coo" },
  { label: "Dashboard",       path: "/os/dashboard" },
  { label: "Approvals",       path: "/os/approve" },
  { label: "Memory",          path: "/os/memory" },
  { label: "Agents",          path: "/os/agents" },
  { label: "Audit Log",       path: "/os/logs" },
  { label: "Events",          path: "/os/events" },
];

// ── Page ───────────────────────────────────────────────────────────────────────
export default function OSBriefing() {
  const [, nav] = useLocation();

  const { data, isLoading, isFetching, refetch } = useQuery<CCData>({
    queryKey: ["/api/os/command-center"],
    queryFn: async () => {
      const r = await fetch("/api/os/command-center", { credentials: "include" });
      return r.json();
    },
    staleTime: 5 * 60_000, // 5 min — briefing, not real-time
  });

  const top5 = data ? buildTop5(data) : [];
  const opsBusiness = data ? [
    find(data.operations, "users"),
    find(data.operations, "jobs"),
    find(data.operations, "marketplace"),
    find(data.operations, "vi"),
    find(data.operations, "load_board"),
    find(data.operations, "ai_or_not"),
    find(data.operations, "studio"),
  ].filter(Boolean) as Item[] : [];

  const bizItems = data ? [
    find(data.business, "revenue_today"),
    find(data.business, "revenue_month"),
    find(data.business, "refunds"),
    find(data.business, "stripe_fees"),
    find(data.business, "og_count"),
  ].filter(Boolean) as Item[] : [];

  const adminItems = data ? [
    find(data.admin, "disputes"),
    find(data.admin, "pending_approvals"),
    find(data.admin, "flagged_users"),
    find(data.admin, "failed_payments"),
    find(data.admin, "failed_notifications"),
  ].filter(Boolean) as Item[] : [];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Top nav */}
      <div className="border-b border-white/10 bg-[#0d0d14]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-violet-400" />
          </div>
          <h1 className="text-lg font-semibold">GUBER OS</h1>
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
            <p className="text-xs font-semibold tracking-widest text-white/30 uppercase mb-1">Founder Daily Briefing</p>
            <h2 className="text-2xl font-semibold text-white">
              {data ? formatDate(data.generatedAt) : "Loading…"}
            </h2>
            <p className="text-sm text-white/30 mt-1">GUBER — U.S. Operations</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-white/20 text-white/50 hover:text-white h-8 text-xs"
            data-testid="btn-briefing-refresh"
          >
            <RefreshCw className={`w-3 h-3 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {isLoading && (
          <div className="space-y-4">
            {["Operations", "Business", "Technical", "Admin"].map(s => (
              <div key={s} className="rounded-xl border border-white/10 bg-[#12121a] p-5">
                <div className="h-3 w-20 bg-white/5 rounded animate-pulse mb-4" />
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-8 bg-white/3 rounded animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {data && (
          <>
            {/* 2-column grid for 4 sections */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <Section title="Operations" items={opsBusiness} />
              <Section title="Business" items={bizItems} />
              <TechSummary items={data.technical} />
              <Section title="Admin" items={adminItems} />
            </div>

            {/* Top 5 */}
            <div className="mt-2">
              <div className="flex items-center gap-3 mb-4">
                <TrendingUp className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-semibold tracking-wide text-white/80 uppercase">
                  Top 5 things to pay attention to today
                </h3>
                <span className="text-xs text-white/25">ranked by impact</span>
              </div>
              <div className="space-y-3">
                {top5.map(a => <AttentionCard key={a.rank} a={a} />)}
                {top5.length === 0 && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-emerald-400">All clear</p>
                    <p className="text-xs text-white/30 mt-1">No critical or warning signals detected. Check back tomorrow.</p>
                  </div>
                )}
              </div>
            </div>

            <p className="text-center text-[10px] text-white/15 mt-10">
              GUBER OS · Founder Daily Briefing · Data as of {data ? formatDate(data.generatedAt) : "—"} · Refreshes on demand
            </p>
          </>
        )}
      </div>
    </div>
  );
}
