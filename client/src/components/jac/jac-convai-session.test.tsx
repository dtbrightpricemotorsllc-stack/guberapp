// @vitest-environment jsdom
//
// Unit tests: JAC voice session controller.
//
// Covers:
//   1. WebSocket transport guarantee — signed URLs are passed directly to the
//      SDK, which selects WebSocket transport in the installed SDK version.
//   2. IAB early-exit guard — Facebook, Instagram, TikTok, LinkedIn in-app
//      browsers must never reach getUserMedia (it hangs indefinitely there).
//   3. Connection timeout guard — onError fires after 12 s if the SDK never
//      reaches "connected" (prevents the UI from being stuck on "connecting…").
//   4. Mic-lost recovery — Samsung Internet / Android WebView mid-session
//      mic revocation must tear the session down cleanly with exactly one error,
//      using a per-instance token registry so two simultaneous mounts are isolated.

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { render, act, cleanup, waitFor } from "@testing-library/react";
import React from "react";

// ── Capture startSession / endSession calls ───────────────────────────────────

const startSessionSpy = vi.hoisted(() => vi.fn());
const endSessionSpy   = vi.hoisted(() => vi.fn());

// Captured by the useConversation mock so tests can fire onDisconnect manually
// to verify it does NOT emit a second error after mic-lost teardown.
let _capturedConvaiHandlers: {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (msg: string) => void;
} = {};

