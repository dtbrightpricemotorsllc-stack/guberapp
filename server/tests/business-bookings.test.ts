import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import supertest from "supertest";

const mockPool = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
}));

const mockStorage = vi.hoisted(() => ({
  getBusinessAccount: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock("../db", () => ({ pool: mockPool }));
vi.mock("../storage", () => ({ storage: mockStorage }));
vi.mock("../business-experience", () => ({ businessPlanHasAccess: () => true }));

import { registerBusinessBookingRoutes } from "../business-bookings";

const CUSTOMER_ID = 41;
const BUSINESS_OWNER_ID = 52;
const BOOKING_ID = 63;
const PROPOSED_START = new Date("2026-09-10T14:00:00.000Z");
const PROPOSED_END = new Date("2026-09-10T15:00:00.000Z");

function buildApp(userId: number | null = CUSTOMER_ID) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { userId };
    next();
  });
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
    next();
  };
  registerBusinessBookingRoutes(app, { requireAuth });
  return app;
}

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    service_id: 81,
    customer_user_id: CUSTOMER_ID,
    owner_user_id: BUSINESS_OWNER_ID,
    service_name: "Home consultation",
    status: "reschedule_proposed",
    proposed_start_at: PROPOSED_START,
    proposed_end_at: PROPOSED_END,
    ...overrides,
  };
}

function transactionClient(row: Record<string, unknown> | null, hasConflict = false) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM business_bookings") && sql.includes("FOR UPDATE")) {
      return { rows: row ? [row] : [] };
    }
    if (sql.includes("SELECT 1") && sql.includes("status = 'confirmed'")) {
      return { rows: hasConflict ? [{ exists: 1 }] : [] };
    }
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  mockPool.connect.mockResolvedValue(client);
  return client;
}

function respond(decision: "accept" | "decline", overrides: Record<string, unknown> = {}) {
  return {
    decision,
    proposedStartAt: PROPOSED_START.toISOString(),
    proposedEndAt: PROPOSED_END.toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStorage.getBusinessAccount.mockResolvedValue({
    id: 70,
    ownerUserId: BUSINESS_OWNER_ID,
    status: "verified_business",
  });
  mockStorage.createNotification.mockResolvedValue(undefined);
  mockPool.query.mockResolvedValue({
    rows: [{ plan_type: "business_plus", status: "active", offer_key: null }],
  });
});

describe("customer booking proposal responses", () => {
  it("requires authentication", async () => {
    await supertest(buildApp(null))
      .post(`/api/business/bookings/${BOOKING_ID}/proposal-response`)
      .send(respond("accept"))
      .expect(401);

    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it("does not reveal or update another customer's booking", async () => {
    const client = transactionClient(null);

    const response = await supertest(buildApp())
      .post(`/api/business/bookings/${BOOKING_ID}/proposal-response`)
      .send(respond("accept"))
      .expect(404);

    expect(response.body).toEqual({ message: "Booking not found" });
    const lockedSelect = client.query.mock.calls.find(([sql]) => String(sql).includes("FOR UPDATE"));
    expect(lockedSelect?.[1]).toEqual([BOOKING_ID, CUSTOMER_ID]);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE business_bookings"))).toBe(false);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it.each([
    ["already changed", { status: "confirmed" }, {}],
    ["missing its proposed end", { proposed_end_at: null }, {}],
    ["changed since the customer loaded it", {}, { proposedStartAt: "2026-09-10T16:00:00.000Z", proposedEndAt: "2026-09-10T17:00:00.000Z" }],
  ])("rejects a stale proposal that is %s", async (_label, rowOverrides, requestOverrides) => {
    const client = transactionClient(bookingRow(rowOverrides));

    const response = await supertest(buildApp())
      .post(`/api/business/bookings/${BOOKING_ID}/proposal-response`)
      .send(respond("accept", requestOverrides))
      .expect(409);

    expect(response.body.message).toContain("no longer available");
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE business_bookings"))).toBe(false);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("atomically accepts the current proposal as the confirmed appointment", async () => {
    const client = transactionClient(bookingRow());

    const response = await supertest(buildApp())
      .post(`/api/business/bookings/${BOOKING_ID}/proposal-response`)
      .send(respond("accept"))
      .expect(200);

    expect(response.body).toEqual({ id: BOOKING_ID, status: "confirmed" });
    const update = client.query.mock.calls.find(([sql]) => String(sql).includes("SET status = 'confirmed'"));
    expect(String(update?.[0])).toContain("requested_start_at = proposed_start_at");
    expect(String(update?.[0])).toContain("requested_end_at = proposed_end_at");
    expect(String(update?.[0])).toContain("proposed_start_at = NULL");
    expect(update?.[1]).toEqual([BOOKING_ID]);
    const event = client.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO business_booking_events"));
    expect(event?.[1]).toEqual([
      BOOKING_ID,
      CUSTOMER_ID,
      "reschedule_proposed",
      "confirmed",
      "Customer accepted the proposed appointment time",
      null,
      null,
    ]);
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.query).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock($1)", [81]);
    expect(client.release).toHaveBeenCalled();
    expect(mockStorage.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: BUSINESS_OWNER_ID,
      title: "Customer accepted the proposed time",
    }));
  });

  it("rejects an accepted proposal when another confirmed booking now occupies the time", async () => {
    const client = transactionClient(bookingRow({ service_id: 81 }), true);

    const response = await supertest(buildApp())
      .post(`/api/business/bookings/${BOOKING_ID}/proposal-response`)
      .send(respond("accept"))
      .expect(409);

    expect(response.body.message).toContain("no longer available");
    expect(client.query).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock($1)", [81]);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("SET status = 'confirmed'"))).toBe(false);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("declines only the proposed time and returns the booking to requested", async () => {
    const client = transactionClient(bookingRow());

    const response = await supertest(buildApp())
      .post(`/api/business/bookings/${BOOKING_ID}/proposal-response`)
      .send(respond("decline"))
      .expect(200);

    expect(response.body).toEqual({ id: BOOKING_ID, status: "requested" });
    const update = client.query.mock.calls.find(([sql]) => String(sql).includes("SET status = 'requested'"));
    expect(String(update?.[0])).toContain("proposed_start_at = NULL");
    expect(String(update?.[0])).not.toContain("requested_start_at =");
    const event = client.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO business_booking_events"));
    expect(event?.[1]).toEqual([
      BOOKING_ID,
      CUSTOMER_ID,
      "reschedule_proposed",
      "requested",
      "Customer declined the proposed appointment time",
      null,
      null,
    ]);
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(mockStorage.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: BUSINESS_OWNER_ID,
      title: "Customer declined the proposed time",
    }));
  });

  it("does not let a business owner accept a proposal on the customer's behalf", async () => {
    const client = transactionClient(bookingRow({ business_account_id: 70 }));

    const response = await supertest(buildApp(BUSINESS_OWNER_ID))
      .patch(`/api/business/bookings/${BOOKING_ID}/status`)
      .send({ status: "confirmed" })
      .expect(409);

    expect(response.body.message).toContain("customer must respond");
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE business_bookings"))).toBe(false);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });
});