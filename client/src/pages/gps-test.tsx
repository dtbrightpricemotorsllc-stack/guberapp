import { useState, useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { useQuery } from "@tanstack/react-query";

type Status = "idle" | "requesting" | "tracking" | "denied" | "error";

interface Coords {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

declare global {
  interface Window {
    google: any;
    __guberGpsMapReady?: () => void;
  }
}

const isNative = Capacitor.isNativePlatform();

export default function GpsTest() {
  const [status, setStatus] = useState<Status>("idle");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const watchIdRef = useRef<any>(null);
  const mapReadyRef = useRef(false);

  const { data: config } = useQuery<{ googleMapsApiKey: string }>({
    queryKey: ["/api/config"],
  });
  const apiKey = config?.googleMapsApiKey ?? "";

  // Load Google Maps script once we have the key
  useEffect(() => {
    if (!apiKey || window.google?.maps) return;
    const script = document.createElement("script");
    script.id = "guber-gps-maps";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=__guberGpsMapReady`;
    script.async = true;
    script.defer = true;
    window.__guberGpsMapReady = () => { mapReadyRef.current = true; };
    document.head.appendChild(script);
    return () => {
      delete window.__guberGpsMapReady;
    };
  }, [apiKey]);

  const initMap = useCallback((lat: number, lng: number) => {
    if (!mapRef.current || !window.google?.maps) return;
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat, lng },
        zoom: 17,
        disableDefaultUI: true,
        zoomControl: true,
      });
      markerRef.current = new window.google.maps.Marker({
        position: { lat, lng },
        map: mapInstanceRef.current,
        title: "You are here",
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#4285F4",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
    } else {
      const pos = { lat, lng };
      markerRef.current?.setPosition(pos);
      mapInstanceRef.current?.panTo(pos);
    }
  }, []);

  const onPosition = useCallback((lat: number, lng: number, accuracy: number, ts: number) => {
    setCoords({ lat, lng, accuracy, timestamp: ts });
    setUpdateCount(n => n + 1);
    setStatus("tracking");
    // Map may not be ready yet — poll briefly
    const tryMap = (attempts = 0) => {
      if (window.google?.maps) {
        initMap(lat, lng);
      } else if (attempts < 20) {
        setTimeout(() => tryMap(attempts + 1), 300);
      }
    };
    tryMap();
  }, [initMap]);

  const startTracking = useCallback(async () => {
    setStatus("requesting");
    setErrorMsg(null);

    if (isNative) {
      try {
        const { Geolocation } = await import("@capacitor/geolocation");

        // Request permission explicitly — this shows the OS dialog
        const perm = await Geolocation.requestPermissions();
        if (perm.location !== "granted") {
          setStatus("denied");
          setErrorMsg("Location permission denied. Please enable it in your device Settings.");
          return;
        }

        // Get an immediate fix first
        const first = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
        });
        onPosition(first.coords.latitude, first.coords.longitude, first.coords.accuracy ?? 0, first.timestamp);

        // Then start continuous watch
        const handle = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000 },
          (pos, err) => {
            if (err || !pos) {
              setErrorMsg(`GPS error: ${err?.message ?? "no position"}`);
              return;
            }
            onPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? 0, pos.timestamp);
          },
        );
        watchIdRef.current = { native: handle };
      } catch (e: any) {
        setStatus("error");
        setErrorMsg(e?.message ?? "GPS failed");
      }
    } else {
      if (!navigator.geolocation) {
        setStatus("error");
        setErrorMsg("Geolocation not available in this browser.");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => onPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp),
        (err) => { setStatus("error"); setErrorMsg(err.message); },
        { enableHighAccuracy: true, timeout: 15000 },
      );
      const id = navigator.geolocation.watchPosition(
        (pos) => onPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp),
        (err) => setErrorMsg(err.message),
        { enableHighAccuracy: true, timeout: 10000 },
      );
      watchIdRef.current = { web: id };
    }
  }, [onPosition]);

  const stopTracking = useCallback(async () => {
    const w = watchIdRef.current;
    if (!w) return;
    if (w.native !== undefined) {
      try {
        const { Geolocation } = await import("@capacitor/geolocation");
        await Geolocation.clearWatch({ id: w.native });
      } catch {}
    }
    if (w.web !== undefined) {
      navigator.geolocation?.clearWatch(w.web);
    }
    watchIdRef.current = null;
    setStatus("idle");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopTracking(); };
  }, [stopTracking]);

  const statusColor: Record<Status, string> = {
    idle: "text-gray-400",
    requesting: "text-yellow-400",
    tracking: "text-green-400",
    denied: "text-red-400",
    error: "text-red-400",
  };

  const statusLabel: Record<Status, string> = {
    idle: "Idle — tap Start to begin",
    requesting: "Requesting permission…",
    tracking: "Tracking ✓",
    denied: "Permission denied",
    error: "Error",
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="px-5 pt-10 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">GPS Location Test</h1>
        <p className="text-sm text-gray-400 mt-1">GUBER · Android Production Verification</p>
      </div>

      {/* Status badge */}
      <div className="px-5 mb-4">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold uppercase tracking-widest ${statusColor[status]}`}>
            {statusLabel[status]}
          </span>
          {status === "tracking" && (
            <span className="text-xs text-gray-500">({updateCount} fix{updateCount !== 1 ? "es" : ""})</span>
          )}
        </div>
        {errorMsg && (
          <p className="text-red-400 text-sm mt-1">{errorMsg}</p>
        )}
      </div>

      {/* Coordinates */}
      <div className="px-5 mb-4">
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
          {coords ? (
            <div className="space-y-2">
              <CoordRow label="Latitude"  value={coords.lat.toFixed(7)} />
              <CoordRow label="Longitude" value={coords.lng.toFixed(7)} />
              <CoordRow label="Accuracy"  value={`±${coords.accuracy.toFixed(0)} m`} />
              <CoordRow label="Updated"   value={new Date(coords.timestamp).toLocaleTimeString()} />
            </div>
          ) : (
            <p className="text-gray-600 text-sm text-center py-2">No location yet</p>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="px-5 mb-5 flex-1">
        <div
          ref={mapRef}
          className="w-full rounded-2xl overflow-hidden border border-gray-800"
          style={{ height: 280, background: "#111" }}
        >
          {!coords && (
            <div className="h-full flex items-center justify-center text-gray-600 text-sm">
              Map loads once location is found
            </div>
          )}
        </div>
      </div>

      {/* Button */}
      <div className="px-5 pb-12">
        {status !== "tracking" ? (
          <button
            data-testid="button-start-gps"
            onClick={startTracking}
            disabled={status === "requesting"}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-lg transition-colors"
          >
            {status === "requesting" ? "Requesting…" : "Start Location Tracking"}
          </button>
        ) : (
          <button
            data-testid="button-stop-gps"
            onClick={stopTracking}
            className="w-full bg-gray-800 hover:bg-gray-700 text-white font-semibold py-4 rounded-2xl text-lg transition-colors"
          >
            Stop Tracking
          </button>
        )}
      </div>
    </div>
  );
}

function CoordRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="font-mono text-white text-sm font-medium" data-testid={`text-gps-${label.toLowerCase()}`}>
        {value}
      </span>
    </div>
  );
}
