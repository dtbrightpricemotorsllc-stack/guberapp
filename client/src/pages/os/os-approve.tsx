import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, Filter, Cpu, ChevronRight } from "lucide-react";

type OSAction = {
  id: number;
  agentKey: string;
  actionType: string;
  riskTier: string;
  payload: Record<string, any>;
  rationale: string;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  rejectionNote: string | null;
};

const TIER_COLORS: Record<string, string> = {
  read: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  low: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  medium: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  founder: "bg-red-500/20 text-red-300 border-red-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-400",
  approved: "text-emerald-400",
  rejected: "text-red-400",
  executed: "text-violet-400",
  failed: "text-red-500",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function OSApprove() {
  const [, nav] = useLocation();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selected, setSelected] = useState<OSAction | null>(null);
  const [note, setNote] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{ action: OSAction; decision: "approved" | "rejected" } | null>(null);

  const { data: actions = [], isLoading } = useQuery<OSAction[]>({
    queryKey: ["/api/os/actions", statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/os/actions?status=${statusFilter}`, { credentials: "include" });
      return res.json();
    },
  });

  const decideMut = useMutation({
    mutationFn: ({ id, decision, note }: { id: number; decision: string; note?: string }) =>
      apiRequest("POST", `/api/os/actions/${id}/decide`, { decision, note }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/os/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/os/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/os/health"] });
      toast({
        title: vars.decision === "approved" ? "Action approved" : "Action rejected",
        description: vars.note ?? undefined,
      });
      setConfirmDialog(null);
      setSelected(null);
      setNote("");
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const testActionMut = useMutation({
    mutationFn: (actionType: string) =>
      apiRequest("POST", "/api/os/actions/test", {
        actionType,
        rationale: "Manual test from OS approve page",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/os/actions"] });
      toast({ title: "Test action proposed" });
    },
  });

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
            { label: "Command Center", path: "/os/command-center" },
            { label: "Daily Briefing",  path: "/os/briefing" },
            { label: "Dashboard", path: "/os/dashboard" },
            { label: "Approvals", path: "/os/approve", active: true },
            { label: "Memory", path: "/os/memory" },
            { label: "Agents", path: "/os/agents" },
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">Action Queue</h2>
            <p className="text-sm text-white/40 mt-0.5">
              Review and approve or reject proposed actions before they execute
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 text-white/60 hover:text-white"
              onClick={() => testActionMut.mutate("notify.user")}
              disabled={testActionMut.isPending}
              data-testid="button-test-low-tier"
            >
              + Test low-tier
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-500/30 text-amber-400 hover:text-amber-300"
              onClick={() => testActionMut.mutate("flag.user_for_review")}
              disabled={testActionMut.isPending}
              data-testid="button-test-medium-tier"
            >
              + Test medium-tier
            </Button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-5 border-b border-white/10">
          {["pending", "approved", "rejected", "executed"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              data-testid={`filter-${s}`}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${
                statusFilter === s
                  ? "border-violet-500 text-white"
                  : "border-transparent text-white/40 hover:text-white/60"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="text-center py-12 text-white/40">Loading…</div>
        )}

        {!isLoading && actions.length === 0 && (
          <div className="text-center py-16 text-white/40">
            <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-500/40" />
            <p className="text-sm">No {statusFilter} actions</p>
          </div>
        )}

        <div className="space-y-3">
          {actions.map((action) => (
            <Card
              key={action.id}
              className="bg-[#12121a] border-white/10 cursor-pointer hover:border-white/20 transition-colors"
              onClick={() => setSelected(selected?.id === action.id ? null : action)}
              data-testid={`action-row-${action.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded border font-mono shrink-0 mt-0.5 ${
                      TIER_COLORS[action.riskTier] ?? TIER_COLORS.medium
                    }`}
                  >
                    {action.riskTier}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{action.actionType}</span>
                      <span className={`text-xs font-medium ${STATUS_COLORS[action.status]}`}>
                        {action.status}
                      </span>
                    </div>
                    <p className="text-xs text-white/50 mt-0.5 truncate">{action.rationale}</p>
                    <p className="text-xs text-white/30 mt-1">
                      Agent: {action.agentKey} · {timeAgo(action.createdAt)}
                    </p>
                  </div>
                  {action.status === "pending" && (
                    <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        className="h-7 bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                        onClick={() => setConfirmDialog({ action, decision: "approved" })}
                        data-testid={`btn-approve-${action.id}`}
                      >
                        <CheckCircle className="w-3 h-3 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
                        onClick={() => setConfirmDialog({ action, decision: "rejected" })}
                        data-testid={`btn-reject-${action.id}`}
                      >
                        <XCircle className="w-3 h-3 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                </div>

                {/* Expanded payload */}
                {selected?.id === action.id && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-xs text-white/40 mb-1.5">Payload</p>
                    <pre className="text-xs bg-black/40 rounded p-2 text-white/60 overflow-auto max-h-32">
                      {JSON.stringify(action.payload, null, 2)}
                    </pre>
                    {action.rejectionNote && (
                      <p className="text-xs text-red-400 mt-2">Note: {action.rejectionNote}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Confirm Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={() => { setConfirmDialog(null); setNote(""); }}>
        <DialogContent className="bg-[#12121a] border-white/20 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmDialog?.decision === "approved" ? "Approve action?" : "Reject action?"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <p className="text-sm font-medium">{confirmDialog?.action.actionType}</p>
              <p className="text-xs text-white/50 mt-1">{confirmDialog?.action.rationale}</p>
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">
                Note {confirmDialog?.decision === "rejected" ? "(required for rejections)" : "(optional)"}
              </label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add context for the audit log…"
                className="bg-black/30 border-white/20 text-white text-sm resize-none"
                rows={3}
                data-testid="input-decision-note"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                className="text-white/60"
                onClick={() => { setConfirmDialog(null); setNote(""); }}
              >
                Cancel
              </Button>
              <Button
                className={confirmDialog?.decision === "approved"
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : "bg-red-600 hover:bg-red-500"}
                onClick={() => {
                  if (!confirmDialog) return;
                  decideMut.mutate({
                    id: confirmDialog.action.id,
                    decision: confirmDialog.decision,
                    note: note || undefined,
                  });
                }}
                disabled={decideMut.isPending}
                data-testid="btn-confirm-decision"
              >
                {decideMut.isPending ? "Saving…" : `Confirm ${confirmDialog?.decision}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
