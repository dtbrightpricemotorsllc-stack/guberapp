// GUBER Scout — internal lead-generation + semi-automated outreach pipeline.
// Admin-gated. Mock-scrapes local businesses by category + ZIP, geocodes them
// near the ZIP center for map pins, and drafts a peer-to-peer outreach message
// per business via the OpenAI integration. The actual "Send" stays manual.
import type { Express, Request, Response } from "express";
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

// Cluster a pin near the ZIP center: ~0.01deg ≈ 1.1km, so ±0.02 keeps it local.
function jitterCoord(base: number) {
  return Math.round((base + rand(-0.02, 0.02)) * 1e6) / 1e6;
}

interface GeneratedBusiness {
  businessName: string;
  phoneNumber: string | null;
  socialMediaUrl: string | null;
  draftedMessage: string;
}

// ── Deterministic fallback (used if the LLM is unavailable) ──────────────────
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

function fallbackBusinesses(category: string, zip: string): GeneratedBusiness[] {
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
      draftedMessage:
        `Hey ${businessName} — saw you're grinding ${category.toLowerCase()} around ${zip}. ` +
        `GUBER puts paying jobs right in your route so you fill the dead gaps in your day. ` +
        `No corporate middleman, no cut of your money — it's neighbor-to-neighbor. ` +
        `Want me to drop ${zip} jobs straight to your phone?`,
    };
  });
}

// ── LLM generation: 5 realistic businesses + outreach copy in one JSON call ──
async function generateBusinesses(category: string, zip: string): Promise<{ businesses: GeneratedBusiness[]; usedAI: boolean }> {
  const openai = getOpenAI();
  if (!openai) return { businesses: fallbackBusinesses(category, zip), usedAI: false };

  const system =
    "You are GUBER Scout, a lead-generation assistant for a local-services gig platform. " +
    "You generate REALISTIC but FICTIONAL local small-business profiles for outreach staging. " +
    "Return ONLY valid JSON.";

  const user =
    `Generate exactly 5 realistic, fictional local "${category}" small businesses operating near ZIP code ${zip} (US).\n` +
    `For each business produce:\n` +
    `- businessName: a believable independent operator name (no nationwide franchises)\n` +
    `- phoneNumber: a formatted US phone like "(555) 123-4567" (fictional)\n` +
    `- socialMediaUrl: a plausible Instagram or Facebook URL based on the name\n` +
    `- draftedMessage: a short (max ~55 words), high-energy, direct, NO-BS peer-to-peer outreach text. ` +
    `It MUST mention the business name and the ZIP code ${zip}. Frame GUBER as a way to fill dead time in their daily routing with paying local jobs, ` +
    `with ZERO corporate middleman cuts. Sound like one hustler texting another — not a corporate ad.\n\n` +
    `Return JSON of shape: {"businesses":[{"businessName":"","phoneNumber":"","socialMediaUrl":"","draftedMessage":""}]}`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_completion_tokens: 1400,
    });
    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed?.businesses) ? parsed.businesses : [];
    const businesses: GeneratedBusiness[] = arr
      .filter((b: any) => b && typeof b.businessName === "string" && b.businessName.trim())
      .slice(0, 5)
      .map((b: any) => ({
        businessName: String(b.businessName).trim(),
        phoneNumber: b.phoneNumber ? String(b.phoneNumber).trim() : null,
        socialMediaUrl: b.socialMediaUrl ? String(b.socialMediaUrl).trim() : null,
        draftedMessage: b.draftedMessage ? String(b.draftedMessage).trim() : "",
      }));
    if (businesses.length === 0) return { businesses: fallbackBusinesses(category, zip), usedAI: false };
    // Backfill any missing drafted message with the deterministic template.
    const fb = fallbackBusinesses(category, zip);
    businesses.forEach((b, i) => { if (!b.draftedMessage) b.draftedMessage = fb[i % fb.length].draftedMessage; });
    return { businesses, usedAI: true };
  } catch (err: any) {
    console.warn("[guber-scout] LLM generation failed, using fallback:", err?.message);
    return { businesses: fallbackBusinesses(category, zip), usedAI: false };
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

  // Run the (mock) scout: generate 5 staged businesses for the category + ZIP.
  app.post("/api/admin/guber-scout/run", requireAdmin, async (req: Request, res: Response) => {
    const parsed = runSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    }
    const { category, zipCode } = parsed.data;

    // Accurate-ish center for the ZIP; pins jitter around it. Fallback to a
    // continental-US center if the ZIP can't be resolved so the run still works.
    const center = (await geocodeZip(zipCode)) ?? { lat: 39.5, lng: -98.35 };

    const { businesses, usedAI } = await generateBusinesses(category, zipCode);

    const rows = [];
    for (const b of businesses) {
      const slug = `${slugify(b.businessName)}-${Math.random().toString(36).slice(2, 6)}`;
      rows.push({
        businessName: b.businessName,
        phoneNumber: b.phoneNumber,
        socialMediaUrl: sanitizeUrl(b.socialMediaUrl),
        category,
        zipCode,
        latitude: jitterCoord(center.lat),
        longitude: jitterCoord(center.lng),
        profileSlug: slug,
        claimedStatus: false,
        draftedMessage: b.draftedMessage,
      });
    }

    let inserted: typeof presetListings.$inferSelect[] = [];
    try {
      inserted = await db.insert(presetListings).values(rows).returning();
    } catch (err: any) {
      console.error("[guber-scout] insert failed:", err?.message);
      return res.status(500).json({ message: "Failed to stage listings" });
    }

    await audit(req, "guber_scout_run", { category, zipCode, count: inserted.length, usedAI });
    res.json({ listings: inserted, usedAI });
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
