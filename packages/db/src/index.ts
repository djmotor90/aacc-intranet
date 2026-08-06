/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index";

export * from "./schema/index";
export { schema };

const globalForDb = globalThis as unknown as { pool?: Pool };

export function getPool(): Pool {
  if (!globalForDb.pool) {
    // App pool only — pg-boss uses PGBOSS_POOL_MAX (keep them separate so the
    // worker + queue don't starve page renders with "timeout exceeded when trying to connect").
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX ?? 20),
      // Remote DBs / firewalls drop idle sockets. Keep connections warm, recycle
      // idle clients before the firewall does, and cap reuse so half-open TCP
      // sockets don't poison the next query as a cryptic Drizzle "Failed query".
      keepAlive: true,
      keepAliveInitialDelayMillis: 5_000,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 20_000,
      maxUses: 750,
      allowExitOnIdle: false,
    });
    // Idle clients can error when the remote end closes the socket. Without this
    // handler Node may throw uncaught, or the pool keeps a dead client.
    pool.on("error", (err) => {
      console.error("[db] idle pool client error (will discard client):", err.message);
    });
    globalForDb.pool = pool;
  }
  return globalForDb.pool;
}

export const db = drizzle({ client: getPool(), schema, casing: "snake_case" });
export type Db = typeof db;
