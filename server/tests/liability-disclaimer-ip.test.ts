// Integration test for POST /api/users/me/accept-liability-disclaimer.
//
// This test exercises the REAL route registered by registerRoutes() — no
// route logic is duplicated inside the test itself.  The storage singleton
// and the heavy infrastructure dependencies (DB pool, Stripe, PgSession) are
// replaced by Vitest mocks so the suite is self-contained and never touches
// a real database.
//
// Authentication is handled via the Bearer-token middleware already wired into
// registerRoutes(): a mocked verifyJWT returns a valid payload for the single
// hard-coded test token, so no real JWT_SECRET is needed.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";

// ─── Constants ────────────────────────────────────────────────────────────────
const USER_ID = 42;
const FAKE_JWT = "test-only-bearer-token";

// ─── Module mocks (hoisted by Vitest before any imports) ─────────────────────

// vi.hoisted() ensures mockStorage is available inside the vi.mock() factory
// even though vi.mock() calls are hoisted to the very top of the file.
const mockStorage = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  createAuditLog: vi.fn(),
}));

// Capture every createAuditLog call made by the real route handler.
vi.mock("../storage", () => ({ storage: mockStorage }));

// Prevent real PostgreSQL connections from the `pool` and `db` exports.
vi.mock("../db", () => ({
  pool: { on: vi.fn(), query: vi.fn(), connect: vi.fn() },
  db: {},
}));

// The Stripe SDK is instantiated at module-load time in routes.ts (lines
// 102–103). Replacing the constructor prevents "Invalid API key" errors.
vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(_key: string, _opts?: any) {}
  },
}));

// Use express-session's built-in MemoryStore instead of connect-pg-simple's
// PostgreSQL-backed store so the test never needs a live DB connection.
// connect-pg-simple returns a factory: (session) => StoreClass, so we return
// a factory that ignores its argument and hands back MemoryStore.
vi.mock("connect-pg-simple", async () => {
  const sessionModule = await import("express-session");
  return {
    default: () => sessionModule.default.MemoryStore,
  };
});

// Control JWT verification: only the hard-coded FAKE_JWT is treated as valid.
// This also avoids the JWT_SECRET environment-variable check in server/jwt.ts.
vi.mock("../jwt", () => ({
  generateJWT: vi.fn(),
  verifyJWT: (token: string) =>
    token === FAKE_JWT ? { sub: USER_ID, email: "rider@example.com" } : null,
}));

// ─── Import the real route registration function ───────────────────────────
import { registerRoutes } from "../routes";

// ─── Test suite ────────────────────────────────────────────────────────────
describe("POST /api/users/me/accept-liability-disclaimer — IP address audit logging", () => {
  let agent: ReturnType<typeof supertest.agent>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: user exists and has not yet accepted the disclaimer.
    mockStorage.getUser.mockResolvedValue({
      id: USER_ID,
      email: "rider@example.com",
      liabilityDisclaimerAcceptedAt: null,
    });
    mockStorage.updateUser.mockResolvedValue(undefined);
    mockStorage.createAuditLog.mockResolvedValue({ id: 1 });

    const app = express();
    const httpServer = createServer(app);
    await registerRoutes(httpServer, app);
    agent = supertest.agent(app);
  });

  it("records the IP address from x-forwarded-for in the audit log", async () => {
    const res = await agent
      .post("/api/users/me/accept-liability-disclaimer")
      .set("Authorization", `Bearer ${FAKE_JWT}`)
      .set("x-forwarded-for", "203.0.113.55")
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockStorage.createAuditLog).toHaveBeenCalledOnce();

    const [logData] = mockStorage.createAuditLog.mock.calls[0];
    expect(logData.action).toBe("liability_disclaimer_accepted");
    expect(logData.ipAddress).toBe("203.0.113.55");
    expect(logData.userId).toBe(USER_ID);
  });

  it("uses only the first IP when x-forwarded-for is a proxy chain", async () => {
    await agent
      .post("/api/users/me/accept-liability-disclaimer")
      .set("Authorization", `Bearer ${FAKE_JWT}`)
      .set("x-forwarded-for", "198.51.100.7, 10.0.0.1, 172.16.0.5")
      .expect(200);

    const [logData] = mockStorage.createAuditLog.mock.calls[0];
    expect(logData.ipAddress).toBe("198.51.100.7");
  });

  it("does not write an audit log row when the disclaimer was already accepted", async () => {
    mockStorage.getUser.mockResolvedValue({
      id: USER_ID,
      email: "rider@example.com",
      liabilityDisclaimerAcceptedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const res = await agent
      .post("/api/users/me/accept-liability-disclaimer")
      .set("Authorization", `Bearer ${FAKE_JWT}`)
      .set("x-forwarded-for", "203.0.113.99")
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockStorage.createAuditLog).not.toHaveBeenCalled();
  });

  it("returns 401 when no auth token is provided", async () => {
    await agent
      .post("/api/users/me/accept-liability-disclaimer")
      .expect(401);

    expect(mockStorage.createAuditLog).not.toHaveBeenCalled();
  });
});
