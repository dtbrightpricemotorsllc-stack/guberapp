/**
 * server/tests/elevenlabs-health-probe.test.ts
 *
 * Verifies that the ElevenLabs ConvAI startup probe result is correctly
 * reflected in the Mission Control AI health group:
 *
 *  - A 404 (wrong workspace) probe → "critical" status in the AI group
 *  - A 401 (missing permissions) probe → "critical" status in the AI group
 *  - A successful probe → "healthy" status in the AI group
 *  - No probe yet (server just started) → "unknown" status in the AI group
 *
 * The test mocks the database and outbound fetch calls so it runs offline
 * without any real infrastructure, but exercises the real production code path
 * (setElevenLabsConvaiProbeResult → checkElevenLabsConvAIKey → runAppHealthChecks).
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ── Env vars that prevent env-only checks from throwing / returning critical ──
// Set before any module is imported so the checks see consistent values.
process.env.NODE_ENV = "test";
process.env.STRIPE_SECRET_KEY            = "sk_test_dummy";
process.env.STRIPE_CONNECT_SECRET_KEY    = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET        = "whsec_test_dummy";
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_test_dummy_connect";
process.env.STRIPE_PAYROLL_TRUST_BOX_PRICE_ID = "price_test_dummy";
process.env.GOOGLE_CLIENT_ID             = "dummy-client-id.apps.googleusercontent.com";
process.env.GOOGLE_GEOCODING_API_KEY     = "dummy-geocoding-key";
process.env.CLOUDINARY_CLOUD_NAME        = "dummy-cloud";
process.env.CLOUDINARY_API_KEY           = "dummy-api-key";
process.env.CLOUDINARY_API_SECRET        = "dummy-api-secret";
process.env.FIREBASE_SERVICE_ACCOUNT     = JSON.stringify({ type: "service_account", project_id: "dummy" });
process.env.VAPID_PUBLIC_KEY             = "dummy-vapid-pub";
process.env.VAPID_PRIVATE_KEY            = "dummy-vapid-priv";
// APNs — deliberately absent so iOS checks return a non-fatal state only

// ── Mock the database module so no real Postgres connection is attempted ──────
vi.mock("../db", () => {
  const mockExecute = vi.fn().mockResolvedValue({
    rows: [
      {
        // covers checkDatabase / checkBackendConnectivity (SELECT 1)
        // covers checkDemoDataIsolation
        total_users: 10, demo_users: 1, demo_jobs: 0,
        // covers checkGuberStudio
        sessions_24h: 5, active_now: 1,
        // covers marketplace, verify_inspect, load_board
        active: 3, sold: 1, new_today: 0, open: 2, accepted: 1,
        completed: 10, disputed: 0,
        // covers studio_generation_log
        gens_24h: 5, credits_24h: 50,
      },
    ],
  });
  return {
    db:   { execute: mockExecute },
    pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  };
});

// ── Mock JAC voice telemetry so checkJacVoice() doesn't read real counters ───
vi.mock("../jac-voice-telemetry", () => ({
  getVoiceHealthStats: vi.fn(() => ({
    sessions: 0,
    connects: 0,
    errors: 0,
    timeouts: 0,
    successRate: 100,
    partialWindow: false,
  })),
}));

// ── Mock drizzle-orm so sql`` template tag doesn't need a real driver ─────────
vi.mock("drizzle-orm", () => ({
  sql: new Proxy(() => ({}), { get: () => () => ({}) }),
  eq: () => ({}),
  and: () => ({}),
  or: () => ({}),
  desc: () => ({}),
  asc: () => ({}),
  count: () => ({}),
  sum: () => ({}),
  avg: () => ({}),
}));

// ── Stub global fetch so no real network calls are made ───────────────────────
// Each URL prefix routes to a canned successful response.
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const href = typeof url === "string" ? url : url instanceof URL ? url.href : (url as Request).url;

      // Google OIDC discovery
      if (href.includes("accounts.google.com")) {
        return new Response("{}", { status: 200 });
      }
      // Google Maps / Geocoding
      if (href.includes("maps.googleapis.com")) {
        return new Response(JSON.stringify({ status: "OK", results: [] }), { status: 200 });
      }
      // Stripe
      if (href.includes("api.stripe.com")) {
        return new Response(
          JSON.stringify({ available: [{ amount: 0, currency: "usd" }], livemode: false }),
          { status: 200 },
        );
      }
      // Cloudinary
      if (href.includes("cloudinary.com")) {
        return new Response(
          JSON.stringify({ storage: { used_percent: 5.0 } }),
          { status: 200 },
        );
      }
      // Fallback — return 200 so unknown URLs don't cause critical failures
      return new Response("{}", { status: 200 });
    }),
  );
});

// Import the modules under test AFTER mocks are in place.
import { setElevenLabsConvaiProbeResult, runAppHealthChecks } from "../os/health-checks";

// ── Helper ────────────────────────────────────────────────────────────────────

/** Extract the elevenlabs_convai_key check from the AI group. */
async function getElevenLabsCheck() {
  const report = await runAppHealthChecks();
  const aiGroup = report.groups.find((g) => g.id === "ai");
  expect(aiGroup, "AI health group must exist in the report").toBeDefined();
  const check = aiGroup!.checks.find((c) => c.key === "elevenlabs_convai_key");
  expect(check, 'AI group must contain an "elevenlabs_convai_key" check').toBeDefined();
  return check!;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ElevenLabs ConvAI probe → Mission Control AI health group", () => {
  beforeEach(() => {
    // Reset to unchecked before each scenario so state doesn't bleed between tests.
    setElevenLabsConvaiProbeResult({
      status: "unchecked",
      detail: "Startup probe has not run yet.",
    });
  });

  it('reports "unknown" when the probe has not run yet (server just booted)', async () => {
    const check = await getElevenLabsCheck();
    expect(check.status).toBe("unknown");
  });

  it('reports "healthy" when the startup probe received a 200 OK from ElevenLabs', async () => {
    setElevenLabsConvaiProbeResult({
      status: "ok",
      detail: "ConvAI signed-URL endpoint returned 200 OK",
    });

    const check = await getElevenLabsCheck();
    expect(check.status).toBe("healthy");
    expect(check.value).toMatch(/valid/i);
  });

  it('reports "critical" when the API key belongs to the wrong ElevenLabs workspace (404)', async () => {
    setElevenLabsConvaiProbeResult({
      status: "wrong_workspace",
      detail: "ELEVENLABS_API_KEY is from the wrong workspace — agent not found",
    });

    const check = await getElevenLabsCheck();
    expect(check.status).toBe("critical");
    expect(check.detail).toMatch(/wrong workspace/i);
    expect(check.recommendedAction).toMatch(/workspace/i);
  });

  it('reports "critical" when the API key is missing the convai_write scope (401)', async () => {
    setElevenLabsConvaiProbeResult({
      status: "missing_permissions",
      detail: "ELEVENLABS_API_KEY is missing convai_write scope — signed URLs will fail",
    });

    const check = await getElevenLabsCheck();
    expect(check.status).toBe("critical");
    expect(check.detail).toMatch(/convai_write/i);
    expect(check.recommendedAction).toMatch(/convai_write/i);
  });

  it('reports "critical" for a generic probe error (network timeout, bad env var, etc.)', async () => {
    setElevenLabsConvaiProbeResult({
      status: "error",
      detail: "ELEVENLABS_API_KEY is not set — voice will be unavailable",
    });

    const check = await getElevenLabsCheck();
    expect(check.status).toBe("critical");
  });

  it("increments the overall criticalCount when the probe is in a bad state", async () => {
    setElevenLabsConvaiProbeResult({
      status: "wrong_workspace",
      detail: "ELEVENLABS_API_KEY is from the wrong workspace — agent not found",
    });

    const report = await runAppHealthChecks();
    expect(report.criticalCount).toBeGreaterThan(0);
  });

  it("does not add to criticalCount when the probe is healthy", async () => {
    setElevenLabsConvaiProbeResult({
      status: "ok",
      detail: "ConvAI signed-URL endpoint returned 200 OK",
    });

    // Collect baseline critical count without the ElevenLabs probe contributing
    const reportOk = await runAppHealthChecks();
    const checkOk = reportOk.groups
      .find((g) => g.id === "ai")!
      .checks.find((c) => c.key === "elevenlabs_convai_key")!;

    expect(checkOk.status).toBe("healthy");

    // Now flip to wrong_workspace and confirm criticalCount goes up
    setElevenLabsConvaiProbeResult({
      status: "wrong_workspace",
      detail: "ELEVENLABS_API_KEY is from the wrong workspace — agent not found",
    });

    const reportBad = await runAppHealthChecks();
    expect(reportBad.criticalCount).toBeGreaterThan(reportOk.criticalCount);
  });
});
