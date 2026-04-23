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

async function fetchCountyFromGoogle(zip: string, lat: number, lng: number): Promise<string> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return "";
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=administrative_area_level_2&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return "";
    const data = await res.json() as { results?: Array<{ address_components: Array<{ types: string[]; long_name: string }> }> };
    const result = data.results?.[0];
    if (!result) return "";
    const countyComp = result.address_components.find(c => c.types.includes("administrative_area_level_2"));
    return countyComp?.long_name?.replace(/ County$/i, "") ?? "";
  } catch {
    return "";
  }
}

export async function geocodeZipFull(zip: string): Promise<ZipFullInfo | null> {
  const z = (zip || "").trim().replace(/-\d{4}$/, "").padStart(5, "0");
  if (!/^\d{5}$/.test(z)) return null;

  if (fullInfoCache.has(z)) return fullInfoCache.get(z)!;

  const staticResult = zipcodesLib.lookup(z);
  if (!staticResult) return null;

  const { latitude: lat, longitude: lng, city, state } = staticResult;
  const county = await fetchCountyFromGoogle(z, lat, lng);

  const info: ZipFullInfo = { lat, lng, city: city || "", state: state || "", county };
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
