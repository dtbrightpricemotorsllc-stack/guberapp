#!/usr/bin/env node
/**
 * audit-statebleed.mjs — Contextual Logic Auditor
 *
 * Statically scans React/TSX form & flow components for the "state bleed" bug
 * class: a `useState` field that is only meaningful inside ONE conditional
 * branch of a mode selector, but is never reset when that selector changes — so
 * a value entered for one mode silently leaks into another mode's UI and/or its
 * submitted payload.
 *
 * Concrete example this was built for (GUBER "Post a Load"):
 *   - `freightTrailerType` is a mode selector (compared to "dry_van",
 *     "reefer", "car_hauler", ... in JSX-gated branches).
 *   - Each branch sets its own fields (temp, pallets, VIN, ...).
 *   - If switching trailer type does NOT clear those fields, a reefer temp or a
 *     freight commodity bleeds into a car-hauler post.
 *
 * How a "mode selector" is identified (and why `step`/wizard indices are safe):
 *   A state variable is treated as a mode selector ONLY when it is compared with
 *   `===`/`==` to a STRING literal in >= MIN_BRANCHES distinct JSX-gating
 *   expressions (`sel === "x" && <.../>`). Numeric wizard indices like
 *   `step === 1` use number literals, so they are never flagged — switching
 *   wizard steps is supposed to preserve entered data.
 *
 * A selector is FLAGGED when:
 *   - it has mode-scoped setters (setters called inside its gated branches), and
 *   - its own setter is called somewhere (the mode is changed at runtime), and
 *   - NO call site of its setter sits in a function that also resets at least
 *     RESET_THRESHOLD of those mode-scoped setters.
 *
 * Escape hatch: add `statebleed-allow: <reason>` in a comment on or above the
 * selector's `useState` line, or list the file in the `ignore` option.
 *
 * Usage:
 *   node scripts/audit-statebleed.mjs            # scan defaults, exit 1 on findings
 *   node scripts/audit-statebleed.mjs --json     # machine-readable output
 *   node scripts/audit-statebleed.mjs path/a.tsx # scan specific files
 *
 * Programmatic:
 *   import { runAudit } from "./scripts/audit-statebleed.mjs";
 *   const { findings } = runAudit();
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

/** Directories scanned by default. */
const DEFAULT_TARGET_DIRS = [
  join(ROOT, "client/src/pages"),
  join(ROOT, "client/src/components"),
];

/** Directories never scanned (vendored / generated UI primitives). */
const SKIP_DIRS = new Set([join(ROOT, "client/src/components/ui")]);

/** Minimum distinct string-literal branches for a var to count as a selector. */
const MIN_BRANCHES = 3;

/**
 * Fraction of mode-scoped setters a reset path must clear to be "complete".
 * Set to 1.0: every field shown in a mode's branch must be reset when the mode
 * changes, otherwise even one un-reset field is a bleed vector.
 */
const RESET_THRESHOLD = 1.0;

/** Comment token that suppresses a finding for a given selector. */
const ALLOW_TOKEN = "statebleed-allow";

// ── AST helpers ──────────────────────────────────────────────────────────────

function isFunctionLike(node) {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node)
  );
}

/** Nearest enclosing function-like node, or undefined if none. */
function enclosingFunction(node) {
  let cur = node.parent;
  while (cur) {
    if (isFunctionLike(cur)) return cur;
    cur = cur.parent;
  }
  return undefined;
}

/** Walk every descendant node, invoking cb on each. */
function walk(node, cb) {
  cb(node);
  ts.forEachChild(node, (child) => walk(child, cb));
}

/** True when expr is (or wraps) JSX. */
function containsJsx(node) {
  let found = false;
  walk(node, (n) => {
    if (
      ts.isJsxElement(n) ||
      ts.isJsxSelfClosingElement(n) ||
      ts.isJsxFragment(n)
    ) {
      found = true;
    }
  });
  return found;
}

/** Identifier name for a call expression's callee, else undefined. */
function calleeName(call) {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  return undefined;
}

/**
 * If `bin` is `sel === "lit"` and it is the left side of a `&&` whose right side
 * renders JSX, return { name, value, gated } where gated is the JSX subtree.
 */
