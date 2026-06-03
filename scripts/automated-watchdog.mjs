#!/usr/bin/env node
/**
 * automated-watchdog.mjs — GUBER Mission Control health engine
 *
 * An autonomous monitor that keeps GUBER's infrastructure "green". It runs three
 * independent checks and rolls them up into a single health payload that the
 * Mission Control dashboard can ping:
 *
 *   1. STATE-BLEED AUDIT  — `node scripts/audit-statebleed.mjs --json` over all
 *      form/flow components. Any finding turns the system RED.
 *   2. CORE TEST SUITES   — the 7 protected vitest suites (business-auth,
 *      stripe-webhooks, oauth-state, studio-featured-admin, studio-pricing,
 *      login, handsfree-capture). Any failing test turns the system RED.
 *   3. MANIFEST INTEGRITY — required native Android/iOS location + notification
 *      keys must be present. Any missing key turns the system RED.
 *
 * The numbers in the payload (files_audited, total_tests_passing) are MEASURED
 * live on every run — they are never hardcoded — so real regressions surface.
 *
 * Usage:
 *   node scripts/automated-watchdog.mjs            # run once, human-readable
 *   node scripts/automated-watchdog.mjs --json     # run once, machine JSON
 *   node scripts/automated-watchdog.mjs --loop     # continuous background loop
 *   node scripts/automated-watchdog.mjs --loop --interval 300   # every 5 min
 *
 * Programmatic (used by the Mission Control endpoint):
 *   import { runHealthCheck } from "./scripts/automated-watchdog.mjs";
 *   const report = await runHealthCheck();
 */

import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// The 7 protected suites — the exact set verified at the 152-test baseline.
export const PROTECTED_TEST_SUITES = [
  "server/tests/stripe-webhook-credits.test.ts",
  "server/tests/business-auth-endpoints.test.ts",
  "server/tests/oauth-state.test.ts",
  "server/tests/studio-featured-admin.test.ts",
  "server/tests/studio-pricing.test.ts",
  "client/src/pages/login.test.tsx",
  "client/src/components/handsfree-capture.test.tsx",
];

// Required native manifest keys. Missing any of these is a RED-level failure.
const MANIFEST_REQUIREMENTS = [
  {
    label: "Android location + notification permissions",
    file: "android/app/src/main/AndroidManifest.xml",
    keys: [
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.POST_NOTIFICATIONS",
      "com.google.firebase.messaging.default_notification_channel_id",
    ],
  },
  {
    label: "iOS location usage descriptions",
    file: "ios/App/App/Info.plist",
    keys: [
      "NSLocationWhenInUseUsageDescription",
      "NSLocationAlwaysAndWhenInUseUsageDescription",
    ],
  },
  {
    label: "iOS push entitlement",
    file: "ios/App/App/App.entitlements",
    keys: ["aps-environment"],
  },
];

const STATUS_FILE = join(ROOT, ".local", "state", "mission-control-status.json");

// ── helpers ───────────────────────────────────────────────────────────────────

function runCommand(command, args, { timeoutMs = 180_000 } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      clearTimeout(timer);
      resolveRun({ code: -1, stdout, stderr: stderr + String(err), timedOut });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({ code, stdout, stderr, timedOut });
    });
  });
}

// ── check 1: state-bleed audit ──────────────────────────────────────────────────

async function checkStateBleed() {
  const errors = [];
  const res = await runCommand("node", ["scripts/audit-statebleed.mjs", "--json"], {
    timeoutMs: 60_000,
  });

  if (res.timedOut) {
    return { ok: false, filesAudited: 0, findings: 0, errors: ["state-bleed audit timed out"] };
  }

  let parsed;
  try {
    parsed = JSON.parse(res.stdout.trim());
  } catch {
    return {
      ok: false,
      filesAudited: 0,
      findings: 0,
      errors: [`state-bleed audit produced unparseable output (exit ${res.code})`],
    };
  }

  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const filesAudited = Number(parsed.filesScanned) || 0;

  for (const f of findings) {
    errors.push(`state-bleed: ${f.file}:${f.changeLine} — ${f.message}`);
  }

  return { ok: findings.length === 0, filesAudited, findings: findings.length, errors };
}

// ── check 2: protected vitest suites ─────────────────────────────────────────────

