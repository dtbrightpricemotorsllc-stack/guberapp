import * as zipcodesLib from "zipcodes";
import { db } from "./db";
import { zipGeocodeCache } from "@shared/schema";
import { eq } from "drizzle-orm";

const TTL_DAYS = 90;

// ── Module-level cache for full geocode results (city/state/county) ──────────
export interface ZipFullInfo {
  lat: number;
  lng: number;
  city: string;
  state: string;
  county: string;
}

const fullInfoCache = new Map<string, ZipFullInfo>();

interface GoogleGeocodeResult {
  results?: Array<{
    address_components: Array<{ types: string[]; long_name: string; short_name: string }>;
  }>;
  status: string;
}

async function fetchLocationFromGoogle(lat: number, lng: number): Promise<{ city: string; state: string; county: string }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { city: "", state: "", county: "" };
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return { city: "", state: "", county: "" };
    const data = await res.json() as GoogleGeocodeResult;
    const result = data.results?.[0];
    if (!result) return { city: "", state: "", county: "" };

    const comps = result.address_components;
    const find = (type: string) => comps.find(c => c.types.includes(type));

    const cityComp = find("locality") ?? find("sublocality_level_1") ?? find("postal_town");
    const stateComp = find("administrative_area_level_1");
    const countyComp = find("administrative_area_level_2");

    return {
      city: cityComp?.long_name ?? "",
      state: stateComp?.short_name ?? "",
      county: countyComp?.long_name?.replace(/ County$/i, "") ?? "",
    };
  } catch {
    return { city: "", state: "", county: "" };
  }
}

export function lookupZipsByCity(city: string, state: string): string[] {
  const results = zipcodesLib.lookupByName(city, state);
  if (!Array.isArray(results)) return [];
  return (results as Array<{ zip: string }>)
    .filter(r => r?.zip)
    .map(r => r.zip);
}

export async function geocodeZipFull(zip: string): Promise<ZipFullInfo | null> {
  const z = (zip || "").trim().replace(/-\d{4}$/, "").padStart(5, "0");
  if (!/^\d{5}$/.test(z)) return null;

  if (fullInfoCache.has(z)) return fullInfoCache.get(z)!;

  // Use zipcodes lib for lat/lng and as static fallback for city/state
  const staticResult = zipcodesLib.lookup(z);
  if (!staticResult) return null;

  const { latitude: lat, longitude: lng } = staticResult;

  // Authoritative city/state/county from Google Geocoding address_components
  const google = await fetchLocationFromGoogle(lat, lng);

  const info: ZipFullInfo = {
    lat,
    lng,
    city: google.city || staticResult.city || "",
    state: google.state || staticResult.state || "",
    county: google.county,
  };
  fullInfoCache.set(z, info);
  return info;
}

export interface ZipCoords {
  latitude: number;
  longitude: number;
}

export function lookupZip(zip: string): ZipCoords | null {
  const result = zipcodesLib.lookup(zip);
  if (!result) return null;
  return { latitude: result.latitude, longitude: result.longitude };
}

export function lookupZipCity(zip: string): { zip: string; city: string; state: string } | null {
  const result = zipcodesLib.lookup(zip);
  if (!result || !result.city || !result.state) return null;
  return { zip, city: result.city, state: result.state };
}

/**
 * Map a US two-letter state abbreviation to its primary IANA timezone.
 * Border counties that straddle two zones are assigned the majority zone.
 * Returns "America/New_York" for unknown/missing states (safe Eastern default).
 */
