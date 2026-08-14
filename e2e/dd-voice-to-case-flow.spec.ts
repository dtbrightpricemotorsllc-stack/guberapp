/**
 * DD Voice-to-Case Flow — API-level regression test
 *
 * Confirms the full JAC → D.D. handoff cannot silently fail mid-formation:
 *   create_dd_case → get_dd_state → mark_dd_step_complete (all steps) → return_from_dd_to_jac
 *
 * Uses Playwright's request API (no browser). A shared APIRequestContext logs in
 * once in beforeAll so every action call carries the real session cookie that
 * get_dd_state / mark_dd_step_complete require.
 *
 * DB is accessed directly via pg to enable dd_launch_unlocked for the demo user
 * and to verify row state after mutations.
 *
 * Exit criteria:
 *   - Each action returns success: true with the correct shape
 *   - step_index advances after each mark_dd_step_complete call
 *   - all_done fires correctly on the final step
 *   - DB row transitions from active → completed
 *   - return_from_dd_to_jac always succeeds
 */

import { test, expect, request as playwrightRequest } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import pg from "pg";

const BASE_URL = "http://localhost:5000";
const DEMO_EMAIL = "demo.consumer@guberapp.internal";
const DEMO_PASSWORD = "GuberDemo2026!";

// ── DB helpers ────────────────────────────────────────────────────────────────

function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — cannot run DD flow test");
  return new pg.Pool({ connectionString: url, max: 2 });
}

async function getUserId(pool: pg.Pool, email: string): Promise<number> {
  const res = await pool.query<{ id: number }>(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );
  if (!res.rows.length) throw new Error(`Demo user not found: ${email}`);
  return res.rows[0].id;
}

async function enableDdUnlock(pool: pg.Pool, userId: number): Promise<void> {
  await pool.query(
    `UPDATE users SET dd_launch_unlocked = TRUE WHERE id = $1`,
    [userId]
  );
}

async function cleanDdCases(pool: pg.Pool, userId: number): Promise<void> {
  await pool.query(
    `DELETE FROM dd_cases WHERE user_id = $1 AND business_name = $2`,
    [userId, "__dd_voice_flow_test__"]
  );
}

async function getDdCaseFromDb(
  pool: pg.Pool,
  userId: number,
  caseId: number
): Promise<{ status: string; step_index: number; steps: any[] } | null> {
  const res = await pool.query(
    `SELECT status, step_index, steps FROM dd_cases WHERE id = $1 AND user_id = $2`,
    [caseId, userId]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
    status: row.status,
    step_index: row.step_index,
    steps: Array.isArray(row.steps) ? row.steps : [],
  };
}

// ── Action helper ─────────────────────────────────────────────────────────────

async function jacAction(
  ctx: APIRequestContext,
  action: string,
  userId: number,
  data: Record<string, unknown> = {}
) {
  const secret = process.env.GUBER_SHARED_SECRET;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["x-guber-secret"] = secret;

  const res = await ctx.post(`${BASE_URL}/api/jac/action`, {
    headers,
    data: { action, user_id: userId, data },
  });
  expect(res.status(), `HTTP status for action "${action}" should be 2xx`).toBeLessThan(300);
  return res.json();
}

// ── Shared state (set up once in beforeAll) ───────────────────────────────────

let pool: pg.Pool;
let userId: number;
let apiCtx: APIRequestContext; // logged-in context shared across all tests
let caseId: number;
let totalSteps: number;

