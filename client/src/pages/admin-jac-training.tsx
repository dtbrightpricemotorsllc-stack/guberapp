import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Download, RefreshCw, MessageSquare, Zap, Clock, TrendingUp, Eye, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Conversation {
  id: number;
  conversationId: string;
  userId: number | null;
  platform: string;
  durationSecs: number | null;
  turnCount: number;
  transcript: Array<{ role: string; message: string; time_in_call_secs?: number }>;
  toolCallsMade: string[];
  navigatedTo: string | null;
  userTookAction: boolean;
  autoScore: number | null;
  autoScoreReason: string | null;
  piiScrubbed: boolean;
  createdAt: string;
}

interface TrainingExample {
  id: number;
  conversationId: string | null;
  userMessage: string;
  contextSummary: string | null;
  idealResponse: string;
  toolCallsMade: string[];
  outcomeLabel: string | null;
  source: string;
  piiScrubbed: boolean;
  adminApproved: boolean;
  adminRejected: boolean;
  rejectReason: string | null;
  exportedAt: string | null;
  createdAt: string;
}

interface Stats {
  totalConversations: number;
  avgScore: number | null;
  totalExamples: number;
  pendingReview: number;
  approved: number;
  rejected: number;
  exported: number;
}

// ── Score badge ────────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground text-xs">—</span>;
  const color = score >= 80 ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
    : score >= 50 ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
    : "text-red-400 border-red-400/30 bg-red-400/10";
  return <Badge variant="outline" className={cn("text-xs font-mono", color)}>{score}/100</Badge>;
}

// ── Conversations Tab ──────────────────────────────────────────────────────────

