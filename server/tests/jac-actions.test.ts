import { describe, expect, it } from "vitest";
import { actionExecutionState, actionSuccessMessage } from "../jac-actions";

describe("JAC pending action execution result", () => {
  it.each([
    [{ success: false }],
    [{ ok: false }],
    [{ error: "validation failed" }],
  ])("treats a 2xx body with a failure signal as failed", (body) => {
    expect(actionExecutionState(200, body)).toBe("failed");
  });

  it("requires both a successful transport and no failure signal", () => {
    expect(actionExecutionState(500, { success: true })).toBe("failed");
    expect(actionExecutionState(201, { success: true })).toBe("succeeded");
  });

  it("uses a backend response message, not a fabricated completion claim", () => {
    expect(actionSuccessMessage({ message: "Job checkout created." })).toBe("Job checkout created.");
    expect(actionSuccessMessage({ success: true })).toBeNull();
  });
});