import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import {
  Truck, ChevronRight, Plus, Filter, MapPin, DollarSign,
  Clock, ShieldCheck, Zap, Loader2,
} from "lucide-react";

const TRANSPORT_TYPES = [
  { value: "all", label: "All Types" },
  { value: "vehicle", label: "Vehicle" },
  { value: "equipment", label: "Equipment" },
  { value: "boat", label: "Boat" },
  { value: "rv", label: "RV" },
  { value: "trailer", label: "Trailer" },
  { value: "hotshot", label: "Hotshot" },
  { value: "other", label: "Other" },
];

const STATUS_COLOR: Record<string, string> = {
  posted: "text-emerald-400",
  offer_received: "text-amber-400",
  offer_accepted: "text-sky-400",
  connected: "text-violet-400",
};

const STATUS_LABEL: Record<string, string> = {
  posted: "Open",
  offer_received: "Offer In",
  offer_accepted: "Offer Accepted",
  connected: "Connected",
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
      <div className="px-4 pb-28 pt-2">

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-display font-black text-foreground tracking-tight leading-none">
                Load Board
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Ship vehicles, equipment &amp; more via trusted local carriers
              </p>
            </div>
            <Link href="/load-board/post">
              <Button
                size="sm"
                className="shrink-0 rounded-xl font-display font-black text-xs tracking-wide h-9 px-4"
                style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}
                data-testid="button-post-load"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Post Load
              </Button>
            </Link>
          </div>
        </div>

        {/* Type filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide -mx-4 px-4" data-testid="filter-transport-type">
          {TRANSPORT_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-display font-bold transition-all"
              style={typeFilter === t.value
                ? { background: "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff" }
                : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
              data-testid={`filter-type-${t.value}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Carrier CTA */}
        <div
          className="rounded-2xl p-3.5 mb-5 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-all"
          style={{ background: "linear-gradient(135deg,rgba(30,58,138,0.4),rgba(37,99,235,0.2))", border: "1px solid rgba(59,130,246,0.25)" }}
          onClick={() => navigate("/carrier-profile")}
          data-testid="banner-carrier-signup"
        >
          <div className="p-2 rounded-xl shrink-0" style={{ background: "rgba(59,130,246,0.2)" }}>
            <Truck className="w-4 h-4 text-blue-400" strokeWidth={1.8} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-display font-bold text-blue-300 leading-tight">Are you a carrier?</p>
            <p className="text-[10px] text-blue-400/60 mt-0.5">Set up your profile to submit offers on loads</p>
          </div>
          <ChevronRight className="w-4 h-4 text-blue-400/40 shrink-0" />
        </div>

        {/* Listings */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16">
            <Truck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" strokeWidth={1.2} />
            <p className="text-sm font-display font-bold text-muted-foreground">No loads posted yet</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Be the first — post a load above</p>
          </div>
        ) : (
          <div className="space-y-3" data-testid="list-load-board">
            {listings.map((l) => (
              <Link key={l.id} href={`/load-board/${l.id}`}>
                <div
                  className="rounded-2xl p-4 cursor-pointer active:scale-[0.98] transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  data-testid={`card-load-${l.id}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-display font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
                          {l.transportType}
                        </span>
                        {l.urgent && (
                          <span className="text-xs font-display font-black text-amber-400 flex items-center gap-0.5">
                            <Zap className="w-3 h-3" /> URGENT
                          </span>
                        )}
                        <span className={`text-xs font-display font-bold ${STATUS_COLOR[l.status] || "text-muted-foreground"}`}>
                          {STATUS_LABEL[l.status] || l.status}
                        </span>
                      </div>
                      <p className="text-sm font-display font-bold text-foreground mt-1.5 leading-tight">
                        {l.year && l.make ? `${l.year} ${l.make} ${l.model || ""}`.trim() : l.assetDescription || "Transport"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {l.postedPrice ? (
                        <p className="text-base font-display font-black text-emerald-400">${l.postedPrice.toLocaleString()}</p>
                      ) : l.pricingMode === "open_to_offers" ? (
                        <p className="text-xs font-display font-bold text-amber-400/80">Open to offers</p>
                      ) : null}
                      {(l.suggestedLow && l.suggestedHigh) && (
                        <p className="text-[9px] text-muted-foreground/40 mt-0.5">
                          Est. ${l.suggestedLow}–${l.suggestedHigh}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {l.pickupCity}, {l.pickupState} → {l.deliveryCity}, {l.deliveryState}
                    </span>
                    {l.estimatedMiles && (
                      <span className="flex items-center gap-1">
                        <Truck className="w-3 h-3" /> {l.estimatedMiles.toLocaleString()} mi
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-2.5">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
                      {l.poster?.guberId && (
                        <span className="font-display font-bold tracking-wide">{l.poster.guberId}</span>
                      )}
                      {l.poster?.rating > 0 && (
                        <span>⭐ {l.poster.rating.toFixed(1)}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground/40">
                      {new Date(l.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </GuberLayout>
  );
}
