import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { List, MapPin, X, Zap, Search, Navigation, ChevronUp, ChevronDown, AlertTriangle, LocateOff, RefreshCw } from "lucide-react";
import { GuberLayout } from "@/components/guber-layout";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isNativeApp, isAndroid } from "@/lib/platform";
import { gpsStartWatchPosition } from "@/lib/gps";

interface ZipJob {
  id: number;
  title: string;
  category: string;
  serviceType: string | null;
  budget: number | null;
  urgentSwitch: boolean;
  locationApprox: string;
  color: string;
}

interface ZipGroup {
  zip: string;
  lat: number;
  lng: number;
  total: number;
  urgentCount: number;
  dominantCategory: string;
  dominantColor: string;
  categoryBreakdown: Record<string, number>;
  jobs: ZipJob[];
}

const RADIUS_OPTIONS = [
  { label: "Any distance", miles: 0 },
  { label: "5 mi", miles: 5 },
  { label: "10 mi", miles: 10 },
  { label: "25 mi", miles: 25 },
  { label: "50 mi", miles: 50 },
];

const CATEGORY_OPTIONS = [
  { label: "All",      value: "",                color: "#64748B", icon: "✦" },
  { label: "On-Demand",value: "On-Demand Help",  color: "#F97316", icon: "⚡" },
  { label: "V&I",      value: "Verify & Inspect", color: "#8B5CF6", icon: "🔍" },
  { label: "Skilled",  value: "Skilled Labor",   color: "#DC2626", icon: "🔧" },
  { label: "General",  value: "General Labor",   color: "#16A34A", icon: "🤝" },
  { label: "Barter",   value: "Barter Labor",    color: "#0EA5E9", icon: "🔄" },
];

