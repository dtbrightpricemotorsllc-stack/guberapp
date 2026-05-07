import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
// IMPORT the real production middleware so tests cover what actually runs.
import { requireStripeTestMode, requireLiveConfirmation } from "../admin-qa-guards";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post("/sandbox", requireStripeTestMode, (_req, res) => res.json({ ok: true }));
  app.post("/live", requireLiveConfirmation, (_req, res) => res.json({ ok: true }));
  return app;
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_STRIPE = process.env.STRIPE_SECRET_KEY;
const ORIGINAL_STRIPE_CONNECT = process.env.STRIPE_CONNECT_SECRET_KEY;

beforeEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_CONNECT_SECRET_KEY;
});
afterEach(() => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_STRIPE === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = ORIGINAL_STRIPE;
  if (ORIGINAL_STRIPE_CONNECT === undefined) delete process.env.STRIPE_CONNECT_SECRET_KEY;
  else process.env.STRIPE_CONNECT_SECRET_KEY = ORIGINAL_STRIPE_CONNECT;
});

describe("QA Dashboard — sandbox safety guard (real middleware)", () => {
  it("refuses sandbox writes when a live Stripe key is loaded", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_FAKE_LIVE_KEY";
    const res = await request(buildApp()).post("/sandbox").send({});
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/refuse to run/i);
  });

  it("refuses sandbox writes when STRIPE_CONNECT_SECRET_KEY is live too", async () => {
    process.env.STRIPE_CONNECT_SECRET_KEY = "sk_live_FAKE";
    const res = await request(buildApp()).post("/sandbox").send({});
    expect(res.status).toBe(403);
  });

  it("permits sandbox writes when Stripe is in test mode", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_FAKE";
    const res = await request(buildApp()).post("/sandbox").send({});
    expect(res.status).toBe(200);
  });

  it("permits sandbox writes when no Stripe key is configured at all", async () => {
    const res = await request(buildApp()).post("/sandbox").send({});
    expect(res.status).toBe(200);
  });
});

describe("QA Dashboard — live-confirm guard (real middleware)", () => {
  it("refuses live actions in non-production NODE_ENV even with the magic header", async () => {
    process.env.NODE_ENV = "development";
    const res = await request(buildApp())
      .post("/live")
      .set("x-live-confirm", "LIVE")
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/production/i);
  });

  it("requires the magic header in production", async () => {
    process.env.NODE_ENV = "production";
    const res = await request(buildApp()).post("/live").send({});
    expect(res.status).toBe(412);
    expect(res.body.message).toMatch(/x-live-confirm/i);
  });

  it("permits live actions only with NODE_ENV=production AND header set", async () => {
    process.env.NODE_ENV = "production";
    const res = await request(buildApp())
      .post("/live")
      .set("x-live-confirm", "LIVE")
      .send({});
    expect(res.status).toBe(200);
  });

  it("rejects body.confirm fallback — header is the only accepted signal", async () => {
    process.env.NODE_ENV = "production";
    const res = await request(buildApp())
      .post("/live")
      .send({ confirm: "LIVE" });
    expect(res.status).toBe(412);
  });
});
