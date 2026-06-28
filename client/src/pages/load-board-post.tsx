import { useState, useCallback, useRef, useEffect } from "react";
import { readListingPrefill, clearListingPrefill } from "@/lib/jac-listing-prefill";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ExternalPurchaseSheet } from "@/components/external-purchase-sheet";
import { isIOS } from "@/lib/platform";
import { ChevronRight, ChevronLeft, Loader2, TrendingUp, Zap, Info, ShoppingCart, Check, ShieldCheck, AlertTriangle } from "lucide-react";

// ── GUBER Verified Release System™ — pricing payload types ──────────────────────

interface ProtectionPackage {
  key: string;
  name: string;
  blurb: string;
  valueRangeLabel: string;
  features: string[];
  priceCents: number;
  founderPriceCents: number;
  effectivePriceCents: number;
}
interface ProtectionPricing {
  founder: boolean;
  highValueThreshold: number;
  packages: ProtectionPackage[];
  witnessAddons: { key: string; name: string; blurb: string; priceCents: number; founderPriceCents: number; effectivePriceCents: number }[];
  foundersClub: {
    totalClaimed: number; capLimit: number; spotsRemaining: number;
    soldOut: boolean; currentPriceCents: number; founderPriceCents: number; standardPriceCents: number;
  };
}
interface ProtectionRecommendation {
  recommended: string | null;
  name: string;
  highValue: boolean;
  highValueThreshold: number;
  warning: string | null;
}
const fmtUsd = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

// ── style constants ────────────────────────────────────────────────────────────

