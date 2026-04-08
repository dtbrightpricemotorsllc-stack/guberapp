import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin as MapPinIcon, AlertTriangle, Navigation, LocateOff, RefreshCw } from "lucide-react";

export interface JobPin {
  id: number;
  title: string;
  category: string;
  serviceType: string | null;
  budget: number | null;
  status: string;
  urgentSwitch: boolean;
  lat: number;
  lng: number;
  locationApprox: string | null;
  color: string;
  createdAt: string | null;
}

export interface WorkerPin {
  id: number;
  fullName: string;
  username: string;
  tier: string;
  avatar: string | null;
  lat: number;
  lng: number;
  bio: string;
  skills: string;
  rating: number;
  reviewCount: number;
  color: string;
}

export interface CashDropPin {
  id: number;
  gpsLat: number;
  gpsLng: number;
  title: string;
  rewardPerWinner: number;
}

interface GoogleMapProps {
  pins: JobPin[];
  workerPins?: WorkerPin[];
  cashDrops?: CashDropPin[];
  onPinClick?: (pin: JobPin) => void;
  onWorkerPinClick?: (worker: WorkerPin) => void;
  onCashDropClick?: (drop: CashDropPin) => void;
  className?: string;
  center?: { lat: number; lng: number };
  cluster?: boolean;
  onUserPos?: (pos: { lat: number; lng: number }) => void;
}

