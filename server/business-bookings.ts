import type { Express, Request, Response } from "express";
import { pool } from "./db";
import { storage } from "./storage";
import { businessPlanHasAccess } from "./business-experience";

type Guard = (req: Request, res: Response, next: Function) => unknown;

const CONFIRMATION_MODES = ["instant", "approval", "quote"] as const;
const PRICING_MODES = ["fixed", "starting_at", "quote"] as const;
const FULFILLMENT_MODES = ["in_person", "mobile", "pickup_delivery", "event"] as const;
const AVAILABILITY_MODES = ["appointment", "window"] as const;
const OWNER_STATUSES = ["confirmed", "declined", "reschedule_proposed", "cancelled", "completed"] as const;

function intOrNull(value: unknown, min = 0, max = 1000000) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function arrayJson(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 14).map((entry) => ({
    day: text((entry as any)?.day, 12),
    start: text((entry as any)?.start, 5),
    end: text((entry as any)?.end, 5),
    location: text((entry as any)?.location, 240),
  })).filter((entry) => entry.day && /^\d{2}:\d{2}$/.test(entry.start) && /^\d{2}:\d{2}$/.test(entry.end));
}

function parseDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function paidBookingPlan(plan: any) {
  return Boolean(
    plan &&
    businessPlanHasAccess(plan.status) &&
    (["business_plus", "business_pro"].includes(plan.plan_type) || plan.offer_key),
  );
}

async function getBusinessContext(userId: number) {
  const account = await storage.getBusinessAccount(userId);
  if (!account) return null;
  const plan = await pool.query(
    `SELECT plan_type, status, offer_key FROM business_plans WHERE business_account_id = $1 LIMIT 1`,
    [account.id],
  );
  return { account, plan: plan.rows[0] || null };
}

function accessError(context: { account: any; plan: any } | null) {
  if (!context) return "No business account found";
  if (context.account.status !== "verified_business") return "Business verification is required before using Booking & Appointments";
  if (!paidBookingPlan(context.plan)) return "Booking & Appointments requires an active paid business subscription";
  return null;
}

async function notify(userId: number, title: string, body: string) {
  await storage.createNotification({ userId, title, body, type: "business_booking" }).catch(() => {});
}

