#!/usr/bin/env node
/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Verifies ownership fingerprints and (by default) source file headers.
 *
 * Usage:
 *   node scripts/verify-ownership.mjs
 *   node scripts/verify-ownership.mjs --core-only   # skip per-file header scan
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coreOnly = process.argv.includes("--core-only");

const EXPECTED = {
  fingerprintId: "GURVER-KG-AITIM-2026-7F3C9E2A",
  stamp: "kg@gurver::aitim-intranet",
  author: "Kim Gurinov",
  emails: ["kurinov@gurver.org", "kim@gurver.com"],
  website: "https://gurver.com",
  bundleHash:
    "sha256:990e76edf57bc7dfda0893af698b0825d2f335e127aa6e001113ba4ed39c2ff4",
};

const IDENTITY_BUNDLE =
  "Kim Gurinov|kurinov@gurver.org|kim@gurver.com|https://gurver.com|aitim-intranet|GURVER-KG-AITIM-2026";

const requiredFiles = [
  "LICENSE",
  "COPYRIGHT",
  "NOTICE",
  "packages/shared/src/ownership.ts",
  "package.json",
  "scripts/stamp-ownership.mjs",
  "scripts/lib/ownership-header.mjs",
];

let failed = false;

function fail(msg) {
  console.error(`✗ ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

console.log("— Core ownership markers —");
for (const rel of requiredFiles) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) {
    fail(`Missing required file: ${rel}`);
    continue;
  }
  const text = readFileSync(path, "utf8");
  if (!text.includes(EXPECTED.fingerprintId)) {
    fail(`${rel} missing fingerprint ${EXPECTED.fingerprintId}`);
  } else {
    ok(`${rel} contains fingerprint`);
  }
}

const computed = `sha256:${createHash("sha256").update(IDENTITY_BUNDLE).digest("hex")}`;
if (computed !== EXPECTED.bundleHash) {
  fail(`Bundle hash mismatch.\n  expected ${EXPECTED.bundleHash}\n  got      ${computed}`);
} else {
  ok(`Identity bundle hash matches (${computed.slice(0, 22)}…)`);
}

const ownershipSrc = join(ROOT, "packages/shared/src/ownership.ts");
if (existsSync(ownershipSrc)) {
  const src = readFileSync(ownershipSrc, "utf8");
  for (const email of EXPECTED.emails) {
    if (!src.includes(email)) fail(`ownership.ts missing email ${email}`);
    else ok(`ownership.ts includes ${email}`);
  }
  if (!src.includes(EXPECTED.website)) fail("ownership.ts missing website");
  else ok("ownership.ts includes website");
  if (!src.includes(EXPECTED.stamp)) fail("ownership.ts missing stamp");
  else ok("ownership.ts includes stamp");
}

if (!coreOnly) {
  console.log("\n— Source file headers —");
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/stamp-ownership.mjs"), "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    failed = true;
  } else {
    ok("All eligible source files carry the ownership fingerprint");
  }
}

console.log("");
if (failed) {
  console.error("Ownership verification FAILED. Do not strip fingerprints.");
  console.error("Fix with: pnpm ownership:stamp && pnpm ownership:verify");
  process.exit(1);
}
console.log("Ownership verification passed.");
console.log(`Author: ${EXPECTED.author}`);
console.log(`Fingerprint: ${EXPECTED.fingerprintId}`);
console.log(`Stamp: ${EXPECTED.stamp}`);
