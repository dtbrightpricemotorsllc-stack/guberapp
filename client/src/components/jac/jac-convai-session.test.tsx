// @vitest-environment jsdom
//
// Unit test: JAC voice WebSocket transport guarantee.
//
// The Samsung Internet "connecting…" hang was caused by the ElevenLabs SDK
// silently falling back to WebRTC/LiveKit ICE negotiation when no signedUrl was
// present. The fix (force `connectionType: "websocket"`) must survive future
// refactors of the params-construction block.
//
// Verifies:
//   1. startSession() receives connectionType: "websocket" when the session
//      server returns a signedUrl (standard signed-URL path).
//   2. startSession() receives connectionType: "websocket" when the session
//      server returns only an agentId (public-agent fallback path).
//      — signedUrl must be absent, agentId must be set in this case.
//   3. connectionDelay.android === 0 in both cases (the 3-second WebRTC/LiveKit
//      Android audio-mode delay must not be re-introduced for WebSocket sessions).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, waitFor } from "@testing-library/react";
import React from "react";

// ── Capture startSession / endSession calls ───────────────────────────────────

const startSessionSpy = vi.hoisted(() => vi.fn());
const endSessionSpy   = vi.hoisted(() => vi.fn());

vi.mock("@elevenlabs/react", () => ({
  useConversation: vi.fn(() => ({
    startSession: startSessionSpy,
    endSession:   endSessionSpy,
    status:       "disconnected",
    isSpeaking:   false,
    isListening:  false,
    isMuted:      false,
    setMuted:     vi.fn(),
  })),
}));

// ── Mock apiRequest (session endpoint) ────────────────────────────────────────

const mockApiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/queryClient", () => ({
  apiRequest: mockApiRequest,
}));

// ── Mock jac-tts (audio helpers) ─────────────────────────────────────────────

vi.mock("@/lib/jac-tts", () => ({
  unlockAudioContext: vi.fn(),
  setJacConvaiActive: vi.fn(),
  cancelAllJacAudio:  vi.fn(),
}));

// ── Import component AFTER all mocks are registered ──────────────────────────

import { JacConvaiSession } from "./jac-convai-session";

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Returns a minimal MediaStream stub that satisfies diagnoseMicStream(). */
function makeFakeStream(): MediaStream {
  const track = {
    kind:       "audio",
    label:      "fake-mic",
    enabled:    true,
    muted:      false,
    readyState: "live",
    stop:       vi.fn(),
  } as unknown as MediaStreamTrack;
  return {
    getAudioTracks: () => [track],
    getVideoTracks: () => [],
    getTracks:      () => [track],
  } as unknown as MediaStream;
}

/** Installs a getUserMedia mock on navigator.mediaDevices. */
function installGetUserMedia() {
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    writable:     true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue(makeFakeStream()),
    },
  });
}

/**
 * Installs jsdom-compatible stubs for AudioContext + requestAnimationFrame.
 *
 * diagnoseMicStream() creates an AudioContext, runs a sampling loop via
 * requestAnimationFrame for up to 600 ms, then resolves.  In jsdom neither
 * API exists natively.
 *
 * Strategy:
 * - AudioContext is a proper constructible class so `new AudioContext()` works
 *   without throwing.  getByteTimeDomainData is a no-op that leaves the buffer
 *   at zero (silence), so maxRMS stays 0 and the "silent mic" log path runs.
 * - requestAnimationFrame calls its callback synchronously exactly once.
 *   On that single tick, Date.now() is still well within the 600 ms window,
 *   so tick calls requestAnimationFrame again — but the second call is a
 *   no-op vi.fn() that never invokes the callback.  diagnoseMicStream then
 *   resolves after its 1-second hard-timeout (which fires naturally because
 *   the tests run with real timers; waitFor polls until startSession appears).
 *
 * Real timers are used throughout (no vi.useFakeTimers) so the async Promise
 * chain that follows diagnoseMicStream drains without manual timer stepping.
 */
