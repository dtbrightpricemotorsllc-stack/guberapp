import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import {
  Truck, ChevronRight, Plus, MapPin, Zap, Loader2,
  ShieldCheck, Package, Anchor, Caravan, Container, Bolt,
} from "lucide-react";

const TRANSPORT_TYPES = [
  { value: "all",       label: "All",       Icon: Truck },
  { value: "vehicle",   label: "Vehicle",   Icon: Truck },
  { value: "equipment", label: "Equipment", Icon: Package },
  { value: "boat",      label: "Boat",      Icon: Anchor },
  { value: "rv",        label: "RV",        Icon: Caravan },
  { value: "trailer",   label: "Trailer",   Icon: Container },
  { value: "hotshot",   label: "Hotshot",   Icon: Bolt },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  posted:         { label: "Open",           color: "text-cyan-400" },
  offer_received: { label: "Offer In",       color: "text-amber-400" },
  offer_accepted: { label: "Offer Accepted", color: "text-sky-400" },
  connected:      { label: "Connected",      color: "text-violet-400" },
};

const PROOF_LABEL: Record<string, string> = {
  title_in_hand:   "Title In Hand",
  bill_of_sale:    "Bill of Sale",
  auction_invoice: "Auction Invoice",
  dealer_owned:    "Dealer",
  lienholder:      "Lienholder",
  not_ready:       "Proof Pending",
};

