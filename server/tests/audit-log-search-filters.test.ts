// Integration tests for GET /api/admin/audit-logs search filters.
//
// Exercises the real route handler (registerRoutes) against the live PostgreSQL
// database.  Test rows are inserted under a unique per-run prefix and removed
// in afterEach.  Only non-data external dependencies are mocked (Stripe,
// session store, JWT).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";

const ADMIN_ID = 999_999_901;

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockStorage = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("../storage", () => ({ storage: mockStorage }));

vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(_key: string, _opts?: unknown) {}
  },
}));

vi.mock("connect-pg-simple", async () => {
  const session = await import("express-session");
  return { default: () => session.default.MemoryStore };
});

vi.mock("../jwt", () => ({
  generateJWT: vi.fn(),
  verifyJWT: vi.fn().mockReturnValue(null),
}));

// ─── Real DB + routes (not mocked) ───────────────────────────────────────────

import { db } from "../db";
import { sql } from "drizzle-orm";
import { registerRoutes } from "../routes";

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function insertUser(username: string): Promise<number> {
  const result = await db.execute(
    sql`INSERT INTO users (email, password, username, full_name, role)
        VALUES (${username + "@test.invalid"}, 'x', ${username}, ${username}, 'buyer')
        ON CONFLICT (username) DO NOTHING
        RETURNING id`,
  );
  if (result.rows.length > 0) {
    return (result.rows[0] as { id: number }).id;
  }
  const lookup = await db.execute(sql`SELECT id FROM users WHERE username = ${username}`);
  return (lookup.rows[0] as { id: number }).id;
}

async function insertLog(userId: number, action: string, details: string | null = null) {
  await db.execute(
    sql`INSERT INTO audit_logs (user_id, action, details) VALUES (${userId}, ${action}, ${details})`,
  );
}

