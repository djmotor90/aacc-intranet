#!/usr/bin/env node
/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Module boundary audit.
 *
 * A file inside apps/web/src/modules/<A>/... may not import from
 * apps/web/src/modules/<B>/... when A !== B. Two files are exempt:
 *
 *   - modules/registry.ts  (the bridge — it explicitly enumerates modules)
 *   - modules/types.ts     (shared types, leaf, imports nothing from modules)
 *
 * Cross-module imports break the platform's module isolation: when the day
 * comes to extract a module into its own package, those hidden edges make
 * the split painful. Catching them at the source-file level keeps the
 * "modules can be moved, renamed, or split" property intact.
 *
 * Usage:
 *   node scripts/check-module-boundaries.mjs
 *   pnpm module:check
 */
import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import {
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES_DIR = join(ROOT, "apps/web/src/modules");

const SOURCE_EXTS = new Set([".ts", ".tsx"]);
const BRIDGE = new Set([
  "apps/web/src/modules/registry.ts",
  "apps/web/src/modules/types.ts",
]);

// Matches `import` and `export ... from` clauses, capturing the module spec.
// Tolerant of `import type`, multi-line braces, `import * as ns`, side-effect
// imports (`import "x"`), and re-exports (`export * from "x"`).
const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\b\s+(?:type\s+)?(?:[^"';]+?\s+from\s+)?["']([^"']+)["']/g;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (SOURCE_EXTS.has(extname(name))) out.push(p);
  }
  return out;
}

function existsFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function existsDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// Resolve a TS/TSX import specifier to an absolute file path under ROOT,
// or return null if it doesn't resolve to a real file (bare modules, missing).
function resolveImport(fromFile, spec) {
  if (!spec.startsWith(".") && !spec.startsWith("@/")) return null;

  const base = spec.startsWith("@/")
    ? join(ROOT, "apps/web/src", spec.slice(2))
    : resolve(dirname(fromFile), spec);

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  for (const c of candidates) if (existsFile(c)) return c;
  return null;
}

// Return the module slug for a file under apps/web/src/modules/<slug>/...
// e.g. "tasks/components/board.tsx" -> "tasks".
// Top-level files (registry.ts, types.ts) are not handled here — callers
// must check the BRIDGE set first and skip those files.
function moduleSlug(file) {
  const rel = relative(MODULES_DIR, file);
  return rel.split(sep)[0];
}

function toPosix(p) {
  return p.split(sep).join("/");
}

let failed = false;
const violations = [];

console.log("— Module boundary audit —");

if (!existsDir(MODULES_DIR)) {
  console.error(`✗ Modules dir not found: ${toPosix(relative(ROOT, MODULES_DIR))}`);
  process.exit(1);
}

const files = walk(MODULES_DIR);
let scanned = 0;

for (const file of files) {
  const rel = toPosix(relative(ROOT, file));

  // Bridge files are the exception, not subject to the rule.
  if (BRIDGE.has(rel)) continue;

  scanned += 1;
  const fileMod = moduleSlug(file);
  const text = readFileSync(file, "utf8");

  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(text)) !== null) {
    const spec = m[1];
    const target = resolveImport(file, spec);
    if (!target) continue;

    // Only flag imports that land inside the modules tree.
    const targetRel = toPosix(relative(ROOT, target));
    if (!target.startsWith(MODULES_DIR + sep)) continue;
    if (BRIDGE.has(targetRel)) continue;

    const targetMod = moduleSlug(target);
    if (targetMod === fileMod) continue;

    // Skip if the "module" we landed in is actually a top-level file we
    // somehow didn't catch (defensive — shouldn't happen).
    if (BRIDGE.has(targetRel)) continue;

    const line = text.slice(0, m.index).split("\n").length;
    violations.push({ from: rel, line, spec, targetMod });
  }
}

if (violations.length === 0) {
  console.log(
    `✓ Scanned ${scanned} module files. No cross-module imports found.`,
  );
  console.log("Module boundary check passed.");
  process.exit(0);
}

console.error(
  `✗ Found ${violations.length} cross-module import${violations.length === 1 ? "" : "s"}:\n`,
);
for (const v of violations) {
  console.error(
    `  ${v.from}:${v.line}  →  "${v.spec}"  (enters module "${v.targetMod}")`,
  );
}
console.error("\nModule boundary check FAILED.");
console.error("Cross-module imports break module isolation.");
console.error("Move shared code to modules/registry.ts, modules/types.ts,");
console.error("or packages/shared instead.");

failed = true;
if (failed) process.exit(1);
