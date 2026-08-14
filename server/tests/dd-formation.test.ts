/**
 * Unit tests for buildDdFormationSteps — optional step classification.
 *
 * Guards against:
 *  - A step that is legally optional being reclassified as required: true
 *  - A known-optional step being removed from the output entirely
 *  - An optional step losing its optional_reason explanation
 */

import { describe, it, expect } from "vitest";
import { buildDdFormationSteps } from "../dd-formation";

// Steps that must NEVER be classified as required: true.
// These depend on jurisdiction, industry, or business activity — not on universal law.
const KNOWN_OPTIONAL_IDS = [
  "operating_agreement",
  "bank_account",
  "insurance",
  "guber_onboarding",
  "ein",
  "state_tax",
  "local_licenses",
  "industry_licenses",
] as const;

// Representative sample of entity types and states to exercise the builder.
const ENTITY_TYPES = ["LLC", "Sole Proprietor", "S-Corp", "C-Corp"] as const;
const TEST_STATES = ["CALIFORNIA", "TEXAS", "FLORIDA", "NEW YORK", ""] as const;

describe("buildDdFormationSteps — known-optional steps have required: false", () => {
  for (const stepId of KNOWN_OPTIONAL_IDS) {
    describe(`step id="${stepId}"`, () => {
      for (const bType of ENTITY_TYPES) {
        for (const state of TEST_STATES) {
          const label = `${bType} / state="${state || "(empty)"}"`;
          it(`is required: false for ${label}`, () => {
            const steps = buildDdFormationSteps(bType, state);
            const step = steps.find((s) => s.id === stepId);

            // Not every step appears for every entity type (e.g. operating_agreement
            // is LLC-only). When it appears it must not be marked required.
            if (step !== undefined) {
              expect(
                step.required,
                `Step "${stepId}" must not be required: true for ${label}`,
              ).toBe(false);
            }
          });
        }
      }
    });
  }
});

describe("buildDdFormationSteps — operating_agreement", () => {
  it("appears for LLC and is required: false", () => {
    const steps = buildDdFormationSteps("LLC", "TEXAS");
    const step = steps.find((s) => s.id === "operating_agreement");
    expect(step, "operating_agreement step missing for LLC").toBeDefined();
    expect(step!.required).toBe(false);
  });

  it("does not appear for Sole Proprietor", () => {
    const steps = buildDdFormationSteps("Sole Proprietor", "TEXAS");
    expect(steps.find((s) => s.id === "operating_agreement")).toBeUndefined();
  });

  it("has an optional_reason explaining when it applies", () => {
    const steps = buildDdFormationSteps("LLC", "CALIFORNIA");
    const step = steps.find((s) => s.id === "operating_agreement");
    expect(step!.optional_reason).toBeTruthy();
  });
});

describe("buildDdFormationSteps — bank_account", () => {
  it("is required: false for LLC", () => {
    const steps = buildDdFormationSteps("LLC", "CALIFORNIA");
    const step = steps.find((s) => s.id === "bank_account");
    expect(step).toBeDefined();
    expect(step!.required).toBe(false);
  });

  it("is required: false for Sole Proprietor", () => {
    const steps = buildDdFormationSteps("Sole Proprietor", "FLORIDA");
    const step = steps.find((s) => s.id === "bank_account");
    expect(step).toBeDefined();
    expect(step!.required).toBe(false);
  });
});

describe("buildDdFormationSteps — insurance", () => {
  it("is required: false for LLC", () => {
    const steps = buildDdFormationSteps("LLC", "NEW YORK");
    const step = steps.find((s) => s.id === "insurance");
    expect(step).toBeDefined();
    expect(step!.required).toBe(false);
  });

  it("is required: false for S-Corp", () => {
    const steps = buildDdFormationSteps("S-Corp", "WASHINGTON");
    const step = steps.find((s) => s.id === "insurance");
    expect(step).toBeDefined();
    expect(step!.required).toBe(false);
  });
});

describe("buildDdFormationSteps — guber_onboarding", () => {
  it("is required: false for every entity type", () => {
    for (const bType of ENTITY_TYPES) {
      const steps = buildDdFormationSteps(bType, "TEXAS");
      const step = steps.find((s) => s.id === "guber_onboarding");
      expect(step, `guber_onboarding missing for ${bType}`).toBeDefined();
      expect(
        step!.required,
        `guber_onboarding must be required: false for ${bType}`,
      ).toBe(false);
    }
  });
});

describe("buildDdFormationSteps — legitimately required steps", () => {
  it("name_search is required: true for LLC", () => {
    const steps = buildDdFormationSteps("LLC", "TEXAS");
    const step = steps.find((s) => s.id === "name_search");
    expect(step).toBeDefined();
    expect(step!.required).toBe(true);
  });

  it("formation_filing is required: true for LLC", () => {
    const steps = buildDdFormationSteps("LLC", "CALIFORNIA");
    const step = steps.find((s) => s.id === "formation_filing");
    expect(step).toBeDefined();
    expect(step!.required).toBe(true);
  });

  it("formation_filing is NOT present for Sole Proprietor (no state filing needed)", () => {
    const steps = buildDdFormationSteps("Sole Proprietor", "TEXAS");
    expect(steps.find((s) => s.id === "formation_filing")).toBeUndefined();
  });
});

describe("buildDdFormationSteps — structural guarantees", () => {
  it("every optional step has a non-empty optional_reason", () => {
    const steps = buildDdFormationSteps("LLC", "CALIFORNIA");
    for (const step of steps.filter((s) => !s.required)) {
      expect(
        step.optional_reason,
        `Optional step "${step.id}" is missing optional_reason`,
      ).toBeTruthy();
    }
  });

  it("all step ids are unique within a single call", () => {
    const steps = buildDdFormationSteps("LLC", "TEXAS");
    const ids = steps.map((s) => s.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("all steps have completed: false by default", () => {
    const steps = buildDdFormationSteps("LLC", "FLORIDA");
    for (const step of steps) {
      expect(step.completed).toBe(false);
    }
  });
});