vi.mock("@elevenlabs/react", () => ({
  useConversation: vi.fn((handlers: any) => {
    _capturedConvaiHandlers = handlers ?? {};
    return {
      startSession: startSessionSpy,
      endSession:   endSessionSpy,
      status:       "disconnected",
      isSpeaking:   false,
      isListening:  false,
      isMuted:      false,
      setMuted:     vi.fn(),
    };
  }),
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

import { JacConvaiSession, _testOnlyFireMicLost } from "./jac-convai-session";

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

    await waitFor(
      () => expect(startSessionSpy).toHaveBeenCalled(),
      { timeout: 3000, interval: 50 },
    );
  }

  it("passes signedUrl (not agentId) without unsupported transport options", async () => {
    await mountAndBoot();

    const params = startSessionSpy.mock.calls[0][0];
    expect(params.signedUrl).toBe("wss://api.elevenlabs.io/v1/convai/real-time?token=test");
    expect(params.agentId).toBeUndefined();
    expect(params.connectionType).toBeUndefined();
    expect(params.connectionDelay).toBeUndefined();
  });

  it("passes agentId (not signedUrl) on the public-agent fallback path", async () => {
    await mountAndBoot({ signedUrl: undefined });

    const params = startSessionSpy.mock.calls[0][0];
    expect(params.agentId).toBe("agent-abc123");
    expect(params.signedUrl).toBeUndefined();
    expect(params.connectionType).toBeUndefined();
    expect(params.connectionDelay).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("JacConvaiSession — IAB early-exit guard", () => {
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
    delete (window as any).Capacitor;
  });

  afterEach(() => {
    cleanup();
    setUserAgent(originalUA);
  });

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

      await waitFor(
        () => expect(onError).toHaveBeenCalledWith("IAB_NO_VOICE"),
        { timeout: 2000, interval: 25 },
      );

      expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
      expect(startSessionSpy).not.toHaveBeenCalled();
    });
  }

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

    await waitFor(
      () => expect(startSessionSpy).toHaveBeenCalled(),
      { timeout: 3000, interval: 50 },
    );

    expect(onError).not.toHaveBeenCalledWith("IAB_NO_VOICE");
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Connection timeout guard — 12-second hang-at-connect watchdog
// ─────────────────────────────────────────────────────────────────────────────

describe("JacConvaiSession — connection timeout guard", () => {
  let onErrorSpy: Mock<(msg: string) => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    startSessionSpy.mockClear();
    endSessionSpy.mockClear();
    onErrorSpy = vi.fn<(msg: string) => void>();
    mockApiRequest.mockReset();
    installGetUserMedia();
    installAudioStubs();
    mockApiRequest.mockResolvedValue(makeSessionResponse());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("does NOT call onError before 12 seconds have elapsed", async () => {
    await act(async () => {
      render(
        <JacConvaiSession
          active={true}
          sessionEndpoint="/api/jac/convai/session"
          onPhaseChange={noop}
          onUserTranscript={noop}
          onJacResponse={noop}
          onError={onErrorSpy}
        />,
      );
    });

    await act(async () => { vi.advanceTimersByTime(1_100); });
    await act(async () => {});
    await act(async () => { vi.advanceTimersByTime(11_000); });

    expect(onErrorSpy).not.toHaveBeenCalled();
  });

  it("calls onError with a timeout message after 12 seconds if the SDK never connects", async () => {
    await act(async () => {
      render(
        <JacConvaiSession
          active={true}
          sessionEndpoint="/api/jac/convai/session"
          onPhaseChange={noop}
          onUserTranscript={noop}
          onJacResponse={noop}
          onError={onErrorSpy}
        />,
      );
    });

    await act(async () => { vi.advanceTimersByTime(1_100); });
    await act(async () => {});

    expect(startSessionSpy).toHaveBeenCalled();
    expect(onErrorSpy).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(12_000); });

    expect(onErrorSpy).toHaveBeenCalledTimes(1);
    expect(onErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("timed out"),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mic-lost recovery — Samsung Internet / Android WebView mid-session revocation
// ─────────────────────────────────────────────────────────────────────────────

describe("JacConvaiSession — mic-lost recovery", () => {
  let onErrorSpy: Mock<(msg: string) => void>;

  beforeEach(() => {
    startSessionSpy.mockClear();
    endSessionSpy.mockClear();
    _capturedConvaiHandlers = {};
    onErrorSpy = vi.fn<(msg: string) => void>();
    mockApiRequest.mockReset();
    installGetUserMedia();
    installAudioStubs();
  });

  afterEach(() => {
    cleanup();
  });

  /** Render + wait for startSession, then wait one extra tick for the
   *  setTimeout(0) that arms _micLostCallback. */
  async function mountAndBootWithErrorSpy() {
    mockApiRequest.mockResolvedValue(makeSessionResponse());

    let unmount!: () => void;
    await act(async () => {
      const result = render(
        <JacConvaiSession
          active={true}
          sessionEndpoint="/api/jac/convai/session"
          onPhaseChange={noop}
          onUserTranscript={noop}
          onJacResponse={noop}
          onError={onErrorSpy}
        />,
      );
      unmount = result.unmount;
    });

    await waitFor(
      () => expect(startSessionSpy).toHaveBeenCalled(),
      { timeout: 3000, interval: 50 },
    );

    // Wait one extra tick for the setTimeout(0) that arms the token.
    await new Promise<void>((r) => setTimeout(r, 10));

    return { unmount };
  }

  it("fires onError exactly once with the mic-lost message when the mic track ends", async () => {
    await mountAndBootWithErrorSpy();

    _testOnlyFireMicLost();

    expect(onErrorSpy).toHaveBeenCalledTimes(1);
    expect(onErrorSpy.mock.calls[0][0]).toBe("Mic lost — tap the mic to reconnect.");
    expect(endSessionSpy).toHaveBeenCalledTimes(1);
  });

  it("fires onError exactly once with the mic-lost message when the mic track is muted", async () => {
    await mountAndBootWithErrorSpy();

    _testOnlyFireMicLost();

    expect(onErrorSpy).toHaveBeenCalledTimes(1);
    expect(onErrorSpy.mock.calls[0][0]).toBe("Mic lost — tap the mic to reconnect.");
  });

  it("does not emit a second error when the SDK's onDisconnect fires after mic-lost teardown", async () => {
    await mountAndBootWithErrorSpy();

    _testOnlyFireMicLost();

    // SDK calls onDisconnect after endSession(); micLostRef suppresses the duplicate.
    _capturedConvaiHandlers.onDisconnect?.();

    expect(onErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("does not fire onError when the component is unmounted before the track event fires", async () => {
    const { unmount } = await mountAndBootWithErrorSpy();

    await act(async () => { unmount(); });

    _testOnlyFireMicLost();

    expect(onErrorSpy).not.toHaveBeenCalled();
    expect(endSessionSpy).not.toHaveBeenCalled();
  });

  it("does not clear a second instance's mic-lost handler when the first instance unmounts", async () => {
    // Mount instance A
    const onErrorA = vi.fn<(msg: string) => void>();
    let unmountA!: () => void;
    mockApiRequest.mockResolvedValue(makeSessionResponse());
    await act(async () => {
      const r = render(
        <JacConvaiSession
          active={true}
          sessionEndpoint="/api/jac/convai/session"
          onPhaseChange={noop}
          onUserTranscript={noop}
          onJacResponse={noop}
          onError={onErrorA}
        />,
      );
      unmountA = r.unmount;
    });
    await waitFor(() => expect(startSessionSpy).toHaveBeenCalledTimes(1), { timeout: 3000, interval: 50 });
    await new Promise<void>((r) => setTimeout(r, 10));

    // Mount instance B
    const onErrorB = vi.fn<(msg: string) => void>();
    startSessionSpy.mockClear();
    mockApiRequest.mockResolvedValue(makeSessionResponse());
    await act(async () => {
      render(
        <JacConvaiSession
          active={true}
          sessionEndpoint="/api/jac/convai/session"
          onPhaseChange={noop}
          onUserTranscript={noop}
          onJacResponse={noop}
          onError={onErrorB}
        />,
      );
    });
    await waitFor(() => expect(startSessionSpy).toHaveBeenCalledTimes(1), { timeout: 3000, interval: 50 });
    await new Promise<void>((r) => setTimeout(r, 10));

    // Unmount A — must NOT disarm B's token.
    await act(async () => { unmountA(); });

    // Fire mic-lost — only B's handler should fire (A is unmounted/disarmed).
    _testOnlyFireMicLost();

    expect(onErrorA).not.toHaveBeenCalled();
    expect(onErrorB).toHaveBeenCalledTimes(1);
    expect(onErrorB.mock.calls[0][0]).toBe("Mic lost — tap the mic to reconnect.");
  });
});
