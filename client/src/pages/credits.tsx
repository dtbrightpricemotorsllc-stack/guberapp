import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Coins, Clock, TrendingUp, ArrowDownToLine, CheckCircle2, XCircle, ChevronLeft,
  AlertCircle, ExternalLink, Loader2, Shield, CreditCard, Info
} from "lucide-react";

interface CreditBalance {
  available: number;
  pending: number;
  earned: number;
  redeemed: number;
  dollarValue: string;
  creditsPerDollar: number;
  minCashout: number;
  cashoutEnabled: boolean;
  stripeReady: boolean;
  idVerified: boolean;
  eligibleForCashout: boolean;
  stripeAccountStatus: string | null;
}

interface LedgerRow {
  id: number;
  amount: number;
  dollar_equivalent: string;
  source_type: string;
  status: string;
  reason: string | null;
  created_at: string;
}

interface MyCashoutRequest {
  id: number;
  credits_requested: number;
  dollar_amount: string;
  status: string;
  payout_method: string | null;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const SOURCE_LABELS: Record<string, { label: string; emoji: string }> = {
  map_mission:                     { label: "Map Mission",         emoji: "🗺️" },
  referral_creates_account:        { label: "Referral Signup",     emoji: "👤" },
  referral_verifies_id:            { label: "Referral Verified",   emoji: "✅" },
  referral_stripe_connected:       { label: "Referral Payout",     emoji: "💳" },
  referral_first_paid_job:         { label: "Referral First Job",  emoji: "💼" },
  referral_og_purchase_referrer:   { label: "Referral OG Sale",    emoji: "👑" },
  referral_og_purchase_referred:   { label: "OG Bonus",            emoji: "⭐" },
  admin_grant:                     { label: "Admin Grant",         emoji: "🎁" },
  cashout:                         { label: "Cashout",             emoji: "💸" },
  boost_spend:                     { label: "Boost Spend",         emoji: "🚀" },
};

function statusBadge(status: string) {
  if (status === "approved") return <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">approved</Badge>;
  if (status === "pending")  return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-[10px]">pending</Badge>;
  if (status === "denied")   return <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">denied</Badge>;
  if (status === "redeemed") return <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px]">paid out</Badge>;
  return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
}

