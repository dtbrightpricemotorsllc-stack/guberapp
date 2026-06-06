import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ExternalPurchaseSheet } from "@/components/external-purchase-sheet";
import { MobileReturnBanner } from "@/components/mobile-return-banner";
import { isStoreBuild } from "@/lib/platform";
import { ShieldCheck, Loader2, Check, Sparkles, Lock } from "lucide-react";

interface FoundersStatus {
  enabled: boolean;
  founder: boolean;
  totalClaimed: number;
  capLimit: number;
  spotsRemaining: number;
  soldOut: boolean;
  currentPriceCents: number;
  founderPriceCents: number;
  standardPriceCents: number;
}

const fmtUsd = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

const PERKS = [
  "Lifetime founder pricing on every protection tier",
  "Discounted Witness Verified Pickup & Delivery add-ons",
  "Permanent Founding Member badge on your profile",
  "One-time enrollment — never billed again",
];

export default function FoundersClub() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: status, isLoading } = useQuery<FoundersStatus>({
    queryKey: ["/api/asset-protection/founders"],
    staleTime: 15_000,
  });

  // Refresh after a successful web/iOS checkout return.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("founders") === "success") {
      queryClient.invalidateQueries({ queryKey: ["/api/asset-protection/founders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Welcome to the Founders Club!", description: "Lifetime founder pricing is now active." });
      window.history.replaceState({}, "", "/founders");
    }
  }, [toast]);

  const startWebCheckout = async () => {
    try {
      const res = await apiRequest("POST", "/api/asset-protection/founders/checkout", {});
      const data = await res.json();
      if (!res.ok || !data?.checkoutUrl) {
        throw new Error(data?.message || "Could not start checkout");
      }
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      toast({ title: "Checkout failed", description: err?.message || "Please try again.", variant: "destructive" });
    }
  };

  const showReturnBanner =
    isStoreBuild && new URLSearchParams(window.location.search).get("founders") === "success";

  return (
    <GuberLayout>
      <MobileReturnBanner show={showReturnBanner} paramsToStrip={["founders"]} />

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Hero */}
        <div
          className="rounded-2xl p-6 text-center"
          style={{ background: "linear-gradient(135deg,rgba(16,185,129,0.12),rgba(13,148,136,0.06))", border: "1px solid rgba(16,185,129,0.25)" }}
        >
          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-3" style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-display font-black text-foreground" data-testid="text-founders-title">
            Asset Protection Founders Club
          </h1>
          <p className="text-xs text-muted-foreground/70 mt-2 leading-relaxed">
            Lock in lifetime founder pricing across the entire GUBER Verified Release System™.
            Limited capped membership — once the spots are gone, the price goes up for everyone else.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-10">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/50" />
            <span className="text-sm text-muted-foreground/50">Loading Founders Club…</span>
          </div>
        )}

        {!isLoading && status && !status.enabled && (
          <div
            className="rounded-2xl p-6 text-center space-y-2"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
            data-testid="state-founders-unavailable"
          >
            <Lock className="w-6 h-6 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-display font-bold text-foreground">Not available yet</p>
            <p className="text-xs text-muted-foreground/60">
              The Founders Club hasn't launched yet. Check back soon.
            </p>
            <Button variant="outline" className="mt-2" onClick={() => navigate("/load-board")} data-testid="button-back-loadboard">
              Back to Load Board
            </Button>
          </div>
        )}

        {!isLoading && status && status.enabled && (
          <>
            {/* Live counter + price */}
            <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(16,185,129,0.2)" }}>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-display font-bold">Founder price</p>
                  <p className="text-3xl font-display font-black text-emerald-400" data-testid="text-founder-price">
                    {fmtUsd(status.currentPriceCents)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                    one-time · rises to {fmtUsd(status.standardPriceCents)} after the cap
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-display font-bold">Spots left</p>
                  <p className="text-3xl font-display font-black text-foreground" data-testid="text-spots-remaining">
                    {status.spotsRemaining.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                    of {status.capLimit.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700"
                  style={{ width: `${Math.min(100, (status.totalClaimed / Math.max(1, status.capLimit)) * 100)}%` }}
                  data-testid="bar-claimed"
                />
              </div>
              <p className="text-[10px] text-muted-foreground/50 text-center">
                {status.totalClaimed.toLocaleString()} founding members enrolled so far
              </p>
            </div>

            {/* Perks */}
            <div className="rounded-2xl p-5 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-display font-bold">What you get</p>
              {PERKS.map((perk) => (
                <div key={perk} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground/85">{perk}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            {status.founder ? (
              <div
                className="rounded-2xl p-5 text-center space-y-1.5"
                style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)" }}
                data-testid="state-already-member"
              >
                <Sparkles className="w-6 h-6 mx-auto text-emerald-400" />
                <p className="text-sm font-display font-black text-emerald-400">You're a Founding Member</p>
                <p className="text-xs text-muted-foreground/60">Lifetime founder pricing is active on your account.</p>
              </div>
            ) : status.soldOut ? (
              <div
                className="rounded-2xl p-5 text-center space-y-1.5"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                data-testid="state-sold-out"
              >
                <p className="text-sm font-display font-black text-foreground">Founders Club is sold out</p>
                <p className="text-xs text-muted-foreground/60">
                  All founding spots have been claimed. Standard pricing now applies.
                </p>
              </div>
            ) : isStoreBuild ? (
              <ExternalPurchaseSheet product="asset_protection_founders">
                {({ onPress, loading }) => (
                  <Button
                    onClick={onPress}
                    disabled={loading}
                    className="w-full h-12 rounded-2xl font-display font-black bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500"
                    data-testid="button-enroll-founders"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1.5" />}
                    Become a Founding Member — {fmtUsd(status.currentPriceCents)}
                  </Button>
                )}
              </ExternalPurchaseSheet>
            ) : (
              <Button
                onClick={startWebCheckout}
                className="w-full h-12 rounded-2xl font-display font-black bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500"
                data-testid="button-enroll-founders"
              >
                <ShieldCheck className="w-4 h-4 mr-1.5" />
                Become a Founding Member — {fmtUsd(status.currentPriceCents)}
              </Button>
            )}

            <p className="text-[10px] text-muted-foreground/40 text-center leading-relaxed px-2">
              One-time enrollment via secure Stripe checkout. U.S. customers only. Founding Member status is lifetime and non-transferable.
            </p>
          </>
        )}
      </div>
    </GuberLayout>
  );
}