function asJsxGate(bin, stateVars) {
  if (!ts.isBinaryExpression(bin)) return undefined;
  const op = bin.operatorToken.kind;
  if (
    op !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
    op !== ts.SyntaxKind.EqualsEqualsToken
  ) {
    return undefined;
  }
  // Normalize so identifier is on the left, literal on the right.
  let idNode = bin.left;
  let litNode = bin.right;
  if (!ts.isIdentifier(idNode)) {
    idNode = bin.right;
    litNode = bin.left;
  }
  if (!ts.isIdentifier(idNode)) return undefined;
  if (!stateVars.has(idNode.text)) return undefined;
  const isStringLit =
    ts.isStringLiteral(litNode) || ts.isNoSubstitutionTemplateLiteral(litNode);
  if (!isStringLit) return undefined; // numeric/other literals -> not a mode selector

  // Must gate JSX: parent is `&&` and the OTHER operand contains JSX.
  const parent = bin.parent;
  if (
    parent &&
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
  ) {
    const other = parent.left === bin ? parent.right : parent.left;
    if (containsJsx(other)) {
      return { name: idNode.text, value: litNode.text, gated: other };
    }
  }
  return undefined;
}

// ── per-file analysis ─────────────────────────────────────────────────────────

function analyzeFile(absPath) {
  const text = readFileSync(absPath, "utf8");
  const sf = ts.createSourceFile(
    absPath,
    text,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TSX,
  );

  // 1. Collect useState/useReducer pairs: stateVar -> setter.
  const stateToSetter = new Map();
  const setters = new Set();
  const declLineByState = new Map();
  walk(sf, (n) => {
    if (!ts.isVariableDeclaration(n)) return;
    if (!n.initializer || !ts.isCallExpression(n.initializer)) return;
    const callee = n.initializer.expression;
    const hookName = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : "";
    if (hookName !== "useState" && hookName !== "useReducer") return;
    if (!ts.isArrayBindingPattern(n.name)) return;
    const els = n.name.elements;
    if (els.length < 2) return;
    const a = els[0];
    const b = els[1];
    if (
      !ts.isBindingElement(a) ||
      !ts.isIdentifier(a.name) ||
      !ts.isBindingElement(b) ||
      !ts.isIdentifier(b.name)
    ) {
      return;
    }
    stateToSetter.set(a.name.text, b.name.text);
    setters.add(b.name.text);
    const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
    declLineByState.set(a.name.text, line);
  });

  const stateVars = new Set(stateToSetter.keys());

  // 2. Gather JSX gates grouped by selector name.
  const gatesBySelector = new Map(); // name -> { values:Set, gated:[] }
  walk(sf, (n) => {
    const gate = asJsxGate(n, stateVars);
    if (!gate) return;
    let entry = gatesBySelector.get(gate.name);
    if (!entry) {
      entry = { values: new Set(), gated: [] };
      gatesBySelector.set(gate.name, entry);
    }
    entry.values.add(gate.value);
    entry.gated.push(gate.gated);
  });

  // 3. Index every setter call site once.
  const setterCalls = []; // { name, node }
  walk(sf, (n) => {
    if (!ts.isCallExpression(n)) return;
    const name = calleeName(n);
    if (name && setters.has(name)) setterCalls.push({ name, node: n });
  });

  const lines = text.split(/\r?\n/);
  const findings = [];

  for (const [selector, entry] of gatesBySelector) {
    if (entry.values.size < MIN_BRANCHES) continue;

    const selectorSetter = stateToSetter.get(selector);
    if (!selectorSetter) continue;

    // Escape hatch: allow comment on/above the selector's useState line.
    const declLine = declLineByState.get(selector) ?? 0;
    const near = [lines[declLine] ?? "", lines[declLine - 1] ?? ""].join("\n");
    if (near.includes(ALLOW_TOKEN)) continue;

    // Mode-scoped setters: setters called within any gated JSX branch.
    const scoped = new Set();
    for (const gated of entry.gated) {
      walk(gated, (n) => {
        if (!ts.isCallExpression(n)) return;
        const name = calleeName(n);
        if (name && setters.has(name) && name !== selectorSetter) {
          scoped.add(name);
        }
      });
    }
    if (scoped.size === 0) continue; // nothing type-specific to bleed

    // Where is the selector's own setter called? (mode changed at runtime)
    const changeSites = setterCalls.filter((c) => c.name === selectorSetter);
    if (changeSites.length === 0) continue; // mode never changes -> no bleed path

    // For each change site, how much of the scoped state does its enclosing
    // function reset? We take the WORST (lowest-coverage) path: a single
    // correctly-resetting handler must not mask another that leaks. A change
    // site whose enclosing function ALSO declares the scoped fields (i.e. it is
    // the component body itself, e.g. an effect that re-initializes) is the
    // weakest signal, so it is evaluated the same as any other path.
    let worstFraction = Infinity;
    let worstResetCount = 0;
    let evaluated = false;
    for (const site of changeSites) {
      const fn = enclosingFunction(site.node);
      if (!fn) continue;
      const resetInFn = new Set();
      walk(fn, (n) => {
        if (!ts.isCallExpression(n)) return;
        const name = calleeName(n);
        if (name && scoped.has(name)) resetInFn.add(name);
      });
      const fraction = resetInFn.size / scoped.size;
      if (fraction < worstFraction) {
        worstFraction = fraction;
        worstResetCount = resetInFn.size;
      }
      evaluated = true;
    }
    if (!evaluated) continue;

    if (worstFraction < RESET_THRESHOLD) {
      const { line } = sf.getLineAndCharacterOfPosition(
        changeSites[0].node.getStart(sf),
      );
      findings.push({
        file: relative(ROOT, absPath),
        selector,
        branches: entry.values.size,
        scopedFields: scoped.size,
        resetFields: worstResetCount,
        resetFraction: Number(worstFraction.toFixed(2)),
        changeLine: line + 1,
        message:
          `"${selector}" gates ${entry.values.size} mode branches with ` +
          `${scoped.size} mode-specific field(s), but changing it (line ` +
          `${line + 1}) resets only ${worstResetCount}/${scoped.size}. ` +
          `Fields from one mode can bleed into another. Reset the scoped ` +
          `fields when "${selector}" changes, or add "${ALLOW_TOKEN}: reason".`,
      });
    }
  }

  return findings;
}

