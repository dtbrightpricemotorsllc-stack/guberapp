import { useQuery, useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, ArrowUpRight, ArrowDownLeft, RefreshCcw, DollarSign, AlertCircle, ExternalLink, Zap, Info, Banknote, Shield, Lock, Clock, CheckCircle, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { WalletTransaction } from "@shared/schema";
import { Link } from "wouter";
import { useState } from "react";

function getTrustLevel(score: number): { level: "new" | "verified" | "trusted"; label: string; color: string; bg: string; border: string; next: number | null } {
  if (score >= 80) return { level: "trusted", label: "Trusted", color: "#86efac", bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.25)", next: null };
  if (score >= 60) return { level: "verified", label: "Verified", color: "#93c5fd", bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.25)", next: 80 };
  return { level: "new", label: "New", color: "#94a3b8", bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.20)", next: 60 };
}

function TrustWidget({ trustScore }: { trustScore: number }) {
  const trust = getTrustLevel(trustScore);
  const progressPct = trust.level === "trusted" ? 100 : trust.level === "verified" ? ((trustScore - 60) / 20) * 100 : (trustScore / 60) * 100;

  const tiers = [
    { level: "new" as const, label: "New", score: "0–59", icon: <Shield className="w-3.5 h-3.5" />, color: "#94a3b8", unlocks: "Standard payout (2–5 days)", locked: false },
    { level: "verified" as const, label: "Verified", score: "60–79", icon: <Clock className="w-3.5 h-3.5" />, color: "#93c5fd", unlocks: "Early Cash-Out (2% fee)", locked: trust.level === "new" },
    { level: "trusted" as const, label: "Trusted", score: "80+", icon: <Zap className="w-3.5 h-3.5" />, color: "#c4b5fd", unlocks: "Instant Cash-Out (5% fee)", locked: trust.level !== "trusted" },
  ];

  return (
    <div className="mb-4 rounded-2xl border p-4 space-y-3" style={{ background: trust.bg, borderColor: trust.border }} data-testid="card-trust-widget">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4" style={{ color: trust.color }} />
          <p className="text-xs font-display font-black tracking-wider uppercase" style={{ color: trust.color }}>Trust Level</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/50 font-display">{trustScore} pts</span>
          <div className="px-2 py-0.5 rounded-full text-[9px] font-display font-black tracking-widest uppercase border" style={{ background: trust.bg, borderColor: trust.border, color: trust.color }} data-testid="badge-trust-level">
            {trust.label}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(progressPct, 100)}%`, background: trust.color }} />
        </div>
        {trust.next && (
          <p className="text-[10px] text-muted-foreground/40">{trust.next - trustScore} more points to {trust.next === 60 ? "Verified" : "Trusted"}</p>
        )}
        {trust.level === "trusted" && (
          <p className="text-[10px] text-muted-foreground/40">Maximum trust level reached</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {tiers.map((tier) => {
          const isActive = trust.level === tier.level;
          const isPassed = (tier.level === "new") || (tier.level === "verified" && trust.level === "trusted");
          return (
            <div key={tier.level} className="rounded-xl p-2.5 space-y-1.5 relative" style={{ background: isActive || isPassed ? `${tier.color}15` : "rgba(255,255,255,0.02)", border: `1px solid ${isActive || isPassed ? `${tier.color}30` : "rgba(255,255,255,0.05)"}` }} data-testid={`tier-card-${tier.level}`}>
              {tier.locked && <Lock className="absolute top-2 right-2 w-2.5 h-2.5 text-muted-foreground/30" />}
              <div className="flex items-center gap-1" style={{ color: isActive || isPassed ? tier.color : "#475569" }}>
                {tier.icon}
                <span className="text-[9px] font-display font-black tracking-wider uppercase">{tier.label}</span>
              </div>
              <p className="text-[9px] text-muted-foreground/40 leading-tight">{tier.unlocks}</p>
              <p className="text-[8px] text-muted-foreground/30">{tier.score} pts</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5 space-y-1">
        <p className="text-[9px] font-display font-bold tracking-wider text-muted-foreground/50 uppercase">How to earn points</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {["+5 each completed job", "+2 5-star review", "+10 ID verified", "−10 per dispute"].map((tip) => (
            <p key={tip} className={`text-[9px] ${tip.startsWith("−") ? "text-red-400/50" : "text-muted-foreground/40"}`}>{tip}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

const typeIcons: Record<string, any> = {
  payment: ArrowUpRight,
  earning: ArrowDownLeft,
  refund: RefreshCcw,
  credit: DollarSign,
};

const typeColors: Record<string, string> = {
  payment: "text-destructive",
  earning: "guber-text-green",
  refund: "text-blue-400",
  credit: "text-emerald-400",
};

function friendlyDescription(t: WalletTransaction & { stripeTransferId?: string }): string {
  const desc = t.description || "";
  if (desc.startsWith("Earnings pending payout setup:")) {
    return `Earned: ${desc.replace("Earnings pending payout setup: ", "")}`;
  }
  if (desc.startsWith("Payment authorized (held by Stripe) for")) {
    const match = desc.match(/for "(.*?)"/);
    return match ? `Payment held for "${match[1]}"` : "Payment authorized by Stripe";
  }
  if (desc.startsWith("Payment released via Stripe for")) {
    const match = desc.match(/for "(.*?)"/);
    return match ? `Earned: ${match[1]}` : desc;
  }
  if (desc.startsWith("Auto-confirmed earnings for")) {
    const match = desc.match(/for "(.*?)"/);
    return match ? `Earned: ${match[1]}` : desc;
  }
  return desc;
}

export default function WalletPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [claimError, setClaimError] = useState<"INSUFFICIENT_FUNDS" | "ACCOUNT_ISSUE" | "TRANSFER_FAILED" | null>(null);

  const { data: transactions, isLoading, isError, refetch } = useQuery<WalletTransaction[]>({
    queryKey: ["/api/wallet"],
    staleTime: 0,
  });

  const { data: pendingConfirms } = useQuery<any[]>({
    queryKey: ["/api/wallet/pending-confirms"],
    staleTime: 0,
    enabled: !!user,
  });

  const { data: connectStatus } = useQuery<{ status: string; accountId: string | null }>({
    queryKey: ["/api/stripe/connect/status"],
    enabled: !!user,
    staleTime: 0,
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", "/api/wallet/claim-pending-payouts");
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || "Claim failed");
      return data;
    },
    onSuccess: (data) => {
      setClaimError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stripe/connect/status"] });
      if (data.retried > 0 && data.failed === 0) {
        toast({ title: "Earnings sent!", description: `Your earnings are on their way to your payout account.` });
      } else if (data.failed > 0) {
        const errorCode = data.errors?.[0] || "TRANSFER_FAILED";
        setClaimError(errorCode as any);
      } else {
        toast({ title: "All caught up", description: "No pending payouts right now." });
      }
    },
    onError: (err: any) => {
      const msg = err.message || "";
      if (msg.toLowerCase().includes("not active") || msg.toLowerCase().includes("payout account")) {
        setClaimError("ACCOUNT_ISSUE");
      } else {
        toast({ title: "Something went wrong", description: "Please try again in a moment.", variant: "destructive" });
      }
    },
  });

  const payments = transactions?.filter(t => t.type === "payment") || [];
  const earnings = transactions?.filter(t => t.type === "earning" || t.type === "credit") || [];

  const totalEarnings = earnings.reduce((s, t) => s + t.amount, 0);
  const availableBalance = earnings.filter(t => t.status === "available").reduce((s, t) => s + t.amount, 0);
  const pendingEarnings = earnings.filter(t => t.status === "pending").reduce((s, t) => s + t.amount, 0);
  const totalSpent = payments.reduce((s, t) => s + t.amount, 0);
  const creditBalance = transactions?.filter(t => t.type === "credit" && t.status === "available").reduce((s, t) => s + t.amount, 0) || 0;

  const unsentTotal = earnings
    .filter(t => t.status === "available" && !(t as any).stripeTransferId)
    .reduce((s, t) => s + t.amount, 0);

  const hasUnsent = unsentTotal > 0;
  const isConnectActive = connectStatus?.status === "active";
  const hasConnect = !!connectStatus?.accountId;

  const hasPendingConfirms = (pendingConfirms?.length ?? 0) > 0;

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-wallet">
        <h1 className="text-xl font-display font-bold mb-4">Wallet</h1>

        {/* Pending Confirms — jobs worker finished but poster hasn't confirmed yet */}
        {hasPendingConfirms && (
          <div className="mb-4 rounded-2xl border border-primary/30 bg-primary/[0.05] overflow-hidden" data-testid="section-pending-confirms">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-primary/20">
              <CheckCircle className="w-4 h-4 text-primary" />
              <p className="text-sm font-display font-bold text-primary">
                {pendingConfirms!.length === 1 ? "Payment on hold — confirm to release" : `${pendingConfirms!.length} payments on hold — confirm to release`}
              </p>
            </div>
            <div className="divide-y divide-primary/10">
              {pendingConfirms!.map((job) => {
                const held = ((job.budget ?? 0) + (job.urgentFee || 0)).toFixed(2);
                return (
                  <Link key={job.id} href={`/jobs/${job.id}`}>
                    <div className="flex items-center justify-between px-4 py-3 hover:bg-primary/[0.04] transition-colors cursor-pointer" data-testid={`pending-confirm-job-${job.id}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{job.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Worker finished · <span className="text-yellow-400 font-semibold">${held} on hold</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className="text-[11px] font-display font-bold text-primary">Confirm →</span>
                        <ChevronRight className="w-4 h-4 text-primary/60" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
            <div className="px-4 py-2.5 bg-primary/[0.03]">
              <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
                Funds are held by Stripe until you confirm. If you don't confirm within 12 hours, it auto-confirms and releases payment to the worker.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-card rounded-xl border border-border/20 p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Available</p>
            {isLoading ? <Skeleton className="h-8 w-20 mt-1" /> : (
              <p className="text-2xl font-display font-bold guber-text-green" data-testid="text-available-balance">
                ${availableBalance.toFixed(2)}
              </p>
            )}
          </div>
          <div className="bg-card rounded-xl border border-border/20 p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Pending</p>
            {isLoading ? <Skeleton className="h-8 w-20 mt-1" /> : (
              <p className="text-2xl font-display font-bold text-yellow-400" data-testid="text-pending">
                ${pendingEarnings.toFixed(2)}
              </p>
            )}
          </div>
          <div className="bg-card rounded-xl border border-border/20 p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Total Earned</p>
            {isLoading ? <Skeleton className="h-6 w-16 mt-1" /> : (
              <p className="text-lg font-display font-bold guber-text-green">${totalEarnings.toFixed(2)}</p>
            )}
          </div>
          <div className="bg-card rounded-xl border border-border/20 p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Total Spent</p>
            {isLoading ? <Skeleton className="h-6 w-16 mt-1" /> : (
              <p className="text-lg font-display font-bold text-muted-foreground">${totalSpent.toFixed(2)}</p>
            )}
          </div>
        </div>

        {!isLoading && user && user.role !== "admin" && typeof user.trustScore === "number" && (
          <TrustWidget trustScore={user.trustScore} />
        )}

        {!isLoading && !isConnectActive && !hasUnsent && !hasPendingConfirms && (
          <div className="mb-4 rounded-xl border border-border/20 bg-card p-3 flex items-center justify-between gap-3" data-testid="banner-payout-nudge">
            <div className="flex items-center gap-2.5 min-w-0">
              <Banknote className="w-4 h-4 text-muted-foreground/50 shrink-0" />
              <p className="text-[11px] text-muted-foreground/70 leading-snug">
                {hasConnect ? "Finish setting up your payout account to receive earnings." : "Set up a payout account to get paid for completed jobs."}
              </p>
            </div>
            <Link href="/profile">
              <Button size="sm" variant="ghost" className="text-primary text-[11px] font-display font-semibold h-7 shrink-0 px-2" data-testid="link-setup-payout-wallet">
                Set up →
              </Button>
            </Link>
          </div>
        )}

        {creditBalance > 0 && (
          <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 flex items-center gap-3" data-testid="banner-guber-credit">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-display font-semibold text-emerald-400">GUBER Credit Balance</p>
              <p className="text-lg font-display font-bold text-emerald-300">${creditBalance.toFixed(2)}</p>
            </div>
          </div>
        )}

        {/* Claim error banners */}
        {claimError === "INSUFFICIENT_FUNDS" && (
          <div className="mb-4 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4" data-testid="banner-insufficient-funds">
            <div className="flex gap-3">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-300">Payout processing</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Your earnings are confirmed — the transfer is being processed. If you don't see it in your account within 24 hours, tap Retry.
                </p>
                <Button
                  size="sm" variant="ghost"
                  className="text-blue-400 hover:text-blue-300 text-xs mt-1 h-auto px-0 py-0"
                  onClick={() => { setClaimError(null); claimMutation.mutate(); }}
                >
                  Retry
                </Button>
              </div>
            </div>
          </div>
        )}

        {claimError === "ACCOUNT_ISSUE" && (
          <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-yellow-300">Payout account needs attention</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Complete your payout setup in Profile to receive your earnings.
                </p>
                <Link href="/profile">
                  <Button size="sm" variant="ghost" className="text-yellow-400 hover:text-yellow-300 text-xs mt-1 h-auto px-0 py-0">
                    Go to Profile →
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Payout CTA banner */}
        {hasUnsent && !isLoading && !claimError && (
          <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4" data-testid="banner-pending-payouts">
            {isConnectActive ? (
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-yellow-300">${unsentTotal.toFixed(2)} ready to transfer</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Tap to send your earnings to your payout account.</p>
                </div>
                <Button
                  size="sm"
                  className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold shrink-0"
                  onClick={() => claimMutation.mutate()}
                  disabled={claimMutation.isPending}
                  data-testid="button-claim-earnings"
                >
                  <Zap className="w-3 h-3 mr-1" />
                  {claimMutation.isPending ? "Sending..." : "Claim Now"}
                </Button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-yellow-300">${unsentTotal.toFixed(2)} waiting for payout setup</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {hasConnect
                      ? "Your payout account is being verified. Check back soon."
                      : "Set up your payout account in Profile to receive your earnings."}
                  </p>
                </div>
                {!hasConnect && (
                  <Link href="/profile">
                    <Button size="sm" variant="outline" className="border-yellow-500/50 text-yellow-300 shrink-0" data-testid="button-setup-payouts">
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Set Up
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {isError ? (
          <div className="text-center py-12">
            <AlertCircle className="w-10 h-10 text-destructive/50 mx-auto mb-3" />
            <p className="text-muted-foreground font-display mb-3">Could not load transactions</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-retry-wallet">
              <RefreshCcw className="w-3 h-3 mr-2" /> Retry
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="all">
            <TabsList className="bg-card border border-border/20 mb-4 w-full">
              <TabsTrigger value="all" className="font-display flex-1">All</TabsTrigger>
              <TabsTrigger value="earnings" className="font-display flex-1">Earnings</TabsTrigger>
              <TabsTrigger value="payments" className="font-display flex-1">Payments</TabsTrigger>
            </TabsList>

            {["all", "earnings", "payments"].map((tab) => (
              <TabsContent key={tab} value={tab}>
                {isLoading ? (
                  <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
                ) : (
                  <TransactionList
                    items={tab === "all" ? (transactions || []) : tab === "earnings" ? earnings : payments}
                  />
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </GuberLayout>
  );
}

function TransactionList({ items }: { items: WalletTransaction[] }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <Wallet className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
        <p className="text-muted-foreground font-display">No transactions yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((t) => {
        const Icon = typeIcons[t.type] || DollarSign;
        const colorClass = typeColors[t.type] || "";
        const isHeld = t.type === "payment" && t.status === "pending";
        const isUntransferred = t.type === "earning" && t.status === "available" && !(t as any).stripeTransferId;
        const displayStatus = isHeld ? "on hold" : isUntransferred ? "ready" : t.status;
        const displayDescription = friendlyDescription(t as any);

        return (
          <div key={t.id} className="bg-card rounded-xl border border-border/20 p-3 flex items-center justify-between gap-3" data-testid={`txn-${t.id}`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isHeld ? "bg-yellow-500/10" : "bg-muted"}`}>
                <Icon className={`w-4 h-4 ${isHeld ? "text-yellow-400" : colorClass}`} />
              </div>
              <div>
                <p className="text-sm font-semibold">{displayDescription}</p>
                <p className="text-[11px] text-muted-foreground">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : ""}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-display font-bold ${isHeld ? "text-yellow-400" : colorClass}`}>
                {t.type === "payment" ? "-" : "+"}${t.amount.toFixed(2)}
              </p>
              <Badge
                variant="outline"
                className={`text-[10px] capitalize ${
                  displayStatus === "on hold" ? "border-yellow-500/50 text-yellow-400" :
                  displayStatus === "pending" ? "border-yellow-500/50 text-yellow-400" :
                  displayStatus === "ready" ? "border-blue-500/50 text-blue-400" :
                  displayStatus === "available" ? "border-green-500/50 text-green-400" :
                  displayStatus === "completed" ? "border-green-500/50 text-green-400" : ""
                }`}
              >
                {displayStatus}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
