// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";

const authState = vi.hoisted(() => ({ user: null as { id: number } | null }));
const microphoneReady = vi.hoisted(() => vi.fn());
const saveGuestDraftSpy = vi.hoisted(() => vi.fn());
const saveServiceOfferPrefillSpy = vi.hoisted(() => vi.fn());
const convaiProps = vi.hoisted(() => ({ current: null as any }));
const convaiHandle = vi.hoisted(() => ({
  activate: vi.fn(), reconnect: vi.fn(), toggleMute: vi.fn(),
}));

vi.mock("@elevenlabs/react", () => ({
  ConversationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/jac/jac-convai-session", () => ({
  JacConvaiSession: React.forwardRef((props: any, ref: any) => {
    convaiProps.current = props;
    React.useImperativeHandle(ref, () => convaiHandle);
    React.useEffect(() => () => {}, []);
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
    convaiProps.current = null;
    Object.values(convaiHandle).forEach(spy => spy.mockReset());
    microphoneReady.mockResolvedValue(true);
    window.sessionStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "I can help you find nearby jobs.", route: "/jobs" }),
    }));
  });

  it("auto-starts ConvAI voice when microphone access is already granted", async () => {
    const view = render(<JacLiveExperience />);
    expect(getJacLiveSessionEndpoint(false)).toBe("/api/jac/convai/investor-session");
    await waitFor(() => expect(convaiProps.current.active).toBe(true));
    expect(convaiProps.current.sessionEndpoint).toBe("/api/jac/convai/investor-session");
    expect(convaiProps.current.e2eTarget).toBe("homepage");
    authState.user = { id: 1 };
    view.rerender(<JacLiveExperience />);
    await waitFor(() => expect(convaiProps.current.sessionEndpoint).toBe("/api/jac/convai/session"));
  });

  it("keeps text available without attempting voice when permission is not ready", async () => {
    microphoneReady.mockResolvedValue(false);
    const view = render(<JacLiveExperience />);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(convaiProps.current.active).toBe(false);
    expect(view.getByRole("button", { name: /start voice/i })).toBeTruthy();
    expect(view.getByLabelText("Message JAC")).toBeTruthy();
  });

  it("stays text-only when the public door owns the voice lifecycle", async () => {
    const view = render(<JacLiveExperience voiceDisabled />);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(convaiProps.current).toBeNull();
    expect(view.queryByRole("button", { name: /start voice/i })).toBeNull();
    expect(view.getByLabelText("Message JAC")).toBeTruthy();
    expect(view.getByText("Text chat is ready")).toBeTruthy();
  });

  it("keeps ConvAI transcript and assistant response in the shared conversation", async () => {
    const view = render(<JacLiveExperience />);
    fireEvent.click(view.getByRole("button", { name: /start voice/i }));
    await waitFor(() => expect(convaiProps.current.active).toBe(true));
    act(() => convaiProps.current.onUserTranscript("Find me work nearby"));
    act(() => convaiProps.current.onJacResponse("I can help you find nearby jobs."));
    fireEvent.click(view.getByRole("button", { name: "Chat" }));
    expect(view.getAllByText("I can help you find nearby jobs.")).toHaveLength(1);
  });

  it("keeps text available after an initial ConvAI failure", async () => {
    const view = render(<JacLiveExperience />);
    await waitFor(() => expect(convaiProps.current.active).toBe(true));
    act(() => convaiProps.current.onError("Voice connection lost."));
    expect(view.getByTestId("jac-live-voice-error").textContent)
      .toContain("Voice is unavailable right now. JAC text is still ready.");
    expect(convaiProps.current.active).toBe(false);
    expect(convaiHandle.reconnect).not.toHaveBeenCalled();
  });

  it("reconnects at most twice after a connected disconnect", async () => {
    const view = render(<JacLiveExperience />);
    fireEvent.click(view.getByRole("button", { name: /start voice/i }));
    act(() => convaiProps.current.onPhaseChange("listening"));
    act(() => convaiProps.current.onError("network lost"));
    await waitFor(() => expect(convaiHandle.reconnect).toHaveBeenCalledTimes(1), { timeout: 1200 });
    act(() => convaiProps.current.onError("network lost"));
    await waitFor(() => expect(convaiHandle.reconnect).toHaveBeenCalledTimes(2), { timeout: 2200 });
    act(() => convaiProps.current.onError("network lost"));
    await new Promise(resolve => setTimeout(resolve, 1800));
    expect(convaiHandle.reconnect).toHaveBeenCalledTimes(2);
  });
});