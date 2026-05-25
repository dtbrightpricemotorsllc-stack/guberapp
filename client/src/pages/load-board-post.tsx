import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ChevronRight, ChevronLeft, Loader2, TrendingUp } from "lucide-react";

const TRANSPORT_TYPES = [
  { value: "vehicle", label: "🚗 Vehicle", sub: "Car, truck, SUV, van" },
  { value: "equipment", label: "🏗️ Equipment", sub: "Heavy machinery, tools" },
  { value: "boat", label: "⛵ Boat", sub: "Watercraft, jet ski" },
  { value: "rv", label: "🚐 RV / Motorhome", sub: "Class A/B/C, fifth wheel" },
  { value: "trailer", label: "🔧 Trailer", sub: "Utility, cargo, flatbed" },
  { value: "hotshot", label: "⚡ Hotshot Load", sub: "Time-sensitive freight" },
  { value: "other", label: "📦 Other", sub: "Something else" },
];

const CONDITIONS = [
  { value: "runs_drives", label: "Runs & Drives" },
  { value: "inop", label: "Inoperable" },
  { value: "no_brakes", label: "No Brakes" },
  { value: "flat_tires", label: "Flat Tires" },
  { value: "locked_wheels", label: "Locked Wheels" },
  { value: "no_keys", label: "No Keys" },
  { value: "rolls_no_start", label: "Rolls, Won't Start" },
  { value: "does_not_roll", label: "Does Not Roll" },
];

const LOADING_METHODS = [
  { value: "drive_on", label: "Drive On" },
  { value: "winch", label: "Winch" },
  { value: "forklift", label: "Forklift" },
  { value: "crane", label: "Crane" },
];

const UNLOADING_METHODS = [
  { value: "drive_off", label: "Drive Off" },
  { value: "winch", label: "Winch" },
  { value: "rollback", label: "Rollback" },
];

