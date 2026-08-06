/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
/**
 * Programmatic migration runner for production (bundled to dist/migrate.cjs).
 * Drizzle's migrator takes an advisory lock, so concurrent starts are safe.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const db = drizzle({ client: pool });
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? "./packages/db/migrations";
  await migrate(db, { migrationsFolder });
  await pool.end();
  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
