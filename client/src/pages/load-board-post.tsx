import { useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ChevronRight, ChevronLeft, Loader2, TrendingUp, Zap, Info, ShoppingCart, Check } from "lucide-react";

// ── constants ──────────────────────────────────────────────────────────────────

const CYAN_ACTIVE = { background: "linear-gradient(135deg,#0891b2,#0e7490)", color: "#fff" };
const CYAN_INACTIVE = { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" };
const CYAN_TILE_ACTIVE = { background: "linear-gradient(135deg,rgba(8,145,178,0.25),rgba(14,116,144,0.15))", border: "1.5px solid rgba(6,182,212,0.5)" };
const CYAN_TILE_INACTIVE = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" };

const TRANSPORT_TYPES = [
  { value: "vehicle",   label: "🚗 Vehicle",       sub: "Car, truck, SUV, van" },
  { value: "equipment", label: "🏗️ Equipment",      sub: "Heavy machinery, tools" },
  { value: "boat",      label: "⛵ Boat",            sub: "Powerboat, pontoon, jet ski" },
  { value: "rv",        label: "🚐 RV",             sub: "Class A/B/C, 5th wheel" },
  { value: "trailer",   label: "🔧 Trailer",        sub: "Utility, cargo, flatbed" },
  { value: "hotshot",   label: "⚡ Hotshot",         sub: "Time-sensitive freight" },
];

const VEHICLE_TYPES = [
  "car", "truck", "suv", "van", "motorcycle", "atv_utv",
];
const EQUIPMENT_TYPES = [
  "skid_steer", "tractor", "forklift", "excavator", "loader", "generator", "other",
];
const BOAT_TYPES = [
  "powerboat", "sailboat", "pontoon", "jet_ski", "fishing", "other",
];
const RV_CLASSES = [
  "class_a", "class_b", "class_c", "travel_trailer", "fifth_wheel", "other",
];
const TRAILER_TYPES = [
  "utility", "enclosed", "car_hauler", "dump", "flatbed", "boat_trailer", "other",
];
const FREIGHT_TYPES = [
  "machinery", "auto_parts", "building_materials", "pallets", "oversized", "livestock", "other",
];

const CONDITIONS = [
  { value: "runs_drives",    label: "Runs & Drives" },
  { value: "inop",           label: "Inoperable" },
  { value: "no_brakes",      label: "No Brakes" },
  { value: "flat_tires",     label: "Flat Tires" },
  { value: "locked_wheels",  label: "Locked Wheels" },
  { value: "no_keys",        label: "No Keys" },
  { value: "rolls_no_start", label: "Rolls, Won't Start" },
  { value: "does_not_roll",  label: "Does Not Roll" },
];

const OWNERSHIP_PROOF = [
  { value: "title_in_hand",   label: "Title In Hand",   hint: "Clean title, ready to go" },
  { value: "bill_of_sale",    label: "Bill of Sale",    hint: "Purchased, title pending" },
  { value: "auction_invoice", label: "Auction Invoice", hint: "Won at auction" },
  { value: "dealer_owned",    label: "Dealer Owned",    hint: "Commercial dealer" },
  { value: "lienholder",      label: "Lienholder",      hint: "Bank/lender holds title" },
  { value: "not_ready",       label: "Proof Pending",   hint: "Will have before pickup" },
];

const TRAILER_PREFS = [
  { value: "any",      label: "Any Trailer" },
  { value: "open",     label: "Open" },
  { value: "enclosed", label: "Enclosed" },
  { value: "rollback", label: "Rollback" },
  { value: "hotshot",  label: "Hotshot" },
  { value: "lowboy",   label: "Lowboy" },
  { value: "multi_car",label: "Multi-Car" },
];

const LOADING_METHODS = [
  { value: "drive_on", label: "Drive On" },
  { value: "winch",    label: "Winch" },
  { value: "forklift", label: "Forklift" },
  { value: "crane",    label: "Crane" },
  { value: "liftgate", label: "Liftgate" },
];

const UNLOADING_METHODS = [
  { value: "drive_off", label: "Drive Off" },
  { value: "winch",     label: "Winch" },
  { value: "rollback",  label: "Rollback" },
  { value: "liftgate",  label: "Liftgate" },
];

const FLEXIBILITY_OPTIONS = [
  { value: "asap",      label: "ASAP" },
  { value: "today",     label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "scheduled", label: "Scheduled" },
];

const ACCESS_OPTIONS = [
  { value: "residential",  label: "Residential" },
  { value: "commercial",   label: "Commercial" },
  { value: "gated",        label: "Gated" },
  { value: "rural",        label: "Rural" },
  { value: "auction",      label: "Auction Lot" },
  { value: "dealership",   label: "Dealership" },
  { value: "port",         label: "Port / Marina" },
  { value: "storage",      label: "Storage Unit" },
];

const WEIGHT_RANGES = [
  { value: "under_1k",  label: "< 1,000 lbs" },
  { value: "1k_5k",     label: "1K – 5K lbs" },
  { value: "5k_10k",    label: "5K – 10K lbs" },
  { value: "10k_20k",   label: "10K – 20K lbs" },
  { value: "20k_plus",  label: "20K+ lbs" },
];

const ADDON_OPTIONS: { key: string; label: string; price: number; hint: string }[] = [
  { key: "urgent_boost",          label: "⚡ Urgent Boost",              price: 10,  hint: "Pin your listing at the top for faster responses" },
  { key: "premium_carrier_only",  label: "🛡️ Verified Carriers Only",    price: 10,  hint: "Restrict offers to GUBER-credentialed carriers" },
  { key: "enclosed_transport",    label: "🔒 Enclosed Transport",         price: 0,   hint: "Request enclosed trailer (may raise carrier rates)" },
  { key: "winch_required",        label: "🪝 Winch Required",             price: 0,   hint: "Signal winch capability is needed" },
  { key: "liftgate",              label: "🏋️ Liftgate Required",          price: 0,   hint: "Carrier must have a working liftgate" },
  { key: "photo_proof",           label: "📸 Photo Proof at Pickup",      price: 25,  hint: "GUBER worker documents asset before transport" },
  { key: "loading_help",          label: "🤝 Loading Assistance",         price: 10,  hint: "GUBER worker helps load the asset onto carrier" },
  { key: "unloading_help",        label: "🤝 Unloading Assistance",       price: 10,  hint: "GUBER worker helps unload at destination" },
  { key: "vin_verification",      label: "🔍 VIN Verification",           price: 15,  hint: "GUBER confirms VIN matches vehicle before pickup" },
  { key: "gps_tracking",          label: "📡 GPS Tracking",               price: 15,  hint: "Real-time location updates during transport" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

// ── shared components ──────────────────────────────────────────────────────────

function ChipGrid({ options, value, multi, onChange }: {
  options: (string | { value: string; label: string })[];
  value: string | string[];
  multi?: boolean;
  onChange: (v: any) => void;
}) {
  const normalize = (o: string | { value: string; label: string }) =>
    typeof o === "string" ? { value: o, label: o.replace(/_/g, " ") } : o;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const { value: v, label } = normalize(o);
        const sel = multi ? (value as string[]).includes(v) : value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => {
              if (multi) {
                const arr = value as string[];
                onChange(sel ? arr.filter(x => x !== v) : [...arr, v]);
              } else {
                onChange(v);
              }
            }}
            className="rounded-xl px-3 py-1.5 text-xs font-display font-bold transition-all capitalize"
            style={sel ? CYAN_ACTIVE : CYAN_INACTIVE}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-display font-black text-muted-foreground/50 uppercase tracking-widest mb-2.5">
      {children}
    </p>
  );
}

// ── VIN decode helper ──────────────────────────────────────────────────────────

async function decodeVin(vin: string) {
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
    const res = await fetch(url);
    const json = await res.json();
    const r = json?.Results?.[0];
    if (!r || r.ErrorCode !== "0") return null;
    return {
      year:  r.ModelYear || "",
      make:  r.Make      || "",
      model: r.Model     || "",
      body:  r.BodyClass || "",
    };
  } catch {
    return null;
  }
}