const STATE_TIMEZONE: Record<string, string> = {
  // Eastern
  CT: "America/New_York", DC: "America/New_York", DE: "America/New_York",
  FL: "America/New_York", GA: "America/New_York", IN: "America/Indiana/Indianapolis",
  KY: "America/New_York", MA: "America/New_York", MD: "America/New_York",
  ME: "America/New_York", MI: "America/Detroit",  NC: "America/New_York",
  NH: "America/New_York", NJ: "America/New_York", NY: "America/New_York",
  OH: "America/New_York", PA: "America/New_York", RI: "America/New_York",
  SC: "America/New_York", VA: "America/New_York", VT: "America/New_York",
  WV: "America/New_York",
  // Central
  AL: "America/Chicago",  AR: "America/Chicago",  IA: "America/Chicago",
  IL: "America/Chicago",  KS: "America/Chicago",  LA: "America/Chicago",
  MN: "America/Chicago",  MO: "America/Chicago",  MS: "America/Chicago",
  ND: "America/Chicago",  NE: "America/Chicago",  OK: "America/Chicago",
  SD: "America/Chicago",  TN: "America/Chicago",  TX: "America/Chicago",
  WI: "America/Chicago",
  // Mountain
  AZ: "America/Phoenix",  CO: "America/Denver",   ID: "America/Denver",
  MT: "America/Denver",   NM: "America/Denver",   UT: "America/Denver",
  WY: "America/Denver",
  // Pacific
  CA: "America/Los_Angeles", NV: "America/Los_Angeles",
  OR: "America/Los_Angeles", WA: "America/Los_Angeles",
  // Alaska / Hawaii / Territories
  AK: "America/Anchorage", HI: "Pacific/Honolulu",
  PR: "America/Puerto_Rico", VI: "America/St_Thomas",
};

/**
 * Return the IANA timezone for a US ZIP code, falling back to Eastern time.
 * Lookup is synchronous (no network/DB needed).
 */
export function getZipTimezone(zip: string | null | undefined): string {
  if (!zip) return "America/New_York";
  const result = zipcodesLib.lookup(zip.trim());
  if (!result?.state) return "America/New_York";
  return STATE_TIMEZONE[result.state] ?? "America/New_York";
}

function normalizeZip(zip: string): string | null {
  const raw = (zip || "").trim();
  const z = raw.replace(/-\d{4}$/, "").padStart(5, "0");
  if (!/^\d{5}$/.test(z)) return null;
  return z;
}

async function fetchFromZippopotam(zip: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!res.ok) return null;
    const data = await res.json() as { places?: Array<{ latitude: string; longitude: string }> };
    const place = data.places?.[0];
    if (!place) return null;
    return { lat: parseFloat(place.latitude), lng: parseFloat(place.longitude) };
  } catch (err) {
    console.warn("[zip-geocode] zippopotam.us fetch failed for", zip, err);
    return null;
  }
}

async function readDbCache(zip: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const [row] = await db.select().from(zipGeocodeCache).where(eq(zipGeocodeCache.zip, zip)).limit(1);
    if (!row) return null;
    if (new Date() > row.expiresAt) {
      await db.delete(zipGeocodeCache).where(eq(zipGeocodeCache.zip, zip));
      return null;
    }
    return { lat: row.lat, lng: row.lng };
  } catch (err) {
    console.warn("[zip-geocode] DB cache read failed for", zip, err);
    return null;
  }
}

async function writeDbCache(zip: string, lat: number, lng: number): Promise<void> {
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
  try {
    await db
      .insert(zipGeocodeCache)
      .values({ zip, lat, lng, expiresAt })
      .onConflictDoUpdate({
        target: zipGeocodeCache.zip,
        set: { lat, lng, cachedAt: new Date(), expiresAt },
      });
  } catch (err) {
    console.warn("[zip-geocode] DB cache write failed for", zip, err);
  }
}

export async function geocodeZip(zip: string): Promise<{ lat: number; lng: number } | null> {
  const z = normalizeZip(zip);
  if (!z) return null;

  const staticResult = zipcodesLib.lookup(z);
  if (staticResult) return { lat: staticResult.latitude, lng: staticResult.longitude };

  const cached = await readDbCache(z);
  if (cached) {
    console.debug("[zip-geocode] DB cache hit:", z);
    return cached;
  }

  const live = await fetchFromZippopotam(z);
  if (live) {
    console.info("[zip-geocode] live fetch (cache miss):", z);
    await writeDbCache(z, live.lat, live.lng);
    return live;
  }

  console.warn("[zip-geocode] geocode failed for zip:", z);
  return null;
}

export async function flushZipGeocodeCache(): Promise<number> {
  try {
    const deleted = await db.delete(zipGeocodeCache).returning({ zip: zipGeocodeCache.zip });
    return deleted.length;
  } catch (err) {
    console.error("[zip-geocode] flushZipGeocodeCache failed", err);
    return 0;
  }
}