export default function LoadBoard() {
  const [, navigate] = useLocation();
  const [typeFilter, setTypeFilter] = useState("all");

  const { data, isLoading } = useQuery<{ listings: any[] }>({
    queryKey: ["/api/load-board", typeFilter],
    queryFn: async () => {
      const url = typeFilter !== "all"
        ? `/api/load-board?transportType=${typeFilter}`
        : `/api/load-board`;
      const res = await fetch(url, { credentials: "include" });
      return res.json();
    },
  });

  const listings = data?.listings || [];

  return (
    <GuberLayout title="Load Board" showBack backHref="/dashboard">
      <div className="px-4 pb-32 pt-2">

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-display font-black text-foreground tracking-tight leading-none">
                Load Board
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Ship vehicles, equipment &amp; more via GUBER-vetted carriers
              </p>
            </div>
            <Link href="/load-board/post">
              <Button
                size="sm"
                className="shrink-0 rounded-xl font-display font-black text-xs tracking-wide h-9 px-4"
                style={{ background: "linear-gradient(135deg,#0891b2,#0e7490)" }}
                data-testid="button-post-load"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Post Load
              </Button>
            </Link>
          </div>
        </div>

        {/* Type filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide -mx-4 px-4" data-testid="filter-transport-type">
          {TRANSPORT_TYPES.map(t => {
            const sel = typeFilter === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTypeFilter(t.value)}
                className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-display font-bold transition-all"
                style={sel
                  ? { background: "linear-gradient(135deg,#0891b2,#0e7490)", color: "#fff" }
                  : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
                data-testid={`filter-type-${t.value}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Carrier CTA */}
        <div
          className="rounded-2xl p-3.5 mb-5 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-all"
          style={{
            background: "linear-gradient(135deg,rgba(8,145,178,0.18),rgba(14,116,144,0.1))",
            border: "1px solid rgba(6,182,212,0.25)",
            boxShadow: "0 0 20px rgba(6,182,212,0.06)",
          }}
          onClick={() => navigate("/carrier-profile")}
          data-testid="banner-carrier-signup"
        >
          <div className="p-2 rounded-xl shrink-0" style={{ background: "rgba(6,182,212,0.15)" }}>
            <Truck className="w-4 h-4 text-cyan-400" strokeWidth={1.8} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-display font-bold text-cyan-300 leading-tight">Are you a carrier?</p>
            <p className="text-[10px] text-cyan-400/50 mt-0.5">Set up your profile · submit offers · get paid</p>
          </div>
          <ChevronRight className="w-4 h-4 text-cyan-400/40 shrink-0" />
        </div>

        {/* Listings */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16">
            <Truck className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" strokeWidth={1.2} />
            <p className="text-sm font-display font-bold text-muted-foreground">No loads posted yet</p>
            <p className="text-xs text-muted-foreground/40 mt-1">Be the first — post a load above</p>
          </div>
        ) : (
          <div className="space-y-3" data-testid="list-load-board">
            {listings.map((l) => {
              const sc = STATUS_CONFIG[l.status];
              const title = l.year && l.make
                ? `${l.year} ${l.make}${l.model ? " " + l.model : ""}`.trim()
                : l.assetDescription || "Transport Load";
              return (
                <Link key={l.id} href={`/load-board/${l.id}`}>
                  <div
                    className="rounded-2xl p-4 cursor-pointer active:scale-[0.98] transition-all"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(6,182,212,0.12)",
                      boxShadow: "0 0 0 0 transparent",
                    }}
                    data-testid={`card-load-${l.id}`}
                  >
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span
                            className="text-[10px] font-display font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(6,182,212,0.12)", color: "#67e8f9" }}
                          >
                            {l.transportType}
                          </span>
                          {l.urgent && (
                            <span className="text-[10px] font-display font-black text-amber-400 flex items-center gap-0.5">
                              <Zap className="w-2.5 h-2.5" /> URGENT
                            </span>
                          )}
                          {l.addonFlags?.includes("premium_carrier_only") && (
                            <span className="text-[10px] font-display font-black text-violet-400 flex items-center gap-0.5">
                              <ShieldCheck className="w-2.5 h-2.5" /> VERIFIED ONLY
                            </span>
                          )}
                          {sc && (
                            <span className={`text-[10px] font-display font-bold ${sc.color}`}>
                              {sc.label}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-display font-bold text-foreground leading-tight">{title}</p>
                        {l.ownershipProofStatus && (
                          <span
                            className="inline-block text-[9px] font-display font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md mt-1"
                            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
                          >
                            {PROOF_LABEL[l.ownershipProofStatus] || l.ownershipProofStatus}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {l.postedPrice ? (
                          <p className="text-base font-display font-black text-cyan-300">
                            ${l.postedPrice.toLocaleString()}
                          </p>
                        ) : l.pricingMode === "open_to_offers" ? (
                          <p className="text-xs font-display font-bold text-amber-400/80">Open to offers</p>
                        ) : null}
                        {l.suggestedLow && l.suggestedHigh && (
                          <p className="text-[9px] text-muted-foreground/30 mt-0.5">
                            Est. ${l.suggestedLow}–${l.suggestedHigh}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Route row */}
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50 mb-2">
                      <MapPin className="w-3 h-3 shrink-0 text-cyan-500/60" />
                      <span className="font-display font-bold">{l.pickupCity}, {l.pickupState}</span>
                      <span className="text-muted-foreground/30 mx-0.5">→</span>
                      <span className="font-display font-bold">{l.deliveryCity}, {l.deliveryState}</span>
                      {l.estimatedMiles && (
                        <span className="ml-1 text-muted-foreground/30">· {l.estimatedMiles.toLocaleString()} mi</span>
                      )}
                    </div>

                    {/* Add-on chips */}
                    {l.addonFlags && l.addonFlags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {l.addonFlags.slice(0, 4).map((f: string) => (
                          <span
                            key={f}
                            className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-md"
                            style={{ background: "rgba(6,182,212,0.08)", color: "rgba(6,182,212,0.7)" }}
                          >
                            {f.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[9px] text-muted-foreground/30">
                        {l.poster?.guberId && (
                          <span className="font-display font-bold tracking-wide">{l.poster.guberId}</span>
                        )}
                        {l.poster?.rating > 0 && (
                          <span>⭐ {Number(l.poster.rating).toFixed(1)}</span>
                        )}
                      </div>
                      <span className="text-[9px] text-muted-foreground/30">
                        {new Date(l.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </GuberLayout>
  );
}
