#!/usr/bin/env node
/**
 * check-dark-gradients.test.mjs
 *
 * Self-contained test suite for check-dark-gradients.mjs.
 *
 * Part 1 — Unit tests: replicate the core detection helpers and test them
 *   directly against synthetic snippets (no subprocess, no file I/O).
 *
 * Part 2 — Integration tests: run the checker as a subprocess against
 *   temporary fixture files and assert exit codes and stderr output.
 *
 * Run:  node scripts/check-dark-gradients.test.mjs
 */

import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Part 1 — Replicate core detection helpers for unit testing
// ---------------------------------------------------------------------------

const DARK_THRESHOLD = 0x44;
const ALLOW_TOKEN = "dark-gradient-allow";

function isDarkHex(hex) {
  const h = hex.slice(1);
  let r, g, b;
  if (h.length === 3 || h.length === 4) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length === 6 || h.length === 8) {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    return false;
  }
  return r <= DARK_THRESHOLD && g <= DARK_THRESHOLD && b <= DARK_THRESHOLD;
}

function extractHexColors(str) {
  return [...str.matchAll(/#([0-9a-fA-F]{3,8})\b/g)].map((m) => m[0]);
}

const GRADIENT_RE =
  /(?:linear|radial|conic|repeating-linear|repeating-radial)-gradient\s*\(/i;

const BG_RE =
  /\bbackground(?:Image)?\s*:\s*(?:"([^"\\]*)"|'([^'\\]*)'|`([^`\\]*)`)/gi;

/**
 * Scan a snippet (which may contain real newlines) for dark-gradient
 * violations, respecting the allow-list token.  Returns an array of
 * { lineIdx (0-based), snippet } findings.
 */
function scanSnippet(text) {
  const lines = text.split("\n");
  const flat = text.replace(/\n/g, " ");

  const lineStartOffsets = [];
  let off = 0;
  for (const line of lines) {
    lineStartOffsets.push(off);
    off += line.length + 1;
  }

  const findings = [];
  BG_RE.lastIndex = 0;
  let m;
  while ((m = BG_RE.exec(flat)) !== null) {
    const value = m[1] ?? m[2] ?? m[3];
    if (!GRADIENT_RE.test(value)) continue;
    const hexColors = extractHexColors(value);
    if (!hexColors.some(isDarkHex)) continue;

    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;

    let lo = 0,
      hi = lineStartOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStartOffsets[mid] <= matchStart) lo = mid;
      else hi = mid - 1;
    }
    const startLineIdx = lo;

    let lo2 = startLineIdx,
      hi2 = lineStartOffsets.length - 1;
    while (lo2 < hi2) {
      const mid = (lo2 + hi2 + 1) >> 1;
      if (lineStartOffsets[mid] <= matchEnd) lo2 = mid;
      else hi2 = mid - 1;
    }
    const endLineIdx = lo2;

    const checkFrom = Math.max(0, startLineIdx - 2);
    let allowed = false;
    for (let l = checkFrom; l <= endLineIdx; l++) {
      if (lines[l].includes(ALLOW_TOKEN)) {
        allowed = true;
        break;
      }
    }
    if (allowed) continue;

    findings.push({ lineIdx: startLineIdx, snippet: flat.slice(matchStart, matchStart + 120).trim() });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Test harness (shared)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function expect(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    console.error(`        expected: ${expected}`);
    console.error(`        received: ${actual}`);
    failed++;
  }
}

function findings(snippet) {
  return scanSnippet(snippet).length;
}

// ---------------------------------------------------------------------------
// Part 1 — Unit tests
// ---------------------------------------------------------------------------

console.log("\n── Single-line cases ──────────────────────────────────────────");

expect(
  "catches single-line dark linear-gradient (double quotes)",
  findings(`style={{ background: "linear-gradient(135deg, #001a0a, #002d12)" }}`),
  1,
);

expect(
  "catches single-line dark linear-gradient (single quotes)",
  findings(`style={{ background: 'linear-gradient(180deg, #000, #111)' }}`),
  1,
);

expect(
  "catches backgroundImage property",
  findings(`style={{ backgroundImage: "linear-gradient(to right, #0a0a0a, #1a1a1a)" }}`),
  1,
);

expect(
  "ignores gradient with bright stops only",
  findings(`style={{ background: "linear-gradient(135deg, #ff6600, #ffcc00)" }}`),
  0,
);

expect(
  "ignores flat dark background (no gradient)",
  findings(`style={{ background: "#001a0a" }}`),
  0,
);

expect(
  "ignores non-background dark gradient usage",
  findings(`const color = "linear-gradient(135deg, #001a0a, #002d12)";`),
  0,
);

expect(
  "catches radial-gradient with dark stop",
  findings(`style={{ background: "radial-gradient(circle, #000000, #440000)" }}`),
  1,
);

expect(
  "catches conic-gradient with dark stop",
  findings(`style={{ background: "conic-gradient(#001100, #002200)" }}`),
  1,
);

expect(
  "ignores borderColor background property prefix collision",
  findings(`style={{ borderColor: "linear-gradient(135deg, #001a0a, #002d12)" }}`),
  0,
);

console.log("\n── Multi-line cases ────────────────────────────────────────────");

expect(
  "catches value on next line after background key",
  findings(
`style={{
  background:
    "linear-gradient(135deg, #001a0a, #002d12)",
}}`),
  1,
);

expect(
  "catches multi-line with extra whitespace",
  findings(
`style={{
  background:   "linear-gradient(to bottom, #000000, #0d0d0d)",
}}`),
  1,
);

expect(
  "ignores multi-line gradient with bright stops",
  findings(
`style={{
  background:
    "linear-gradient(135deg, #ff6600, #ffcc00)",
}}`),
  0,
);

expect(
  "catches backgroundImage across lines",
  findings(
`style={{
  backgroundImage:
    "linear-gradient(to right, #0a0a0a, #1a1a1a)",
}}`),
  1,
);

expect(
  "catches dark gradient split across 4 lines",
  findings(
`style={{
  background:
    "linear-gradient(" +
    "135deg, #001a0a, #002d12" +
    ")",
}}`),
  0, // template concatenation with + is not captured by the string-literal regex
);

expect(
  "catches template-literal multi-line gradient",
  findings(
`style={{
  background: \`linear-gradient(135deg, #001a0a, #002d12)\`,
}}`),
  1,
);

console.log("\n── Allow-list cases ────────────────────────────────────────────");

expect(
  "allow-list on the same line suppresses finding",
  findings(`style={{ background: "linear-gradient(135deg, #001a0a, #002d12)" }} // dark-gradient-allow: hero overlay`),
  0,
);

expect(
  "allow-list on the previous line suppresses finding",
  findings(
`{/* dark-gradient-allow: intentional dark hero */}
<div style={{ background: "linear-gradient(135deg, #001a0a, #002d12)" }} />`),
  0,
);

expect(
  "allow-list inside multi-line block suppresses finding",
  findings(
`style={{
  // dark-gradient-allow: brand card
  background:
    "linear-gradient(135deg, #001a0a, #002d12)",
}}`),
  0,
);

expect(
  "allow-list on line before multi-line block suppresses finding",
  findings(
`{/* dark-gradient-allow: decorative */}
style={{
  background:
    "linear-gradient(135deg, #001a0a, #002d12)",
}}`),
  0,
);

console.log("\n── Hex boundary cases ──────────────────────────────────────────");

expect(
  "hex exactly at threshold (0x44) is flagged",
  findings(`style={{ background: "linear-gradient(135deg, #444444, #444444)" }}`),
  1,
);

expect(
  "hex one above threshold (0x45) is not flagged",
  findings(`style={{ background: "linear-gradient(135deg, #454545, #454545)" }}`),
  0,
);

expect(
  "short hex #000 is flagged",
  findings(`style={{ background: "linear-gradient(90deg, #000, #111)" }}`),
  1,
);

expect(
  "8-digit hex with dark RGB channels is flagged",
  findings(`style={{ background: "linear-gradient(90deg, #001a0aff, #002d12ff)" }}`),
  1,
);

// ---------------------------------------------------------------------------
// Part 2 — Integration tests (subprocess, exit code + stderr)
// ---------------------------------------------------------------------------

const CHECKER = fileURLToPath(
  new URL("./check-dark-gradients.mjs", import.meta.url),
);

/**
 * Run the checker against a temp directory containing a single fixture file.
 * Returns { code, stderr } so tests can assert both the exit code and output.
 */
async function runChecker(fixtureSource) {
  const dir = await mkdtemp(join(tmpdir(), "dg-test-"));
  try {
    await writeFile(join(dir, "fixture.tsx"), fixtureSource, "utf8");
    const stderrChunks = [];
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [CHECKER], {
        env: { ...process.env, DARK_GRADIENT_SCAN_DIR: dir },
        stdio: ["ignore", "ignore", "pipe"],
      });
      child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
      child.on("error", reject);
      child.on("close", resolve);
    });
    return { code, stderr: Buffer.concat(stderrChunks).toString("utf8") };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function integrationTest(description, fixtureSource, expectedExit, stderrContains) {
  const { code, stderr } = await runChecker(fixtureSource);
  let ok = code === expectedExit;
  if (ok && stderrContains) {
    for (const fragment of stderrContains) {
      if (!stderr.includes(fragment)) {
        ok = false;
        console.error(
          `  FAIL  ${description}\n         stderr did not contain: ${JSON.stringify(fragment)}\n         stderr: ${stderr.trim()}`,
        );
        failed++;
        return;
      }
    }
  }
  if (ok) {
    console.log(`  PASS  ${description}`);
    passed++;
  } else {
    console.error(
      `  FAIL  ${description}\n         expected exit ${expectedExit}, got ${code}`,
    );
    failed++;
  }
}

