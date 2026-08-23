import type { Express, Request, Response } from "express";
import { pool } from "./db";
import { filterContactInfo } from "./auth";

type Middleware = (req: Request, res: Response, next: Function) => unknown;

interface RouteGuards {
  requireAuth: Middleware;
  requireAdmin: Middleware;
  checkSuspended: Middleware;
}

const CATEGORIES = new Set(["General Labor", "Skilled Labor", "On-Demand Help", "Verify & Inspect"]);
const PRICING_TYPES = new Set(["quote", "starting_at", "hourly"]);
const ACTIVE_STATUSES = new Set(["draft", "published", "paused", "archived"]);

function safeText(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const valueTrimmed = value.trim().slice(0, max);
  if (!valueTrimmed) return null;
  const filtered = filterContactInfo(valueTrimmed);
  if (filtered.blocked) throw new Error("Contact information and off-platform payment details are not allowed in service offers.");
  return filtered.clean;
}

function safeTags(value: unknown, maxItems = 10): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .map((item) => safeText(item, 80))
    .filter((item): item is string => !!item);
}

function toNumber(value: unknown, min: number, max: number): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`Value must be between ${min} and ${max}.`);
  }
  return parsed;
}

function fuzzCoordinate(value: number | null, id: number, axis: number): number | null {
  if (value === null || value === undefined) return null;
  const seed = ((id * 1103515245 + axis * 12345) & 0x7fffffff) / 0x7fffffff;
  return Math.round((value + (seed - 0.5) * 0.018) * 1000) / 1000;
}

function approximateArea(zip: string | null): string {
  return zip && zip.length >= 3 ? `Near ${zip.slice(0, 3)}••` : "Local service area";
}

function requestText(value: unknown, field: string, max: number, required = false): string | null {
  const text = safeText(value, max);
  if (required && !text) throw new Error(`${field} is required.`);
  return text;
}

function requestAmount(value: unknown): number {
  const amount = toNumber(value, 5, 100000);
  if (amount === null) throw new Error("Budget is required.");
  return Math.round(amount * 100) / 100;
}

function requestCoordinate(value: unknown, min: number, max: number, field: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) {
    throw new Error(`${field} is invalid.`);
  }
  return coordinate;
}

function publicOffer(row: any) {
  const availableNow = !!row.available_now && !!row.provider_available;
  return {
    id: row.id,
    title: row.title,
    description: filterContactInfo(row.description || "").clean || null,
    category: row.category,
    serviceType: row.service_type,
    serviceClass: row.service_class,
    capabilities: (row.capabilities || []).map((item: string) => filterContactInfo(item).clean),
    equipment: (row.equipment || []).map((item: string) => filterContactInfo(item).clean),
    pricingType: row.pricing_type,
    startingPrice: row.starting_price,
    hourlyRate: row.hourly_rate,
    serviceRadius: row.service_radius,
    availability: availableNow ? "available_now" : "by_request",
    area: approximateArea(row.zip),
    mapLat: fuzzCoordinate(row.lat, row.id, 1),
    mapLng: fuzzCoordinate(row.lng, row.id, 2),
    provider: {
      id: row.provider_user_id,
      name: row.public_username ? `@${row.public_username}` : row.guber_id || "GUBER Provider",
      avatar: row.profile_photo || null,
      rating: row.rating || 0,
      reviewCount: row.review_count || 0,
      idVerified: !!row.id_verified,
      credentialVerified: !!row.credential_verified,
    },
    publishedAt: row.published_at,
  };
}

