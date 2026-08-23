// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  appendSharedJacMessage,
  claimJacWelcomeGreeting,
  createJacAutomaticVoiceStartClaim,
  getJacQuickActions,
  isServiceDiscoveryIntent,
  readSharedJacConversation,
} from "./jac-live-coordination";
import { getJacLiveSessionEndpoint } from "@/components/jac/jac-live-experience";

describe("JAC live coordination", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("shares the same service discovery action across JAC surfaces", () => {
    for (const surface of ["homepage", "live", "assistant"] as const) {
      expect(getJacQuickActions(surface).some((action) => action.id === "services")).toBe(true);
    }
  });

  it("recognizes provider requests without confusing them with marketplace intents", () => {
    expect(isServiceDiscoveryIntent("I need a local plumber today")).toBe(true);
    expect(isServiceDiscoveryIntent("Can I find lawn care near me?")).toBe(true);
    expect(isServiceDiscoveryIntent("I want to sell my old bike")).toBe(false);
  });

  it("keeps a compact ordered conversation that another JAC surface can resume", () => {
    appendSharedJacMessage({ id: "user-1", role: "user", content: "I need cleaning help", source: "live" });
    appendSharedJacMessage({ id: "jac-1", role: "assistant", content: "I can help you browse verified services.", source: "live" });

    expect(readSharedJacConversation()).toEqual([
      expect.objectContaining({ id: "user-1", role: "user", content: "I need cleaning help" }),
      expect.objectContaining({ id: "jac-1", role: "assistant", content: "I can help you browse verified services." }),
    ]);
  });

  it("switches from the canonical anonymous homepage endpoint when authentication hydrates", () => {
    const anonymousEndpoint = getJacLiveSessionEndpoint(false);
    const authenticatedEndpoint = getJacLiveSessionEndpoint(true);

    expect(anonymousEndpoint).toBe("/api/jac/convai/public-session");
    expect(authenticatedEndpoint).toBe("/api/jac/convai/session");
    expect(authenticatedEndpoint).not.toBe(anonymousEndpoint);
  });

  it("shares one generic greeting across JAC surfaces for the browser session", () => {
    expect(claimJacWelcomeGreeting()).toBe(true);
    expect(claimJacWelcomeGreeting()).toBe(false);
  });

  it("allows one automatic live start per mounted JAC lifecycle", () => {
    const firstMount = createJacAutomaticVoiceStartClaim();
    expect(firstMount()).toBe(true);
    expect(firstMount()).toBe(false);
  });

  it("allows a new JAC mount to autoboot after a sign-in return", () => {
    const firstMount = createJacAutomaticVoiceStartClaim();
    const returnedMount = createJacAutomaticVoiceStartClaim();

    expect(firstMount()).toBe(true);
    expect(returnedMount()).toBe(true);
  });
});