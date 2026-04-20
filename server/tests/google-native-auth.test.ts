import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import supertest from "supertest";
import { verifyGoogleIdToken, handleNativeGoogleAuth } from "../auth";

const VALID_AUD = "valid-client-id.apps.googleusercontent.com";
const ANDROID_AUD = "android-client-id.apps.googleusercontent.com";

function makeFetch(status: number, body: object): typeof fetch {
  return async (_url: string | URL | Request) => {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  };
}

// ---------------------------------------------------------------------------
// verifyGoogleIdToken — unit tests
// ---------------------------------------------------------------------------

describe("verifyGoogleIdToken", () => {
  it("returns null when tokeninfo API responds with a non-OK status", async () => {
    const fakeFetch = makeFetch(400, { error: "invalid_token", error_description: "Invalid Value" });
    const result = await verifyGoogleIdToken("bad.token.here", [VALID_AUD], fakeFetch);
    expect(result).toBeNull();
  });

  it("returns null when tokeninfo is OK but missing sub", async () => {
    const fakeFetch = makeFetch(200, { email: "user@example.com", aud: VALID_AUD });
    const result = await verifyGoogleIdToken("some.token", [VALID_AUD], fakeFetch);
    expect(result).toBeNull();
  });

  it("returns null when tokeninfo is OK but missing email", async () => {
    const fakeFetch = makeFetch(200, { sub: "12345", aud: VALID_AUD });
    const result = await verifyGoogleIdToken("some.token", [VALID_AUD], fakeFetch);
    expect(result).toBeNull();
  });

  it("returns null when aud does not match any valid client ID", async () => {
    const fakeFetch = makeFetch(200, {
      sub: "12345",
      email: "user@example.com",
      aud: "unknown-client.apps.googleusercontent.com",
      name: "Test User",
    });
    const result = await verifyGoogleIdToken("some.token", [VALID_AUD], fakeFetch);
    expect(result).toBeNull();
  });

  it("accepts the web client ID in aud", async () => {
    const fakeFetch = makeFetch(200, {
      sub: "12345",
      email: "user@example.com",
      aud: VALID_AUD,
      name: "Test User",
      picture: "https://example.com/photo.jpg",
    });
    const result = await verifyGoogleIdToken("valid.token", [VALID_AUD, ANDROID_AUD], fakeFetch);
    expect(result).not.toBeNull();
    expect(result!.sub).toBe("12345");
    expect(result!.email).toBe("user@example.com");
    expect(result!.name).toBe("Test User");
    expect(result!.picture).toBe("https://example.com/photo.jpg");
    expect(result!.aud).toBe(VALID_AUD);
  });

  it("accepts the Android client ID in aud", async () => {
    const fakeFetch = makeFetch(200, {
      sub: "67890",
      email: "android@example.com",
      aud: ANDROID_AUD,
      name: "Android User",
    });
    const result = await verifyGoogleIdToken("android.token", [VALID_AUD, ANDROID_AUD], fakeFetch);
    expect(result).not.toBeNull();
    expect(result!.sub).toBe("67890");
    expect(result!.aud).toBe(ANDROID_AUD);
  });

  it("falls back to email prefix when name is missing", async () => {
    const fakeFetch = makeFetch(200, {
      sub: "12345",
      email: "noname@example.com",
      aud: VALID_AUD,
    });
    const result = await verifyGoogleIdToken("some.token", [VALID_AUD], fakeFetch);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("noname");
  });

  it("returns null when fetch throws", async () => {
    const errorFetch = async (_url: string | URL | Request): Promise<Response> => {
      throw new Error("network error");
    };
    const result = await verifyGoogleIdToken("some.token", [VALID_AUD], errorFetch);
    expect(result).toBeNull();
  });

  it("returns null picture field when picture is absent in tokeninfo payload", async () => {
    const fakeFetch = makeFetch(200, {
      sub: "12345",
      email: "nopic@example.com",
      aud: VALID_AUD,
      name: "No Pic",
    });
    const result = await verifyGoogleIdToken("some.token", [VALID_AUD], fakeFetch);
    expect(result).not.toBeNull();
    expect(result!.picture).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// handleNativeGoogleAuth — endpoint-level tests
// ---------------------------------------------------------------------------

function buildNativeAuthApp(overrides: {
  webClientId?: string;
  androidClientId?: string;
  mockUser?: Record<string, unknown>;
  fetchFn?: typeof fetch;
}) {
  const { webClientId = VALID_AUD, androidClientId, mockUser, fetchFn } = overrides;

  const mockUpsert = vi.fn(async () =>
    mockUser ?? {
      id: 1,
      email: "user@example.com",
      username: "testuser",
      fullName: "Test User",
      role: "buyer",
      banned: false,
      suspended: false,
      accountType: "individual",
      tier: "community",
    },
  );

  const app = express();
  app.use(express.json());
  app.post(
    "/api/auth/google/native",
    handleNativeGoogleAuth({
      webClientId,
      androidClientId,
      upsertGoogleUser: mockUpsert,
      generateToken: (_user) => "mock-jwt-token",
      fetchFn,
    }),
  );

  return { app, mockUpsert };
}

describe("POST /api/auth/google/native — endpoint behaviour", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 when idToken is missing", async () => {
    const { app } = buildNativeAuthApp({});
    const res = await supertest(app).post("/api/auth/google/native").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/idToken/i);
  });

  it("returns 400 when idToken is not a string", async () => {
    const { app } = buildNativeAuthApp({});
    const res = await supertest(app).post("/api/auth/google/native").send({ idToken: 12345 });
    expect(res.status).toBe(400);
  });

  it("returns 503 when webClientId is not configured", async () => {
    const { app } = buildNativeAuthApp({ webClientId: "" });
    const res = await supertest(app)
      .post("/api/auth/google/native")
      .send({ idToken: "some-token" });
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/not configured/i);
  });

  it("returns 401 when tokeninfo rejects the token", async () => {
    const badFetch = makeFetch(400, { error: "invalid_token" });
    const { app } = buildNativeAuthApp({ fetchFn: badFetch });
    const res = await supertest(app)
      .post("/api/auth/google/native")
      .send({ idToken: "bad-token" });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Invalid Google ID token/i);
  });

  it("returns 401 when tokeninfo aud does not match any client ID", async () => {
    const wrongAudFetch = makeFetch(200, {
      sub: "999",
      email: "attacker@evil.com",
      aud: "wrong-client-id.apps.googleusercontent.com",
      name: "Attacker",
    });
    const { app } = buildNativeAuthApp({ fetchFn: wrongAudFetch });
    const res = await supertest(app)
      .post("/api/auth/google/native")
      .send({ idToken: "spoofed-token" });
    expect(res.status).toBe(401);
  });

  it("returns 200 with token and sanitized user on success", async () => {
    const validFetch = makeFetch(200, {
      sub: "12345",
      email: "user@example.com",
      aud: VALID_AUD,
      name: "Test User",
      picture: "https://example.com/avatar.jpg",
    });
    const { app, mockUpsert } = buildNativeAuthApp({ fetchFn: validFetch });
    const res = await supertest(app)
      .post("/api/auth/google/native")
      .send({ idToken: "valid-token" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe("mock-jwt-token");
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe("user@example.com");
    expect(res.body.user.password).toBeUndefined();
    expect(mockUpsert).toHaveBeenCalledOnce();
  });

  it("returns 403 when user is banned", async () => {
    const validFetch = makeFetch(200, {
      sub: "12345",
      email: "banned@example.com",
      aud: VALID_AUD,
      name: "Banned User",
    });
    const { app } = buildNativeAuthApp({
      fetchFn: validFetch,
      mockUser: {
        id: 2,
        email: "banned@example.com",
        username: "banned",
        fullName: "Banned User",
        role: "buyer",
        banned: true,
        suspended: false,
        accountType: "individual",
        tier: "community",
      },
    });
    const res = await supertest(app)
      .post("/api/auth/google/native")
      .send({ idToken: "valid-token" });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/banned/i);
  });

  it("returns 403 when user is suspended", async () => {
    const validFetch = makeFetch(200, {
      sub: "12345",
      email: "suspended@example.com",
      aud: VALID_AUD,
      name: "Suspended User",
    });
    const { app } = buildNativeAuthApp({
      fetchFn: validFetch,
      mockUser: {
        id: 3,
        email: "suspended@example.com",
        username: "suspended",
        fullName: "Suspended User",
        role: "buyer",
        banned: false,
        suspended: true,
        accountType: "individual",
        tier: "community",
      },
    });
    const res = await supertest(app)
      .post("/api/auth/google/native")
      .send({ idToken: "valid-token" });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/suspended/i);
  });

  it("accepts Android client ID in aud alongside web client ID", async () => {
    const androidFetch = makeFetch(200, {
      sub: "android-sub-001",
      email: "android@example.com",
      aud: ANDROID_AUD,
      name: "Android User",
    });
    const { app } = buildNativeAuthApp({
      fetchFn: androidFetch,
      androidClientId: ANDROID_AUD,
    });
    const res = await supertest(app)
      .post("/api/auth/google/native")
      .send({ idToken: "android-valid-token" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBe("mock-jwt-token");
  });
});