// ── main component ─────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5 | 6;

export default function LoadBoardPost() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);

  // Step 1 — asset type
  const [transportType, setTransportType] = useState("");

  // Step 2 — asset details
  const [vehicleType,         setVehicleType]         = useState("");
  const [vin,                 setVin]                 = useState("");
  const [vinDecoding,         setVinDecoding]         = useState(false);
  const [vinVerified,         setVinVerified]         = useState(false);
  const [year,                setYear]                = useState("");
  const [make,                setMake]                = useState("");
  const [model,               setModel]               = useState("");
  const [vehicleCondition,    setVehicleCondition]    = useState<string[]>([]);
  const [ownershipProofStatus,setOwnershipProofStatus]= useState("");
  const [equipmentType,       setEquipmentType]       = useState("");
  const [boatType,            setBoatType]            = useState("");
  const [trailerIncluded,     setTrailerIncluded]     = useState(false);
  const [rvClass,             setRvClass]             = useState("");
  const [trailerType,         setTrailerType]         = useState("");
  const [freightType,         setFreightType]         = useState<string[]>([]);
  const [weightRange,         setWeightRange]         = useState("");
  const [palletized,          setPalletized]          = useState("");

  // Step 3 — route
  const [pickupZip,          setPickupZip]          = useState("");
  const [pickupCity,         setPickupCity]         = useState("");
  const [pickupState,        setPickupState]        = useState("TX");
  const [pickupAccess,       setPickupAccess]       = useState<string[]>([]);
  const [pickupFlexibility,  setPickupFlexibility]  = useState("");
  const [deliveryZip,        setDeliveryZip]        = useState("");
  const [deliveryCity,       setDeliveryCity]       = useState("");
  const [deliveryState,      setDeliveryState]      = useState("CA");
  const [deliveryAccess,     setDeliveryAccess]     = useState<string[]>([]);
  const [deliveryFlexibility,setDeliveryFlexibility]= useState("");
  const [geoLocating,        setGeoLocating]        = useState<"pickup"|"delivery"|null>(null);
  const [estimatedMiles,     setEstimatedMiles]     = useState("");
  const [trailerPreference,  setTrailerPreference]  = useState("any");
  const [loadingMethod,      setLoadingMethod]      = useState<string[]>([]);
  const [unloadingMethod,    setUnloadingMethod]    = useState<string[]>([]);
  const [loadingAssist,      setLoadingAssist]      = useState("");
  const [unloadingAssist,    setUnloadingAssist]    = useState("");
  const [dockAvailable,      setDockAvailable]      = useState("");

  // Step 4 — add-ons cart
  const [addonFlags, setAddonFlags] = useState<string[]>([]);

  // Step 5 — pricing
  const [pricingMode,  setPricingMode]  = useState("fixed");
  const [postedPrice,  setPostedPrice]  = useState("");
  const [urgent,       setUrgent]       = useState(false);

  // ZIP → city/state auto-fill
  const lookupZip = useCallback(async (zip: string, target: "pickup" | "delivery") => {
    if (zip.length !== 5) return;
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (!res.ok) return;
      const data = await res.json();
      const city  = data.places?.[0]?.["place name"] || "";
      const state = data.places?.[0]?.["state abbreviation"] || "";
      if (!city) return;
      if (target === "pickup")   { setPickupCity(city);   setPickupState(state); }
      if (target === "delivery") { setDeliveryCity(city); setDeliveryState(state); }
    } catch {}
  }, []);

  // "Use My Location" geolocation → fill ZIP + city/state
  const useMyLocation = useCallback((target: "pickup" | "delivery") => {
    if (!navigator.geolocation) {
      toast({ variant: "destructive", title: "Location unavailable", description: "Your browser doesn't support geolocation." });
      return;
    }
    setGeoLocating(target);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `/api/places/reverse-geocode?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`,
            { credentials: "include" }
          );
          if (res.ok) {
            const d = await res.json();
            const addr = d.address || "";
            const zipMatch = addr.match(/\b(\d{5})\b/);
            const zip = zipMatch?.[1] || "";
            const parts = addr.split(",");
            const city  = parts.length >= 3 ? (parts[parts.length - 3]?.trim() || "") : "";
            const stateZip = parts.length >= 2 ? (parts[parts.length - 2]?.trim() || "") : "";
            const stateMatch = stateZip.match(/^([A-Z]{2})/);
            const state = stateMatch?.[1] || "";
            if (target === "pickup") {
              if (zip)   setPickupZip(zip);
              if (city)  setPickupCity(city);
              if (state) setPickupState(state);
            } else {
              if (zip)   setDeliveryZip(zip);
              if (city)  setDeliveryCity(city);
              if (state) setDeliveryState(state);
            }
            if (zip) toast({ title: "Location detected", description: `ZIP ${zip}` });
          }
        } catch {}
        setGeoLocating(null);
      },
      () => {
        setGeoLocating(null);
        toast({ variant: "destructive", title: "Location denied", description: "Allow location access and try again." });
      },
      { timeout: 8000 }
    );
  }, [toast]);

  // VIN decode
  const handleVinDecode = useCallback(async () => {
    if (vin.length < 11) return;
    setVinDecoding(true);
    const decoded = await decodeVin(vin);
    setVinDecoding(false);
    if (decoded) {
      if (decoded.year)  setYear(decoded.year);
      if (decoded.make)  setMake(decoded.make);
      if (decoded.model) setModel(decoded.model);
      setVinVerified(true);
      toast({ title: "VIN decoded", description: `${decoded.year} ${decoded.make} ${decoded.model}` });
    } else {
      toast({ variant: "destructive", title: "VIN not found", description: "Enter year/make/model manually." });
    }
  }, [vin, toast]);

  // Rate suggestion
  const { data: rateData } = useQuery<{ low: number | null; high: number | null }>({
    queryKey: ["/api/load-board/rate-suggest", transportType, estimatedMiles],
    queryFn: async () => {
      const m = parseInt(estimatedMiles) || 0;
      if (!transportType || m <= 0) return { low: null, high: null };
      const res = await fetch(`/api/load-board/rate-suggest?transportType=${transportType}&miles=${m}`);
      return res.json();
    },
    enabled: !!transportType && parseInt(estimatedMiles) > 0,
  });

  // Computed add-on cost
  const addonTotal = addonFlags.reduce((sum, key) => {
    const a = ADDON_OPTIONS.find(x => x.key === key);
    return sum + (a?.price || 0);
  }, 0);

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/load-board", data),
    onSuccess: async (res: any) => {
      const json = await res.json();
      toast({ title: "Load posted!", description: "Carriers can now submit offers." });
      navigate(`/load-board/${json.listing.id}`);
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Error", description: err.message });
    },
  });

  function handleSubmit() {
    const hasPickup   = pickupZip.length === 5 || (pickupCity && pickupState);
    const hasDelivery = deliveryZip.length === 5 || (deliveryCity && deliveryState);
    if (!transportType || !hasPickup || !hasDelivery) {
      toast({ variant: "destructive", title: "Required fields missing", description: "Enter pickup and delivery ZIP codes." });
      return;
    }
    mutation.mutate({
      transportType,
      vin:                  vin || undefined,
      vinVerified,
      year:                 year || undefined,
      make:                 make || undefined,
      model:                model || undefined,
      vehicleType:          vehicleType || undefined,
      vehicleCondition:     vehicleCondition.length ? vehicleCondition : undefined,
      ownershipProofStatus: ownershipProofStatus || undefined,
      equipmentType:        equipmentType || undefined,
      boatType:             boatType || undefined,
      trailerIncluded,
      rvClass:              rvClass || undefined,
      trailerType:          trailerType || undefined,
      freightType:          freightType.length ? freightType : undefined,
      weightRange:          weightRange || undefined,
      palletized:           palletized || undefined,
      trailerPreference,
      loadingMethod:        loadingMethod.length ? loadingMethod : undefined,
      unloadingMethod:      unloadingMethod.length ? unloadingMethod : undefined,
      pickupAccess:         pickupAccess.length ? pickupAccess : undefined,
      deliveryAccess:       deliveryAccess.length ? deliveryAccess : undefined,
      pickupFlexibility:    pickupFlexibility || undefined,
      deliveryFlexibility:  deliveryFlexibility || undefined,
      loadingAssistAvailable:   loadingAssist || undefined,
      unloadingAssistAvailable: unloadingAssist || undefined,
      dockAvailable:        dockAvailable || undefined,
      pickupZip:    pickupZip || undefined,
      pickupCity:   pickupCity || (pickupZip ? `ZIP ${pickupZip}` : ""),
      pickupState:  pickupState || "US",
      deliveryZip:  deliveryZip || undefined,
      deliveryCity: deliveryCity || (deliveryZip ? `ZIP ${deliveryZip}` : ""),
      deliveryState: deliveryState || "US",
      estimatedMiles:  estimatedMiles ? parseInt(estimatedMiles) : undefined,
      pricingMode,
      postedPrice:     postedPrice ? parseFloat(postedPrice) : undefined,
      addonFlags:      addonFlags.length ? addonFlags : undefined,
      urgent:          urgent || addonFlags.includes("urgent_boost"),
    });
  }

  const STEPS = [
    { num: 1, label: "Type" },
    { num: 2, label: "Details" },
    { num: 3, label: "Route" },
    { num: 4, label: "Add-ons" },
    { num: 5, label: "Pricing" },
    { num: 6, label: "Review" },
  ];

  function canAdvance() {
    if (step === 1) return !!transportType;
    if (step === 2) {
      if (transportType === "vehicle") return !!(vehicleType && ownershipProofStatus);
      if (transportType === "equipment") return !!equipmentType;
      if (transportType === "boat") return !!boatType;
      if (transportType === "rv") return !!rvClass;
      if (transportType === "trailer") return !!trailerType;
      if (transportType === "hotshot") return freightType.length > 0;
      return true;
    }
    if (step === 3) return !!(
      (pickupZip.length === 5 || (pickupCity && pickupState)) &&
      (deliveryZip.length === 5 || (deliveryCity && deliveryState))
    );
    return true;
  }

  function advance() {
    if (!canAdvance()) {
      toast({ variant: "destructive", title: "Please complete the required fields" });
      return;
    }
    setStep(s => Math.min(6, s + 1) as Step);
  }

  // ── summary helpers ──────────────────────────────────────────────────────────

  function assetSummary() {
    if (transportType === "vehicle") return [year, make, model].filter(Boolean).join(" ") || vehicleType || "Vehicle";
    if (transportType === "equipment") return equipmentType?.replace(/_/g, " ") || "Equipment";
    if (transportType === "boat") return boatType?.replace(/_/g, " ") || "Boat";
    if (transportType === "rv") return rvClass?.replace(/_/g, " ") || "RV";
    if (transportType === "trailer") return trailerType?.replace(/_/g, " ") || "Trailer";
    if (transportType === "hotshot") return "Hotshot — " + freightType.join(", ");
    return transportType;
  }

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <GuberLayout title="Post a Load" showBack backHref="/load-board">
      <div className="px-4 pt-2 pb-36">

        {/* Step dots */}
        <div className="flex items-center gap-1 mb-6">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center gap-1 flex-1">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-display font-black shrink-0"
                style={step >= s.num ? CYAN_ACTIVE : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.25)" }}
              >
                {step > s.num ? <Check className="w-3 h-3" /> : s.num}
              </div>
              <span className={`text-[9px] font-display font-bold hidden sm:block ${step >= s.num ? "text-cyan-300/70" : "text-muted-foreground/20"}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-px" style={{ background: step > s.num ? "rgba(6,182,212,0.3)" : "rgba(255,255,255,0.06)" }} />
              )}
            </div>
          ))}
        </div>

        {/* ── Step 1: Asset Type ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <SectionLabel>What needs to move?</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                {TRANSPORT_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTransportType(t.value)}
                    className="rounded-2xl p-3.5 text-left transition-all active:scale-95"
                    style={transportType === t.value ? CYAN_TILE_ACTIVE : CYAN_TILE_INACTIVE}
                    data-testid={`select-transport-${t.value}`}
                  >
                    <p className="text-sm font-display font-bold text-foreground">{t.label}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">{t.sub}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Asset Details ─────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">

            {/* VEHICLE */}
            {transportType === "vehicle" && (
              <>
                <div>
                  <SectionLabel>Vehicle Type *</SectionLabel>
                  <ChipGrid options={VEHICLE_TYPES} value={vehicleType} onChange={setVehicleType} />
                </div>

                <div>
                  <SectionLabel>VIN (optional — auto-fills year/make/model)</SectionLabel>
                  <div className="flex gap-2">
                    <Input
                      value={vin}
                      onChange={e => { setVin(e.target.value.toUpperCase()); setVinVerified(false); }}
                      placeholder="17-digit VIN"
                      maxLength={17}
                      className="rounded-xl h-10 bg-background/50 border-border/50 text-sm font-mono flex-1"
                      data-testid="input-vin"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-xl h-10 px-3 font-display font-black text-xs shrink-0"
                      style={CYAN_ACTIVE}
                      onClick={handleVinDecode}
                      disabled={vin.length < 11 || vinDecoding}
                      data-testid="button-decode-vin"
                    >
                      {vinDecoding ? <Loader2 className="w-3 h-3 animate-spin" /> : "Decode"}
                    </Button>
                  </div>
                  {vinVerified && (
                    <p className="text-[10px] text-cyan-400 mt-1 flex items-center gap-1">
                      <Check className="w-3 h-3" /> VIN verified
                    </p>
                  )}
                </div>

                <div>
                  <SectionLabel>Year / Make / Model</SectionLabel>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground/50">Year</Label>
                      <Input value={year} onChange={e => setYear(e.target.value)} placeholder="2019" className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm" data-testid="input-year" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground/50">Make</Label>
                      <Input value={make} onChange={e => setMake(e.target.value)} placeholder="Ford" className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm" data-testid="input-make" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground/50">Model</Label>
                      <Input value={model} onChange={e => setModel(e.target.value)} placeholder="F-150" className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm" data-testid="input-model" />
                    </div>
                  </div>
                </div>

                <div>
                  <SectionLabel>Condition</SectionLabel>
                  <ChipGrid options={CONDITIONS} value={vehicleCondition} multi onChange={setVehicleCondition} />
                </div>

                <div>
                  <SectionLabel>Ownership Proof Status *</SectionLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {OWNERSHIP_PROOF.map(p => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setOwnershipProofStatus(p.value)}
                        className="rounded-xl p-3 text-left transition-all"
                        style={ownershipProofStatus === p.value ? CYAN_TILE_ACTIVE : CYAN_TILE_INACTIVE}
                        data-testid={`select-proof-${p.value}`}
                      >
                        <p className="text-xs font-display font-bold text-foreground">{p.label}</p>
                        <p className="text-[9px] text-muted-foreground/40 mt-0.5">{p.hint}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* EQUIPMENT */}
            {transportType === "equipment" && (
              <>
                <div>
                  <SectionLabel>Equipment Type *</SectionLabel>
                  <ChipGrid options={EQUIPMENT_TYPES} value={equipmentType} onChange={setEquipmentType} />
                </div>
                <div>
                  <SectionLabel>Weight Range</SectionLabel>
                  <ChipGrid options={WEIGHT_RANGES} value={weightRange} onChange={setWeightRange} />
                </div>
              </>
            )}

            {/* BOAT */}
            {transportType === "boat" && (
              <>
                <div>
                  <SectionLabel>Boat Type *</SectionLabel>
                  <ChipGrid options={BOAT_TYPES} value={boatType} onChange={setBoatType} />
                </div>
                <div>
                  <SectionLabel>Trailer Situation</SectionLabel>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setTrailerIncluded(true)}
                      className="flex-1 rounded-xl p-3 text-left transition-all"
                      style={trailerIncluded ? CYAN_TILE_ACTIVE : CYAN_TILE_INACTIVE}
                    >
                      <p className="text-xs font-display font-bold">Has a Trailer</p>
                      <p className="text-[9px] text-muted-foreground/40 mt-0.5">Boat sits on trailer already</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrailerIncluded(false)}
                      className="flex-1 rounded-xl p-3 text-left transition-all"
                      style={!trailerIncluded ? CYAN_TILE_ACTIVE : CYAN_TILE_INACTIVE}
                    >
                      <p className="text-xs font-display font-bold">No Trailer</p>
                      <p className="text-[9px] text-muted-foreground/40 mt-0.5">Carrier must provide</p>
                    </button>
                  </div>
                </div>
                <div>
                  <SectionLabel>Weight Range</SectionLabel>
                  <ChipGrid options={WEIGHT_RANGES} value={weightRange} onChange={setWeightRange} />
                </div>
              </>
            )}

            {/* RV */}
            {transportType === "rv" && (
              <>
                <div>
                  <SectionLabel>RV Class *</SectionLabel>
                  <ChipGrid options={RV_CLASSES} value={rvClass} onChange={setRvClass} />
                </div>
                <div>
                  <SectionLabel>Vehicle Condition</SectionLabel>
                  <ChipGrid options={CONDITIONS} value={vehicleCondition} multi onChange={setVehicleCondition} />
                </div>
              </>
            )}

            {/* TRAILER */}
            {transportType === "trailer" && (
              <>
                <div>
                  <SectionLabel>Trailer Type *</SectionLabel>
                  <ChipGrid options={TRAILER_TYPES} value={trailerType} onChange={setTrailerType} />
                </div>
                <div>
                  <SectionLabel>Weight Range</SectionLabel>
                  <ChipGrid options={WEIGHT_RANGES} value={weightRange} onChange={setWeightRange} />
                </div>
              </>
            )}

            {/* HOTSHOT */}
            {transportType === "hotshot" && (
              <>
                <div>
                  <SectionLabel>Freight Type (select all that apply) *</SectionLabel>
                  <ChipGrid options={FREIGHT_TYPES} value={freightType} multi onChange={setFreightType} />
                </div>
                <div>
                  <SectionLabel>Packaging / Palletized</SectionLabel>
                  <ChipGrid
                    options={[
                      { value: "palletized", label: "Palletized" },
                      { value: "loose",      label: "Loose / Strapped" },
                      { value: "mixed",      label: "Mixed" },
                    ]}
                    value={palletized}
                    onChange={setPalletized}
                  />
                </div>
                <div>
                  <SectionLabel>Total Weight</SectionLabel>
                  <ChipGrid options={WEIGHT_RANGES} value={weightRange} onChange={setWeightRange} />
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Step 3: Route ─────────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            {/* Pickup */}
            <div>
              <SectionLabel>Pickup ZIP Code *</SectionLabel>
              <div className="flex gap-2 mb-2">
                <Input
                  value={pickupZip}
                  onChange={e => {
                    const z = e.target.value.replace(/\D/g, "").slice(0, 5);
                    setPickupZip(z);
                    lookupZip(z, "pickup");
                  }}
                  placeholder="e.g. 75201"
                  type="tel"
                  inputMode="numeric"
                  maxLength={5}
                  className="rounded-xl h-11 bg-background/50 border-border/50 text-base font-mono flex-1"
                  data-testid="input-pickup-zip"
                />
                <button
                  type="button"
                  onClick={() => useMyLocation("pickup")}
                  disabled={geoLocating === "pickup"}
                  className="shrink-0 h-11 px-3 rounded-xl text-xs font-display font-black transition-all"
                  style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}
                  data-testid="button-pickup-use-location"
                >
                  {geoLocating === "pickup" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "📍 My Location"}
                </button>
              </div>
              {(pickupCity || pickupState) && (
                <p className="text-[10px] text-cyan-400/70 flex items-center gap-1.5 mb-2">
                  <Check className="w-3 h-3" /> {pickupCity}{pickupCity && pickupState ? `, ${pickupState}` : pickupState}
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="col-span-2">
                  <Label className="text-[10px] text-muted-foreground/30">City (auto-filled from ZIP)</Label>
                  <Input value={pickupCity} onChange={e => setPickupCity(e.target.value)} placeholder="Dallas" className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm" data-testid="input-pickup-city" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground/30">State</Label>
                  <select
                    value={pickupState}
                    onChange={e => setPickupState(e.target.value)}
                    className="mt-1 w-full h-10 rounded-xl bg-background/50 border border-border/50 text-sm px-3 text-foreground"
                    data-testid="select-pickup-state"
                  >
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <SectionLabel>Pickup Site Type</SectionLabel>
              <ChipGrid options={ACCESS_OPTIONS} value={pickupAccess} multi onChange={setPickupAccess} />
            </div>

            <div>
              <SectionLabel>Pickup Availability</SectionLabel>
              <ChipGrid options={FLEXIBILITY_OPTIONS} value={pickupFlexibility} onChange={setPickupFlexibility} />
            </div>

            {/* Delivery */}
            <div>
              <SectionLabel>Delivery ZIP Code *</SectionLabel>
              <div className="flex gap-2 mb-2">
                <Input
                  value={deliveryZip}
                  onChange={e => {
                    const z = e.target.value.replace(/\D/g, "").slice(0, 5);
                    setDeliveryZip(z);
                    lookupZip(z, "delivery");
                  }}
                  placeholder="e.g. 90001"
                  type="tel"
                  inputMode="numeric"
                  maxLength={5}
                  className="rounded-xl h-11 bg-background/50 border-border/50 text-base font-mono flex-1"
                  data-testid="input-delivery-zip"
                />
                <button
                  type="button"
                  onClick={() => useMyLocation("delivery")}
                  disabled={geoLocating === "delivery"}
                  className="shrink-0 h-11 px-3 rounded-xl text-xs font-display font-black transition-all"
                  style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}
                  data-testid="button-delivery-use-location"
                >
                  {geoLocating === "delivery" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "📍 My Location"}
                </button>
              </div>
              {(deliveryCity || deliveryState) && (
                <p className="text-[10px] text-cyan-400/70 flex items-center gap-1.5 mb-2">
                  <Check className="w-3 h-3" /> {deliveryCity}{deliveryCity && deliveryState ? `, ${deliveryState}` : deliveryState}
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="col-span-2">
                  <Label className="text-[10px] text-muted-foreground/30">City (auto-filled from ZIP)</Label>
                  <Input value={deliveryCity} onChange={e => setDeliveryCity(e.target.value)} placeholder="Los Angeles" className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm" data-testid="input-delivery-city" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground/30">State</Label>
                  <select
                    value={deliveryState}
                    onChange={e => setDeliveryState(e.target.value)}
                    className="mt-1 w-full h-10 rounded-xl bg-background/50 border border-border/50 text-sm px-3 text-foreground"
                    data-testid="select-delivery-state"
                  >
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <SectionLabel>Delivery Site Type</SectionLabel>
              <ChipGrid options={ACCESS_OPTIONS} value={deliveryAccess} multi onChange={setDeliveryAccess} />
            </div>

            <div>
              <SectionLabel>Delivery Availability</SectionLabel>
              <ChipGrid options={FLEXIBILITY_OPTIONS} value={deliveryFlexibility} onChange={setDeliveryFlexibility} />
            </div>

            <div>
              <Label className="text-[10px] text-muted-foreground/50">Estimated Miles (optional)</Label>
              <Input
                value={estimatedMiles}
                onChange={e => setEstimatedMiles(e.target.value)}
                placeholder="e.g. 1450"
                type="number"
                className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm"
                data-testid="input-estimated-miles"
              />
            </div>

            {/* Trailer preference */}
            <div>
              <SectionLabel>Trailer Preference</SectionLabel>
              <ChipGrid options={TRAILER_PREFS} value={trailerPreference} onChange={setTrailerPreference} />
            </div>

            {/* Loading / unloading */}
            <div>
              <SectionLabel>Loading Method</SectionLabel>
              <ChipGrid options={LOADING_METHODS} value={loadingMethod} multi onChange={setLoadingMethod} />
            </div>
            <div>
              <SectionLabel>Loading Assistance Available at Pickup</SectionLabel>
              <ChipGrid
                options={[
                  { value: "yes",     label: "Yes" },
                  { value: "no",      label: "No" },
                  { value: "unknown", label: "Unknown" },
                ]}
                value={loadingAssist}
                onChange={setLoadingAssist}
              />
            </div>
            <div>
              <SectionLabel>Unloading Method</SectionLabel>
              <ChipGrid options={UNLOADING_METHODS} value={unloadingMethod} multi onChange={setUnloadingMethod} />
            </div>
            <div>
              <SectionLabel>Unloading Assistance Available at Delivery</SectionLabel>
              <ChipGrid
                options={[
                  { value: "yes",     label: "Yes" },
                  { value: "no",      label: "No" },
                  { value: "unknown", label: "Unknown" },
                ]}
                value={unloadingAssist}
                onChange={setUnloadingAssist}
              />
            </div>
            <div>
              <SectionLabel>Dock / Ramp Available</SectionLabel>
              <ChipGrid
                options={[
                  { value: "yes",     label: "Yes" },
                  { value: "no",      label: "No" },
                  { value: "unknown", label: "Unknown" },
                ]}
                value={dockAvailable}
                onChange={setDockAvailable}
              />
            </div>
          </div>
        )}

        {/* ── Step 4: Add-ons ───────────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            <div
              className="rounded-2xl p-3 flex items-center gap-2.5"
              style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.2)" }}
            >
              <ShoppingCart className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-display font-bold text-cyan-300">
                  {addonFlags.length === 0 ? "No add-ons selected" : `${addonFlags.length} add-on${addonFlags.length > 1 ? "s" : ""} selected`}
                </p>
                {addonTotal > 0 && (
                  <p className="text-[10px] text-cyan-400/70 mt-0.5">
                    +${addonTotal} added to posting fee
                  </p>
                )}
              </div>
              {addonFlags.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAddonFlags([])}
                  className="text-[10px] font-display font-bold text-muted-foreground/40"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="space-y-2">
              {ADDON_OPTIONS.map(a => {
                const sel = addonFlags.includes(a.key);
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => {
                      setAddonFlags(f => sel ? f.filter(x => x !== a.key) : [...f, a.key]);
                    }}
                    className="w-full rounded-2xl p-3.5 text-left transition-all flex items-center gap-3"
                    style={sel ? CYAN_TILE_ACTIVE : CYAN_TILE_INACTIVE}
                    data-testid={`addon-${a.key}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-display font-bold text-foreground">{a.label}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Info className="w-2.5 h-2.5 text-muted-foreground/30 shrink-0" />
                        <p className="text-[9px] text-muted-foreground/40">{a.hint}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {a.price > 0 ? (
                        <p className={`text-sm font-display font-black ${sel ? "text-cyan-300" : "text-muted-foreground/50"}`}>
                          +${a.price}
                        </p>
                      ) : (
                        <p className="text-[10px] font-display font-bold text-muted-foreground/30">free signal</p>
                      )}
                      {sel && <Check className="w-3.5 h-3.5 text-cyan-400 mt-1 ml-auto" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="text-[10px] text-muted-foreground/30 text-center pt-2">
              Paid add-ons are charged at checkout after your load is posted.
            </p>
          </div>
        )}

        {/* ── Step 5: Pricing ───────────────────────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-5">
            <div>
              <SectionLabel>Pricing Mode</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "fixed",          label: "Fixed Price",     sub: "You set the rate" },
                  { value: "open_to_offers", label: "Open to Offers",  sub: "Carriers bid" },
                ].map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPricingMode(p.value)}
                    className="rounded-2xl p-3.5 text-left transition-all"
                    style={pricingMode === p.value ? CYAN_TILE_ACTIVE : CYAN_TILE_INACTIVE}
                    data-testid={`select-pricing-${p.value}`}
                  >
                    <p className="text-sm font-display font-bold text-foreground">{p.label}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">{p.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Rate suggestion */}
            {rateData?.low && rateData?.high && (
              <div
                className="rounded-2xl p-3.5"
                style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.2)" }}
                data-testid="card-rate-suggestion"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                  <p className="text-xs font-display font-black text-cyan-400 tracking-wide">GUBER RATE ESTIMATE</p>
                </div>
                <p className="text-2xl font-display font-black text-foreground">
                  ${rateData.low.toLocaleString()}
                  <span className="text-muted-foreground/40 text-lg"> – </span>
                  ${rateData.high.toLocaleString()}
                </p>
                <p className="text-[9px] text-muted-foreground/40 mt-0.5">
                  Based on {estimatedMiles} mi · {transportType} market rates
                </p>
                {pricingMode === "fixed" && (
                  <button
                    type="button"
                    onClick={() => setPostedPrice(String(Math.round((rateData.low! + rateData.high!) / 2)))}
                    className="mt-2 text-[10px] font-display font-black text-cyan-400 underline underline-offset-2"
                    data-testid="button-use-suggested-rate"
                  >
                    Use mid-point (${Math.round((rateData.low + rateData.high) / 2).toLocaleString()})
                  </button>
                )}
              </div>
            )}

            {pricingMode === "fixed" && (
              <div>
                <Label className="text-[10px] text-muted-foreground/50">Your Price ($)</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    value={postedPrice}
                    onChange={e => setPostedPrice(e.target.value)}
                    placeholder="0"
                    type="number"
                    className="rounded-xl h-12 bg-background/50 border-border/50 text-base pl-7"
                    data-testid="input-posted-price"
                  />
                </div>
              </div>
            )}

            {/* Urgent toggle */}
            {!addonFlags.includes("urgent_boost") && (
              <div className="flex items-center justify-between rounded-2xl p-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div>
                  <p className="text-sm font-display font-bold text-foreground">Mark as Urgent</p>
                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">Shown prominently — faster response</p>
                </div>
                <button
                  type="button"
                  onClick={() => setUrgent(!urgent)}
                  className="w-10 h-6 rounded-full transition-all shrink-0"
                  style={{ background: urgent ? "linear-gradient(135deg,#0891b2,#0e7490)" : "rgba(255,255,255,0.1)" }}
                  data-testid="toggle-urgent"
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow mx-1 transition-transform" style={{ transform: urgent ? "translateX(16px)" : "translateX(0)" }} />
                </button>
              </div>
            )}
            {addonFlags.includes("urgent_boost") && (
              <div className="rounded-xl p-3 flex items-center gap-2" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-400 font-display font-bold">Urgent Boost add-on active</p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 6: Review ────────────────────────────────────────────────── */}
        {step === 6 && (
          <div className="space-y-4">
            <p className="text-xs font-display font-bold text-muted-foreground/50 uppercase tracking-wider">Review Your Load</p>

            {/* Summary card */}
            <div className="rounded-2xl p-4 space-y-2.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(6,182,212,0.15)" }}>
              <Row label="Type" value={<span className="capitalize">{transportType}</span>} />
              <Row label="Asset" value={assetSummary()} />
              {ownershipProofStatus && <Row label="Ownership Proof" value={OWNERSHIP_PROOF.find(p => p.value === ownershipProofStatus)?.label || ownershipProofStatus} />}
              {vinVerified && <Row label="VIN" value={<span className="font-mono text-cyan-400 text-[10px]">{vin} ✓</span>} />}
              <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
              <Row label="Route" value={`${pickupZip ? `${pickupZip} ` : ""}${pickupCity}${pickupCity && pickupState ? `, ${pickupState}` : pickupState} → ${deliveryZip ? `${deliveryZip} ` : ""}${deliveryCity}${deliveryCity && deliveryState ? `, ${deliveryState}` : deliveryState}`} />
              {estimatedMiles && <Row label="Miles" value={`${parseInt(estimatedMiles).toLocaleString()} mi`} />}
              {pickupFlexibility && <Row label="Pickup" value={pickupFlexibility.replace(/_/g, " ")} />}
              {trailerPreference !== "any" && <Row label="Trailer" value={trailerPreference.replace(/_/g, " ")} />}
              <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
              <Row
                label="Pricing"
                value={pricingMode === "fixed" && postedPrice ? `$${parseFloat(postedPrice).toLocaleString()} fixed` : "Open to offers"}
              />
              {(urgent || addonFlags.includes("urgent_boost")) && (
                <Row label="Urgent" value={<span className="text-amber-400">⚡ Yes</span>} />
              )}
            </div>

            {/* Add-ons summary */}
            {addonFlags.length > 0 && (
              <div className="rounded-2xl p-4" style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)" }}>
                <p className="text-[10px] font-display font-black text-cyan-400/70 uppercase tracking-wider mb-2">Add-ons</p>
                {addonFlags.map(key => {
                  const a = ADDON_OPTIONS.find(x => x.key === key)!;
                  return (
                    <div key={key} className="flex justify-between items-center py-1">
                      <span className="text-xs text-foreground/80">{a?.label}</span>
                      {a?.price > 0
                        ? <span className="text-xs font-display font-black text-cyan-300">+${a.price}</span>
                        : <span className="text-[10px] text-muted-foreground/30">signal only</span>
                      }
                    </div>
                  );
                })}
                {addonTotal > 0 && (
                  <>
                    <div className="h-px my-2" style={{ background: "rgba(255,255,255,0.06)" }} />
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-display font-bold text-muted-foreground/60">Add-on Total</span>
                      <span className="text-sm font-display font-black text-cyan-300">+${addonTotal}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Privacy notice */}
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-[9px] text-muted-foreground/40 leading-relaxed">
                🔒 Your exact address and contact info are hidden until a carrier connects via paid checkout. Carriers see city/state only.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky footer ────────────────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 px-4 pb-safe-or-6 pt-3"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.95) 70%, transparent 100%)" }}
      >
        <div className="flex gap-2 max-w-lg mx-auto">
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl h-12 px-4 font-display font-black text-sm border-border/30"
              onClick={() => setStep(s => Math.max(1, s - 1) as Step)}
              data-testid="button-back"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
          {step < 6 ? (
            <Button
              type="button"
              className="flex-1 rounded-2xl h-12 font-display font-black text-sm tracking-wide"
              style={canAdvance() ? { background: "linear-gradient(135deg,#0891b2,#0e7490)" } : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)" }}
              onClick={advance}
              data-testid="button-next"
            >
              {step === 4 && addonFlags.length > 0
                ? `Continue · ${addonFlags.length} add-on${addonFlags.length > 1 ? "s" : ""}`
                : "Continue"
              }
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              type="button"
              className="flex-1 rounded-2xl h-12 font-display font-black text-sm tracking-wide"
              style={{ background: "linear-gradient(135deg,#0891b2,#0e7490)" }}
              onClick={handleSubmit}
              disabled={mutation.isPending}
              data-testid="button-post-load"
            >
              {mutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : `Post Load${addonTotal > 0 ? ` · +$${addonTotal}` : ""}`
              }
            </Button>
          )}
        </div>
      </div>
    </GuberLayout>
  );
}

// ── helper ────────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground/50 shrink-0">{label}</span>
      <span className="font-display font-bold text-foreground text-right">{value}</span>
    </div>
  );
}
