import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { ArrowLeft, Navigation, MapPin, MapPinned, Loader2, Car, AlertTriangle, Map as MapIcon } from "lucide-react";
import { GuberLayout } from "@/components/guber-layout";
import { useNavigationCover } from "@/components/navigation-launch-cover";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { gpsGetCurrentPosition, gpsStartWatchPosition } from "@/lib/gps";
import { isJobAddressUnlocked } from "@/components/scheduling-panel";
import type { Job } from "@shared/schema";

const ASSUMED_DRIVE_MPH = 30;

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

function buildDestination(j: any): string | null {
  if (j.location?.trim()) return encodeURIComponent(j.location.trim());
  if (j.lat && j.lng) return `${j.lat},${j.lng}`;
  return null;
}

function googleMapsUrl(j: any, origin: { lat: number; lng: number } | null): string | null {
  const dest = buildDestination(j);
  if (!dest) return null;
  const o = origin ? `&origin=${origin.lat},${origin.lng}` : "";
  return `https://www.google.com/maps/dir/?api=1${o}&destination=${dest}`;
}

function wazeUrl(j: any): string | null {
  if (j.location?.trim()) return `waze://?q=${encodeURIComponent(j.location.trim())}&navigate=yes`;
  if (j.lat && j.lng) return `waze://?ll=${j.lat},${j.lng}&navigate=yes`;
  return null;
}

function appleMapsUrl(j: any): string | null {
  const dest = buildDestination(j);
  if (!dest) return null;
  return `https://maps.apple.com/?daddr=${dest}`;
}

