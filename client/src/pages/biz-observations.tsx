import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { BizLayout } from "@/components/biz-layout";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Lock, Eye, Loader2, Navigation, X } from "lucide-react";
import type { Observation } from "@shared/schema";

const GOLD = "#C9A84C";
const SURFACE = "#141417";
const BORDER = "rgba(255,255,255,0.07)";
const TEXT_PRIMARY = "#F4F4F5";
const TEXT_SECONDARY = "#71717A";
const INPUT_BG = "#0f0f11";

const OBS_TYPES = [
  "All Types", "Property Condition", "Vehicle Condition", "Business Activity",
  "Infrastructure Issue", "Environmental Hazard", "Code Violation", "Safety Concern",
  "Abandoned Property", "Signage / Branding", "General Observation",
];

type ObsWithMeta = Observation & { _purchased: boolean };

const PRICES = [5, 10, 20];

function typeColor(type: string) {
  const map: Record<string, string> = {
    "Vehicle Condition": "#60a5fa",
    "Property Condition": "#a78bfa",
    "Business Activity": "#34d399",
    "Environmental Hazard": "#fbbf24",
    "Code Violation": "#f87171",
    "Infrastructure Issue": "#fb923c",
    "Safety Concern": "#f87171",
    "Abandoned Property": "#9ca3af",
    "Signage / Branding": GOLD,
  };
  return map[type] || "#6b7280";
}

