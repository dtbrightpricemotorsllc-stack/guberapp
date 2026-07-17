import { useState, useEffect } from "react";
import { ensureBackgroundLocation } from "@/lib/background-location";
import type { ReactNode, CSSProperties } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { taskTrackingService } from "@/services/location/TaskTrackingService";
import { isIOS } from "@/lib/platform";
import {
  Truck, MapPin, Loader2, ShieldCheck,
  Zap, Lock, Check, X, ChevronRight, ShoppingCart, Info, Star, Pencil, Navigation,
} from "lucide-react";

// ── constants ──────────────────────────────────────────────────────────────────

const CYAN_ACTIVE = { background: "linear-gradient(135deg,#0891b2,#0e7490)", color: "#fff" };

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  posted:         { label: "Open for Offers",  color: "text-cyan-400" },
  offer_received: { label: "Offer Received",   color: "text-amber-400" },
  offer_accepted: { label: "Offer Accepted",   color: "text-sky-400" },
  connected:      { label: "Connected",         color: "text-violet-400" },
  cancelled:      { label: "Cancelled",         color: "text-muted-foreground" },
};

const PROOF_LABEL: Record<string, string> = {
  title_in_hand:   "Title In Hand",
  bill_of_sale:    "Bill of Sale",
  auction_invoice: "Auction Invoice",
  dealer_owned:    "Dealer Owned",
  lienholder:      "Lienholder",
  not_ready:       "Proof Pending",
};

// Add-on flags (attached to listing at creation — informational pricing hints)
const ADDON_PRICES: Record<string, { label: string; price: number; hint: string }> = {
  urgent_boost:         { label: "Urgent Boost",             price: 10,  hint: "Priority placement" },
  premium_carrier_only: { label: "Verified Carriers Only",   price: 10,  hint: "Credential-gated" },
  photo_proof:          { label: "Photo Proof at Pickup",    price: 25,  hint: "GUBER documents asset" },
  loading_help:         { label: "Loading Assistance",       price: 10,  hint: "GUBER helper assists with loading" },
  unloading_help:       { label: "Unloading Assistance",     price: 10,  hint: "GUBER helper assists with unloading" },
  vin_verification:     { label: "VIN Verification",         price: 15,  hint: "Confirms VIN matches vehicle" },
  gps_tracking:         { label: "GPS Tracking",             price: 15,  hint: "Real-time transport updates" },
};

// Field services (purchasable after posting via cart)
const FIELD_SERVICES: { key: string; label: string; price: number; desc: string }[] = [
  { key: "pre_transport_verification", label: "Pre-Transport Verification", price: 25, desc: "GUBER helper inspects vehicle before transport" },
  { key: "loading_witness",            label: "Loading Witness",            price: 25, desc: "GUBER witnesses and documents loading" },
  { key: "unloading_witness",          label: "Unloading Witness",          price: 25, desc: "GUBER witnesses and documents unloading" },
  { key: "premium_bundle",             label: "Premium Bundle (all 3)",     price: 65, desc: "All 3 GUBER field services at once" },
];

const CONNECTION_TIERS = [
  { value: "standard", label: "Standard", price: 19, desc: "Shipper contact info + direct message" },
  { value: "verified",  label: "Verified", price: 29, desc: "Above + carrier credentials revealed" },
  { value: "premium",   label: "Premium",  price: 99, desc: "Full profile + phone + priority match" },
];

const PLATFORM_FEE_RATE = 0.08; // 8%

// ── Demo mode data ─────────────────────────────────────────────────────────────

const DEMO_DETAIL_MAP: Record<number, { listing: any; offers: any[]; myOffer: any; isPoster: boolean; addons: any[]; protectedAsset: null }> = {
  9001: {
    listing: { id: 9001, transportType: "vehicle", year: 2023, make: "Porsche", model: "911 GT3", pickupCity: "Atlanta", pickupState: "GA", deliveryCity: "Miami", deliveryState: "FL", pickupAddress: null, deliveryAddress: null, postedPrice: 1800, ownershipProofStatus: "title_in_hand", status: "offer_received", urgent: true, addonFlags: ["urgent_boost", "photo_proof"], estimatedMiles: 662, trailerPreference: "enclosed", vehicleCondition: ["operable"], pickupFlexibility: "business_hours", notes: "Show car, low miles. Needs enclosed transport. Flexible pickup window.", poster: { guberId: "MIKE_R", rating: 4.9, reviewCount: 47, fullName: null }, vinVerified: false, freightTrailerType: null, activationFeePaid: false, connectedCarrierId: null },
    offers: [
      { id: 9901, carrierId: 1, offerAmount: 1620, status: "pending", actionCount: 1, counterAmount: null },
      { id: 9902, carrierId: 2, offerAmount: 1750, status: "pending", actionCount: 1, counterAmount: null },
    ],
    myOffer: null, isPoster: true, addons: [], protectedAsset: null,
  },
  9002: {
    listing: { id: 9002, transportType: "boat", assetDescription: "2020 Sea Ray 350SLX", pickupCity: "Dallas", pickupState: "TX", deliveryCity: "Houston", deliveryState: "TX", pickupAddress: null, deliveryAddress: null, postedPrice: 480, ownershipProofStatus: "bill_of_sale", status: "posted", urgent: false, addonFlags: [], estimatedMiles: 239, poster: { guberId: "COASTAL_J", rating: 4.7, reviewCount: 12, fullName: null }, freightTrailerType: null, activationFeePaid: false, connectedCarrierId: null },
    offers: [], myOffer: null, isPoster: false, addons: [], protectedAsset: null,
  },
  9003: {
    listing: { id: 9003, transportType: "rv", year: 2021, make: "Airstream", model: "Classic 33FB", pickupCity: "Nashville", pickupState: "TN", deliveryCity: "Orlando", deliveryState: "FL", pickupAddress: null, deliveryAddress: null, postedPrice: 650, ownershipProofStatus: "title_in_hand", status: "posted", urgent: false, addonFlags: ["gps_tracking"], estimatedMiles: 558, poster: { guberId: "TRAVEL_K", rating: 5.0, reviewCount: 8, fullName: null }, freightTrailerType: null, activationFeePaid: false, connectedCarrierId: null },
    offers: [], myOffer: null, isPoster: false, addons: [], protectedAsset: null,
  },
  9004: {
    listing: { id: 9004, transportType: "equipment", assetDescription: "John Deere 310L Backhoe", pickupCity: "Denver", pickupState: "CO", deliveryCity: "Phoenix", deliveryState: "AZ", pickupAddress: null, deliveryAddress: null, postedPrice: 1250, ownershipProofStatus: "dealer_owned", status: "posted", urgent: false, addonFlags: ["premium_carrier_only", "vin_verification"], estimatedMiles: 602, poster: { guberId: "EQUIP_PRO", rating: 4.8, reviewCount: 23, fullName: null }, freightTrailerType: null, activationFeePaid: false, connectedCarrierId: null },
    offers: [], myOffer: null, isPoster: false, addons: [], protectedAsset: null,
  },
  9005: {
    listing: { id: 9005, transportType: "freight", freightTrailerType: "dry_van", assetDescription: "Electronics — Dry Van", pickupCity: "Chicago", pickupState: "IL", deliveryCity: "Detroit", deliveryState: "MI", pickupAddress: null, deliveryAddress: null, postedPrice: 950, status: "posted", urgent: false, addonFlags: [], estimatedMiles: 281, weightLbs: 14000, palletCount: 18, dockPickup: true, dockDelivery: false, poster: { guberId: "FREIGHT_CO", rating: 4.6, reviewCount: 91, fullName: null }, activationFeePaid: false, connectedCarrierId: null },
    offers: [], myOffer: null, isPoster: false, addons: [], protectedAsset: null,
  },
};

