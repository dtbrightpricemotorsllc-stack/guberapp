import { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { MapPin, Loader2, Building2 } from "lucide-react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { useQuery } from "@tanstack/react-query";

export interface PlaceResult {
  address: string;
  lat: number;
  lng: number;
  zip?: string;
  name?: string;
}

interface Prediction {
  placeId: string;
  main: string;
  secondary: string;
  isEstablishment: boolean;
  lat?: number;
  lng?: number;
  zip?: string;
  source: "google" | "nominatim";
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (place: PlaceResult) => void;
  placeholder?: string;
  className?: string;
  userLat?: number | null;
  userLng?: number | null;
  "data-testid"?: string;
}

let autocompleteService: google.maps.places.AutocompleteService | null = null;
let geocoder: google.maps.Geocoder | null = null;
let googleInitialized = false;
let googleFailed = false;

async function tryInitGoogle(apiKey: string): Promise<boolean> {
  if (googleFailed) return false;
  if (googleInitialized) return true;
  try {
    setOptions({ key: apiKey, version: "weekly" } as Parameters<typeof setOptions>[0]);
    const placesLib = await importLibrary("places") as typeof google.maps.places;
    autocompleteService = new placesLib.AutocompleteService();
    googleInitialized = true;
    return true;
  } catch {
    googleFailed = true;
    return false;
  }
}

async function googlePredict(input: string, lat: number | null, lng: number | null): Promise<Prediction[] | null> {
  if (!autocompleteService) return null;
  return new Promise((resolve) => {
    const request: google.maps.places.AutocompletionRequest = {
      input,
      componentRestrictions: { country: "us" },
      types: ["geocode", "establishment"],
    };
    if (lat != null && lng != null && window.google?.maps?.LatLng) {
      request.location = new window.google.maps.LatLng(lat, lng);
      request.radius = 50000;
    }
    autocompleteService!.getPlacePredictions(request, (preds, status) => {
      const OK = (window as any).google?.maps?.places?.PlacesServiceStatus?.OK;
      if (status !== OK || !preds || preds.length === 0) {
        googleFailed = true;
        resolve(null);
        return;
      }
      resolve(preds.map((p) => ({
        placeId: p.place_id,
        main: p.structured_formatting.main_text,
        secondary: p.structured_formatting.secondary_text || "",
        isEstablishment: p.types?.includes("establishment") ?? false,
        source: "google",
      })));
    });
  });
}

async function nominatimPredict(input: string, lat: number | null, lng: number | null): Promise<Prediction[]> {
  let url = `/api/places/autocomplete?input=${encodeURIComponent(input)}`;
  if (lat != null && lng != null) url += `&lat=${lat}&lng=${lng}`;
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    return (data.results || []).map((r: any) => ({
      placeId: String(r.place_id),
      main: r.name || r.display_name.split(",")[0],
      secondary: r.display_name.split(",").slice(1, 4).join(",").trim(),
      isEstablishment: ["amenity", "shop", "tourism", "leisure", "office"].includes(r.category),
      lat: r.lat,
      lng: r.lng,
      zip: r.zip || undefined,
      source: "nominatim",
    }));
  } catch {
    return [];
  }
}

async function resolveGoogleCoords(apiKey: string, placeId: string): Promise<{ lat: number; lng: number; zip?: string; address: string } | null> {
  try {
    if (!geocoder) {
      const geocodingLib = await importLibrary("geocoding") as typeof google.maps;
      geocoder = new geocodingLib.Geocoder();
    }
    return new Promise((resolve) => {
      geocoder!.geocode({ placeId }, (results, status) => {
        const OK = (window as any).google?.maps?.GeocoderStatus?.OK;
        if (status !== OK || !results || !results[0]) { resolve(null); return; }
        const r = results[0];
        const zip = r.address_components?.find((c) => c.types.includes("postal_code"))?.short_name;
        resolve({ lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), zip, address: r.formatted_address });
      });
    });
  } catch {
    return null;
  }
}

