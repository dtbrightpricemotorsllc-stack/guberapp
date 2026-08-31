// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";

const authState = vi.hoisted(() => ({ user: null as { id: number } | null }));
const microphoneReady = vi.hoisted(() => vi.fn());
const saveGuestDraftSpy = vi.hoisted(() => vi.fn());
const saveServiceOfferPrefillSpy = vi.hoisted(() => vi.fn());
const realtimeProps = vi.hoisted(() => ({ current: null as any }));
const realtimeHandle = vi.hoisted(() => ({
  end: vi.fn(), reconnect: vi.fn(), toggleMute: vi.fn(), speakApprovedText: vi.fn(),
}));

vi.mock("@/components/jac/jac-openai-realtime-session", () => ({
  JacOpenAIRealtimeSession: React.forwardRef((props: any, ref: any) => {
    realtimeProps.current = props;
    React.useImperativeHandle(ref, () => realtimeHandle);
    React.useEffect(() => () => { realtimeHandle.end(); }, []);
    return null;
  }),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: authState.user }) }));
vi.mock("@/lib/platform", () => ({ isNativeApp: false }));
vi.mock("@/hooks/use-guest-jac-session", () => ({
  useGuestJacSession: () => ({ guestSessionId: "guest-test", saveGuestDraft: saveGuestDraftSpy }),
}));
vi.mock("@/lib/jac-listing-prefill", () => ({ saveServiceOfferPrefill: saveServiceOfferPrefillSpy }));
vi.mock("@/lib/jac-tts", () => ({ cancelAllJacAudio: vi.fn(), unlockAudioContext: vi.fn() }));
vi.mock("@/components/jac/jac-character-renderer", () => ({
  JacCharacterRenderer: () => <div data-testid="jac-character" />,
}));
vi.mock("@/lib/jac-live-coordination", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/jac-live-coordination")>();
  return { ...actual, isJacMicrophoneReady: microphoneReady };
});

import { getJacLiveSessionEndpoint, JacLiveExperience } from "./jac-live-experience";

describe("JacLiveExperience realtime voice", () => {
  afterEach(cleanup);
  beforeEach(() => {
    authState.user = null;
    realtimeProps.current = null;
    Object.values(realtimeHandle).forEach(spy => spy.mockReset());
    microphoneReady.mockResolvedValue(true);
    window.sessionStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "I can help you find nearby jobs.", route: "/jobs" }),
    }));
  });

  it("auto-starts web voice when microphone access is already granted", async () => {
    const view = render(<JacLiveExperience />);
    expect(getJacLiveSessionEndpoint(false)).toBe("/api/jac/realtime-token/guest");
    await waitFor(() => expect(realtimeProps.current.active).toBe(true));
    expect(realtimeProps.current.sessionEndpoint).toBe("/api/jac/realtime-token/guest");
    expect(realtimeProps.current.e2eTarget).toBe("homepage");
    authState.user = { id: 1 };
    view.rerender(<JacLiveExperience />);
    await waitFor(() => expect(realtimeHandle.end).toHaveBeenCalled());
    expect(realtimeProps.current.sessionEndpoint).toBe("/api/jac/realtime-token/session");
  });

  it("keeps text available without attempting voice when permission is not ready", async () => {
    microphoneReady.mockResolvedValue(false);
    const view = render(<JacLiveExperience />);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(realtimeProps.current.active).toBe(false);
    expect(view.getByRole("button", { name: /start voice/i })).toBeTruthy();
    expect(view.getByLabelText("Message JAC")).toBeTruthy();
  });

  it("routes a voice transcript through onboard once and speaks only approved text", async () => {
    const view = render(<JacLiveExperience />);
    fireEvent.click(view.getByRole("button", { name: /start voice/i }));
    await waitFor(() => expect(realtimeProps.current.active).toBe(true));
    await act(async () => { realtimeProps.current.onUserTranscript("Find me work nearby"); });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/jac/onboard", expect.anything()));
    expect(realtimeHandle.speakApprovedText).toHaveBeenCalledWith("I can help you find nearby jobs.");
    act(() => realtimeProps.current.onJacResponse("I can help you find nearby jobs."));
    fireEvent.click(view.getByRole("button", { name: "Chat" }));
    expect(view.getAllByText("I can help you find nearby jobs.")).toHaveLength(1);
  });

  it("does not retry an initial voice failure", async () => {
    const view = render(<JacLiveExperience />);
    fireEvent.click(view.getByRole("button", { name: /start voice/i }));
    act(() => realtimeProps.current.onError("Voice connection lost."));
    expect(view.getByTestId("jac-live-voice-error").textContent)
      .toContain("Voice is unavailable right now. JAC text is still ready.");
    await new Promise(resolve => setTimeout(resolve, 800));
    expect(realtimeHandle.reconnect).not.toHaveBeenCalled();
  });

  it("reconnects at most twice after a connected disconnect", async () => {
    const view = render(<JacLiveExperience />);
    fireEvent.click(view.getByRole("button", { name: /start voice/i }));
    act(() => realtimeProps.current.onPhaseChange("listening"));
    act(() => realtimeProps.current.onError("network lost"));
    await waitFor(() => expect(realtimeHandle.reconnect).toHaveBeenCalledTimes(1), { timeout: 1200 });
    act(() => realtimeProps.current.onError("network lost"));
    await waitFor(() => expect(realtimeHandle.reconnect).toHaveBeenCalledTimes(2), { timeout: 2200 });
    act(() => realtimeProps.current.onError("network lost"));
    await new Promise(resolve => setTimeout(resolve, 1800));
    expect(realtimeHandle.reconnect).toHaveBeenCalledTimes(2);
  });
});