const TRAILER_PREFS = [
  { value: "any", label: "Any Trailer" },
  { value: "open", label: "Open" },
  { value: "enclosed", label: "Enclosed" },
  { value: "rollback", label: "Rollback" },
  { value: "hotshot", label: "Hotshot" },
  { value: "lowboy", label: "Lowboy" },
  { value: "multi_car", label: "Multi-Car" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

type Step = 1 | 2 | 3 | 4;

function MultiToggle({ options, value, onChange }: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const sel = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(sel ? value.filter(x => x !== o.value) : [...value, o.value])}
            className="rounded-xl px-3 py-1.5 text-xs font-display font-bold transition-all"
            style={sel
              ? { background: "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff" }
              : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SingleToggle({ options, value, onChange }: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const sel = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="rounded-xl px-3 py-1.5 text-xs font-display font-bold transition-all"
            style={sel
              ? { background: "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff" }
              : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function LoadBoardPost() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);

  // Form state
  const [transportType, setTransportType] = useState("");
  const [vin, setVin] = useState("");
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [assetDescription, setAssetDescription] = useState("");
  const [vehicleCondition, setVehicleCondition] = useState<string[]>([]);
  const [trailerPreference, setTrailerPreference] = useState("any");
  const [loadingMethod, setLoadingMethod] = useState<string[]>([]);
  const [unloadingMethod, setUnloadingMethod] = useState<string[]>([]);
  const [pickupCity, setPickupCity] = useState("");
  const [pickupState, setPickupState] = useState("TX");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryState, setDeliveryState] = useState("CA");
  const [estimatedMiles, setEstimatedMiles] = useState("");
  const [pricingMode, setPricingMode] = useState("fixed");
  const [postedPrice, setPostedPrice] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [notes, setNotes] = useState("");

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
    if (!transportType || !pickupCity || !pickupState || !deliveryCity || !deliveryState) {
      toast({ variant: "destructive", title: "Required fields missing" });
      return;
    }
    mutation.mutate({
      transportType,
      vin: vin || undefined,
      year: year || undefined,
      make: make || undefined,
      model: model || undefined,
      assetDescription: assetDescription || undefined,
      vehicleCondition: vehicleCondition.length ? vehicleCondition : undefined,
      trailerPreference,
      loadingMethod: loadingMethod.length ? loadingMethod : undefined,
      unloadingMethod: unloadingMethod.length ? unloadingMethod : undefined,
      pickupCity,
      pickupState,
      deliveryCity,
      deliveryState,
      estimatedMiles: estimatedMiles ? parseInt(estimatedMiles) : undefined,
      pricingMode,
      postedPrice: postedPrice ? parseFloat(postedPrice) : undefined,
      urgent,
      notes: notes || undefined,
    });
  }

  const steps = [
    { num: 1, label: "Asset" },
    { num: 2, label: "Route" },
    { num: 3, label: "Pricing" },
    { num: 4, label: "Details" },
  ];

  return (
    <GuberLayout title="Post a Load" showBack backHref="/load-board">
      <div className="px-4 pb-28 pt-2">
        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mb-6">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center gap-1.5 flex-1">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-display font-black shrink-0"
                style={step >= s.num
                  ? { background: "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff" }
                  : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" }}
              >
                {s.num}
              </div>
              <span className={`text-[10px] font-display font-bold ${step >= s.num ? "text-foreground/70" : "text-muted-foreground/30"}`}>
                {s.label}
              </span>
              {i < steps.length - 1 && <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />}
            </div>
          ))}
        </div>

        {/* Step 1 — Asset type + details */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-display font-bold text-muted-foreground/60 uppercase tracking-wider mb-3">
                What are you shipping?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {TRANSPORT_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTransportType(t.value)}
                    className="rounded-2xl p-3.5 text-left transition-all active:scale-95"
                    style={transportType === t.value
                      ? { background: "linear-gradient(135deg,rgba(22,163,74,0.3),rgba(21,128,61,0.2))", border: "1.5px solid rgba(22,163,74,0.5)" }
                      : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    data-testid={`select-transport-${t.value}`}
                  >
                    <p className="text-sm font-display font-bold text-foreground">{t.label}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">{t.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {transportType === "vehicle" && (
              <div className="space-y-3">
                <p className="text-xs font-display font-bold text-muted-foreground/60 uppercase tracking-wider">Vehicle Info</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground/60">Year</Label>
                    <Input value={year} onChange={e => setYear(e.target.value)} placeholder="2019" className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm" data-testid="input-year" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground/60">Make</Label>
                    <Input value={make} onChange={e => setMake(e.target.value)} placeholder="Ford" className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm" data-testid="input-make" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground/60">Model</Label>
                    <Input value={model} onChange={e => setModel(e.target.value)} placeholder="F-150" className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm" data-testid="input-model" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground/60">VIN (optional)</Label>
                  <Input value={vin} onChange={e => setVin(e.target.value)} placeholder="17-digit VIN" className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm font-mono" data-testid="input-vin" />
                </div>
                <div>
                  <p className="text-xs font-display font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Condition</p>
                  <MultiToggle options={CONDITIONS} value={vehicleCondition} onChange={setVehicleCondition} />
                </div>
              </div>
            )}

            {transportType !== "vehicle" && transportType && (
              <div>
                <Label className="text-xs text-muted-foreground/60">Description</Label>
                <Textarea
                  value={assetDescription}
                  onChange={e => setAssetDescription(e.target.value)}
                  placeholder="Describe what needs to be shipped..."
                  className="mt-1 rounded-xl bg-background/50 border-border/50 text-sm resize-none"
                  rows={3}
                  data-testid="input-asset-description"
                />
              </div>
            )}
          </div>
        )}

        {/* Step 2 — Route */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-display font-bold text-muted-foreground/60 uppercase tracking-wider mb-3">Pickup Location</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground/60">City</Label>
                  <Input value={pickupCity} onChange={e => setPickupCity(e.target.value)} placeholder="Dallas" className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm" data-testid="input-pickup-city" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground/60">State</Label>
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

            <div>
              <p className="text-xs font-display font-bold text-muted-foreground/60 uppercase tracking-wider mb-3">Delivery Location</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground/60">City</Label>
                  <Input value={deliveryCity} onChange={e => setDeliveryCity(e.target.value)} placeholder="Los Angeles" className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm" data-testid="input-delivery-city" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground/60">State</Label>
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

            <div>
              <Label className="text-xs text-muted-foreground/60">Estimated Miles (optional)</Label>
              <Input
                value={estimatedMiles}
                onChange={e => setEstimatedMiles(e.target.value)}
                placeholder="e.g. 1450"
                type="number"
                className="mt-1 rounded-xl h-10 bg-background/50 border-border/50 text-sm"
                data-testid="input-estimated-miles"
              />
            </div>

            <div>
              <p className="text-xs font-display font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Trailer Preference</p>
              <SingleToggle options={TRAILER_PREFS} value={trailerPreference} onChange={setTrailerPreference} />
            </div>

            <div>
              <p className="text-xs font-display font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Loading Method</p>
              <MultiToggle options={LOADING_METHODS} value={loadingMethod} onChange={setLoadingMethod} />
            </div>

            <div>
              <p className="text-xs font-display font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">Unloading Method</p>
              <MultiToggle options={UNLOADING_METHODS} value={unloadingMethod} onChange={setUnloadingMethod} />
            </div>
          </div>
        )}

        {/* Step 3 — Pricing */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-display font-bold text-muted-foreground/60 uppercase tracking-wider mb-3">Pricing Mode</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "fixed", label: "Fixed Price", sub: "You set the price" },
                  { value: "open_to_offers", label: "Open to Offers", sub: "Carriers bid on your load" },
                ].map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPricingMode(p.value)}
                    className="rounded-2xl p-3.5 text-left transition-all"
                    style={pricingMode === p.value
                      ? { background: "linear-gradient(135deg,rgba(22,163,74,0.3),rgba(21,128,61,0.2))", border: "1.5px solid rgba(22,163,74,0.5)" }
                      : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    data-testid={`select-pricing-${p.value}`}
                  >
                    <p className="text-sm font-display font-bold text-foreground">{p.label}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">{p.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {rateData?.low && rateData?.high && (
              <div
                className="rounded-2xl p-3.5"
                style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}
                data-testid="card-rate-suggestion"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  <p className="text-xs font-display font-black text-emerald-400 tracking-wide">GUBER RATE SUGGESTION</p>
                </div>
                <p className="text-2xl font-display font-black text-foreground">
                  ${rateData.low.toLocaleString()}
                  <span className="text-muted-foreground/50 text-lg"> – </span>
                  ${rateData.high.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                  Based on {estimatedMiles} miles × {transportType} transport market rate
                </p>
                {pricingMode === "fixed" && (
                  <button
                    type="button"
                    onClick={() => setPostedPrice(String(Math.round((rateData.low! + rateData.high!) / 2)))}
                    className="mt-2.5 text-[10px] font-display font-black text-emerald-400 underline underline-offset-2"
                    data-testid="button-use-suggested-rate"
                  >
                    Use mid-point (${Math.round((rateData.low + rateData.high) / 2).toLocaleString()})
                  </button>
                )}
              </div>
            )}

            {pricingMode === "fixed" && (
              <div>
                <Label className="text-xs text-muted-foreground/60">Your Price ($)</Label>
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

            <div className="flex items-center justify-between rounded-2xl p-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div>
                <p className="text-sm font-display font-bold text-foreground">Mark as Urgent</p>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">Shown prominently — faster response</p>
              </div>
              <button
                type="button"
                onClick={() => setUrgent(!urgent)}
                className="w-10 h-6 rounded-full transition-all shrink-0"
                style={{ background: urgent ? "linear-gradient(135deg,#16a34a,#15803d)" : "rgba(255,255,255,0.1)" }}
                data-testid="toggle-urgent"
              >
                <div className="w-4 h-4 rounded-full bg-white shadow mx-1 transition-transform" style={{ transform: urgent ? "translateX(16px)" : "translateX(0)" }} />
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Notes & submit */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <Label className="text-xs text-muted-foreground/60">Additional Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Anything carriers should know — gate codes, timing, access requirements..."
                className="mt-1 rounded-xl bg-background/50 border-border/50 text-sm resize-none"
                rows={4}
                data-testid="input-notes"
              />
            </div>

            {/* Summary */}
            <div className="rounded-2xl p-4 space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-xs font-display font-black text-muted-foreground/50 uppercase tracking-wider mb-3">Summary</p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground/60">Type</span>
                <span className="font-display font-bold capitalize">{transportType}</span>
              </div>
              {(make || assetDescription) && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground/60">Asset</span>
                  <span className="font-display font-bold">{[year, make, model].filter(Boolean).join(" ") || assetDescription}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground/60">Route</span>
                <span className="font-display font-bold text-right">{pickupCity}, {pickupState} → {deliveryCity}, {deliveryState}</span>
              </div>
              {estimatedMiles && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground/60">Miles</span>
                  <span className="font-display font-bold">{parseInt(estimatedMiles).toLocaleString()} mi</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground/60">Pricing</span>
                <span className="font-display font-bold">
                  {pricingMode === "fixed" ? (postedPrice ? `$${parseFloat(postedPrice).toLocaleString()}` : "Fixed (no price set)") : "Open to Offers"}
                </span>
              </div>
              {urgent && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground/60">Urgent</span>
                  <span className="font-display font-bold text-amber-400">⚡ Yes</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-8">
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl h-12 px-5 font-display font-bold"
              onClick={() => setStep((step - 1) as Step)}
              data-testid="button-prev-step"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}
          {step < 4 ? (
            <Button
              type="button"
              className="flex-1 rounded-2xl h-12 font-display font-black text-sm tracking-wide"
              style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}
              onClick={() => {
                if (step === 1 && !transportType) {
                  alert("Select a transport type to continue.");
                  return;
                }
                if (step === 2 && (!pickupCity || !deliveryCity)) {
                  alert("Enter pickup and delivery cities.");
                  return;
                }
                setStep((step + 1) as Step);
              }}
              data-testid="button-next-step"
            >
              Continue <ChevronRight className="w-4 h-4 ml-1.5" />
            </Button>
          ) : (
            <Button
              type="button"
              className="flex-1 rounded-2xl h-12 font-display font-black text-sm tracking-wide"
              style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}
              onClick={handleSubmit}
              disabled={mutation.isPending}
              data-testid="button-post-load-submit"
            >
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post Load →"}
            </Button>
          )}
        </div>
      </div>
    </GuberLayout>
  );
}