const LIGHT_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#eaf3e8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f8f4" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#4a5568" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#1a202c" }] },
  { featureType: "administrative.neighborhood", elementType: "labels.text.fill", stylers: [{ color: "#718096" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#c6e8c0" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#d1d5db" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#fef3c7" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#f59e0b" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#374151" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#e5e7eb" }] },
  { featureType: "transit.station", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#a8d5f0" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#2563eb" }] },
  { featureType: "landscape.natural", elementType: "geometry.fill", stylers: [{ color: "#dce8d8" }] },
  { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#eaf3e8" }] },
];

const US_CENTER = { lat: 39.8283, lng: -98.5795 };
const US_DENIED_ZOOM = 4;

const DARK_CTRL = "rgba(14,15,22,0.88)";
const DARK_CTRL_SOLID = "#0e0f16";
const DARK_BORDER = "rgba(255,255,255,0.08)";
const DARK_TEXT = "#f0f0f4";
const DARK_MUTED = "#8b8fa8";
const DARK_CHIP_INACTIVE = "rgba(255,255,255,0.07)";

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

function makeBubbleSvg(total: number, color: string, hasUrgent: boolean): string {
  const count = total > 999 ? "999+" : String(total);
  const size = Math.max(36, Math.min(64, 36 + Math.floor(Math.log2(total + 1)) * 7));
  const fontSize = size < 44 ? 11 : size < 54 ? 12 : 13;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;

  const urgentRing = hasUrgent
    ? `<circle cx="${size - 7}" cy="7" r="5" fill="#EF4444" stroke="white" stroke-width="1.5"/>
       <text x="${size - 7}" y="7" text-anchor="middle" dominant-baseline="central" font-family="Inter,sans-serif" font-weight="900" font-size="7" fill="white">!</text>`
    : "";

  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r + 3}" fill="rgba(0,0,0,0.18)"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2.5"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="Inter,system-ui,sans-serif" font-weight="800" font-size="${fontSize}" fill="white">${count}</text>
      ${urgentRing}
    </svg>`
  );
}

export default function MapExplore() {
  const [, navigate] = useLocation();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const initStartedRef = useRef(false);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const hasCenteredRef = useRef(false);
  const hasUpdatedLocationRef = useRef(false);

  const [mapReady, setMapReady] = useState(false);
  const [mapLoadErr, setMapLoadErr] = useState<string | null>(null);
  const [locating, setLocating] = useState(true);
  const [radiusMiles, setRadiusMiles] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [mapViewMode, setMapViewMode] = useState<"jobs" | "workers" | "cash_drops">("jobs");
  const [zipInput, setZipInput] = useState("");
  const [jumpCenter, setJumpCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState("");
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [selectedZip, setSelectedZip] = useState<ZipGroup | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<any | null>(null);
  const [panelCatFilter, setPanelCatFilter] = useState("");
  const [bottomOpen, setBottomOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: config } = useQuery<{ googleMapsApiKey: string }>({
    queryKey: ["/api/config"],
  });

  const { data: zipGroups = [] } = useQuery<ZipGroup[]>({
    queryKey: ["/api/map-jobs/by-zip"],
    refetchInterval: 60000,
    enabled: mapViewMode === "jobs",
  });

  const { data: workerPins = [] } = useQuery<any[]>({
    queryKey: ["/api/workers/map"],
    enabled: mapViewMode === "workers",
  });

  const { data: activeDrops = [] } = useQuery<any[]>({
    queryKey: ["/api/cash-drops/active"],
    refetchInterval: 30000,
  });

  const [selectedDrop, setSelectedDrop] = useState<any | null>(null);
  const dropOverlaysRef = useRef<any[]>([]);

  const apiKey = config?.googleMapsApiKey ?? "";
  const filterOrigin = jumpCenter || userPos;

  const filteredGroups = zipGroups.filter((g) => {
    if (categoryFilter && !g.categoryBreakdown[categoryFilter]) return false;
    if (radiusMiles > 0 && filterOrigin) {
      const dist = haversineMiles(filterOrigin.lat, filterOrigin.lng, g.lat, g.lng);
      if (dist > radiusMiles) return false;
    }
    return true;
  });

  const totalVisibleJobs = filteredGroups.reduce((sum, g) => {
    return sum + (categoryFilter ? (g.categoryBreakdown[categoryFilter] || 0) : g.total);
  }, 0);

  useEffect(() => {
    if (!config) return;
    if (!apiKey) { setMapLoadErr("no-key"); return; }
    if (locating) return;
    if (!mapDivRef.current || initStartedRef.current) return;
    initStartedRef.current = true;
    setMapLoadErr(null);
    const denied = !userPos && locationDenied;
    const mapCenter = userPos || US_CENTER;
    (async () => {
      try {
        setOptions({ key: apiKey, version: "weekly" } as Parameters<typeof setOptions>[0]);
        const mapsLib = await importLibrary("maps") as typeof google.maps;
        const map = new mapsLib.Map(mapDivRef.current!, {
          center: mapCenter,
          zoom: denied ? US_DENIED_ZOOM : 10,
          maxZoom: 13,
          styles: LIGHT_MAP_STYLES,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          backgroundColor: "#eaf3e8",
          gestureHandling: "greedy",
        });
        mapRef.current = map;
        setMapReady(true);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("Map load error:", msg);
        setMapLoadErr(msg || "load-failed");
        initStartedRef.current = false;
      }
    })();
  }, [apiKey, config, locating]);

  const watchIdRef2 = useRef<number | null>(null);

  const reverseGeocodeZip = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`/api/places/reverse-geocode?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      if (data?.zip) setZipInput(data.zip);
    } catch {}
  };

  const startWatchPosition = () => {
    setLocating(true);
    setLocationDenied(false);
    gpsStartWatchPosition(
      (pos) => {
        if (pos.coords.accuracy > 300) return;
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(coords);
        setLocating(false);
        setLocationDenied(false);
        if (mapRef.current && !hasCenteredRef.current) {
          mapRef.current.panTo(coords);
          mapRef.current.setZoom(10);
          hasCenteredRef.current = true;
        }
        reverseGeocodeZip(coords.lat, coords.lng);
        if (!hasUpdatedLocationRef.current) {
          hasUpdatedLocationRef.current = true;
          apiRequest("POST", "/api/users/location", { lat: coords.lat, lng: coords.lng }).catch(() => {});
        }
      },
      (err) => {
        const labels: Record<number, string> = { 1: "PERMISSION_DENIED", 2: "POSITION_UNAVAILABLE", 3: "TIMEOUT" };
        console.warn(`[GUBER] map-explore geolocation: ${labels[err.code] ?? "UNKNOWN"} (code ${err.code}) — ${err.message}`);
        setLocating(false);
        setLocationDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
    ).then((id) => { watchIdRef2.current = id; }).catch(() => { setLocating(false); setLocationDenied(true); });
  };

  const handleRetryLocation = () => {
    if (watchIdRef2.current !== null) navigator.geolocation.clearWatch(watchIdRef2.current);
    watchIdRef2.current = null;
    hasCenteredRef.current = false;
    startWatchPosition();
  };

  useEffect(() => {
    startWatchPosition();
    return () => {
      if (watchIdRef2.current !== null) navigator.geolocation.clearWatch(watchIdRef2.current);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !userPos) return;
    const g = window.google?.maps;
    if (!g) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.setPosition(userPos);
    } else {
      userMarkerRef.current = new g.Marker({
        position: userPos,
        map: mapRef.current,
        title: "You",
        icon: {
          path: g.SymbolPath.CIRCLE,
          fillColor: "#000000",
          fillOpacity: 1,
          strokeColor: "#8B5CF6",
          strokeWeight: 3,
          scale: 10,
        },
        zIndex: 9999,
      });
    }
  }, [mapReady, userPos]);

  useEffect(() => {
    if (!mapRef.current || !jumpCenter) return;
    mapRef.current.panTo(jumpCenter);
    mapRef.current.setZoom(11);
  }, [jumpCenter]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const g = window.google?.maps;
    if (!g) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    if (mapViewMode === "jobs") {
      filteredGroups.forEach((group) => {
        const catCount = categoryFilter ? (group.categoryBreakdown[categoryFilter] || 0) : group.total;
        if (catCount === 0) return;

        const color = categoryFilter
          ? (CATEGORY_OPTIONS.find(c => c.value === categoryFilter)?.color || group.dominantColor)
          : group.dominantColor;

        const svgUrl = makeBubbleSvg(catCount, color, group.urgentCount > 0 && !categoryFilter);
        const size = Math.max(36, Math.min(64, 36 + Math.floor(Math.log2(catCount + 1)) * 7));

        const marker = new g.Marker({
          position: { lat: group.lat, lng: group.lng },
          map: mapRef.current!,
          title: `${group.zip} — ${catCount} job${catCount !== 1 ? "s" : ""}`,
          icon: {
            url: svgUrl,
            scaledSize: new g.Size(size, size),
            anchor: new g.Point(size / 2, size / 2),
          },
          zIndex: 100 + Math.min(catCount, 100),
        });

        marker.addListener("click", () => {
          setSelectedZip(group);
          setSelectedWorker(null);
          setPanelCatFilter(categoryFilter);
        });

        markersRef.current.push(marker);
      });
    }

    if (mapViewMode === "workers") {
      workerPins.forEach((worker) => {
        const marker = new g.Marker({
          position: { lat: worker.lat, lng: worker.lng },
          map: mapRef.current!,
          title: worker.displayName || worker.guberId || "GUBER Member",
          icon: {
            path: g.SymbolPath.CIRCLE,
            fillColor: "#EC4899",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: 10,
          },
          zIndex: 150,
        });

        marker.addListener("click", () => {
          setSelectedWorker(worker);
          setSelectedZip(null);
        });

        markersRef.current.push(marker);
      });
    }
  }, [mapReady, filteredGroups, categoryFilter, workerPins, mapViewMode]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const g = window.google?.maps;
    if (!g) return;

    dropOverlaysRef.current.forEach((o) => { try { o.setMap(null); } catch {} });
    dropOverlaysRef.current = [];

    activeDrops.forEach((drop: any) => {
      const rawLat = drop.gpsLat ?? drop.gps_lat;
      const rawLng = drop.gpsLng ?? drop.gps_lng;
      if (!rawLat || !rawLng) return;
      const lat = parseFloat(rawLat);
      const lng = parseFloat(rawLng);
      if (isNaN(lat) || isNaN(lng)) return;

      const GUBER_COLORS = ["#F97316","#8B5CF6","#DC2626","#16A34A","#0EA5E9"];

      class CashDropOverlay extends g.OverlayView {
        private div: HTMLDivElement | null = null;
        private pos: google.maps.LatLng;
        private dropData: any;
        private onClick: () => void;
        private _colorInterval: ReturnType<typeof setInterval> | null = null;
        private _ringIntervals: ReturnType<typeof setInterval>[] = [];

        constructor(position: google.maps.LatLng, data: any, onClick: () => void) {
          super();
          this.pos = position;
          this.dropData = data;
          this.onClick = onClick;
        }

        onAdd() {
          this.div = document.createElement("div");
          this.div.style.cssText = "position:absolute;cursor:pointer;transform:translate(-50%,-50%);z-index:9999;";

          const wrapper = document.createElement("div");
          wrapper.style.cssText = "position:relative;width:56px;height:72px;display:flex;flex-direction:column;align-items:center;";

          const rings: HTMLDivElement[] = [0,1,2].map(() => {
            const r = document.createElement("div");
            r.style.cssText = "position:absolute;top:4px;left:50%;width:44px;height:44px;border-radius:50%;border:2px solid #22C55E;pointer-events:none;opacity:0;transform:translateX(-50%) scale(1);";
            wrapper.appendChild(r);
            return r;
          });

          const circle = document.createElement("div");
          circle.style.cssText = "position:relative;z-index:10;width:38px;height:38px;border-radius:50%;background:#22C55E;border:2.5px solid #ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px #22C55E,0 0 28px #22C55E66,0 3px 10px rgba(0,0,0,0.55);margin-top:6px;";

          const dollar = document.createElement("span");
          dollar.textContent = "$";
          dollar.style.cssText = "font-size:20px;font-weight:900;line-height:1;font-family:system-ui,sans-serif;color:#000000;letter-spacing:-1px;";
          circle.appendChild(dollar);

          const pill = document.createElement("div");
          pill.style.cssText = "margin-top:3px;background:rgba(0,0,0,0.92);border-radius:6px;padding:1px 5px;white-space:nowrap;border:1.5px solid #22C55E;";
          const pillText = document.createElement("span");
          pillText.textContent = "CASH DROP";
          pillText.style.cssText = "font-size:6.5px;font-weight:900;letter-spacing:0.15em;font-family:system-ui,sans-serif;color:#22C55E;";
          pill.appendChild(pillText);

          wrapper.appendChild(circle);
          wrapper.appendChild(pill);
          this.div.appendChild(wrapper);

          let colorIdx = 0;
          this._colorInterval = setInterval(() => {
            colorIdx = (colorIdx + 1) % GUBER_COLORS.length;
            const c = GUBER_COLORS[colorIdx];
            circle.style.background = c;
            circle.style.boxShadow = `0 0 22px ${c},0 0 44px ${c}66,0 4px 14px rgba(0,0,0,0.55)`;
            pill.style.borderColor = c;
            pillText.style.color = c;
            rings.forEach(r => { r.style.borderColor = c; });
          }, 180);

          const ringPhases = [0, 0.33, 0.66];
          ringPhases.forEach((phase, i) => {
            let t = phase;
            this._ringIntervals.push(setInterval(() => {
              t += 0.025;
              if (t >= 1) t = 0;
              const scale = 1 + t * 2.8;
              const opacity = Math.max(0, 1 - t);
              rings[i].style.transform = `translateX(-50%) scale(${scale})`;
              rings[i].style.opacity = String(opacity.toFixed(3));
            }, 30));
          });

          this.div.addEventListener("click", this.onClick);
          const panes = this.getPanes();
          if (panes) panes.overlayMouseTarget.appendChild(this.div);
        }

        draw() {
          if (!this.div) return;
          const proj = this.getProjection();
          if (!proj) return;
          const point = proj.fromLatLngToDivPixel(this.pos);
          if (!point) return;
          this.div.style.left = `${point.x}px`;
          this.div.style.top = `${point.y}px`;
        }

        onRemove() {
          if (this._colorInterval) clearInterval(this._colorInterval);
          this._ringIntervals.forEach(clearInterval);
          this._ringIntervals = [];
          if (this.div) {
            this.div.removeEventListener("click", this.onClick);
            this.div.parentNode?.removeChild(this.div);
            this.div = null;
          }
        }
      }

      const pos = new g.LatLng(lat, lng);
      const overlay = new CashDropOverlay(pos, drop, () => {
        setSelectedDrop(drop);
        setSelectedZip(null);
        setSelectedWorker(null);
      });
      overlay.setMap(mapRef.current);
      dropOverlaysRef.current.push(overlay);
    });
  }, [mapReady, activeDrops]);

  const handleZipJump = async () => {
    const zip = zipInput.trim();
    if (!/^\d{5}$/.test(zip)) { setZipError("Enter a valid 5-digit zip"); return; }
    setZipError(""); setZipLoading(true);
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(zip + ", USA")}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (typeof data?.lat !== "number" || typeof data?.lng !== "number") throw new Error();
      const coords = { lat: data.lat, lng: data.lng };
      setJumpCenter(coords);
      if (mapRef.current) {
        mapRef.current.panTo(coords);
        mapRef.current.setZoom(11);
      }
      inputRef.current?.blur();
    } catch { setZipError("Zip not found"); }
    finally { setZipLoading(false); }
  };

  const handleRecenter = () => {
    if (!mapRef.current) return;
    if (userPos) {
      mapRef.current.panTo(userPos);
      mapRef.current.setZoom(11);
    } else {
      mapRef.current.panTo(US_CENTER);
      mapRef.current.setZoom(US_DENIED_ZOOM);
    }
  };

  const handlePanToDrop = (drop: any) => {
    if (!mapRef.current) return;
    const lat = parseFloat(drop.gpsLat ?? drop.gps_lat);
    const lng = parseFloat(drop.gpsLng ?? drop.gps_lng);
    if (isNaN(lat) || isNaN(lng)) return;
    mapRef.current.panTo({ lat, lng });
    mapRef.current.setZoom(16);
    setSelectedDrop(drop);
    setSelectedZip(null);
    setSelectedWorker(null);
  };

  const panelJobs = selectedZip
    ? (panelCatFilter ? selectedZip.jobs.filter(j => j.category === panelCatFilter) : selectedZip.jobs)
    : [];

  const panelCategories = selectedZip
    ? Object.entries(selectedZip.categoryBreakdown).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <GuberLayout>
    <div className="fixed left-0 right-0 z-10 overflow-hidden" style={{ background: "#eaf3e8", top: (isNativeApp && isAndroid) ? 'calc(56px + 36px)' : 'calc(56px + env(safe-area-inset-top, 0px))', bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }} data-testid="page-map-explore">

      {/* MAP */}
      <div ref={mapDivRef} className="absolute inset-0" />

      {/* DETECTING LOCATION OVERLAY */}
      {locating && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3" style={{ background: "#eaf3e8" }} data-testid="overlay-detecting-location">
          <Navigation className="w-8 h-8 animate-pulse" style={{ color: "#16a34a" }} />
          <p className="text-sm font-bold tracking-wide" style={{ color: "#15803d", fontFamily: "Inter, sans-serif" }}>
            Detecting your location…
          </p>
        </div>
      )}

      {/* MAP ERROR / NOT CONFIGURED OVERLAY */}
      {mapLoadErr && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 pointer-events-auto" style={{ background: "#eaf3e8" }}>
          {mapLoadErr === "no-key" ? (
            <>
              <MapPin className="w-10 h-10 opacity-20" style={{ color: "#15803d" }} />
              <p className="text-sm font-bold tracking-wide opacity-40" style={{ color: "#15803d" }}>MAP NOT CONFIGURED</p>
            </>
          ) : (
            <>
              <AlertTriangle className="w-9 h-9" style={{ color: "#f59e0b", opacity: 0.5 }} />
              <p className="text-sm font-bold tracking-wide" style={{ color: "#374151" }}>Map could not load</p>
              <p className="text-xs text-center max-w-[220px]" style={{ color: "#6b7280" }}>{mapLoadErr}</p>
              <button
                onClick={() => {
                  setMapLoadErr(null);
                  initStartedRef.current = false;
                  setMapReady(false);
                  mapRef.current = null;
                }}
                className="mt-1 px-4 py-2 rounded-xl text-xs font-bold tracking-wider active:scale-95 transition-all"
                style={{ background: "#15803d", color: "#ffffff" }}
                data-testid="button-retry-map"
              >
                RETRY
              </button>
            </>
          )}
        </div>
      )}

      {/* LOCATION DENIED BANNER */}
      {locationDenied && mapReady && (
        <div
          className="absolute z-25 bottom-20 left-3 right-3 flex items-center gap-2 px-3 py-2 rounded-xl pointer-events-auto"
          style={{ background: "rgba(14,15,22,0.92)", border: "1px solid rgba(245,158,11,0.35)", backdropFilter: "blur(10px)", zIndex: 25 }}
          data-testid="banner-location-denied-explore"
        >
          <LocateOff className="w-3.5 h-3.5 shrink-0" style={{ color: "#f59e0b" }} />
          <span className="flex-1 text-[10px] font-bold tracking-wide" style={{ color: "rgba(255,255,255,0.85)", fontFamily: "Inter, sans-serif" }}>
            Location unavailable — enter a ZIP above to browse nearby jobs
          </span>
          <button
            onClick={handleRetryLocation}
            className="flex items-center gap-1 text-[10px] font-bold"
            style={{ color: "#4ade80" }}
            data-testid="button-retry-location-explore"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {/* TOP FLOATING CONTROLS */}
      <div className="absolute top-0 left-0 right-0 z-30 px-3 pt-2 pb-0 pointer-events-none">

        {/* Search bar row */}
        <div className="flex items-center gap-2 pointer-events-auto">

          {/* Search pill — expands to fill space, GO button lives inside */}
          <div
            className="flex-1 flex items-center gap-2 px-3 h-10 rounded-full shadow-lg"
            style={{ background: DARK_CTRL, border: `1px solid ${DARK_BORDER}`, backdropFilter: "blur(12px)" }}
          >
            <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: DARK_MUTED }} />
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Search zip code..."
              value={zipInput}
              onChange={e => { setZipInput(e.target.value.replace(/\D/g, "").slice(0, 5)); setZipError(""); }}
              onKeyDown={e => e.key === "Enter" && handleZipJump()}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: DARK_TEXT, fontFamily: "Inter, sans-serif" }}
              data-testid="input-zip-jump"
            />
            {zipInput && zipInput.length < 5 && (
              <button onClick={() => { setZipInput(""); setJumpCenter(null); setZipError(""); }} style={{ color: DARK_MUTED }}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {zipInput.length === 5 && (
              <button
                onClick={handleZipJump}
                disabled={zipLoading}
                className="h-6 px-3 rounded-full text-[11px] font-bold active:scale-95 transition-all disabled:opacity-50 flex-shrink-0"
                style={{ background: "#16a34a", color: "#fff", fontFamily: "Inter, sans-serif" }}
                data-testid="button-zip-go"
              >
                {zipLoading ? "…" : "GO"}
              </button>
            )}
          </div>

          {/* List view button */}
          <button
            onClick={() => navigate("/browse-jobs")}
            className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all flex-shrink-0"
            style={{ background: DARK_CTRL, border: `1px solid ${DARK_BORDER}`, backdropFilter: "blur(12px)" }}
            data-testid="button-list-view"
            title="List view"
          >
            <List className="w-4 h-4" style={{ color: DARK_TEXT }} />
          </button>
        </div>

        {zipError && (
          <p className="text-xs text-amber-400 pl-14 mt-1 pointer-events-auto" style={{ fontFamily: "Inter, sans-serif" }}>
            {zipError}
          </p>
        )}

        {/* Category chip pills — jobs mode only */}
        {mapViewMode === "jobs" && <div className="mt-2.5 flex gap-2 overflow-x-auto scrollbar-none pb-1 pointer-events-auto">
          {CATEGORY_OPTIONS.map(cat => {
            const active = categoryFilter === cat.value;
            return (
              <button
                key={cat.value}
                onClick={() => setCategoryFilter(active ? "" : cat.value)}
                className="flex-shrink-0 h-8 px-3 rounded-full text-xs font-semibold shadow-md active:scale-95 transition-all flex items-center gap-1.5"
                style={{
                  background: active ? cat.color : DARK_CHIP_INACTIVE,
                  color: active ? "#fff" : DARK_MUTED,
                  border: active ? "none" : `1px solid ${DARK_BORDER}`,
                  fontFamily: "Inter, sans-serif",
                  backdropFilter: "blur(10px)",
                  boxShadow: active ? `0 2px 8px ${cat.color}55` : "0 1px 4px rgba(0,0,0,0.3)",
                }}
                data-testid={`button-cat-${cat.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <span className="text-[13px] leading-none">{cat.icon}</span>
                {cat.label}
              </button>
            );
          })}
        </div>}
      </div>

      {/* LIVE DROP JUMP BUTTON */}
      {mapReady && activeDrops.length > 0 && (
        <button
          onClick={() => handlePanToDrop(activeDrops[0])}
          className="absolute left-3 z-20 flex items-center gap-2 px-3 h-10 rounded-full shadow-lg active:scale-95 transition-all"
          style={{
            bottom: (selectedZip || selectedWorker) ? "calc(55vh + 16px)" : "168px",
            background: "#000",
            border: "2px solid #F59E0B",
            backdropFilter: "blur(12px)",
          }}
          data-testid="button-pan-to-drop"
        >
          <span style={{ fontSize: 13, fontWeight: 900, color: "#F59E0B", fontFamily: "system-ui", letterSpacing: "0.05em" }}>⚡ LIVE DROP</span>
        </button>
      )}

      {/* RECENTER BUTTON */}
      {mapReady && (
        <button
          onClick={handleRecenter}
          className="absolute right-3 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all"
          style={{
            bottom: (selectedZip || selectedWorker) ? "calc(55vh + 16px)" : "168px",
            background: DARK_CTRL,
            border: `1px solid ${DARK_BORDER}`,
            backdropFilter: "blur(12px)",
          }}
          data-testid="button-recenter"
        >
          <Navigation className="w-4 h-4" style={{ color: DARK_TEXT }} />
        </button>
      )}

      {/* BOTTOM SHEET — collapsible job count + filters + legend */}
      {!selectedZip && !selectedWorker && (
        <div
          className="absolute left-0 right-0 bottom-0 z-30 rounded-t-3xl transition-all duration-300"
          style={{
            background: DARK_CTRL_SOLID,
            boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
            borderTop: `1px solid ${DARK_BORDER}`,
          }}
          data-testid="panel-bottom-sheet"
        >
          {/* Toggle handle — always visible, tappable */}
          <button
            onClick={() => setBottomOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3 active:opacity-70 transition-opacity"
            data-testid="button-toggle-bottom-sheet"
          >
            <div className="flex items-center gap-2">
              {/* Mini color dot strip shown when collapsed */}
              {!bottomOpen && (
                <div className="flex items-center gap-1 mr-1">
                  {["#F97316","#8B5CF6","#DC2626","#16A34A","#0EA5E9"].map(c => (
                    <span key={c} className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                  ))}
                </div>
              )}
              <span
                className="text-[11px] font-bold tracking-[0.08em] uppercase"
                style={{ color: DARK_MUTED, fontFamily: "Inter, sans-serif" }}
              >
                {bottomOpen
                  ? (mapViewMode === "workers" ? `${workerPins.length} worker${workerPins.length !== 1 ? "s" : ""} clocked in` : mapViewMode === "cash_drops" ? `${activeDrops.length} cash drop${activeDrops.length !== 1 ? "s" : ""} active` : `${totalVisibleJobs} job${totalVisibleJobs !== 1 ? "s" : ""} nearby`)
                  : "Map Key · Tap to expand"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* drag handle pill */}
              <div className="w-8 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.14)" }} />
              {bottomOpen
                ? <ChevronDown className="w-4 h-4" style={{ color: DARK_MUTED }} />
                : <ChevronUp className="w-4 h-4" style={{ color: DARK_MUTED }} />
              }
            </div>
          </button>

          {/* Expandable content */}
          {bottomOpen && (
            <div className="px-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-base font-bold" style={{ color: DARK_TEXT, fontFamily: "Inter, sans-serif" }}>
                    {mapViewMode === "cash_drops" ? (activeDrops.length === 0 ? "No active cash drops" : `${activeDrops.length} cash drop${activeDrops.length !== 1 ? "s" : ""} active`) : totalVisibleJobs === 0 ? "No jobs nearby" : `${totalVisibleJobs} job${totalVisibleJobs !== 1 ? "s" : ""} available`}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: DARK_MUTED, fontFamily: "Inter, sans-serif" }}>
                    {jumpCenter && zipInput ? `Near ${zipInput}` : userPos ? "Near your location" : "Allow location or search a zip"}
                    {radiusMiles > 0 ? ` · within ${radiusMiles} miles` : ""}
                  </p>
                </div>
                {(radiusMiles > 0 || categoryFilter) && (
                  <button
                    onClick={() => { setRadiusMiles(0); setCategoryFilter(""); }}
                    className="text-xs font-semibold px-2.5 py-1 rounded-full active:scale-95"
                    style={{ background: "rgba(100,100,120,0.18)", color: "#9ca3af", fontFamily: "Inter, sans-serif" }}
                    data-testid="button-clear-filters"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex gap-1.5 mb-3">
                {([
                  { label: "Jobs", value: "jobs" as const, activeColor: "#16a34a", shadow: "rgba(22,163,74,0.35)" },
                  { label: "Workers", value: "workers" as const, activeColor: "#EC4899", shadow: "rgba(236,72,153,0.35)" },
                  { label: "Cash Drops", value: "cash_drops" as const, activeColor: "#F59E0B", shadow: "rgba(245,158,11,0.35)" },
                ] as const).map(opt => {
                  const active = mapViewMode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => { setMapViewMode(opt.value); setSelectedZip(null); setSelectedWorker(null); setSelectedDrop(null); setCategoryFilter(""); setRadiusMiles(0); }}
                      className="flex-shrink-0 h-7 px-4 rounded-full text-[11px] font-bold active:scale-95 transition-all uppercase tracking-wider"
                      style={{
                        background: active ? opt.activeColor : DARK_CHIP_INACTIVE,
                        color: active ? "#fff" : DARK_MUTED,
                        border: active ? "none" : `1px solid ${DARK_BORDER}`,
                        fontFamily: "Inter, sans-serif",
                        boxShadow: active ? `0 2px 6px ${opt.shadow}` : "none",
                      }}
                      data-testid={`button-view-${opt.value}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {mapViewMode === "jobs" && (
                <>
                  <div className="flex gap-1.5 overflow-x-auto scrollbar-none mb-3">
                    {RADIUS_OPTIONS.map(opt => {
                      const active = radiusMiles === opt.miles;
                      return (
                        <button
                          key={opt.miles}
                          onClick={() => setRadiusMiles(opt.miles)}
                          className="flex-shrink-0 h-7 px-3 rounded-full text-[11px] font-semibold active:scale-95 transition-all"
                          style={{
                            background: active ? "#16a34a" : DARK_CHIP_INACTIVE,
                            color: active ? "#fff" : DARK_MUTED,
                            border: active ? "none" : `1px solid ${DARK_BORDER}`,
                            fontFamily: "Inter, sans-serif",
                            boxShadow: active ? "0 2px 6px rgba(22,163,74,0.35)" : "none",
                          }}
                          data-testid={`button-radius-${opt.miles}`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-3" style={{ borderTop: `1px solid ${DARK_BORDER}` }}>
                    {[
                      { label: "On-Demand", color: "#F97316" },
                      { label: "V&I",      color: "#8B5CF6" },
                      { label: "Skilled",  color: "#DC2626" },
                      { label: "General",  color: "#16A34A" },
                      { label: "Barter",   color: "#0EA5E9" },
                      { label: "You", color: "#000000", outline: "#8B5CF6" },
                    ].map(({ label, color, outline }) => (
                      <span key={label} className="flex items-center gap-1.5" style={{ fontFamily: "Inter, sans-serif", fontSize: 10, color: DARK_MUTED }}>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color, boxShadow: outline ? `0 0 0 1.5px ${outline}` : undefined }}
                        />
                        {label}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {mapViewMode === "workers" && (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-3" style={{ borderTop: `1px solid ${DARK_BORDER}` }}>
                  {[
                    { label: "Clocked-in Worker", color: "#EC4899" },
                    { label: "You", color: "#000000", outline: "#8B5CF6" },
                  ].map(({ label, color, outline }) => (
                    <span key={label} className="flex items-center gap-1.5" style={{ fontFamily: "Inter, sans-serif", fontSize: 10, color: DARK_MUTED }}>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color, boxShadow: outline ? `0 0 0 1.5px ${outline}` : undefined }}
                      />
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* WORKER PANEL */}
      {selectedWorker && (
        <div
          className="absolute inset-x-0 bottom-0 z-40 rounded-t-3xl flex flex-col p-6"
          style={{
            maxHeight: "58vh",
            background: DARK_CTRL_SOLID,
            boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
            borderTop: `1px solid ${DARK_BORDER}`,
          }}
          data-testid="panel-worker-details"
        >
          <div className="flex justify-center pt-3 pb-1 absolute top-0 left-0 right-0">
            <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
          </div>

          <div className="flex items-center justify-between mb-6 mt-2">
            <div className="flex items-center gap-4">
              <Avatar className="w-14 h-14 rounded-2xl border-2 border-primary/20">
                <AvatarImage src={selectedWorker.avatar || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
                  {(selectedWorker.displayName || "G").charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold" style={{ color: DARK_TEXT }}>{selectedWorker.displayName || "GUBER Member"}</h3>
                  <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20 uppercase">
                    {selectedWorker.tier}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-amber-400">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <span className="text-sm font-bold">{selectedWorker.rating.toFixed(1)}</span>
                  <span className="text-xs text-muted-foreground">({selectedWorker.reviewCount} reviews)</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedWorker(null)}
              className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-all"
              style={{ background: DARK_CHIP_INACTIVE }}
              data-testid="button-close-worker-panel"
            >
              <X className="w-5 h-5" style={{ color: DARK_MUTED }} />
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto pr-2 scrollbar-none mb-6">
            {selectedWorker.bio && (
              <div>
                <p className="text-[11px] font-bold tracking-[0.1em] uppercase mb-1.5" style={{ color: DARK_MUTED }}>About</p>
                <p className="text-sm leading-relaxed" style={{ color: DARK_TEXT }}>{selectedWorker.bio}</p>
              </div>
            )}

            {selectedWorker.skills && (
              <div>
                <p className="text-[11px] font-bold tracking-[0.1em] uppercase mb-2" style={{ color: DARK_MUTED }}>Skills</p>
                <div className="flex flex-wrap gap-2">
                  {selectedWorker.skills.split(",").map((skill: string, i: number) => (
                    <Badge key={i} variant="secondary" className="bg-white/5 border-white/5 text-xs py-1 px-3">
                      {skill.trim()}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-auto space-y-2">
            <Button
              variant="outline"
              className="w-full h-11 rounded-xl font-bold tracking-[0.12em] active:scale-95 transition-all border-0"
              style={{ background: DARK_CHIP_INACTIVE, color: DARK_TEXT }}
              onClick={() => navigate(`/profile/${selectedWorker.id}`)}
              data-testid="button-view-profile-map"
            >
              VIEW FULL PROFILE
            </Button>
            <Button
              className="w-full h-12 rounded-xl font-bold tracking-[0.12em] bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg active:scale-95 transition-all"
              onClick={() => navigate(`/post-job?helperId=${selectedWorker.id}`)}
              data-testid="button-send-gig-map"
            >
              SEND A GIG
            </Button>
          </div>
        </div>
      )}

      {/* ZIP JOB PANEL */}
      {selectedDrop && (
        <div
          className="absolute inset-x-0 bottom-0 z-50 rounded-t-3xl flex flex-col"
          style={{
            maxHeight: "50vh",
            background: "linear-gradient(180deg, #1a0a00 0%, #0d0600 100%)",
            boxShadow: "0 -4px 32px rgba(245,158,11,0.15)",
            borderTop: "1.5px solid rgba(245,158,11,0.3)",
          }}
          data-testid="panel-cash-drop"
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full" style={{ background: "rgba(245,158,11,0.2)" }} />
          </div>
          <div className="px-5 pt-2 pb-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(245,158,11,0.12)", border: "1.5px solid rgba(245,158,11,0.3)" }}>
                  <span style={{ fontSize: 24 }}>⚡</span>
                </div>
                <div>
                  <p style={{ fontSize: 9, letterSpacing: "0.2em", color: "rgba(245,158,11,0.6)", fontWeight: 900, fontFamily: "system-ui", textTransform: "uppercase" }}>⚡ GUBER CASH DROP — LIVE</p>
                  <p style={{ fontSize: 16, fontWeight: 900, color: "#f59e0b", fontFamily: "system-ui", lineHeight: 1.2, marginTop: 2 }}>{selectedDrop.title}</p>
                </div>
              </div>
              <button onClick={() => setSelectedDrop(null)} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(245,158,11,0.1)" }} data-testid="button-close-drop-panel">
                <X className="w-4 h-4" style={{ color: "rgba(245,158,11,0.6)" }} />
              </button>
            </div>
            {(selectedDrop.isSponsored || selectedDrop.is_sponsored) && (selectedDrop.brandingEnabled || selectedDrop.branding_enabled) && (selectedDrop.sponsorName || selectedDrop.sponsor_name) && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.15em", color: "rgba(201,168,76,0.45)", textTransform: "uppercase" }}>Sponsored by</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(201,168,76,0.75)" }}>{selectedDrop.sponsorName || selectedDrop.sponsor_name}</span>
              </div>
            )}
            <div className="flex items-center gap-5">
              <div>
                <p style={{ fontSize: 10, color: "rgba(245,158,11,0.4)", fontFamily: "system-ui", textTransform: "uppercase", letterSpacing: "0.1em" }}>Reward</p>
                <p style={{ fontSize: 28, fontWeight: 900, color: "#fbbf24", fontFamily: "system-ui" }}>${parseFloat(selectedDrop.reward_per_winner || selectedDrop.rewardPerWinner || 0).toFixed(0)}</p>
              </div>
              <div style={{ width: 1, height: 32, background: "rgba(245,158,11,0.15)" }} />
              <div>
                <p style={{ fontSize: 10, color: "rgba(245,158,11,0.4)", fontFamily: "system-ui", textTransform: "uppercase", letterSpacing: "0.1em" }}>Slots Left</p>
                <p style={{ fontSize: 28, fontWeight: 900, color: "#fbbf24", fontFamily: "system-ui" }}>{(selectedDrop.winner_limit || selectedDrop.winnerLimit || 1) - (selectedDrop.winners_found || selectedDrop.winnersFound || 0)}</p>
              </div>
              {(selectedDrop.isSponsored || selectedDrop.is_sponsored) && (selectedDrop.brandingEnabled || selectedDrop.branding_enabled) && (selectedDrop.rewardType || selectedDrop.reward_type) && (selectedDrop.rewardType || selectedDrop.reward_type) !== "cash" && (
                <>
                  <div style={{ width: 1, height: 32, background: "rgba(201,168,76,0.15)" }} />
                  <div>
                    <p style={{ fontSize: 10, color: "rgba(201,168,76,0.4)", fontFamily: "system-ui", textTransform: "uppercase", letterSpacing: "0.1em" }}>+ Reward</p>
                    <p style={{ fontSize: 12, fontWeight: 900, color: "rgba(201,168,76,0.7)", fontFamily: "system-ui" }}>
                      {(selectedDrop.rewardDescription || selectedDrop.reward_description || "Bonus").split(" ").slice(0, 2).join(" ")}
                    </p>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => navigate(`/cash-drop/${selectedDrop.id}`)}
              className="w-full h-12 rounded-xl font-bold flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #d97706, #f59e0b)", color: "#000", fontSize: 13, letterSpacing: "0.1em", fontFamily: "system-ui" }}
              data-testid="button-view-cash-drop"
            >
              ⚡ VIEW CASH DROP →
            </button>
          </div>
        </div>
      )}

      {selectedZip && !selectedDrop && (
        <div
          className="absolute inset-x-0 bottom-0 z-40 rounded-t-3xl flex flex-col"
          style={{
            maxHeight: "58vh",
            background: DARK_CTRL_SOLID,
            boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
            borderTop: `1px solid ${DARK_BORDER}`,
          }}
          data-testid="panel-zip-jobs"
        >
          <div className="flex-shrink-0">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
            </div>

            <div className="flex items-center justify-between px-5 pt-1 pb-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center"
                  style={{ background: `${selectedZip.dominantColor}25` }}
                >
                  <MapPin className="w-5 h-5" style={{ color: selectedZip.dominantColor }} />
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: DARK_TEXT, fontFamily: "Inter, sans-serif" }}>
                    ZIP {selectedZip.zip}
                  </p>
                  <p className="text-xs" style={{ color: DARK_MUTED, fontFamily: "Inter, sans-serif" }}>
                    {selectedZip.total} job{selectedZip.total !== 1 ? "s" : ""}
                    {selectedZip.urgentCount > 0 && (
                      <span className="ml-1.5 text-amber-400 font-semibold">· {selectedZip.urgentCount} urgent</span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedZip(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center active:scale-95"
                style={{ background: DARK_CHIP_INACTIVE }}
                data-testid="button-close-panel"
              >
                <X className="w-4 h-4" style={{ color: DARK_MUTED }} />
              </button>
            </div>

            {panelCategories.length > 1 && (
              <div className="flex gap-1.5 px-5 pb-3 overflow-x-auto scrollbar-none">
                <button
                  onClick={() => setPanelCatFilter("")}
                  className="flex-shrink-0 h-6 px-3 rounded-full text-[11px] font-semibold active:scale-95 transition-all"
                  style={{
                    background: panelCatFilter === "" ? "rgba(255,255,255,0.15)" : DARK_CHIP_INACTIVE,
                    color: panelCatFilter === "" ? DARK_TEXT : DARK_MUTED,
                    border: `1px solid ${DARK_BORDER}`,
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  All {selectedZip.total}
                </button>
                {panelCategories.map(([cat, cnt]) => {
                  const catColor = CATEGORY_OPTIONS.find(c => c.value === cat)?.color || "#6b7280";
                  const active = panelCatFilter === cat;
                  return (
                    <button key={cat} onClick={() => setPanelCatFilter(active ? "" : cat)}
                      className="flex-shrink-0 h-6 px-3 rounded-full text-[11px] font-semibold active:scale-95 transition-all"
                      style={{
                        background: active ? catColor : DARK_CHIP_INACTIVE,
                        color: active ? "#fff" : DARK_MUTED,
                        border: active ? "none" : `1px solid ${DARK_BORDER}`,
                        fontFamily: "Inter, sans-serif",
                      }}
                    >
                      {cat.replace(" Help", "").replace(" Labor", "")} · {cnt}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ height: 1, background: DARK_BORDER }} />
          </div>

          <div className="overflow-y-auto flex-1">
            {panelJobs.map((job, i) => (
              <button
                key={job.id}
                onClick={() => navigate(`/jobs/${job.id}`)}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors active:bg-white/5"
                style={{ borderBottom: i < panelJobs.length - 1 ? `1px solid ${DARK_BORDER}` : "none" }}
                data-testid={`button-job-${job.id}`}
              >
                <div className="w-2 h-10 rounded-full flex-shrink-0" style={{ background: job.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: DARK_TEXT, fontFamily: "Inter, sans-serif" }}>
                    {job.title}
                  </p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: job.color, fontFamily: "Inter, sans-serif" }}>
                    {job.category}{job.serviceType ? ` · ${job.serviceType}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {job.urgentSwitch && (
                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-400 px-1.5 py-0.5 rounded-full"
                      style={{ background: "rgba(245,158,11,0.15)" }}>
                      <Zap className="w-2.5 h-2.5" /> URGENT
                    </span>
                  )}
                  <span className="text-sm font-bold" style={{ color: "#16a34a", fontFamily: "Inter, sans-serif" }}>
                    {job.budget ? `$${Math.round(job.budget)}` : "Barter"}
                  </span>
                </div>
              </button>
            ))}

            {panelJobs.length === 0 && (
              <p className="text-center text-sm py-8" style={{ color: DARK_MUTED, fontFamily: "Inter, sans-serif" }}>
                No jobs in this category
              </p>
            )}
          </div>
        </div>
      )}
    </div>
    </GuberLayout>
  );
}
