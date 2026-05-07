/**
 * End-to-end tests: Task #494 — V&I Satisfied / Request-Retake walkthrough
 *
 * Two layers:
 *  1. Static copy / unauth API gating (cheap smoke).
 *  2. Real seeded walkthrough as the requester:
 *     admin → seed (poster + helper test users, V&I job, proof) →
 *     login-as poster → request retake (no reason on first, reason
 *     mandatory on second) → seed fresh proof → satisfy.
 *
 * The walkthrough exercises gateViReview against the real DB and proves
 * the lifecycle rules the rev-3 review called out:
 *   - first retake works without a reason
 *   - second retake requires a reason (400 when blank)
 *   - retake_requested re-blocks both satisfy and retake (409)
 *   - satisfied is terminal (subsequent satisfy/retake → 409)
 *
 * Prereqs:
 *   STRIPE_SECRET_KEY must NOT start with sk_live_ (admin-qa guard).
 *   Admin demo account: admin@guberapp.com / Bouncer76!
 *   Run:   npx playwright test e2e/vi-retake-flow.spec.ts
 */

import { test, expect, request, type APIRequestContext } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:5000";
const ADMIN_EMAIL = "admin@guberapp.com";
const ADMIN_PASSWORD = "Bouncer76!";

test.describe("Task #494 — V&I positioning sweep", () => {
  // The marketplace + acceptable-use pages are React-rendered, so the SPA
  // shell HTML doesn't contain the copy strings — load them in a real
  // browser so React hydrates first.
  test("marketplace page surfaces visual-proof positioning, no affirmative inspector claims", async ({ page }) => {
    const r = await page.goto("/marketplace");
    if (!r || !r.ok()) test.skip(true, `marketplace page not reachable: ${r?.status()}`);
    await page.waitForLoadState("networkidle");
    const body = (await page.locator("body").innerText()).toLowerCase();
    // Disclaimer language ("not an inspector", "no diagnoses") is allowed
    // because it reinforces positioning. We only ban *affirmative* claims
    // that helpers act as inspectors / diagnose / appraise / test-drive.
    const affirmative = [
      /\bour inspectors?\b/, /\bcertified inspector\b/, /\bgubers? inspector\b/,
      /\bwill diagnose\b/, /\bcan diagnose\b/, /\bhelpers? diagnose\b/,
      /\bofficial appraisal\b/, /\bprovides? appraisal\b/,
      /\b(will|can|do|may) test[- ]drive\b/,
    ];
    for (const re of affirmative) {
      expect(body, `marketplace must not contain affirmative claim ${re}`).not.toMatch(re);
    }
    expect(body).toMatch(/visual proof|eyes on the ground/);
  });

  test("acceptable-use page surfaces visual-proof positioning", async ({ page }) => {
    const r = await page.goto("/acceptable-use");
    if (!r || !r.ok()) test.skip(true, `acceptable-use page not reachable: ${r?.status()}`);
    await page.waitForLoadState("networkidle");
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).toMatch(/visual proof|eyes on the ground/);
  });

  test("retake/satisfy endpoints reject unauthenticated callers", async () => {
    const ctx = await request.newContext({ baseURL: BASE });
    const sat = await ctx.post("/api/proof/999999/satisfy");
    expect([401, 403, 404]).toContain(sat.status());
    const ret = await ctx.post("/api/proof/999999/retake", { data: { reason: "test" } });
    expect([401, 403, 404]).toContain(ret.status());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Real seeded retake/satisfy walkthrough.
// ─────────────────────────────────────────────────────────────────────────────

async function loginApi(ctx: APIRequestContext, email: string, password: string) {
  const r = await ctx.post("/api/auth/login", { data: { email, password } });
  if (!r.ok()) throw new Error(`login ${email} → ${r.status()} ${await r.text().catch(() => "")}`);
  return r;
}

test.describe("Task #494 — V&I Satisfied / Request-Retake seeded walkthrough", () => {
  test("requester can retake (1st no-reason, 2nd reason-required) then satisfy", async () => {
    // ─── 1. Admin login + sandbox seed ──────────────────────────────────────
    const adminCtx = await request.newContext({ baseURL: BASE });
    let adminLogin;
    try {
      adminLogin = await loginApi(adminCtx, ADMIN_EMAIL, ADMIN_PASSWORD);
    } catch (e: any) {
      test.skip(true, `admin login failed (env not seeded?): ${e.message}`);
      return;
    }
    expect(adminLogin.ok()).toBeTruthy();

    // Test-mode guard — skip on prod / live keys.
    const probe = await adminCtx.post("/api/admin/qa/sandbox/personas", { data: { persona: "poster" } });
    if (probe.status() === 403) {
      test.skip(true, "admin-qa sandbox blocked (live Stripe mode) — skipping seeded walkthrough");
      return;
    }
    expect(probe.ok()).toBeTruthy();
    const poster = await probe.json();

    const helperRes = await adminCtx.post("/api/admin/qa/sandbox/personas", { data: { persona: "helper" } });
    expect(helperRes.ok()).toBeTruthy();
    const helper = await helperRes.json();

    const jobRes = await adminCtx.post("/api/admin/qa/sandbox/test-jobs", {
      data: {
        category: "Verify & Inspect",
        verifyInspectCategory: "property",
        posterId: poster.id,
        helperId: helper.id,
      },
    });
    expect(jobRes.ok()).toBeTruthy();
    const job = await jobRes.json();
    expect(job.assignedHelperId).toBe(helper.id);

    const seedProof = async () => {
      const r = await adminCtx.post(`/api/admin/qa/sandbox/test-jobs/${job.id}/seed-proof`, {
        data: { reviewWindowMs: 24 * 60 * 60 * 1000 },
      });
      expect(r.ok(), `seed-proof failed: ${r.status()} ${await r.text()}`).toBeTruthy();
      return r.json();
    };

    let proof = await seedProof();
    expect(proof.reviewDecision).toBe("pending");

    // ─── 2. Login as the poster (admin login-as) ─────────────────────────────
    // login-as mutates the admin session, so swap to a fresh poster context.
    const posterCtx = await request.newContext({ baseURL: BASE });
    await loginApi(posterCtx, poster.email, poster.password);

    // ─── 3. windowOpen=true on a fresh pending proof ────────────────────────
    const stateBefore = await posterCtx.get(`/api/jobs/${job.id}/proof-review-state`);
    expect(stateBefore.ok()).toBeTruthy();
    const sb = await stateBefore.json();
    expect(sb.windowOpen).toBe(true);

    // ─── 4. First retake — no reason needed ─────────────────────────────────
    const retake1 = await posterCtx.post(`/api/proof/${proof.id}/retake`, { data: {} });
    expect(retake1.status(), `retake1: ${await retake1.text()}`).toBe(200);

    // ─── 5. retake_requested re-blocks satisfy AND retake (409) ─────────────
    const blockedSatisfy = await posterCtx.post(`/api/proof/${proof.id}/satisfy`);
    expect(blockedSatisfy.status()).toBe(409);
    const blockedRetake = await posterCtx.post(`/api/proof/${proof.id}/retake`, { data: { reason: "again" } });
    expect(blockedRetake.status()).toBe(409);

    // windowOpen is now false.
    const stateAfter1 = await posterCtx.get(`/api/jobs/${job.id}/proof-review-state`);
    expect((await stateAfter1.json()).windowOpen).toBe(false);

    // ─── 6. Helper resubmits — admin seeds a fresh proof row ────────────────
    proof = await seedProof();
    expect(proof.reviewDecision).toBe("pending");

    // ─── 7. SECOND retake — reason MANDATORY ────────────────────────────────
    const noReason = await posterCtx.post(`/api/proof/${proof.id}/retake`, { data: {} });
    expect(noReason.status(), "second retake should reject blank reason").toBe(400);

    const withReason = await posterCtx.post(`/api/proof/${proof.id}/retake`, {
      data: { reason: "Plate angle is unclear — re-shoot from passenger side." },
    });
    expect(withReason.status(), `retake2: ${await withReason.text()}`).toBe(200);

    // ─── 8. Helper resubmits again — final round, hirer marks satisfied ─────
    proof = await seedProof();
    const sat = await posterCtx.post(`/api/proof/${proof.id}/satisfy`);
    expect(sat.status(), `satisfy: ${await sat.text()}`).toBe(200);

    // satisfied is terminal — both endpoints now reject 409.
    const sat2 = await posterCtx.post(`/api/proof/${proof.id}/satisfy`);
    expect(sat2.status()).toBe(409);
    const ret3 = await posterCtx.post(`/api/proof/${proof.id}/retake`, { data: { reason: "x" } });
    expect(ret3.status()).toBe(409);

    // Final review state reflects the closed window.
    const stateFinal = await posterCtx.get(`/api/jobs/${job.id}/proof-review-state`);
    const sf = await stateFinal.json();
    expect(sf.windowOpen).toBe(false);

    // ─── 9. Cleanup: best-effort sandbox reset ──────────────────────────────
    await adminCtx.post("/api/admin/qa/sandbox/reset", { data: { dryRun: false } }).catch(() => {});
  });
});