async function checkTestSuites() {
  const errors = [];
  const outputFile = join(tmpdir(), `guber-watchdog-vitest-${Date.now()}.json`);

  const res = await runCommand(
    "npx",
    [
      "vitest",
      "run",
      ...PROTECTED_TEST_SUITES,
      "--reporter=json",
      `--outputFile=${outputFile}`,
    ],
    { timeoutMs: 240_000 },
  );

  if (res.timedOut) {
    return { ok: false, totalTests: 0, passing: 0, failing: 0, errors: ["test suite run timed out"] };
  }

  let report;
  try {
    report = JSON.parse(await readFile(outputFile, "utf8"));
  } catch {
    return {
      ok: false,
      totalTests: 0,
      passing: 0,
      failing: 0,
      errors: [`could not read vitest JSON report (exit ${res.code})`],
    };
  }

  const passing = Number(report.numPassedTests) || 0;
  const failing = Number(report.numFailedTests) || 0;
  const totalTests = Number(report.numTotalTests) || passing + failing;

  if (failing > 0) {
    for (const suite of report.testResults || []) {
      for (const assertion of suite.assertionResults || []) {
        if (assertion.status === "failed") {
          errors.push(`test failed: ${assertion.fullName || assertion.title}`);
        }
      }
    }
    if (errors.length === 0) errors.push(`${failing} test(s) failed`);
  }

  return { ok: failing === 0 && passing > 0, totalTests, passing, failing, errors };
}

// ── check 3: native manifest integrity ──────────────────────────────────────────

function checkManifests() {
  const errors = [];
  let checked = 0;

  for (const req of MANIFEST_REQUIREMENTS) {
    const abs = join(ROOT, req.file);
    if (!existsSync(abs)) {
      errors.push(`manifest missing: ${req.file}`);
      continue;
    }
    let contents = "";
    try {
      contents = readFileSync(abs, "utf8");
    } catch {
      errors.push(`manifest unreadable: ${req.file}`);
      continue;
    }
    for (const key of req.keys) {
      checked += 1;
      if (!contents.includes(key)) {
        errors.push(`manifest key missing: ${key} in ${req.file}`);
      }
    }
  }

  return { ok: errors.length === 0, keysChecked: checked, errors };
}

// ── orchestrator ────────────────────────────────────────────────────────────────

export async function runHealthCheck() {
  const started = Date.now();

  const [stateBleed, tests] = await Promise.all([checkStateBleed(), checkTestSuites()]);
  const manifests = checkManifests();

  const activeErrors = [...stateBleed.errors, ...tests.errors, ...manifests.errors];
  const status = activeErrors.length === 0 ? "GREEN" : "RED";

  const report = {
    status,
    total_tests_passing: tests.passing,
    files_audited: stateBleed.filesAudited,
    active_errors: activeErrors,
    checks: {
      state_bleed: {
        ok: stateBleed.ok,
        files_audited: stateBleed.filesAudited,
        findings: stateBleed.findings,
      },
      tests: {
        ok: tests.ok,
        total: tests.totalTests,
        passing: tests.passing,
        failing: tests.failing,
      },
      manifests: {
        ok: manifests.ok,
        keys_checked: manifests.keysChecked,
      },
    },
    duration_ms: Date.now() - started,
    checked_at: new Date().toISOString(),
  };

  // Best-effort persist so the dashboard can read the last-known state cheaply.
  try {
    await mkdir(dirname(STATUS_FILE), { recursive: true });
    await writeFile(STATUS_FILE, JSON.stringify(report, null, 2) + "\n");
  } catch {
    /* non-fatal */
  }

  return report;
}

export function readLastStatus() {
  try {
    return JSON.parse(readFileSync(STATUS_FILE, "utf8"));
  } catch {
    return null;
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────────

function printHuman(report) {
  const mark = report.status === "GREEN" ? "\u2713" : "\u2717";
  process.stdout.write(
    `${mark} Mission Control: ${report.status} ` +
      `(${report.total_tests_passing} tests passing, ` +
      `${report.files_audited} files audited, ` +
      `${report.duration_ms}ms)\n`,
  );
  if (report.active_errors.length) {
    process.stdout.write(`\n${report.active_errors.length} active error(s):\n`);
    for (const e of report.active_errors) process.stdout.write(`  - ${e}\n`);
  }
}

async function main(argv) {
  const args = argv.slice(2);
  const json = args.includes("--json");
  const loop = args.includes("--loop") || args.includes("--watch");
  const intervalIdx = args.indexOf("--interval");
  const intervalSec =
    intervalIdx !== -1 && args[intervalIdx + 1] ? Number(args[intervalIdx + 1]) : 300;

  if (loop) {
    process.stdout.write(
      `[watchdog] starting loop — every ${intervalSec}s. Ctrl-C to stop.\n`,
    );
    let stopping = false;
    process.on("SIGINT", () => {
      stopping = true;
      process.stdout.write("\n[watchdog] stopping.\n");
      process.exit(0);
    });
    // eslint-disable-next-line no-constant-condition
    while (!stopping) {
      const report = await runHealthCheck();
      printHuman(report);
      await new Promise((r) => setTimeout(r, Math.max(5, intervalSec) * 1000));
    }
    return;
  }

  const report = await runHealthCheck();
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    printHuman(report);
  }
  process.exit(report.status === "GREEN" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv);
}
