import { describe, it, expect, vi } from "vitest";
import { verifyGoogleIdToken } from "../auth";

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

  it("returns null when picture is absent (picture field should be null)", async () => {
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
