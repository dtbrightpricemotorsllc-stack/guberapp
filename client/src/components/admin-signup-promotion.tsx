import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Gift, Pause, Play, RefreshCw } from "lucide-react";

type PromotionData = {
  status: {
    baseline: number;
    milestone_interval: number;
    prize_cents: number;
    enabled: boolean;
    activated_at: string | null;
    eligible_signup_count: number;
    winnerCount: number;
    openAlertCount: number;
  };
  winners: Array<{
    id: number;
    userId: number;
    username: string;
    fullName: string;
    email: string;
    sequenceNumber: number;
    globalSignupNumber: number;
    prizeCents: number;
    status: string;
    payoutMethod: string | null;
    payoutHandle: string | null;
    claimedAt: string | null;
    paidAt: string | null;
    disqualificationReason: string | null;
    adminNotes: string | null;
    alertStatus: string | null;
    alertDetails: Record<string, unknown> | null;
    alertAcknowledgedAt: string | null;
    signupAt: string;
  }>;
};

export function AdminSignupPromotionTab() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useQuery<PromotionData>({
    queryKey: ["/api/admin/signup-promotion"],
    queryFn: async () => {
      const response = await fetch("/api/admin/signup-promotion", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load signup promotion");
      return response.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => apiRequest("PATCH", "/api/admin/signup-promotion", { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/signup-promotion"] });
      toast({ title: "Signup promotion updated" });
    },
    onError: (error: any) => toast({ title: "Update failed", description: error?.message, variant: "destructive" }),
  });

  const winnerMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/admin/signup-promotion/winners/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/signup-promotion"] });
      toast({ title: "Winner updated" });
    },
    onError: (error: any) => toast({ title: "Winner update failed", description: error?.message, variant: "destructive" }),
  });

  if (isLoading || !data) {
    return <div className="rounded-xl border border-border/20 bg-card p-6 text-sm text-muted-foreground">Loading signup promotion…</div>;
  }

  const status = data.status;
  return (
    <div className="space-y-4" data-testid="admin-signup-promotion">
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-amber-300" />
            <div>
              <h3 className="font-display font-semibold text-sm">Fixed-baseline signup promotion</h3>
              <p className="text-[11px] text-muted-foreground">Every {status.milestone_interval}th new eligible individual signup after baseline wins ${(status.prize_cents / 100).toFixed(0)}.</p>
            </div>
          </div>
          <Badge variant="outline" className={status.enabled ? "text-emerald-300 border-emerald-400/30" : "text-muted-foreground"}>
            {status.enabled ? "Active" : "Disabled"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <Metric label="Fixed baseline" value={status.baseline} />
          <Metric label="Eligible since activation" value={status.eligible_signup_count} />
          <Metric label="Next winner at sequence" value={Math.floor(status.eligible_signup_count / status.milestone_interval + 1) * status.milestone_interval} />
          <Metric label="Open alerts" value={status.openAlertCount} />
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Button
            size="sm"
            variant={status.enabled ? "outline" : "default"}
            onClick={() => toggleMutation.mutate(!status.enabled)}
            disabled={toggleMutation.isPending}
            data-testid="button-toggle-signup-promotion"
          >
            {status.enabled ? <><Pause className="w-3 h-3 mr-1" /> Disable</> : <><Play className="w-3 h-3 mr-1" /> Enable</>}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh-signup-promotion">
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
          {status.activated_at && <span className="text-[10px] text-muted-foreground">Activated {new Date(status.activated_at).toLocaleString()}</span>}
        </div>
      </div>

      <div className="rounded-xl border border-border/20 bg-card overflow-hidden">
        <div className="p-4 border-b border-border/10">
          <h3 className="font-display font-semibold text-sm">Winner history</h3>
          <p className="text-[11px] text-muted-foreground">{data.winners.length} permanent winner record{data.winners.length === 1 ? "" : "s"}</p>
        </div>
        {data.winners.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No winners yet.</div>
        ) : (
          <div className="divide-y divide-border/10">
            {data.winners.map((winner) => (
              <div key={winner.id} className="p-4 space-y-3" data-testid={`promotion-winner-${winner.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">Signup #{winner.globalSignupNumber} · {winner.fullName || winner.username}</p>
                    <p className="text-[11px] text-muted-foreground">User {winner.userId} · sequence {winner.sequenceNumber} · {winner.email}</p>
                  </div>
                  <Badge variant="outline">{winner.status.replace("_", " ")}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Admin alert: <span className={winner.alertStatus === "open" ? "text-amber-300" : "text-foreground"}>{winner.alertStatus || "not created"}</span>
                  {winner.alertAcknowledgedAt ? ` · acknowledged ${new Date(winner.alertAcknowledgedAt).toLocaleString()}` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  Payout: <span className="text-foreground">{winner.payoutMethod?.replace("_", " ") || "not submitted"}{winner.payoutHandle ? ` · ${winner.payoutHandle}` : ""}</span>
                </div>
                {winner.disqualificationReason && <p className="text-xs text-destructive">{winner.disqualificationReason}</p>}
                <div className="flex flex-wrap gap-2">
                  {winner.status !== "paid" && winner.status !== "disqualified" && (
                    <Button size="sm" onClick={() => winnerMutation.mutate({ id: winner.id, status: "paid" })} disabled={winnerMutation.isPending}>
                      Mark paid
                    </Button>
                  )}
                  {winner.status !== "disqualified" && winner.status !== "paid" && (
                    <Button size="sm" variant="outline" onClick={() => {
                      const reason = window.prompt("Reason for disqualification:");
                      if (reason?.trim()) {
                        apiRequest("PATCH", `/api/admin/signup-promotion/winners/${winner.id}`, {
                          status: "disqualified",
                          disqualificationReason: reason.trim(),
                        }).then(() => {
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/signup-promotion"] });
                          toast({ title: "Winner disqualified" });
                        }).catch((error: any) => toast({ title: "Update failed", description: error?.message, variant: "destructive" }));
                      }
                    }}>
                      Disqualify
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/15 bg-card/60 p-2 text-center">
      <p className="text-lg font-display font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}