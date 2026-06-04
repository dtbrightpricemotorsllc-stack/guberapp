// GUBER Scout — internal lead-generation + semi-automated outreach pipeline.
// Admin-gated. Pulls REAL local businesses for a category + ZIP from the
// official Google Places API (name, phone, coordinates) and derives a social
// link from each business's own website, then drafts a peer-to-peer outreach
// message per business via the OpenAI integration. Falls back to a synthetic
// sample set only when no Maps key is set or Places returns nothing. The
// actual "Send" stays manual.
import type { Express, Request, Response } from "express";
import { lookup } from "node:dns/promises";
import { z } from "zod";
import OpenAI from "openai";
import { db } from "./db";
import { sql, eq, desc } from "drizzle-orm";
import { presetListings } from "@shared/schema";
import { storage } from "./storage";
import { geocodeZip } from "./zip-geocode";

type RequireAdmin = (req: Request, res: Response, next: Function) => any;

const MODEL = "gpt-5.1";

function getOpenAI(): OpenAI | null {
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) return null;
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

export const SCOUT_CATEGORIES = [
  "Landscaping",
  "Lawn Care",
  "Pressure Washing",
  "Mobile Detailing",
  "Detailing",
  "Cleaning",
  "Junk Removal",
  "Handyman",
  "Moving Help",
  "Window Washing",
] as const;

async function audit(req: Request, action: string, details: Record<string, any>) {
  try {
    await storage.createAuditLog({
      userId: req.session?.userId ?? null,
      action,
      details: JSON.stringify({ ...details, at: new Date().toISOString() }),
      ipAddress: req.ip,
    });
  } catch {}
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

// Only allow safe outreach URL schemes; reject javascript:, data:, etc. so a
// crafted/garbage AI value can never become a self-XSS vector in the admin UI.
function sanitizeUrl(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v) || /^sms:/i.test(v)) return v;
  return null;
}

// Small random offset so multiple pins at the same spot don't overlap on the
// map. Real Google coordinates use a tiny ~100m jitter; synthetic samples use a
// wider spread (~2km) to scatter across the ZIP area. amount is in degrees.
function jitterCoord(base: number, amount = 0.02) {
  return Math.round((base + rand(-amount, amount)) * 1e6) / 1e6;
}

// Server-side Maps key for Places. Prefer GOOGLE_MAPS_API_KEY (the project's
// key that has the Places API enabled); fall back to the geocoding key.
const MAPS_KEY = () => process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY || "";

interface SourcedBusiness {
  businessName: string;
  phoneNumber: string | null;
  socialMediaUrl: string | null;
  website: string | null;
  latitude: number | null; // real Google coords; null → fall back to ZIP center
  longitude: number | null;
}

// ── Resilient JSON fetch (Google APIs sometimes return HTML error pages) ─────
async function fetchJson(url: string, timeoutMs = 6000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const txt = await r.text();
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Google Places Text Search → candidate businesses for "<category> in <zip>".
async function placesTextSearch(category: string, zip: string, key: string): Promise<any[]> {
  const query = `${category} in ${zip}`;
  const url =
    `https://maps.googleapis.com/maps/api/place/textsearch/json` +
    `?query=${encodeURIComponent(query)}&region=us&key=${key}`;
  const data = await fetchJson(url);
  if (!data) return [];
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.warn("[guber-scout] places textsearch status:", data.status, data.error_message ?? "");
    return [];
  }
  return Array.isArray(data.results) ? data.results : [];
}

