// Regression coverage for the provider service catalog.
//
// These tests mount the real service-offer route handlers with a small in-memory
// query double. That keeps the assertions focused on the SQL filters, public
// serializer, identity/credential gates, and request handoff without touching a
// development database or Stripe.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import session from "express-session";
import supertest from "supertest";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({ pool: { query: queryMock } }));

import { registerServiceOfferRoutes } from "../service-offers";

type OfferRow = Record<string, any>;

const PROVIDER_ID = 101;
const CUSTOMER_ID = 202;
const ADMIN_ID = 303;

function makeOffer(overrides: Partial<OfferRow> = {}): OfferRow {
  return {
    id: 77,
    provider_user_id: PROVIDER_ID,
    title: "Furniture assembly",
    description: "Reliable assembly for homes. Email provider@example.com for details.",
    category: "General Labor",
    service_type: "Assembly",
    service_class: "general",
    capabilities: ["Flat-pack assembly", "Careful cleanup"],
    equipment: ["Hand tools"],
    pricing_type: "starting_at",
    starting_price: 75,
    hourly_rate: null,
    service_radius: 25,
    zip: "90210",
    lat: 34.0522,
    lng: -118.2437,
    available_now: true,
    provider_available: true,
    status: "published",
    moderation_status: "approved",
    published_at: new Date("2026-08-22T12:00:00.000Z"),
    created_at: new Date("2026-08-20T12:00:00.000Z"),
    updated_at: new Date("2026-08-22T12:00:00.000Z"),
    public_username: "verified_builder",
    guber_id: "GUB-TEST123",
    profile_photo: null,
    rating: 4.8,
    review_count: 12,
    id_verified: true,
    credential_verified: false,
    email: "provider@example.com",
    provider_email: "provider@example.com",
    contact_info: "provider@example.com",
    ...overrides,
  };
}

const offers = new Map<number, OfferRow>();
const userRoles = new Map<number, string>([
  [PROVIDER_ID, "buyer"],
  [CUSTOMER_ID, "buyer"],
  [ADMIN_ID, "admin"],
]);

function installQueryDouble() {
  queryMock.mockImplementation(async (text: string, values: unknown[] = []) => {
    const sql = String(text);

    if (sql.includes("so.status = 'published'")) {
      return {
        rows: [...offers.values()].filter(
          (offer) => offer.status === "published" && offer.moderation_status === "approved",
        ),
      };
    }

    if (sql.includes("SELECT role FROM users")) {
      return { rows: userRoles.has(Number(values[0])) ? [{ role: userRoles.get(Number(values[0])) }] : [] };
    }

    if (sql.startsWith("SELECT so.*")) {
      const offer = offers.get(Number(values[0]));
      return { rows: offer ? [offer] : [] };
    }

    if (sql.startsWith("UPDATE service_offers")) {
      const offerId = Number(values[values.length - 1]);
      const offer = offers.get(offerId);
      if (offer && sql.includes("moderation_status='pending'")) {
        offer.status = "draft";
        offer.moderation_status = "pending";
      } else if (offer && sql.includes("moderation_status='approved'")) {
        offer.status = "published";
        offer.moderation_status = "approved";
      } else if (offer && sql.includes("status='paused'")) {
        offer.status = "paused";
      } else if (offer && sql.includes("status='removed'")) {
        offer.status = "removed";
        offer.moderation_status = "rejected";
      }
      return { rows: [] };
    }

    if (sql.startsWith("INSERT INTO audit_logs")) return { rows: [] };
    throw new Error(`Unexpected query in service-offers test: ${sql}`);
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "service-offers-test-secret",
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false },
    }),
  );

  // The route module receives the same guard contracts as production. The
  // current user is selected per request so each test can exercise a distinct
  // provider/customer identity without relying on a real session store.
  let currentUserId: number | null = null;
  app.use((req, _res, next) => {
    req.session.userId = currentUserId ?? undefined;
    next();
  });

  registerServiceOfferRoutes(app, {
    requireAuth: (req, res, next) => {
      if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
      next();
    },
    requireAdmin: (req, res, next) => {
      if (!req.session.userId || userRoles.get(req.session.userId) !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      next();
    },
    checkSuspended: (_req, _res, next) => next(),
  });

  return {
    app,
    as(userId: number | null) {
      currentUserId = userId;
    },
  };
}