function installAudioStubs() {
  class FakeAudioContext {
    createMediaStreamSource(_stream: MediaStream) {
      return { connect: vi.fn() };
    }
    createAnalyser() {
      return {
        fftSize:               512,
        frequencyBinCount:     256,
        getByteTimeDomainData: vi.fn(), // leaves buffer as zeros → silent
      };
    }
    close() {}
  }
  (globalThis as any).AudioContext = FakeAudioContext;

  // Call the callback once so the sampling path runs normally, then switch
  // to a no-op for subsequent rAF calls so the loop doesn't recurse forever.
  // After one tick, Date.now() is still inside the 600 ms window, so tick
  // calls rAF again — which hits the no-op and stops, leaving the
  // 1-second hard-timeout to resolve the promise.
  let rAFCallCount = 0;
  (globalThis as any).requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
    if (rAFCallCount === 0) {
      rAFCallCount++;
      cb(0);
    }
    return 0;
  });
}

/**
 * Builds the fake API response returned by /api/jac/convai/session.
 * Pass `{ signedUrl: undefined }` to simulate the public-agent fallback path.
 */
function makeSessionResponse(overrides: Record<string, any> = {}) {
  const defaults = {
    signedUrl:           "wss://api.elevenlabs.io/v1/convai/real-time?token=test",
    agentId:             "agent-abc123",
    dynamicVariableName: "voice_token",
    voiceToken:          "hmac-test-token",
    userContext: {
      firstName: "Test",
      role:      "user",
      platform:  "web",
      jac_mode:  "app",
      userId:    42,
    },
  };
  return {
    ok:   true,
    json: async () => ({ ...defaults, ...overrides }),
  } as any;
}

const noop = () => {};

// ─────────────────────────────────────────────────────────────────────────────

