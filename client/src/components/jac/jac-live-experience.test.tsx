// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import React from "react";

const startSessionSpy = vi.hoisted(() => vi.fn());
const endSessionSpy = vi.hoisted(() => vi.fn());
const microphoneReady = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ user: null as { id: number } | null }));
const jacSpeakSpy = vi.hoisted(() => vi.fn());

vi.mock("@elevenlabs/react", () => ({
  ConversationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useConversation: () => ({
    startSession: startSessionSpy,
    endSession: endSessionSpy,
    status: "disconnected",
    isSpeaking: false,
    isListening: false,
    isMuted: false,
    setMuted: vi.fn(),
  }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("@/hooks/use-guest-jac-session", () => ({
  useGuestJacSession: () => ({ guestSessionId: "guest-test" }),
}));

vi.mock("@/lib/jac-tts", () => ({
  jacSpeak: jacSpeakSpy,
  cancelAllJacAudio: vi.fn(),
  setJacConvaiActive: vi.fn(),
}));

vi.mock("@/components/jac/jac-character-renderer", () => ({
  JacCharacterRenderer: () => <div data-testid="jac-character" />,
}));

vi.mock("@/lib/jac-live-coordination", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jac-live-coordination")>();
  return { ...actual, isJacMicrophoneReady: microphoneReady };
});

import { JacLiveExperience } from "./jac-live-experience";

function fakeMicStream(): MediaStream {
  const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
  return { getTracks: () => [track] } as unknown as MediaStream;
}

function sessionResponse(mode: "app") {
  return {
    ok: true,
    json: async () => ({
      agentId: "jac-agent",
      signedUrl: "wss://example.test/jac",
      voiceToken: "voice-token",
      dynamicVariableName: "secret__jac_voice_token",
      userContext: {
        firstName: "there",
        role: "anon",
        platform: "web",
        jac_mode: mode,
        userId: "anon",
      },
    }),
  };
}

describe("JacLiveExperience auth handoff", () => {
  beforeEach(() => {
    authState.user = null;
    startSessionSpy.mockReset();
    endSessionSpy.mockReset();
    jacSpeakSpy.mockReset();
    microphoneReady.mockResolvedValue(true);
    window.sessionStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(fakeMicStream()) },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sessionResponse("app")));
  });

  it("autoboots a fresh authenticated session after tearing down the anonymous provider", async () => {
    const view = render(<JacLiveExperience />);

    await waitFor(() => expect(startSessionSpy).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      "/api/jac/convai/public-session",
      expect.objectContaining({ method: "POST" }),
    );
    expect(jacSpeakSpy).not.toHaveBeenCalled();

    authState.user = { id: 1 };
    await act(async () => {
      view.rerender(<JacLiveExperience />);
    });

    await waitFor(() => expect(endSessionSpy).toHaveBeenCalled());
    await waitFor(() => expect(startSessionSpy).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenCalledWith(
      "/api/jac/convai/session",
      expect.objectContaining({ method: "POST" }),
    );
    expect(jacSpeakSpy).not.toHaveBeenCalled();
  });
});