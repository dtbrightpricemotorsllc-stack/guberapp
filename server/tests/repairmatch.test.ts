import { describe, expect, it } from "vitest";
import {
  parseRepairMatchAnalysis,
  computeRepairMatchTotals,
  normalizeRepairMatchInput,
  repairMatchGenerationClaim,
  repairMatchVisionJsonSchema,
  REPAIRMATCH_DISCLOSURE,
  repairMatchDistribution,
  repairMatchReviewedLineCopies,
  repairMatchShopContact,
  validateRepairMatchPhotos,
} from "../repairmatch";

const validLine = {
  component: "Front bumper",
  recommendation: "repair",
  bodyHoursLow: 1,
  bodyHoursHigh: 2,
  refinishHoursLow: 1,
  refinishHoursHigh: 2,
  mechanicalHoursLow: -1, // normalized to null rather than persisting an invalid range
  confidence: 2, // bounded by the parser
  inspectionRequired: true,
  notes: "Visible scuff",
};

describe("RepairMatch backend policy", () => {
  it("validates exactly 3–10 safe HTTPS photo URLs", () => {
    expect(validateRepairMatchPhotos(["https://img/1", "https://img/2"])).toBeNull();
    expect(validateRepairMatchPhotos(Array.from({ length: 11 }, (_, i) => `https://img/${i}`))).toBeNull();
    expect(validateRepairMatchPhotos(["http://img/1", "https://img/2", "https://img/3"])).toBeNull();
    expect(validateRepairMatchPhotos(["https://img/1", "https://img/2", "https://img/3"])).toHaveLength(3);
  });

  it("strictly parses bounded visual analysis and retains preliminary disclosure", () => {
    const parsed = parseRepairMatchAnalysis(JSON.stringify({
      summary: " ".repeat(2) + "Bumper scuff",
      severity: "not-a-real-severity",
      confidence: 0.8,
      inspectionRequired: ["Check behind bumper"],
      totals: { bodyHoursLow: 1 },
      lines: [validLine],
    }));
    expect(parsed.severity).toBe("unknown");
    expect(parsed.lines[0].mechanicalHoursLow).toBeNull();
    expect(parsed.lines[0].confidence).toBe(1);
    expect(REPAIRMATCH_DISCLOSURE).toMatch(/preliminary/i);
    expect(REPAIRMATCH_DISCLOSURE).toMatch(/not a final estimate/i);
    expect(() => parseRepairMatchAnalysis(JSON.stringify({ lines: [{ ...validLine, recommendation: "diagnose" }] }))).toThrow("Malformed analysis line");
  });

  it("computes preliminary totals solely from validated line ranges", () => {
    const totals = computeRepairMatchTotals([
      { bodyHoursLow: 1, bodyHoursHigh: 2, refinishHoursLow: 0.5, refinishHoursHigh: 1, mechanicalHoursLow: 2, mechanicalHoursHigh: 3, partsAllowanceLow: 100, partsAllowanceHigh: 200 },
      { bodyHoursLow: 3, bodyHoursHigh: 4, partsAllowanceLow: -10, partsAllowanceHigh: 300 },
    ]);
    expect(totals).toMatchObject({ bodyHoursLow: 4, bodyHoursHigh: 6, refinishHoursLow: 0.5, mechanicalHoursHigh: 3, partsAllowanceLow: 100, partsAllowanceHigh: 500, totalLaborHoursLow: 6.5, totalLaborHoursHigh: 10 });
    const parsed = parseRepairMatchAnalysis(JSON.stringify({ summary: "", severity: "minor", confidence: 1, inspectionRequired: [], totals: { totalLaborHoursLow: 99999 }, lines: [validLine] }));
    expect(parsed.totals.totalLaborHoursLow).toBe(2);
  });

  it("requires every strict-schema line property and bounds stored input", () => {
    const required = repairMatchVisionJsonSchema.schema.properties.lines.items.required;
    expect(required).toEqual(expect.arrayContaining(["bodyHoursLow", "bodyHoursHigh", "refinishHoursLow", "refinishHoursHigh", "mechanicalHoursLow", "mechanicalHoursHigh", "partsAllowanceLow", "partsAllowanceHigh", "confidence"]));
    expect(normalizeRepairMatchInput({ make: "Toyota", nested: { abuse: "x" }, description: "x".repeat(3000) }, ["make", "description"])).toEqual({ make: "Toyota", description: "x".repeat(2000) });
  });

  it("expresses generation claim concurrency policy", () => {
    expect(repairMatchGenerationClaim({ generation_status: "processing", generation_key: "a" }, "a")).toBe("in_progress");
    expect(repairMatchGenerationClaim({ generation_status: "processing", generation_key: "a" }, "b")).toBe("conflict");
    expect(repairMatchGenerationClaim({ generation_status: "complete", generation_key: "a" }, "a")).toBe("idempotent");
    expect(repairMatchGenerationClaim({ generation_status: "failed", generation_key: "a" }, "b")).toBe("claim");
  });

  it("uses one eligible selected shop by default and caps nearby distribution", () => {
    expect(repairMatchDistribution("single", 12, [9, 12, 15])).toEqual([12]);
    expect(repairMatchDistribution("single", 77, [9, 12, 15])).toEqual([]);
    expect(repairMatchDistribution("nearby", null, [1, 2, 2, 3, 4, 5, 6, 7])).toEqual([1, 2, 3, 4, 5]);
  });

  it("masks customer contact until the selected opportunity is accepted", () => {
    const contact = { name: "Customer", email: "private@example.com", address: "1 Private Way" };
    expect(repairMatchShopContact("new", contact)).toBeUndefined();
    expect(repairMatchShopContact("responded", contact)).toBeUndefined();
    expect(repairMatchShopContact("accepted", contact)).toEqual(contact);
  });

  it("keeps original AI lines distinct from editable shop reviewed lines", () => {
    const aiLines = [{ id: 1, component: "Front bumper", recommendation: "repair" }];
    const edited = [{ estimateLineId: 1, component: "Front bumper", recommendation: "replace" }];
    const records = repairMatchReviewedLineCopies(aiLines, edited);
    records.reviewedLines[0].recommendation = "inspect";
    expect(records.originalLines).toEqual(aiLines);
    expect(records.originalLines[0].recommendation).toBe("repair");
    expect(records.reviewedLines[0].recommendation).toBe("inspect");
  });
});