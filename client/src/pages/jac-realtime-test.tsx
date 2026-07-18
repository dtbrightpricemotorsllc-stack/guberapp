/**
 * JAC Realtime Test Page — demonstrates all 5 required scenarios with metrics.
 * Route: /jac-realtime-test (protected, auth required)
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { JacRealtimeClient, type JacRealtimeStatus, type JacRealtimeMetrics } from "@/lib/jac-realtime";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, PhoneOff, Loader2, Zap, ChevronRight, CheckCircle2, Clock, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Scenario definitions ──────────────────────────────────────────────────────

const SCENARIOS = [
  {
    id: 1,
    label: "Rent due Friday",
    prompt: "My rent is due Friday and I need to make money.",
    description: "Financial urgency — immediate income need",
    expectedTools: ["search_opportunities"],
    expectedActions: ["Browse matching jobs", "Post availability listing"],
  },
  {
    id: 2,
    label: "Need grass cut today",
    prompt: "I need somebody to cut my grass today.",
    description: "Hire someone — immediate service need",
    expectedTools: ["search_marketplace", "navigate_to"],
    expectedActions: ["Find local lawn services", "Post job listing"],
  },
  {
    id: 3,
    label: "Remote car inspection",
    prompt: "I live far away and need someone to inspect a used car for me.",
    description: "Verify & Inspect feature awareness",
    expectedTools: ["get_platform_info", "navigate_to"],
    expectedActions: ["Explain V&I", "Navigate to verify-inspect"],
  },
  {
    id: 4,
    label: "Truck + free evenings",
    prompt: "I have a pickup truck and free time after 7 p.m.",
    description: "Opportunity matching — identify income options",
    expectedTools: ["search_opportunities"],
    expectedActions: ["Suggest hauling/delivery", "Help post availability"],
  },
  {
    id: 5,
    label: "Don't know what to offer",
    prompt: "I don't know what I can offer, but I need an opportunity.",
    description: "Discovery — help user identify usable assets",
    expectedTools: ["search_opportunities", "navigate_to"],
    expectedActions: ["Skills/assets discovery questions", "Suggest posting path"],
  },
];

// ── Session log entry ─────────────────────────────────────────────────────────

interface LogEntry {
  ts: number;
  role: "jac" | "user" | "system" | "tool";
  text: string;
}

interface ScenarioResult {
  scenarioId: number;
  startedAt: number;
  metrics: JacRealtimeMetrics | null;
  log: LogEntry[];
  toolsUsed: string[];
  status: JacRealtimeStatus;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function JacRealtimeTestPage() {
  const [activeScenario, setActiveScenario] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, ScenarioResult>>({});
  const [status, setStatus] = useState<JacRealtimeStatus>("idle");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [metrics, setMetrics] = useState<JacRealtimeMetrics | null>(null);
  const [muted, setMuted] = useState(false);
  const [toolsUsed, setToolsUsed] = useState<string[]>([]);
  const [, navigate] = useLocation();
  const clientRef = useRef<JacRealtimeClient | null>(null);
  const logRef = useRef<LogEntry[]>([]);
  const scenarioStartRef = useRef<number>(0);
  const promptInjectedRef = useRef(false);

  const addLog = useCallback((entry: LogEntry) => {
    logRef.current = [...logRef.current, entry];
    setLog([...logRef.current]);
  }, []);

  // ── Start a scenario ───────────────────────────────────────────────────────

  const startScenario = useCallback(async (scenarioId: number) => {
    const scenario = SCENARIOS.find(s => s.id === scenarioId)!;

    // Clean up previous session
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }

    setActiveScenario(scenarioId);
    setStatus("connecting");
    setLog([]);
    setMetrics(null);
    setToolsUsed([]);
    setMuted(false);
    logRef.current = [];
    promptInjectedRef.current = false;
    scenarioStartRef.current = Date.now();

    addLog({ ts: Date.now(), role: "system", text: `Starting scenario ${scenarioId}: "${scenario.prompt}"` });

    const client = new JacRealtimeClient();
    clientRef.current = client;

    client.on((event) => {
      switch (event.type) {
        case "status": {
          setStatus(event.payload.status);
          if (event.payload.status === "ready" && !promptInjectedRef.current) {
            promptInjectedRef.current = true;
            addLog({ ts: Date.now(), role: "system", text: "Connected. Injecting scenario prompt…" });
            setTimeout(() => {
              client.injectUserMessage(scenario.prompt);
              addLog({ ts: Date.now(), role: "user", text: scenario.prompt });
            }, 400);
          }
          break;
        }
        case "transcript_done":
          addLog({ ts: Date.now(), role: "jac", text: event.payload.text });
          break;
        case "user_transcript":
          if (event.payload.text && event.payload.text !== scenario.prompt) {
            addLog({ ts: Date.now(), role: "user", text: event.payload.text });
          }
          break;
        case "tool_call":
          addLog({ ts: Date.now(), role: "tool", text: `→ ${event.payload.name}(${JSON.stringify(event.payload.args)})` });
          setToolsUsed(prev => {
            const next = prev.includes(event.payload.name) ? prev : [...prev, event.payload.name];
            return next;
          });
          break;
        case "tool_result":
          addLog({ ts: Date.now(), role: "tool", text: `← ${event.payload.name} (${event.payload.durationMs}ms)` });
          break;
        case "navigate":
          addLog({ ts: Date.now(), role: "system", text: `Navigate → ${event.payload.route} (${event.payload.reason})` });
          break;
        case "metrics":
          setMetrics({ ...event.payload });
          break;
        case "error":
          addLog({ ts: Date.now(), role: "system", text: `Error: ${event.payload.message}` });
          break;
      }
    });

    await client.connect();
  }, [addLog]);

  // Save result when stopping
  const stopScenario = useCallback(() => {
    if (activeScenario && clientRef.current) {
      const current = clientRef.current.getMetrics();
      setResults(prev => ({
        ...prev,
        [activeScenario]: {
          scenarioId: activeScenario,
          startedAt: scenarioStartRef.current,
          metrics: current,
          log: [...logRef.current],
          toolsUsed,
          status,
        },
      }));
    }
    clientRef.current?.disconnect();
    clientRef.current = null;
    setActiveScenario(null);
    setStatus("idle");
    setLog([]);
    setToolsUsed([]);
  }, [activeScenario, toolsUsed, status]);

  useEffect(() => () => { clientRef.current?.disconnect(); }, []);

  const toggleMute = () => {
    if (!clientRef.current) return;
    const next = !muted;
    clientRef.current.setMuted(next);
    setMuted(next);
  };

  const isConnected = ["ready", "listening", "speaking", "tool_calling"].includes(status);
  const isLoading = status === "connecting";

  // ── Status colour ──────────────────────────────────────────────────────────
  const statusColor: Record<string, string> = {
    idle: "bg-zinc-700",
    connecting: "bg-zinc-600",
    ready: "bg-emerald-600",
    listening: "bg-blue-500",
    speaking: "bg-violet-600",
    tool_calling: "bg-amber-500",
    interrupted: "bg-orange-500",
    error: "bg-red-600",
    closed: "bg-zinc-700",
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-violet-500" />
            <span className="text-xs text-muted-foreground font-display tracking-widest uppercase">JAC Realtime</span>
          </div>
          <h1 className="text-2xl font-display font-black">Voice Assistant Test</h1>
          <p className="text-sm text-muted-foreground mt-1">
            OpenAI Realtime API · WebRTC · 5 Scenario Validation
          </p>
        </div>

        {/* Active session panel */}
        {activeScenario && (
          <div className="mb-6 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1 font-display tracking-wider uppercase">Active Scenario</p>
                <p className="font-semibold">{SCENARIOS.find(s => s.id === activeScenario)?.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 italic">
                  "{SCENARIOS.find(s => s.id === activeScenario)?.prompt}"
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={cn("w-2 h-2 rounded-full", statusColor[status], ["connecting","ready","listening","speaking","tool_calling"].includes(status) && "animate-pulse")} />
                <span className="text-xs font-medium capitalize">{status.replace("_", " ")}</span>
              </div>
            </div>

            {/* Live transcript */}
            <div className="rounded-xl bg-muted/40 border border-border min-h-[80px] max-h-48 overflow-y-auto p-3 mb-4 space-y-2">
              {log.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Waiting for connection…</p>
              )}
              {log.map((entry, i) => (
                <div key={i} className={cn("text-xs", entry.role === "jac" && "text-foreground", entry.role === "user" && "text-blue-400", entry.role === "tool" && "text-amber-400 font-mono", entry.role === "system" && "text-muted-foreground italic")}>
                  {entry.role === "jac" && <span className="font-semibold text-violet-400">JAC: </span>}
                  {entry.role === "user" && <span className="font-semibold">You: </span>}
                  {entry.text}
                </div>
              ))}
            </div>

            {/* Tools used */}
            {toolsUsed.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {toolsUsed.map(t => (
                  <Badge key={t} variant="outline" className="text-xs text-amber-400 border-amber-400/30 bg-amber-400/10">
                    <Zap className="w-3 h-3 mr-1" />{t.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            )}

            {/* Quick metrics */}
            {metrics && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                <Metric label="First audio" value={metrics.timeToFirstAudioMs != null ? `${metrics.timeToFirstAudioMs}ms` : "—"} />
                <Metric label="Interruptions" value={String(metrics.interruptionCount)} />
                <Metric label="Tool calls" value={`${metrics.toolCallCount}${metrics.toolCallCount > 0 ? ` (${Math.round(metrics.toolCallTotalMs / metrics.toolCallCount)}ms avg)` : ""}`} />
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-2">
              {isLoading && (
                <Button size="sm" variant="outline" disabled>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />Connecting
                </Button>
              )}
              {isConnected && (
                <>
                  <Button size="sm" variant="outline" onClick={toggleMute} data-testid="button-test-mute">
                    {muted ? <MicOff className="w-4 h-4 mr-1" /> : <Mic className="w-4 h-4 mr-1" />}
                    {muted ? "Unmute" : "Mute"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => clientRef.current?.injectUserMessage("Can I interrupt you?")}>
                    Test Interrupt
                  </Button>
                </>
              )}
              <Button size="sm" variant="destructive" onClick={stopScenario} data-testid="button-test-stop">
                <PhoneOff className="w-4 h-4 mr-1" />End
              </Button>
            </div>
          </div>
        )}

        {/* Scenario cards */}
        <div className="space-y-3 mb-8">
          <p className="text-xs text-muted-foreground font-display tracking-wider uppercase mb-2">Test Scenarios</p>
          {SCENARIOS.map(s => {
            const result = results[s.id];
            const isActive = activeScenario === s.id;
            return (
              <div
                key={s.id}
                className={cn(
                  "rounded-2xl border bg-card p-4 transition-all",
                  isActive && "border-violet-500/50 bg-violet-500/5",
                  !isActive && "border-border",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground">#{s.id}</span>
                      <span className="font-semibold text-sm">{s.label}</span>
                      {result && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground mb-1.5 italic">"{s.prompt}"</p>
                    <p className="text-xs text-muted-foreground">{s.description}</p>

                    {/* Expected tools */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {s.expectedTools.map(t => (
                        <span key={t} className={cn("text-[10px] px-1.5 py-0.5 rounded-md border font-mono",
                          result?.toolsUsed.includes(t)
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : "bg-muted/40 border-border text-muted-foreground")}>
                          {t}
                        </span>
                      ))}
                    </div>

                    {/* Result summary */}
                    {result && result.metrics && (
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {result.metrics.timeToFirstAudioMs != null ? `${result.metrics.timeToFirstAudioMs}ms` : "—"}
                        </span>
                        <span>{result.metrics.messageCount} msg</span>
                        <span>{result.metrics.interruptionCount} interrupt</span>
                        <span>{result.metrics.toolCallCount} tools</span>
                      </div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant={isActive ? "destructive" : "outline"}
                    disabled={isLoading || (!!activeScenario && !isActive)}
                    onClick={() => isActive ? stopScenario() : startScenario(s.id)}
                    data-testid={`button-scenario-${s.id}`}
                    className="shrink-0"
                  >
                    {isActive ? (
                      <><PhoneOff className="w-3 h-3 mr-1" />End</>
                    ) : isLoading && activeScenario === s.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <><Mic className="w-3 h-3 mr-1" />Start<ChevronRight className="w-3 h-3 ml-0.5" /></>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary table */}
        {Object.keys(results).length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="w-4 h-4 text-muted-foreground" />
              <p className="font-semibold text-sm">Results Summary</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4 font-medium">Scenario</th>
                    <th className="text-right py-2 pr-4 font-medium">First audio</th>
                    <th className="text-right py-2 pr-4 font-medium">Messages</th>
                    <th className="text-right py-2 pr-4 font-medium">Tools</th>
                    <th className="text-right py-2 font-medium">Interrupts</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(results).map(r => {
                    const s = SCENARIOS.find(sc => sc.id === r.scenarioId)!;
                    const m = r.metrics;
                    return (
                      <tr key={r.scenarioId} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-4 font-medium">{s.label}</td>
                        <td className="text-right py-2 pr-4 font-mono">
                          {m?.timeToFirstAudioMs != null ? `${m.timeToFirstAudioMs}ms` : "—"}
                        </td>
                        <td className="text-right py-2 pr-4 font-mono">{m?.messageCount ?? "—"}</td>
                        <td className="text-right py-2 pr-4 font-mono">
                          {m?.toolCallCount ?? "—"}
                          {m && m.toolCallCount > 0 && (
                            <span className="text-muted-foreground ml-1">({Math.round(m.toolCallTotalMs / m.toolCallCount)}ms)</span>
                          )}
                        </td>
                        <td className="text-right py-2 font-mono">{m?.interruptionCount ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Instructions */}
        {Object.keys(results).length === 0 && !activeScenario && (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
            <Mic className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">Ready to test</p>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
              Select any scenario above to open a live WebRTC session with JAC. The scenario prompt is injected automatically. You can also speak freely, interrupt JAC, and test all five scenarios in sequence.
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              Requires microphone permission · OpenAI Realtime API
            </p>
          </div>
        )}

        {/* Nav back */}
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate("/")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to app
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 border border-border p-2.5 text-center">
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-xs font-mono font-semibold">{value}</p>
    </div>
  );
}
