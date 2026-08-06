/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { PgBoss, type ConstructorOptions } from "pg-boss";

const globalForBoss = globalThis as unknown as { bossStarted?: Promise<PgBoss> };

export const JOBS = {
  syncEntra: "sync-entra",
  syncPhotos: "sync-photos",
} as const;

/** node-pg Pool options pg-boss forwards but does not list on ConstructorOptions. */
type BossPoolExtras = {
  keepAlive?: boolean;
  keepAliveInitialDelayMillis?: number;
  idleTimeoutMillis?: number;
};

/** Shared pg-boss instance (publisher in web, worker registers handlers too). */
export function getBoss(): Promise<PgBoss> {
  if (!globalForBoss.bossStarted) {
    const options: ConstructorOptions & BossPoolExtras = {
      connectionString: process.env.DATABASE_URL!,
      // Separate from DATABASE_POOL_MAX (app queries) so boss doesn't starve SSR.
      max: Number(process.env.PGBOSS_POOL_MAX ?? 3),
      connectionTimeoutMillis: 15_000,
      // Match worker pool settings so firewalled remote DBs don't drop idle sockets.
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      idleTimeoutMillis: 20_000,
    };
    const boss = new PgBoss(options);
    boss.on("error", (err: Error) => console.error("pg-boss error", err));
    globalForBoss.bossStarted = boss.start();
  }
  return globalForBoss.bossStarted;
}

export async function enqueue(name: string, data?: object): Promise<string | null> {
  const boss = await getBoss();
  await boss.createQueue(name).catch(() => {});
  return boss.send(name, data ?? {});
}
