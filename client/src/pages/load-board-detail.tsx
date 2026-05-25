import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Truck, MapPin, DollarSign, Loader2, ShieldCheck,
  ChevronRight, Zap, Lock, Check, X,
} from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  posted: "Open for Offers",
  offer_received: "Offer Received",
  offer_accepted: "Offer Accepted",
  connected: "Connected",
  cancelled: "Cancelled",
};

const ADDON_INFO: Record<string, { label: string; price: string; desc: string }> = {
  verified_filter:            { label: "Verified Carriers Only",       price: "$10", desc: "Restrict offers to credential-verified carriers" },
  urgent_boost:               { label: "Urgent Boost",                 price: "$10", desc: "Mark your listing urgent for priority placement" },
  pre_transport_verification: { label: "Pre-Transport Verification",   price: "$25", desc: "GUBER worker inspects vehicle before transport" },
  loading_witness:            { label: "Loading Witness",              price: "$25", desc: "GUBER worker witnesses and documents loading" },
  unloading_witness:          { label: "Unloading Witness",            price: "$25", desc: "GUBER worker witnesses and documents unloading" },
  load_assistance:            { label: "Load Assistance",              price: "$10", desc: "Help moving the vehicle onto the carrier" },
  premium_bundle:             { label: "Premium Bundle",               price: "$75", desc: "All 5 add-ons at a bundled price" },
};

const CONNECTION_TIERS = [
  { value: "standard", label: "Standard",  price: "$19", desc: "Shipper contact info + direct message" },
  { value: "verified", label: "Verified",  price: "$29", desc: "Above + carrier credentials revealed" },
  { value: "premium",  label: "Premium",   price: "$99", desc: "Full profile + phone + priority match" },
];

