#!/usr/bin/env node
/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 *
 * Point this repo's git hooks at .githooks (pre-commit ownership stamp).
 */
import { execSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hooksPath = ".githooks";
const preCommit = join(ROOT, hooksPath, "pre-commit");

if (!existsSync(preCommit)) {
  console.error("Missing .githooks/pre-commit");
  process.exit(1);
}

try {
  chmodSync(preCommit, 0o755);
} catch {
  // Windows may ignore mode
}

execSync(`git config core.hooksPath ${hooksPath}`, { cwd: ROOT, stdio: "inherit" });
console.log(`Git hooks path set to ${hooksPath}`);
console.log("Pre-commit will auto-stamp new/changed source files with ownership headers.");
