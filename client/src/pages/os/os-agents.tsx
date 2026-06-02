import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cpu, Circle, Clock, Play, Power, PowerOff, AlertCircle } from "lucide-react";

type OSAgent = {
  id: number;
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  scheduleCron: string | null;
  lastRunAt: string | null;
  createdAt: string;
};

type OSRun = {
  id: number;
  agentKey: string;
  trigger: string;
  status: string;
  summary: string | null;
  actionsProposed: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  completed: "text-emerald-400",
  running: "text-blue-400",
  failed: "text-red-400",
  skipped: "text-white/40",
};

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function OSAgents() {
  const [, nav] = useLocation();
  const { toast } = useToast();

  const { data: agents = [], isLoading: agentsLoading } = useQuery<OSAgent[]>({
    queryKey: ["/api/os/agents"],
  });

  const { data: runs = [] } = useQuery<OSRun[]>({
    queryKey: ["/api/os/runs"],
  });

  const toggleMut = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      apiRequest("PATCH", `/api/os/agents/${key}`, { enabled }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/os/agents"] });
      toast({ title: `Agent ${vars.enabled ? "enabled" : "disabled"}` });
    },
  });

  const recentRunsByAgent = (key: string) =>
    runs.filter((r) => r.agentKey === key).slice(0, 3);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="border-b border-white/10 bg-[#0d0d14]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-violet-400" />
          </div>
          <h1 className="text-lg font-semibold">GUBER OS</h1>
        </div>
        <div className="max-w-5xl mx-auto px-6 flex gap-1 pb-0">
          {[
            { label: "Dashboard", path: "/os/dashboard" },
            { label: "Approvals", path: "/os/approve" },
            { label: "Memory", path: "/os/memory" },
            { label: "Agents", path: "/os/agents", active: true },
            { label: "Audit Log", path: "/os/logs" },
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

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold">Agent Registry</h2>
          <p className="text-sm text-white/40 mt-0.5">
            {agents.length > 0
              ? `${agents.length} agent${agents.length === 1 ? "" : "s"} registered`
              : "No agents registered yet — Phase 2 adds COO + CFO"}
          </p>
        </div>

        {/* Phase 1 placeholder */}
        {agents.length === 0 && !agentsLoading && (
          <div className="rounded-xl border border-white/10 bg-[#12121a] p-8 text-center mb-8">
            <Cpu className="w-10 h-10 mx-auto mb-3 text-violet-400/40" />
            <p className="text-sm font-medium text-white/60 mb-1">
              Agent registry is empty — Phase 1 foundation only
            </p>
            <p className="text-xs text-white/30">
              Phase 2 registers: COO · CFO · CTO · Growth · Support
            </p>
          </div>
        )}

        {/* Agent cards */}
        {agents.map((agent) => (
          <Card
            key={agent.key}
            className="bg-[#12121a] border-white/10 mb-4"
            data-testid={`agent-card-${agent.key}`}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${
                    agent.enabled
                      ? "bg-violet-500/15 border-violet-500/25"
                      : "bg-white/5 border-white/10"
                  }`}>
                    <Cpu className={`w-4 h-4 ${agent.enabled ? "text-violet-400" : "text-white/30"}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{agent.label}</span>
                      <span className="text-xs font-mono text-white/30">{agent.key}</span>
                      {agent.enabled ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                          <Circle className="w-1.5 h-1.5 fill-emerald-400" /> active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-white/30">
                          <Circle className="w-1.5 h-1.5" /> disabled
                        </span>
                      )}
                    </div>
                    {agent.description && (
                      <p className="text-xs text-white/40 mt-0.5">{agent.description}</p>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-7 text-xs ${
                    agent.enabled
                      ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                      : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                  }`}
                  onClick={() => toggleMut.mutate({ key: agent.key, enabled: !agent.enabled })}
                  disabled={toggleMut.isPending}
                  data-testid={`btn-toggle-${agent.key}`}
                >
                  {agent.enabled ? (
                    <><PowerOff className="w-3 h-3 mr-1" /> Disable</>
                  ) : (
                    <><Power className="w-3 h-3 mr-1" /> Enable</>
                  )}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white/5 rounded-lg p-2.5">
                  <p className="text-xs text-white/30 mb-0.5">Schedule</p>
                  <p className="text-xs font-mono text-white/60">{agent.scheduleCron ?? "not set"}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5">
                  <p className="text-xs text-white/30 mb-0.5">Last Run</p>
                  <p className="text-xs text-white/60">{timeAgo(agent.lastRunAt)}</p>
                </div>
              </div>

              {/* Recent runs */}
              {recentRunsByAgent(agent.key).length > 0 && (
                <div>
                  <p className="text-xs text-white/30 mb-2">Recent runs</p>
                  <div className="space-y-1.5">
                    {recentRunsByAgent(agent.key).map((run) => (
                      <div
                        key={run.id}
                        className="flex items-center gap-2 text-xs"
                        data-testid={`run-row-${run.id}`}
                      >
                        <span className={`${STATUS_COLORS[run.status] ?? "text-white/40"} font-medium`}>
                          {run.status}
                        </span>
                        <span className="text-white/30">·</span>
                        <span className="text-white/50 truncate">{run.summary ?? run.trigger}</span>
                        <span className="text-white/25 shrink-0">{timeAgo(run.startedAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {/* Recent runs (all agents) */}
        {runs.length > 0 && (
          <Card className="bg-[#12121a] border-white/10 mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-violet-400" /> All Recent Runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0"
                >
                  <span className={`text-xs font-medium w-16 shrink-0 ${STATUS_COLORS[run.status] ?? "text-white/40"}`}>
                    {run.status}
                  </span>
                  <span className="text-xs font-mono text-white/40 w-16 shrink-0">{run.agentKey}</span>
                  <span className="text-xs text-white/50 flex-1 truncate">{run.summary ?? run.trigger}</span>
                  {run.error && (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" title={run.error} />
                  )}
                  <span className="text-xs text-white/30 shrink-0">{timeAgo(run.startedAt)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