describe("service-offer privacy, verification, and handoff contracts", () => {
  beforeEach(() => {
    offers.clear();
    queryMock.mockReset();
    installQueryDouble();
  });

  it("keeps drafts, paused offers, removed offers, and pending moderation out of discovery", async () => {
    const draft = makeOffer({ id: 1, title: "Private draft", status: "draft" });
    const paused = makeOffer({ id: 2, title: "Paused service", status: "paused" });
    const removed = makeOffer({ id: 3, title: "Removed service", status: "removed" });
    const pending = makeOffer({ id: 4, title: "Pending review", moderation_status: "pending" });
    const published = makeOffer({ id: 5, title: "Public service" });
    [draft, paused, removed, pending, published].forEach((offer) => offers.set(offer.id, offer));

    const { app } = buildApp();
    const res = await supertest(app).get("/api/service-offers");

    expect(res.status).toBe(200);
    expect(res.body.map((offer: OfferRow) => offer.id)).toEqual([published.id]);
    expect(res.body.some((offer: OfferRow) => [draft, paused, removed, pending].some((hidden) => hidden.id === offer.id))).toBe(false);

    const discoveryQuery = queryMock.mock.calls.find(([query]) => String(query).includes("so.status = 'published'"))?.[0];
    expect(String(discoveryQuery)).toContain("so.status = 'published'");
    expect(String(discoveryQuery)).toContain("so.moderation_status = 'approved'");
  });

  it("serializes public offers without contact details or exact location data", async () => {
    const offer = makeOffer();
    offers.set(offer.id, offer);

    const { app } = buildApp();
    const res = await supertest(app).get("/api/service-offers");

    expect(res.status).toBe(200);
    const publicOffer = res.body[0];
    expect(publicOffer).toMatchObject({
      id: offer.id,
      title: offer.title,
      area: "Near 902••",
      provider: {
        id: PROVIDER_ID,
        name: "@verified_builder",
      },
    });
    expect(publicOffer.description).not.toContain("provider@example.com");
    expect(publicOffer).not.toHaveProperty("email");
    expect(publicOffer).not.toHaveProperty("providerEmail");
    expect(publicOffer).not.toHaveProperty("contactInfo");
    expect(publicOffer).not.toHaveProperty("zip");
    expect(publicOffer).not.toHaveProperty("lat");
    expect(publicOffer).not.toHaveProperty("lng");
    expect(publicOffer.provider).not.toHaveProperty("email");
    expect(publicOffer.provider).not.toHaveProperty("contactInfo");
    expect(publicOffer.mapLat).not.toBe(offer.lat);
    expect(publicOffer.mapLng).not.toBe(offer.lng);
  });

  it("requires identity verification before publishing any service offer", async () => {
    const offer = makeOffer({ id: 10, status: "draft", id_verified: false });
    offers.set(offer.id, offer);
    const harness = buildApp();
    harness.as(PROVIDER_ID);

    const res = await supertest(harness.app).post(`/api/service-offers/${offer.id}/publish`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/verify your identity/i);
    expect(queryMock.mock.calls.some(([query]) => String(query).startsWith("UPDATE service_offers"))).toBe(false);
  });

  it("requires a verified credential before publishing Skilled / Pro offers", async () => {
    const offer = makeOffer({
      id: 11,
      category: "Skilled Labor",
      service_class: "skilled_pro",
      status: "draft",
      id_verified: true,
      credential_verified: false,
    });
    offers.set(offer.id, offer);
    const harness = buildApp();
    harness.as(PROVIDER_ID);

    const res = await supertest(harness.app).post(`/api/service-offers/${offer.id}/publish`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/verified credential/i);
    expect(queryMock.mock.calls.some(([query]) => String(query).startsWith("UPDATE service_offers"))).toBe(false);
  });

  it("submits a verified Skilled / Pro offer for moderation without making it public", async () => {
    const offer = makeOffer({
      id: 12,
      category: "Skilled Labor",
      service_class: "skilled_pro",
      status: "draft",
      id_verified: true,
      credential_verified: true,
    });
    offers.set(offer.id, offer);
    const harness = buildApp();
    harness.as(PROVIDER_ID);

    const res = await supertest(harness.app).post(`/api/service-offers/${offer.id}/publish`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("draft");
    expect(res.body.moderationStatus).toBe("pending");
    expect(queryMock.mock.calls.some(([query]) => String(query).startsWith("UPDATE service_offers"))).toBe(true);
    expect(queryMock.mock.calls.some(([query, values]) =>
      String(query).startsWith("INSERT INTO audit_logs") && Array.isArray(values) && values.includes("service_offer_submitted_for_moderation"),
    )).toBe(true);
  });

  it("does not let an admin approve an offer from an unverified provider", async () => {
    const offer = makeOffer({ id: 16, status: "draft", moderation_status: "pending", id_verified: false });
    offers.set(offer.id, offer);
    const harness = buildApp();
    harness.as(ADMIN_ID);

    const response = await supertest(harness.app).patch(`/api/admin/service-offers/${offer.id}`).send({ status: "published" }).expect(400);
    expect(response.body.message).toMatch(/verify their identity/i);
    expect(offer).toMatchObject({ status: "draft", moderation_status: "pending" });
  });

  it("lets only an admin approve a pending offer and makes it publicly discoverable", async () => {
    const offer = makeOffer({ id: 13, status: "draft", moderation_status: "pending" });
    offers.set(offer.id, offer);
    const harness = buildApp();

    harness.as(CUSTOMER_ID);
    await supertest(harness.app).patch(`/api/admin/service-offers/${offer.id}`).send({ status: "published" }).expect(403);
    expect(offer.status).toBe("draft");
    expect(offer.moderation_status).toBe("pending");

    harness.as(ADMIN_ID);
    const approval = await supertest(harness.app).patch(`/api/admin/service-offers/${offer.id}`).send({ status: "published" }).expect(200);
    expect(approval.body).toMatchObject({ status: "published", moderationStatus: "approved" });
    expect(queryMock.mock.calls.some(([query, values]) =>
      String(query).includes("moderation_status='approved'") && Array.isArray(values) && values.includes(offer.id),
    )).toBe(true);
    expect(queryMock.mock.calls.some(([query, values]) =>
      String(query).startsWith("INSERT INTO audit_logs") && Array.isArray(values) && values.includes("service_offer_moderated"),
    )).toBe(true);

    const discovery = await supertest(harness.app).get("/api/service-offers").expect(200);
    expect(discovery.body.map((item: OfferRow) => item.id)).toContain(offer.id);
  });

  it("keeps a pending offer private when an admin removes it and records the decision", async () => {
    const offer = makeOffer({ id: 14, status: "draft", moderation_status: "pending" });
    offers.set(offer.id, offer);
    const harness = buildApp();
    harness.as(ADMIN_ID);

    const removal = await supertest(harness.app).patch(`/api/admin/service-offers/${offer.id}`).send({ status: "removed" }).expect(200);
    expect(removal.body).toMatchObject({ status: "removed", moderationStatus: "rejected" });
    expect(queryMock.mock.calls.some(([query, values]) =>
      String(query).startsWith("INSERT INTO audit_logs") && Array.isArray(values) && values.includes("service_offer_moderated"),
    )).toBe(true);

    const discovery = await supertest(harness.app).get("/api/service-offers").expect(200);
    expect(discovery.body.map((item: OfferRow) => item.id)).not.toContain(offer.id);
  });

  it("requires protected request details before starting a customer service request", async () => {
    const offer = makeOffer({ id: 20, provider_user_id: PROVIDER_ID });
    offers.set(offer.id, offer);
    const harness = buildApp();
    harness.as(CUSTOMER_ID);

    const res = await supertest(harness.app).post(`/api/service-offers/${offer.id}/hire`).send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/scope is required/i);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(String(queryMock.mock.calls[0][0])).toMatch(/^SELECT so\.\*/);
    expect(queryMock.mock.calls.some(([query]) => /\b(INSERT|UPDATE|DELETE)\b/i.test(String(query)))).toBe(false);
  });
});