// Google Place Details → phone + website (field-masked to limit billing).
async function placeDetails(placeId: string, key: string): Promise<{ phone: string | null; website: string | null }> {
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}&fields=formatted_phone_number,international_phone_number,website&key=${key}`;
  const data = await fetchJson(url);
  if (!data || data.status !== "OK") return { phone: null, website: null };
  return {
    phone: data.result?.formatted_phone_number ?? data.result?.international_phone_number ?? null,
    website: data.result?.website ?? null,
  };
}

// Social links we recognize on a business's own website.
const SOCIAL_RX =
  /https?:\/\/(?:www\.)?(?:instagram\.com|facebook\.com|m\.facebook\.com|fb\.com|tiktok\.com|linktr\.ee|linktree\.com)\/[^\s"'<>)\\]+/i;

function isSocialUrl(u: string | null): boolean {
  return !!u && SOCIAL_RX.test(u);
}

// ── SSRF guard: never let an attacker-controlled website value (Place Details
// returns whatever the business put there) point our server at internal hosts ─
function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const a = +v4[1], b = +v4[2];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;       // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true;                      // multicast / reserved
    return false;
  }
  const h = ip.toLowerCase();
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fe80")) return true;            // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local
  if (h.startsWith("::ffff:")) return isPrivateIp(h.slice(7)); // IPv4-mapped
  return false;
}

async function hostIsSafe(hostname: string): Promise<boolean> {
  const h = hostname.toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return false;
  }
  try {
    const addrs = await lookup(hostname, { all: true });
    if (!addrs.length) return false;
    return !addrs.some((a) => isPrivateIp(a.address));
  } catch {
    return false;
  }
}

// Fetch a business's OWN public website (SSRF-guarded) with manual redirect
// re-validation, port/content-type checks, and a true streamed size cap.
async function safeFetchHtml(startUrl: string, maxBytes = 400_000, maxRedirects = 3): Promise<string | null> {
  let url = startUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    if (port !== "80" && port !== "443") return null;
    if (!(await hostIsSafe(u.hostname))) return null;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    try {
      const r = await fetch(u.toString(), {
        signal: ctrl.signal,
        redirect: "manual",
        headers: { "user-agent": "Mozilla/5.0 (compatible; GuberScout/1.0)" },
      });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) return null;
        url = new URL(loc, u).toString(); // re-validate next hop on the next loop
        continue;
      }
      if (!r.ok) return null;
      const ct = r.headers.get("content-type") || "";
      if (ct && !/text\/html|application\/xhtml/i.test(ct)) return null;
      if (!r.body) return (await r.text()).slice(0, maxBytes);
      const reader = r.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          total += value.length;
          if (total >= maxBytes) {
            try { await reader.cancel(); } catch {}
            break;
          }
        }
      }
      return Buffer.concat(chunks).toString("utf8").slice(0, maxBytes);
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

// Read a business's published page and pull the first social link from it.
async function extractSocialFromWebsite(website: string): Promise<string | null> {
  const html = await safeFetchHtml(website);
  if (!html) return null;
  const m = html.match(SOCIAL_RX);
  return m ? m[0].replace(/[)>,.'"\\]+$/, "") : null;
}

// Orchestrate the live pull: top Places results → details + social enrichment.
async function fetchLiveBusinesses(category: string, zip: string, key: string): Promise<SourcedBusiness[]> {
  if (!key) return [];
  const results = await placesTextSearch(category, zip, key);
  if (results.length === 0) return [];

  const top = results.slice(0, 6);
  const detailed = await Promise.all(
    top.map(async (p: any): Promise<SourcedBusiness | null> => {
      const name = String(p?.name ?? "").trim();
      if (!name) return null;
      const det = p?.place_id ? await placeDetails(p.place_id, key) : { phone: null, website: null };
      let social: string | null = null;
      if (det.website && isSocialUrl(det.website)) social = det.website;
      else if (det.website) social = await extractSocialFromWebsite(det.website);
      const loc = p?.geometry?.location;
      return {
        businessName: name,
        phoneNumber: det.phone,
        // Prefer a real social link; fall back to the website so the outreach
        // button always has something to open. sanitizeUrl blocks bad schemes.
        socialMediaUrl: sanitizeUrl(social) ?? sanitizeUrl(det.website),
        website: det.website ?? null,
        latitude: typeof loc?.lat === "number" ? loc.lat : null,
        longitude: typeof loc?.lng === "number" ? loc.lng : null,
      };
    }),
  );
  return detailed.filter((b): b is SourcedBusiness => !!b).slice(0, 5);
}

// ── Synthetic sample set (only used when Places is unavailable / returns none) ─
const NAME_PARTS_A = ["Apex", "BlueLine", "Summit", "Evergreen", "Riverstone", "Ironclad", "Coastal", "Frontline", "Heritage", "Precision"];
const NAME_PARTS_B: Record<string, string> = {
  "Landscaping": "Landscapes",
  "Lawn Care": "Lawn Care",
  "Pressure Washing": "Pressure Wash",
  "Mobile Detailing": "Mobile Detail",
  "Detailing": "Auto Detail",
  "Cleaning": "Cleaning Co",
  "Junk Removal": "Hauling",
  "Handyman": "Home Services",
  "Moving Help": "Movers",
  "Window Washing": "Window Care",
};

function mockBusinesses(category: string): SourcedBusiness[] {
  const suffix = NAME_PARTS_B[category] ?? category;
  const picks = [...NAME_PARTS_A].sort(() => Math.random() - 0.5).slice(0, 5);
  return picks.map((a) => {
    const businessName = `${a} ${suffix}`;
    const handle = slugify(businessName).replace(/-/g, "");
    const area = 200 + Math.floor(Math.random() * 700);
    const phoneNumber = `(${area}) ${100 + Math.floor(Math.random() * 899)}-${1000 + Math.floor(Math.random() * 8999)}`;
    return {
      businessName,
      phoneNumber,
      socialMediaUrl: `https://instagram.com/${handle}`,
      website: null,
      latitude: null,
      longitude: null,
    };
  });
}

