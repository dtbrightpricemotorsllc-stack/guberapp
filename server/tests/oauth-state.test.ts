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
    const stateResult = await validateOAuthState(req, res);
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
    app2.get("/api/auth/google/callback", async (req, res) => {
      const result = await validateOAuthState(req, res);
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
    app3.get("/api/auth/google/callback", async (req, res) => {
      const result = await validateOAuthState(req, res);
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

    app.get("/api/auth/google/callback", async (req, res) => {
      const stateResult = await validateOAuthState(req, res);
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

    app.get("/api/auth/google/callback", async (req, res) => {
      const stateResult = await validateOAuthState(req, res);
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

describe("Google OAuth cookie-fallback path (session-less native callback)", () => {
  /**
   * Simulates the Android Chrome Custom Tab scenario: the OAuth flow is started
   * in a Capacitor WebView which sets both a session cookie and the
   * `guber_oauth_state` cookie. The Chrome Custom Tab that opens Google's
   * consent page runs in a separate cookie jar, so the Express session is
   * absent by the time Google redirects back. The `guber_oauth_state` cookie
   * survives because it is a first-party same-site cookie that the WebView
   * receives in the redirect response directly.
   *
   * Tests here use a fresh supertest agent for the callback (no session) but
   * manually carry only the `guber_oauth_state` cookie.
   */

  function buildCookieFallbackApp() {
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
      const stateResult = await validateOAuthState(req, res);
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

  /**
   * Extract a named cookie's value from the raw Set-Cookie response headers
   * returned by supertest. Handles both array and single-string forms.
   */
  function extractSetCookieValue(
    setCookieHeaders: string | string[] | undefined,
    name: string
  ): string | null {
    if (!setCookieHeaders) return null;
    const headers = Array.isArray(setCookieHeaders)
      ? setCookieHeaders
      : [setCookieHeaders];
    for (const header of headers) {
      const firstPart = header.split(";")[0].trim();
      const eqIdx = firstPart.indexOf("=");
      if (eqIdx === -1) continue;
      const key = firstPart.slice(0, eqIdx).trim();
      if (key === name) {
        try {
          return decodeURIComponent(firstPart.slice(eqIdx + 1));
        } catch {
          return firstPart.slice(eqIdx + 1);
        }
      }
    }
    return null;
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

  it("validates the callback via the cookie fallback and returns isNative=true when session is absent", async () => {
    const app = buildCookieFallbackApp();

    // Step 1: start the OAuth flow — captures the guber_oauth_state cookie
    const initRes = await supertest(app)
      .get("/api/auth/google?source=native")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);
    const cookieState = extractSetCookieValue(
      initRes.headers["set-cookie"],
      "guber_oauth_state"
    );

    expect(cookieState).not.toBeNull();
    // The cookie should store the full encoded state string
    expect(cookieState).toBe(state);

    // Step 2: callback with a fresh request — no session, but carries the cookie
    const callbackRes = await supertest(app)
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .set("Cookie", `guber_oauth_state=${cookieState}`)
      .expect(200);

    expect(callbackRes.body.success).toBe(true);
    expect(callbackRes.body.isNative).toBe(true);
    expect(callbackRes.body.returnTo).toBeNull();
  });

  it("preserves returnTo through the cookie-fallback path when session is absent", async () => {
    const app = buildCookieFallbackApp();

    const initRes = await supertest(app)
      .get("/api/auth/google?source=native&returnTo=%2Fwallet")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);
    const cookieState = extractSetCookieValue(
      initRes.headers["set-cookie"],
      "guber_oauth_state"
    );

    expect(cookieState).not.toBeNull();

    const callbackRes = await supertest(app)
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .set("Cookie", `guber_oauth_state=${cookieState}`)
      .expect(200);

    expect(callbackRes.body.success).toBe(true);
    expect(callbackRes.body.isNative).toBe(true);
    expect(callbackRes.body.returnTo).toBe("/wallet");
  });

  it("preserves returnTo=/biz/dashboard through the cookie-fallback path", async () => {
    const app = buildCookieFallbackApp();

    const initRes = await supertest(app)
      .get("/api/auth/google?source=native&returnTo=%2Fbiz%2Fdashboard")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);
    const cookieState = extractSetCookieValue(
      initRes.headers["set-cookie"],
      "guber_oauth_state"
    );

    expect(cookieState).not.toBeNull();

    const callbackRes = await supertest(app)
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .set("Cookie", `guber_oauth_state=${cookieState}`)
      .expect(200);

    expect(callbackRes.body.success).toBe(true);
    expect(callbackRes.body.isNative).toBe(true);
    expect(callbackRes.body.returnTo).toBe("/biz/dashboard");
  });

  it("rejects the callback when both session and guber_oauth_state cookie are absent", async () => {
    const app = buildCookieFallbackApp();

    const initRes = await supertest(app)
      .get("/api/auth/google?source=native")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);

    // No session cookie, no guber_oauth_state cookie
    const callbackRes = await supertest(app)
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(302);

    expect(callbackRes.headers.location).toBe("/login?error=invalid_state");
  });

  it("rejects the callback when the guber_oauth_state cookie is tampered with", async () => {
    const app = buildCookieFallbackApp();

    const initRes = await supertest(app)
      .get("/api/auth/google?source=native")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);

    // Cookie present but value does not match the state parameter
    const callbackRes = await supertest(app)
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .set("Cookie", "guber_oauth_state=tampered-state-value")
      .expect(302);

    expect(callbackRes.headers.location).toBe("/login?error=invalid_state");
  });

  it("returns isNative=false through the cookie-fallback path for a non-native flow", async () => {
    const app = buildCookieFallbackApp();

    // No ?source=native — web flow, but session dropped
    const initRes = await supertest(app)
      .get("/api/auth/google?returnTo=%2Fdashboard")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);
    const cookieState = extractSetCookieValue(
      initRes.headers["set-cookie"],
      "guber_oauth_state"
    );

    expect(cookieState).not.toBeNull();

    const callbackRes = await supertest(app)
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .set("Cookie", `guber_oauth_state=${cookieState}`)
      .expect(200);

    expect(callbackRes.body.success).toBe(true);
    expect(callbackRes.body.isNative).toBe(false);
    expect(callbackRes.body.returnTo).toBe("/dashboard");
  });

  it("rejects a replayed cookie-fallback even when the client re-sends the same guber_oauth_state cookie", async () => {
    /**
     * Simulates a malicious or buggy client that ignores the clearCookie
     * Set-Cookie directive and re-sends the same guber_oauth_state cookie on a
     * second callback request. The first request should succeed; the second
     * must be rejected because the server marks the nonce as consumed.
     */
    const app = buildCookieFallbackApp();

    // Start the flow — captures cookie without creating a session for the callback
    const initRes = await supertest(app)
      .get("/api/auth/google?source=native")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);
    const cookieState = extractSetCookieValue(
      initRes.headers["set-cookie"],
      "guber_oauth_state"
    );

    expect(cookieState).not.toBeNull();

    // First callback — should succeed via cookie-fallback path
    const firstCallbackRes = await supertest(app)
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .set("Cookie", `guber_oauth_state=${cookieState}`)
      .expect(200);

    expect(firstCallbackRes.body.success).toBe(true);

    // Second callback — same cookie, same state, no session (client ignored clearCookie)
    // Must be rejected as a replay by the server-side consumed-nonce store
    const replayRes = await supertest(app)
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .set("Cookie", `guber_oauth_state=${cookieState}`)
      .expect(302);

    expect(replayRes.headers.location).toBe("/login?error=invalid_state");
  });

  it("rejects cookie-fallback replay after a successful session-based callback (session-first-then-cookie-replay)", async () => {
    /**
     * Closes the session-first-then-cookie-replay gap.
     *
     * Scenario: the first callback succeeds via the session path (normal browser
     * flow). The client then keeps the guber_oauth_state cookie that the server
     * tried to clear and makes a second request without a session (e.g. from a
     * different context) using the same state + cookie. Because the nonce was
     * recorded as consumed when the session callback succeeded, the server must
     * reject the replay even though the cookie value still matches the state.
     */
    const app = buildCookieFallbackApp();

    // Use a persistent agent so the first callback retains the session cookie
    const agent = supertest.agent(app);

    // Start the flow — agent accumulates both session cookie and guber_oauth_state
    const initRes = await agent.get("/api/auth/google?source=native").expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);
    const cookieState = extractSetCookieValue(
      initRes.headers["set-cookie"],
      "guber_oauth_state"
    );

    expect(cookieState).not.toBeNull();

    // First callback via agent — uses session path; records nonce as consumed
    const firstCallbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    expect(firstCallbackRes.body.success).toBe(true);

    // Second callback — new request with no session but same guber_oauth_state cookie
    // The nonce is already in the consumed store, so this must be rejected
    const replayRes = await supertest(app)
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .set("Cookie", `guber_oauth_state=${cookieState}`)
      .expect(302);

    expect(replayRes.headers.location).toBe("/login?error=invalid_state");
  });
});

describe("Google OAuth callback — native vs web redirect branching", () => {
  const MOCK_TOKEN = "mock-jwt-token";

  function extractNativeUrl(html: string): URL {
    const match = /window\.location\.replace\((".*?")\)/.exec(html);
    if (!match) throw new Error("Could not find window.location.replace call in HTML");
    const raw = JSON.parse(match[1]) as string;
    return new URL(raw);
  }

  function buildBranchingTestApp() {
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
      const stateResult = await validateOAuthState(req, res);
      if (!stateResult.valid) {
        return res.redirect(
          `/login?error=${stateResult.reason === "invalid_state" ? "invalid_state" : "google_cancelled"}`
        );
      }

      const { returnTo, isNative } = stateResult;

      if (isNative) {
        const nativeUrl = returnTo
          ? `guber://auth-success?token=${encodeURIComponent(MOCK_TOKEN)}&returnTo=${encodeURIComponent(returnTo)}`
          : `guber://auth-success?token=${encodeURIComponent(MOCK_TOKEN)}`;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#000}</style></head><body><script>window.location.replace(${JSON.stringify(nativeUrl)})</script></body></html>`;
        return res.type("html").send(html);
      }

      const authSuccessUrl = returnTo
        ? `/auth-success?token=${encodeURIComponent(MOCK_TOKEN)}&returnTo=${encodeURIComponent(returnTo)}`
        : `/auth-success?token=${encodeURIComponent(MOCK_TOKEN)}`;
      res.redirect(authSuccessUrl);
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

  it("native flow → HTML response whose JS redirect starts with guber://", async () => {
    const app = buildBranchingTestApp();
    const agent = supertest.agent(app);

    const initRes = await agent.get("/api/auth/google?source=native").expect(302);
    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    expect(callbackRes.headers["content-type"]).toMatch(/html/);
    const nativeUrl = extractNativeUrl(callbackRes.text);
    expect(nativeUrl.protocol).toBe("guber:");
    expect(nativeUrl.host).toBe("auth-success");
  });

  it("native flow → guber:// URL contains the issued token", async () => {
    const app = buildBranchingTestApp();
    const agent = supertest.agent(app);

    const initRes = await agent.get("/api/auth/google?source=native").expect(302);
    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    const nativeUrl = extractNativeUrl(callbackRes.text);
    expect(nativeUrl.searchParams.get("token")).toBe(MOCK_TOKEN);
  });

  it("native flow with returnTo → guber:// URL contains the returnTo path", async () => {
    const app = buildBranchingTestApp();
    const agent = supertest.agent(app);

    const initRes = await agent
      .get("/api/auth/google?source=native&returnTo=%2Fwallet")
      .expect(302);
    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    const nativeUrl = extractNativeUrl(callbackRes.text);
    expect(nativeUrl.protocol).toBe("guber:");
    expect(nativeUrl.searchParams.get("returnTo")).toBe("/wallet");
  });

  it("native flow without returnTo → guber:// URL does not include a returnTo param", async () => {
    const app = buildBranchingTestApp();
    const agent = supertest.agent(app);

    const initRes = await agent.get("/api/auth/google?source=native").expect(302);
    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    const nativeUrl = extractNativeUrl(callbackRes.text);
    expect(nativeUrl.protocol).toBe("guber:");
    expect(nativeUrl.searchParams.has("returnTo")).toBe(false);
  });

  it("web flow → 302 redirect to /auth-success (not guber://)", async () => {
    const app = buildBranchingTestApp();
    const agent = supertest.agent(app);

    const initRes = await agent.get("/api/auth/google").expect(302);
    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(302);

    expect(callbackRes.headers.location).toMatch(/^\/auth-success\?/);
    expect(callbackRes.headers.location).not.toContain("guber://");
  });

  it("web flow → redirect location contains the issued token", async () => {
    const app = buildBranchingTestApp();
    const agent = supertest.agent(app);

    const initRes = await agent.get("/api/auth/google").expect(302);
    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(302);

    const location = callbackRes.headers.location;
    const url = new URL(location, "http://localhost");
    expect(url.searchParams.get("token")).toBe(MOCK_TOKEN);
  });

  it("web flow with returnTo → redirect location includes the returnTo path", async () => {
    const app = buildBranchingTestApp();
    const agent = supertest.agent(app);

    const initRes = await agent
      .get("/api/auth/google?returnTo=%2Fwallet")
      .expect(302);
    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(302);

    const url = new URL(callbackRes.headers.location, "http://localhost");
    expect(url.pathname).toBe("/auth-success");
    expect(url.searchParams.get("returnTo")).toBe("/wallet");
  });

  it("web flow without returnTo → /auth-success redirect has no returnTo param", async () => {
    const app = buildBranchingTestApp();
    const agent = supertest.agent(app);

    const initRes = await agent.get("/api/auth/google").expect(302);
    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(302);

    const url = new URL(callbackRes.headers.location, "http://localhost");
    expect(url.pathname).toBe("/auth-success");
    expect(url.searchParams.has("returnTo")).toBe(false);
  });

  it("source=web (non-native) → 302 redirect to /auth-success (not guber://)", async () => {
    const app = buildBranchingTestApp();
    const agent = supertest.agent(app);

    const initRes = await agent.get("/api/auth/google?source=web").expect(302);
    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(302);

    expect(callbackRes.headers.location).toMatch(/^\/auth-success\?/);
    expect(callbackRes.headers.location).not.toContain("guber://");
  });

  it("native flow with returnTo=/biz/dashboard → guber:// URL encodes full returnTo path", async () => {
    const app = buildBranchingTestApp();
    const agent = supertest.agent(app);

    const initRes = await agent
      .get("/api/auth/google?source=native&returnTo=%2Fbiz%2Fdashboard")
      .expect(302);
    const state = extractStateFromRedirect(initRes.headers.location);

    const callbackRes = await agent
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .expect(200);

    const nativeUrl = extractNativeUrl(callbackRes.text);
    expect(nativeUrl.protocol).toBe("guber:");
    expect(nativeUrl.host).toBe("auth-success");
    expect(nativeUrl.searchParams.get("returnTo")).toBe("/biz/dashboard");
  });

  it("native flow via cookie-fallback (session absent) → HTML response with guber://auth-success", async () => {
    const app = buildBranchingTestApp();

    // Step 1: initiate the OAuth flow — use a one-shot request (no agent) so
    // there is no persistent session cookie carried into the callback.
    const initRes = await supertest(app)
      .get("/api/auth/google?source=native")
      .expect(302);

    const state = extractStateFromRedirect(initRes.headers.location);

    // Extract the guber_oauth_state cookie value set by the start handler.
    const setCookieHeaders = initRes.headers["set-cookie"] as string | string[] | undefined;
    const cookieHeaderList = Array.isArray(setCookieHeaders)
      ? setCookieHeaders
      : setCookieHeaders
      ? [setCookieHeaders]
      : [];

    let cookieStateValue: string | null = null;
    for (const header of cookieHeaderList) {
      const firstPart = header.split(";")[0].trim();
      const eqIdx = firstPart.indexOf("=");
      if (eqIdx !== -1 && firstPart.slice(0, eqIdx).trim() === "guber_oauth_state") {
        try {
          cookieStateValue = decodeURIComponent(firstPart.slice(eqIdx + 1));
        } catch {
          cookieStateValue = firstPart.slice(eqIdx + 1);
        }
        break;
      }
    }

    expect(cookieStateValue).not.toBeNull();

    // Step 2: callback with a fresh one-shot request — no session, only the
    // guber_oauth_state cookie (simulates Android Chrome Custom Tab dropping the
    // Express session while the WebView's first-party cookie survives).
    const callbackRes = await supertest(app)
      .get(`/api/auth/google/callback?code=test-code&state=${state}`)
      .set("Cookie", `guber_oauth_state=${cookieStateValue}`)
      .expect(200);

    expect(callbackRes.headers["content-type"]).toMatch(/html/);
    expect(callbackRes.text).toContain("guber://auth-success");

    const nativeUrl = extractNativeUrl(callbackRes.text);
    expect(nativeUrl.protocol).toBe("guber:");
    expect(nativeUrl.host).toBe("auth-success");
    expect(nativeUrl.searchParams.get("token")).toBe(MOCK_TOKEN);
  });
});
