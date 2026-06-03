import { describe, it, expect } from "vitest";
// @ts-expect-error - .mjs script without type declarations
import { runAudit } from "../../scripts/audit-statebleed.mjs";

type Finding = {
  file: string;
  selector: string;
  branches: number;
  scopedFields: number;
  resetFields: number;
  message: string;
  changeLine: number;
};

type AuditResult = { findings: Finding[]; filesScanned: number };

describe("contextual logic auditor — state bleed", () => {
  it("finds no unguarded state-bleed in form/flow components", () => {
    const { findings, filesScanned } = runAudit() as AuditResult;
    expect(filesScanned).toBeGreaterThan(0);
    if (findings.length > 0) {
      const detail = findings
        .map((f) => `  - ${f.file}:${f.changeLine} — ${f.message}`)
        .join("\n");
      throw new Error(
        `State-bleed audit found ${findings.length} issue(s):\n${detail}\n\n` +
          `Reset the mode-scoped fields when the selector changes, or add a ` +
          `"statebleed-allow: <reason>" comment if the persistence is intentional.`,
      );
    }
    expect(findings.length).toBe(0);
  });

  it("detects an unreset mode selector (regression guard works)", () => {
    const { findings } = runAudit({
      targets: ["server/tests/fixtures/statebleed-bad.tsx"],
    }) as AuditResult;
    expect(findings.length).toBeGreaterThan(0);
    const bad = findings.find((f) => f.selector === "mode");
    expect(bad).toBeDefined();
    expect(bad!.scopedFields).toBe(3);
    expect(bad!.resetFields).toBe(0);
  });
});
