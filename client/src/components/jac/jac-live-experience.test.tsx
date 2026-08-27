// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";

const startSessionSpy = vi.hoisted(() => vi.fn());
const endSessionSpy = vi.hoisted(() => vi.fn());
const microphoneReady = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ user: null as { id: number } | null }));
const jacSpeakSpy = vi.hoisted(() => vi.fn());
const saveGuestDraftSpy = vi.hoisted(() => vi.fn());
const saveServiceOfferPrefillSpy = vi.hoisted(() => vi.fn());

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
  afterEach(() => cleanup());

  beforeEach(() => {
    authState.user = null;
    startSessionSpy.mockReset();
    endSessionSpy.mockReset();
    jacSpeakSpy.mockReset();
    saveGuestDraftSpy.mockReset();
    saveServiceOfferPrefillSpy.mockReset();
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
});