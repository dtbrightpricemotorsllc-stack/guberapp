import { useState, useCallback } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, XCircle, AlertCircle, Loader2, Play, RefreshCw,
  User, Wrench, ShieldCheck, Truck, ShoppingBag, CreditCard,
  MapPin, Bell, Bot, FileText, ChevronDown, ChevronRight, Satellite,
} from "lucide-react";

type MCStep = {
  id: string; label: string; ok: boolean; detail: string;
  data?: Record<string, any>; durationMs: number;
};
type MCRunResult = { flow: string; ok: boolean; ranAt: string; steps: MCStep[] };
type MCPersonas = {
  requester: { id: number; email: string; username: string; idVerified: boolean } | null;
  worker: { id: number; email: string; username: string; idVerified: boolean } | null;
};
type MCReport = {
  generatedAt: string; allRun: boolean; launchReady: boolean;
  flows: { flow: string; status: "pass" | "fail" | "partial" | "not_run"; ranAt: string | null; passCount: number; failCount: number; totalSteps?: number }[];
};

const FLOWS = [
  { id: "vi",            label: "Verify & Inspect",  icon: ShieldCheck, color: "text-cyan-600" },
  { id: "job",           label: "General Jobs",       icon: Wrench,      color: "text-blue-600" },
  { id: "load-board",    label: "Load Board",         icon: Truck,       color: "text-orange-600" },
  { id: "marketplace",   label: "Marketplace",        icon: ShoppingBag, color: "text-purple-600" },
  { id: "payments",      label: "Payments / Stripe",  icon: CreditCard,  color: "text-green-600" },
  { id: "gps",           label: "GPS / Location",     icon: MapPin,      color: "text-red-600" },
  { id: "notifications", label: "Notifications",      icon: Bell,        color: "text-yellow-600" },
  { id: "jac",           label: "JAC / AI",           icon: Bot,         color: "text-pink-600" },
] as const;

function StatusIcon({ ok, size = "h-4 w-4" }: { ok: boolean; size?: string }) {
  return ok
    ? <CheckCircle2 className={`${size} text-green-500 flex-shrink-0`} />
    : <XCircle className={`${size} text-red-500 flex-shrink-0`} />;
}