// ── main ──────────────────────────────────────────────────────────────────────

export default function LoadBoardDetail() {
  const [, params]  = useRoute("/load-board/:id");
  const [, navigate] = useLocation();
  const { toast }   = useToast();
  const listingId   = params?.id ? parseInt(params.id) : 0;
  const isDemo = listingId >= 9000 || new URLSearchParams(window.location.search).has("demo");
  const demoToast = (msg: string) => toast({ title: "🎬 Demo Mode", description: msg });

  // Offer flow
  const [offerAmount,   setOfferAmount]   = useState("");
  const [counterAmount, setCounterAmount] = useState("");
  const [selectedTier,  setSelectedTier]  = useState("standard");

  // Carrier connection checkout
  const [showCheckout, setShowCheckout] = useState(false);

  // Poster accepts-offer checkout
  const [showPosterCheckout, setShowPosterCheckout] = useState(false);
  const [pendingOffer,       setPendingOffer]       = useState<any>(null);
  const [posterAddonCart,    setPosterAddonCart]    = useState<string[]>([]);

  // Field services cart (for poster standalone purchases)
  const [fieldCart, setFieldCart] = useState<string[]>([]);
  const [showFieldCart, setShowFieldCart] = useState(false);

  const { data: rawData, isLoading: rawLoading } = useQuery<{
    listing: any; offers: any[]; myOffer: any; isPoster: boolean; addons: any[]; protectedAsset: any | null;
  }>({
    queryKey: ["/api/load-board", listingId],
    queryFn: async () => {
      const res = await fetch(`/api/load-board/${listingId}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!listingId && !isDemo,
  });
  const data = isDemo ? (DEMO_DETAIL_MAP[listingId] ?? DEMO_DETAIL_MAP[9001]) : rawData;
  const isLoading = isDemo ? false : rawLoading;


  // ── Detect Stripe redirect back (accept offer or addon) ──
  const confirmAcceptMutation = useMutation({
    mutationFn: ({ sessionId, offerId }: { sessionId: string; offerId: string }) =>
      apiRequest("POST", `/api/load-board/${listingId}/confirm-accept`, { sessionId, offerId }),
    onSuccess: () => {
      toast({ title: "Offer accepted!", description: "The carrier will be notified to connect." });
      queryClient.invalidateQueries({ queryKey: ["/api/load-board", listingId] });
      window.history.replaceState({}, "", `/load-board/${listingId}`);
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Confirmation error", description: err.message }),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const acceptSession = params.get("accept_session");
    const offerId       = params.get("offer_id");
    if (acceptSession && offerId && listingId) {
      confirmAcceptMutation.mutate({ sessionId: acceptSession, offerId });
    }
    if (params.get("connect_success")) {
      toast({ title: "Connected!", description: "You can now view the shipper's contact info." });
      queryClient.invalidateQueries({ queryKey: ["/api/load-board", listingId] });
      window.history.replaceState({}, "", `/load-board/${listingId}`);
    }
    if (params.get("activated")) {
      toast({ title: "Load Activated! 🚛", description: "Carrier has been notified. Transport is confirmed." });
      queryClient.invalidateQueries({ queryKey: ["/api/load-board", listingId] });
      window.history.replaceState({}, "", `/load-board/${listingId}`);
    }
    if (params.get("addon_success")) {
      toast({ title: "Add-on confirmed!", description: "Your field service has been scheduled." });
      queryClient.invalidateQueries({ queryKey: ["/api/load-board", listingId] });
      window.history.replaceState({}, "", `/load-board/${listingId}`);
    }
  }, [listingId]);

  // Tracking state — mirrors the service singleton so the UI re-renders on change.
  const [isTracking, setIsTracking] = useState(() => taskTrackingService.isTracking());

  // Start / stop background GPS for the carrier during active Load Board transport.
  //
  // - iOS: uses @capacitor-community/background-geolocation so fixes continue
  //   when the app is backgrounded or the screen is locked.
  // - Android: fires the in-app background-location disclosure then relies on
  //   the foreground service notification for continued delivery.
  // - Web: standard foreground watch (no background needed).
  //
  // Tracking is gated on: status === "connected" AND user is the carrier.
  // It stops automatically when the server reports { active: false } (job ended /
  // cancelled) or when the component sees the status leave "connected".
  useEffect(() => {
    if (!data?.listing) return;
    const isCarrier = !data.isPoster;
    const shouldTrack = data.listing.status === "connected" && isCarrier;

    if (shouldTrack) {
      if (isIOS) {
        void taskTrackingService.startTask(listingId, "load_board");
      } else {
        void ensureBackgroundLocation("load_board").then(() =>
          taskTrackingService.startTask(listingId, "load_board")
        );
      }
    } else {
      // Status left "connected" (completed / cancelled) — stop immediately.
      if (taskTrackingService.getActiveJobId() === listingId) {
        void taskTrackingService.stopTask(listingId);
      }
    }

    // Keep UI in sync with service state.
    const tick = () => setIsTracking(taskTrackingService.isTracking());
    const interval = setInterval(tick, 2000);
    tick();
    return () => clearInterval(interval);
  }, [data?.listing?.status, data?.isPoster, listingId]);

  // ── Mutations ──
  const offerMutation = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/load-board/${listingId}/offer`, d),
    onSuccess: () => {
      toast({ title: "Offer submitted!", description: "The shipper will be notified." });
      queryClient.invalidateQueries({ queryKey: ["/api/load-board", listingId] });
      setOfferAmount("");
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

  const acceptOfferCheckoutMutation = useMutation({
    mutationFn: async (d: { offerId: number; addonTypes: string[] }) => {
      const res = await apiRequest("POST", `/api/load-board/${listingId}/accept-offer-checkout`, d);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
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

  const activateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/load-board/${listingId}/activate/checkout`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  const fieldCartCheckoutMutation = useMutation({
    mutationFn: async (addonTypes: string[]) => {
      const res = await apiRequest("POST", `/api/load-board/${listingId}/addons/checkout`, { addonTypes });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
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

  // ── Loading / not found ──
  if (isLoading) {
    return (
      <GuberLayout title="Load Detail" showBack backHref="/load-board">
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
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
  const sc           = STATUS_CONFIG[listing.status];
  const isConnected  = listing.status === "connected";
  const isOpen       = ["posted", "offer_received"].includes(listing.status);
  const offerAccepted = listing.status === "offer_accepted";

  const assetTitle = listing.year && listing.make
    ? `${listing.year} ${listing.make}${listing.model ? " " + listing.model : ""}`.trim()
    : listing.assetDescription || "Transport Load";

  const paidAddonKeys = (addons || []).map((a: any) => a.addonType);

  // ── Poster checkout panel (accept-offer flow) ──────────────────────────────

  if (showPosterCheckout && pendingOffer) {
    const offerAmt       = pendingOffer.offerAmount;
    const platformFee    = Math.max(5, Math.round(offerAmt * PLATFORM_FEE_RATE * 100) / 100);
    const addonSubtotal  = posterAddonCart.reduce((sum, k) => {
      const a = ADDON_PRICES[k];
      return sum + (a?.price || 0);
    }, 0);
    const grandTotal = platformFee + addonSubtotal;

    return (
      <GuberLayout title="Checkout Review" showBack backHref={`/load-board/${listingId}`}>
        <div className="px-4 pb-32 pt-4 space-y-5">

          {/* No surprise charges notice */}
          <div className="rounded-xl p-3 flex items-start gap-2.5" style={{ background: "rgba(6,182,212,0.07)", border: "1px solid rgba(6,182,212,0.15)" }}>
            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-cyan-400/70 leading-relaxed">
              <strong>No hidden charges.</strong> Review everything below before paying. Nothing is charged until you tap "Confirm & Pay."
            </p>
          </div>

          {/* Order summary */}
          <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg,rgba(8,145,178,0.12),rgba(14,116,144,0.06))", border: "1px solid rgba(6,182,212,0.25)" }}>
            <p className="text-xs font-display font-black text-cyan-400/70 uppercase tracking-wider mb-3">Order Summary</p>
            <div className="space-y-2.5">
              <Row label={`Transport price (carrier offer)`} value={`$${offerAmt.toLocaleString()}`} muted />
              <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
              <Row label={`GUBER Platform Fee (${(PLATFORM_FEE_RATE * 100).toFixed(0)}%, min $5.00)`} value={`$${platformFee.toFixed(2)}`} />
              {posterAddonCart.map(k => {
                const a = ADDON_PRICES[k];
                return a ? <Row key={k} label={a.label} value={`$${a.price.toFixed(2)}`} /> : null;
              })}
              <div className="h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
              <div className="flex justify-between items-center">
                <span className="text-base font-display font-black text-foreground">Total Due Today</span>
                <span className="text-xl font-display font-black text-cyan-300">${grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Optional add-ons cart */}
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(0,229,118,0.55)" }}>
            <div className="px-4 py-3" style={{ background: "rgba(255,255,255,0.04)" }}>
              <p className="text-sm font-display font-bold text-foreground">Add-ons (optional)</p>
              <p className="text-[9px] text-muted-foreground/40 mt-0.5">These activate when this load goes live — price added to total</p>
            </div>
            {Object.entries(ADDON_PRICES).map(([key, info]) => {
              const selected = posterAddonCart.includes(key);
              return (
                <div key={key} className="flex items-center justify-between px-4 py-2.5" style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(0,229,118,0.40)" }}>
                  <div>
                    <p className="text-xs font-display font-bold text-foreground">{info.label}</p>
                    <p className="text-[9px] text-muted-foreground/40">{info.hint}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPosterAddonCart(prev => selected ? prev.filter(k => k !== key) : [...prev, key])}
                    className="shrink-0 text-[10px] font-display font-black px-2.5 py-1.5 rounded-lg ml-3 transition-all"
                    style={selected ? CYAN_ACTIVE : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
                    data-testid={`addon-toggle-${key}`}
                  >
                    {selected ? <><Check className="w-3 h-3 inline mr-0.5" />${info.price}</> : `+$${info.price}`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* What unlocks */}
          <div className="rounded-2xl p-4 space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,118,0.55)" }}>
            <p className="text-xs font-display font-black text-muted-foreground/50 uppercase tracking-wider mb-2">What happens after payment</p>
            <FeatureRow text="Offer is officially accepted — carrier notified" />
            <FeatureRow text="Carrier can now pay to unlock your contact details" />
            <FeatureRow text="Load status moves to Offer Accepted" />
            <FeatureRow text="Platform fee covers GUBER dispute protection" />
          </div>

          {/* Refund note */}
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,229,118,0.55)" }}>
            <p className="text-[9px] text-muted-foreground/40 leading-relaxed">
              🔒 Payment via Stripe. Platform fee is non-refundable once the carrier views your contact info.
              If the carrier does not connect within 7 days, you may request a credit. Add-on charges are processed separately.
            </p>
          </div>

          <Button
            className="w-full rounded-2xl h-12 font-display font-black text-sm tracking-wide"
            style={CYAN_ACTIVE}
            onClick={() => isDemo ? demoToast("Payment processed — offer accepted, carrier receives funds via Stripe.") : acceptOfferCheckoutMutation.mutate({ offerId: pendingOffer.id, addonTypes: posterAddonCart })}
            disabled={!isDemo && acceptOfferCheckoutMutation.isPending}
            data-testid="button-confirm-pay-accept"
          >
            {acceptOfferCheckoutMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : `Confirm & Pay $${grandTotal.toFixed(2)}`
            }
          </Button>
          <button
            className="w-full text-xs text-muted-foreground/40 font-display font-bold"
            onClick={() => { setShowPosterCheckout(false); setPendingOffer(null); setPosterAddonCart([]); }}
          >
            ← Back to load
          </button>
        </div>
      </GuberLayout>
    );
  }

  // ── Carrier connection checkout panel ──────────────────────────────────────

  if (showCheckout && !isPoster) {
    const tier = CONNECTION_TIERS.find(t => t.value === selectedTier)!;
    return (
      <GuberLayout title="Checkout Review" showBack backHref={`/load-board/${listingId}`}>
        <div className="px-4 pb-32 pt-4 space-y-5">

          <div className="rounded-xl p-3 flex items-start gap-2.5" style={{ background: "rgba(6,182,212,0.07)", border: "1px solid rgba(6,182,212,0.15)" }}>
            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-cyan-400/70 leading-relaxed">
              <strong>No hidden charges.</strong> Nothing is charged until you tap "Confirm & Pay."
            </p>
          </div>

          <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg,rgba(8,145,178,0.12),rgba(14,116,144,0.06))", border: "1px solid rgba(6,182,212,0.25)" }}>
            <p className="text-xs font-display font-black text-cyan-400/70 uppercase tracking-wider mb-3">Order Summary</p>
            <div className="space-y-2.5">
              <Row label={`Connection Fee — ${tier.label}`} value={`$${tier.price}.00`} />
              <Row label="Platform Fee" value="Included" muted />
              <div className="h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
              <div className="flex justify-between items-center">
                <span className="text-base font-display font-black text-foreground">Total Due Today</span>
                <span className="text-xl font-display font-black text-cyan-300">${tier.price}.00</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-4 space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,118,0.55)" }}>
            <p className="text-xs font-display font-black text-muted-foreground/50 uppercase tracking-wider mb-2">What unlocks immediately</p>
            <FeatureRow text="Shipper's full name" />
            <FeatureRow text="Direct contact details (phone / email)" />
            <FeatureRow text="Exact pickup & delivery address" />
            {tier.value !== "standard" && <FeatureRow text="Your carrier credentials revealed to shipper" />}
            {tier.value === "premium"   && <FeatureRow text="Priority match — top of shipper inbox" />}
          </div>

          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,229,118,0.55)" }}>
            <p className="text-[9px] text-muted-foreground/40 leading-relaxed">
              🔒 Payment via Stripe. Shipper address and contact info are revealed immediately after successful payment.
              GUBER does not store payment card details. Connection fee is non-refundable once contact info is revealed.
            </p>
          </div>

          <Button
            className="w-full rounded-2xl h-12 font-display font-black text-sm tracking-wide"
            style={CYAN_ACTIVE}
            onClick={() => isDemo ? demoToast("Connected! Shipper's full address and contact info would be revealed now.") : connectMutation.mutate(selectedTier)}
            disabled={!isDemo && connectMutation.isPending}
            data-testid="button-pay-connect"
          >
            {connectMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : `Confirm & Pay $${tier.price} · Connect`
            }
          </Button>
          <button className="w-full text-xs text-muted-foreground/40 font-display font-bold" onClick={() => setShowCheckout(false)}>
            ← Back to load
          </button>
        </div>
      </GuberLayout>
    );
  }

  // ── Field services cart review ─────────────────────────────────────────────

  if (showFieldCart && fieldCart.length > 0) {
    const cartTotal = fieldCart.reduce((sum, k) => {
      const s = FIELD_SERVICES.find(f => f.key === k);
      return sum + (s?.price || 0);
    }, 0);

    return (
      <GuberLayout title="Cart Review" showBack backHref={`/load-board/${listingId}`}>
        <div className="px-4 pb-32 pt-4 space-y-5">

          <div className="rounded-xl p-3 flex items-start gap-2.5" style={{ background: "rgba(6,182,212,0.07)", border: "1px solid rgba(6,182,212,0.15)" }}>
            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-cyan-400/70 leading-relaxed">
              <strong>Review your cart.</strong> Nothing is charged until you tap "Confirm & Pay."
            </p>
          </div>

          <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg,rgba(8,145,178,0.12),rgba(14,116,144,0.06))", border: "1px solid rgba(6,182,212,0.25)" }}>
            <p className="text-xs font-display font-black text-cyan-400/70 uppercase tracking-wider mb-3">Field Services Cart</p>
            <div className="space-y-2.5">
              {fieldCart.map(k => {
                const s = FIELD_SERVICES.find(f => f.key === k);
                if (!s) return null;
                return (
                  <div key={k} className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-display font-bold text-foreground">{s.label}</p>
                      <p className="text-[9px] text-muted-foreground/40">{s.desc}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-display font-black text-cyan-300">${s.price}</span>
                      <button
                        onClick={() => setFieldCart(prev => prev.filter(x => x !== k))}
                        className="text-muted-foreground/30 hover:text-muted-foreground/60"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
              <div className="flex justify-between items-center">
                <span className="text-base font-display font-black text-foreground">Total Due Today</span>
                <span className="text-xl font-display font-black text-cyan-300">${cartTotal}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-4 space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,118,0.55)" }}>
            <p className="text-xs font-display font-black text-muted-foreground/50 uppercase tracking-wider mb-2">What you get</p>
            {fieldCart.map(k => {
              const s = FIELD_SERVICES.find(f => f.key === k);
              return s ? <FeatureRow key={k} text={`${s.label} — ${s.desc}`} /> : null;
            })}
          </div>

          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,229,118,0.55)" }}>
            <p className="text-[9px] text-muted-foreground/40 leading-relaxed">
              🔒 GUBER field service workers are dispatched after payment. Services are non-refundable once dispatched.
              If GUBER cannot fulfill the service, a full refund is issued automatically.
            </p>
          </div>

          <Button
            className="w-full rounded-2xl h-12 font-display font-black text-sm tracking-wide"
            style={CYAN_ACTIVE}
            onClick={() => isDemo ? demoToast("GUBER field workers dispatched — they'll meet the carrier at pickup.") : fieldCartCheckoutMutation.mutate(fieldCart)}
            disabled={!isDemo && fieldCartCheckoutMutation.isPending}
            data-testid="button-pay-field-cart"
          >
            {fieldCartCheckoutMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : `Confirm & Pay $${cartTotal}`
            }
          </Button>
          <button className="w-full text-xs text-muted-foreground/40 font-display font-bold" onClick={() => setShowFieldCart(false)}>
            ← Back to load
          </button>
        </div>
      </GuberLayout>
    );
  }

  // ── Main detail view ───────────────────────────────────────────────────────

  return (
    <GuberLayout title="Load Detail" showBack backHref={isDemo ? "/load-board?demo=1" : "/load-board"}>
      <div className="px-4 pb-40 pt-2 space-y-4">

        {/* ── Demo mode banner ── */}
        {isDemo && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-display font-black"
            style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", color: "#fbbf24" }}>
            🎬 DEMO MODE — Buttons show how the flow works
          </div>
        )}

        {/* ── Header card ── */}
        <div
          className="rounded-2xl p-4"
          style={{
            background: "linear-gradient(135deg,rgba(8,145,178,0.1),rgba(14,116,144,0.05))",
            border: "1px solid rgba(6,182,212,0.2)",
            boxShadow: "0 0 24px rgba(6,182,212,0.06)",
          }}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-[10px] font-display font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(6,182,212,0.12)", color: "#67e8f9" }}>
                  {listing.transportType}
                </span>
                {listing.urgent && (
                  <span className="text-[10px] font-display font-black text-amber-400 flex items-center gap-0.5">
                    <Zap className="w-2.5 h-2.5" /> URGENT
                  </span>
                )}
                {sc && <span className={`text-[10px] font-display font-bold ${sc.color}`}>{sc.label}</span>}
              </div>
              <p className="text-base font-display font-black text-foreground leading-tight">{assetTitle}</p>
              {listing.assetDescription && listing.assetDescription !== assetTitle && (
                <p className="text-xs text-muted-foreground/60 mt-0.5 leading-snug">{listing.assetDescription}</p>
              )}
              {listing.vinVerified && listing.vin && (
                <p className="text-[9px] text-cyan-400/60 mt-0.5 font-mono flex items-center gap-1">
                  <Check className="w-2.5 h-2.5" /> VIN verified: {listing.vin}
                </p>
              )}
              {listing.ownershipProofStatus && (
                <span className="inline-block text-[9px] font-display font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md mt-1.5"
                  style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                  {PROOF_LABEL[listing.ownershipProofStatus] || listing.ownershipProofStatus}
                </span>
              )}
            </div>
            <div className="text-right shrink-0">
              {listing.postedPrice ? (
                <p className="text-xl font-display font-black text-cyan-300">${listing.postedPrice.toLocaleString()}</p>
              ) : (
                <p className="text-sm font-display font-bold text-amber-400/80">Open to Offers</p>
              )}
              {listing.suggestedLow && listing.suggestedHigh && !listing.postedPrice && (
                <p className="text-[9px] text-muted-foreground/30 mt-0.5">Est. ${listing.suggestedLow}–${listing.suggestedHigh}</p>
              )}
            </div>
          </div>

          {/* Route */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 mb-2 flex-wrap">
            <MapPin className="w-3 h-3 shrink-0 text-cyan-500/50" />
            <span className="font-display font-bold">{listing.pickupCity}, {listing.pickupState}</span>
            <span className="text-muted-foreground/30 mx-0.5">→</span>
            <span className="font-display font-bold">{listing.deliveryCity}, {listing.deliveryState}</span>
            {listing.estimatedMiles && (
              <span className="text-muted-foreground/30 text-[10px] ml-1">({listing.estimatedMiles.toLocaleString()} mi)</span>
            )}
            {listing.pickupCity && listing.deliveryCity && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${listing.pickupCity}, ${listing.pickupState}`)}&destination=${encodeURIComponent(`${listing.deliveryCity}, ${listing.deliveryState}`)}&travelmode=driving`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-[10px] font-display font-black shrink-0 px-2 py-0.5 rounded-full"
                style={{ background: "rgba(0,229,118,0.12)", color: "#00e576" }}
                data-testid="link-route-map"
              >
                View Route ↗
              </a>
            )}
          </div>

          {/* Poster identity */}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-display font-black"
              style={{ background: "rgba(6,182,212,0.12)", color: "#67e8f9" }}>
              {listing.poster?.guberId?.slice(0, 2) || "G"}
            </div>
            <span className="font-display font-bold tracking-wide">{listing.poster?.guberId || "GUBER Member"}</span>
            {listing.poster?.rating > 0 && <span>⭐ {Number(listing.poster.rating).toFixed(1)} ({listing.poster.reviewCount})</span>}
            {isConnected && listing.poster?.fullName && (
              <span className="text-foreground/80 font-bold">· {listing.poster.fullName}</span>
            )}
          </div>
        </div>

        {/* ── Shipper notes ── */}
        {listing.notes && (
          <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,118,0.55)" }}>
            <Info className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-display font-black text-muted-foreground/40 uppercase tracking-wider mb-1">Shipper Notes</p>
              <p className="text-xs text-foreground/70 leading-relaxed">{listing.notes}</p>
            </div>
          </div>
        )}

        {/* ── Asset requirements ── */}
        {(listing.vehicleCondition?.length || listing.trailerPreference || listing.weightRange ||
          listing.loadingMethod?.length || listing.pickupAccess?.length) && (
          <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,118,0.55)" }}>
            <p className="text-[10px] font-display font-black text-muted-foreground/40 uppercase tracking-wider mb-3">Requirements</p>
            {listing.vehicleCondition?.length > 0 && (
              <div className="mb-2.5">
                <p className="text-[9px] text-muted-foreground/30 mb-1.5">Condition</p>
                <div className="flex flex-wrap gap-1.5">
                  {listing.vehicleCondition.map((c: string) => <ChipBadge key={c}>{c.replace(/_/g, " ")}</ChipBadge>)}
                </div>
              </div>
            )}
            {listing.weightRange && <DetailRow label="Weight" value={listing.weightRange.replace(/_/g, " ")} />}
            {listing.trailerPreference && listing.trailerPreference !== "any" && (
              <DetailRow label="Trailer" value={listing.trailerPreference.replace(/_/g, " ")} />
            )}
            {listing.loadingMethod?.length > 0 && (
              <DetailRow label="Loading" value={listing.loadingMethod.map((m: string) => m.replace(/_/g, " ")).join(", ")} />
            )}
            {listing.unloadingMethod?.length > 0 && (
              <DetailRow label="Unloading" value={listing.unloadingMethod.map((m: string) => m.replace(/_/g, " ")).join(", ")} />
            )}
            {listing.loadingAssistAvailable && <DetailRow label="Loading assist" value={listing.loadingAssistAvailable} />}
            {listing.pickupFlexibility && <DetailRow label="Pickup window" value={listing.pickupFlexibility.replace(/_/g, " ")} />}
            {listing.dockAvailable && <DetailRow label="Dock available" value={listing.dockAvailable} />}
            {listing.pickupAccess?.length > 0 && (
              <div className="mt-2">
                <p className="text-[9px] text-muted-foreground/30 mb-1.5">Pickup site</p>
                <div className="flex flex-wrap gap-1.5">
                  {listing.pickupAccess.map((a: string) => <ChipBadge key={a}>{a.replace(/_/g, " ")}</ChipBadge>)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Non-freight transport details (vehicle / boat / rv / equipment) ── */}
        {!listing.freightTrailerType && (listing.vehicleType || listing.boatType || listing.rvClass ||
          listing.equipmentType || listing.carrierType || listing.vehicleCount ||
          listing.pickupDate || listing.deliveryDate || listing.weightLbs ||
          listing.weatherSensitive || listing.sideLoadRequired) && (
          <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-[10px] font-display font-black text-muted-foreground/40 uppercase tracking-wider mb-3">Transport Details</p>
            {listing.vehicleType && <DetailRow label="Vehicle Type" value={listing.vehicleType.replace(/_/g, " ")} />}
            {listing.boatType && <DetailRow label="Boat Type" value={listing.boatType.replace(/_/g, " ")} />}
            {listing.rvClass && <DetailRow label="RV Class" value={listing.rvClass.replace(/_/g, " ")} />}
            {listing.equipmentType && <DetailRow label="Equipment Type" value={listing.equipmentType.replace(/_/g, " ")} />}
            {listing.carrierType && <DetailRow label="Carrier Type" value={listing.carrierType === "open" ? "Open Carrier" : "Enclosed Carrier"} />}
            {listing.vehicleCount && <DetailRow label="Vehicle Count" value={String(listing.vehicleCount)} />}
            {listing.weightLbs && <DetailRow label="Weight" value={`${listing.weightLbs.toLocaleString()} lbs`} />}
            {listing.pickupDate && <DetailRow label="Pickup Date" value={listing.pickupDate} />}
            {listing.deliveryDate && <DetailRow label="Delivery Date" value={listing.deliveryDate} />}
            {listing.weatherSensitive && <DetailRow label="Weather Sensitive" value="⚠️ Yes — enclosed or covered transport required" />}
            {listing.sideLoadRequired && <DetailRow label="Side Load" value="⚠️ Required" />}
          </div>
        )}

        {/* ── VRS Asset Custody Banner ── */}
        {data.protectedAsset && (
          <Link href={`/custody/asset/${data.protectedAsset.id}`}>
            <a
              className="flex items-center justify-between gap-3 rounded-2xl p-4 hover-elevate"
              style={{ background: "linear-gradient(135deg,rgba(16,185,129,0.14),rgba(5,150,105,0.07))", border: "1.5px solid rgba(16,185,129,0.45)" }}
              data-testid="card-vrs-custody-link"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(16,185,129,0.18)" }}>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-display font-black text-emerald-400">Asset Custody Active</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5 leading-relaxed">
                    GUBER Verified Release System™ · Tap to open the custody dashboard
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-emerald-400/60 shrink-0" />
            </a>
          </Link>
        )}

        {/* ── Active add-on flags ── */}
        {listing.addonFlags && listing.addonFlags.length > 0 && (
          <div className="rounded-2xl p-3.5" style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.12)" }}>
            <p className="text-[10px] font-display font-black text-cyan-400/60 uppercase tracking-wider mb-2.5">Load Add-ons</p>
            <div className="flex flex-wrap gap-1.5">
              {listing.addonFlags.map((f: string) => {
                const info = ADDON_PRICES[f];
                return (
                  <div key={f} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-display font-bold"
                    style={{ background: "rgba(6,182,212,0.12)", color: "#67e8f9" }}>
                    {info?.label || f.replace(/_/g, " ")}
                    {info?.price > 0 && <span className="text-cyan-400/50">(${info.price})</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Address lock notice ── */}
        {!isConnected && (
          <div className="rounded-2xl p-3.5 flex items-center gap-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,229,118,0.55)" }}>
            <Lock className="w-4 h-4 text-muted-foreground/30 shrink-0" />
            <div>
              <p className="text-xs font-display font-bold text-muted-foreground/50">Exact address hidden</p>
              <p className="text-[9px] text-muted-foreground/30 mt-0.5">
                Full pickup &amp; delivery address unlocks only after payment is confirmed.
              </p>
            </div>
          </div>
        )}

        {/* ── Connected: show address ── */}
        {isConnected && (listing.pickupAddress || listing.deliveryAddress) && (
          <div className="rounded-2xl p-4" style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.2)" }}>
            <p className="text-[10px] font-display font-black text-cyan-400/70 uppercase tracking-wider mb-2">Full Addresses</p>
            {listing.pickupAddress && <p className="text-xs text-foreground/80 mb-1">📍 Pickup: {listing.pickupAddress}</p>}
            {listing.deliveryAddress && <p className="text-xs text-foreground/80">📍 Delivery: {listing.deliveryAddress}</p>}
          </div>
        )}

        {/* ── Carrier GPS tracking status ── */}
        {isConnected && !data.isPoster && (
          <div
            className="rounded-2xl p-3.5 flex items-center justify-between gap-3"
            style={isTracking
              ? { background: "rgba(6,182,212,0.10)", border: "1px solid rgba(6,182,212,0.35)" }
              : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            data-testid="tracking-status-banner"
          >
            <div className="flex items-center gap-2">
              <Navigation className={`w-4 h-4 shrink-0 ${isTracking ? "text-cyan-400" : "text-muted-foreground/40"}`} />
              <div>
                <p className={`text-xs font-display font-bold ${isTracking ? "text-cyan-400" : "text-muted-foreground/50"}`}>
                  {isTracking ? "Location tracking ON" : "Location tracking OFF"}
                </p>
                <p className="text-[9px] text-muted-foreground/30 mt-0.5">
                  {isTracking
                    ? "Your location is being shared with the shipper for this transport job."
                    : "Tracking starts automatically when transport is active."}
                </p>
              </div>
            </div>
            {isTracking && (
              <Button
                size="sm"
                variant="ghost"
                className="text-[10px] text-muted-foreground/50 hover:text-red-400 px-2 h-7 shrink-0"
                data-testid="button-stop-tracking"
                onClick={() => { void taskTrackingService.stopTask(listingId); setIsTracking(false); }}
              >
                Stop
              </Button>
            )}
          </div>
        )}

        {/* ════════ FREIGHT FIELDS ════════ */}
        {listing.freightTrailerType && (
          <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-[10px] font-display font-black text-muted-foreground/40 uppercase tracking-wider mb-3">
              {listing.freightTrailerType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} Details
            </p>
            {listing.commodityType && <DetailRow label="Commodity" value={listing.commodityType} />}
            {listing.weightLbs && <DetailRow label="Weight" value={`${listing.weightLbs.toLocaleString()} lbs`} />}
            {(listing.dimensionsLength || listing.dimensionsWidth || listing.dimensionsHeight) && (
              <DetailRow label="Dimensions" value={`${listing.dimensionsLength || "?"}L × ${listing.dimensionsWidth || "?"}W × ${listing.dimensionsHeight || "?"}H ft`} />
            )}
            {listing.palletCount && <DetailRow label="Pallets" value={String(listing.palletCount)} />}
            {listing.dockPickup != null && <DetailRow label="Dock Pickup" value={listing.dockPickup ? "Yes" : "No"} />}
            {listing.dockDelivery != null && <DetailRow label="Dock Delivery" value={listing.dockDelivery ? "Yes" : "No"} />}
            {listing.liftgateRequired != null && <DetailRow label="Liftgate" value={listing.liftgateRequired ? "Required" : "Not Required"} />}
            {listing.tempRequired && <DetailRow label="Temperature" value={listing.tempRequired.charAt(0).toUpperCase() + listing.tempRequired.slice(1)} />}
            {listing.tempValue && <DetailRow label="Temp Value" value={listing.tempValue} />}
            {listing.tarpRequired != null && <DetailRow label="Tarp" value={listing.tarpRequired ? "Required" : "Not Required"} />}
            {listing.chainsRequired != null && <DetailRow label="Chains" value={listing.chainsRequired ? "Required" : "Not Required"} />}
            {listing.strapsRequired != null && <DetailRow label="Straps" value={listing.strapsRequired ? "Required" : "Not Required"} />}
            {listing.oversized != null && <DetailRow label="Oversized" value={listing.oversized ? "⚠️ Yes" : "No"} />}
            {listing.permitRequired != null && <DetailRow label="Permit" value={listing.permitRequired ? "⚠️ Required" : "Not Required"} />}
            {listing.escortRequired != null && <DetailRow label="Escort" value={listing.escortRequired ? "⚠️ Required" : "Not Required"} />}
            {listing.hotshotTrailerType && <DetailRow label="Hotshot Trailer" value={listing.hotshotTrailerType.replace(/_/g, " ")} />}
            {listing.powerOnlyTrailerType && <DetailRow label="Trailer Type" value={listing.powerOnlyTrailerType.replace(/_/g, " ")} />}
            {listing.trailerNumber && <DetailRow label="Trailer #" value={listing.trailerNumber} />}
            {listing.vehicleCount && <DetailRow label="Vehicles" value={String(listing.vehicleCount)} />}
            {listing.carrierType && <DetailRow label="Carrier Type" value={listing.carrierType === "open" ? "Open Carrier" : "Enclosed Carrier"} />}
            {listing.pickupDate && <DetailRow label="Pickup Date" value={listing.pickupDate} />}
            {listing.deliveryDate && <DetailRow label="Delivery Date" value={listing.deliveryDate} />}
            {listing.weatherSensitive && <DetailRow label="Weather Sensitive" value="⚠️ Yes" />}
            {listing.sideLoadRequired && <DetailRow label="Side Load" value="⚠️ Required" />}
            {listing.customFreightType && <DetailRow label="Freight Type" value={listing.customFreightType} />}
          </div>
        )}

        {/* ════════ POSTER VIEW ════════ */}
        {isPoster && (
          <>
            {/* Freight activation banner */}
            {listing.freightTrailerType && listing.status === "offer_accepted" && !listing.activationFeePaid && listing.connectedCarrierId && (
              <div className="rounded-2xl p-4 space-y-3" style={{ background: "linear-gradient(135deg,rgba(34,197,94,0.14),rgba(21,128,61,0.08))", border: "1.5px solid rgba(34,197,94,0.4)" }}>
                <div>
                  <p className="text-sm font-display font-black text-green-400">🚛 Carrier Selected — Pay to Activate</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-1 leading-relaxed">
                    You've selected a carrier. Complete payment to officially confirm this load and notify the carrier to proceed.
                  </p>
                </div>
                <div className="rounded-xl p-3 space-y-1" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground/50">Carrier Rate</span>
                    <span className="font-display font-bold text-foreground">
                      ${(listing.postedPrice || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground/50">Load Activation Fee</span>
                    <span className="font-display font-bold text-foreground">$10.00</span>
                  </div>
                  <div className="h-px my-1" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <div className="flex justify-between text-xs">
                    <span className="font-display font-black text-foreground">Customer Pays</span>
                    <span className="font-display font-black text-green-400">
                      ${((listing.postedPrice || 0) + 10).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground/30 pt-0.5">
                    Carrier receives 95% of rate · GUBER keeps $10 + 5%
                  </p>
                </div>
                <Button
                  className="w-full rounded-2xl h-11 font-display font-black text-sm tracking-wide"
                  style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}
                  onClick={() => isDemo ? demoToast("Payment confirmed — carrier is notified and load goes live.") : activateMutation.mutate()}
                  disabled={!isDemo && activateMutation.isPending}
                  data-testid="button-activate-load"
                >
                  {activateMutation.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : `Pay & Activate · $${((listing.postedPrice || 0) + 10).toLocaleString()}`
                  }
                </Button>
              </div>
            )}

            {listing.freightTrailerType && listing.activationFeePaid && (
              <div className="rounded-xl p-3 flex items-center gap-2.5" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)" }}>
                <Check className="w-4 h-4 text-green-400 shrink-0" />
                <p className="text-xs font-display font-bold text-green-400">Load activated — carrier confirmed & notified</p>
              </div>
            )}

            {/* Edit / lock status */}
            {listing.status === "posted" || listing.status === "offer_received" ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full rounded-xl h-9 font-display font-black text-xs mb-1"
                onClick={() => isDemo ? demoToast("Opens the listing editor to update route, price or details.") : navigate(`/load-board/${listingId}/edit`)}
                data-testid="button-edit-listing"
              >
                <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit Listing
              </Button>
            ) : (
              <div
                className="w-full rounded-xl p-2.5 text-center mb-1"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,229,118,0.55)" }}
                data-testid="notice-editing-disabled"
              >
                <p className="text-xs font-display font-bold text-muted-foreground/40">Editing Disabled</p>
                <p className="text-[9px] text-muted-foreground/25 mt-0.5">Cannot edit while a transaction is active</p>
              </div>
            )}

            {/* Field services cart */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(0,229,118,0.55)" }}>
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                style={{ background: "rgba(255,255,255,0.04)" }}
                onClick={() => setFieldCart(prev => prev.length > 0 ? prev : [])}
                data-testid="section-field-services"
              >
                <div>
                  <p className="text-sm font-display font-bold text-foreground">Field Services</p>
                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">GUBER helpers — add to cart, pay together</p>
                </div>
                {fieldCart.length > 0 && (
                  <span className="text-[10px] font-display font-black px-2 py-0.5 rounded-full text-cyan-400"
                    style={{ background: "rgba(6,182,212,0.12)" }}>
                    {fieldCart.length} in cart
                  </span>
                )}
              </button>
              <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                {FIELD_SERVICES.map(s => {
                  const inCart       = fieldCart.includes(s.key);
                  const alreadyPaid  = paidAddonKeys.includes(s.key);
                  return (
                    <div key={s.key} className="flex items-center justify-between px-4 py-3"
                      style={{ background: "rgba(255,255,255,0.02)" }}>
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-display font-bold text-foreground">{s.label}</p>
                        <p className="text-[9px] text-muted-foreground/40 mt-0.5">{s.desc}</p>
                      </div>
                      {alreadyPaid ? (
                        <span className="text-xs font-display font-bold text-cyan-400 flex items-center gap-1 shrink-0">
                          <Check className="w-3 h-3" /> Ordered
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="shrink-0 text-[10px] font-display font-black px-3 py-1.5 rounded-lg transition-all"
                          style={inCart ? CYAN_ACTIVE : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
                          onClick={() => setFieldCart(prev => inCart ? prev.filter(k => k !== s.key) : [...prev, s.key])}
                          data-testid={`button-field-service-${s.key}`}
                        >
                          {inCart ? <><Check className="w-3 h-3 inline mr-0.5" /> Added</> : `$${s.price}`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {fieldCart.length > 0 && (
                <div className="px-4 py-3" style={{ background: "rgba(6,182,212,0.06)", borderTop: "1px solid rgba(6,182,212,0.15)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-display font-bold text-foreground">
                      Cart total: ${fieldCart.reduce((s, k) => s + (FIELD_SERVICES.find(f => f.key === k)?.price || 0), 0)}
                    </span>
                    <span className="text-[9px] text-muted-foreground/40">{fieldCart.length} service{fieldCart.length > 1 ? "s" : ""}</span>
                  </div>
                  <Button
                    className="w-full rounded-xl h-9 font-display font-black text-xs"
                    style={CYAN_ACTIVE}
                    onClick={() => setShowFieldCart(true)}
                    data-testid="button-review-field-cart"
                  >
                    <ShoppingCart className="w-3.5 h-3.5 mr-1.5" /> Review Cart & Pay
                  </Button>
                </div>
              )}
            </div>

            {/* Offers list */}
            {offers.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(0,229,118,0.55)" }}>
                <div className="px-4 py-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <p className="text-sm font-display font-bold text-foreground">Carrier Offers ({offers.length})</p>
                </div>
                <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                  {offers.map((o: any) => (
                    <div key={o.id} className="px-4 py-3" style={{ background: "rgba(255,255,255,0.02)" }}
                      data-testid={`card-offer-${o.id}`}>
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div>
                          <p className="text-base font-display font-black text-foreground">${o.offerAmount.toLocaleString()}</p>
                          <p className="text-[9px] text-muted-foreground/40 mt-0.5">Carrier #{o.carrierId} · Round {o.actionCount}/3</p>
                          {o.status === "countered" && o.counterAmount && (
                            <p className="text-xs text-amber-400 font-bold mt-1">Your counter: ${o.counterAmount.toLocaleString()}</p>
                          )}
                          {/* Platform fee preview */}
                          {o.status === "pending" && (
                            <p className="text-[9px] text-muted-foreground/30 mt-1">
                              Platform fee if accepted: ~${Math.max(5, Math.round(o.offerAmount * PLATFORM_FEE_RATE * 100) / 100).toFixed(2)}
                            </p>
                          )}
                        </div>
                        <OfferStatusBadge status={o.status} />
                      </div>

                      {o.status === "pending" && (
                        <div className="flex gap-2 flex-wrap">
                          {/* Accept → go to checkout review first */}
                          <Button
                            size="sm"
                            className="rounded-xl h-8 px-3 font-display font-black text-xs"
                            style={CYAN_ACTIVE}
                            onClick={() => {
                              if (isDemo) { demoToast("Tapping Accept opens a checkout summary — platform fee + optional add-ons — before any charge."); return; }
                              setPendingOffer(o);
                              setShowPosterCheckout(true);
                            }}
                            data-testid={`button-accept-offer-${o.id}`}
                          >
                            <ShoppingCart className="w-3 h-3 mr-1" /> Accept — Review Checkout
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
                                onClick={() => isDemo ? demoToast("Counter sent — carrier has up to 3 rounds to negotiate.") : respondMutation.mutate({ offerId: o.id, action: "counter", counterAmount: parseFloat(counterAmount) })}
                                disabled={!isDemo && (!counterAmount || respondMutation.isPending)}
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
                            onClick={() => isDemo ? demoToast("Offer declined — carrier is notified and can submit a new offer.") : respondMutation.mutate({ offerId: o.id, action: "decline" })}
                            disabled={!isDemo && respondMutation.isPending}
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
            {isOpen && (
              <button
                className="w-full text-xs text-destructive/50 font-display font-bold py-2"
                onClick={() => isDemo ? demoToast("Listing would be cancelled and removed from the board.") : (confirm("Cancel this listing?") && cancelMutation.mutate())}
                disabled={!isDemo && cancelMutation.isPending}
                data-testid="button-cancel-listing"
              >
                Cancel Listing
              </button>
            )}
          </>
        )}

        {/* ════════ CARRIER VIEW ════════ */}
        {!isPoster && listing.status !== "connected" && listing.status !== "completed" && (
          <>
            {/* My existing offer */}
            {myOffer && (
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,118,0.55)" }}
                data-testid="card-my-offer">
                <p className="text-[10px] font-display font-black text-muted-foreground/40 uppercase tracking-wider mb-3">Your Offer</p>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xl font-display font-black text-foreground">${myOffer.offerAmount.toLocaleString()}</p>
                  <OfferStatusBadge status={myOffer.status} />
                </div>

                {myOffer.status === "countered" && myOffer.counterAmount && (
                  <div className="rounded-xl p-3 mb-3" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                    <p className="text-xs text-amber-400 font-bold mb-2">Shipper countered: ${myOffer.counterAmount.toLocaleString()}</p>
                    {myOffer.actionCount < 3 ? (
                      <div className="flex gap-2">
                        <Button size="sm" className="rounded-xl h-8 px-3 font-display font-black text-xs" style={CYAN_ACTIVE}
                          onClick={() => respondMutation.mutate({ offerId: myOffer.id, action: "accept_counter" })}
                          disabled={respondMutation.isPending} data-testid="button-accept-counter">
                          Accept ${myOffer.counterAmount.toLocaleString()}
                        </Button>
                        <div className="flex gap-1.5">
                          <Input value={counterAmount} onChange={e => setCounterAmount(e.target.value)}
                            placeholder="Counter $" type="number"
                            className="h-8 w-24 rounded-xl bg-background/50 border-border/50 text-xs"
                            data-testid="input-counter-back" />
                          <Button size="sm" variant="outline" className="rounded-xl h-8 px-3 font-display font-black text-xs"
                            onClick={() => respondMutation.mutate({ offerId: myOffer.id, action: "counter_back", counterAmount: parseFloat(counterAmount) })}
                            disabled={!counterAmount || respondMutation.isPending} data-testid="button-counter-back">
                            Counter
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground/40">Max rounds reached — accept or walk away</p>
                    )}
                  </div>
                )}

                {myOffer.status === "pending" && (
                  <button className="text-xs text-destructive/50 font-display font-bold"
                    onClick={() => respondMutation.mutate({ offerId: myOffer.id, action: "withdraw" })}
                    disabled={respondMutation.isPending} data-testid="button-withdraw-offer">
                    Withdraw offer
                  </button>
                )}
              </div>
            )}

            {/* Submit new offer */}
            {!myOffer && isOpen && (
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,118,0.55)" }}>

                {/* Instant book at posted price */}
                {listing.postedPrice && (
                  <>
                    <Button
                      className="w-full rounded-xl h-12 font-display font-black text-sm mb-3"
                      style={{ background: "linear-gradient(135deg,#00e576,#00b8d9)", color: "#000", boxShadow: "0 0 18px rgba(0,229,118,0.35)" }}
                      onClick={() => isDemo ? demoToast("Books the load at the posted price — no negotiation needed.") : offerMutation.mutate({ offerAmount: listing.postedPrice, instantBook: true })}
                      disabled={!isDemo && offerMutation.isPending}
                      data-testid="button-book-now"
                    >
                      {offerMutation.isPending
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <>⚡ Book at ${listing.postedPrice.toLocaleString()} — No negotiation</>}
                    </Button>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex-1 h-px bg-border/30" />
                      <span className="text-[9px] text-muted-foreground/30 font-display font-black uppercase tracking-wider">or send a different offer</span>
                      <div className="flex-1 h-px bg-border/30" />
                    </div>
                  </>
                )}

                <p className="text-[10px] font-display font-black text-muted-foreground/40 uppercase tracking-wider mb-3">Submit Your Offer</p>
                <div className="relative mb-3">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input value={offerAmount} onChange={e => setOfferAmount(e.target.value)}
                    placeholder="Enter amount" type="number"
                    className="rounded-xl h-12 bg-background/50 border-border/50 text-base pl-7"
                    data-testid="input-offer-amount" />
                </div>
                {listing.suggestedLow && listing.suggestedHigh && (
                  <p className="text-[9px] text-muted-foreground/30 mb-3">Market est. ${listing.suggestedLow}–${listing.suggestedHigh}</p>
                )}
                <Button
                  className="w-full rounded-xl h-10 font-display font-black text-sm"
                  style={CYAN_ACTIVE}
                  onClick={() => {
                    if (!offerAmount || parseFloat(offerAmount) <= 0) {
                      toast({ variant: "destructive", title: "Enter a valid amount" });
                      return;
                    }
                    isDemo ? demoToast("Offer sent to the shipper — they'll get a notification to accept, counter, or decline.") : offerMutation.mutate({ offerAmount: parseFloat(offerAmount) });
                  }}
                  disabled={offerMutation.isPending || !offerAmount}
                  data-testid="button-submit-offer"
                >
                  {offerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Submit $${offerAmount || "—"} Offer`}
                </Button>
                <div className="flex items-start gap-1.5 mt-2.5">
                  <Info className="w-3 h-3 text-muted-foreground/25 shrink-0 mt-0.5" />
                  <p className="text-[9px] text-muted-foreground/30">
                    No payment now. If the shipper accepts, you'll see a full checkout before paying the connection fee.
                  </p>
                </div>
              </div>
            )}

            {/* Connection section — offer accepted */}
            {offerAccepted && myOffer?.status === "accepted" && (
              <div
                className="rounded-2xl p-4"
                style={{
                  background: "linear-gradient(135deg,rgba(8,145,178,0.12),rgba(14,116,144,0.06))",
                  border: "1.5px solid rgba(6,182,212,0.3)",
                  boxShadow: "0 0 24px rgba(6,182,212,0.08)",
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="w-4 h-4 text-cyan-400" />
                  <p className="text-sm font-display font-black text-cyan-300">Your offer was accepted — Connect Now</p>
                </div>
                <p className="text-[10px] text-muted-foreground/50 mb-4">
                  Pay the one-time connection fee to unlock the shipper's exact address and contact details. Nothing is charged until you review and confirm.
                </p>

                {/* Tier picker */}
                <div className="space-y-2 mb-4">
                  {CONNECTION_TIERS.map(t => (
                    <button key={t.value} type="button" onClick={() => setSelectedTier(t.value)}
                      className="w-full rounded-xl p-3 text-left transition-all flex items-center justify-between"
                      style={selectedTier === t.value
                        ? { background: "linear-gradient(135deg,rgba(8,145,178,0.2),rgba(14,116,144,0.12))", border: "1.5px solid rgba(6,182,212,0.4)" }
                        : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,118,0.55)" }}
                      data-testid={`select-tier-${t.value}`}>
                      <div>
                        <p className="text-sm font-display font-bold text-foreground">{t.label}</p>
                        <p className="text-[9px] text-muted-foreground/40 mt-0.5">{t.desc}</p>
                      </div>
                      <p className={`text-base font-display font-black ${selectedTier === t.value ? "text-cyan-300" : "text-muted-foreground/50"}`}>
                        ${t.price}
                      </p>
                    </button>
                  ))}
                </div>

                <Button
                  className="w-full rounded-2xl h-12 font-display font-black text-sm tracking-wide"
                  style={CYAN_ACTIVE}
                  onClick={() => isDemo ? demoToast("Opens the connection checkout — pay once to unlock the shipper's address and contact info.") : setShowCheckout(true)}
                  data-testid="button-review-checkout"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Review Checkout · ${CONNECTION_TIERS.find(t => t.value === selectedTier)?.price}
                </Button>
              </div>
            )}

            {/* Carrier profile CTA */}
            {!myOffer && isOpen && (
              <button
                className="w-full text-[10px] text-cyan-400/50 font-display font-bold py-1 flex items-center justify-center gap-1"
                onClick={() => navigate("/carrier-profile")}
                data-testid="button-setup-carrier"
              >
                <Truck className="w-3 h-3" /> Set up your carrier profile for faster acceptance
              </button>
            )}
          </>
        )}
      </div>
    </GuberLayout>
  );
}

// ── small helpers ─────────────────────────────────────────────────────────────

function OfferStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; style: CSSProperties }> = {
    pending:   { label: "Pending",   style: { background: "rgba(6,182,212,0.1)",    color: "#67e8f9" } },
    countered: { label: "Countered", style: { background: "rgba(245,158,11,0.1)",   color: "#fbbf24" } },
    accepted:  { label: "Accepted",  style: { background: "rgba(6,182,212,0.1)",    color: "#67e8f9" } },
    declined:  { label: "Declined",  style: { background: "rgba(239,68,68,0.08)",   color: "#f87171" } },
    withdrawn: { label: "Withdrawn", style: { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" } },
  };
  const c = cfg[status] || { label: status, style: {} };
  return (
    <span className="text-xs font-display font-bold px-2 py-0.5 rounded-full" style={c.style}>
      {c.label}
    </span>
  );
}

function ChipBadge({ children }: { children: ReactNode }) {
  return (
    <span className="text-[9px] font-display font-bold px-2 py-0.5 rounded-full capitalize"
      style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)" }}>
      {children}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-xs mt-1.5">
      <span className="text-muted-foreground/40">{label}</span>
      <span className="font-display font-bold text-foreground/70 capitalize">{value}</span>
    </div>
  );
}

function FeatureRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <ShieldCheck className="w-3 h-3 text-cyan-400 shrink-0" />
      <span className="text-foreground/70">{text}</span>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground/60">{label}</span>
      <span className={`font-display font-bold ${muted ? "text-muted-foreground/40" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
