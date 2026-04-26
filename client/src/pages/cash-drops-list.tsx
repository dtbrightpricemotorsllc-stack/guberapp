import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, MapPin, Clock, Trophy, AlertCircle } from "lucide-react";
import { gpsGetCurrentPosition } from "@/lib/gps";
import type { CashDrop } from "@shared/schema";

const FILTER_STORAGE_KEY = "guber.dropFilters";

type DropTypeFilter = "all" | "cash" | "sponsored";

interface DropFilters {
  type: DropTypeFilter;
  maxMiles: number;
  minPayout: number;
}

const DEFAULT_FILTERS: DropFilters = {
  type: "all",
  maxMiles: 0,
  minPayout: 0,
};

function loadFilters(): DropFilters {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw);
    return {
      type: parsed.type === "cash" || parsed.type === "sponsored" ? parsed.type : "all",
      maxMiles: typeof parsed.maxMiles === "number" && parsed.maxMiles >= 0 ? parsed.maxMiles : 0,
      minPayout: typeof parsed.minPayout === "number" && parsed.minPayout >= 0 ? parsed.minPayout : 0,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function saveFilters(f: DropFilters) {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(f));
  } catch {}
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatTimeRemaining(endTime: Date | string | null | undefined, now: number): string {
  if (!endTime) return "—";
  const end = new Date(endTime).getTime();
  const diff = end - now;
  if (diff <= 0) return "Ended";
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m ${seconds}s left`;
  return `${seconds}s left`;
}

function formatDistance(miles: number | null): string {
  if (miles === null) return "—";
  if (miles < 0.1) return "Right here";
  if (miles < 1) return `${(miles * 5280).toFixed(0)} ft`;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${miles.toFixed(0)} mi`;
}

function dropHostLabel(d: CashDrop): string {
  if (d.isSponsored && d.sponsorName) return d.sponsorName;
  if (d.isHostDrop && d.sponsorName) return d.sponsorName;
  return "GUBER Cash Drop";
}