const CYAN_ACTIVE   = { background: "linear-gradient(135deg,#0891b2,#0e7490)", color: "#fff" };
const CYAN_INACTIVE = { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" };
const CYAN_TILE_ACTIVE   = { background: "linear-gradient(135deg,rgba(8,145,178,0.25),rgba(14,116,144,0.15))", border: "1.5px solid rgba(6,182,212,0.5)" };
const CYAN_TILE_INACTIVE = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" };

// ── trailer types with neon color system ───────────────────────────────────────

const FREIGHT_TRAILER_TYPES = [
  {
    value: "dry_van",
    label: "Dry Van",
    icon: "🚚",
    sub: "Standard enclosed freight",
    accent: "#22c55e",
    activeBg: "linear-gradient(135deg,rgba(34,197,94,0.22),rgba(21,128,61,0.12))",
    activeBorder: "1.5px solid rgba(34,197,94,0.55)",
  },
  {
    value: "reefer",
    label: "Reefer",
    icon: "❄️",
    sub: "Temperature-controlled loads",
    accent: "#3b82f6",
    activeBg: "linear-gradient(135deg,rgba(59,130,246,0.22),rgba(37,99,235,0.12))",
    activeBorder: "1.5px solid rgba(59,130,246,0.55)",
  },
  {
    value: "flatbed",
    label: "Flatbed",
    icon: "🏗️",
    sub: "Open deck — oversize, steel",
    accent: "#f97316",
    activeBg: "linear-gradient(135deg,rgba(249,115,22,0.22),rgba(234,88,12,0.12))",
    activeBorder: "1.5px solid rgba(249,115,22,0.55)",
  },
  {
    value: "conestoga",
    label: "Conestoga",
    icon: "📦",
    sub: "Rolling tarp system",
    accent: "#a78bfa",
    activeBg: "linear-gradient(135deg,rgba(139,92,246,0.22),rgba(124,58,237,0.12))",
    activeBorder: "1.5px solid rgba(139,92,246,0.55)",
  },
  {
    value: "hotshot",
    label: "Hotshot",
    icon: "🔥",
    sub: "Time-sensitive partial loads",
    accent: "#ef4444",
    activeBg: "linear-gradient(135deg,rgba(239,68,68,0.22),rgba(220,38,38,0.12))",
    activeBorder: "1.5px solid rgba(239,68,68,0.55)",
  },
  {
    value: "power_only",
    label: "Power Only",
    icon: "🚛",
    sub: "Carrier hooks to your trailer",
    accent: "#22d3ee",
    activeBg: "linear-gradient(135deg,rgba(6,182,212,0.22),rgba(8,145,178,0.12))",
    activeBorder: "1.5px solid rgba(6,182,212,0.55)",
  },
  {
    value: "step_deck",
    label: "Step Deck",
    icon: "📏",
    sub: "Tall or oversized freight",
    accent: "#facc15",
    activeBg: "linear-gradient(135deg,rgba(234,179,8,0.22),rgba(202,138,4,0.12))",
    activeBorder: "1.5px solid rgba(234,179,8,0.55)",
  },
  {
    value: "lowboy_rgn",
    label: "Lowboy / RGN",
    icon: "🏋️",
    sub: "Heavy haul & tall equipment",
    accent: "#fbbf24",
    activeBg: "linear-gradient(135deg,rgba(245,158,11,0.22),rgba(217,119,6,0.12))",
    activeBorder: "1.5px solid rgba(245,158,11,0.55)",
  },
  {
    value: "car_hauler",
    label: "Car Hauler",
    icon: "🚗",
    sub: "Vehicle transport",
    accent: "#f472b6",
    activeBg: "linear-gradient(135deg,rgba(236,72,153,0.22),rgba(219,39,119,0.12))",
    activeBorder: "1.5px solid rgba(236,72,153,0.55)",
  },
  {
    value: "other",
    label: "Other",
    icon: "📦",
    sub: "Custom or specialty freight",
    accent: "#9ca3af",
    activeBg: "linear-gradient(135deg,rgba(107,114,128,0.22),rgba(75,85,99,0.12))",
    activeBorder: "1.5px solid rgba(107,114,128,0.55)",
  },
];

// ── commodity types ────────────────────────────────────────────────────────────

const COMMODITY_TYPES = [
  "Auto Parts", "Building Materials", "Chemicals", "Consumer Goods",
  "Electronics", "Food & Beverage", "Furniture", "Hazmat",
  "Industrial Equipment", "Lumber", "Machinery", "Medical Supplies",
  "Metal / Steel", "Paper / Cardboard", "Produce", "Retail Goods",
  "Textiles", "Tools", "Other",
];

const VEHICLE_TYPES_HAULER = [
  { value: "car",       label: "Car" },
  { value: "truck",     label: "Truck" },
  { value: "suv",       label: "SUV" },
  { value: "motorcycle",label: "Motorcycle" },
  { value: "atv",       label: "ATV" },
  { value: "equipment", label: "Equipment" },
];

const ADDON_OPTIONS: { key: string; label: string; price: number; hint: string }[] = [
  { key: "urgent_boost",         label: "⚡ Urgent Boost",           price: 10, hint: "Pin your listing at the top for faster responses" },
  { key: "premium_carrier_only", label: "🛡️ Verified Carriers Only", price: 10, hint: "Restrict offers to GUBER-credentialed carriers" },
  { key: "photo_proof",          label: "📸 Photo Proof at Pickup",   price: 25, hint: "GUBER helper documents freight before transport" },
  { key: "loading_help",         label: "🤝 Loading Assistance",      price: 10, hint: "GUBER helper assists with loading freight onto carrier" },
  { key: "unloading_help",       label: "🤝 Unloading Assistance",    price: 10, hint: "GUBER helper assists with unloading at destination" },
  { key: "gps_tracking",         label: "📡 GPS Tracking",            price: 15, hint: "Real-time location updates during transport" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

// ── helpers ────────────────────────────────────────────────────────────────────

function ChipGrid({ options, value, multi, onChange }: {
  options: (string | { value: string; label: string })[];
  value: string | string[];
  multi?: boolean;
  onChange: (v: any) => void;
}) {
  const normalize = (o: string | { value: string; label: string }) =>
    typeof o === "string" ? { value: o, label: o } : o;
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
            className="rounded-xl px-3 py-1.5 text-xs font-display font-bold transition-all"
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

function YesNoToggle({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="flex gap-2">
        {["Yes", "No"].map(opt => {
          const v = opt.toLowerCase();
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className="flex-1 rounded-xl py-2.5 text-sm font-display font-black transition-all"
              style={value === v ? CYAN_ACTIVE : CYAN_INACTIVE}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NumInput({ label, value, onChange, placeholder, unit }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; unit?: string;
}) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground/50">{label}</Label>
      <div className="relative mt-1">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || "0"}
          type="number"
          className="rounded-xl h-11 bg-background/50 border-border/50 text-sm"
          style={unit ? { paddingRight: "2.5rem" } : {}}
        />
        {unit && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/40 font-display font-bold">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

// ── VIN decode ─────────────────────────────────────────────────────────────────

async function decodeVin(vin: string) {
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`);
    const json = await res.json();
    const r = json?.Results?.[0];
    if (!r || r.ErrorCode !== "0") return null;
    return { year: r.ModelYear || "", make: r.Make || "", model: r.Model || "" };
  } catch { return null; }
}

// ── main component ─────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5 | 6;

export default function LoadBoardPost() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);

  // Step 1 — trailer type
  // statebleed-allow: JAC prefill sets trailerType + all scoped fields together atomically
  const [freightTrailerType, setFreightTrailerType] = useState("");

  // Step 2 — route
  const [pickupZip,    setPickupZip]    = useState("");
  const [pickupCity,   setPickupCity]   = useState("");
  const [pickupState,  setPickupState]  = useState("TX");
  const [deliveryZip,  setDeliveryZip]  = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryState,setDeliveryState]= useState("CA");
  const [pickupDate,   setPickupDate]   = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [geoLocating,  setGeoLocating]  = useState<"pickup"|"delivery"|null>(null);
  const [estimatedMiles, setEstimatedMiles] = useState("");

  // Step 3 — common fields
  const [commodityType, setCommodityType] = useState("");
  const [weightLbs,     setWeightLbs]     = useState("");
  const [notes,         setNotes]         = useState("");

  // Dry Van fields
  const [palletCount,       setPalletCount]       = useState("");
  const [dockPickup,        setDockPickup]        = useState("");
  const [dockDelivery,      setDockDelivery]      = useState("");
  const [liftgateRequired,  setLiftgateRequired]  = useState("");

  // Reefer fields
  const [tempRequired, setTempRequired] = useState("");
  const [tempValue,    setTempValue]    = useState("");

  // Flatbed / Step Deck / Conestoga / Lowboy fields
  const [dimLength,    setDimLength]    = useState("");
  const [dimWidth,     setDimWidth]     = useState("");
  const [dimHeight,    setDimHeight]    = useState("");
  const [tarpRequired, setTarpRequired] = useState("");
  const [chainsRequired,setChains]      = useState("");
  const [strapsRequired,setStraps]      = useState("");
  const [oversized,    setOversized]    = useState("");
  const [permitRequired,setPermit]      = useState("");
  const [escortRequired,setEscort]      = useState("");
  const [weatherSensitive,setWeather]   = useState("");
  const [sideLoadRequired,setSideLoad]  = useState("");
  const [dockLoad,     setDockLoad]     = useState("");

  // Hotshot fields
  const [hotshotTrailerType, setHotshotTrailerType] = useState("");

  // Power Only fields
  const [powerOnlyTrailerType, setPowerOnlyTrailerType] = useState("");
  const [trailerNumber,        setTrailerNumber]         = useState("");

  // Car Hauler fields
  const [vehicleCount,  setVehicleCount]  = useState("");
  const [carrierType,   setCarrierType]   = useState("");
  const [vehicleType,   setVehicleType]   = useState("");
  const [vin,           setVin]           = useState("");
  const [vinDecoding,   setVinDecoding]   = useState(false);
  const [vinVerified,   setVinVerified]   = useState(false);
  const [year,          setYear]          = useState("");
  const [make,          setMake]          = useState("");
  const [model,         setModel]         = useState("");
  const [vehicleRunning,setVehicleRunning]= useState("");
  const [ownershipProofStatus, setOwnershipProofStatus] = useState("");

  // Other fields
  const [customFreightType, setCustomFreightType] = useState("");

  // Live refs so async callbacks (e.g. VIN decode) can read the *current*
  // trailer type / VIN and discard results that arrived after a type switch.
  const freightTrailerTypeRef = useRef(freightTrailerType);
  freightTrailerTypeRef.current = freightTrailerType;
  const vinRef = useRef(vin);
  vinRef.current = vin;

  // Step 4 — add-ons
  const [addonFlags, setAddonFlags] = useState<string[]>([]);

  // Step 5 — pricing
  const [pricingMode, setPricingMode] = useState("fixed");
  const [postedPrice, setPostedPrice] = useState("");
  const [urgent,      setUrgent]      = useState(false);

  // Step 5 — GUBER Verified Release System™ (additive asset protection)
  const [protectionEnabled, setProtectionEnabled] = useState(false);
  const [assetValue,        setAssetValue]        = useState("");
  const [selectedPackage,   setSelectedPackage]   = useState("");
  // After the load (+ protected asset) is created, this holds the asset id so
  // the iOS ExternalPurchaseSheet can mount with the right options and fire.
  const [pendingProtection, setPendingProtection] = useState<number | null>(null);
  const iosPurchaseRef = useRef<(() => void) | null>(null);

  // ── JAC prefill: auto-populate from listing-collect conversation ──
  useEffect(() => {
    const prefill = readListingPrefill();
    if (!prefill || prefill.type !== "load") return;
    const c = prefill.collected;
    clearListingPrefill();
    if (c.trailer_type) setFreightTrailerType(c.trailer_type);
    if (c.pickup_zip) setPickupZip(String(c.pickup_zip));
    if (c.delivery_zip) setDeliveryZip(String(c.delivery_zip));
    if (c.commodity_type) setCommodityType(c.commodity_type);
    if (c.weight_lbs) setWeightLbs(String(c.weight_lbs));
    if (c.notes) setNotes(c.notes);
    if (c.trailer_type) setStep(2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pendingProtection != null && isIOS) iosPurchaseRef.current?.();
  }, [pendingProtection]);

  // ── ZIP lookup ──────────────────────────────────────────────────────────────

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

  const useMyLocation = useCallback((target: "pickup" | "delivery") => {
    if (!navigator.geolocation) {
      toast({ variant: "destructive", title: "Location unavailable" });
      return;
    }
    setGeoLocating(target);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `/api/places/reverse-geocode?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&caller=load-board-post`,
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

  // ── VIN decode ──────────────────────────────────────────────────────────────

  const handleVinDecode = useCallback(async () => {
    if (vin.length < 11) return;
    const vinAtStart = vin;
    setVinDecoding(true);
    const decoded = await decodeVin(vin);
    setVinDecoding(false);
    // Ignore stale results: the user may have switched trailer type (which
    // resets VIN + vehicle fields) or edited the VIN while the decode was in
    // flight. Applying old results here would re-leak car-hauler data.
    if (freightTrailerTypeRef.current !== "car_hauler" || vinRef.current !== vinAtStart) return;
    if (decoded) {
      if (decoded.year)  setYear(decoded.year);
      if (decoded.make)  setMake(decoded.make);
      if (decoded.model) setModel(decoded.model);
      setVinVerified(true);
      toast({ title: "VIN decoded", description: `${decoded.year} ${decoded.make} ${decoded.model}` });
    } else {
      toast({ variant: "destructive", title: "VIN not found" });
    }
  }, [vin, toast]);

  // ── rate suggestion ─────────────────────────────────────────────────────────

  const { data: rateData } = useQuery<{ low: number | null; high: number | null }>({
    queryKey: ["/api/load-board/rate-suggest", freightTrailerType, estimatedMiles],
    queryFn: async () => {
      const m = parseInt(estimatedMiles) || 0;
      if (!freightTrailerType || m <= 0) return { low: null, high: null };
      const res = await fetch(`/api/load-board/rate-suggest?transportType=${freightTrailerType}&miles=${m}`);
      return res.json();
    },
    enabled: !!freightTrailerType && parseInt(estimatedMiles) > 0,
  });

  // ── asset protection pricing + recommendation ────────────────────────────────

  const { data: protectionPricing } = useQuery<ProtectionPricing>({
    queryKey: ["/api/asset-protection/pricing"],
    enabled: protectionEnabled,
  });

  const numericValue = parseFloat(assetValue) || 0;
  const { data: protectionRec } = useQuery<ProtectionRecommendation>({
    queryKey: ["/api/asset-protection/recommend", numericValue],
    queryFn: async () => {
      const res = await fetch(`/api/asset-protection/recommend?value=${numericValue}`, { credentials: "include" });
      return res.json();
    },
    enabled: protectionEnabled && numericValue > 0,
  });

  // ── computed ────────────────────────────────────────────────────────────────

  const addonTotal = addonFlags.reduce((sum, key) => {
    const a = ADDON_OPTIONS.find(x => x.key === key);
    return sum + (a?.price || 0);
  }, 0);

  const activeType = FREIGHT_TRAILER_TYPES.find(t => t.value === freightTrailerType);

  // ── submit ──────────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/load-board", data),
    onSuccess: async (res: any) => {
      const json = await res.json();
      // Verified Release System™: if the poster opted in and picked a package,
      // continue straight into the (Stripe) purchase. The protected asset was
      // already created server-side and returned as json.asset.
      if (protectionEnabled && selectedPackage && json.asset?.id) {
        if (isIOS) {
          // Mount the ExternalPurchaseSheet (Apple disclosure) for this asset;
          // the effect fires its onPress once it has rendered.
          setPendingProtection(json.asset.id);
          return;
        }
        try {
          const r = await apiRequest("POST", "/api/asset-protection/checkout", {
            assetId: json.asset.id,
            productType: "package",
            key: selectedPackage,
          });
          const d = await r.json();
          if (d?.checkoutUrl) {
            window.location.href = d.checkoutUrl;
            return;
          }
        } catch {
          // Fall through to the listing — they can finish protection there.
        }
        toast({ title: "Load posted", description: "Finish asset protection from your load page." });
        navigate(`/load-board/${json.listing.id}`);
        return;
      }
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
    if (!freightTrailerType || !hasPickup || !hasDelivery) {
      toast({ variant: "destructive", title: "Required fields missing", description: "Select trailer type and enter pickup/delivery locations." });
      return;
    }
    mutation.mutate({
      transportType: freightTrailerType,
      freightTrailerType,
      commodityType:        commodityType || undefined,
      weightLbs:            weightLbs ? parseFloat(weightLbs) : undefined,
      palletCount:          palletCount ? parseInt(palletCount) : undefined,
      dockPickup:           dockPickup === "yes" ? true : dockPickup === "no" ? false : undefined,
      dockDelivery:         dockDelivery === "yes" ? true : dockDelivery === "no" ? false : undefined,
      liftgateRequired:     liftgateRequired === "yes" ? true : liftgateRequired === "no" ? false : undefined,
      tempRequired:         tempRequired || undefined,
      tempValue:            tempValue || undefined,
      dimensionsLength:     dimLength ? parseFloat(dimLength) : undefined,
      dimensionsWidth:      dimWidth ? parseFloat(dimWidth) : undefined,
      dimensionsHeight:     dimHeight ? parseFloat(dimHeight) : undefined,
      tarpRequired:         tarpRequired === "yes" ? true : tarpRequired === "no" ? false : undefined,
      chainsRequired:       chainsRequired === "yes" ? true : chainsRequired === "no" ? false : undefined,
      strapsRequired:       strapsRequired === "yes" ? true : strapsRequired === "no" ? false : undefined,
      oversized:            oversized === "yes" ? true : oversized === "no" ? false : undefined,
      permitRequired:       permitRequired === "yes" ? true : permitRequired === "no" ? false : undefined,
      escortRequired:       escortRequired === "yes" ? true : escortRequired === "no" ? false : undefined,
      weatherSensitive:     weatherSensitive === "yes" ? true : weatherSensitive === "no" ? false : undefined,
      sideLoadRequired:     sideLoadRequired === "yes" ? true : sideLoadRequired === "no" ? false : undefined,
      hotshotTrailerType:   hotshotTrailerType || undefined,
      powerOnlyTrailerType: powerOnlyTrailerType || undefined,
      trailerNumber:        trailerNumber || undefined,
      vehicleCount:         vehicleCount ? parseInt(vehicleCount) : undefined,
      carrierType:          carrierType || undefined,
      vehicleType:          vehicleType || undefined,
      vin:                  vin || undefined,
      vinVerified,
      year:                 year || undefined,
      make:                 make || undefined,
      model:                model || undefined,
      vehicleCondition:     vehicleRunning ? [vehicleRunning === "yes" ? "runs_drives" : "inop"] : undefined,
      ownershipProofStatus: ownershipProofStatus || undefined,
      customFreightType:    customFreightType || undefined,
      pickupDate:           pickupDate || undefined,
      deliveryDate:         deliveryDate || undefined,
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
      notes:           notes || undefined,
      // Verified Release System™ — additive asset protection opt-in.
      protectionRequested: protectionEnabled || undefined,
      assetProtectionType: protectionEnabled
        ? (freightTrailerType === "car_hauler" ? "vehicle" : "freight")
        : undefined,
      estimatedValue: protectionEnabled && numericValue > 0 ? numericValue : undefined,
    });
  }

  // ── step validation ──────────────────────────────────────────────────────────

  function canAdvance() {
    if (step === 1) return !!freightTrailerType;
    if (step === 2) return !!(
      (pickupZip.length === 5 || (pickupCity && pickupState)) &&
      (deliveryZip.length === 5 || (deliveryCity && deliveryState))
    );
    return true;
  }

  function advance() {
    if (!canAdvance()) {
      toast({ variant: "destructive", title: "Please complete required fields" });
      return;
    }
    setStep(s => Math.min(6, s + 1) as Step);
  }

  // ── trailer-type selection ─────────────────────────────────────────────────
  // Changing the trailer type wipes every Step 3 type-specific field so values
  // from one trailer type can't bleed into another (UI or submitted payload).
  // Re-tapping the same type is a no-op and preserves what the user entered.
  // Route (Step 2), add-ons (Step 4) and pricing (Step 5) intentionally persist.
  function selectTrailerType(value: string) {
    if (value === freightTrailerType) return;
    setFreightTrailerType(value);
    // common detail fields
    setCommodityType("");
    setWeightLbs("");
    // dry van
    setPalletCount(""); setDockPickup(""); setDockDelivery(""); setLiftgateRequired("");
    // reefer
    setTempRequired(""); setTempValue("");
    // flatbed / step deck / conestoga / lowboy
    setDimLength(""); setDimWidth(""); setDimHeight("");
    setTarpRequired(""); setChains(""); setStraps(""); setOversized("");
    setPermit(""); setEscort(""); setWeather(""); setSideLoad(""); setDockLoad("");
    // hotshot
    setHotshotTrailerType("");
    // power only
    setPowerOnlyTrailerType(""); setTrailerNumber("");
    // car hauler
    setVehicleCount(""); setCarrierType(""); setVehicleType("");
    setVin(""); setVinDecoding(false); setVinVerified(false);
    setYear(""); setMake(""); setModel(""); setVehicleRunning(""); setOwnershipProofStatus("");
    // other
    setCustomFreightType("");
  }

  // ── step config ──────────────────────────────────────────────────────────────

  const STEPS = [
    { num: 1, label: "Type" },
    { num: 2, label: "Route" },
    { num: 3, label: "Details" },
    { num: 4, label: "Add-ons" },
    { num: 5, label: "Pricing" },
    { num: 6, label: "Review" },
  ];

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
                style={step >= s.num
                  ? (activeType ? { background: `linear-gradient(135deg,${activeType.accent}cc,${activeType.accent}88)`, color: "#fff" } : CYAN_ACTIVE)
                  : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.25)" }
                }
              >
                {step > s.num ? <Check className="w-3 h-3" /> : s.num}
              </div>
              <span className={`text-[9px] font-display font-bold hidden sm:block ${step >= s.num ? "text-white/50" : "text-muted-foreground/20"}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-px" style={{ background: step > s.num ? (activeType ? `${activeType.accent}44` : "rgba(6,182,212,0.3)") : "rgba(255,255,255,0.06)" }} />
              )}
            </div>
          ))}
        </div>

        {/* ── Step 1: Trailer Type ──────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-3">
            <SectionLabel>What type of trailer is needed?</SectionLabel>
            <div className="grid grid-cols-2 gap-2.5">
              {FREIGHT_TRAILER_TYPES.map(t => {
                const sel = freightTrailerType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => selectTrailerType(t.value)}
                    className="rounded-2xl p-3.5 text-left transition-all active:scale-95"
                    style={sel
                      ? { background: t.activeBg, border: t.activeBorder }
                      : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }
                    }
                    data-testid={`select-trailer-${t.value}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{t.icon}</span>
                      {sel && (
                        <div
                          className="ml-auto w-4 h-4 rounded-full flex items-center justify-center"
                          style={{ background: t.accent }}
                        >
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-display font-black text-foreground" style={sel ? { color: t.accent } : {}}>
                      {t.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground/40 mt-0.5 leading-tight">{t.sub}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Step 2: Route ─────────────────────────────────────────────────── */}
        {step === 2 && (
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
                <p className="text-[10px] text-cyan-400/70 flex items-center gap-1.5 mb-3">
                  <Check className="w-3 h-3" /> {pickupCity}{pickupCity && pickupState ? `, ${pickupState}` : pickupState}
                </p>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label className="text-[10px] text-muted-foreground/30">City (auto-filled)</Label>
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
                <p className="text-[10px] text-cyan-400/70 flex items-center gap-1.5 mb-3">
                  <Check className="w-3 h-3" /> {deliveryCity}{deliveryCity && deliveryState ? `, ${deliveryState}` : deliveryState}
                </p>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label className="text-[10px] text-muted-foreground/30">City (auto-filled)</Label>
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
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] text-muted-foreground/50">Pickup Date</Label>
                <Input
                  value={pickupDate}
                  onChange={e => setPickupDate(e.target.value)}
                  type="date"
                  className="mt-1 rounded-xl h-11 bg-background/50 border-border/50 text-sm"
                  data-testid="input-pickup-date"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground/50">Delivery Date</Label>
                <Input
                  value={deliveryDate}
                  onChange={e => setDeliveryDate(e.target.value)}
                  type="date"
                  className="mt-1 rounded-xl h-11 bg-background/50 border-border/50 text-sm"
                  data-testid="input-delivery-date"
                />
              </div>
            </div>

            {/* Estimated miles */}
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
          </div>
        )}

        {/* ── Step 3: Load Details ──────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">

            {/* Commodity — general freight only. Hidden for car haulers, whose
                load is described by the vehicle-specific inputs below. */}
            {freightTrailerType !== "car_hauler" && (
              <div>
                <SectionLabel>Commodity Type</SectionLabel>
                <ChipGrid options={COMMODITY_TYPES} value={commodityType} onChange={setCommodityType} />
              </div>
            )}

            {/* ── DRY VAN ── */}
            {freightTrailerType === "dry_van" && (
              <>
                <NumInput label="Weight (lbs)" value={weightLbs} onChange={setWeightLbs} placeholder="e.g. 42000" unit="lbs" />
                <NumInput label="Pallet Count" value={palletCount} onChange={setPalletCount} placeholder="e.g. 26" unit="pallets" />
                <YesNoToggle label="Dock Pickup?" value={dockPickup} onChange={setDockPickup} />
                <YesNoToggle label="Dock Delivery?" value={dockDelivery} onChange={setDockDelivery} />
                <YesNoToggle label="Liftgate Required?" value={liftgateRequired} onChange={setLiftgateRequired} />
              </>
            )}

            {/* ── REEFER ── */}
            {freightTrailerType === "reefer" && (
              <>
                <NumInput label="Weight (lbs)" value={weightLbs} onChange={setWeightLbs} placeholder="e.g. 38000" unit="lbs" />
                <NumInput label="Pallet Count" value={palletCount} onChange={setPalletCount} placeholder="e.g. 22" unit="pallets" />
                <div>
                  <SectionLabel>Temperature Required</SectionLabel>
                  <ChipGrid
                    options={[
                      { value: "frozen",  label: "❄️ Frozen" },
                      { value: "chilled", label: "🧊 Chilled" },
                      { value: "fresh",   label: "🥬 Fresh" },
                      { value: "custom",  label: "🌡️ Custom" },
                    ]}
                    value={tempRequired}
                    onChange={setTempRequired}
                  />
                </div>
                {tempRequired === "custom" && (
                  <div>
                    <Label className="text-[10px] text-muted-foreground/50">Temperature Value (°F)</Label>
                    <Input
                      value={tempValue}
                      onChange={e => setTempValue(e.target.value)}
                      placeholder="e.g. 34°F"
                      className="mt-1 rounded-xl h-11 bg-background/50 border-border/50 text-sm"
                      data-testid="input-temp-value"
                    />
                  </div>
                )}
                <YesNoToggle label="Dock Pickup?" value={dockPickup} onChange={setDockPickup} />
                <YesNoToggle label="Dock Delivery?" value={dockDelivery} onChange={setDockDelivery} />
              </>
            )}

            {/* ── FLATBED ── */}
            {freightTrailerType === "flatbed" && (
              <>
                <NumInput label="Weight (lbs)" value={weightLbs} onChange={setWeightLbs} placeholder="e.g. 44000" unit="lbs" />
                <div className="grid grid-cols-3 gap-2">
                  <NumInput label='Length (ft)' value={dimLength} onChange={setDimLength} placeholder="48" unit="ft" />
                  <NumInput label='Width (ft)'  value={dimWidth}  onChange={setDimWidth}  placeholder="8.5" unit="ft" />
                  <NumInput label='Height (ft)' value={dimHeight} onChange={setDimHeight} placeholder="8.5" unit="ft" />
                </div>
                <YesNoToggle label="Tarp Required?" value={tarpRequired} onChange={setTarpRequired} />
                <YesNoToggle label="Chains Required?" value={chainsRequired} onChange={setChains} />
                <YesNoToggle label="Straps Required?" value={strapsRequired} onChange={setStraps} />
                <YesNoToggle label="Oversized Load?" value={oversized} onChange={setOversized} />
              </>
            )}

            {/* ── CONESTOGA ── */}
            {freightTrailerType === "conestoga" && (
              <>
                <NumInput label="Weight (lbs)" value={weightLbs} onChange={setWeightLbs} placeholder="e.g. 44000" unit="lbs" />
                <div className="grid grid-cols-3 gap-2">
                  <NumInput label='Length (ft)' value={dimLength} onChange={setDimLength} placeholder="48" unit="ft" />
                  <NumInput label='Width (ft)'  value={dimWidth}  onChange={setDimWidth}  placeholder="8.5" unit="ft" />
                  <NumInput label='Height (ft)' value={dimHeight} onChange={setDimHeight} placeholder="8.5" unit="ft" />
                </div>
                <YesNoToggle label="Weather Sensitive?" value={weatherSensitive} onChange={setWeather} />
                <YesNoToggle label="Side Load Required?" value={sideLoadRequired} onChange={setSideLoad} />
                <YesNoToggle label="Dock Load?" value={dockLoad} onChange={setDockLoad} />
              </>
            )}

            {/* ── HOTSHOT ── */}
            {freightTrailerType === "hotshot" && (
              <>
                <NumInput label="Weight (lbs)" value={weightLbs} onChange={setWeightLbs} placeholder="e.g. 16500" unit="lbs" />
                <div className="grid grid-cols-3 gap-2">
                  <NumInput label='Length (ft)' value={dimLength} onChange={setDimLength} placeholder="40" unit="ft" />
                  <NumInput label='Width (ft)'  value={dimWidth}  onChange={setDimWidth}  placeholder="8" unit="ft" />
                  <NumInput label='Height (ft)' value={dimHeight} onChange={setDimHeight} placeholder="6" unit="ft" />
                </div>
                <div>
                  <SectionLabel>Trailer Type</SectionLabel>
                  <ChipGrid
                    options={[
                      { value: "bumper_pull", label: "Bumper Pull" },
                      { value: "gooseneck",   label: "Gooseneck" },
                    ]}
                    value={hotshotTrailerType}
                    onChange={setHotshotTrailerType}
                  />
                </div>
              </>
            )}

            {/* ── POWER ONLY ── */}
            {freightTrailerType === "power_only" && (
              <>
                <div
                  className="rounded-xl p-3 flex items-center gap-2"
                  style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.2)" }}
                >
                  <p className="text-xs text-cyan-300 font-display font-bold">✅ Trailer provided — carrier needs power unit only</p>
                </div>
                <div>
                  <SectionLabel>Trailer Type</SectionLabel>
                  <ChipGrid
                    options={[
                      { value: "dry_van",   label: "Dry Van" },
                      { value: "reefer",    label: "Reefer" },
                      { value: "flatbed",   label: "Flatbed" },
                      { value: "conestoga", label: "Conestoga" },
                      { value: "step_deck", label: "Step Deck" },
                      { value: "lowboy",    label: "Lowboy" },
                    ]}
                    value={powerOnlyTrailerType}
                    onChange={setPowerOnlyTrailerType}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground/50">Trailer Number (optional)</Label>
                  <Input
                    value={trailerNumber}
                    onChange={e => setTrailerNumber(e.target.value)}
                    placeholder="e.g. TR-48291"
                    className="mt-1 rounded-xl h-11 bg-background/50 border-border/50 text-sm font-mono"
                    data-testid="input-trailer-number"
                  />
                </div>
              </>
            )}

            {/* ── STEP DECK ── */}
            {freightTrailerType === "step_deck" && (
              <>
                <NumInput label="Weight (lbs)" value={weightLbs} onChange={setWeightLbs} placeholder="e.g. 46000" unit="lbs" />
                <div className="grid grid-cols-3 gap-2">
                  <NumInput label='Length (ft)' value={dimLength} onChange={setDimLength} placeholder="48" unit="ft" />
                  <NumInput label='Width (ft)'  value={dimWidth}  onChange={setDimWidth}  placeholder="8.5" unit="ft" />
                  <NumInput label='Height (ft)' value={dimHeight} onChange={setDimHeight} placeholder="10" unit="ft" />
                </div>
                <YesNoToggle label="Oversized Load?" value={oversized} onChange={setOversized} />
                <YesNoToggle label="Chains Required?" value={chainsRequired} onChange={setChains} />
                <YesNoToggle label="Tarp Required?" value={tarpRequired} onChange={setTarpRequired} />
              </>
            )}

            {/* ── LOWBOY / RGN ── */}
            {freightTrailerType === "lowboy_rgn" && (
              <>
                <div>
                  <SectionLabel>Equipment Type</SectionLabel>
                  <ChipGrid
                    options={[
                      "Excavator", "Bulldozer", "Crane", "Forklift",
                      "Generator", "Transformer", "Other Heavy",
                    ]}
                    value={customFreightType}
                    onChange={setCustomFreightType}
                  />
                </div>
                <NumInput label="Weight (lbs)" value={weightLbs} onChange={setWeightLbs} placeholder="e.g. 80000" unit="lbs" />
                <div className="grid grid-cols-3 gap-2">
                  <NumInput label='Length (ft)' value={dimLength} onChange={setDimLength} placeholder="53" unit="ft" />
                  <NumInput label='Width (ft)'  value={dimWidth}  onChange={setDimWidth}  placeholder="8.5" unit="ft" />
                  <NumInput label='Height (ft)' value={dimHeight} onChange={setDimHeight} placeholder="11" unit="ft" />
                </div>
                <YesNoToggle label="Oversized Load?" value={oversized} onChange={setOversized} />
                <YesNoToggle label="Permit Required?" value={permitRequired} onChange={setPermit} />
                <YesNoToggle label="Escort Required?" value={escortRequired} onChange={setEscort} />
              </>
            )}

            {/* ── CAR HAULER ── */}
            {freightTrailerType === "car_hauler" && (
              <>
                <NumInput label="Number of Vehicles" value={vehicleCount} onChange={setVehicleCount} placeholder="1" unit="vehicles" />
                <div>
                  <SectionLabel>Carrier Type</SectionLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "open",     label: "🔓 Open Carrier",    sub: "Standard, cost-effective" },
                      { value: "enclosed", label: "🔒 Enclosed Carrier", sub: "Full protection" },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setCarrierType(opt.value)}
                        className="rounded-2xl p-3 text-left transition-all"
                        style={carrierType === opt.value ? CYAN_TILE_ACTIVE : CYAN_TILE_INACTIVE}
                        data-testid={`select-carrier-type-${opt.value}`}
                      >
                        <p className="text-sm font-display font-bold text-foreground">{opt.label}</p>
                        <p className="text-[9px] text-muted-foreground/40 mt-0.5">{opt.sub}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <SectionLabel>Vehicle Type</SectionLabel>
                  <ChipGrid options={VEHICLE_TYPES_HAULER} value={vehicleType} onChange={setVehicleType} />
                </div>
                <div>
                  <SectionLabel>VIN (optional)</SectionLabel>
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
                      <Check className="w-3 h-3" /> {year} {make} {model}
                    </p>
                  )}
                </div>
                <YesNoToggle label="Vehicle Running?" value={vehicleRunning} onChange={setVehicleRunning} />

                {/* Ownership proof */}
                <div>
                  <SectionLabel>Proof of Ownership</SectionLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "title_in_hand",   label: "📄 Title In Hand",      sub: "Original title available" },
                      { value: "bill_of_sale",    label: "🧾 Bill of Sale",        sub: "Recent purchase doc" },
                      { value: "auction_invoice", label: "🏷️ Auction Invoice",     sub: "Auction house paperwork" },
                      { value: "dealer_owned",    label: "🏢 Dealer Owned",        sub: "Dealership vehicle" },
                      { value: "lienholder",      label: "🏦 Lienholder",          sub: "Bank or finance company" },
                      { value: "not_ready",       label: "⏳ Proof Pending",       sub: "Docs not yet in hand" },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setOwnershipProofStatus(prev => prev === opt.value ? "" : opt.value)}
                        className="rounded-2xl p-3 text-left transition-all"
                        style={ownershipProofStatus === opt.value ? CYAN_TILE_ACTIVE : CYAN_TILE_INACTIVE}
                        data-testid={`select-proof-${opt.value}`}
                      >
                        <p className="text-sm font-display font-bold text-foreground">{opt.label}</p>
                        <p className="text-[9px] text-muted-foreground/40 mt-0.5">{opt.sub}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── OTHER ── */}
            {freightTrailerType === "other" && (
              <>
                <div>
                  <Label className="text-[10px] text-muted-foreground/50">Custom Freight Type</Label>
                  <Input
                    value={customFreightType}
                    onChange={e => setCustomFreightType(e.target.value)}
                    placeholder="Describe your freight"
                    className="mt-1 rounded-xl h-11 bg-background/50 border-border/50 text-sm"
                    data-testid="input-custom-freight-type"
                  />
                </div>
                <NumInput label="Weight (lbs)" value={weightLbs} onChange={setWeightLbs} placeholder="e.g. 20000" unit="lbs" />
                <div className="grid grid-cols-3 gap-2">
                  <NumInput label='Length (ft)' value={dimLength} onChange={setDimLength} placeholder="40" unit="ft" />
                  <NumInput label='Width (ft)'  value={dimWidth}  onChange={setDimWidth}  placeholder="8" unit="ft" />
                  <NumInput label='Height (ft)' value={dimHeight} onChange={setDimHeight} placeholder="8" unit="ft" />
                </div>
              </>
            )}

            {/* Notes — all types */}
            <div>
              <SectionLabel>Additional Notes (optional)</SectionLabel>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any special requirements or instructions..."
                rows={3}
                className="w-full rounded-xl bg-background/50 border border-border/50 text-sm p-3 text-foreground resize-none"
                data-testid="input-notes"
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
                  <p className="text-[10px] text-cyan-400/70 mt-0.5">+${addonTotal} added to posting fee</p>
                )}
              </div>
              {addonFlags.length > 0 && (
                <button type="button" onClick={() => setAddonFlags([])} className="text-[10px] font-display font-bold text-muted-foreground/40">
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
                    onClick={() => setAddonFlags(f => sel ? f.filter(x => x !== a.key) : [...f, a.key])}
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
                        <p className={`text-sm font-display font-black ${sel ? "text-cyan-300" : "text-muted-foreground/50"}`}>+${a.price}</p>
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
                  { value: "fixed",          label: "Fixed Rate",      sub: "You set the rate" },
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
                  Based on {estimatedMiles} mi · {activeType?.label || freightTrailerType} market rates
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
                <Label className="text-[10px] text-muted-foreground/50">Rate Offered ($)</Label>
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

            {/* Activation fee notice */}
            <div
              className="rounded-xl p-3.5 space-y-1"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <p className="text-[10px] font-display font-black text-muted-foreground/60 uppercase tracking-wider">Payment Flow</p>
              <div className="space-y-1 text-[10px] text-muted-foreground/50 leading-relaxed">
                <p>✅ Posting is free — carriers submit offers at no cost</p>
                <p>✅ When you accept a carrier, pay: <span className="text-foreground/70 font-bold">carrier rate + $10 activation fee</span></p>
                <p>✅ GUBER distributes: carrier receives 95%, GUBER keeps 5% + $10</p>
              </div>
            </div>

            {/* Urgent toggle */}
            {!addonFlags.includes("urgent_boost") && (
              <div className="flex items-center justify-between rounded-2xl p-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div>
                  <p className="text-sm font-display font-bold text-foreground">Mark as Urgent</p>
                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">Shown prominently — faster carrier response</p>
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

            {/* ── GUBER Verified Release System™ (additive) ──────────────────── */}
            <div
              className="rounded-2xl p-4 space-y-3"
              style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.22)" }}
              data-testid="section-asset-protection"
            >
              <button
                type="button"
                onClick={() => setProtectionEnabled(v => !v)}
                className="w-full flex items-start gap-3 text-left"
                data-testid="toggle-asset-protection"
              >
                <div
                  className="w-5 h-5 rounded-md mt-0.5 shrink-0 flex items-center justify-center transition-all"
                  style={protectionEnabled
                    ? { background: "linear-gradient(135deg,#10b981,#059669)" }
                    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.18)" }}
                >
                  {protectionEnabled && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <p className="text-sm font-display font-black text-foreground">GUBER Verified Release System™</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5 leading-relaxed">
                    Protect your asset end-to-end: verified handoff, geofenced release, one-time pickup code, and a tamper-proof custody timeline.
                  </p>
                </div>
              </button>

              {protectionEnabled && (
                <div className="space-y-3 pt-1">
                  {/* Declared value */}
                  <div>
                    <Label className="text-[10px] text-muted-foreground/50">Declared Asset Value ($)</Label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        value={assetValue}
                        onChange={e => setAssetValue(e.target.value)}
                        placeholder="e.g. 45000"
                        type="number"
                        inputMode="numeric"
                        className="rounded-xl h-11 bg-background/50 border-border/50 text-base pl-7"
                        data-testid="input-asset-value"
                      />
                    </div>
                    <p className="text-[9px] text-muted-foreground/40 mt-1">Used to recommend the right protection tier.</p>
                  </div>

                  {/* High-value warning */}
                  {protectionRec?.highValue && protectionRec?.warning && (
                    <div
                      className="rounded-xl p-3 flex items-start gap-2"
                      style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}
                      data-testid="warning-high-value"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-amber-300/90 leading-relaxed">{protectionRec.warning}</p>
                    </div>
                  )}

                  {/* Founder pricing note */}
                  {protectionPricing?.founder && (
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <p className="text-[10px] font-display font-bold text-emerald-400">Founders Club pricing applied</p>
                    </div>
                  )}

                  {/* Package picker */}
                  {!protectionPricing && (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/40" />
                      <p className="text-[10px] text-muted-foreground/40">Loading protection tiers…</p>
                    </div>
                  )}
                  {protectionPricing?.packages.map((pkg) => {
                    const isSelected = selectedPackage === pkg.key;
                    const isRecommended = protectionRec?.recommended === pkg.key;
                    const discounted = pkg.effectivePriceCents < pkg.priceCents;
                    return (
                      <button
                        key={pkg.key}
                        type="button"
                        onClick={() => setSelectedPackage(pkg.key)}
                        className="w-full rounded-2xl p-3.5 text-left transition-all"
                        style={isSelected
                          ? { background: "linear-gradient(135deg,rgba(16,185,129,0.22),rgba(5,150,105,0.12))", border: "1.5px solid rgba(16,185,129,0.55)" }
                          : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                        data-testid={`select-protection-${pkg.key}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-display font-black text-foreground">{pkg.name}</p>
                            {isRecommended && (
                              <span className="text-[8px] font-display font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                                Recommended
                              </span>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            {discounted && (
                              <span className="text-[10px] text-muted-foreground/40 line-through mr-1">{fmtUsd(pkg.priceCents)}</span>
                            )}
                            <span className="text-sm font-display font-black text-emerald-400">{fmtUsd(pkg.effectivePriceCents)}</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5">{pkg.blurb}</p>
                        <p className="text-[9px] text-muted-foreground/40 mt-0.5">{pkg.valueRangeLabel}</p>
                      </button>
                    );
                  })}

                  <p className="text-[9px] text-muted-foreground/40 leading-relaxed">
                    Posting stays free. Protection is purchased securely after you post — your load goes live either way.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 6: Review ────────────────────────────────────────────────── */}
        {step === 6 && (
          <div className="space-y-4">
            <p className="text-xs font-display font-bold text-muted-foreground/50 uppercase tracking-wider">Review Your Load</p>

            {/* Type badge */}
            {activeType && (
              <div
                className="rounded-2xl p-3 flex items-center gap-3"
                style={{ background: activeType.activeBg, border: activeType.activeBorder }}
              >
                <span className="text-2xl">{activeType.icon}</span>
                <div>
                  <p className="text-sm font-display font-black" style={{ color: activeType.accent }}>{activeType.label}</p>
                  <p className="text-[10px] text-muted-foreground/50">{activeType.sub}</p>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="rounded-2xl p-4 space-y-2.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(6,182,212,0.15)" }}>
              <Row label="Route" value={`${pickupZip ? `${pickupZip} ` : ""}${pickupCity}${pickupState ? `, ${pickupState}` : ""} → ${deliveryZip ? `${deliveryZip} ` : ""}${deliveryCity}${deliveryState ? `, ${deliveryState}` : ""}`} />
              {estimatedMiles && <Row label="Miles" value={`${parseInt(estimatedMiles).toLocaleString()} mi`} />}
              {pickupDate && <Row label="Pickup Date" value={pickupDate} />}
              {deliveryDate && <Row label="Delivery Date" value={deliveryDate} />}
              {commodityType && <Row label="Commodity" value={commodityType} />}
              {weightLbs && <Row label="Weight" value={`${parseFloat(weightLbs).toLocaleString()} lbs`} />}
              {(dimLength || dimWidth || dimHeight) && (
                <Row label="Dimensions" value={`${dimLength || "?"}L × ${dimWidth || "?"}W × ${dimHeight || "?"}H ft`} />
              )}
              {palletCount && <Row label="Pallets" value={palletCount} />}
              {vehicleCount && <Row label="Vehicles" value={vehicleCount} />}
              {carrierType && <Row label="Carrier" value={carrierType === "open" ? "Open Carrier" : "Enclosed Carrier"} />}
              {tempRequired && <Row label="Temp" value={tempRequired.charAt(0).toUpperCase() + tempRequired.slice(1)} />}
              {hotshotTrailerType && <Row label="Hotshot Trailer" value={hotshotTrailerType.replace("_", " ")} />}
              {powerOnlyTrailerType && <Row label="Trailer Type" value={powerOnlyTrailerType.replace("_", " ")} />}
              {trailerNumber && <Row label="Trailer #" value={trailerNumber} />}
              {oversized === "yes" && <Row label="Oversized" value={<span className="text-amber-400">⚠️ Yes</span>} />}
              {permitRequired === "yes" && <Row label="Permit" value={<span className="text-amber-400">Required</span>} />}
              {escortRequired === "yes" && <Row label="Escort" value={<span className="text-amber-400">Required</span>} />}
              <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
              <Row
                label="Pricing"
                value={pricingMode === "fixed" && postedPrice ? `$${parseFloat(postedPrice).toLocaleString()} fixed` : "Open to offers"}
              />
              {(urgent || addonFlags.includes("urgent_boost")) && (
                <Row label="Urgent" value={<span className="text-amber-400">⚡ Yes</span>} />
              )}
            </div>

            {/* Add-ons */}
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
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-[9px] text-muted-foreground/40 leading-relaxed">
                🔒 Your contact info is hidden until carrier accepts and payment is completed. When you accept a carrier offer, you'll pay the carrier rate + $10 activation fee via Stripe checkout. Carrier receives 95% of rate.
              </p>
            </div>
          </div>
        )}

      </div>

      {/* ── Sticky footer ─────────────────────────────────────────────────────── */}
      <div
        className="fixed left-0 right-0 px-4 pt-3 pb-3 z-[60]"
        style={{ bottom: "calc(68px + env(safe-area-inset-bottom, 0px))", background: "linear-gradient(to top, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.95) 70%, transparent 100%)" }}
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
              style={canAdvance()
                ? { background: "linear-gradient(135deg,#00e576,#00c864)", color: "#0a1a0f" }
                : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)" }
              }
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
              style={activeType ? { background: `linear-gradient(135deg,${activeType.accent}dd,${activeType.accent}88)` } : CYAN_ACTIVE}
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

      {/* iOS-only: Apple disclosure + external Stripe checkout for protection.
          Mounts once the protected asset exists; the effect fires onPress. */}
      {pendingProtection != null && selectedPackage && isIOS && (
        <ExternalPurchaseSheet
          product="asset_protection"
          options={{ assetId: String(pendingProtection), productType: "package", key: selectedPackage }}
        >
          {({ onPress }) => { iosPurchaseRef.current = onPress; return null; }}
        </ExternalPurchaseSheet>
      )}
    </GuberLayout>
  );
}

// ── Row helper ─────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground/50 shrink-0">{label}</span>
      <span className="font-display font-bold text-foreground text-right">{value}</span>
    </div>
  );
}
