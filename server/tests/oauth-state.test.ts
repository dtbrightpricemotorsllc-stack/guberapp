import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import session from "express-session";
import supertest from "supertest";
import { handleGoogleAuthStart, validateOAuthState } from "../oauth";

function buildTestApp() {
  const app = express();

  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    })
  );

  app.get("/api/auth/google", handleGoogleAuthStart);

  app.get("/api/auth/google/callback", async (req, res) => {
    const stateResult = validateOAuthState(req);
    if (!stateResult.valid) {
      return res.redirect(
        `/login?error=${stateResult.reason === "invalid_state" ? "invalid_state" : "google_cancelled"}`
      );
    }

    req.session.save((err) => {
      if (err) return res.redirect("/login?error=session_save_failed");
      res.json({ success: true, code: stateResult.code });
    });
  });

  app.get("/api/auth/google/callback/check-state", (req, res) => {
    res.json({ oauthState: (req.session as any).oauthState ?? null });
  });

  return app;
}

function extractStateFromRedirect(location: string): string {
  const url = new URL(location, "http://localhost");
  return url.searchParams.get("state") || "";
}

describe("Google OAuth state validation (production handlers)", () => {
  let app: express.Express;
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    app = buildTestApp();
  });

  afterAll(() => {
    process.env.GOOGLE_CLIENT_ID = originalEnv.GOOGLE_CLIENT_ID;
  });

  describe("GET /api/auth/google (handleGoogleAuthStart)", () => {
    it("should redirect to Google with a state parameter and save state to session", async () => {
      const agent = supertest.agent(app);
      const res = await agent.get("/api/auth/google").expect(302);

      expect(res.headers.location).toContain("accounts.google.com/o/oauth2/v2/auth");
      expect(res.headers.location).toContain("state=");
      expect(res.headers.location).toContain("client_id=test-client-id");

      const state = extractStateFromRedirect(res.headers.location);
      expect(state).toHaveLength(32);
    });

    it("should return 503 when GOOGLE_CLIENT_ID is not set", async () => {
      const savedId = process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_ID;
      try {
        const agent = supertest.agent(app);
        const res = await agent.get("/api/auth/google").expect(503);
        expect(res.body.message).toBe("Google Sign-In not configured");
      } finally {
        process.env.GOOGLE_CLIENT_ID = savedId;
      }
    });
  });

  describe("GET /api/auth/google/callback (validateOAuthState)", () => {
    it("should reject when state query param is missing", async () => {
      const agent = supertest.agent(app);

      await agent.get("/api/auth/google").expect(302);

      const res = await agent
        .get("/api/auth/google/callback?code=test-auth-code")
        .expect(302);

      expect(res.headers.location).toBe("/login?error=invalid_state");
    });

    it("should reject when state does not match session", async () => {
      const agent = supertest.agent(app);

      await agent.get("/api/auth/google").expect(302);

      const res = await agent
        .get("/api/auth/google/callback?code=test-auth-code&state=wrong-state-value")
        .expect(302);

      expect(res.headers.location).toBe("/login?error=invalid_state");
    });

    it("should accept when state matches session state", async () => {
      const agent = supertest.agent(app);

      const initRes = await agent.get("/api/auth/google").expect(302);
      const state = extractStateFromRedirect(initRes.headers.location);

      const res = await agent
        .get(`/api/auth/google/callback?code=test-auth-code&state=${state}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.code).toBe("test-auth-code");
    });

    it("should clear oauthState from session after valid callback (one-time use)", async () => {
      const agent = supertest.agent(app);

      const initRes = await agent.get("/api/auth/google").expect(302);
      const state = extractStateFromRedirect(initRes.headers.location);

      await agent
        .get(`/api/auth/google/callback?code=test-auth-code&state=${state}`)
        .expect(200);

      const checkRes = await agent
        .get("/api/auth/google/callback/check-state")
        .expect(200);

      expect(checkRes.body.oauthState).toBeNull();
    });

    it("should reject a replayed state on second use", async () => {
      const agent = supertest.agent(app);

      const initRes = await agent.get("/api/auth/google").expect(302);
      const state = extractStateFromRedirect(initRes.headers.location);

      await agent
        .get(`/api/auth/google/callback?code=test-auth-code&state=${state}`)
        .expect(200);

      const replayRes = await agent
        .get(`/api/auth/google/callback?code=test-auth-code&state=${state}`)
        .expect(302);

      expect(replayRes.headers.location).toBe("/login?error=invalid_state");
    });

    it("should clear oauthState from session even on invalid state", async () => {
      const agent = supertest.agent(app);

      await agent.get("/api/auth/google").expect(302);

      await agent
        .get("/api/auth/google/callback?code=test-auth-code&state=bad-state")
        .expect(302);

      const checkRes = await agent
        .get("/api/auth/google/callback/check-state")
        .expect(200);

      expect(checkRes.body.oauthState).toBeNull();
    });

    it("should redirect to google_cancelled when error param is present", async () => {
      const agent = supertest.agent(app);

      const res = await agent
        .get("/api/auth/google/callback?error=access_denied")
        .expect(302);

      expect(res.headers.location).toBe("/login?error=google_cancelled");
    });

    it("should redirect to google_cancelled when code is missing", async () => {
      const agent = supertest.agent(app);

      const res = await agent
        .get("/api/auth/google/callback?state=some-state")
        .expect(302);

      expect(res.headers.location).toBe("/login?error=google_cancelled");
    });

    it("should reject when no prior session exists (no oauthState set)", async () => {
      const agent = supertest.agent(app);

      const res = await agent
        .get("/api/auth/google/callback?code=test-auth-code&state=any-state")
        .expect(302);

      expect(res.headers.location).toBe("/login?error=invalid_state");
    });
  });
});