export default function CreditsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [cashoutCredits, setCashoutCredits] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("stripe");
  const [payoutDetails, setPayoutDetails] = useState("");
  const [showCashoutForm, setShowCashoutForm] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(0);

  const { data: balance, isLoading: balanceLoading } = useQuery<CreditBalance>({
    queryKey: ["/api/credits/balance"],
  });

  const { data: ledger = [], isLoading: ledgerLoading } = useQuery<LedgerRow[]>({
    queryKey: ["/api/credits/ledger", ledgerPage],
    queryFn: () => fetch(`/api/credits/ledger?offset=${ledgerPage * 20}&limit=20`).then(r => r.json()),
  });

  const { data: myCashouts = [] } = useQuery<MyCashoutRequest[]>({
    queryKey: ["/api/credits/cashout-requests/mine"],
  });

  const cashoutMutation = useMutation({
    mutationFn: (body: { credits: number; payoutMethod: string; payoutDetails?: string }) =>
      apiRequest("POST", "/api/credits/cashout-request", body),
    onSuccess: () => {
      toast({ title: "Cashout request submitted", description: "Admin will review and process your payment within 1–3 business days." });
      qc.invalidateQueries({ queryKey: ["/api/credits/balance"] });
      qc.invalidateQueries({ queryKey: ["/api/credits/ledger"] });
      qc.invalidateQueries({ queryKey: ["/api/credits/cashout-requests/mine"] });
      setShowCashoutForm(false);
      setCashoutCredits("");
    },
    onError: (e: any) => {
      toast({ title: "Cashout failed", description: e.message ?? "Try again later.", variant: "destructive" });
    },
  });

  function handleCashout() {
    const amount = parseInt(cashoutCredits, 10);
    if (!amount || amount <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    cashoutMutation.mutate({ credits: amount, payoutMethod, payoutDetails: payoutDetails || undefined });
  }

  const b = balance;

  return (
    <div className="min-h-screen bg-background text-foreground pb-28" data-testid="page-credits">
      {/* Header */}
      <div className="bg-black text-white px-4 pt-10 pb-5">
        <div className="max-w-lg mx-auto">
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-gray-400 hover:text-white text-sm mb-4 transition-colors"
            data-testid="btn-credits-back">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-2 mb-1">
            <Coins className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-bold">GUBER Credits</h1>
          </div>
          <p className="text-sm text-gray-400">Earn by contributing to the local community.</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-4">

        {/* Rate banner */}
        <div className="rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm font-medium"
          style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24" }}>
          <Info className="w-4 h-4 shrink-0" />
          <span>1,000 Credits = <strong>$1.00</strong> · Min cashout {b ? b.minCashout.toLocaleString() : "25,000"} credits (${b ? (b.minCashout / (b.creditsPerDollar || 1000)).toFixed(0) : "25"})</span>
        </div>

        {/* Balance cards */}
        {balanceLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : b ? (
          <div className="grid grid-cols-2 gap-3">
            <Card data-testid="card-credits-available">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Coins className="w-3.5 h-3.5 text-amber-400" /> Available
                </div>
                <div className="text-2xl font-black text-amber-400">{b.available.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-0.5">${b.dollarValue}</div>
              </CardContent>
            </Card>
            <Card data-testid="card-credits-pending">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Clock className="w-3.5 h-3.5 text-yellow-500" /> Pending
                </div>
                <div className="text-2xl font-black text-yellow-500">{b.pending.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-0.5">awaiting approval</div>
              </CardContent>
            </Card>
            <Card data-testid="card-credits-earned">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-green-400" /> Lifetime Earned
                </div>
                <div className="text-2xl font-black text-green-400">{b.earned.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card data-testid="card-credits-redeemed">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <ArrowDownToLine className="w-3.5 h-3.5 text-purple-400" /> Redeemed
                </div>
                <div className="text-2xl font-black text-purple-400">{b.redeemed.toLocaleString()}</div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Eligibility checklist */}
        {b && (
          <Card data-testid="card-cashout-eligibility">
            <CardContent className="p-4 space-y-2.5">
              <p className="text-sm font-semibold mb-1">Cashout Requirements</p>
              <CheckRow
                ok={b.idVerified}
                label="ID Verified"
                failAction={<Link href="/profile" className="text-xs text-blue-500 underline">Verify now</Link>}
              />
              <CheckRow
                ok={b.stripeReady}
                label="Payout account connected"
                sub={b.stripeAccountStatus ? `Status: ${b.stripeAccountStatus}` : undefined}
                failAction={<Link href="/profile" className="text-xs text-blue-500 underline">Set up payouts</Link>}
              />
              <CheckRow
                ok={b.available >= b.minCashout}
                label={`At least ${b.minCashout.toLocaleString()} credits available`}
                sub={b.available < b.minCashout ? `${(b.minCashout - b.available).toLocaleString()} more needed` : undefined}
              />
              <CheckRow
                ok={b.cashoutEnabled}
                label="Cashout is open"
                sub={!b.cashoutEnabled ? "Currently paused by admin" : undefined}
              />

              {b.eligibleForCashout && !showCashoutForm && (
                <Button
                  className="w-full mt-1"
                  onClick={() => setShowCashoutForm(true)}
                  data-testid="btn-cashout-open">
                  <ArrowDownToLine className="w-4 h-4 mr-2" /> Request Cashout
                </Button>
              )}

              {showCashoutForm && (
                <div className="space-y-3 pt-2 border-t mt-2">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Credits to cash out</label>
                    <Input
                      type="number"
                      placeholder={`min ${b.minCashout.toLocaleString()}`}
                      value={cashoutCredits}
                      onChange={e => setCashoutCredits(e.target.value)}
                      data-testid="input-cashout-credits"
                    />
                    {cashoutCredits && !isNaN(parseInt(cashoutCredits)) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        = ${(parseInt(cashoutCredits) / b.creditsPerDollar).toFixed(2)}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Payout method</label>
                    <Select value={payoutMethod} onValueChange={setPayoutMethod}>
                      <SelectTrigger data-testid="select-payout-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stripe">Stripe (connected account)</SelectItem>
                        <SelectItem value="cash_app">Cash App</SelectItem>
                        <SelectItem value="venmo">Venmo</SelectItem>
                        <SelectItem value="zelle">Zelle</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {payoutMethod !== "stripe" && (
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Your {payoutMethod} handle / details</label>
                      <Input
                        placeholder={payoutMethod === "cash_app" ? "$cashtag" : payoutMethod === "venmo" ? "@username" : "Details"}
                        value={payoutDetails}
                        onChange={e => setPayoutDetails(e.target.value)}
                        data-testid="input-payout-details"
                      />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={handleCashout}
                      disabled={cashoutMutation.isPending}
                      data-testid="btn-cashout-submit">
                      {cashoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowDownToLine className="w-4 h-4 mr-2" />}
                      Submit Request
                    </Button>
                    <Button variant="outline" onClick={() => setShowCashoutForm(false)} data-testid="btn-cashout-cancel">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Cashout request history */}
        {myCashouts.length > 0 && (
          <Card data-testid="card-cashout-history">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-semibold mb-1">Cashout Requests</p>
              {myCashouts.map(r => (
                <div key={r.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/20 last:border-0">
                  <div className="space-y-0.5">
                    <p className="font-medium">${r.dollar_amount} · {r.credits_requested.toLocaleString()} cr</p>
                    <p className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}{r.payout_method ? ` · ${r.payout_method}` : ""}</p>
                    {r.admin_note && <p className="text-muted-foreground italic">{r.admin_note}</p>}
                  </div>
                  <div className="ml-3 shrink-0">
                    {r.status === "pending" && <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-[10px]">pending · 1–3 days</Badge>}
                    {r.status === "approved" && <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">approved</Badge>}
                    {r.status === "paid" && <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px]">paid out</Badge>}
                    {r.status === "denied" && <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">denied</Badge>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Earn more */}
        <div className="rounded-xl p-4 space-y-2"
          style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)" }}>
          <p className="text-sm font-semibold text-amber-300">How to earn credits</p>
          <div className="grid grid-cols-1 gap-1.5 text-xs text-muted-foreground">
            <span>🗺️ Complete Map Missions — 25 to 500 cr each</span>
            <span>👤 Refer someone who signs up — 250 cr (pending until they verify)</span>
            <span>✅ Your referral verifies ID — 500 cr</span>
            <span>💼 Your referral completes first paid job — 1,500 cr</span>
            <span>👑 Day-1 OG members earn +25% on all map missions</span>
          </div>
          <Link href="/browse-jobs" className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium mt-1" data-testid="link-go-missions">
            Browse Opportunities <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        {/* Credit ledger */}
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-muted-foreground" /> Credit History
          </h2>

          {ledgerLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : ledger.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No credits yet — complete a Map Mission to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {ledger.map(row => {
                const meta = SOURCE_LABELS[row.source_type] ?? { label: row.source_type, emoji: "📋" };
                const isNeg = row.amount < 0;
                return (
                  <div key={row.id}
                    className="flex items-center gap-3 p-3 rounded-xl border bg-card"
                    data-testid={`row-ledger-${row.id}`}>
                    <div className="text-xl w-8 text-center">{meta.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{meta.label}</div>
                      {row.reason && <div className="text-xs text-muted-foreground truncate">{row.reason}</div>}
                      <div className="text-xs text-muted-foreground">
                        {new Date(row.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-sm font-bold ${isNeg ? "text-red-500" : "text-green-500"}`}>
                        {isNeg ? "" : "+"}{row.amount.toLocaleString()}
                      </span>
                      {statusBadge(row.status)}
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-2 pt-2">
                {ledgerPage > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setLedgerPage(p => p - 1)} data-testid="btn-ledger-prev">
                    ← Prev
                  </Button>
                )}
                {ledger.length === 20 && (
                  <Button variant="outline" size="sm" onClick={() => setLedgerPage(p => p + 1)} data-testid="btn-ledger-next">
                    Next →
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckRow({ ok, label, sub, failAction }: { ok: boolean; label: string; sub?: string; failAction?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      {ok
        ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
        : <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
      <div className="flex-1">
        <span className="text-sm">{label}</span>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        {!ok && failAction && <div className="mt-0.5">{failAction}</div>}
      </div>
    </div>
  );
}
