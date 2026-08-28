// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { JAC_ELEVENLABS_VOICE_ID } from "@shared/jac-voice";

const startSessionSpy = vi.hoisted(() => vi.fn());
const endSessionSpy = vi.hoisted(() => vi.fn());
const microphoneReady = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ user: null as { id: number } | null }));
const jacSpeakSpy = vi.hoisted(() => vi.fn());
const saveGuestDraftSpy = vi.hoisted(() => vi.fn());
const saveServiceOfferPrefillSpy = vi.hoisted(() => vi.fn());
const convaiCallbacks = vi.hoisted(() => ({ current: null as any }));

vi.mock("@elevenlabs/react", () => ({
  ConversationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useConversation: (callbacks: any) => {
    convaiCallbacks.current = callbacks;
    return {
      startSession: startSessionSpy,
      endSession: endSessionSpy,
      status: "disconnected",
      isSpeaking: false,
      isListening: false,
      isMuted: false,
      setMuted: vi.fn(),
    };
  },
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("@/lib/platform", () => ({
  isNativeApp: false,
}));

vi.mock("@/hooks/use-guest-jac-session", () => ({
  useGuestJacSession: () => ({
    guestSessionId: "guest-test",
    saveGuestDraft: saveGuestDraftSpy,
  }),
}));

vi.mock("@/lib/jac-listing-prefill", () => ({
  saveServiceOfferPrefill: saveServiceOfferPrefillSpy,
}));

vi.mock("@/lib/jac-tts", () => ({
  jacSpeak: jacSpeakSpy,
  cancelAllJacAudio: vi.fn(),
  setJacConvaiActive: vi.fn(),
  unlockAudioContext: vi.fn(),
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
      voiceId: JAC_ELEVENLABS_VOICE_ID,
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
  afterEach(() => cleanup());

  beforeEach(() => {
    authState.user = null;
    startSessionSpy.mockReset();
    endSessionSpy.mockReset();
    jacSpeakSpy.mockReset();
    saveGuestDraftSpy.mockReset();
    saveServiceOfferPrefillSpy.mockReset();
    convaiCallbacks.current = null;
    microphoneReady.mockResolvedValue(true);
    window.sessionStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(fakeMicStream()) },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sessionResponse("app")));
  });

  it("keeps web text ready and starts voice only from the explicit mic action", async () => {
    const view = render(<JacLiveExperience />);

    expect(startSessionSpy).not.toHaveBeenCalled();
    expect(view.getByRole("button", { name: /start voice/i })).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: /start voice/i }));
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

    expect(endSessionSpy).toHaveBeenCalled();
    expect(startSessionSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(view.getByRole("button", { name: /start voice/i }));
    await waitFor(() => expect(startSessionSpy).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenCalledWith(
      "/api/jac/convai/session",
      expect.objectContaining({ method: "POST" }),
    );
    expect(jacSpeakSpy).not.toHaveBeenCalled();
  });

  it("persists a guest service offer and exposes the signup return route", async () => {
    microphoneReady.mockResolvedValue(false);
    const collected = {
      title: "Same-day lawn care",
      category: "On-Demand Help",
      serviceType: "Lawn / Yard Work",
      description: "Mowing, edging, and cleanup.",
      capabilities: ["Mowing", "Edging"],
      pricingType: "starting_at",
      startingPrice: 65,
      availableNow: true,
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply: "Your service-offer draft is ready.",
        route: "/signup?intent=worker&returnTo=%2Foffer-service&from=jac",
        guestDraft: { type: "service_offer", data: collected },
      }),
    } as Response);

    const view = render(<JacLiveExperience />);
    fireEvent.change(view.getByLabelText("Message JAC"), {
      target: { value: "I offer lawn care" },
    });
    fireEvent.click(view.getByLabelText("Send"));

    await waitFor(() => {
      expect(saveServiceOfferPrefillSpy).toHaveBeenCalledWith(collected);
    });
    expect(saveGuestDraftSpy).toHaveBeenCalledWith("service_offer", collected);
    expect(view.getByRole("link", { name: /Publish your service/i }).getAttribute("href"))
      .toBe("/signup?intent=worker&returnTo=%2Foffer-service&from=jac");
  });

  it("recovers an unexpected mobile disconnect without losing voice/text history", async () => {
    const view = render(<JacLiveExperience />);
    fireEvent.click(view.getByRole("button", { name: /start voice/i }));
    await waitFor(() => expect(startSessionSpy).toHaveBeenCalledTimes(1));

    act(() => {
      convaiCallbacks.current.onConnect();
      convaiCallbacks.current.onMessage({ source: "user", message: "Find me work nearby" });
      convaiCallbacks.current.onMessage({ source: "ai", message: "I can help you find nearby jobs." });
      convaiCallbacks.current.onDisconnect({
        reason: "error",
        message: "network lost",
        context: { type: "close", code: 1006, reason: "abnormal" },
      });
    });

    expect(view.getByText("Reconnecting…")).toBeTruthy();
    await waitFor(() => expect(startSessionSpy).toHaveBeenCalledTimes(2), { timeout: 2500 });

    fireEvent.click(view.getByRole("button", { name: "Chat" }));
    expect(view.getByText("Find me work nearby")).toBeTruthy();
    expect(view.getByText("I can help you find nearby jobs.")).toBeTruthy();

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply: "Here are the next steps.",
        route: "/jobs",
      }),
    } as Response);
    fireEvent.change(view.getByLabelText("Message JAC"), {
      target: { value: "Show me those jobs" },
    });
    fireEvent.click(view.getByLabelText("Send"));

    await waitFor(() => expect(view.getByText("Here are the next steps.")).toBeTruthy());
    const onboardCall = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/jac/onboard");
    const body = JSON.parse(String((onboardCall?.[1] as RequestInit)?.body));
    expect(body.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "user", content: "Find me work nearby" }),
      expect.objectContaining({ role: "assistant", content: "I can help you find nearby jobs." }),
      expect.objectContaining({ role: "user", content: "Show me those jobs" }),
    ]));
  });
});