function ownerOffer(row: any) {
  return {
    ...publicOffer(row),
    providerUserId: row.provider_user_id,
    status: row.status,
    moderationStatus: row.moderation_status,
    zip: row.zip,
    lat: row.lat,
    lng: row.lng,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getOffer(id: number) {
  const { rows } = await pool.query(
    `SELECT so.*, u.public_username, u.guber_id, u.profile_photo, u.rating, u.review_count,
            u.id_verified, u.credential_verified, u.is_available AS provider_available
       FROM service_offers so
       JOIN users u ON u.id = so.provider_user_id
      WHERE so.id = $1`,
    [id],
  );
  return rows[0] || null;
}

export function registerServiceOfferRoutes(app: Express, guards: RouteGuards) {
  const { requireAuth, requireAdmin, checkSuspended } = guards;

  app.get("/api/service-offers", async (req: Request, res: Response) => {
    try {
      const conditions = ["so.status = 'published'", "so.moderation_status = 'approved'"];
      const params: unknown[] = [];
      const category = typeof req.query.category === "string" ? req.query.category : "";
      const availableNow = req.query.availableNow === "true";
      const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 80) : "";

      if (category && category !== "All") {
        params.push(category);
        conditions.push(`so.category = $${params.length}`);
      }
      if (availableNow) conditions.push("so.available_now = TRUE AND u.is_available = TRUE");
      if (search) {
        params.push(`%${search}%`);
        conditions.push(`(so.title ILIKE $${params.length} OR so.description ILIKE $${params.length} OR so.service_type ILIKE $${params.length})`);
      }
      params.push(Math.min(Math.max(Number(req.query.limit) || 100, 1), 200));
      const result = await pool.query(
        `SELECT so.*, u.public_username, u.guber_id, u.profile_photo, u.rating, u.review_count,
                u.id_verified, u.credential_verified, u.is_available AS provider_available
           FROM service_offers so
           JOIN users u ON u.id = so.provider_user_id
          WHERE ${conditions.join(" AND ")}
          ORDER BY (so.available_now AND u.is_available) DESC, so.published_at DESC, so.id DESC
          LIMIT $${params.length}`,
        params,
      );
      res.json(result.rows.map(publicOffer));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Unable to browse services" });
    }
  });

  app.get("/api/service-offers/mine", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT so.*, u.public_username, u.guber_id, u.profile_photo, u.rating, u.review_count,
                u.id_verified, u.credential_verified, u.is_available AS provider_available
           FROM service_offers so JOIN users u ON u.id = so.provider_user_id
          WHERE so.provider_user_id = $1
          ORDER BY so.updated_at DESC, so.id DESC`,
        [req.session.userId],
      );
      res.json(result.rows.map(ownerOffer));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Unable to load your services" });
    }
  });

  app.get("/api/service-offers/:id", async (req: Request, res: Response) => {
    try {
      const offer = await getOffer(Number(req.params.id));
      if (!offer) return res.status(404).json({ message: "Service offer not found" });
      const viewerId = req.session?.userId;
      const viewer = viewerId ? (await pool.query("SELECT role FROM users WHERE id = $1", [viewerId])).rows[0] : null;
      const ownerOrAdmin = offer.provider_user_id === viewerId || viewer?.role === "admin";
      if ((offer.status !== "published" || offer.moderation_status !== "approved") && !ownerOrAdmin) {
        return res.status(404).json({ message: "Service offer not found" });
      }
      res.json(ownerOrAdmin ? ownerOffer(offer) : publicOffer(offer));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Unable to load service" });
    }
  });

  app.post("/api/service-offers", requireAuth, checkSuspended, async (req: Request, res: Response) => {
    try {
      const title = safeText(req.body.title, 100);
      const category = safeText(req.body.category, 80);
      if (!title || !category || !CATEGORIES.has(category)) {
        return res.status(400).json({ message: "A title and valid service category are required." });
      }
      const serviceType = safeText(req.body.serviceType, 100);
      const description = safeText(req.body.description, 1500);
      const pricingType = req.body.pricingType || "quote";
      if (!PRICING_TYPES.has(pricingType)) return res.status(400).json({ message: "Invalid pricing type." });
      const startingPrice = toNumber(req.body.startingPrice, 0, 100000);
      const hourlyRate = toNumber(req.body.hourlyRate, 0, 100000);
      const serviceRadius = toNumber(req.body.serviceRadius, 1, 250) ?? 25;
      const user = (await pool.query("SELECT zipcode, lat, lng FROM users WHERE id = $1", [req.session.userId])).rows[0];
      const serviceClass = category === "Skilled Labor" ? "skilled_pro" : "general";
      const result = await pool.query(
        `INSERT INTO service_offers
          (provider_user_id, title, description, category, service_type, service_class, capabilities, equipment,
           pricing_type, starting_price, hourly_rate, service_radius, zip, lat, lng, available_now)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id`,
        [req.session.userId, title, description, category, serviceType, serviceClass, safeTags(req.body.capabilities),
          safeTags(req.body.equipment), pricingType, startingPrice, hourlyRate, serviceRadius,
          user?.zipcode || null, user?.lat || null, user?.lng || null, !!req.body.availableNow],
      );
      const offer = await getOffer(result.rows[0].id);
      await pool.query(
        "INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES ($1,$2,$3,$4)",
        [req.session.userId, "service_offer_created", JSON.stringify({ serviceOfferId: offer.id, category }), req.ip],
      );
      res.status(201).json(ownerOffer(offer));
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Unable to create service offer" });
    }
  });

  app.patch("/api/service-offers/:id", requireAuth, checkSuspended, async (req: Request, res: Response) => {
    try {
      const offer = await getOffer(Number(req.params.id));
      if (!offer) return res.status(404).json({ message: "Service offer not found" });
      if (offer.provider_user_id !== req.session.userId) return res.status(403).json({ message: "Only the provider can edit this service." });
      if (!ACTIVE_STATUSES.has(offer.status) || offer.status === "archived") return res.status(400).json({ message: "Archived offers cannot be edited." });

      const title = req.body.title === undefined ? offer.title : safeText(req.body.title, 100);
      const description = req.body.description === undefined ? offer.description : safeText(req.body.description, 1500);
      const serviceType = req.body.serviceType === undefined ? offer.service_type : safeText(req.body.serviceType, 100);
      const pricingType = req.body.pricingType === undefined ? offer.pricing_type : req.body.pricingType;
      if (!title || !PRICING_TYPES.has(pricingType)) return res.status(400).json({ message: "Invalid service offer details." });
      await pool.query(
        `UPDATE service_offers
            SET title=$1, description=$2, service_type=$3, capabilities=$4, equipment=$5,
                pricing_type=$6, starting_price=$7, hourly_rate=$8, service_radius=$9,
                available_now=$10, updated_at=NOW()
          WHERE id=$11`,
        [title, description, serviceType,
          req.body.capabilities === undefined ? offer.capabilities : safeTags(req.body.capabilities),
          req.body.equipment === undefined ? offer.equipment : safeTags(req.body.equipment),
          pricingType,
          req.body.startingPrice === undefined ? offer.starting_price : toNumber(req.body.startingPrice, 0, 100000),
          req.body.hourlyRate === undefined ? offer.hourly_rate : toNumber(req.body.hourlyRate, 0, 100000),
          req.body.serviceRadius === undefined ? offer.service_radius : toNumber(req.body.serviceRadius, 1, 250),
          req.body.availableNow === undefined ? offer.available_now : !!req.body.availableNow,
          offer.id],
      );
      res.json(ownerOffer(await getOffer(offer.id)));
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Unable to update service offer" });
    }
  });

  app.post("/api/service-offers/:id/publish", requireAuth, checkSuspended, async (req: Request, res: Response) => {
    try {
      const offer = await getOffer(Number(req.params.id));
      if (!offer) return res.status(404).json({ message: "Service offer not found" });
      if (offer.provider_user_id !== req.session.userId) return res.status(403).json({ message: "Only the provider can publish this service." });
      if (!offer.id_verified) return res.status(403).json({ message: "Verify your identity before publishing a service offer." });
      if (offer.service_class === "skilled_pro" && !offer.credential_verified) {
        return res.status(403).json({ message: "A verified credential is required before publishing Skilled/Pro services." });
      }
      await pool.query(
        `UPDATE service_offers
            SET status='published', moderation_status='approved', published_at=COALESCE(published_at, NOW()),
                paused_at=NULL, updated_at=NOW()
          WHERE id=$1`,
        [offer.id],
      );
      await pool.query(
        "INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES ($1,$2,$3,$4)",
        [req.session.userId, "service_offer_published", JSON.stringify({ serviceOfferId: offer.id }), req.ip],
      );
      res.json(ownerOffer(await getOffer(offer.id)));
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Unable to publish service offer" });
    }
  });

  app.post("/api/service-offers/:id/status", requireAuth, checkSuspended, async (req: Request, res: Response) => {
    try {
      const nextStatus = req.body.status;
      if (!["paused", "archived"].includes(nextStatus)) return res.status(400).json({ message: "Status must be paused or archived." });
      const offer = await getOffer(Number(req.params.id));
      if (!offer) return res.status(404).json({ message: "Service offer not found" });
      if (offer.provider_user_id !== req.session.userId) return res.status(403).json({ message: "Only the provider can manage this service." });
      await pool.query(
        `UPDATE service_offers SET status=$1, paused_at=CASE WHEN $1='paused' THEN NOW() ELSE paused_at END,
           archived_at=CASE WHEN $1='archived' THEN NOW() ELSE archived_at END, updated_at=NOW() WHERE id=$2`,
        [nextStatus, offer.id],
      );
      res.json(ownerOffer(await getOffer(offer.id)));
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Unable to update service status" });
    }
  });

  app.post("/api/service-offers/:id/hire", requireAuth, checkSuspended, async (req: Request, res: Response) => {
    try {
      const offer = await getOffer(Number(req.params.id));
      if (!offer || offer.status !== "published" || offer.moderation_status !== "approved") {
        return res.status(404).json({ message: "Service offer not found" });
      }
      if (offer.provider_user_id === req.session.userId) return res.status(400).json({ message: "You cannot hire your own service offer." });

      const scope = requestText(req.body.scope, "Scope", 1500, true)!;
      const timing = requestText(req.body.timing, "Timing", 160, true)!;
      const budget = requestAmount(req.body.budget);
      const location = requestText(req.body.location, "Location", 300, true)!;
      const zip = requestText(req.body.zip, "ZIP code", 16, true)!;
      const lat = requestCoordinate(req.body.lat, -90, 90, "Latitude");
      const lng = requestCoordinate(req.body.lng, -180, 180, "Longitude");
      const estimatedMinutes = toNumber(req.body.estimatedMinutes, 15, 7 * 24 * 60);
      const startTime = req.body.startTime ? new Date(req.body.startTime) : null;
      if (startTime && Number.isNaN(startTime.getTime())) throw new Error("Requested time is invalid.");

      // The request is a real, private job from the beginning. The direct
      // offer is bound to the published provider and controls negotiation,
      // payment, proof, disputes, and payout; the job supplies the familiar
      // scheduling and activity surface after the provider accepts.
      const client = await pool.connect();
      let jobId: number | null = null;
      let directOfferId: number | null = null;
      try {
        await client.query("BEGIN");
        const jobResult = await client.query(
          `INSERT INTO jobs
            (title, description, category, budget, location, location_approx, zip, lat, lng, start_time,
              status, posted_by_id, assigned_helper_id, service_type, job_type, job_details, is_paid, is_published, visibility)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,$12,$13,'service_request',$14::jsonb,FALSE,FALSE,'private')
           RETURNING id`,
          [
            offer.title,
            scope,
            offer.category,
            budget,
            location,
            approximateArea(zip),
            zip,
            lat,
            lng,
            startTime,
            req.session.userId,
            offer.provider_user_id,
            offer.service_type || offer.title,
            JSON.stringify({
              serviceOfferId: String(offer.id),
              requestTiming: timing,
              requestSource: "service_offer",
            }),
          ],
        );
        jobId = jobResult.rows[0].id;

        const directOfferResult = await client.query(
          `INSERT INTO direct_offers
            (job_id, service_offer_id, hirer_user_id, worker_user_id, initial_offer_amount, current_offer_amount,
             category, job_summary, job_type, start_timing, estimated_minutes, location, zip, lat, lng, status, expires_at)
           VALUES ($1,$2,$3,$4,$5,$5,$6,$7,'service_request',$8,$9,$10,$11,$12,$13,'sent',NOW() + INTERVAL '24 hours')
           RETURNING id`,
          [
            jobId,
            offer.id,
            req.session.userId,
            offer.provider_user_id,
            budget,
            offer.category,
            `${offer.title}: ${scope}`,
            timing,
            estimatedMinutes,
            location,
            zip,
            lat,
            lng,
          ],
        );
        directOfferId = directOfferResult.rows[0].id;
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      await pool.query(
        "INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES ($1,$2,$3,$4)",
        [req.session.userId, "service_offer_requested", JSON.stringify({ serviceOfferId: offer.id, jobId, directOfferId }), req.ip],
      );
      await pool.query(
        "INSERT INTO notifications (user_id, title, body, type, job_id) VALUES ($1,$2,$3,$4,$5)",
        [offer.provider_user_id, "New Service Request", `You received a $${budget.toFixed(2)} request for ${offer.title}. Review the protected offer before accepting.`, "direct_offer", jobId],
      );

      res.status(201).json({ jobId, directOfferId, jobUrl: `/jobs/${jobId}` });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Unable to create this service request" });
    }
  });

  app.get("/api/admin/service-offers", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT so.*, u.email AS provider_email, u.public_username, u.guber_id, u.profile_photo, u.rating, u.review_count,
                u.id_verified, u.credential_verified, u.is_available AS provider_available
           FROM service_offers so JOIN users u ON u.id = so.provider_user_id
          ORDER BY so.updated_at DESC LIMIT 300`,
      );
      res.json(result.rows.map(ownerOffer));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Unable to load service moderation queue" });
    }
  });

  app.patch("/api/admin/service-offers/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const status = req.body.status;
      if (!["published", "paused", "removed"].includes(status)) return res.status(400).json({ message: "Invalid moderation status." });
      const offer = await getOffer(Number(req.params.id));
      if (!offer) return res.status(404).json({ message: "Service offer not found" });
      await pool.query("UPDATE service_offers SET status=$1, updated_at=NOW() WHERE id=$2", [status, offer.id]);
      await pool.query(
        "INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES ($1,$2,$3,$4)",
        [req.session.userId, "service_offer_moderated", JSON.stringify({ serviceOfferId: offer.id, status }), req.ip],
      );
      res.json(ownerOffer(await getOffer(offer.id)));
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Unable to moderate service offer" });
    }
  });
}