async function cleanupUsers(usernames: string[]) {
  for (const u of usernames) {
    await db.execute(
      sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username = ${u})`,
    );
    await db.execute(sql`DELETE FROM users WHERE username = ${u}`);
  }
}

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildAgent() {
  const app = express();
  app.use((req, _res, next) => {
    if (!(req as any).session) (req as any).session = {};
    (req as any).session.userId = ADMIN_ID;
    next();
  });
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  return supertest(app);
}

interface LogEntry {
  userId: number;
  action: string;
  details: string | null;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("GET /api/admin/audit-logs — search filter behaviour (real DB)", () => {
  const RUN = `taf_${Date.now()}`;
  const NAMES = {
    alice:   `${RUN}_alice`,
    bob:     `${RUN}_bob`,
    charlie: `${RUN}_charlie`,
    diana:   `${RUN}_diana`,
  };

  let ids: Record<string, number> = {};
  let agent: supertest.SuperTest<supertest.Test>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStorage.getUser.mockResolvedValue({ id: ADMIN_ID, role: "admin" });

    for (const [key, name] of Object.entries(NAMES)) {
      ids[key] = await insertUser(name);
    }

    // Superset: 8 rows across 4 users with varied actions and details.
    await insertLog(ids.alice,   "login",             null);
    await insertLog(ids.alice,   "profile_update",    "email changed");
    await insertLog(ids.bob,     "login",             null);
    await insertLog(ids.bob,     "credential_upload", "passport scan uploaded");
    await insertLog(ids.charlie, "credential_upload", "driver_license front");
    await insertLog(ids.charlie, "logout",            null);
    await insertLog(ids.diana,   "credential_upload", "passport scan uploaded");
    await insertLog(ids.diana,   "signup",            null);

    agent = await buildAgent();
  });

  afterEach(async () => {
    await cleanupUsers(Object.values(NAMES));
  });

  // ── No filter ─────────────────────────────────────────────────────────────

  it("returns all seeded rows when no filters are supplied", async () => {
    const res = await agent.get("/api/admin/audit-logs").expect(200);
    const testIds = new Set(Object.values(ids));
    const seeded = res.body.logs.filter((l: LogEntry) => testIds.has(l.userId));
    expect(seeded).toHaveLength(8);
  });

  // ── Filter by username ────────────────────────────────────────────────────

  it("filter by user=alice returns only alice's rows, excluding bob/charlie/diana", async () => {
    const res = await agent
      .get("/api/admin/audit-logs")
      .query({ user: NAMES.alice })
      .expect(200);

    expect(res.body.logs.length).toBeGreaterThanOrEqual(2);
    expect(res.body.logs.every((l: LogEntry) => l.userId === ids.alice)).toBe(true);
    expect(res.body.logs.some((l: LogEntry) => l.userId === ids.bob)).toBe(false);
    expect(res.body.logs.some((l: LogEntry) => l.userId === ids.charlie)).toBe(false);
    expect(res.body.logs.some((l: LogEntry) => l.userId === ids.diana)).toBe(false);
  });

  it("filter by numeric userId returns all rows for that user ID", async () => {
    const res = await agent
      .get("/api/admin/audit-logs")
      .query({ user: String(ids.charlie) })
      .expect(200);

    // The route ORs ilike(username, '%id%') with eq(userId, id), so other rows
    // may appear if the id digits happen to match a username substring.
    // Assert the important guarantee: charlie's own 2 rows are all present.
    const charlieRows = res.body.logs.filter((l: LogEntry) => l.userId === ids.charlie);
    expect(charlieRows).toHaveLength(2);
  });

  it("filter by user with no match returns an empty result", async () => {
    const res = await agent
      .get("/api/admin/audit-logs")
      .query({ user: `${RUN}_nobody_xyz` })
      .expect(200);

    expect(res.body.logs).toHaveLength(0);
    expect(res.body.hasMore).toBe(false);
  });

  // ── Filter by action ──────────────────────────────────────────────────────

  it("filter by action=login returns only login rows for our test users", async () => {
    const res = await agent
      .get("/api/admin/audit-logs")
      .query({ user: RUN, action: "login" })
      .expect(200);

    expect(res.body.logs.length).toBeGreaterThanOrEqual(2);
    expect(res.body.logs.every((l: LogEntry) => l.action === "login")).toBe(true);
    expect(res.body.logs.some((l: LogEntry) => l.action === "credential_upload")).toBe(false);
  });

  it("filter by action=credential_upload excludes login/signup/logout rows", async () => {
    const res = await agent
      .get("/api/admin/audit-logs")
      .query({ user: RUN, action: "credential_upload" })
      .expect(200);

    expect(res.body.logs).toHaveLength(3);
    expect(res.body.logs.every((l: LogEntry) => l.action === "credential_upload")).toBe(true);
    expect(res.body.logs.some((l: LogEntry) => l.action === "login")).toBe(false);
  });

  it("filter by unrecognised action returns an empty result set", async () => {
    const res = await agent
      .get("/api/admin/audit-logs")
      .query({ action: `nonexistent_${RUN}` })
      .expect(200);

    expect(res.body.logs).toHaveLength(0);
    expect(res.body.hasMore).toBe(false);
  });

  // ── Filter by details ─────────────────────────────────────────────────────

  it("filter by details=passport returns rows containing 'passport', excluding driver_license", async () => {
    const res = await agent
      .get("/api/admin/audit-logs")
      .query({ user: RUN, details: "passport" })
      .expect(200);

    expect(res.body.logs).toHaveLength(2);
    expect(
      res.body.logs.every((l: LogEntry) => l.details?.toLowerCase().includes("passport")),
    ).toBe(true);
    expect(res.body.logs.some((l: LogEntry) => l.userId === ids.charlie)).toBe(false);
  });

  it("filter by details=driver_license returns only charlie's row", async () => {
    const res = await agent
      .get("/api/admin/audit-logs")
      .query({ user: RUN, details: "driver_license" })
      .expect(200);

    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].userId).toBe(ids.charlie);
  });

  it("an unrecognised details value returns an empty result set", async () => {
    const res = await agent
      .get("/api/admin/audit-logs")
      .query({ details: `zzz_no_match_${RUN}` })
      .expect(200);

    expect(res.body.logs).toHaveLength(0);
    expect(res.body.hasMore).toBe(false);
  });

  // ── Combined filters (ANDed) ──────────────────────────────────────────────

  it("user + details AND: diana+passport returns 1 row, excluding bob's matching passport row", async () => {
    // user=diana → 2 rows; details=passport → 2 rows (bob+diana); AND → 1 row (diana only)
    const res = await agent
      .get("/api/admin/audit-logs")
      .query({ user: NAMES.diana, details: "passport" })
      .expect(200);

    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].userId).toBe(ids.diana);
    expect(res.body.logs[0].details).toContain("passport");
  });

  it("user + details AND: returns empty when only one side would match", async () => {
    // user=diana matches 2 rows; details=driver_license matches charlie only → 0 rows
    const res = await agent
      .get("/api/admin/audit-logs")
      .query({ user: NAMES.diana, details: "driver_license" })
      .expect(200);

    expect(res.body.logs).toHaveLength(0);
  });

  it("action + details AND: credential_upload+passport returns 2 rows, excludes charlie's driver_license", async () => {
    const res = await agent
      .get("/api/admin/audit-logs")
      .query({ user: RUN, action: "credential_upload", details: "passport" })
      .expect(200);

    expect(res.body.logs).toHaveLength(2);
    expect(res.body.logs.every((l: LogEntry) => l.action === "credential_upload")).toBe(true);
    expect(
      res.body.logs.every((l: LogEntry) => l.details?.toLowerCase().includes("passport")),
    ).toBe(true);
    expect(res.body.logs.some((l: LogEntry) => l.userId === ids.charlie)).toBe(false);
  });

  // ── Pagination envelope ───────────────────────────────────────────────────

  it("echoes back the offset and limit in the response envelope", async () => {
    const res = await agent
      .get("/api/admin/audit-logs")
      .query({ offset: "10", limit: "25" })
      .expect(200);

    expect(res.body.offset).toBe(10);
    expect(res.body.limit).toBe(25);
  });

  it("caps limit at 500 when a larger value is requested", async () => {
    const res = await agent
      .get("/api/admin/audit-logs")
      .query({ limit: "9999" })
      .expect(200);

    expect(res.body.limit).toBe(500);
  });

  // ── Auth guard ────────────────────────────────────────────────────────────

  it("returns 403 when the authenticated user is not an admin", async () => {
    mockStorage.getUser.mockResolvedValue({ id: ADMIN_ID, role: "user" });
    await agent.get("/api/admin/audit-logs").expect(403);
  });
});
