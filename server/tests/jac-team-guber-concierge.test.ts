import { describe, expect, it } from "vitest";
import { buildJacSystemPrompt } from "../jac-realtime";
import {
  gateJacRouteForConversation,
  hasGuestGoalSignal,
} from "../jac-team-guber-concierge";

describe("Team GUBER concierge policy", () => {
  it("does not route an unrelated intent to jobs or hiring", () => {
    const conversation = [
      { role: "user" as const, content: "My car payment is behind and I do not know what to do first." },
    ];

    expect(gateJacRouteForConversation("/browse-jobs", conversation)).toBeNull();
    expect(gateJacRouteForConversation("/post-job", conversation)).toBeNull();
  });

  it("keeps direct work and hiring routes available when explicitly requested", () => {
    expect(gateJacRouteForConversation("/browse-jobs", [
      { role: "user", content: "I need work this weekend and have a truck." },
    ])).toBe("/browse-jobs");

    expect(gateJacRouteForConversation("/post-job", [
      { role: "user", content: "I need to hire moving help for Saturday." },
    ])).toBe("/post-job");
  });

  it("requires a concrete guest goal before a signup progression can begin", () => {
    expect(hasGuestGoalSignal([{ role: "user", content: "Hi" }])).toBe(false);
    expect(hasGuestGoalSignal([
      { role: "user", content: "I want to sell my work van so I can reduce my expenses." },
    ])).toBe(true);
  });

  it("carries the concierge policy into realtime voice", () => {
    const prompt = buildJacSystemPrompt(null);

    expect(prompt).toContain("mall with many doors");
    expect(prompt).toContain("Do not ask them to sign up at the greeting");
    expect(prompt).toContain("Before You Foreclose");
  });
});