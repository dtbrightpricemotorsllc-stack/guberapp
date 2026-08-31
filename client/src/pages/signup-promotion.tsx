import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Gift, Trophy } from "lucide-react";

type PromotionStatus = {
  isWinner: boolean;
  globalSignupNumber?: number;
  prizeCents?: number;
  status?: string;
  payoutMethod?: string | null;
  payoutHandle?: string | null;
  claimedAt?: string | null;
  paidAt?: string | null;
  disqualificationReason?: string | null;
  adminNotes?: string | null;
};

export default function SignupPromotionPage() {
  const { toast } = useToast();
  const [payoutMethod, setPayoutMethod] = useState<"cash_app" | "venmo">("cash_app");
  const [payoutHandle, setPayoutHandle] = useState("");

  const { data, isLoading } = useQuery<PromotionStatus>({
    queryKey: ["/api/signup-promotion/me"],
    queryFn: async () => {
      const response = await fetch("/api/signup-promotion/me", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load promotion status");
      return response.json();
    },
  });

  useEffect(() => {
    if (!data?.isWinner) return;
    if (data.payoutMethod === "cash_app" || data.payoutMethod === "venmo") {
      setPayoutMethod(data.payoutMethod);
    }
    if (data.payoutHandle) setPayoutHandle(data.payoutHandle);
  }, [data?.isWinner, data?.payoutMethod, data?.payoutHandle]);

  const claimMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", "/api/signup-promotion/me/claim", {
        payoutMethod,
        payoutHandle: payoutHandle.trim(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signup-promotion/me"] });
      toast({ title: "Payout details saved", description: "GUBER will review your $50 prize claim." });
    },
    onError: (error: any) => toast({
      title: "Could not save payout details",
      description: error?.message || "Please try again.",
      variant: "destructive",
    }),
  });

  if (isLoading) {
    return <GuberLayout showBack backHref="/dashboard" title="Signup promotion"><div className="p-6 text-sm text-muted-foreground">Loading…</div></GuberLayout>;
  }

  if (!data?.isWinner) {
    return (
      <GuberLayout showBack backHref="/dashboard" title="Signup promotion">
        <div className="max-w-lg mx-auto px-4 py-12 text-center" data-testid="signup-promotion-not-winner">
          <Gift className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <h1 className="text-xl font-display font-bold">Signup promotion</h1>
          <p className="mt-2 text-sm text-muted-foreground">There is no prize claim attached to this account.</p>
        </div>
      </GuberLayout>
    );
  }

  const isPaid = data.status === "paid";
  const isDisqualified = data.status === "disqualified";
  const isClaimed = data.status === "claimed";

  return (
    <GuberLayout showBack backHref="/dashboard" title="Signup promotion">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4" data-testid="signup-promotion-winner">
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-400/20 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-amber-200/80 font-display">Congratulations</p>
              <h1 className="text-xl font-display font-bold">You won $50</h1>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Your account is recorded as eligible signup #{data.globalSignupNumber}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Status: <span className="text-foreground capitalize">{data.status?.replace("_", " ")}</span></p>
        </div>

        {isDisqualified ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
            This prize is no longer eligible for payout.
            {data.disqualificationReason && <p className="mt-1 text-muted-foreground">{data.disqualificationReason}</p>}
          </div>
        ) : isPaid ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            Your prize has been marked paid.
          </div>
        ) : (
          <form
            className="rounded-xl border border-border/20 bg-card p-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              claimMutation.mutate();
            }}
          >
            <div>
              <h2 className="font-display font-semibold">Claim your prize</h2>
              <p className="text-xs text-muted-foreground mt-1">Give us the handle where an admin should send your manual payout.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="promotion-payout-method">Payout method</Label>
              <select
                id="promotion-payout-method"
                value={payoutMethod}
                onChange={(event) => setPayoutMethod(event.target.value as "cash_app" | "venmo")}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                data-testid="select-promotion-payout-method"
              >
                <option value="cash_app">Cash App</option>
                <option value="venmo">Venmo</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="promotion-payout-handle">Handle</Label>
              <Input
                id="promotion-payout-handle"
                value={payoutHandle}
                onChange={(event) => setPayoutHandle(event.target.value)}
                placeholder={payoutMethod === "cash_app" ? "$yourhandle" : "@yourhandle"}
                required
                maxLength={50}
                data-testid="input-promotion-payout-handle"
              />
            </div>
            <Button type="submit" disabled={claimMutation.isPending || !payoutHandle.trim()} data-testid="button-claim-promotion">
              {claimMutation.isPending ? "Saving…" : isClaimed ? "Update payout details" : "Submit claim"}
            </Button>
          </form>
        )}
      </div>
    </GuberLayout>
  );
}