export default function LoadBoardDetail() {
  const [, params] = useRoute("/load-board/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const listingId = params?.id ? parseInt(params.id) : 0;

  const [offerAmount, setOfferAmount] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [counterAmount, setCounterAmount] = useState("");
  const [selectedTier, setSelectedTier] = useState("standard");
  const [showAddonMenu, setShowAddonMenu] = useState(false);

  const { data, isLoading, refetch } = useQuery<{
    listing: any;
    offers: any[];
    myOffer: any;
    isPoster: boolean;
    addons: any[];
  }>({
    queryKey: ["/api/load-board", listingId],
    queryFn: async () => {
      const res = await fetch(`/api/load-board/${listingId}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!listingId,
  });

  const offerMutation = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/load-board/${listingId}/offer`, d),
    onSuccess: () => {
      toast({ title: "Offer submitted!", description: "The shipper will be notified." });
      queryClient.invalidateQueries({ queryKey: ["/api/load-board", listingId] });
      setOfferAmount("");
      setOfferMessage("");
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  const respondMutation = useMutation({
    mutationFn: ({ offerId, action, counterAmount }: any) =>
      apiRequest("PATCH", `/api/load-board/offers/${offerId}`, { action, counterAmount }),
    onSuccess: () => {
      toast({ title: "Done" });
      queryClient.invalidateQueries({ queryKey: ["/api/load-board", listingId] });
      setCounterAmount("");
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  const connectMutation = useMutation({
    mutationFn: (tier: string) => apiRequest("POST", `/api/load-board/${listingId}/connect/checkout`, { tier }),
    onSuccess: async (res: any) => {
      const json = await res.json();
      if (json.checkoutUrl) window.location.href = json.checkoutUrl;
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  const addonMutation = useMutation({
    mutationFn: (addonType: string) => apiRequest("POST", `/api/load-board/${listingId}/addons/checkout`, { addonType }),
    onSuccess: async (res: any) => {
      const json = await res.json();
      if (json.checkoutUrl) window.location.href = json.checkoutUrl;
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/load-board/${listingId}`, { status: "cancelled" }),
    onSuccess: () => {
      toast({ title: "Listing cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/load-board", listingId] });
    },
  });

  if (isLoading) {
    return (
      <GuberLayout title="Load Detail" showBack backHref="/load-board">
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </GuberLayout>
    );
  }

  if (!data?.listing) {
    return (
      <GuberLayout title="Load Detail" showBack backHref="/load-board">
        <div className="px-4 py-20 text-center text-muted-foreground">Load not found</div>
      </GuberLayout>
    );
  }

  const { listing, offers, myOffer, isPoster, addons } = data;
  const isConnected = listing.status === "connected";
  const isOpen = ["posted", "offer_received"].includes(listing.status);
  const offerAccepted = listing.status === "offer_accepted";

  return (
    <GuberLayout title="Load Detail" showBack backHref="/load-board">
      <div className="px-4 pb-28 pt-2 space-y-4">

        {/* Header card */}
        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-xs font-display font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
                  {listing.transportType}
                </span>
                {listing.urgent && <span className="text-xs font-display font-black text-amber-400 flex items-center gap-0.5"><Zap className="w-3 h-3" /> URGENT</span>}
                <span className="text-xs font-display font-bold text-emerald-400">{STATUS_LABEL[listing.status] || listing.status}</span>
              </div>
              <p className="text-base font-display font-black text-foreground leading-tight">
                {listing.year && listing.make
                  ? `${listing.year} ${listing.make} ${listing.model || ""}`.trim()
                  : listing.assetDescription || "Transport Load"}
              </p>
              {listing.vin && <p className="text-[10px] text-muted-foreground/40 mt-0.5 font-mono">VIN: {listing.vin}</p>}
            </div>
            <div className="text-right shrink-0">
              {listing.postedPrice ? (
                <p className="text-xl font-display font-black text-emerald-400">${listing.postedPrice.toLocaleString()}</p>
              ) : (
                <p className="text-sm font-display font-bold text-amber-400/80">Open to Offers</p>
              )}
            </div>
          </div>

          {/* Route */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground/70 mb-3">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="font-display font-bold">{listing.pickupCity}, {listing.pickupState}</span>
            <span className="text-muted-foreground/30">→</span>
            <span className="font-display font-bold">{listing.deliveryCity}, {listing.deliveryState}</span>
            {listing.estimatedMiles && (
              <span className="text-muted-foreground/40 text-xs ml-1">({listing.estimatedMiles.toLocaleString()} mi)</span>
            )}
          </div>

          {/* Poster identity — masked */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-display font-black" style={{ background: "rgba(255,255,255,0.08)" }}>
              {listing.poster?.guberId?.slice(0, 2) || "G"}
            </div>
            <span className="font-display font-bold tracking-wide">{listing.poster?.guberId || "GUBER Member"}</span>
            {listing.poster?.rating > 0 && <span>⭐ {listing.poster.rating.toFixed(1)} ({listing.poster.reviewCount})</span>}
            {isConnected && listing.poster?.fullName && (
              <span className="text-foreground/80 font-bold">· {listing.poster.fullName}</span>
            )}
          </div>
        </div>

        {/* Conditions / details */}
        {(listing.vehicleCondition?.length || listing.trailerPreference) && (
          <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-xs font-display font-black text-muted-foreground/50 uppercase tracking-wider mb-3">Requirements</p>
            {listing.vehicleCondition?.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-muted-foreground/40 mb-1.5">Condition</p>
                <div className="flex flex-wrap gap-1.5">
                  {listing.vehicleCondition.map((c: string) => (
                    <span key={c} className="text-[10px] font-display font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                      {c.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {listing.trailerPreference && listing.trailerPreference !== "any" && (
              <div className="flex justify-between text-sm mt-2">
                <span className="text-muted-foreground/60">Trailer needed</span>
                <span className="font-display font-bold capitalize">{listing.trailerPreference.replace(/_/g, " ")}</span>
              </div>
            )}
            {listing.loadingMethod?.length > 0 && (
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground/60">Loading</span>
                <span className="font-display font-bold">{listing.loadingMethod.map((m: string) => m.replace(/_/g, " ")).join(", ")}</span>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {listing.notes && (
          <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-xs font-display font-black text-muted-foreground/50 uppercase tracking-wider mb-2">Notes</p>
            <p className="text-sm text-muted-foreground/80 leading-relaxed">{listing.notes}</p>
          </div>
        )}

        {/* ── POSTER VIEW ── */}
        {isPoster && (
          <>
            {/* Add-ons section */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                style={{ background: "rgba(255,255,255,0.04)" }}
                onClick={() => setShowAddonMenu(!showAddonMenu)}
                data-testid="button-toggle-addons"
              >
                <div>
                  <p className="text-sm font-display font-bold text-foreground">Add-On Services</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">Verification, witnesses, boost &amp; more</p>
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground/40 transition-transform ${showAddonMenu ? "rotate-90" : ""}`} />
              </button>
              {showAddonMenu && (
                <div className="divide-y divide-border/30">
                  {Object.entries(ADDON_INFO).map(([key, info]) => (
                    <div key={key} className="flex items-center justify-between px-4 py-3" style={{ background: "rgba(255,255,255,0.02)" }}>
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-display font-bold text-foreground">{info.label}</p>
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5">{info.desc}</p>
                      </div>
                      <Button
                        size="sm"
                        className="shrink-0 rounded-xl h-8 px-3 font-display font-black text-xs"
                        style={{ background: "rgba(22,163,74,0.15)", color: "#86efac" }}
                        onClick={() => addonMutation.mutate(key)}
                        disabled={addonMutation.isPending}
                        data-testid={`button-addon-${key}`}
                      >
                        {info.price}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Offers list */}
            {offers.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="px-4 py-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <p className="text-sm font-display font-bold text-foreground">Carrier Offers ({offers.length})</p>
                </div>
                <div className="divide-y divide-border/30">
                  {offers.map((o: any) => (
                    <div key={o.id} className="px-4 py-3" style={{ background: "rgba(255,255,255,0.02)" }} data-testid={`card-offer-${o.id}`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="text-base font-display font-black text-foreground">${o.offerAmount.toLocaleString()}</p>
                          <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                            Carrier ID #{o.carrierId} · Round {o.actionCount}/3
                          </p>
                          {o.status === "countered" && o.counterAmount && (
                            <p className="text-xs text-amber-400 font-bold mt-1">Your counter: ${o.counterAmount.toLocaleString()}</p>
                          )}
                        </div>
                        <span className={`text-xs font-display font-bold px-2 py-0.5 rounded-full ${
                          o.status === "pending" ? "text-emerald-400 bg-emerald-400/10" :
                          o.status === "countered" ? "text-amber-400 bg-amber-400/10" :
                          o.status === "accepted" ? "text-sky-400 bg-sky-400/10" :
                          "text-muted-foreground bg-muted/20"
                        }`}>
                          {o.status}
                        </span>
                      </div>
                      {o.message && <p className="text-xs text-muted-foreground/60 mb-2 italic">"{o.message}"</p>}

                      {o.status === "pending" && (
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            className="rounded-xl h-8 px-3 font-display font-black text-xs"
                            style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}
                            onClick={() => respondMutation.mutate({ offerId: o.id, action: "accept" })}
                            disabled={respondMutation.isPending}
                            data-testid={`button-accept-offer-${o.id}`}
                          >
                            <Check className="w-3 h-3 mr-1" /> Accept
                          </Button>
                          {o.actionCount < 3 && (
                            <div className="flex gap-1.5 items-center">
                              <Input
                                value={counterAmount}
                                onChange={e => setCounterAmount(e.target.value)}
                                placeholder="Counter $"
                                type="number"
                                className="h-8 w-24 rounded-xl bg-background/50 border-border/50 text-xs"
                                data-testid={`input-counter-${o.id}`}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-xl h-8 px-3 font-display font-black text-xs"
                                onClick={() => respondMutation.mutate({ offerId: o.id, action: "counter", counterAmount: parseFloat(counterAmount) })}
                                disabled={!counterAmount || respondMutation.isPending}
                                data-testid={`button-counter-offer-${o.id}`}
                              >
                                Counter
                              </Button>
                            </div>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl h-8 px-3 font-display font-black text-xs text-destructive border-destructive/30"
                            onClick={() => respondMutation.mutate({ offerId: o.id, action: "decline" })}
                            disabled={respondMutation.isPending}
                            data-testid={`button-decline-offer-${o.id}`}
                          >
                            <X className="w-3 h-3 mr-1" /> Decline
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cancel listing */}
            {["posted", "offer_received"].includes(listing.status) && (
              <button
                className="w-full text-xs text-destructive/60 font-display font-bold py-2"
                onClick={() => {
                  if (confirm("Cancel this listing?")) cancelMutation.mutate();
                }}
                disabled={cancelMutation.isPending}
                data-testid="button-cancel-listing"
              >
                Cancel Listing
              </button>
            )}
          </>
        )}

        {/* ── CARRIER VIEW ── */}
        {!isPoster && (
          <>
            {/* My existing offer */}
            {myOffer && (
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} data-testid="card-my-offer">
                <p className="text-xs font-display font-black text-muted-foreground/50 uppercase tracking-wider mb-3">Your Offer</p>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xl font-display font-black text-foreground">${myOffer.offerAmount.toLocaleString()}</p>
                  <span className={`text-xs font-display font-bold px-2 py-0.5 rounded-full ${
                    myOffer.status === "pending" ? "text-emerald-400 bg-emerald-400/10" :
                    myOffer.status === "countered" ? "text-amber-400 bg-amber-400/10" :
                    myOffer.status === "accepted" ? "text-sky-400 bg-sky-400/10" :
                    "text-muted-foreground bg-muted/20"
                  }`}>
                    {myOffer.status}
                  </span>
                </div>
                {myOffer.status === "countered" && myOffer.counterAmount && (
                  <div className="rounded-xl p-3 mb-3" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                    <p className="text-xs text-amber-400 font-bold mb-1">Shipper countered: ${myOffer.counterAmount.toLocaleString()}</p>
                    {myOffer.actionCount < 3 ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="rounded-xl h-8 px-3 font-display font-black text-xs"
                          style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}
                          onClick={() => respondMutation.mutate({ offerId: myOffer.id, action: "accept_counter" })}
                          disabled={respondMutation.isPending}
                          data-testid="button-accept-counter"
                        >
                          Accept ${myOffer.counterAmount.toLocaleString()}
                        </Button>
                        <div className="flex gap-1.5">
                          <Input
                            value={counterAmount}
                            onChange={e => setCounterAmount(e.target.value)}
                            placeholder="Counter $"
                            type="number"
                            className="h-8 w-24 rounded-xl bg-background/50 border-border/50 text-xs"
                            data-testid="input-counter-back"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl h-8 px-3 font-display font-black text-xs"
                            onClick={() => respondMutation.mutate({ offerId: myOffer.id, action: "counter_back", counterAmount: parseFloat(counterAmount) })}
                            disabled={!counterAmount || respondMutation.isPending}
                            data-testid="button-counter-back"
                          >
                            Counter
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground/50">Max rounds reached — accept or walk away</p>
                    )}
                  </div>
                )}
                {myOffer.status === "pending" && (
                  <button
                    className="text-xs text-destructive/60 font-display font-bold"
                    onClick={() => respondMutation.mutate({ offerId: myOffer.id, action: "withdraw" })}
                    disabled={respondMutation.isPending}
                    data-testid="button-withdraw-offer"
                  >
                    Withdraw offer
                  </button>
                )}
              </div>
            )}

            {/* Connection section (offer accepted) */}
            {offerAccepted && myOffer?.status === "accepted" && (
              <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg,rgba(14,165,233,0.1),rgba(59,130,246,0.05))", border: "1.5px solid rgba(59,130,246,0.25)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <Lock className="w-4 h-4 text-sky-400" />
                  <p className="text-sm font-display font-black text-sky-400">Your offer was accepted — Connect Now</p>
                </div>
                <p className="text-xs text-muted-foreground/60 mb-4">Pay the one-time connection fee to unlock the shipper's contact details and finalize the job.</p>
                <div className="space-y-2 mb-4">
                  {CONNECTION_TIERS.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setSelectedTier(t.value)}
                      className="w-full rounded-xl p-3 text-left transition-all"
                      style={selectedTier === t.value
                        ? { background: "rgba(14,165,233,0.15)", border: "1.5px solid rgba(14,165,233,0.4)" }
                        : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                      data-testid={`select-tier-${t.value}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-display font-bold text-foreground">{t.label}</p>
                          <p className="text-[10px] text-muted-foreground/50 mt-0.5">{t.desc}</p>
                        </div>
                        <p className="text-base font-display font-black text-sky-400 shrink-0">{t.price}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <Button
                  className="w-full rounded-2xl h-12 font-display font-black text-sm"
                  style={{ background: "linear-gradient(135deg,#0ea5e9,#2563eb)" }}
                  onClick={() => connectMutation.mutate(selectedTier)}
                  disabled={connectMutation.isPending}
                  data-testid="button-pay-connection-fee"
                >
                  {connectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Connect — ${CONNECTION_TIERS.find(t => t.value === selectedTier)?.price}`}
                </Button>
              </div>
            )}

            {/* Submit offer (open load) */}
            {isOpen && !myOffer && (
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-xs font-display font-black text-muted-foreground/50 uppercase tracking-wider mb-3">Submit Your Offer</p>
                {listing.suggestedLow && listing.suggestedHigh && (
                  <p className="text-[10px] text-muted-foreground/40 mb-3">
                    Market range: <span className="text-foreground/60 font-bold">${listing.suggestedLow.toLocaleString()} – ${listing.suggestedHigh.toLocaleString()}</span>
                  </p>
                )}
                <div className="mb-3">
                  <Label className="text-xs text-muted-foreground/60">Your Price ($)</Label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      value={offerAmount}
                      onChange={e => setOfferAmount(e.target.value)}
                      placeholder="0"
                      type="number"
                      className="rounded-xl h-12 bg-background/50 border-border/50 text-base pl-7"
                      data-testid="input-offer-amount"
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <Label className="text-xs text-muted-foreground/60">Message (optional)</Label>
                  <Textarea
                    value={offerMessage}
                    onChange={e => setOfferMessage(e.target.value)}
                    placeholder="Tell the shipper about your equipment and ETA..."
                    className="mt-1 rounded-xl bg-background/50 border-border/50 text-sm resize-none"
                    rows={2}
                    data-testid="input-offer-message"
                  />
                </div>
                <Button
                  className="w-full rounded-2xl h-12 font-display font-black text-sm tracking-wide"
                  style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}
                  onClick={() => offerMutation.mutate({ offerAmount: parseFloat(offerAmount), message: offerMessage || undefined })}
                  disabled={!offerAmount || offerMutation.isPending}
                  data-testid="button-submit-offer"
                >
                  {offerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Offer →"}
                </Button>
                <p className="text-[9px] text-muted-foreground/30 text-center mt-2">
                  Max 3 negotiation rounds · GUBER ID privacy until connected
                </p>
              </div>
            )}

            {/* Setup carrier profile prompt */}
            <div
              className="rounded-2xl p-3.5 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-all"
              style={{ background: "rgba(30,58,138,0.15)", border: "1px solid rgba(59,130,246,0.2)" }}
              onClick={() => navigate("/carrier-profile")}
              data-testid="banner-setup-profile"
            >
              <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-bold text-blue-300">Set up your carrier profile</p>
                <p className="text-[10px] text-blue-400/50 mt-0.5">Verified carriers get more offers &amp; faster connections</p>
              </div>
              <ChevronRight className="w-4 h-4 text-blue-400/30 shrink-0" />
            </div>
          </>
        )}

      </div>
    </GuberLayout>
  );
}
