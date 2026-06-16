import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { GoogleMap, GUBER_DARK_STYLES } from "@/components/google-map";
import type { JobPin, CashDropPin, BusinessPin } from "@/components/google-map";
import { Building2, Briefcase, DollarSign, ShieldCheck, Truck, X, Phone, Globe, MapPin } from "lucide-react";

type Filter = "all" | "jobs" | "cash-drops" | "verify" | "load-board" | "businesses";

interface PublicBusiness {
  id: number;
  name: string;
  category: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lat: number;
  lng: number;
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  featured?: boolean;
}

interface PublicJob {
  id: number;
  title: string;
  category: string;
  budget: number | null;
  lat: number | null;
  lng: number | null;
  locationApprox: string | null;
  urgentSwitch: boolean;
  payType: string;
  status: string;
  createdAt: string | null;
  zip: string | null;
}

interface PublicCashDrop {
  id: number;
  title: string;
  rewardPerWinner: number;
  gpsLat: number;
  gpsLng: number;
  status: string;
  hostLogoUrl?: string;
}

const FILTERS: { key: Filter; label: string; icon: typeof Briefcase; color: string }[] = [
  { key: "all",       label: "ALL",         icon: MapPin,      color: "#00E576" },
  { key: "jobs",      label: "JOBS",         icon: Briefcase,   color: "#3B82F6" },
  { key: "verify",    label: "VERIFY",       icon: ShieldCheck, color: "#8B5CF6" },
  { key: "load-board",label: "LOAD BOARD",   icon: Truck,       color: "#0891b2" },
  { key: "cash-drops",label: "CASH DROPS",   icon: DollarSign,  color: "#F59E0B" },
  { key: "businesses",label: "BUSINESSES",   icon: Building2,   color: "#EC4899" },
];

// Demo pins so the map always looks alive before real data loads
const DEMO_JOB_PINS: JobPin[] = [
  { id: -1, title: "Help Move Furniture",       category: "On-Demand Help",   serviceType: null, budget: 75,  status: "open", urgentSwitch: true,  lat: 0, lng: 0, locationApprox: "Near you", color: "#00E576", createdAt: null, zip: null },
  { id: -2, title: "Pre-Purchase Car Photos",   category: "Verify & Inspect", serviceType: null, budget: 45,  status: "open", urgentSwitch: false, lat: 0, lng: 0, locationApprox: "Near you", color: "#8B5CF6", createdAt: null, zip: null },
  { id: -3, title: "Yard Cleanup",              category: "General Labor",    serviceType: null, budget: 60,  status: "open", urgentSwitch: false, lat: 0, lng: 0, locationApprox: "Near you", color: "#00E576", createdAt: null, zip: null },
  { id: -4, title: "Furniture Assembly",        category: "Skilled Labor",    serviceType: null, budget: 90,  status: "open", urgentSwitch: false, lat: 0, lng: 0, locationApprox: "Near you", color: "#22C55E", createdAt: null, zip: null },
  { id: -5, title: "Vehicle Transport — Car",   category: "Load Board",       serviceType: null, budget: 350, status: "open", urgentSwitch: false, lat: 0, lng: 0, locationApprox: "Near you", color: "#0891b2", createdAt: null, zip: null },
];

function scatterOffset(i: number): { lat: number; lng: number } {
  const angle = (i * 137.5 * Math.PI) / 180;
  const radius = 0.015 + (i % 3) * 0.012;
  return { lat: Math.sin(angle) * radius, lng: Math.cos(angle) * radius };
}

