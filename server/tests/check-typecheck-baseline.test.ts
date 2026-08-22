import { describe, expect, it } from "vitest";
import {
  compareDiagnostics,
  parseDiagnostics,
} from "../../scripts/typecheck-baseline.mjs";

const knownDiagnostic = {
  path: "server/routes.ts",
  line: 42,
  column: 7,
  code: "TS2322",
  message: "Type 'string' is not assignable to type 'number'.",
};

describe("TypeScript diagnostic baseline", () => {
  it("accepts an exact known diagnostic", () => {
    expect(compareDiagnostics([knownDiagnostic], [knownDiagnostic])).toEqual({
      unexpected: [],
      resolved: [],
    });
  });

  it("rejects a new diagnostic in an already-baselined file", () => {
    const newDiagnostic = {
      ...knownDiagnostic,
      line: 43,
      message: "Type 'boolean' is not assignable to type 'number'.",
    };

    const comparison = compareDiagnostics(
      [knownDiagnostic, newDiagnostic],
      [knownDiagnostic],
    );
    expect(comparison.unexpected).toEqual([newDiagnostic]);
  });

  it("parses multiline compiler messages into stable fingerprints", () => {
    const diagnostics = parseDiagnostics(
      "server/routes.ts(42,7): error TS2322: Type 'string' is not assignable\n" +
      "  to type 'number'.\n" +
      "Found 1 error.",
    );

    expect(diagnostics).toEqual([knownDiagnostic]);
  });
});