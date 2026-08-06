/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Bootstrap a client database: migrate + baseline seed.
 *
 * Usage:
 *   DATABASE_URL=postgres://… node scripts/bootstrap-client.mjs deploy/clients/acme-corp
 *   DATABASE_URL=… node scripts/bootstrap-client.mjs deploy/clients/acme-corp --skip-seed
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const requireFromDb = createRequire(resolve(root, "packages/db/package.json"));

async function runMigrations(databaseUrl) {
  const [{ drizzle }, { migrate }, pg] = await Promise.all([
    import(requireFromDb.resolve("drizzle-orm/node-postgres")),
    import(requireFromDb.resolve("drizzle-orm/node-postgres/migrator")),
    Promise.resolve(requireFromDb("pg")),
  ]);
  const { Pool } = pg;
  const migrationsFolder = resolve(root, "packages/db/migrations");
  if (!existsSync(migrationsFolder)) throw new Error(`Missing ${migrationsFolder}`);

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const db = drizzle({ client: pool });
    await migrate(db, { migrationsFolder });
    console.log("[bootstrap] Migrations applied.");
  } finally {
    await pool.end();
  }
}

function runBaselineSeed(env) {
  const r = spawnSync(
    "pnpm",
    ["--filter", "@aitim/db", "exec", "tsx", "src/seed-baseline.ts"],
    {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  if (r.status !== 0) throw new Error("Baseline seed failed");
}

async function main() {
  const args = process.argv.slice(2);
  const clientArg = args.find((a) => !a.startsWith("-"));
  const skipSeed = args.includes("--skip-seed");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  let client = null;
  if (clientArg) {
    const clientDir = resolve(root, clientArg);
    const configPath = join(clientDir, "client.json");
    if (!existsSync(configPath)) {
      console.error(`Missing ${configPath}`);
      process.exit(1);
    }
    client = JSON.parse(readFileSync(configPath, "utf8"));
    console.log(`[bootstrap] Client: ${client.clientId} (${client.displayName})`);
  }

  console.log("[bootstrap] Running migrations…");
  await runMigrations(databaseUrl);

  if (!skipSeed) {
    console.log("[bootstrap] Running baseline seed…");
    runBaselineSeed({
      DATABASE_URL: databaseUrl,
      CLIENT_ADMIN_EMAIL:
        process.env.CLIENT_ADMIN_EMAIL || client?.admin?.email || "",
      CLIENT_ADMIN_NAME:
        process.env.CLIENT_ADMIN_NAME || client?.admin?.displayName || "Platform Admin",
      CLIENT_DISPLAY_NAME:
        process.env.CLIENT_DISPLAY_NAME || client?.displayName || "",
    });
  } else {
    console.log("[bootstrap] Skipping seed (--skip-seed).");
  }

  console.log("[bootstrap] Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