const DAYLIGHT_STYLES: object[] = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f0" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f0" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#374151" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#1f2937" }] },
  { featureType: "administrative.neighborhood", elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#c8e6c9" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#4caf50" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e5e7eb" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#ffe082" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#f59e0b" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#374151" }] },
  { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#e5e7eb" }] },
  { featureType: "transit.station", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#b3d9f2" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#60a5fa" }] },
  { featureType: "landscape.natural", elementType: "geometry.fill", stylers: [{ color: "#eef2e6" }] },
  { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#f0ede8" }] },
];

const US_CENTER = { lat: 39.8283, lng: -98.5795 };
const US_DENIED_ZOOM = 4;

export function GoogleMap({ pins, workerPins, cashDrops, onPinClick, onWorkerPinClick, onCashDropClick, className, center, cluster, onUserPos }: GoogleMapProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const dropOverlaysRef = useRef<google.maps.OverlayView[]>([]);
  const initStartedRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const hasCenteredRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [locationDenied, setLocationDenied] = useState(false);
  const [zipInput, setZipInput] = useState("");
  const [showZipInput, setShowZipInput] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  const [, navigate] = useLocation();

  const { data: config } = useQuery<{ googleMapsApiKey: string }>({
    queryKey: ["/api/config"],
  });

  const apiKey = config?.googleMapsApiKey ?? "";

  const buildMap = async (mapCenter: { lat: number; lng: number }, denied?: boolean) => {
    if (!mapDivRef.current || initStartedRef.current) return;
    initStartedRef.current = true;
    try {
      setOptions({ key: apiKey, version: "weekly" } as Parameters<typeof setOptions>[0]);

      const mapsLib = await importLibrary("maps") as typeof google.maps;

      const map = new mapsLib.Map(mapDivRef.current, {
        center: mapCenter,
        zoom: denied ? US_DENIED_ZOOM : 11,
        maxZoom: 14,
        styles: DAYLIGHT_STYLES as google.maps.MapTypeStyle[],
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        backgroundColor: "#f5f5f0",
        clickableIcons: false,
      });

      map.addListener("click", () => {
        onPinClick?.(null as any);
      });

      mapRef.current = map;
      setMapReady(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Google Maps load error:", msg);
      setLoadErr(msg || "Failed to load map");
      initStartedRef.current = false;
    }
  };

  const reverseGeocodeZip = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`/api/places/reverse-geocode?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      if (data?.zip) setZipInput(data.zip);
    } catch {}
  };

  const startWatchPosition = () => {
    if (!navigator.geolocation) {
      setLocating(false);
      setLocationDenied(true);
      console.warn("[GUBER] Geolocation API not available in this browser/context");
      return;
    }
    setLocating(true);
    setLocationDenied(false);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(coords);
        setLocating(false);
        setLocationDenied(false);
        onUserPos?.(coords);
        if (mapRef.current && !center && !hasCenteredRef.current) {
          mapRef.current.panTo(coords);
          mapRef.current.setZoom(11);
          hasCenteredRef.current = true;
        }
        reverseGeocodeZip(coords.lat, coords.lng);
      },
      (err) => {
        const labels: Record<number, string> = {
          1: "PERMISSION_DENIED",
          2: "POSITION_UNAVAILABLE",
          3: "TIMEOUT",
        };
        console.warn(`[GUBER] Geolocation error: ${labels[err.code] ?? "UNKNOWN"} (code ${err.code}) — ${err.message}`);
        setLocating(false);
        setLocationDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
    );
    watchIdRef.current = id;
  };

  const handleRetryLocation = () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    hasCenteredRef.current = false;
    startWatchPosition();
  };

  const handleZipFallback = async () => {
    if (!zipInput.trim()) return;
    setZipLoading(true);
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(zipInput.trim())}`);
      const data = await res.json();
      if (typeof data?.lat === "number" && typeof data?.lng === "number" && mapRef.current) {
        const coords = { lat: data.lat, lng: data.lng };
        mapRef.current.panTo(coords);
        mapRef.current.setZoom(11);
        onUserPos?.(coords);
        setShowZipInput(false);
        setLocationDenied(false);
      }
    } catch (e) {
      console.warn("[GUBER] ZIP geocode failed:", e);
    } finally {
      setZipLoading(false);
    }
  };

  useEffect(() => {
    startWatchPosition();
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  useEffect(() => {
    if (!config || !apiKey) return;
    if (initStartedRef.current) return;
    if (locating) return;
    const denied = !userPos && locationDenied;
    const mapCenter = center || userPos || US_CENTER;
    buildMap(mapCenter, denied);
  }, [apiKey, config, locating]);

  useEffect(() => {
    if (!mapRef.current || !center) return;
    mapRef.current.panTo(center);
    mapRef.current.setZoom(11);
  }, [center]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !userPos) return;
    const g = window.google?.maps;
    if (!g) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setPosition(userPos);
    } else {
      userMarkerRef.current = new g.Marker({
        position: userPos,
        map,
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
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const g = window.google?.maps;
    if (!g) return;

    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
    }
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const newMarkers: google.maps.Marker[] = [];

    // Render Job Pins
    pins.forEach((pin) => {
      if (pin.lat == null || pin.lng == null) return;

      const marker = new g.Marker({
        position: { lat: pin.lat, lng: pin.lng },
        map: cluster ? null : map,
        title: pin.title,
        icon: {
          path: g.SymbolPath.CIRCLE,
          fillColor: pin.color,
          fillOpacity: 0.95,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          scale: pin.urgentSwitch ? 12 : 8,
        },
        zIndex: 100,
      });

      marker.addListener("click", () => {
        onPinClick?.(pin);
      });

      newMarkers.push(marker);
    });

    // Render Worker Pins
    workerPins?.forEach((worker) => {
      if (worker.lat == null || worker.lng == null) return;

      const marker = new g.Marker({
        position: { lat: worker.lat, lng: worker.lng },
        map: cluster ? null : map,
        title: worker.fullName,
        icon: {
          path: g.SymbolPath.CIRCLE,
          fillColor: worker.color || "#EC4899",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
          scale: 10,
        },
        zIndex: 150,
      });

      marker.addListener("click", () => {
        onWorkerPinClick?.(worker);
      });

      newMarkers.push(marker);
    });

    markersRef.current = newMarkers;

    if (cluster) {
      if (!clustererRef.current) {
        clustererRef.current = new MarkerClusterer({ map });
      }
      clustererRef.current.addMarkers(newMarkers);
    }
  }, [mapReady, pins, workerPins, onPinClick, onWorkerPinClick, navigate, cluster]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const g = window.google?.maps;
    if (!g) return;

    dropOverlaysRef.current.forEach((o) => { try { o.setMap(null); } catch {} });
    dropOverlaysRef.current = [];

    const GUBER_COLORS = ["#22C55E","#8B5CF6","#F59E0B","#F97316","#14B8A6","#EC4899","#EF4444"];

    (cashDrops || []).forEach((drop) => {
      const lat = parseFloat(String(drop.gpsLat));
      const lng = parseFloat(String(drop.gpsLng));
      if (isNaN(lat) || isNaN(lng)) return;

      class CashDropOverlay extends g.OverlayView {
        private div: HTMLDivElement | null = null;
        private pos: google.maps.LatLng;
        private _colorInterval: ReturnType<typeof setInterval> | null = null;
        private _ringIntervals: ReturnType<typeof setInterval>[] = [];

        constructor(position: google.maps.LatLng) {
          super();
          this.pos = position;
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

          this.div.addEventListener("click", () => {
            onCashDropClick?.(drop);
          });

          let ci = 0;
          this._colorInterval = setInterval(() => {
            const c = GUBER_COLORS[ci % GUBER_COLORS.length];
            circle.style.background = c;
            circle.style.boxShadow = `0 0 14px ${c},0 0 28px ${c}66,0 3px 10px rgba(0,0,0,0.55)`;
            pill.style.borderColor = c;
            pillText.style.color = c;
            rings.forEach(r => { r.style.borderColor = c; });
            ci++;
          }, 180);

          rings.forEach((r, i) => {
            const phase = i * 0.33;
            const id = setInterval(() => {
              const t = ((performance.now() / 1200 + phase) % 1);
              const scale = 1 + t * 1.2;
              const opacity = 1 - t;
              r.style.transform = `translateX(-50%) scale(${scale})`;
              r.style.opacity = String(Math.max(0, opacity * 0.6));
            }, 30);
            this._ringIntervals.push(id);
          });

          const panes = this.getPanes();
          panes?.overlayMouseTarget?.appendChild(this.div);
        }

        draw() {
          if (!this.div) return;
          const proj = this.getProjection();
          if (!proj) return;
          const px = proj.fromLatLngToDivPixel(this.pos);
          if (px) {
            this.div.style.left = px.x + "px";
            this.div.style.top = px.y + "px";
          }
        }

        onRemove() {
          if (this._colorInterval) clearInterval(this._colorInterval);
          this._ringIntervals.forEach(id => clearInterval(id));
          this.div?.remove();
          this.div = null;
        }
      }

      const overlay = new CashDropOverlay(new g.LatLng(lat, lng));
      overlay.setMap(mapRef.current);
      dropOverlaysRef.current.push(overlay);
    });

    return () => {
      dropOverlaysRef.current.forEach((o) => { try { o.setMap(null); } catch {} });
      dropOverlaysRef.current = [];
    };
  }, [mapReady, cashDrops, onCashDropClick]);

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

  if (config && !apiKey) {
    return (
      <div className={`glass-card rounded-2xl p-8 flex flex-col items-center justify-center gap-2 ${className ?? ""}`} data-testid="map-container">
        <MapPinIcon className="w-10 h-10 text-muted-foreground/20" />
        <p className="text-sm text-muted-foreground/50 font-display text-center" data-testid="text-no-api-key">Google Maps not configured</p>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className={`glass-card rounded-2xl p-8 flex flex-col items-center justify-center gap-2 ${className ?? ""}`} data-testid="map-container">
        <AlertTriangle className="w-8 h-8 text-destructive/40" />
        <p className="text-sm text-muted-foreground/50 font-display text-center" data-testid="text-map-error">Map could not load</p>
        <p className="text-[10px] text-muted-foreground/30 font-display text-center max-w-[200px]">{loadErr}</p>
        <button
          onClick={() => {
            setLoadErr(null);
            initStartedRef.current = false;
            setMapReady(false);
            mapRef.current = null;
          }}
          className="text-xs text-primary underline font-display mt-1"
          data-testid="button-retry-map"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-2xl overflow-hidden ${className ?? ""}`}
      style={{ border: "2px solid rgba(0,180,80,0.35)", boxShadow: "0 0 0 1px rgba(0,180,80,0.1), 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,180,80,0.08)" }}
      data-testid="map-container"
    >
      {!mapReady && (
        <div className="absolute inset-0 z-10 rounded-2xl overflow-hidden">
          <Skeleton className="w-full h-full" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Navigation className="w-6 h-6 text-primary animate-pulse" />
            <span className="text-xs text-muted-foreground/60 font-display tracking-wider">
              {locating ? "Detecting your location…" : "LOADING MAP..."}
            </span>
          </div>
        </div>
      )}

      {mapReady && locationDenied && !showZipInput && (
        <div
          className="absolute bottom-12 left-3 right-3 z-30 flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: "rgba(20,20,20,0.92)", border: "1px solid rgba(239,68,68,0.35)", backdropFilter: "blur(8px)" }}
          data-testid="banner-location-denied"
        >
          <LocateOff className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="text-[10px] text-white/70 font-display flex-1">Location unavailable</span>
          <button
            onClick={handleRetryLocation}
            className="text-[10px] font-display font-bold text-primary flex items-center gap-1"
            data-testid="button-retry-location"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
          <span className="text-white/20 text-[10px]">·</span>
          <button
            onClick={() => setShowZipInput(true)}
            className="text-[10px] font-display font-bold text-white/60"
            data-testid="button-enter-zip-map"
          >
            Enter ZIP
          </button>
        </div>
      )}

      {mapReady && locationDenied && showZipInput && (
        <div
          className="absolute bottom-12 left-3 right-3 z-30 flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: "rgba(20,20,20,0.95)", border: "1px solid rgba(100,180,100,0.35)", backdropFilter: "blur(8px)" }}
          data-testid="banner-zip-input"
        >
          <input
            type="text"
            placeholder="Enter ZIP code"
            value={zipInput}
            onChange={(e) => setZipInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleZipFallback(); }}
            className="flex-1 bg-transparent text-[11px] text-white font-display outline-none placeholder:text-white/30"
            data-testid="input-zip-map"
            autoFocus
          />
          <button
            onClick={handleZipFallback}
            disabled={zipLoading}
            className="text-[10px] font-display font-bold text-primary"
            data-testid="button-zip-go"
          >
            {zipLoading ? "..." : "GO"}
          </button>
          <button
            onClick={() => setShowZipInput(false)}
            className="text-[10px] text-white/30 font-display"
            data-testid="button-zip-cancel"
          >
            ✕
          </button>
        </div>
      )}

      <div ref={mapDivRef} className="w-full h-full" style={{ minHeight: 300 }} />

      {mapReady && (
        <button
          onClick={handleRecenter}
          className="absolute bottom-3 right-3 z-20 p-2.5 rounded-xl flex items-center gap-1.5 text-[11px] font-display font-bold tracking-wider transition-all active:scale-95"
          style={{
            background: "rgba(255,255,255,0.92)",
            border: "1.5px solid rgba(0,150,60,0.35)",
            color: "#16a34a",
            backdropFilter: "blur(8px)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}
          data-testid="button-recenter-map"
        >
          <Navigation className="w-3.5 h-3.5" />
          ME
        </button>
      )}

      {mapReady && pins.length > 0 && (
        <div
          className="absolute top-3 left-3 z-20 px-2.5 py-1 rounded-full text-[10px] font-display font-bold tracking-wider"
          style={{ background: "rgba(255,255,255,0.92)", border: "1.5px solid rgba(0,150,60,0.3)", color: "#15803d", backdropFilter: "blur(8px)", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}
          data-testid="text-pin-count"
        >
          {pins.length} NEAR YOU
        </div>
      )}

      {mapReady && pins.length === 0 && (
        <div
          className="absolute top-3 left-3 z-20 px-2.5 py-1 rounded-full text-[10px] font-display font-bold tracking-wider"
          style={{ background: "rgba(255,255,255,0.92)", border: "1px solid rgba(0,0,0,0.08)", color: "#9ca3af", backdropFilter: "blur(8px)", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
          data-testid="text-no-jobs"
        >
          NO JOBS NEARBY YET
        </div>
      )}
    </div>
  );
}