// ── file discovery ─────────────────────────────────────────────────────────────

function collectTsxFiles(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(full)) continue;
      collectTsxFiles(full, out);
    } else if (e.isFile() && full.endsWith(".tsx")) {
      out.push(full);
    }
  }
}

// ── public API ─────────────────────────────────────────────────────────────────

/**
 * @param {{ targets?: string[], ignore?: string[] }} [options]
 *   targets — absolute/relative file paths or directories to scan.
 *   ignore  — repo-relative file paths to skip.
 * @returns {{ findings: object[], filesScanned: number }}
 */
export function runAudit(options = {}) {
  const ignore = new Set(options.ignore ?? []);
  const files = [];

  const targets = options.targets?.length
    ? options.targets.map((t) => resolve(ROOT, t))
    : DEFAULT_TARGET_DIRS;

  for (const t of targets) {
    let st;
    try {
      st = statSync(t);
    } catch {
      continue;
    }
    if (st.isDirectory()) collectTsxFiles(t, files);
    else if (t.endsWith(".tsx")) files.push(t);
  }

  const findings = [];
  for (const f of files) {
    if (ignore.has(relative(ROOT, f))) continue;
    findings.push(...analyzeFile(f));
  }
  return { findings, filesScanned: files.length };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────

function main(argv) {
  const args = argv.slice(2);
  const json = args.includes("--json");
  const paths = args.filter((a) => !a.startsWith("--"));
  const { findings, filesScanned } = runAudit(
    paths.length ? { targets: paths } : {},
  );

  if (json) {
    process.stdout.write(JSON.stringify({ findings, filesScanned }, null, 2) + "\n");
  } else if (findings.length === 0) {
    process.stdout.write(
      `\u2713 state-bleed audit clean (${filesScanned} files scanned)\n`,
    );
  } else {
    process.stdout.write(
      `\u2717 state-bleed audit found ${findings.length} issue(s) ` +
        `in ${filesScanned} files:\n\n`,
    );
    for (const f of findings) {
      process.stdout.write(`  ${f.file}:${f.changeLine}\n    ${f.message}\n\n`);
    }
  }
  process.exit(findings.length === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv);
}
