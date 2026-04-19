#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SCAN_DIR = join(ROOT, "client/src");
const SKIP_DIRS = new Set([
  join(ROOT, "client/src/components/ui"),
]);
const ALLOW_TOKEN = "faint-text-allow";

const PATTERNS = [
  {
    name: "Tailwind text-white with low opacity",
    re: /(?:placeholder:)?text-white\/(?:10|20|30|40|50|60|70)\b/,
  },
  {
    name: "Tailwind text-foreground / muted-foreground with low opacity",
    re: /text-(?:muted-)?foreground\/(?:10|20|30|40|50|60|70)\b/,
  },
  {
    name: "Tailwind opacity-50/60 utility (faint element, often text)",
    re: /(?:^|[\s"'`{])opacity-(?:50|60)\b/,
  },
  {
    name: "Inline rgba(255,255,255, <=0.7) used as text color",
    re: /color:\s*["']rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.[0-7]\d*\s*\)/,
  },
  {
    name: "Inline #ffffff with low alpha (8-digit hex) used as text color",
    re: /color:\s*["']#(?:f{6}|F{6})(?:0[0-9a-fA-F]|1[0-9a-fA-F]|[2-9a-bA-B][0-9a-fA-F])["']/,
  },
];

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
    if (line.includes(ALLOW_TOKEN)) continue;
    const prev = i > 0 ? lines[i - 1] : "";
    if (prev.includes(ALLOW_TOKEN)) continue;
    for (const p of PATTERNS) {
      if (p.re.test(line)) {
        findings.push({
          file: relative(ROOT, file),
          line: i + 1,
          rule: p.name,
          snippet: line.trim().slice(0, 200),
        });
        break;
      }
    }
  }
}

if (findings.length === 0) {
  console.log("check-faint-text: OK — no low-opacity text utilities on body copy.");
  process.exit(0);
}

console.error(`check-faint-text: found ${findings.length} flagged usage(s).`);
console.error(
  "Fix by raising the opacity (>= /80) or by using a theme token such as text-foreground or text-muted-foreground.",
);
console.error(
  `If the usage is intentionally decorative (icon, separator, brand chrome), add a "${ALLOW_TOKEN}: <reason>" comment on the same or previous line.\n`,
);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  [${f.rule}]`);
  console.error(`    ${f.snippet}`);
}
process.exit(1);
