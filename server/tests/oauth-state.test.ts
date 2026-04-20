import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import session from "express-session";
import supertest from "supertest";
import { handleGoogleAuthStart, validateOAuthState, isAllowedReturnTo } from "../oauth";

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
    const stateResult = validateOAuthState(req, res);
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
      // State is now a base64url-encoded JSON payload — length is >32.
      expect(typeof state).toBe("string");
      expect(state.length).toBeGreaterThan(32);
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

describe("isAllowedReturnTo — returnTo allowlist validation", () => {
  it("allows exact known paths", () => {
    expect(isAllowedReturnTo("/dashboard")).toBe(true);
    expect(isAllowedReturnTo("/browse-jobs")).toBe(true);
    expect(isAllowedReturnTo("/post-job")).toBe(true);
    expect(isAllowedReturnTo("/my-jobs")).toBe(true);
    expect(isAllowedReturnTo("/profile")).toBe(true);
    expect(isAllowedReturnTo("/account-settings")).toBe(true);
    expect(isAllowedReturnTo("/notifications")).toBe(true);
    expect(isAllowedReturnTo("/wallet")).toBe(true);
    expect(isAllowedReturnTo("/marketplace")).toBe(true);
    expect(isAllowedReturnTo("/marketplace-preview")).toBe(true);
    expect(isAllowedReturnTo("/map")).toBe(true);
    expect(isAllowedReturnTo("/resume")).toBe(true);
    expect(isAllowedReturnTo("/submit-observation")).toBe(true);
    expect(isAllowedReturnTo("/observations")).toBe(true);
  });

  it("allows paths that start with a known prefix", () => {
    expect(isAllowedReturnTo("/biz/dashboard")).toBe(true);
    expect(isAllowedReturnTo("/biz/post-job")).toBe(true);
    expect(isAllowedReturnTo("/jobs/42")).toBe(true);
    expect(isAllowedReturnTo("/profile/123")).toBe(true);
    expect(isAllowedReturnTo("/worker-clipboard/abc")).toBe(true);
    expect(isAllowedReturnTo("/cash-drop/99")).toBe(true);
    expect(isAllowedReturnTo("/resume/456")).toBe(true);
  });

  it("rejects paths not in the allowlist", () => {
    expect(isAllowedReturnTo("/unknown-page")).toBe(false);
    expect(isAllowedReturnTo("/evil")).toBe(false);
    expect(isAllowedReturnTo("/login")).toBe(false);
    expect(isAllowedReturnTo("/signup")).toBe(false);
    expect(isAllowedReturnTo("/auth-success")).toBe(false);
  });

  it("rejects boundary-bypass attempts where a known prefix is only a substring", () => {
    expect(isAllowedReturnTo("/dashboard-evil")).toBe(false);
    expect(isAllowedReturnTo("/admin123")).toBe(false);
    expect(isAllowedReturnTo("/marketplace-extra")).toBe(false);
    expect(isAllowedReturnTo("/marketplace-preview-extra")).toBe(false);
    expect(isAllowedReturnTo("/administer")).toBe(false);
    expect(isAllowedReturnTo("/walletx")).toBe(false);
    expect(isAllowedReturnTo("/observationsxyz")).toBe(false);
  });

  it("rejects dot-segment traversal attempts", () => {
    expect(isAllowedReturnTo("/dashboard/../../login")).toBe(false);
    expect(isAllowedReturnTo("/biz/../../../etc/passwd")).toBe(false);
    expect(isAllowedReturnTo("/dashboard/../signup")).toBe(false);
    expect(isAllowedReturnTo("/jobs/42/../../admin")).toBe(false);
  });

  it("rejects percent-encoded traversal and slash attempts", () => {
    expect(isAllowedReturnTo("/dashboard%2f..%2flogin")).toBe(false);
    expect(isAllowedReturnTo("/dashboard%2F%2Fevil")).toBe(false);
    expect(isAllowedReturnTo("/%2e%2e/login")).toBe(false);
  });

  it("rejects external URLs even if they start with a slash-like pattern", () => {
    expect(isAllowedReturnTo("//evil.com/dashboard")).toBe(false);
    expect(isAllowedReturnTo("https://evil.com/dashboard")).toBe(false);
    expect(isAllowedReturnTo("http://evil.com/biz/dashboard")).toBe(false);
  });

  it("rejects empty string and non-string-like values", () => {
    expect(isAllowedReturnTo("")).toBe(false);
    expect(isAllowedReturnTo("dashboard")).toBe(false);
  });

  it("rejects disallowed returnTo during OAuth flow start", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    const app = buildTestApp();
    const agent = supertest.agent(app);

    const res = await agent
      .get("/api/auth/google?returnTo=%2Fevil-path")
      .expect(302);

    expect(res.headers.location).toContain("accounts.google.com");

    const state = extractStateFromRedirect(res.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    expect(callbackRes.body.success).toBe(true);
  });

  it("disallowed returnTo is excluded from the OAuth state payload (callback receives null)", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";

    const app2 = express();
    app2.use(session({ secret: "test-secret", resave: false, saveUninitialized: false, cookie: { secure: false } }));
    app2.get("/api/auth/google", handleGoogleAuthStart);
    app2.get("/api/auth/google/callback", (req, res) => {
      const result = validateOAuthState(req, res);
      if (!result.valid) return res.redirect("/login?error=invalid_state");
      res.json({ returnTo: result.returnTo });
    });

    const agent = supertest.agent(app2);
    const initRes = await agent.get("/api/auth/google?returnTo=%2Fevil-redirect").expect(302);
    const state = extractStateFromRedirect(initRes.headers.location);
    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    expect(callbackRes.body.returnTo).toBeNull();
  });

  it("allowed returnTo is embedded in the OAuth state payload (callback receives it)", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";

    const app3 = express();
    app3.use(session({ secret: "test-secret", resave: false, saveUninitialized: false, cookie: { secure: false } }));
    app3.get("/api/auth/google", handleGoogleAuthStart);
    app3.get("/api/auth/google/callback", (req, res) => {
      const result = validateOAuthState(req, res);
      if (!result.valid) return res.redirect("/login?error=invalid_state");
      res.json({ returnTo: result.returnTo });
    });

    const agent = supertest.agent(app3);
    const initRes = await agent.get("/api/auth/google?returnTo=%2Fdashboard").expect(302);
    const state = extractStateFromRedirect(initRes.headers.location);
    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    expect(callbackRes.body.returnTo).toBe("/dashboard");
  });
});