export function PlacesAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Address or business name + city",
  className = "",
  userLat,
  userLng,
  "data-testid": testId,
}: Props) {
  const [suggestions, setSuggestions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [geoLat, setGeoLat] = useState<number | null>(null);
  const [geoLng, setGeoLng] = useState<number | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const latestInputRef = useRef("");

  const { data: config } = useQuery<{ googleMapsApiKey: string }>({
    queryKey: ["/api/config"],
    staleTime: Infinity,
  });
  const apiKey = config?.googleMapsApiKey ?? "";

  useEffect(() => {
    if (userLat != null && userLng != null) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGeoLat(pos.coords.latitude); setGeoLng(pos.coords.longitude); },
      () => {},
      { timeout: 5000, maximumAge: 60000 }
    );
  }, [userLat, userLng]);

  const activeLat = userLat ?? geoLat;
  const activeLng = userLng ?? geoLng;

  const updateDropdownPos = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 99999,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateDropdownPos();
    const onScroll = () => updateDropdownPos();
    const onResize = () => updateDropdownPos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, updateDropdownPos]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!inputRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchSuggestions = useCallback(async (input: string) => {
    if (input.length < 2) { setSuggestions([]); setOpen(false); return; }
    latestInputRef.current = input;
    setLoading(true);
    let results: Prediction[] = [];
    try {
      if (apiKey && !googleFailed) {
        const ok = await tryInitGoogle(apiKey);
        if (ok) results = (await googlePredict(input, activeLat, activeLng)) || [];
      }
      if (results.length === 0) {
        results = await nominatimPredict(input, activeLat, activeLng);
      }
    } catch {
      results = await nominatimPredict(input, activeLat, activeLng).catch(() => []);
    }
    if (latestInputRef.current !== input) return;
    setSuggestions(results);
    if (results.length > 0) { updateDropdownPos(); setOpen(true); } else setOpen(false);
    setLoading(false);
  }, [apiKey, activeLat, activeLng, updateDropdownPos]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 350);
  };

  const handleSelect = async (pred: Prediction) => {
    setOpen(false);
    setSuggestions([]);
    const label = `${pred.main}${pred.secondary ? `, ${pred.secondary}` : ""}`;
    onChange(label);

    if (pred.source === "nominatim" && pred.lat != null && pred.lng != null) {
      onPlaceSelect({ address: label, lat: pred.lat, lng: pred.lng, zip: pred.zip, name: pred.isEstablishment ? pred.main : undefined });
      return;
    }

    if (!apiKey) return;
    setSelecting(true);
    try {
      const detail = await resolveGoogleCoords(apiKey, pred.placeId);
      if (detail) {
        onChange(detail.address);
        onPlaceSelect({ address: detail.address, lat: detail.lat, lng: detail.lng, zip: detail.zip, name: pred.isEstablishment ? pred.main : undefined });
      }
    } catch {
      // Silently ignore
    } finally {
      setSelecting(false);
    }
  };

  const dropdown = open && suggestions.length > 0
    ? createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-card border border-border/40 rounded-xl shadow-2xl overflow-hidden"
        >
          {suggestions.map((r, i) => (
            <button
              key={`${r.placeId}-${i}`}
              type="button"
              className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 active:bg-muted/60 transition-colors border-b border-border/10 last:border-0"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(r); }}
            >
              <div className="shrink-0 mt-0.5">
                {r.isEstablishment
                  ? <Building2 className="w-3.5 h-3.5 text-primary/60" />
                  : <MapPin className="w-3.5 h-3.5 text-muted-foreground/50" />
                }
              </div>
              <div className="min-w-0">
                <p className="text-sm font-display font-semibold truncate">{r.main}</p>
                {r.secondary && (
                  <p className="text-[11px] text-muted-foreground/60 truncate">{r.secondary}</p>
                )}
              </div>
            </button>
          ))}
        </div>,
        document.body
      )
    : null;

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInput}
          onFocus={() => suggestions.length > 0 && (updateDropdownPos(), setOpen(true))}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full pl-9 pr-3 py-2.5 bg-background border border-border/30 rounded-xl text-sm font-display focus:outline-none focus:border-primary/50 ${className}`}
          data-testid={testId}
        />
        {(loading || selecting) && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 animate-spin" />
        )}
      </div>
      {dropdown}
    </div>
  );
}
