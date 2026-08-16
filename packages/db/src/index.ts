/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index";
import { spaceTaskCounters } from "./schema/tasks";

export * from "./schema/index";
export { schema };

const globalForDb = globalThis as unknown as { pool?: Pool };

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw?.trim()) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
}

const TRANSIENT_DATABASE_CODES = new Set([
  "08000",
  "08001",
  "08003",
  "08006",
  "53300",
  "57P01",
  "57P02",
  "57P03",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
]);

/** Whether a pg/Drizzle failure is safe to retry for an idempotent operation. */
export function isTransientDatabaseError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth++) {
    if (!(current instanceof Error)) break;
    const code = (current as Error & { code?: string }).code;
    if (code && TRANSIENT_DATABASE_CODES.has(code)) return true;
    const message = current.message.toLowerCase();
    if (
      message.includes("timeout") ||
      message.includes("connection terminated") ||
      message.includes("connection reset") ||
      message.includes("failed query")
    ) {
      return true;
    }
    current = (current as Error & { cause?: unknown }).cause;
  }
  return false;
}

/** Retry a short idempotent database operation after transient pool/network failures. */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = boundedInt(String(options.attempts ?? ""), 2, 1, 4);
  const baseDelayMs = boundedInt(String(options.baseDelayMs ?? ""), 150, 25, 2_000);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransientDatabaseError(error)) throw error;
      // Add jitter so concurrent SSR requests do not all reconnect on the same
      // millisecond after PostgreSQL or the container network comes back.
      const jitterMs = Math.floor(Math.random() * baseDelayMs);
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt + jitterMs));
    }
  }
  throw lastError;
}

export function getPool(): Pool {
  if (!globalForDb.pool) {
    // App pool only — pg-boss uses PGBOSS_POOL_MAX (keep them separate so the
    // worker + queue don't starve page renders with "timeout exceeded when trying to connect").
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: boundedInt(process.env.DATABASE_POOL_MAX, 10, 2, 50),
      min: boundedInt(process.env.DATABASE_POOL_MIN, 1, 0, 10),
      // Remote DBs / firewalls drop idle sockets. Keep connections warm, recycle
      // idle clients before the firewall does, and cap reuse so half-open TCP
      // sockets don't poison the next query as a cryptic Drizzle "Failed query".
      keepAlive: true,
      keepAliveInitialDelayMillis: 5_000,
      idleTimeoutMillis: boundedInt(process.env.DATABASE_IDLE_TIMEOUT_MS, 60_000, 5_000, 300_000),
      connectionTimeoutMillis: boundedInt(
        process.env.DATABASE_CONNECT_TIMEOUT_MS,
        15_000,
        2_000,
        60_000,
      ),
      query_timeout: boundedInt(process.env.DATABASE_QUERY_TIMEOUT_MS, 30_000, 5_000, 120_000),
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

/** Transaction-scoped handle accepted by helpers below. */
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Atomically allocate the next task number for a space (e.g. "ENG-142").
 * Shared by every domain that creates tasks — lives here (not in a single
 * module's action file) so cross-domain callers don't need a cross-module import.
 */
export async function allocateTaskNumber(tx: DbTx, spaceId: string, taskPrefix: string): Promise<string> {
  const [counter] = await tx
    .update(spaceTaskCounters)
    .set({ nextNumber: sql`${spaceTaskCounters.nextNumber} + 1` })
    .where(eq(spaceTaskCounters.spaceId, spaceId))
    .returning({ next: spaceTaskCounters.nextNumber });
  if (!counter) throw new Error("Space task counter not found");
  return `${taskPrefix}-${counter.next - 1}`;
}