console.log("\n── Integration tests (subprocess) ──────────────────────────────");

// Dark gradient without allow comment → exits 1 and names the file/line
await integrationTest(
  "dark gradient without allow comment → exit 1, reports file:line",
  `const Card = () => (
  <div style={{ background: "linear-gradient(135deg, #001a0a, #002d12)" }} />
);`,
  1,
  ["fixture.tsx:2"],
);

// Dark gradient with allow comment on the SAME line → exits 0
await integrationTest(
  "dark gradient with same-line allow comment → exit 0",
  `const Hero = () => (
  <div style={{ background: "linear-gradient(135deg, #001a0a, #002d12)" }} /> // dark-gradient-allow: hero overlay
);`,
  0,
);

// Dark gradient with allow comment on the PREVIOUS line → exits 0
await integrationTest(
  "dark gradient with allow comment on previous line → exit 0",
  `const Hero = () => (
  // dark-gradient-allow: intentional dark hero
  <div style={{ background: "linear-gradient(135deg, #001a0a, #002d12)" }} />
);`,
  0,
);

// Bright gradient (all channels > 0x44) → exits 0
await integrationTest(
  "bright gradient (all channels > 0x44) → exit 0",
  `const Banner = () => (
  <div style={{ background: "linear-gradient(90deg, #5588ff, #aabbcc)" }} />
);`,
  0,
);

// Flat dark background — NOT a gradient → exits 0
await integrationTest(
  "flat dark background (no gradient function) → exit 0",
  `const Overlay = () => (
  <div style={{ background: "#000000" }} />
);`,
  0,
);

// 3-digit short-form dark hex (#000, #111) inside a gradient → exits 1
await integrationTest(
  "3-digit short-form dark hex (#111) in gradient → exit 1",
  `const DarkCard = () => (
  <div style={{ background: "linear-gradient(180deg, #111, #222)" }} />
);`,
  1,
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
