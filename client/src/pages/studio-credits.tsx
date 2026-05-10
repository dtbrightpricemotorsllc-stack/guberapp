// GUBER Studio · Credits & Subscriptions (task-519, task-561)
// Lists the 6 credit packs and 3 subscription tiers.
// On iOS/Android store builds, purchase buttons go through the
// ExternalPurchaseSheet (Apple External Purchase Link) disclosure flow.

import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Loader2, ShoppingCart, Sparkles, ArrowLeft, Coins, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isStoreBuild } from "@/lib/platform";
import { ExternalPurchaseSheet } from "@/components/external-purchase-sheet";
import { MobileReturnBanner } from "@/components/mobile-return-banner";

type Pack = { id: string; credits: number; priceCents: number; label: string };
type Tier = {
  id: string;
  label: string;
  priceCents: number;
  monthlyCredits: number;
  description: string;
  features: string[];
};
type StudioMe = {
  credits: number;
  tier: string;
  subscription: { status: string; monthlyCredits: number; label: string | null; cancelAtPeriodEnd: boolean } | null;
};

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function perCreditDollars(priceCents: number, credits: number) {
  return `$${(priceCents / 100 / credits).toFixed(4)}`;
}

export default function StudioCreditsPage() {
  const { toast } = useToast();
  const searchStr = useSearch();
  const searchParams = new URLSearchParams(searchStr);
  const purchaseSuccess =
    searchParams.get("credits") === "success" ||
    searchParams.get("subscription") === "success";

  const meQuery = useQuery<StudioMe>({ queryKey: ["/api/studio/me"] });
  const packsQuery = useQuery<Pack[]>({ queryKey: ["/api/studio/packs"] });
  const tiersQuery = useQuery<Tier[]>({ queryKey: ["/api/studio/tiers"] });

  const buyPack = useMutation({
    mutationFn: async (packId: string) => {
      const res = await apiRequest("POST", "/api/stripe/studio-credits-checkout", { packId });
      return res.json();
    },
    onSuccess: (data: { checkoutUrl?: string }) => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    },
    onError: (err: any) => toast({ title: "Checkout failed", description: err.message, variant: "destructive" }),
  });

  const subscribe = useMutation({
    mutationFn: async (tier: string) => {
      const res = await apiRequest("POST", "/api/stripe/studio-subscription-checkout", { tier });
      return res.json();
    },
    onSuccess: (data: { checkoutUrl?: string }) => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    },
    onError: (err: any) => toast({ title: "Subscription failed", description: err.message, variant: "destructive" }),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/cancel-studio-subscription", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Subscription update", description: data.message || "Cancelled" });
      meQuery.refetch();
    },
    onError: (err: any) => toast({ title: "Cancel failed", description: err.message, variant: "destructive" }),
  });

  const me = meQuery.data;
  const packs = packsQuery.data ?? [];
  const tiers = tiersQuery.data ?? [];
  const loading = meQuery.isLoading || packsQuery.isLoading || tiersQuery.isLoading;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white px-4 sm:px-6 py-8">
      <MobileReturnBanner show={purchaseSuccess} paramsToStrip={["credits", "subscription"]} />
      <div className="max-w-5xl mx-auto">
        <Link href="/studio">
          <button className="text-white/70 text-sm flex items-center gap-1 mb-6" data-testid="link-back-studio">
            <ArrowLeft className="w-4 h-4" /> Back to Studio
          </button>
        </Link>

        <div className="flex items-end justify-between flex-wrap gap-3 mb-2">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Studio Credits</h1>
          {me && (
            <div className="flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3 py-1.5" data-testid="text-current-balance">
              <Coins className="w-4 h-4 text-amber-300" />
              <span className="text-sm font-bold tabular-nums">{me.credits}</span>
              <span className="text-xs text-white/60">credits</span>
            </div>
          )}
        </div>
        <p className="text-white/60 text-sm mb-2">
          Pick a pack for one-time credits, or subscribe for a monthly drop. Credits never expire.
        </p>
        {isStoreBuild && (
          <p className="text-xs text-amber-300/80 mb-6 flex items-center gap-1.5" data-testid="text-store-external-notice">
            <ExternalLink className="w-3 h-3 shrink-0" />
            Purchases open in Safari — your credits sync back to the app automatically.
          </p>
        )}
        {!isStoreBuild && <div className="mb-6" />}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-white/40" />
          </div>
        )}

        {!loading && (
          <>
            <h2 className="text-xs uppercase tracking-[0.25em] text-white/50 mb-3">Credit Packs</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-12">
              {packs.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-2 hover:bg-white/[0.06] transition"
                  data-testid={`card-pack-${p.id}`}
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300/80">{p.label}</p>
                  <p className="text-2xl font-black">{dollars(p.priceCents)}</p>
                  <p className="text-sm text-white/80">
                    <span className="font-bold tabular-nums">{p.credits.toLocaleString()}</span> credits
                  </p>
                  <p className="text-[10px] text-white/40">≈ {perCreditDollars(p.priceCents, p.credits)} / cr</p>
                  {isStoreBuild ? (
                    <ExternalPurchaseSheet product="studio_credits" options={{ packId: p.id }}>
                      {({ onPress, loading: btnLoading }) => (
                        <Button
                          size="sm"
                          className="mt-2"
                          disabled={btnLoading}
                          onClick={onPress}
                          data-testid={`button-buy-${p.id}`}
                        >
                          {btnLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ExternalLink className="w-4 h-4 mr-2" /> Buy</>}
                        </Button>
                      )}
                    </ExternalPurchaseSheet>
                  ) : (
                    <Button
                      size="sm"
                      className="mt-2"
                      disabled={buyPack.isPending}
                      onClick={() => buyPack.mutate(p.id)}
                      data-testid={`button-buy-${p.id}`}
                    >
                      {buyPack.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ShoppingCart className="w-4 h-4 mr-2" /> Buy</>}
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <h2 className="text-xs uppercase tracking-[0.25em] text-white/50 mb-3">Monthly Subscriptions</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {tiers.map((t) => {
                const isCurrent = me?.tier === t.id && !!me?.subscription;
                return (
                  <div
                    key={t.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-3"
                    data-testid={`card-tier-${t.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-base font-bold">{t.label}</p>
                      {isCurrent && <Badge variant="outline" className="text-[10px]">CURRENT</Badge>}
                    </div>
                    <p className="text-2xl font-black">
                      {dollars(t.priceCents)}
                      <span className="text-xs font-normal text-white/50"> / mo</span>
                    </p>
                    <p className="text-sm text-white/80">
                      <span className="font-bold tabular-nums">{t.monthlyCredits.toLocaleString()}</span> credits / month
                    </p>
                    <ul className="text-xs text-white/70 space-y-1 mt-1 flex-1">
                      {t.features.map((f) => (
                        <li key={f} className="flex gap-1.5">
                          <Sparkles className="w-3 h-3 mt-0.5 shrink-0 text-emerald-300/80" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    {isCurrent ? (
                      me?.subscription?.cancelAtPeriodEnd ? (
                        <Button size="sm" variant="outline" disabled data-testid={`button-cancelled-${t.id}`}>
                          Cancels at period end
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={cancel.isPending}
                          onClick={() => cancel.mutate()}
                          data-testid={`button-cancel-${t.id}`}
                        >
                          {cancel.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cancel"}
                        </Button>
                      )
                    ) : isStoreBuild ? (
                      <ExternalPurchaseSheet product="studio_subscription" options={{ tier: t.id }}>
                        {({ onPress, loading: btnLoading }) => (
                          <Button
                            size="sm"
                            disabled={btnLoading}
                            onClick={onPress}
                            data-testid={`button-subscribe-${t.id}`}
                          >
                            {btnLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ExternalLink className="w-4 h-4 mr-2" /> Subscribe</>}
                          </Button>
                        )}
                      </ExternalPurchaseSheet>
                    ) : (
                      <Button
                        size="sm"
                        disabled={subscribe.isPending}
                        onClick={() => subscribe.mutate(t.id)}
                        data-testid={`button-subscribe-${t.id}`}
                      >
                        {subscribe.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Subscribe"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
