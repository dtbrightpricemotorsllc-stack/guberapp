import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  compareDiagnostics,
  parseDiagnostics,
} from "./typecheck-baseline.mjs";

const baselinePath = resolve("scripts/typecheck-baseline.json");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const result = spawnSync("npx", ["tsc", "--pretty", "false", "--noEmit"], {
  cwd: process.cwd(),
  encoding: "utf8",
});

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
if (result.error) {
  console.error(`Unable to start TypeScript: ${result.error.message}`);
  process.exit(1);
}

const actual = parseDiagnostics(output);
if (result.status === 0) {
  console.log("TypeScript check passed with no diagnostics.");
  process.exit(0);
}

if (actual.length === 0) {
  console.error(output || "TypeScript exited unsuccessfully without diagnostics.");
  process.exit(1);
}

const comparison = compareDiagnostics(actual, baseline.diagnostics);
if (comparison.unexpected.length > 0) {
  console.error(
    `New TypeScript diagnostics outside the checked-in baseline (${comparison.unexpected.length}):`,
  );
  for (const diagnostic of comparison.unexpected) {
    console.error(
      `${diagnostic.path}(${diagnostic.line},${diagnostic.column}): ` +
      `error ${diagnostic.code}: ${diagnostic.message}`,
    );
  }
  process.exit(1);
}

const resolvedCount = comparison.resolved.length;
console.log(
  `TypeScript release baseline passed: ${actual.length} known diagnostics` +
  (resolvedCount ? `, ${resolvedCount} resolved since the baseline` : "") +
  ".",
);
console.log("Run `npm run check:legacy` to inspect and reduce the legacy backlog.");