import { describe, it, expect, beforeAll } from "vitest";
import { signJacVoiceToken, verifyJacVoiceToken } from "../jac-voice-token";

beforeAll(() => {
  // Deterministic secret so the test never depends on the ambient env.
  process.env.SESSION_SECRET = "test-session-secret-at-least-16-chars-long";
});

describe("jac-voice-token", () => {
  it("round-trips an authenticated user token", () => {
    const tok = signJacVoiceToken({ userId: 42, role: "user", platform: "web" });
    const p = verifyJacVoiceToken(tok);
    expect(p).not.toBeNull();
    expect(p!.userId).toBe(42);
    expect(p!.role).toBe("user");
    expect(p!.platform).toBe("web");
    expect(p!.ver).toBe(1);
    expect(typeof p!.cid).toBe("string");
  });

  it("supports anonymous (logged-out onboarding) tokens", () => {
    const tok = signJacVoiceToken({ userId: null, role: "anon", platform: "ios" });
    const p = verifyJacVoiceToken(tok);
    expect(p).not.toBeNull();
    expect(p!.userId).toBeNull();
    expect(p!.role).toBe("anon");
  });

  it("rejects a tampered payload", () => {
    const tok = signJacVoiceToken({ userId: 1, role: "user", platform: "web" });
    const [body, sig] = tok.split(".");
    // Flip the userId by re-encoding a forged body but keeping the old signature.
    const forgedBody = Buffer.from(JSON.stringify({ userId: 999, role: "admin", platform: "web", cid: "x", exp: Date.now() + 100000, nonce: "n", ver: 1 }), "utf8")
      .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(verifyJacVoiceToken(`${forgedBody}.${sig}`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const tok = signJacVoiceToken({ userId: 1, role: "user", platform: "web" });
    // Rebuild with a past exp but valid signature is impossible without the secret,
    // so instead assert the verifier enforces exp by signing then fast-forwarding.
    const p = verifyJacVoiceToken(tok);
    expect(p).not.toBeNull();
    // Directly craft an expired-but-signed token via the real signer path:
    const originalNow = Date.now;
    try {
      // Move time far forward so the 2h TTL has elapsed.
      Date.now = () => originalNow() + 3 * 60 * 60 * 1000;
      expect(verifyJacVoiceToken(tok)).toBeNull();
    } finally {
      Date.now = originalNow;
    }
  });

  it("rejects garbage", () => {
    expect(verifyJacVoiceToken("")).toBeNull();
    expect(verifyJacVoiceToken("not-a-token")).toBeNull();
    expect(verifyJacVoiceToken("a.b.c")).toBeNull();
  });
});