export default function CashDropsList() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [filters, setFilters] = useState<DropFilters>(() => loadFilters());
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isVisible, setIsVisible] = useState(
    typeof document !== "undefined" ? document.visibilityState === "visible" : true
  );
  const watchIdRef = useRef<number | null>(null);

  // Persist filter changes
  useEffect(() => {
    saveFilters(filters);
  }, [filters]);

  // Track tab visibility — pause polling when hidden
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => setIsVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Tick once per second for countdowns (only while visible)
  useEffect(() => {
    if (!isVisible) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isVisible]);

  // Live GPS for distance sort
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pos = await gpsGetCurrentPosition({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 });
        if (!cancelled) setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch (e: any) {
        if (!cancelled) setGpsError(e?.message || "Location unavailable");
      }

      if (cancelled || !navigator.geolocation) return;
      try {
        const id = navigator.geolocation.watchPosition(
          (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => {},
          { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 }
        );
        watchIdRef.current = id;
      } catch {}
    })();

    return () => {
      cancelled = true;
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  const { data: drops = [], isLoading } = useQuery<CashDrop[]>({
    queryKey: ["/api/cash-drops/active"],
    enabled: !!user,
    refetchInterval: isVisible ? 5000 : false,
    refetchIntervalInBackground: false,
  });

  const enriched = useMemo(() => {
    const base = drops.map((d) => {
      const distance =
        userPos && d.gpsLat != null && d.gpsLng != null
          ? haversineMiles(userPos.lat, userPos.lng, d.gpsLat, d.gpsLng)
          : null;
      return { drop: d, distance };
    });

    const filtered = base.filter(({ drop, distance }) => {
      if (filters.type === "cash" && drop.isSponsored) return false;
      if (filters.type === "sponsored" && !drop.isSponsored) return false;
      if (filters.minPayout > 0 && (drop.rewardPerWinner ?? 0) < filters.minPayout) return false;
      if (filters.maxMiles > 0) {
        if (distance === null) return false;
        if (distance > filters.maxMiles) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const da = a.distance ?? Number.POSITIVE_INFINITY;
      const db = b.distance ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return (b.drop.rewardPerWinner ?? 0) - (a.drop.rewardPerWinner ?? 0);
    });

    return filtered;
  }, [drops, userPos, filters]);

  const TYPE_CHIPS: { key: DropTypeFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "cash", label: "Cash" },
    { key: "sponsored", label: "Sponsored" },
  ];

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5" data-testid="page-cash-drops-list">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}
          >
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-black text-xl text-amber-300 leading-tight">Cash Drops</h1>
            <p className="text-[11px] text-muted-foreground">
              Active drops near you, refreshed every 5 seconds.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div
          className="rounded-2xl p-4 space-y-4"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          data-testid="section-filters"
        >
          <div className="flex flex-wrap gap-2">
            {TYPE_CHIPS.map((chip) => {
              const active = filters.type === chip.key;
              return (
                <button
                  key={chip.key}
                  onClick={() => setFilters((f) => ({ ...f, type: chip.key }))}
                  className="px-3 py-1.5 rounded-full text-[11px] font-display font-bold tracking-wider transition-colors"
                  style={{
                    background: active ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.05)",
                    color: active ? "#fbbf24" : "#9ca3af",
                    border: active ? "1px solid rgba(245,158,11,0.4)" : "1px solid rgba(255,255,255,0.08)",
                  }}
                  data-testid={`chip-type-${chip.key}`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-display font-bold tracking-widest text-muted-foreground uppercase">
                Max distance
              </label>
              <span className="text-[11px] font-display text-amber-400" data-testid="text-max-distance">
                {filters.maxMiles === 0 ? "Any" : `${filters.maxMiles} mi`}
              </span>
            </div>
            <Slider
              value={[filters.maxMiles]}
              onValueChange={(v) => setFilters((f) => ({ ...f, maxMiles: v[0] ?? 0 }))}
              min={0}
              max={50}
              step={1}
              data-testid="slider-max-distance"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-display font-bold tracking-widest text-muted-foreground uppercase">
              Min payout ($)
            </label>
            <Input
              type="number"
              min={0}
              step="1"
              value={filters.minPayout || ""}
              placeholder="0"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setFilters((f) => ({ ...f, minPayout: Number.isFinite(v) && v > 0 ? v : 0 }));
              }}
              className="bg-white/[0.04] border-white/[0.08] text-amber-200 placeholder:text-muted-foreground/40"
              data-testid="input-min-payout"
            />
          </div>

          {(filters.type !== "all" || filters.maxMiles > 0 || filters.minPayout > 0) && (
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="text-[10px] font-display font-bold tracking-widest text-muted-foreground hover:text-amber-400 uppercase"
              data-testid="button-clear-filters"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* GPS hint */}
        {!userPos && gpsError && (
          <div className="rounded-xl px-3 py-2 flex items-start gap-2" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)" }}>
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-300/80 leading-relaxed">
              Location unavailable — distances and sorting won't be accurate.
            </p>
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : enriched.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center space-y-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.08)" }}
            data-testid="empty-cash-drops"
          >
            <Zap className="w-10 h-10 text-amber-400/40 mx-auto" />
            <p className="font-display font-bold text-sm text-muted-foreground">
              {drops.length === 0 ? "No active drops right now" : "No drops match your filters"}
            </p>
            <p className="text-[11px] text-muted-foreground/60">
              {drops.length === 0
                ? "Pull down or check back soon — new drops go live throughout the day."
                : "Try widening your distance or lowering your minimum payout."}
            </p>
            <Button
              variant="outline"
              className="rounded-xl border-amber-500/30 text-amber-300"
              onClick={() => navigate("/map")}
              data-testid="button-open-map"
            >
              Open the map
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {enriched.map(({ drop, distance }) => {
              const slotsLeft = (drop.winnerLimit || 1) - (drop.winnersFound || 0);
              const ending = drop.endTime ? new Date(drop.endTime).getTime() - now : null;
              const isUrgent = ending !== null && ending > 0 && ending < 5 * 60_000;
              return (
                <button
                  key={drop.id}
                  onClick={() => navigate(`/cash-drop/${drop.id}`)}
                  className="w-full text-left rounded-2xl p-4 transition-all active:scale-[0.99] hover:-translate-y-px"
                  style={{
                    background: "linear-gradient(135deg, #1a0a00 0%, #2d1200 50%, #1a0500 100%)", // dark-gradient-allow: amber cash-drop card surface, established brand dark theme
                    border: "1.5px solid rgba(245,158,11,0.28)",
                  }}
                  data-testid={`card-cash-drop-${drop.id}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-display font-black tracking-[0.2em] text-amber-400/80 uppercase">
                          {drop.isSponsored ? "Sponsored" : "Cash"}
                        </span>
                        {isUrgent && (
                          <span
                            className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: "rgba(239,68,68,0.18)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}
                          >
                            Ends soon
                          </span>
                        )}
                      </div>
                      <h2 className="font-display font-black text-base text-amber-300 leading-tight truncate">
                        {drop.title}
                      </h2>
                      <p className="text-[11px] text-amber-400/50 truncate">{dropHostLabel(drop)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[9px] font-display tracking-wider text-amber-400/50 uppercase">Reward</p>
                      <p className="font-display font-black text-xl text-amber-300" data-testid={`text-reward-${drop.id}`}>
                        ${drop.rewardPerWinner?.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-amber-400/70 font-display">
                    <span className="flex items-center gap-1" data-testid={`text-distance-${drop.id}`}>
                      <MapPin className="w-3 h-3" />
                      {formatDistance(distance)}
                    </span>
                    <span className="text-amber-400/30">·</span>
                    <span className="flex items-center gap-1" data-testid={`text-time-remaining-${drop.id}`}>
                      <Clock className="w-3 h-3" />
                      {formatTimeRemaining(drop.endTime, now)}
                    </span>
                    <span className="text-amber-400/30">·</span>
                    <span className="flex items-center gap-1">
                      <Trophy className="w-3 h-3" />
                      {slotsLeft === 1 ? "1 slot" : `${slotsLeft} slots`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </GuberLayout>
  );
}