export default function JobNavigate() {
  const params = useParams<{ id: string }>();
  const jobId = params.id ? parseInt(params.id) : NaN;
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const destMarkerRef = useRef<google.maps.Marker | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const initStartedRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const watchCancelledRef = useRef(false);
  const hasFitRef = useRef(false);

  const [mapReady, setMapReady] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  const { data: config } = useQuery<{ googleMapsApiKey: string }>({ queryKey: ["/api/config"] });
  const { data: job, isLoading } = useQuery<Job>({
    queryKey: ["/api/jobs", jobId],
    enabled: !isNaN(jobId),
  });

  const { cover: navCover, launch: launchNav } = useNavigationCover();

  const isHelper = !!(user && job && (job as any).assignedHelperId === user.id);
  const helperStage = (job as any)?.helperStage as string | null;
  const unlocked = job ? isJobAddressUnlocked(job as any) : false;
  const canRender = !!user && !!job && isHelper && unlocked;
  const destLat = canRender ? ((job as any)?.lat as number | null | undefined) : null;
  const destLng = canRender ? ((job as any)?.lng as number | null | undefined) : null;
  const apiKey = config?.googleMapsApiKey ?? "";

  // Bounce out if the page isn't valid for this viewer. The render path also
  // refuses to draw any address/map UI in that state — this effect just kicks
  // them off the screen so they don't sit on a loading spinner forever.
  useEffect(() => {
    if (isLoading || !job || !user) return;
    if (!isHelper) {
      navigate(`/jobs/${jobId}`, { replace: true });
      return;
    }
    if (!unlocked) {
      toast({
        title: "Address locked",
        description: "Address unlocks once the time is confirmed and payment is held.",
        variant: "destructive",
      });
      navigate(`/jobs/${jobId}`, { replace: true });
    }
  }, [isLoading, job, user, isHelper, unlocked, jobId, navigate, toast]);

  const milestoneMutation = useMutation({
    mutationFn: async (data: { statusType: "on_the_way" | "arrived"; gpsLat?: number; gpsLng?: number }) => {
      const resp = await apiRequest("POST", `/api/jobs/${jobId}/milestone`, data);
      return resp.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      if (vars.statusType === "on_the_way") {
        toast({ title: "On the way", description: "GPS logged. The poster has been notified." });
      } else {
        toast({ title: "Arrival logged", description: "Open the job to submit proof." });
      }
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message || "Could not update status.", variant: "destructive" }),
  });

  const handleOnMyWay = () => {
    gpsGetCurrentPosition({ enableHighAccuracy: true, timeout: 8000 })
      .then((pos) =>
        milestoneMutation.mutate({
          statusType: "on_the_way",
          gpsLat: pos.coords.latitude,
          gpsLng: pos.coords.longitude,
        }),
      )
      .catch(() => milestoneMutation.mutate({ statusType: "on_the_way" }));
  };

  const handleArrived = () => {
    gpsGetCurrentPosition({ enableHighAccuracy: true, timeout: 8000 })
      .then((pos) =>
        milestoneMutation.mutate({
          statusType: "arrived",
          gpsLat: pos.coords.latitude,
          gpsLng: pos.coords.longitude,
        }),
      )
      .catch(() => milestoneMutation.mutate({ statusType: "arrived" }));
  };

  // Live GPS watcher.
  useEffect(() => {
    watchCancelledRef.current = false;
    gpsStartWatchPosition(
      (pos) => {
        if (pos.coords.accuracy > 300) return;
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationDenied(false);
      },
      (err) => {
        console.warn("[GUBER] job-navigate geolocation error:", err.code, err.message);
        setLocationDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 },
    )
      .then((id) => {
        if (watchCancelledRef.current && navigator.geolocation) {
          navigator.geolocation.clearWatch(id);
          return;
        }
        watchIdRef.current = id;
      })
      .catch(() => setLocationDenied(true));
    return () => {
      watchCancelledRef.current = true;
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Init map once we know destination + have the API key.
  // `canRender` keeps the map from booting before the address-lock guard clears.
  useEffect(() => {
    if (!canRender) return;
    if (!apiKey || destLat == null || destLng == null) return;
    if (!mapDivRef.current || initStartedRef.current) return;
    initStartedRef.current = true;

    (async () => {
      try {
        setOptions({ key: apiKey, version: "weekly" } as Parameters<typeof setOptions>[0]);
        const mapsLib = (await importLibrary("maps")) as typeof google.maps;
        const map = new mapsLib.Map(mapDivRef.current!, {
          center: { lat: destLat, lng: destLng },
          zoom: 14,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy",
          disableDefaultUI: false,
        });
        mapRef.current = map;

        destMarkerRef.current = new mapsLib.Marker({
          position: { lat: destLat, lng: destLng },
          map,
          title: "Destination",
          icon: {
            path: mapsLib.SymbolPath.CIRCLE,
            fillColor: "#16A34A",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3,
            scale: 11,
          },
          zIndex: 800,
        });

        setMapReady(true);
      } catch (e) {
        console.error("[GUBER] job-navigate map load:", e);
        initStartedRef.current = false;
      }
    })();
  }, [apiKey, destLat, destLng]);

  // Render / refresh the user marker and the route polyline.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !userPos || destLat == null || destLng == null) return;
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
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
          scale: 9,
        },
        zIndex: 900,
      });
    }

    const path = [
      { lat: userPos.lat, lng: userPos.lng },
      { lat: destLat, lng: destLng },
    ];
    if (polylineRef.current) {
      polylineRef.current.setPath(path);
    } else {
      polylineRef.current = new g.Polyline({
        path,
        geodesic: true,
        strokeColor: "#2563eb",
        strokeOpacity: 0.85,
        strokeWeight: 4,
        map: mapRef.current,
      });
    }

    if (!hasFitRef.current) {
      const bounds = new g.LatLngBounds();
      bounds.extend(userPos);
      bounds.extend({ lat: destLat, lng: destLng });
      mapRef.current.fitBounds(bounds, 80);
      hasFitRef.current = true;
    }
  }, [mapReady, userPos, destLat, destLng]);

  const distanceMiles = useMemo(() => {
    if (!userPos || destLat == null || destLng == null) return null;
    return haversineMiles(userPos.lat, userPos.lng, destLat, destLng);
  }, [userPos, destLat, destLng]);

  const etaMins = distanceMiles == null ? null : Math.max(1, Math.round((distanceMiles / ASSUMED_DRIVE_MPH) * 60));

  const scheduledAt = (job as any)?.posterConfirmedTime || (job as any)?.selectedWorkerTime;
  const scheduledLabel = scheduledAt
    ? new Date(scheduledAt).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  // Hard render gate. Until the job has loaded AND the viewer is the assigned
  // helper AND the address is unlocked, we render only a loading shell. This
  // prevents any pre-confirm flash of the destination address or external
  // map links while the redirect effect runs.
  if (!canRender) {
    return (
      <GuberLayout>
        <div className="max-w-lg mx-auto px-4 py-8 text-center text-muted-foreground" data-testid="page-job-navigate-loading">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </div>
      </GuberLayout>
    );
  }

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 pt-4 pb-6 space-y-3" data-testid="page-job-navigate">
        <div className="flex items-center justify-between">
          <Link href={`/jobs/${jobId}`}>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground px-0" data-testid="link-back-to-job">
              <ArrowLeft className="w-4 h-4" /> Back to job
            </Button>
          </Link>
          {(job as any).jobAtRisk && (
            <span className="text-[10px] font-display font-bold tracking-widest text-red-300 flex items-center gap-1" data-testid="badge-at-risk">
              <AlertTriangle className="w-3 h-3" /> AT RISK
            </span>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-border/20 p-4">
          <p className="text-[10px] font-display font-bold tracking-widest text-muted-foreground uppercase">
            Navigate to
          </p>
          <p className="text-base font-display font-semibold mt-0.5 truncate" data-testid="text-job-title">{job.title}</p>
          <p className="text-xs text-foreground mt-1 flex items-start gap-1" data-testid="text-destination-address">
            <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span className="leading-snug">{job.location || `${(job as any).zip || ""}`}</span>
          </p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="text-center">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Scheduled</p>
              <p className="text-[11px] font-display font-bold mt-0.5" data-testid="text-scheduled-time">
                {scheduledLabel || "—"}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Distance</p>
              <p className="text-[11px] font-display font-bold mt-0.5" data-testid="text-distance">
                {distanceMiles == null ? "—" : `${distanceMiles.toFixed(1)} mi`}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">ETA</p>
              <p className="text-[11px] font-display font-bold mt-0.5" data-testid="text-eta">
                {etaMins == null ? "—" : `${etaMins} min`}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden border border-border/20 bg-muted" style={{ height: 360 }}>
          {!apiKey || !destLat || !destLng ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2 px-4 text-center">
              <MapIcon className="w-8 h-8 opacity-60" />
              <p className="text-xs">Map unavailable for this destination.</p>
            </div>
          ) : (
            <div ref={mapDivRef} className="w-full h-full" data-testid="map-job-navigate" />
          )}
        </div>

        {locationDenied && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-[11px] text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>Location is off — ETA and your live position won't show. Enable location for the best experience.</span>
          </div>
        )}

        <div className="space-y-2 pt-1">
          {helperStage !== "on_the_way" && helperStage !== "arrived" && (
            <Button
              onClick={handleOnMyWay}
              disabled={milestoneMutation.isPending}
              className="w-full h-14 font-display tracking-wider rounded-2xl text-white font-bold text-base"
              style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)" }}
              data-testid="button-on-my-way"
            >
              {milestoneMutation.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Navigation className="w-5 h-5 mr-2" />}
              I'M ON MY WAY
            </Button>
          )}

          {helperStage === "on_the_way" && (
            <Button
              onClick={handleArrived}
              disabled={milestoneMutation.isPending}
              className="w-full h-14 font-display tracking-wider rounded-2xl text-white font-bold text-base"
              style={{ background: "linear-gradient(135deg, #059669, #047857)" }}
              data-testid="button-arrived"
            >
              {milestoneMutation.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <MapPinned className="w-5 h-5 mr-2" />}
              I'VE ARRIVED
            </Button>
          )}

          {helperStage === "arrived" && (
            <Link href={`/jobs/${jobId}`}>
              <Button
                className="w-full h-14 font-display tracking-wider rounded-2xl text-white font-bold text-base"
                style={{ background: "linear-gradient(135deg, #6366f1, #4338ca)" }}
                data-testid="button-back-after-arrived"
              >
                CONTINUE TO JOB
              </Button>
            </Link>
          )}
        </div>

        <div className="pt-2">
          <p className="text-[10px] font-display font-bold tracking-widest text-muted-foreground uppercase px-1 mb-2">
            Or use an external app
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                const url = googleMapsUrl(job, userPos);
                if (url) launchNav({ provider: "google", url, destLabel: job.title });
              }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all active:scale-[0.97]"
              style={{ background: "rgba(66,133,244,0.10)", border: "1px solid rgba(66,133,244,0.22)" }}
              data-testid="link-google-maps"
            >
              <Navigation className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] font-display font-bold text-blue-400">Google Maps</span>
            </button>
            <button
              onClick={() => {
                const url = wazeUrl(job);
                if (url) launchNav({ provider: "waze", url, destLabel: job.title });
              }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all active:scale-[0.97]"
              style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)" }}
              data-testid="link-waze"
            >
              <Car className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-display font-bold text-emerald-400">Waze</span>
            </button>
            <button
              onClick={() => {
                const url = appleMapsUrl(job);
                if (url) launchNav({ provider: "apple", url, destLabel: job.title });
              }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all active:scale-[0.97]"
              style={{ background: "rgba(148,163,184,0.10)", border: "1px solid rgba(148,163,184,0.22)" }}
              data-testid="link-apple-maps"
            >
              <MapIcon className="w-4 h-4 text-slate-300" />
              <span className="text-[10px] font-display font-bold text-slate-300">Apple Maps</span>
            </button>
          </div>
        </div>
      </div>
      {navCover}
    </GuberLayout>
  );
}