export function OpportunityMap({ onClaim }: { onClaim: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedBiz, setSelectedBiz] = useState<BusinessPin | null>(null);

  const { data: rawJobs } = useQuery<PublicJob[]>({ queryKey: ["/api/public/jobs"] });
  const { data: rawDrops } = useQuery<PublicCashDrop[]>({ queryKey: ["/api/public/cash-drops"] });
  const { data: rawBusinesses } = useQuery<PublicBusiness[]>({
    queryKey: ["/api/public/local-businesses", userPos?.lat, userPos?.lng],
    queryFn: async () => {
      if (!userPos) return [];
      const res = await fetch(`/api/public/local-businesses?lat=${userPos.lat}&lng=${userPos.lng}&radiusMiles=25`);
      return res.json();
    },
    enabled: !!userPos,
  });

  const handleUserPos = useCallback((pos: { lat: number; lng: number }) => {
    setUserPos(pos);
  }, []);

  // Build pins with scattered offsets around user pos when real lat/lng is missing
  const jobPins: JobPin[] = (() => {
    const base = userPos ?? { lat: 39.8283, lng: -98.5795 };
    const real = (rawJobs ?? [])
      .filter((j) => j.lat != null && j.lng != null)
      .map((j) => ({
        id: j.id,
        title: j.title,
        category: j.category,
        serviceType: null,
        budget: j.budget,
        status: j.status,
        urgentSwitch: j.urgentSwitch,
        lat: j.lat!,
        lng: j.lng!,
        locationApprox: j.locationApprox,
        color: j.category === "Verify & Inspect" ? "#8B5CF6"
             : j.category === "Load Board"        ? "#0891b2"
             : "#00E576",
        createdAt: j.createdAt,
        zip: j.zip,
      } as JobPin));

    if (real.length >= 3) return real;

    const demos = DEMO_JOB_PINS.map((p, i) => {
      const off = scatterOffset(i);
      return { ...p, lat: base.lat + off.lat, lng: base.lng + off.lng };
    });
    return [...real, ...demos.slice(0, Math.max(0, 5 - real.length))];
  })();

  const cashDropPins: CashDropPin[] = (rawDrops ?? []).map((d) => ({
    id: d.id,
    gpsLat: d.gpsLat,
    gpsLng: d.gpsLng,
    title: d.title,
    rewardPerWinner: d.rewardPerWinner,
    status: d.status,
    hostLogoUrl: d.hostLogoUrl,
  }));

  const businessPins: BusinessPin[] = (rawBusinesses ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    category: b.category,
    description: b.description,
    address: b.address,
    city: b.city,
    state: b.state,
    zip: b.zip,
    lat: b.lat,
    lng: b.lng,
    phone: b.phone,
    website: b.website,
    logoUrl: b.logoUrl,
    featured: b.featured,
  }));

  // Filter visibility
  const visibleJobs =
    filter === "all"        ? jobPins
    : filter === "jobs"     ? jobPins.filter((p) => p.category !== "Verify & Inspect" && p.category !== "Load Board")
    : filter === "verify"   ? jobPins.filter((p) => p.category === "Verify & Inspect")
    : filter === "load-board" ? jobPins.filter((p) => p.category === "Load Board")
    : [];

  const visibleDrops =
    filter === "all" || filter === "cash-drops" ? cashDropPins : [];

  const visibleBizPins =
    filter === "all" || filter === "businesses" ? businessPins : [];

  const activeFilter = FILTERS.find((f) => f.key === filter)!;

  return (
    <div className="relative" data-testid="opportunity-map">
      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide" data-testid="map-filter-pills">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const FIcon = f.icon;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-display font-bold tracking-wider whitespace-nowrap transition-all duration-200 shrink-0"
              style={{
                background: active ? `${f.color}22` : "rgba(255,255,255,0.04)",
                border: `1px solid ${active ? f.color : "rgba(255,255,255,0.08)"}`,
                color: active ? f.color : "rgba(255,255,255,0.4)",
              }}
              data-testid={`filter-${f.key}`}
            >
              <FIcon className="w-3 h-3" />
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Map */}
      <div className="relative rounded-2xl overflow-hidden"
        style={{
          border: `2px solid ${activeFilter.color}33`,
          boxShadow: `0 0 0 1px ${activeFilter.color}11, 0 8px 40px rgba(0,0,0,0.5), 0 0 60px ${activeFilter.color}08`,
        }}>
        <GoogleMap
          pins={visibleJobs}
          cashDrops={visibleDrops}
          businessPins={visibleBizPins}
          onPinClick={onClaim}
          onCashDropClick={onClaim}
          onBusinessPinClick={setSelectedBiz}
          onUserPos={handleUserPos}
          mapStyles={GUBER_DARK_STYLES}
          className="h-[420px] sm:h-[480px]"
        />

        {/* Live indicator */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ background: "rgba(8,8,16,0.9)", border: "1px solid rgba(0,229,118,0.25)", backdropFilter: "blur(8px)" }}>
          <span className="online-dot" aria-hidden />
          <span className="text-[10px] font-display font-bold text-emerald-400 tracking-wider">LIVE MAP</span>
        </div>

        {/* Pin count badge */}
        {(visibleJobs.length > 0 || visibleBizPins.length > 0) && (
          <div className="absolute top-3 right-16 z-20 px-2.5 py-1 rounded-full text-[10px] font-display font-bold"
            style={{ background: "rgba(8,8,16,0.9)", border: `1px solid ${activeFilter.color}33`, color: activeFilter.color, backdropFilter: "blur(8px)" }}>
            {visibleJobs.length + visibleBizPins.length} NEAR YOU
          </div>
        )}
      </div>

      {/* Business popup */}
      {selectedBiz && (
        <div
          className="absolute bottom-4 left-4 right-4 z-30 rounded-2xl p-4 flex items-start gap-3"
          style={{ background: "rgba(8,8,16,0.97)", border: "1.5px solid #EC4899", backdropFilter: "blur(12px)", boxShadow: "0 4px 24px rgba(236,72,153,0.15)" }}
          data-testid="popup-business"
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(236,72,153,0.15)", border: "1px solid rgba(236,72,153,0.3)" }}>
            {selectedBiz.logoUrl
              ? <img src={selectedBiz.logoUrl} alt={selectedBiz.name} className="w-full h-full object-cover rounded-xl" />
              : <Building2 className="w-5 h-5 text-pink-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-display font-black text-white leading-tight truncate">{selectedBiz.name}</p>
              {selectedBiz.featured && (
                <span className="text-[9px] font-display font-black px-1.5 py-0.5 rounded-md shrink-0"
                  style={{ background: "rgba(236,72,153,0.2)", color: "#EC4899" }}>FEATURED</span>
              )}
            </div>
            <p className="text-[11px] text-pink-400 font-display font-bold tracking-wider">{selectedBiz.category}</p>
            {selectedBiz.description && <p className="text-[11px] text-white/50 mt-1 leading-snug line-clamp-2">{selectedBiz.description}</p>}
            <div className="flex items-center gap-3 mt-2">
              {selectedBiz.phone && (
                <a href={`tel:${selectedBiz.phone}`} className="flex items-center gap-1 text-[10px] text-white/60 hover:text-white transition-colors" data-testid="link-biz-phone">
                  <Phone className="w-3 h-3" />{selectedBiz.phone}
                </a>
              )}
              {selectedBiz.website && (
                <a href={selectedBiz.website} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-pink-400 hover:opacity-80 transition-opacity font-display font-bold" data-testid="link-biz-website">
                  <Globe className="w-3 h-3" />VISIT
                </a>
              )}
            </div>
          </div>
          <button
            onClick={() => setSelectedBiz(null)}
            className="shrink-0 text-white/40 hover:text-white/70 transition-colors"
            data-testid="button-close-biz-popup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
