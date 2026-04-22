const zipCache = new Map<string, { lat: number; lng: number }>();

export async function geocodeZip(zip: string): Promise<{ lat: number; lng: number } | null> {
  const z = (zip || "").trim();
  if (!z || !/^\d{5}$/.test(z)) return null;
  if (zipCache.has(z)) return zipCache.get(z)!;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?components=postal_code:${z}|country:US&key=${apiKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        const data = await resp.json() as any;
        if (data.status === "OK" && data.results?.[0]) {
          const loc = data.results[0].geometry.location;
          const coords = { lat: loc.lat, lng: loc.lng };
          zipCache.set(z, coords);
          return coords;
        }
      }
    } catch {}
  }

  try {
    const resp = await fetch(`https://api.zippopotam.us/us/${z}`, {
      headers: { "User-Agent": "GUBER-App/1.0 contact@guberapp.app" },
      signal: AbortSignal.timeout(3000),
    });
    if (resp.ok) {
      const data = await resp.json() as any;
      const place = data.places?.[0];
      if (place?.latitude && place?.longitude) {
        const coords = { lat: parseFloat(place.latitude), lng: parseFloat(place.longitude) };
        zipCache.set(z, coords);
        return coords;
      }
    }
  } catch {}

  return null;
}

export function clearZipCache(): void {
  zipCache.clear();
}