export default function BizObservations() {
  const { isDemoUser } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [cityFilter, setCityFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [zipFilter, setZipFilter] = useState("");
  const [selectedObs, setSelectedObs] = useState<ObsWithMeta | null>(null);
  const [purchasePrice, setPurchasePrice] = useState(10);
  const [gettingGeo, setGettingGeo] = useState(false);
  const [geoLat, setGeoLat] = useState<number | null>(null);
  const [geoLng, setGeoLng] = useState<number | null>(null);

  const { data: observations, isLoading } = useQuery<ObsWithMeta[]>({
    queryKey: ["/api/observations", typeFilter, cityFilter, stateFilter, zipFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter !== "All Types") params.set("type", typeFilter);
      if (cityFilter) params.set("city", cityFilter);
      if (stateFilter) params.set("state", stateFilter);
      if (zipFilter) params.set("zip", zipFilter);
      if (geoLat) params.set("lat", String(geoLat));
      if (geoLng) params.set("lng", String(geoLng));
      const res = await fetch(`/api/observations?${params}`, { credentials: "include" });
      return res.json();
    },
  });

  const purchaseMutation = useMutation({
    mutationFn: ({ id, price }: { id: number; price: number }) =>
      apiRequest("POST", `/api/observations/${id}/purchase`, { price }),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "Observation purchased!", description: "Full details are now unlocked." });
      queryClient.invalidateQueries({ queryKey: ["/api/observations"] });
      setSelectedObs(null);
    },
    onError: (err: any) => toast({ title: "Purchase failed", description: err.message, variant: "destructive" }),
  });

  const convertMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/observations/${id}/convert-to-job`),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "Job created!", description: "Observation converted to a new job." });
      queryClient.invalidateQueries({ queryKey: ["/api/observations"] });
      setSelectedObs(null);
      navigate(`/jobs/${data.jobId}`);
    },
    onError: (err: any) => toast({ title: "Conversion failed", description: err.message, variant: "destructive" }),
  });

  const getGeoLocation = () => {
    setGettingGeo(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLat(pos.coords.latitude);
        setGeoLng(pos.coords.longitude);
        setGettingGeo(false);
        queryClient.invalidateQueries({ queryKey: ["/api/observations"] });
      },
      () => { setGettingGeo(false); toast({ title: "GPS unavailable", variant: "destructive" }); }
    );
  };

  const inputStyle: React.CSSProperties = {
    background: INPUT_BG, border: `1px solid ${BORDER}`, color: TEXT_PRIMARY,
    padding: "0 12px", height: "36px", borderRadius: "8px", fontSize: "12px", outline: "none", width: "100%",
  };

  return (
    <BizLayout>
      <div className="max-w-5xl mx-auto space-y-7">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-black text-2xl" style={{ color: TEXT_PRIMARY }}>Observation Marketplace</h1>
            <p style={{ color: TEXT_SECONDARY, fontSize: "13px", marginTop: "4px" }}>
              Browse and purchase real-world field observations from GUBER helpers
            </p>
          </div>
          <button
            onClick={getGeoLocation}
            disabled={gettingGeo}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
            style={{ border: `1px solid ${BORDER}`, color: geoLat ? GOLD : TEXT_SECONDARY, background: "transparent" }}
            data-testid="button-use-location"
          >
            {gettingGeo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
            {geoLat ? "Location Active" : "Use My Location"}
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ ...inputStyle }}
            data-testid="select-obs-type"
          >
            {OBS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} placeholder="City" style={inputStyle} data-testid="input-city-filter" />
          <input value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} placeholder="State (e.g. IL)" style={inputStyle} maxLength={2} data-testid="input-state-filter" />
          <input value={zipFilter} onChange={(e) => setZipFilter(e.target.value)} placeholder="Zip code" style={inputStyle} maxLength={5} data-testid="input-zip-filter" />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-36 rounded-xl animate-pulse" style={{ background: SURFACE }} />
            ))}
          </div>
        ) : observations && observations.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {observations.map((obs) => {
              const isPurchased = obs._purchased;
              const tc = typeColor(obs.observationType);
              return (
                <div
                  key={obs.id}
                  className="rounded-xl p-4 cursor-pointer transition-all space-y-3"
                  style={{
                    background: SURFACE,
                    border: `1px solid ${BORDER}`,
                  }}
                  onClick={() => setSelectedObs(obs)}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(201,168,76,0.3)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
                  data-testid={`card-observation-${obs.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-14 h-14 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden"
                      style={{ background: INPUT_BG, border: `1px solid ${BORDER}` }}
                    >
                      {isPurchased && obs.photoURLs?.length > 0 ? (
                        <img src={obs.photoURLs[0]} alt="obs" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full relative flex items-center justify-center" style={{ filter: "blur(0px)" }}>
                          <div
                            className="absolute inset-0 rounded-lg"
                            style={{
                              background: "linear-gradient(135deg, rgba(201,168,76,0.12), rgba(201,168,76,0.04), rgba(255,255,255,0.03))",
                              filter: "blur(2px)",
                            }}
                          />
                          <Lock className="w-4 h-4 relative z-10" style={{ color: "rgba(201,168,76,0.6)" }} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span
                        className="inline-block text-[10px] font-bold px-2 py-0.5 rounded mb-1"
                        style={{ color: tc, background: `${tc}18`, border: `1px solid ${tc}30` }}
                      >
                        {obs.observationType}
                      </span>
                      <p className="text-xs flex items-center gap-1 truncate" style={{ color: TEXT_SECONDARY }}>
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        {isPurchased ? obs.address : "Location hidden until purchased"}
                      </p>
                      <p style={{ color: "#4b5563", fontSize: "10px", marginTop: "2px" }}>
                        {new Date(obs.createdAt!).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1" style={{ borderTop: `1px solid ${BORDER}` }}>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded capitalize"
                      style={{
                        color: obs.status === "open" ? "#34d399" : TEXT_SECONDARY,
                        background: obs.status === "open" ? "rgba(52,211,153,0.08)" : "rgba(113,113,122,0.08)",
                      }}
                    >
                      {obs.status.replace(/_/g, " ")}
                    </span>
                    {isPurchased ? (
                      <span className="text-[10px] flex items-center gap-1" style={{ color: GOLD }}>
                        <Eye className="w-3 h-3" /> Purchased
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold" style={{ color: GOLD }}>
                        {isDemoUser ? "UNLOCK" : "FROM $5"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl flex flex-col items-center justify-center py-20 gap-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}` }}>
              <MapPin className="w-5 h-5" style={{ color: TEXT_SECONDARY }} />
            </div>
            <div className="text-center">
              <p style={{ color: TEXT_PRIMARY, fontSize: "14px", fontWeight: 600 }}>No observations found</p>
              <p style={{ color: TEXT_SECONDARY, fontSize: "12px", marginTop: "4px" }}>
                Try adjusting your filters or check back as helpers submit new data
              </p>
            </div>
          </div>
        )}
      </div>

      {selectedObs && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelectedObs(null)} />
          <div
            className="relative w-full lg:max-w-lg rounded-t-2xl lg:rounded-2xl p-6 space-y-5"
            style={{ background: "#131316", border: `1px solid rgba(255,255,255,0.1)`, maxHeight: "90vh", overflowY: "auto" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <span
                  className="inline-block text-[10px] font-bold px-2 py-0.5 rounded mb-1"
                  style={{ color: typeColor(selectedObs.observationType), background: `${typeColor(selectedObs.observationType)}18`, border: `1px solid ${typeColor(selectedObs.observationType)}30` }}
                >
                  {selectedObs.observationType}
                </span>
                <p className="font-bold" style={{ color: TEXT_PRIMARY }}>Observation #{selectedObs.id}</p>
              </div>
              <button onClick={() => setSelectedObs(null)} style={{ color: TEXT_SECONDARY }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedObs._purchased && selectedObs.photoURLs?.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {selectedObs.photoURLs.map((url, i) => (
                  <img key={i} src={url} className="w-full h-28 object-cover rounded-lg" alt={`Photo ${i + 1}`} />
                ))}
              </div>
            ) : (
              <div
                className="h-36 rounded-xl flex flex-col items-center justify-center gap-2"
                style={{ background: INPUT_BG, border: `2px dashed ${BORDER}` }}
              >
                <Lock className="w-6 h-6" style={{ color: TEXT_SECONDARY }} />
                <p style={{ color: TEXT_SECONDARY, fontSize: "12px" }}>Purchase to reveal photos and location</p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p style={{ color: TEXT_SECONDARY, fontSize: "12px" }}>Location</p>
                <p style={{ color: selectedObs._purchased ? TEXT_PRIMARY : TEXT_SECONDARY, fontSize: "12px" }}>
                  {selectedObs._purchased ? selectedObs.address || "Not provided" : "Hidden until purchased"}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <p style={{ color: TEXT_SECONDARY, fontSize: "12px" }}>Submitted</p>
                <p style={{ color: TEXT_PRIMARY, fontSize: "12px" }}>{new Date(selectedObs.createdAt!).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center justify-between">
                <p style={{ color: TEXT_SECONDARY, fontSize: "12px" }}>Status</p>
                <p style={{ color: selectedObs.status === "open" ? "#34d399" : TEXT_SECONDARY, fontSize: "12px" }} className="capitalize">
                  {selectedObs.status.replace(/_/g, " ")}
                </p>
              </div>
              {selectedObs._purchased && selectedObs.notes && (
                <div>
                  <p style={{ color: TEXT_SECONDARY, fontSize: "12px", marginBottom: "4px" }}>Notes</p>
                  <p style={{ color: TEXT_PRIMARY, fontSize: "13px" }}>{selectedObs.notes}</p>
                </div>
              )}
            </div>

            {!selectedObs._purchased && selectedObs.status === "open" ? (
              <div className="space-y-4">
                <div>
                  <p style={{ color: TEXT_SECONDARY, fontSize: "10px", letterSpacing: "0.14em", fontWeight: 700 }} className="uppercase mb-2">
                    {isDemoUser ? "Select Tier" : "Select Price"}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {PRICES.map((p) => (
                      <button
                        key={p}
                        onClick={() => setPurchasePrice(p)}
                        className="py-2.5 rounded-lg font-bold text-sm transition-all"
                        style={{
                          border: `1px solid ${purchasePrice === p ? GOLD : BORDER}`,
                          background: purchasePrice === p ? "rgba(201,168,76,0.1)" : "transparent",
                          color: purchasePrice === p ? GOLD : TEXT_SECONDARY,
                        }}
                      >
                        {isDemoUser ? `Tier ${PRICES.indexOf(p) + 1}` : `$${p}`}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => purchaseMutation.mutate({ id: selectedObs.id, price: purchasePrice })}
                  disabled={purchaseMutation.isPending}
                  className="w-full h-12 rounded-xl font-bold text-sm tracking-wider transition-all disabled:opacity-40"
                  style={{ background: GOLD, color: "#000" }}
                  data-testid="button-purchase-observation"
                >
                  {purchaseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin inline" /> : isDemoUser ? "UNLOCK OBSERVATION" : `PURCHASE FOR $${purchasePrice}`}
                </button>
              </div>
            ) : selectedObs._purchased && selectedObs.status === "purchased" ? (
              <button
                onClick={() => convertMutation.mutate(selectedObs.id)}
                disabled={convertMutation.isPending}
                className="w-full h-12 rounded-xl font-bold text-sm tracking-wider transition-all disabled:opacity-40"
                style={{ background: GOLD, color: "#000" }}
                data-testid="button-convert-to-job"
              >
                {convertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "CONVERT TO JOB"}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </BizLayout>
  );
}