test.beforeAll(async () => {
  // 1. DB setup
  pool = makePool();
  userId = await getUserId(pool, DEMO_EMAIL);
  await enableDdUnlock(pool, userId);
  await cleanDdCases(pool, userId);

  // 2. Create a persistent APIRequestContext and log in so every subsequent
  //    request carries the real session cookie.  get_dd_state and
  //    mark_dd_step_complete both gate on req.session.userId being present.
  apiCtx = await playwrightRequest.newContext({ baseURL: BASE_URL });
  const loginRes = await apiCtx.post(`${BASE_URL}/api/auth/login`, {
    data: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  expect(
    loginRes.status(),
    `Login should succeed — got ${loginRes.status()}`
  ).toBeLessThan(300);
});

test.afterAll(async () => {
  await cleanDdCases(pool, userId);
  await apiCtx.dispose();
  await pool.end();
});

// ── Tests run sequentially (workers: 1 in playwright.config.ts) ───────────────

test("create_dd_case returns success with case_id and step_index 0", async () => {
  const body = await jacAction(apiCtx, "create_dd_case", userId, {
    business_type: "LLC",
    business_name: "__dd_voice_flow_test__",
    state: "ALABAMA",
  });

  expect(body.success, "success must be true").toBe(true);
  expect(body.result).toBeDefined();
  expect(typeof body.result.case_id, "case_id must be a number").toBe("number");
  expect(body.result.step_index).toBe(0);
  expect(body.result.total_steps).toBeGreaterThan(0);
  expect(body.result.current_step).toBeDefined();
  expect(typeof body.result.current_step.id).toBe("string");

  // Stash for subsequent tests
  caseId = body.result.case_id;
  totalSteps = body.result.total_steps;
});

test("DB row exists with status active and step_index 0 after create", async () => {
  const row = await getDdCaseFromDb(pool, userId, caseId);
  expect(row, "dd_cases row must exist").not.toBeNull();
  expect(row!.status).toBe("active");
  expect(row!.step_index).toBe(0);
  expect(row!.steps.length).toBe(totalSteps);
});

test("get_dd_state returns active case with correct shape", async () => {
  const body = await jacAction(apiCtx, "get_dd_state", userId);

  expect(body.success).toBe(true);
  expect(body.result.case_id).toBe(caseId);
  expect(body.result.step_index).toBe(0);
  expect(body.result.total_steps).toBe(totalSteps);
  expect(body.result.status).toBe("active");
  expect(body.result.current_step).toBeDefined();
  expect(body.result.collected_fields).toBeDefined();
});

test("mark_dd_step_complete advances step_index from 0 to 1", async () => {
  const body = await jacAction(apiCtx, "mark_dd_step_complete", userId, {
    case_id: caseId,
  });

  expect(body.success).toBe(true);
  expect(body.result.case_id).toBe(caseId);
  expect(body.result.step_index).toBe(1);
  expect(body.result.all_done).toBe(false);
  expect(body.result.next_step).toBeDefined();
  expect(body.result.total_steps).toBe(totalSteps);
});

test("mark_dd_step_complete advances through all remaining steps and fires all_done on final step", async () => {
  // Steps 2 .. totalSteps (index 1 already advanced above)
  let lastBody: any;
  for (let i = 1; i < totalSteps; i++) {
    lastBody = await jacAction(apiCtx, "mark_dd_step_complete", userId, {
      case_id: caseId,
    });
    expect(lastBody.success, `step ${i + 1} mark should succeed`).toBe(true);
    expect(lastBody.result.case_id).toBe(caseId);
    expect(typeof lastBody.result.step_index).toBe("number");

    const isLast = i === totalSteps - 1;
    if (!isLast) {
      expect(lastBody.result.all_done, "all_done must be false before the final step").toBe(false);
    } else {
      expect(lastBody.result.all_done, "all_done must be true on the final step").toBe(true);
    }
  }
});

test("DB row transitions to completed after all steps are marked", async () => {
  const row = await getDdCaseFromDb(pool, userId, caseId);
  expect(row, "dd_cases row must exist").not.toBeNull();
  expect(row!.status).toBe("completed");
  const incomplete = row!.steps.filter((s: any) => !s.completed);
  expect(incomplete.length).toBe(0);
});

test("return_from_dd_to_jac returns success and navigates back to home", async () => {
  const body = await jacAction(apiCtx, "return_from_dd_to_jac", userId);
  expect(body.success).toBe(true);
  expect(body.nav).toBe("/");
});

test("get_dd_state reflects completed status after the flow finishes", async () => {
  const body = await jacAction(apiCtx, "get_dd_state", userId);
  expect(body.success).toBe(true);
  expect(body.result.case_id).toBe(caseId);
  expect(body.result.status).toBe("completed");
  expect(body.result.completed_steps).toBe(totalSteps);
});
