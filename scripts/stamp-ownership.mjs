#!/usr/bin/env node
/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Auto-stamp source files with the proprietary ownership header.
 *
 * Usage:
 *   node scripts/stamp-ownership.mjs              # stamp all eligible unstamped files
 *   node scripts/stamp-ownership.mjs --check      # exit 1 if any file is missing the stamp
 *   node scripts/stamp-ownership.mjs path1 path2  # stamp only these paths (repo-relative or absolute)
 *   node scripts/stamp-ownership.mjs --staged     # stamp staged git files only (pre-commit)
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FINGERPRINT_ID,
  insertHeader,
  shouldStampPath,
} from "./lib/ownership-header.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const stagedOnly = args.includes("--staged");
const paths = args.filter((a) => !a.startsWith("--"));

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (
        ent.name === "node_modules" ||
        ent.name === ".next" ||
        ent.name === "dist" ||
        ent.name === ".git" ||
        ent.name === "coverage"
      ) {
        continue;
      }
      walk(full, out);
    } else if (ent.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function toRel(abs) {
  return relative(ROOT, abs).replace(/\\/g, "/");
}

function collectTargets() {
  if (stagedOnly) {
    const out = execSync("git diff --cached --name-only --diff-filter=ACMR", {
      cwd: ROOT,
      encoding: "utf8",
    });
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((p) => resolve(ROOT, p))
      .filter((abs) => {
        try {
          return statSync(abs).isFile();
        } catch {
          return false;
        }
      });
  }

  if (paths.length > 0) {
    return paths.map((p) => resolve(ROOT, p));
  }

  const roots = [join(ROOT, "apps"), join(ROOT, "packages"), join(ROOT, "scripts")];
  const files = [];
  for (const r of roots) {
    try {
      if (statSync(r).isDirectory()) walk(r, files);
    } catch {
      // skip
    }
  }
  return files;
}

const targets = collectTargets().filter((abs) => {
  const rel = toRel(abs);
  if (rel.startsWith("..")) return false;
  return shouldStampPath(rel);
});

let stamped = 0;
let already = 0;
let missing = [];

for (const abs of targets) {
  const rel = toRel(abs);
  const ext = extname(abs).toLowerCase();
  let source;
  try {
    source = readFileSync(abs, "utf8");
  } catch {
    continue;
  }

  if (source.includes(FINGERPRINT_ID)) {
    already += 1;
    continue;
  }

  if (checkOnly) {
    missing.push(rel);
    continue;
  }

  const { text, changed } = insertHeader(source, ext);
  if (changed) {
    writeFileSync(abs, text, "utf8");
    stamped += 1;
    console.log(`stamped  ${rel}`);

    // If stamping staged files, re-stage so the header is committed
    if (stagedOnly) {
      try {
        execSync(`git add -- "${rel}"`, { cwd: ROOT, stdio: "ignore" });
      } catch {
        // ignore
      }
    }
  }
}

if (checkOnly) {
  if (missing.length > 0) {
    console.error(
      `Missing ownership header on ${missing.length} file(s) (fingerprint ${FINGERPRINT_ID}):\n` +
        missing.map((m) => `  - ${m}`).join("\n") +
        `\n\nRun: pnpm ownership:stamp`,
    );
    process.exit(1);
  }
  console.log(
    `Ownership headers OK (${already} file(s) checked with fingerprint).`,
  );
  process.exit(0);
}

console.log(
  `Done. Stamped ${stamped} file(s); ${already} already had the fingerprint.`,
);
if (stamped > 0 && stagedOnly) {
  console.log("Stamped files were re-staged for commit.");
}