describe("Google OAuth returnTo — end-to-end flow (start → callback)", () => {
  function buildReturnToApp() {
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

    app.get("/api/auth/google/callback", (req, res) => {
      const stateResult = validateOAuthState(req, res);
      if (!stateResult.valid) {
        return res.redirect(
          `/login?error=${stateResult.reason === "invalid_state" ? "invalid_state" : "google_cancelled"}`
        );
      }
      req.session.save((err) => {
        if (err) return res.redirect("/login?error=session_save_failed");
        res.json({
          success: true,
          code: stateResult.code,
          returnTo: stateResult.returnTo,
          isNative: stateResult.isNative,
        });
      });
    });

    return app;
  }

  let savedClientId: string | undefined;

  beforeAll(() => {
    savedClientId = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
  });

  afterAll(() => {
    if (savedClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = savedClientId;
    }
  });

  it("passes returnTo=/wallet through the full OAuth start → callback flow", async () => {
    const app = buildReturnToApp();
    const agent = supertest.agent(app);

    const initRes = await agent
      .get("/api/auth/google?returnTo=%2Fwallet")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    expect(callbackRes.body.success).toBe(true);
    expect(callbackRes.body.returnTo).toBe("/wallet");
  });

  it("passes returnTo=/biz/dashboard through the full OAuth start → callback flow", async () => {
    const app = buildReturnToApp();
    const agent = supertest.agent(app);

    const initRes = await agent
      .get("/api/auth/google?returnTo=%2Fbiz%2Fdashboard")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    expect(callbackRes.body.success).toBe(true);
    expect(callbackRes.body.returnTo).toBe("/biz/dashboard");
  });

  it("returns returnTo=null when no returnTo is provided", async () => {
    const app = buildReturnToApp();
    const agent = supertest.agent(app);

    const initRes = await agent.get("/api/auth/google").expect(302);
    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    expect(callbackRes.body.success).toBe(true);
    expect(callbackRes.body.returnTo).toBeNull();
  });

  it("drops a disallowed returnTo so callback receives null", async () => {
    const app = buildReturnToApp();
    const agent = supertest.agent(app);

    const initRes = await agent
      .get("/api/auth/google?returnTo=%2Fevil-path")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    expect(callbackRes.body.success).toBe(true);
    expect(callbackRes.body.returnTo).toBeNull();
  });

  it("drops an open-redirect returnTo so callback receives null", async () => {
    const app = buildReturnToApp();
    const agent = supertest.agent(app);

    const initRes = await agent
      .get("/api/auth/google?returnTo=%2F%2Fevil.com%2Fdashboard")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    expect(callbackRes.body.success).toBe(true);
    expect(callbackRes.body.returnTo).toBeNull();
  });

  it("returns isNative=true when OAuth flow is started with ?source=native", async () => {
    const app = buildReturnToApp();
    const agent = supertest.agent(app);

    const initRes = await agent
      .get("/api/auth/google?source=native")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    expect(callbackRes.body.success).toBe(true);
    expect(callbackRes.body.isNative).toBe(true);
  });

  it("returns isNative=false when OAuth flow is started without ?source=native", async () => {
    const app = buildReturnToApp();
    const agent = supertest.agent(app);

    const initRes = await agent
      .get("/api/auth/google")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    expect(callbackRes.body.success).toBe(true);
    expect(callbackRes.body.isNative).toBe(false);
  });

  it("returns isNative=false when source param is something other than 'native'", async () => {
    const app = buildReturnToApp();
    const agent = supertest.agent(app);

    const initRes = await agent
      .get("/api/auth/google?source=web")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    expect(callbackRes.body.success).toBe(true);
    expect(callbackRes.body.isNative).toBe(false);
  });

  it("encodes native=true in the state payload when ?source=native is set", async () => {
    const app = buildReturnToApp();
    const agent = supertest.agent(app);

    const initRes = await agent
      .get("/api/auth/google?source=native")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);

    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    expect(decoded.native).toBe(true);
    expect(typeof decoded.n).toBe("string");
    expect(decoded.n.length).toBeGreaterThanOrEqual(32);
  });

  it("encodes native=false in the state payload when ?source=native is not set", async () => {
    const app = buildReturnToApp();
    const agent = supertest.agent(app);

    const initRes = await agent
      .get("/api/auth/google")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);

    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    expect(decoded.native).toBe(false);
    expect(typeof decoded.n).toBe("string");
    expect(decoded.n.length).toBeGreaterThanOrEqual(32);
  });

  it("encodes both native=true and returnTo together in the state payload", async () => {
    const app = buildReturnToApp();
    const agent = supertest.agent(app);

    const initRes = await agent
      .get("/api/auth/google?source=native&returnTo=%2Fwallet")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);

    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    expect(decoded.native).toBe(true);
    expect(decoded.returnTo).toBe("/wallet");

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    expect(callbackRes.body.success).toBe(true);
    expect(callbackRes.body.isNative).toBe(true);
    expect(callbackRes.body.returnTo).toBe("/wallet");
  });

  it("includes returnTo in the /auth-success redirect URL produced by the callback", async () => {
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

    app.get("/api/auth/google/callback", (req, res) => {
      const stateResult = validateOAuthState(req, res);
      if (!stateResult.valid) {
        return res.redirect("/login?error=invalid_state");
      }
      const mockToken = "mock-jwt-token";
      const { returnTo } = stateResult;
      const dest = returnTo
        ? `/auth-success?token=${encodeURIComponent(mockToken)}&returnTo=${encodeURIComponent(returnTo)}`
        : `/auth-success?token=${encodeURIComponent(mockToken)}`;
      req.session.save(() => res.redirect(dest));
    });

    const agent = supertest.agent(app);

    const initRes = await agent
      .get("/api/auth/google?returnTo=%2Fwallet")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(302);

    const redirectUrl = new URL(callbackRes.headers.location, "http://localhost");
    expect(redirectUrl.pathname).toBe("/auth-success");
    expect(redirectUrl.searchParams.get("returnTo")).toBe("/wallet");
  });
});