function FlowStatusBadge({ status }: { status: "pass" | "fail" | "partial" | "not_run" | "running" }) {
  const map = {
    pass:     { cls: "bg-green-100 text-green-800 border-green-200",  label: "PASS" },
    fail:     { cls: "bg-red-100 text-red-800 border-red-200",        label: "FAIL" },
    partial:  { cls: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "PARTIAL" },
    not_run:  { cls: "bg-gray-100 text-gray-500 border-gray-200",     label: "NOT RUN" },
    running:  { cls: "bg-blue-100 text-blue-800 border-blue-200",     label: "RUNNING…" },
  };
  const { cls, label } = map[status];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

function StepRow({ step }: { step: MCStep }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg border ${step.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"} text-sm`}>
      <button
        className="flex w-full items-center gap-3 px-3 py-2 text-left"
        onClick={() => setOpen(v => !v)}
        data-testid={`step-row-${step.id}`}
      >
        <StatusIcon ok={step.ok} />
        <span className={`flex-1 font-medium ${step.ok ? "text-green-900" : "text-red-900"}`}>{step.label}</span>
        <span className="text-[11px] text-muted-foreground">{step.durationMs}ms</span>
        {step.data && (open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />)}
      </button>
      {!step.ok && (
        <div className="border-t border-red-200 px-3 py-2 text-xs text-red-700 font-mono break-all">{step.detail}</div>
      )}
      {open && step.data && (
        <div className="border-t border-green-200 px-3 py-2 font-mono text-[11px] text-green-800 whitespace-pre-wrap break-all">
          {JSON.stringify(step.data, null, 2)}
        </div>
      )}
    </div>
  );
}

function FlowCard({
  flow, result, running, onRun, onSelect, selected,
}: {
  flow: typeof FLOWS[number];
  result?: MCRunResult;
  running: boolean;
  onRun: () => void;
  onSelect: () => void;
  selected: boolean;
}) {
  const Icon = flow.icon;
  const status = running ? "running" : result ? (result.ok ? "pass" : result.steps.some(s => s.ok) ? "partial" : "fail") : "not_run";

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${selected ? "ring-2 ring-blue-500" : ""}`}
      onClick={onSelect}
      data-testid={`flow-card-${flow.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${flow.color}`} />
            <span className="font-semibold text-sm">{flow.label}</span>
          </div>
          <FlowStatusBadge status={status} />
        </div>
        {result && (
          <div className="text-[11px] text-muted-foreground mb-2">
            {result.steps.filter(s => s.ok).length}/{result.steps.length} steps passed · {new Date(result.ranAt).toLocaleTimeString()}
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          className="w-full h-7 text-xs"
          onClick={(e) => { e.stopPropagation(); onRun(); }}
          disabled={running}
          data-testid={`button-run-${flow.id}`}
        >
          {running ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
          {running ? "Running…" : "Run"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AdminMissionControl() {
  const { toast } = useToast();
  const [results, setResults] = useState<Record<string, MCRunResult>>({});
  const [runningFlow, setRunningFlow] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState<MCReport | null>(null);

  const { data: personas, refetch: refetchPersonas } = useQuery<MCPersonas>({
    queryKey: ["/api/admin/mc/personas"],
  });

  const provisionMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/mc/personas/provision"),
    onSuccess: () => {
      refetchPersonas();
      toast({ title: "Personas provisioned", description: "mc_requester and mc_worker are ready." });
    },
    onError: (e: any) => toast({ title: "Provision failed", description: e.message, variant: "destructive" }),
  });

  const runFlow = useCallback(async (flowId: string) => {
    setRunningFlow(flowId);
    setSelectedFlow(flowId);
    try {
      const res = await apiRequest("POST", `/api/admin/mc/run/${flowId}`);
      const data = await res.json();
      setResults(prev => ({ ...prev, [flowId]: data }));
      if (!data.ok) toast({ title: `${flowId} — FAILED`, description: `${data.steps.filter((s: MCStep) => !s.ok).length} step(s) failed`, variant: "destructive" });
    } catch (e: any) {
      toast({ title: `${flowId} error`, description: e.message, variant: "destructive" });
    } finally {
      setRunningFlow(null);
    }
  }, [toast]);

  const runAllFlows = useCallback(async () => {
    setRunningAll(true);
    setShowReport(false);
    for (const flow of FLOWS) {
      await runFlow(flow.id);
    }
    try {
      const res = await fetch("/api/admin/mc/report", { credentials: "include" });
      const rpt = await res.json();
      setReport(rpt);
      setShowReport(true);
    } catch {}
    setRunningAll(false);
  }, [runFlow]);

  const generateReport = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/mc/report", { credentials: "include" });
      const rpt = await res.json();
      setReport(rpt);
      setShowReport(true);
    } catch (e: any) {
      toast({ title: "Report error", description: e.message, variant: "destructive" });
    }
  }, [toast]);

  const selectedResult = selectedFlow ? results[selectedFlow] : null;
  const selectedFlowMeta = FLOWS.find(f => f.id === selectedFlow);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Satellite className="h-6 w-6 text-cyan-400" />
            <div>
              <h1 className="text-lg font-display font-bold tracking-wider text-white">GUBER MISSION CONTROL</h1>
              <p className="text-xs text-gray-400">End-to-end flow validation — Admin only</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/qa">
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white text-xs">← Admin QA</Button>
            </Link>
            <Button
              size="sm"
              onClick={runAllFlows}
              disabled={runningAll || !personas?.requester || !personas?.worker}
              className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
              data-testid="button-run-all"
            >
              {runningAll ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
              {runningAll ? "Running All…" : "Run All Flows"}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Personas */}
        <Card className="bg-gray-900 border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-200 flex items-center gap-2">
              <User className="h-4 w-4 text-cyan-400" /> Test Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <PersonaCard
                label="Requester"
                persona={personas?.requester}
                color="text-blue-400"
              />
              <PersonaCard
                label="Worker"
                persona={personas?.worker}
                color="text-green-400"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => provisionMutation.mutate()}
                disabled={provisionMutation.isPending}
                className="border-gray-600 text-gray-300 hover:bg-gray-800 text-xs ml-auto"
                data-testid="button-provision"
              >
                {provisionMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                {personas?.requester && personas?.worker ? "Accounts Ready ✓" : "Provision Accounts"}
              </Button>
            </div>
            {(!personas?.requester || !personas?.worker) && (
              <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Provision test accounts before running flows.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Flow Grid */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Flows</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {FLOWS.map(flow => (
              <FlowCard
                key={flow.id}
                flow={flow}
                result={results[flow.id]}
                running={runningFlow === flow.id}
                onRun={() => runFlow(flow.id)}
                onSelect={() => setSelectedFlow(flow.id)}
                selected={selectedFlow === flow.id}
              />
            ))}
          </div>
        </div>

        {/* Step Log */}
        {selectedFlow && (
          <Card className="bg-gray-900 border-gray-700">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                  {selectedFlowMeta && <selectedFlowMeta.icon className={`h-4 w-4 ${selectedFlowMeta.color}`} />}
                  {selectedFlowMeta?.label} — Step Log
                  {runningFlow === selectedFlow && <Loader2 className="h-3 w-3 animate-spin text-blue-400" />}
                </CardTitle>
                {selectedResult && (
                  <div className="flex items-center gap-2">
                    <FlowStatusBadge status={selectedResult.ok ? "pass" : selectedResult.steps.some(s => s.ok) ? "partial" : "fail"} />
                    <span className="text-[11px] text-gray-500">{new Date(selectedResult.ranAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!selectedResult && runningFlow !== selectedFlow && (
                <div className="text-sm text-gray-500 text-center py-8">
                  Click <strong>Run</strong> to execute this flow.
                </div>
              )}
              {runningFlow === selectedFlow && !selectedResult && (
                <div className="flex items-center gap-2 text-sm text-blue-400 py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Running simulation…
                </div>
              )}
              {selectedResult && (
                <div className="space-y-2">
                  {selectedResult.steps.map(step => <StepRow key={step.id} step={step} />)}
                  <div className={`text-xs font-semibold mt-3 flex items-center gap-2 ${selectedResult.ok ? "text-green-400" : "text-red-400"}`}>
                    <StatusIcon ok={selectedResult.ok} />
                    {selectedResult.ok
                      ? `All ${selectedResult.steps.length} steps passed`
                      : `${selectedResult.steps.filter(s => !s.ok).length} of ${selectedResult.steps.length} steps failed`}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Report */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={generateReport}
            className="border-gray-600 text-gray-300 hover:bg-gray-800 text-xs"
            data-testid="button-generate-report"
          >
            <FileText className="h-3 w-3 mr-1" /> Generate Launch Readiness Report
          </Button>
        </div>

        {showReport && report && (
          <Card className="bg-gray-900 border-gray-700">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-cyan-400" /> Launch Readiness Report
                </CardTitle>
                <div className="flex items-center gap-2">
                  {report.launchReady
                    ? <Badge className="bg-green-600 text-white text-xs">✅ LAUNCH READY</Badge>
                    : <Badge className="bg-red-600 text-white text-xs">🚫 NOT READY</Badge>}
                  <span className="text-[11px] text-gray-500">{new Date(report.generatedAt).toLocaleString()}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {report.flows.map(f => {
                  const meta = FLOWS.find(fl => fl.id === f.flow);
                  const Icon = meta?.icon ?? ShieldCheck;
                  return (
                    <div
                      key={f.flow}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${
                        f.status === "pass" ? "border-green-800 bg-green-950/40"
                        : f.status === "fail" ? "border-red-800 bg-red-950/40"
                        : f.status === "partial" ? "border-yellow-800 bg-yellow-950/40"
                        : "border-gray-700 bg-gray-800/40"
                      }`}
                      data-testid={`report-row-${f.flow}`}
                    >
                      <Icon className={`h-4 w-4 flex-shrink-0 ${meta?.color ?? "text-gray-400"}`} />
                      <span className="text-sm font-medium flex-1 text-gray-200">{meta?.label ?? f.flow}</span>
                      {f.status !== "not_run" && (
                        <span className="text-xs text-gray-400">{f.passCount}/{f.totalSteps} steps</span>
                      )}
                      <FlowStatusBadge status={f.status} />
                    </div>
                  );
                })}
              </div>
              {!report.allRun && (
                <p className="text-xs text-yellow-400 mt-3 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Some flows have not been run yet. Click "Run All Flows" for a complete report.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function PersonaCard({
  label, persona, color,
}: {
  label: string;
  persona: { id: number; email: string; idVerified: boolean } | null | undefined;
  color: string;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${persona ? "border-gray-600 bg-gray-800" : "border-dashed border-gray-700 bg-gray-800/40"}`}>
      <User className={`h-3.5 w-3.5 ${persona ? color : "text-gray-600"}`} />
      <div>
        <div className={`font-semibold ${persona ? color : "text-gray-600"}`}>{label}</div>
        {persona
          ? <div className="text-gray-400">{persona.email} <span className="text-green-500">#{persona.id}</span></div>
          : <div className="text-gray-600">Not provisioned</div>}
      </div>
      {persona?.idVerified && <CheckCircle2 className="h-3 w-3 text-green-500 ml-1" />}
    </div>
  );
}
