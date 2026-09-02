import { describe, expect, it } from "vitest";
import { recognizeJacWorkflow } from "./jac-workflow";

describe("recognizeJacWorkflow", () => {
  it("only recognizes explicit registration and nearby work requests", () => {
    expect(recognizeJacWorkflow("Please create a GUBER account")).toMatchObject({ workflow: "registration" });
    expect(recognizeJacWorkflow("Find nearby jobs for me in 90210")).toMatchObject({
      workflow: "browse_jobs",
      collectedFields: { zip: "90210" },
    });
    expect(recognizeJacWorkflow("I need help")).toBeNull();
  });

  it("never treats voice credentials as workflow input", () => {
    expect(recognizeJacWorkflow("Create an account, my password is secret")).toBeNull();
    expect(recognizeJacWorkflow("Find nearby jobs, my verification code is 123456")).toBeNull();
  });
});