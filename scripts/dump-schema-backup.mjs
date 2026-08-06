/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Schema-only SQL snapshot for audit/offline review.
 * Source of truth for new environments remains packages/db/migrations.
 *
 * Usage:
 *   DATABASE_URL=postgres://… node scripts/dump-schema-backup.mjs
 *   DATABASE_URL=… node scripts/dump-schema-backup.mjs --out deploy/backups/custom.sql
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const defaultOut = join(root, "deploy/backups", `schema-${stamp}.sql`);
  const outPath = outIdx >= 0 ? resolve(root, args[outIdx + 1]) : defaultOut;

  mkdirSync(dirname(outPath), { recursive: true });

  const r = spawnSync(
    "pg_dump",
    [
      databaseUrl,
      "--schema-only",
      "--no-owner",
      "--no-privileges",
      "-f",
      outPath,
    ],
    { stdio: "inherit" },
  );

  if (r.error?.code === "ENOENT") {
    console.error("pg_dump not found on PATH. Install PostgreSQL client tools.");
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error("pg_dump failed.");
    process.exit(r.status ?? 1);
  }

  console.log(`Wrote schema-only backup: ${outPath}`);
  console.log("Note: restore new clients with migrations + seed-baseline, not this dump alone.");
}

main();