async function recordEvent(client: { query: (query: string, values?: unknown[]) => Promise<any> }, bookingId: number, actorId: number | null, fromStatus: string | null, toStatus: string, note: string | null) {
  await client.query(
    `INSERT INTO business_booking_events (booking_id, actor_user_id, from_status, to_status, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [bookingId, actorId, fromStatus, toStatus, note],
  );
}

export function registerBusinessBookingRoutes(app: Express, guards: { requireAuth: Guard }) {
  const { requireAuth } = guards;

  app.get("/api/business/bookings/access", requireAuth, async (req, res) => {
    const context = await getBusinessContext(req.session.userId!);
    res.json({
      enabled: !accessError(context),
      verified: context?.account?.status === "verified_business",
      subscribed: paidBookingPlan(context?.plan),
      reason: accessError(context),
    });
  });

  app.get("/api/business/bookings/services", requireAuth, async (req, res) => {
    const context = await getBusinessContext(req.session.userId!);
    const error = accessError(context);
    if (error) return res.status(context ? 403 : 404).json({ message: error });
    const result = await pool.query(
      `SELECT * FROM business_booking_services WHERE business_account_id = $1 ORDER BY active DESC, created_at DESC`,
      [context!.account.id],
    );
    res.json(result.rows);
  });

  app.post("/api/business/bookings/services", requireAuth, async (req, res) => {
    const context = await getBusinessContext(req.session.userId!);
    const error = accessError(context);
    if (error) return res.status(context ? 403 : 404).json({ message: error });
    const name = text(req.body.name, 120);
    const confirmationMode = text(req.body.confirmationMode, 20);
    const pricingMode = text(req.body.pricingMode, 20);
    const fulfillmentMode = text(req.body.fulfillmentMode, 24) || "in_person";
    const availabilityMode = text(req.body.availabilityMode, 20) || "appointment";
    if (!name) return res.status(400).json({ message: "Service name is required" });
    if (!CONFIRMATION_MODES.includes(confirmationMode as any)) return res.status(400).json({ message: "Choose a valid confirmation type" });
    if (!PRICING_MODES.includes(pricingMode as any)) return res.status(400).json({ message: "Choose a valid pricing type" });
    if (!FULFILLMENT_MODES.includes(fulfillmentMode as any)) return res.status(400).json({ message: "Choose a valid service format" });
    if (!AVAILABILITY_MODES.includes(availabilityMode as any)) return res.status(400).json({ message: "Choose a valid availability type" });
    const duration = intOrNull(req.body.durationMinutes, 5, 1440);
    const price = intOrNull(req.body.priceCents, 0, 100000000);
    if (["fixed", "starting_at"].includes(pricingMode) && price === null) return res.status(400).json({ message: "A price is required for this pricing type" });
    if (confirmationMode === "instant" && !duration) return res.status(400).json({ message: "Instant bookings need an appointment duration" });
    const windowDays = intOrNull(req.body.bookingWindowDays, 1, 365) ?? 30;
    const leadHours = intOrNull(req.body.leadTimeHours, 0, 8760) ?? 24;
    const result = await pool.query(
      `INSERT INTO business_booking_services
        (business_account_id, name, description, confirmation_mode, pricing_mode, price_cents,
         duration_minutes, fulfillment_mode, location_text, service_area, availability_mode,
         availability_json, booking_window_days, lead_time_hours, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true)
       RETURNING *`,
      [
        context!.account.id, name, text(req.body.description, 1000), confirmationMode, pricingMode, price,
        duration, fulfillmentMode, text(req.body.locationText, 240), text(req.body.serviceArea, 240),
        availabilityMode, JSON.stringify(arrayJson(req.body.availability)), windowDays, leadHours,
      ],
    );
    res.status(201).json(result.rows[0]);
  });

  app.patch("/api/business/bookings/services/:id", requireAuth, async (req, res) => {
    const context = await getBusinessContext(req.session.userId!);
    const error = accessError(context);
    if (error) return res.status(context ? 403 : 404).json({ message: error });
    const serviceId = Number(req.params.id);
    const existing = await pool.query(
      `SELECT * FROM business_booking_services WHERE id = $1 AND business_account_id = $2`,
      [serviceId, context!.account.id],
    );
    if (!existing.rows[0]) return res.status(404).json({ message: "Service not found" });
    const current = existing.rows[0];
    const next = {
      name: text(req.body.name ?? current.name, 120),
      description: text(req.body.description ?? current.description, 1000),
      confirmationMode: text(req.body.confirmationMode ?? current.confirmation_mode, 20),
      pricingMode: text(req.body.pricingMode ?? current.pricing_mode, 20),
      price: intOrNull(req.body.priceCents ?? current.price_cents, 0, 100000000),
      duration: intOrNull(req.body.durationMinutes ?? current.duration_minutes, 5, 1440),
      fulfillmentMode: text(req.body.fulfillmentMode ?? current.fulfillment_mode, 24),
      locationText: text(req.body.locationText ?? current.location_text, 240),
      serviceArea: text(req.body.serviceArea ?? current.service_area, 240),
      availabilityMode: text(req.body.availabilityMode ?? current.availability_mode, 20),
      availability: req.body.availability === undefined ? current.availability_json : arrayJson(req.body.availability),
      windowDays: intOrNull(req.body.bookingWindowDays ?? current.booking_window_days, 1, 365) ?? 30,
      leadHours: intOrNull(req.body.leadTimeHours ?? current.lead_time_hours, 0, 8760) ?? 24,
      active: req.body.active === undefined ? current.active : Boolean(req.body.active),
    };
    if (!next.name || !CONFIRMATION_MODES.includes(next.confirmationMode as any) || !PRICING_MODES.includes(next.pricingMode as any) || !FULFILLMENT_MODES.includes(next.fulfillmentMode as any) || !AVAILABILITY_MODES.includes(next.availabilityMode as any)) {
      return res.status(400).json({ message: "Service configuration is incomplete" });
    }
    if (["fixed", "starting_at"].includes(next.pricingMode) && next.price === null) return res.status(400).json({ message: "A price is required for this pricing type" });
    if (next.confirmationMode === "instant" && !next.duration) return res.status(400).json({ message: "Instant bookings need an appointment duration" });
    const result = await pool.query(
      `UPDATE business_booking_services
          SET name=$1, description=$2, confirmation_mode=$3, pricing_mode=$4, price_cents=$5,
              duration_minutes=$6, fulfillment_mode=$7, location_text=$8, service_area=$9,
              availability_mode=$10, availability_json=$11, booking_window_days=$12,
              lead_time_hours=$13, active=$14, updated_at=NOW()
        WHERE id=$15 AND business_account_id=$16 RETURNING *`,
      [next.name, next.description, next.confirmationMode, next.pricingMode, next.price, next.duration,
        next.fulfillmentMode, next.locationText, next.serviceArea, next.availabilityMode,
        JSON.stringify(next.availability), next.windowDays, next.leadHours, next.active, serviceId, context!.account.id],
    );
    res.json(result.rows[0]);
  });

  app.delete("/api/business/bookings/services/:id", requireAuth, async (req, res) => {
    const context = await getBusinessContext(req.session.userId!);
    const error = accessError(context);
    if (error) return res.status(context ? 403 : 404).json({ message: error });
    const result = await pool.query(
      `UPDATE business_booking_services SET active = false, updated_at = NOW()
        WHERE id = $1 AND business_account_id = $2 RETURNING id`,
      [Number(req.params.id), context!.account.id],
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Service not found" });
    res.status(204).end();
  });

  app.get("/api/business/bookings", requireAuth, async (req, res) => {
    const context = await getBusinessContext(req.session.userId!);
    const error = accessError(context);
    if (error) return res.status(context ? 403 : 404).json({ message: error });
    const result = await pool.query(
      `SELECT b.*, s.name AS service_name, s.confirmation_mode, s.pricing_mode,
              s.fulfillment_mode, u.guber_id AS customer_guber_id
         FROM business_bookings b
         JOIN business_booking_services s ON s.id = b.service_id
         JOIN users u ON u.id = b.customer_user_id
        WHERE b.business_account_id = $1
        ORDER BY COALESCE(b.requested_start_at, b.created_at) ASC`,
      [context!.account.id],
    );
    res.json(result.rows);
  });

  app.get("/api/business/bookings/mine", requireAuth, async (req, res) => {
    const result = await pool.query(
      `SELECT b.*, s.name AS service_name, s.confirmation_mode, s.pricing_mode,
              s.fulfillment_mode, bp.company_name, COALESCE(bp.company_logo, ba.company_logo) AS company_logo
         FROM business_bookings b
         JOIN business_booking_services s ON s.id = b.service_id
         JOIN business_accounts ba ON ba.id = b.business_account_id
         JOIN business_profiles bp ON bp.user_id = ba.owner_user_id
        WHERE b.customer_user_id = $1
        ORDER BY COALESCE(b.requested_start_at, b.created_at) DESC`,
      [req.session.userId],
    );
    res.json(result.rows);
  });

  app.patch("/api/business/bookings/:id/status", requireAuth, async (req, res) => {
    const context = await getBusinessContext(req.session.userId!);
    const error = accessError(context);
    if (error) return res.status(context ? 403 : 404).json({ message: error });
    const status = text(req.body.status, 32);
    if (!OWNER_STATUSES.includes(status as any)) return res.status(400).json({ message: "Choose a valid appointment status" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT b.*, s.name AS service_name, u.id AS customer_id
           FROM business_bookings b
           JOIN business_booking_services s ON s.id = b.service_id
           JOIN users u ON u.id = b.customer_user_id
          WHERE b.id = $1 AND b.business_account_id = $2 FOR UPDATE`,
        [Number(req.params.id), context!.account.id],
      );
      if (!current.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Booking not found" });
      }
      const booking = current.rows[0];
      const note = text(req.body.note, 1000) || null;
      const proposedStart = parseDate(req.body.proposedStartAt);
      const proposedEnd = parseDate(req.body.proposedEndAt);
      await client.query(
        `UPDATE business_bookings
            SET status=$1, business_note=$2, proposed_start_at=$3, proposed_end_at=$4, updated_at=NOW()
          WHERE id=$5`,
        [status, note, proposedStart, proposedEnd, booking.id],
      );
      await recordEvent(client, booking.id, req.session.userId!, booking.status, status, note);
      await client.query("COMMIT");
      await notify(booking.customer_id, `Booking ${status.replace(/_/g, " ")}`, `${booking.service_name} has been updated by the business.`);
      res.json({ id: booking.id, status });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  app.post("/api/business/bookings/:id/cancel", requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT b.*, s.name AS service_name, ba.owner_user_id
           FROM business_bookings b
           JOIN business_booking_services s ON s.id = b.service_id
           JOIN business_accounts ba ON ba.id = b.business_account_id
          WHERE b.id = $1 AND b.customer_user_id = $2 FOR UPDATE`,
        [Number(req.params.id), req.session.userId],
      );
      if (!current.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Booking not found" });
      }
      const booking = current.rows[0];
      await client.query(`UPDATE business_bookings SET status='cancelled', updated_at=NOW() WHERE id=$1`, [booking.id]);
      await recordEvent(client, booking.id, req.session.userId!, booking.status, "cancelled", text(req.body.note, 1000) || null);
      await client.query("COMMIT");
      await notify(booking.owner_user_id, "Customer cancelled a booking", `${booking.service_name} was cancelled by the customer.`);
      res.json({ id: booking.id, status: "cancelled" });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  app.get("/api/public/businesses/:id/booking", async (req, res) => {
    const businessId = Number(req.params.id);
    const business = await pool.query(
      `SELECT ba.id AS business_account_id, ba.owner_user_id, bp.company_name,
              COALESCE(bp.company_logo, ba.company_logo) AS company_logo,
              bp.industry, bp.service_area, bp.address
         FROM business_accounts ba
         JOIN business_profiles bp ON bp.user_id = ba.owner_user_id
         JOIN business_plans plan ON plan.business_account_id = ba.id
        WHERE ba.id = $1 AND ba.status = 'verified_business'
          AND plan.status IN ('active','trialing','past_due')
          AND (plan.plan_type IN ('business_plus','business_pro') OR plan.offer_key IS NOT NULL)
        LIMIT 1`,
      [businessId],
    );
    if (!business.rows[0]) return res.status(404).json({ message: "Booking is not available for this business" });
    const services = await pool.query(
      `SELECT id, name, description, confirmation_mode, pricing_mode, price_cents, duration_minutes,
              fulfillment_mode, location_text, service_area, availability_mode, availability_json,
              booking_window_days, lead_time_hours
         FROM business_booking_services
        WHERE business_account_id = $1 AND active = true
        ORDER BY created_at ASC`,
      [businessId],
    );
    res.json({ business: business.rows[0], services: services.rows });
  });

  app.post("/api/public/businesses/:id/booking", requireAuth, async (req, res) => {
    const businessId = Number(req.params.id);
    const customerId = req.session.userId!;
    const serviceId = Number(req.body.serviceId);
    const serviceResult = await pool.query(
      `SELECT s.*, ba.owner_user_id, ba.status AS business_status, plan.plan_type, plan.status AS plan_status, plan.offer_key
         FROM business_booking_services s
         JOIN business_accounts ba ON ba.id = s.business_account_id
         JOIN business_plans plan ON plan.business_account_id = ba.id
        WHERE s.id=$1 AND s.business_account_id=$2 AND s.active=true AND ba.status='verified_business'
          AND plan.status IN ('active','trialing','past_due')
          AND (plan.plan_type IN ('business_plus','business_pro') OR plan.offer_key IS NOT NULL)
        LIMIT 1`,
      [serviceId, businessId],
    );
    const service = serviceResult.rows[0];
    if (!service) return res.status(404).json({ message: "Service is no longer available" });
    if (Number(service.owner_user_id) === customerId) return res.status(400).json({ message: "A business cannot book its own service" });
    const start = parseDate(req.body.requestedStartAt);
    if (req.body.requestedStartAt && !start) return res.status(400).json({ message: "Choose a valid requested date and time" });
    if (service.confirmation_mode === "instant" && !start) return res.status(400).json({ message: "Instant bookings need a requested date and time" });
    const now = Date.now();
    if (start && start.getTime() < now + Number(service.lead_time_hours || 0) * 3600000) {
      return res.status(400).json({ message: `This service needs ${service.lead_time_hours} hours notice` });
    }
    if (start && start.getTime() > now + Number(service.booking_window_days || 30) * 86400000) {
      return res.status(400).json({ message: "That date is outside this service's booking window" });
    }
    const durationMinutes = Number(service.duration_minutes || 60);
    const end = start ? new Date(start.getTime() + durationMinutes * 60000) : null;
    const status = service.confirmation_mode === "instant" ? "confirmed" : "requested";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT pg_advisory_xact_lock($1)`, [serviceId]);
      if (status === "confirmed" && start && end) {
        const conflict = await client.query(
          `SELECT 1 FROM business_bookings
            WHERE service_id=$1 AND status IN ('requested','confirmed','reschedule_proposed')
              AND requested_start_at < $3 AND COALESCE(requested_end_at, requested_start_at) > $2
            LIMIT 1`,
          [serviceId, start, end],
        );
        if (conflict.rows[0]) {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "That time is no longer available. Please choose another time." });
        }
      }
      const inserted = await client.query(
        `INSERT INTO business_bookings
          (business_account_id, service_id, customer_user_id, requested_start_at, requested_end_at,
           customer_timezone, customer_note, customer_location, status, quoted_price_cents)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, status`,
        [businessId, serviceId, customerId, start, end, text(req.body.customerTimezone, 80) || null,
          text(req.body.customerNote, 2000) || null, text(req.body.customerLocation, 500) || null,
          status, service.pricing_mode === "fixed" ? service.price_cents : null],
      );
      await recordEvent(client, inserted.rows[0].id, customerId, null, status, null);
      await client.query("COMMIT");
      await notify(service.owner_user_id, status === "confirmed" ? "New booking confirmed" : "New booking request", `${service.name} has a new customer booking.`);
      res.status(201).json(inserted.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });
}