import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Radio, Cpu, Search, Zap, RefreshCw, Circle } from "lucide-react";

type OSEvent = {
  id: number;
  eventType: string;
  source: string;
  payload: Record<string, any> | null;
  processedBy: string[];
  createdAt: string;
};

const SOURCE_COLORS: Record<string, string> = {
  platform: "text-blue-400",
  system: "text-violet-400",
  agent: "text-emerald-400",
  admin: "text-amber-400",
};

const EVENT_TYPE_PREFIXES: Record<string, string> = {
  "system.": "text-violet-300",
  "user.": "text-blue-300",
  "job.": "text-emerald-300",
  "payment.": "text-amber-300",
  "dispute.": "text-red-300",
  "studio.": "text-pink-300",
  "agent.": "text-teal-300",
  "os.": "text-violet-400",
};

function getEventColor(eventType: string): string {
  for (const [prefix, color] of Object.entries(EVENT_TYPE_PREFIXES)) {
    if (eventType.startsWith(prefix)) return color;
  }
  return "text-white/60";
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
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

export default function OSEvents() {
  const [, nav] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const limit = 100;

  const { data: events = [], isLoading, refetch, isFetching } = useQuery<OSEvent[]>({
    queryKey: ["/api/os/events", offset],
    queryFn: async () => {
      const res = await fetch(`/api/os/events?limit=${limit}&offset=${offset}`, {
        credentials: "include",
      });
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const testMut = useMutation({
    mutationFn: (eventType: string) =>
      apiRequest("POST", "/api/os/events/test", {
        eventType,
        payload: { triggeredBy: "founder", timestamp: new Date().toISOString() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/os/events"] });
      toast({ title: "Event emitted" });
    },
  });

  const filtered = search
    ? events.filter(
        (e) =>
          e.eventType.toLowerCase().includes(search.toLowerCase()) ||
          e.source.toLowerCase().includes(search.toLowerCase())
      )
    : events;

  // Count by source for the summary strip
  const sourceCounts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.source] = (acc[e.source] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header + nav */}
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
            { label: "Daily Briefing",  path: "/os/briefing" },
            { label: "COO Agent",       path: "/os/coo" },
            { label: "Dashboard", path: "/os/dashboard" },
            { label: "Approvals", path: "/os/approve" },
            { label: "Memory", path: "/os/memory" },
            { label: "Agents", path: "/os/agents" },
            { label: "Audit Log", path: "/os/logs" },
            { label: "Events", path: "/os/events", active: true },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => nav(item.path)}
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

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Title row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Radio className="w-5 h-5 text-blue-400" /> Event Bus
            </h2>
            <p className="text-sm text-white/40 mt-0.5">
              Real-time platform events — auto-refreshes every 15 seconds
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 text-white/50 h-7 text-xs"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-events"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-blue-500/30 text-blue-400 h-7 text-xs"
              onClick={() => testMut.mutate("system.test")}
              disabled={testMut.isPending}
              data-testid="button-emit-test"
            >
              <Zap className="w-3 h-3 mr-1" />
              Emit test
            </Button>
          </div>
        </div>

        {/* Source summary strip */}
        {Object.keys(sourceCounts).length > 0 && (
          <div className="flex gap-3 mb-5">
            {Object.entries(sourceCounts).map(([source, count]) => (
              <div
                key={source}
                className="flex items-center gap-1.5 bg-[#12121a] border border-white/10 rounded-lg px-3 py-1.5"
              >
                <span
                  className={`text-xs font-medium ${SOURCE_COLORS[source] ?? "text-white/50"}`}
                >
                  {source}
                </span>
                <span className="text-xs text-white/30">{count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-2 bg-[#12121a] border border-white/10 rounded-lg px-3 py-1.5 mb-4 w-72">
          <Search className="w-3.5 h-3.5 text-white/30" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by event type or source…"
            className="border-0 bg-transparent text-sm text-white placeholder:text-white/30 p-0 h-auto focus-visible:ring-0"
            data-testid="input-event-search"
          />
        </div>

        {/* Events table */}
        <div className="rounded-xl border border-white/10 bg-[#12121a] overflow-hidden">
          <div className="grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-white/10 bg-white/3">
            <div className="col-span-1 text-xs text-white/30 font-medium">#</div>
            <div className="col-span-4 text-xs text-white/30 font-medium">Event Type</div>
            <div className="col-span-2 text-xs text-white/30 font-medium">Source</div>
            <div className="col-span-3 text-xs text-white/30 font-medium">Payload preview</div>
            <div className="col-span-2 text-xs text-white/30 font-medium">Time</div>
          </div>

          {isLoading && (
            <div className="text-center py-12 text-white/40 text-sm">Loading…</div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-16 text-white/30">
              <Radio className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{search ? "No matching events" : "No events yet"}</p>
              <p className="text-xs mt-1">Click "Emit test" to send a test event</p>
            </div>
          )}

          {filtered.map((event) => (
            <div key={event.id} data-testid={`event-row-${event.id}`}>
              <div
                className="grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors"
                onClick={() => setExpanded(expanded === event.id ? null : event.id)}
              >
                <div className="col-span-1 text-xs text-white/25 font-mono">{event.id}</div>
                <div className="col-span-4">
                  <span className={`text-xs font-mono truncate block ${getEventColor(event.eventType)}`}>
                    {event.eventType}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className={`text-xs ${SOURCE_COLORS[event.source] ?? "text-white/40"}`}>
                    {event.source}
                  </span>
                </div>
                <div className="col-span-3">
                  <span className="text-xs text-white/30 truncate block font-mono">
                    {event.payload
                      ? JSON.stringify(event.payload).slice(0, 50) + (JSON.stringify(event.payload).length > 50 ? "…" : "")
                      : "—"}
                  </span>
                </div>
                <div className="col-span-2 text-xs text-white/30">
                  {timeAgo(event.createdAt)}
                </div>
              </div>

              {/* Expanded payload */}
              {expanded === event.id && (
                <div className="px-4 py-3 bg-black/20 border-b border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-white/30">{formatDate(event.createdAt)}</span>
                    {event.processedBy?.length > 0 && (
                      <span className="text-xs text-white/25">
                        · processed by: {event.processedBy.join(", ")}
                      </span>
                    )}
                  </div>
                  <pre className="text-xs bg-black/30 border border-white/10 rounded p-3 text-white/60 overflow-auto max-h-32">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-white/30">
            {search ? `${filtered.length} matching` : `Showing ${filtered.length} events`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-white/15 text-white/50 h-7 text-xs"
              disabled={offset === 0}
              onClick={() => { setOffset(Math.max(0, offset - limit)); setExpanded(null); }}
              data-testid="btn-events-prev"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-white/15 text-white/50 h-7 text-xs"
              disabled={events.length < limit}
              onClick={() => { setOffset(offset + limit); setExpanded(null); }}
              data-testid="btn-events-next"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