function ConversationsTab() {
  const [selected, setSelected] = useState<Conversation | null>(null);
  const { data: rows = [], isLoading, refetch } = useQuery<Conversation[]>({
    queryKey: ["/api/admin/jac/conversations"],
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground font-display tracking-wider uppercase">
            {rows.length} captured
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-3 h-3 mr-1" />Refresh
          </Button>
        </div>
        {isLoading && <p className="text-muted-foreground text-sm py-6 text-center">Loading…</p>}
        {rows.map(c => (
          <button
            key={c.id}
            onClick={() => setSelected(c)}
            data-testid={`conv-${c.id}`}
            className={cn(
              "w-full text-left rounded-xl border bg-card p-3 transition-all hover:border-violet-500/40",
              selected?.id === c.id && "border-violet-500/60 bg-violet-500/5"
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-muted-foreground truncate max-w-[160px]">
                {c.conversationId.slice(0, 16)}…
              </span>
              <ScoreBadge score={c.autoScore} />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{c.turnCount} turns</span>
              {c.durationSecs != null && <span>{c.durationSecs}s</span>}
              {c.userTookAction && <span className="text-emerald-400">✓ action</span>}
              {c.toolCallsMade.length > 0 && (
                <span className="text-amber-400"><Zap className="w-3 h-3 inline" />{c.toolCallsMade.length}</span>
              )}
              <span className="ml-auto">{new Date(c.createdAt).toLocaleDateString()}</span>
            </div>
            {c.autoScoreReason && (
              <p className="text-[10px] text-muted-foreground mt-1 truncate italic">{c.autoScoreReason}</p>
            )}
          </button>
        ))}
        {!isLoading && rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Configure the ElevenLabs webhook to start capturing.</p>
          </div>
        )}
      </div>

      {/* Detail */}
      <div>
        {selected ? (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3 sticky top-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm">Transcript</p>
              <ScoreBadge score={selected.autoScore} />
            </div>
            {selected.autoScoreReason && (
              <p className="text-xs text-muted-foreground italic">{selected.autoScoreReason}</p>
            )}
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {selected.transcript.map((t, i) => (
                <div key={i} className={cn(
                  "rounded-lg px-3 py-2 text-xs",
                  t.role === "user" ? "bg-blue-500/10 border border-blue-500/20 ml-4" : "bg-muted/60 border border-border mr-4"
                )}>
                  <span className={cn("font-semibold mr-1", t.role === "user" ? "text-blue-400" : "text-violet-400")}>
                    {t.role === "user" ? "User:" : "JAC:"}
                  </span>
                  {t.message}
                </div>
              ))}
            </div>
            {selected.toolCallsMade.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selected.toolCallsMade.map(t => (
                  <Badge key={t} variant="outline" className="text-[10px] text-amber-400 border-amber-400/30">
                    <Zap className="w-2.5 h-2.5 mr-0.5" />{t}
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <span className={cn("text-xs px-2 py-0.5 rounded-full border", selected.piiScrubbed ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" : "text-muted-foreground border-border")}>
                {selected.piiScrubbed ? "PII scrubbed" : "PII not scrubbed"}
              </span>
              {selected.navigatedTo && (
                <span className="text-xs px-2 py-0.5 rounded-full border border-violet-400/30 text-violet-400 bg-violet-400/10">
                  → {selected.navigatedTo}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Eye className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Select a conversation to view transcript</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Training Examples Tab ──────────────────────────────────────────────────────

function TrainingTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: examples = [], isLoading, refetch } = useQuery<TrainingExample[]>({
    queryKey: ["/api/admin/jac/training-examples"],
  });

  const approveMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/admin/jac/training-examples/${id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/jac/training-examples"] }); toast({ title: "Approved" }); },
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("POST", `/api/admin/jac/training-examples/${id}/reject`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/jac/training-examples"] });
      setRejectId(null);
      setRejectReason("");
      toast({ title: "Rejected" });
    },
  });

  const exportMut = useMutation({
    mutationFn: () => fetch("/api/admin/jac/training-examples/export").then(async r => {
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jac-training-${Date.now()}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
    }),
    onSuccess: () => toast({ title: "Export downloaded" }),
  });

  const pending = examples.filter(e => !e.adminApproved && !e.adminRejected);
  const approved = examples.filter(e => e.adminApproved);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-amber-400 border-amber-400/30">{pending.length} pending</Badge>
          <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">{approved.length} approved</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-3 h-3 mr-1" />Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportMut.mutate()} disabled={approved.length === 0 || exportMut.isPending}>
            <Download className="w-3 h-3 mr-1" />Export JSONL ({approved.length})
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm py-6 text-center">Loading…</p>}

      {!isLoading && examples.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <ShieldCheck className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No training examples yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Examples are auto-extracted from captured conversations.</p>
        </div>
      )}

      {examples.map(ex => (
        <div key={ex.id} className={cn(
          "rounded-xl border bg-card p-4 space-y-3",
          ex.adminApproved && "border-emerald-500/30",
          ex.adminRejected && "opacity-50 border-border",
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">{ex.source}</Badge>
              {ex.piiScrubbed && <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">PII clean</Badge>}
              {ex.adminApproved && <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30"><CheckCircle2 className="w-3 h-3 mr-0.5" />Approved</Badge>}
              {ex.adminRejected && <Badge variant="outline" className="text-xs text-red-400 border-red-400/30"><XCircle className="w-3 h-3 mr-0.5" />Rejected</Badge>}
              {ex.outcomeLabel && <Badge variant="outline" className="text-xs text-violet-400 border-violet-400/30">{ex.outcomeLabel}</Badge>}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{new Date(ex.createdAt).toLocaleDateString()}</span>
          </div>

          <div className="space-y-2">
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-xs">
              <span className="font-semibold text-blue-400">User: </span>{ex.userMessage}
            </div>
            <div className="rounded-lg bg-muted/60 border border-border px-3 py-2 text-xs">
              <span className="font-semibold text-violet-400">JAC: </span>{ex.idealResponse}
            </div>
            {ex.contextSummary && (
              <p className="text-[10px] text-muted-foreground italic px-1">Context: {ex.contextSummary}</p>
            )}
          </div>

          {ex.toolCallsMade.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {ex.toolCallsMade.map(t => (
                <Badge key={t} variant="outline" className="text-[10px] text-amber-400 border-amber-400/30">
                  <Zap className="w-2.5 h-2.5 mr-0.5" />{t}
                </Badge>
              ))}
            </div>
          )}

          {!ex.adminApproved && !ex.adminRejected && (
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline"
                className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => approveMut.mutate(ex.id)}
                disabled={approveMut.isPending}
                data-testid={`approve-${ex.id}`}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />Approve
              </Button>
              {rejectId === ex.id ? (
                <div className="flex gap-2 flex-1">
                  <input
                    className="flex-1 text-xs rounded border border-border bg-muted/40 px-2"
                    placeholder="Reason (optional)"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    data-testid={`reject-reason-${ex.id}`}
                  />
                  <Button size="sm" variant="destructive"
                    onClick={() => rejectMut.mutate({ id: ex.id, reason: rejectReason })}
                    disabled={rejectMut.isPending}
                  >Confirm</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRejectId(null)}>Cancel</Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" className="text-muted-foreground"
                  onClick={() => setRejectId(ex.id)}
                  data-testid={`reject-${ex.id}`}
                >
                  <XCircle className="w-3 h-3 mr-1" />Reject
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────

function StatsTab() {
  const { data: stats, isLoading } = useQuery<Stats>({ queryKey: ["/api/admin/jac/training-stats"] });

  const items = [
    { label: "Conversations captured", value: stats?.totalConversations ?? 0, icon: MessageSquare, color: "text-blue-400" },
    { label: "Avg auto-score", value: stats?.avgScore != null ? `${Math.round(stats.avgScore)}/100` : "—", icon: TrendingUp, color: "text-violet-400" },
    { label: "Training examples", value: stats?.totalExamples ?? 0, icon: Zap, color: "text-amber-400" },
    { label: "Pending review", value: stats?.pendingReview ?? 0, icon: Clock, color: "text-orange-400" },
    { label: "Approved", value: stats?.approved ?? 0, icon: CheckCircle2, color: "text-emerald-400" },
    { label: "Exported", value: stats?.exported ?? 0, icon: Download, color: "text-muted-foreground" },
  ];

  if (isLoading) return <p className="text-muted-foreground text-center py-8">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {items.map(item => (
          <div key={item.label} className="rounded-xl border border-border bg-card p-4">
            <item.icon className={cn("w-5 h-5 mb-2", item.color)} />
            <p className="text-2xl font-black font-mono">{item.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <p className="font-semibold text-sm mb-3">Webhook Setup</p>
        <p className="text-xs text-muted-foreground">Add this URL to your ElevenLabs agent → Webhooks tab:</p>
        <code className="block text-xs bg-muted/60 rounded px-3 py-2 font-mono break-all">
          https://guberapp.app/api/jac/convai/webhook
        </code>
        <p className="text-xs text-muted-foreground mt-2">
          Copy the signing secret ElevenLabs generates and add it as env var:{" "}
          <code className="font-mono bg-muted/60 px-1 rounded">ELEVENLABS_WEBHOOK_SECRET</code>
        </p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminJacTraining() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-muted-foreground font-display tracking-widest uppercase">JAC Intelligence</span>
          </div>
          <h1 className="text-2xl font-display font-black">Training Data</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Captured conversations → admin review → approved training dataset → fine-tune
          </p>
        </div>

        <Tabs defaultValue="stats">
          <TabsList className="mb-6">
            <TabsTrigger value="stats">Overview</TabsTrigger>
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="examples">Training Examples</TabsTrigger>
          </TabsList>
          <TabsContent value="stats"><StatsTab /></TabsContent>
          <TabsContent value="conversations"><ConversationsTab /></TabsContent>
          <TabsContent value="examples"><TrainingTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
