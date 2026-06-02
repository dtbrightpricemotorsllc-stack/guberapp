import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ShieldCheck, Cpu, Search, ChevronDown, ChevronRight } from "lucide-react";

type AuditEntry = {
  id: number;
  agentKey: string;
  actionId: number | null;
  eventType: string;
  description: string;
  beforeState: Record<string, any> | null;
  afterState: Record<string, any> | null;
  createdAt: string;
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  "os.boot": "text-violet-400",
  "action.auto_approved": "text-emerald-400",
  "action.queued_for_approval": "text-amber-400",
  "action.approved": "text-emerald-400",
  "action.rejected": "text-red-400",
  "action.executed": "text-blue-400",
  "action.failed": "text-red-500",
  "agent.toggled": "text-sky-400",
  "agent.run_completed": "text-emerald-400",
  "agent.run_failed": "text-red-400",
  "founder_memory.created": "text-violet-400",
  "founder_memory.updated": "text-violet-300",
  "founder_memory.deleted": "text-red-400",
  "system.test": "text-white/40",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function OSLogs() {
  const [, nav] = useLocation();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data: logs = [], isLoading } = useQuery<AuditEntry[]>({
    queryKey: ["/api/os/audit-log", offset],
    queryFn: async () => {
      const res = await fetch(`/api/os/audit-log?limit=${limit}&offset=${offset}`, {
        credentials: "include",
      });
      return res.json();
    },
  });

  const filtered = search
    ? logs.filter(
        (l) =>
          l.eventType.includes(search) ||
          l.description.toLowerCase().includes(search.toLowerCase()) ||
          l.agentKey.includes(search)
      )
    : logs;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="border-b border-white/10 bg-[#0d0d14]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-violet-400" />
          </div>
          <h1 className="text-lg font-semibold">GUBER OS</h1>
        </div>
        <div className="max-w-6xl mx-auto px-6 flex gap-1 pb-0">
          {[
            { label: "Command Center", path: "/os/command-center" },
            { label: "Dashboard", path: "/os/dashboard" },
            { label: "Approvals", path: "/os/approve" },
            { label: "Memory", path: "/os/memory" },
            { label: "Agents", path: "/os/agents" },
            { label: "Audit Log", path: "/os/logs", active: true },
            { label: "Events", path: "/os/events" },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => nav(item.path)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                item.active ? "border-violet-500 text-white" : "border-transparent text-white/50 hover:text-white/80"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" /> Audit Log
            </h2>
            <p className="text-sm text-white/40 mt-0.5">
              Immutable write-once record of every OS action and decision
            </p>
          </div>
          <div className="flex items-center gap-2 bg-[#12121a] border border-white/10 rounded-lg px-3 py-1.5 w-64">
            <Search className="w-3.5 h-3.5 text-white/30" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by event, agent, description…"
              className="border-0 bg-transparent text-sm text-white placeholder:text-white/30 p-0 h-auto focus-visible:ring-0"
              data-testid="input-log-search"
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#12121a] overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-white/10 bg-white/3">
            <div className="col-span-1 text-xs text-white/30 font-medium">#</div>
            <div className="col-span-3 text-xs text-white/30 font-medium">Event Type</div>
            <div className="col-span-5 text-xs text-white/30 font-medium">Description</div>
            <div className="col-span-2 text-xs text-white/30 font-medium">Agent</div>
            <div className="col-span-1 text-xs text-white/30 font-medium">Time</div>
          </div>

          {isLoading && (
            <div className="text-center py-12 text-white/40">Loading…</div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-16 text-white/30">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{search ? "No matching entries" : "No audit entries yet"}</p>
            </div>
          )}

          {filtered.map((entry, idx) => (
            <div key={entry.id} data-testid={`log-row-${entry.id}`}>
              <div
                className="grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors"
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              >
                <div className="col-span-1 text-xs text-white/25 font-mono">{entry.id}</div>
                <div className="col-span-3">
                  <span
                    className={`text-xs font-mono truncate block ${
                      EVENT_TYPE_COLORS[entry.eventType] ?? "text-white/50"
                    }`}
                  >
                    {entry.eventType}
                  </span>
                </div>
                <div className="col-span-5">
                  <p className="text-xs text-white/70 truncate">{entry.description}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-xs font-mono text-white/40">{entry.agentKey}</span>
                </div>
                <div className="col-span-1 flex items-center justify-between">
                  <span className="text-xs text-white/25">
                    {formatDate(entry.createdAt).split(",")[1]?.trim() ?? ""}
                  </span>
                  {(entry.beforeState || entry.afterState) && (
                    expandedId === entry.id
                      ? <ChevronDown className="w-3 h-3 text-white/30" />
                      : <ChevronRight className="w-3 h-3 text-white/30" />
                  )}
                </div>
              </div>

              {/* Expanded state diff */}
              {expandedId === entry.id && (
                <div className="px-4 py-3 bg-black/20 border-b border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-white/30">{formatDate(entry.createdAt)}</span>
                    {entry.actionId && (
                      <span className="text-xs text-white/25">· action #{entry.actionId}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {entry.beforeState && (
                      <div>
                        <p className="text-xs text-white/30 mb-1">Before</p>
                        <pre className="text-xs bg-red-500/5 border border-red-500/10 rounded p-2 text-red-300/70 overflow-auto max-h-24">
                          {JSON.stringify(entry.beforeState, null, 2)}
                        </pre>
                      </div>
                    )}
                    {entry.afterState && (
                      <div>
                        <p className="text-xs text-white/30 mb-1">After</p>
                        <pre className="text-xs bg-emerald-500/5 border border-emerald-500/10 rounded p-2 text-emerald-300/70 overflow-auto max-h-24">
                          {JSON.stringify(entry.afterState, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-white/30">
            {search ? `${filtered.length} matching` : `${offset + 1}–${offset + filtered.length} of many`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-white/15 text-white/50 h-7 text-xs"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              data-testid="btn-prev-page"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-white/15 text-white/50 h-7 text-xs"
              disabled={filtered.length < limit}
              onClick={() => setOffset(offset + limit)}
              data-testid="btn-next-page"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