describe("JacConvaiSession — WebSocket transport guarantee", () => {
  beforeEach(() => {
    startSessionSpy.mockClear();
    endSessionSpy.mockClear();
    mockApiRequest.mockReset();
    installGetUserMedia();
    installAudioStubs();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Helper: render the session controller and wait for boot() to call startSession ─
  //
  // Uses real timers throughout.  diagnoseMicStream resolves after its 1-second
  // hard-timeout; waitFor polls (up to 3 s) until startSession has been called.
  async function mountAndBoot(sessionOverrides: Record<string, any> = {}) {
    mockApiRequest.mockResolvedValue(makeSessionResponse(sessionOverrides));

    await act(async () => {
      render(
        <JacConvaiSession
          active={true}
          sessionEndpoint="/api/jac/convai/session"
          onPhaseChange={noop}
          onUserTranscript={noop}
          onJacResponse={noop}
          onError={noop}
        />,
      );
    });

    // diagnoseMicStream has a 1-second hard-timeout.  waitFor polls until
    // startSession is called (which happens synchronously once boot() resumes).
    await waitFor(
      () => expect(startSessionSpy).toHaveBeenCalled(),
      { timeout: 3000, interval: 50 },
    );
  }

  // ── Test 1: signed-URL path ─────────────────────────────────────────────────

  it("passes connectionType: 'websocket' when the session returns a signedUrl", async () => {
    await mountAndBoot();

    const params = startSessionSpy.mock.calls[0][0];
    expect(params.connectionType).toBe("websocket");
  });

  it("sets signedUrl (not agentId) when the session response contains a signedUrl", async () => {
    await mountAndBoot();

    const params = startSessionSpy.mock.calls[0][0];
    expect(params.signedUrl).toBe(
      "wss://api.elevenlabs.io/v1/convai/real-time?token=test",
    );
    expect(params.agentId).toBeUndefined();
  });

  // ── Test 2: agentId-only fallback path ─────────────────────────────────────

  it("passes connectionType: 'websocket' when the session returns only an agentId (no signedUrl)", async () => {
    await mountAndBoot({ signedUrl: undefined });

    const params = startSessionSpy.mock.calls[0][0];
    expect(params.connectionType).toBe("websocket");
  });

  it("sets agentId (not signedUrl) when the session response has no signedUrl", async () => {
    await mountAndBoot({ signedUrl: undefined });

    const params = startSessionSpy.mock.calls[0][0];
    expect(params.agentId).toBe("agent-abc123");
    expect(params.signedUrl).toBeUndefined();
  });

  // ── Test 3: Android connection-delay guard ──────────────────────────────────

  it("sets connectionDelay.android to 0 on the signed-URL path (no 3-second delay)", async () => {
    await mountAndBoot();

    const params = startSessionSpy.mock.calls[0][0];
    expect(params.connectionDelay?.android).toBe(0);
  });

  it("sets connectionDelay.android to 0 on the agentId fallback path (no 3-second delay)", async () => {
    await mountAndBoot({ signedUrl: undefined });

    const params = startSessionSpy.mock.calls[0][0];
    expect(params.connectionDelay?.android).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("JacConvaiSession — IAB early-exit guard", () => {
  // Save and restore navigator.userAgent so tests don't leak into each other.
  const originalUA = navigator.userAgent;

  function setUserAgent(ua: string) {
    Object.defineProperty(globalThis.navigator, "userAgent", {
      configurable: true,
      writable: true,
      value: ua,
    });
  }

  beforeEach(() => {
    startSessionSpy.mockClear();
    endSessionSpy.mockClear();
    mockApiRequest.mockReset();
    installGetUserMedia();
    installAudioStubs();
    // Ensure Capacitor is absent so detectJacPlatform() reaches the UA checks.
    delete (window as any).Capacitor;
  });

  afterEach(() => {
    cleanup();
    setUserAgent(originalUA);
  });

  // ── IAB patterns that must trigger the early-exit ──────────────────────────

  const IAB_CASES = [
    {
      name: "Facebook (FBAN)",
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FBAN/FBIOS FBDV/iPhone15,2 FBMD/iPhone FBSN/iOS FBSV/17.0 FBSS/3",
    },
    {
      name: "Instagram",
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 310.0.0.34.109",
    },
    {
      name: "TikTok",
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 TikTok/26.0.0",
    },
    {
      name: "LinkedIn (LinkedInApp)",
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LinkedInApp/9.21.400",
    },
  ];

  for (const { name, ua } of IAB_CASES) {
    it(`calls onError("IAB_NO_VOICE") and never calls getUserMedia for ${name}`, async () => {
      setUserAgent(ua);

      const onError = vi.fn();

      await act(async () => {
        render(
          <JacConvaiSession
            active={true}
            sessionEndpoint="/api/jac/convai/session"
            onPhaseChange={noop}
            onUserTranscript={noop}
            onJacResponse={noop}
            onError={onError}
          />,
        );
      });

      // The early-exit fires synchronously inside boot() so it resolves quickly.
      await waitFor(
        () => expect(onError).toHaveBeenCalledWith("IAB_NO_VOICE"),
        { timeout: 2000, interval: 25 },
      );

      // getUserMedia must never be called — hanging on it is the bug we prevent.
      expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();

      // ElevenLabs SDK must not be started.
      expect(startSessionSpy).not.toHaveBeenCalled();
    });
  }

  // ── Non-IAB path must NOT trigger the early-exit ──────────────────────────

  it("does NOT call onError(IAB_NO_VOICE) for a standard desktop Chrome UA", async () => {
    setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    );

    mockApiRequest.mockResolvedValue(makeSessionResponse());

    const onError = vi.fn();

    await act(async () => {
      render(
        <JacConvaiSession
          active={true}
          sessionEndpoint="/api/jac/convai/session"
          onPhaseChange={noop}
          onUserTranscript={noop}
          onJacResponse={noop}
          onError={onError}
        />,
      );
    });

    // A normal browser completes the boot flow and calls startSession.
    await waitFor(
      () => expect(startSessionSpy).toHaveBeenCalled(),
      { timeout: 3000, interval: 50 },
    );

    expect(onError).not.toHaveBeenCalledWith("IAB_NO_VOICE");
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
  });
});
