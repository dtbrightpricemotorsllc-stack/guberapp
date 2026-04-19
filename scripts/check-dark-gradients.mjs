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
 * Multi-line style objects are also caught, e.g.:
 *   style={{
 *     background:
 *       "linear-gradient(135deg, #001a0a, #002d12)",
 *   }}
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
const SCAN_DIR = process.env.DARK_GRADIENT_SCAN_DIR ?? join(ROOT, "client/src");
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
 * Background-property regex.  Matches:
 *   background[Image]?: "..." | '...' | `...`
 * across a single (possibly newline-collapsed) string.
 */
const BG_RE =
  /\bbackground(?:Image)?\s*:\s*(?:"([^"\\]*)"|'([^'\\]*)'|`([^`\\]*)`)/gi;

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

  // Build a parallel "flat" string where every newline is replaced by a
  // single space.  This collapses multi-line style objects so the BG_RE regex
  // can match a `background:` key and its quoted value even when they appear
  // on different lines.
  const flat = text.replace(/\n/g, " ");

  // Pre-compute the character offset at which each original line starts so we
  // can map a match position in `flat` back to a 1-based line number.
  const lineStartOffsets = [];
  let off = 0;
  for (const line of lines) {
    lineStartOffsets.push(off);
    off += line.length + 1; // +1 for the newline that was replaced by a space
  }

  BG_RE.lastIndex = 0;
  let m;
  while ((m = BG_RE.exec(flat)) !== null) {
    const value = m[1] ?? m[2] ?? m[3];
    if (!GRADIENT_RE.test(value)) continue;
    const hexColors = extractHexColors(value);
    if (!hexColors.some(isDarkHex)) continue;

    // Map the match start offset back to a 0-based line index.
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;

    // Binary-search for the line that contains matchStart.
    let lo = 0,
      hi = lineStartOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStartOffsets[mid] <= matchStart) lo = mid;
      else hi = mid - 1;
    }
    const startLineIdx = lo;

    // Find the line that contains matchEnd (for allow-list spanning).
    let lo2 = startLineIdx,
      hi2 = lineStartOffsets.length - 1;
    while (lo2 < hi2) {
      const mid = (lo2 + hi2 + 1) >> 1;
      if (lineStartOffsets[mid] <= matchEnd) lo2 = mid;
      else hi2 = mid - 1;
    }
    const endLineIdx = lo2;

    // Allow-list: skip if any line within the match span, or up to 2 lines
    // before it (covering patterns where the comment precedes `style={{` which
    // itself precedes the `background:` key), carries the allow token.
    const checkFrom = Math.max(0, startLineIdx - 2);
    let allowed = false;
    for (let l = checkFrom; l <= endLineIdx; l++) {
      if (lines[l].includes(ALLOW_TOKEN)) {
        allowed = true;
        break;
      }
    }
    if (allowed) continue;

    findings.push({
      file: relative(ROOT, file),
      line: startLineIdx + 1,
      snippet: flat.slice(matchStart, matchStart + 200).trim(),
    });
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
