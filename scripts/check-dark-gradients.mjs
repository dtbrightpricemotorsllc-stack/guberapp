#!/usr/bin/env node
/**
 * check-dark-gradients.mjs
 *
 * Scans JSX/TSX source files for inline `style` props that set a `background`
 * (or `backgroundImage`) to a gradient containing near-black hex color stops.
 *
 * Problem: Cards written with
 *   style={{ background: "linear-gradient(135deg, #001a0a, #002d12)" }}
 * are invisible in outdoor sunlight but are not caught by the Tailwind-class
 * faint-text checker because they use inline styles, not utility classes.
 *
 * What counts as "dark"?
 *   A hex color where every RGB channel is <= 0x44 (68 out of 255, ≈ 27%).
 *   This captures #000, #0a0a0a, #001a0a, #0d0d1a, and similar near-blacks
 *   while leaving brighter accent colours alone.
 *
 * Escape hatch:
 *   Add a comment "dark-gradient-allow: <reason>" on the same or previous line.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SCAN_DIR = join(ROOT, "client/src");
const SKIP_DIRS = new Set([join(ROOT, "client/src/components/ui")]);
const ALLOW_TOKEN = "dark-gradient-allow";

/** Per-channel darkness threshold (inclusive). 0x44 = 68 ≈ 27 % brightness. */
const DARK_THRESHOLD = 0x44;

/**
 * Return true when the supplied hex string (with leading #) represents a
 * near-black colour, i.e. every RGB channel is <= DARK_THRESHOLD.
 */
function isDarkHex(hex) {
  const h = hex.slice(1); // strip #
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

/**
 * Return all hex colour tokens found in `str` (e.g. "#001a0a", "#000").
 * Matches 3-, 4-, 6-, and 8-digit forms.
 */
function extractHexColors(str) {
  return [...str.matchAll(/#([0-9a-fA-F]{3,8})\b/g)].map((m) => m[0]);
}

/** CSS gradient function names we watch for. */
const GRADIENT_RE =
  /(?:linear|radial|conic|repeating-linear|repeating-radial)-gradient\s*\(/i;

/**
 * Return true when `line` references a JSX inline-style background/
 * backgroundImage that contains a CSS gradient function with at least one
 * near-black hex stop.
 *
 * Flat-colour dark backgrounds (e.g. background: "#000") are NOT flagged
 * because they are a normal way to build dark overlays and do not create
 * the "invisible card" problem that this check targets.  The danger arises
 * specifically when a gradient bakes darkness into a surface meant to hold
 * legible text.
 */
function lineHasDarkGradient(line) {
  // Match: background[Image]?: "..." or '...' or `...`
  const bgRe =
    /\bbackground(?:Image)?\s*:\s*(?:"([^"\\]*)"|'([^'\\]*)'|`([^`\\]*)`)/gi;
  let m;
  while ((m = bgRe.exec(line)) !== null) {
    const value = m[1] ?? m[2] ?? m[3];
    // Only flag if the value is a gradient function.
    if (!GRADIENT_RE.test(value)) continue;
    const hexColors = extractHexColors(value);
    if (hexColors.some(isDarkHex)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Walk the source tree
// ---------------------------------------------------------------------------

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(full)) continue;
      yield* walk(full);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      yield full;
    }
  }
}

const findings = [];

for await (const file of walk(SCAN_DIR)) {
  const text = await readFile(file, "utf8");
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Allow-list: skip if this line or the previous one carries the token.
    if (line.includes(ALLOW_TOKEN)) continue;
    const prev = i > 0 ? lines[i - 1] : "";
    if (prev.includes(ALLOW_TOKEN)) continue;

    if (lineHasDarkGradient(line)) {
      findings.push({
        file: relative(ROOT, file),
        line: i + 1,
        snippet: line.trim().slice(0, 200),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (findings.length === 0) {
  console.log(
    "check-dark-gradients: OK — no near-black hex stops found in inline style backgrounds.",
  );
  process.exit(0);
}

console.error(
  `check-dark-gradients: found ${findings.length} flagged usage(s).`,
);
console.error(
  "Inline style backgrounds with near-black hex stops (#RRGGBB where every channel <= 0x44) " +
    "produce unreadable cards in outdoor / high-glare conditions.",
);
console.error(
  "Fix by replacing dark hex stops with lighter theme tokens or CSS variables " +
    "(e.g. var(--color-surface-dark)), or raise the lightness of each stop.",
);
console.error(
  `If the dark gradient is genuinely decorative (e.g. a full-bleed hero image overlay), ` +
    `add a "${ALLOW_TOKEN}: <reason>" comment on the same or previous line.\n`,
);

for (const f of findings) {
  console.error(`  ${f.file}:${f.line}`);
  console.error(`    ${f.snippet}`);
}

process.exit(1);