// ── AI copywriter: one peer-to-peer outreach text per business name ──────────
function templateMessage(name: string, category: string, zip: string): string {
  return (
    `Hey ${name} — saw you're doing ${category.toLowerCase()} around ${zip}. ` +
    `GUBER drops paying local jobs right into your route so you fill the dead gaps in your day. ` +
    `No corporate middleman taking a cut — it's neighbor-to-neighbor. ` +
    `Want me to send ${zip} jobs straight to your phone?`
  );
}

async function draftMessages(
  businesses: SourcedBusiness[],
  category: string,
  zip: string,
): Promise<{ messages: string[]; usedAI: boolean }> {
  const fallback = businesses.map((b) => templateMessage(b.businessName, category, zip));
  const openai = getOpenAI();
  if (!openai || businesses.length === 0) return { messages: fallback, usedAI: false };

  const names = businesses.map((b) => b.businessName);
  const system =
    "You are GUBER Scout, writing peer-to-peer outreach texts for a local-services gig platform. Return ONLY valid JSON.";
  const user =
    `Write one short outreach text for each of these REAL local "${category}" businesses near ZIP ${zip}:\n` +
    names.map((n, i) => `${i + 1}. ${n}`).join("\n") +
    `\n\nEach message: max ~55 words, high-energy, direct, no-BS — like one hustler texting another, not a corporate ad. ` +
    `It MUST mention that exact business name and the ZIP ${zip}. Frame GUBER as filling dead time in their daily routing ` +
    `with paying local jobs, ZERO corporate middleman cuts.\n` +
    `Return JSON: {"drafts":[{"name":"<exact business name>","message":"..."}]}`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_completion_tokens: 1600,
    });
    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const drafts = Array.isArray(parsed?.drafts) ? parsed.drafts : [];
    const byName = new Map<string, string>();
    for (const d of drafts) {
      if (d?.name && d?.message) byName.set(String(d.name).trim().toLowerCase(), String(d.message).trim());
    }
    const messages = businesses.map((b, i) => byName.get(b.businessName.trim().toLowerCase()) || fallback[i]);
    // Only report AI usage if at least one draft actually matched a business;
    // otherwise every message silently fell back to the template.
    const matchedAny = businesses.some((b) => byName.has(b.businessName.trim().toLowerCase()));
    return { messages, usedAI: matchedAny };
  } catch (err: any) {
    console.warn("[guber-scout] message drafting failed, using template:", err?.message);
    return { messages: fallback, usedAI: false };
  }
}

const runSchema = z.object({
  category: z.enum(SCOUT_CATEGORIES, { errorMap: () => ({ message: "Unsupported category" }) }),
  zipCode: z.string().regex(/^\d{5}$/, "ZIP must be 5 digits"),
});

export function registerGuberScoutRoutes(app: Express, requireAdmin: RequireAdmin) {
  // Available category options for the dropdown.
  app.get("/api/admin/guber-scout/categories", requireAdmin, (_req, res) => {
    res.json({ categories: SCOUT_CATEGORIES });
  });

  // Run the scout: pull real businesses from Google Places for the category +
  // ZIP, enrich with phone/social, draft outreach copy, and stage 5 listings.
  app.post("/api/admin/guber-scout/run", requireAdmin, async (req: Request, res: Response) => {
    const parsed = runSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    }
    const { category, zipCode } = parsed.data;

    // ZIP center is the fallback coordinate for synthetic samples (real Google
    // results carry their own coordinates).
    const center = (await geocodeZip(zipCode)) ?? { lat: 39.5, lng: -98.35 };

    // Live pull first; fall back to a synthetic sample set if there's no Maps
    // key or Places returns nothing for this category/ZIP.
    let source: "google_places" | "sample" = "google_places";
    let businesses = await fetchLiveBusinesses(category, zipCode, MAPS_KEY());
    if (businesses.length === 0) {
      source = "sample";
      businesses = mockBusinesses(category);
    }

    const { messages, usedAI } = await draftMessages(businesses, category, zipCode);

    const rows = businesses.map((b, i) => {
      const slug = `${slugify(b.businessName)}-${Math.random().toString(36).slice(2, 6)}`;
      const hasReal = typeof b.latitude === "number" && typeof b.longitude === "number";
      const baseLat = hasReal ? (b.latitude as number) : center.lat;
      const baseLng = hasReal ? (b.longitude as number) : center.lng;
      // Real coords: ~100m de-overlap jitter. Samples: ~2km spread across ZIP.
      const amount = hasReal ? 0.0009 : 0.02;
      return {
        businessName: b.businessName,
        phoneNumber: b.phoneNumber,
        socialMediaUrl: sanitizeUrl(b.socialMediaUrl),
        category,
        zipCode,
        latitude: jitterCoord(baseLat, amount),
        longitude: jitterCoord(baseLng, amount),
        profileSlug: slug,
        claimedStatus: false,
        draftedMessage: messages[i] ?? templateMessage(b.businessName, category, zipCode),
      };
    });

    let inserted: typeof presetListings.$inferSelect[] = [];
    try {
      inserted = await db.insert(presetListings).values(rows).returning();
    } catch (err: any) {
      console.error("[guber-scout] insert failed:", err?.message);
      return res.status(500).json({ message: "Failed to stage listings" });
    }

    await audit(req, "guber_scout_run", { category, zipCode, count: inserted.length, source, usedAI });
    res.json({ listings: inserted, usedAI, source });
  });

  // All staged listings, newest first (client groups by ZIP).
  app.get("/api/admin/guber-scout/listings", requireAdmin, async (_req, res) => {
    try {
      const all = await db.select().from(presetListings).orderBy(desc(presetListings.createdAt));
      res.json({ listings: all });
    } catch (err: any) {
      console.error("[guber-scout] listings failed:", err?.message);
      res.status(500).json({ message: "Failed to load listings" });
    }
  });

  // Delete a single staged listing.
  app.delete("/api/admin/guber-scout/listings/:id", requireAdmin, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid id" });
    try {
      await db.delete(presetListings).where(eq(presetListings.id, id));
      await audit(req, "guber_scout_delete", { id });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[guber-scout] delete failed:", err?.message);
      res.status(500).json({ message: "Failed to delete listing" });
    }
  });

  // Clear all staged listings (housekeeping).
  app.post("/api/admin/guber-scout/clear", requireAdmin, async (req: Request, res: Response) => {
    try {
      await db.delete(presetListings);
      await audit(req, "guber_scout_clear", {});
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[guber-scout] clear failed:", err?.message);
      res.status(500).json({ message: "Failed to clear listings" });
    }
  });
}
