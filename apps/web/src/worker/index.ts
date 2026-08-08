/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Background worker: pg-boss consumers + cron schedules.
 * Dev: pnpm worker:dev · Prod: node dist/worker.js (same image as web)
 */
import { PgBoss, type ConstructorOptions } from "pg-boss";
import { runAgentJob, type AgentRunPayload } from "./jobs/agent-run";
import { runEmbedDocJob, type EmbedDocPayload } from "./jobs/embed-doc";
import {
  runDueSoonScanner,
  runHourlyEmailDigest,
  sendNotificationEmail,
} from "./jobs/notifications";
import { runSyncEntra, runSyncGroupCatalog } from "./jobs/sync-entra";
import { runSyncPhotos } from "./jobs/sync-photos";

const QUEUES = {
  syncEntra: "sync-entra",
  syncPhotos: "sync-photos",
  syncGroupCatalog: "sync-group-catalog",
  notificationEmail: "send-notification-email",
  notificationDigest: "notification-email-digest",
  dueSoon: "due-soon-scanner",
  agentRun: "agent-run",
  embedDoc: "embed-doc",
} as const;

/** node-pg Pool options pg-boss forwards but does not list on ConstructorOptions. */
type BossPoolExtras = {
  keepAlive?: boolean;
  keepAliveInitialDelayMillis?: number;
  idleTimeoutMillis?: number;
};

/** Pool options shared with node-pg — keep remote / firewalled connections alive. */
const bossDbOptions: ConstructorOptions & BossPoolExtras = {
  connectionString: process.env.DATABASE_URL!,
  // Separate from the Next.js app pool (DATABASE_POOL_MAX).
  max: Number(process.env.PGBOSS_POOL_MAX ?? 3),
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 15_000,
};

async function main() {
  const boss = new PgBoss(bossDbOptions);
  boss.on("error", (err: Error) => console.error("pg-boss error", err));
  await boss.start();

  for (const queue of Object.values(QUEUES)) {
    await boss.createQueue(queue).catch(() => {});
  }

  const graphConfigured = !!process.env.DAEMON_CLIENT_ID && !!process.env.DAEMON_CLIENT_SECRET;

  await boss.work(QUEUES.syncEntra, async () => {
    if (!graphConfigured) throw new Error("Daemon credentials not configured");
    console.log("[sync-entra]", await runSyncEntra());
  });

  await boss.work(QUEUES.syncGroupCatalog, async () => {
    if (!graphConfigured) throw new Error("Daemon credentials not configured");
    console.log("[sync-group-catalog]", `imported ${await runSyncGroupCatalog()} groups`);
  });

  await boss.work(QUEUES.syncPhotos, async () => {
    if (!graphConfigured) throw new Error("Daemon credentials not configured");
    console.log("[sync-photos]", await runSyncPhotos());
  });

  await boss.work<{ notificationId: string }>(QUEUES.notificationEmail, async ([job]) => {
    console.log("[notification-email]", await sendNotificationEmail(job.data.notificationId));
  });

  await boss.work(QUEUES.notificationDigest, async () => {
    console.log("[notification-digest]", await runHourlyEmailDigest());
  });

  await boss.work(QUEUES.dueSoon, async () => {
    console.log("[due-soon]", await runDueSoonScanner());
  });

  await boss.work<AgentRunPayload>(QUEUES.agentRun, async ([job]) => {
    console.log("[agent-run]", await runAgentJob(job.data));
  });

  await boss.work<EmbedDocPayload>(QUEUES.embedDoc, async ([job]) => {
    try {
      console.log("[embed-doc]", await runEmbedDocJob(job.data));
    } catch (err) {
      console.error("[embed-doc] failed", job.data.pageId, err);
      throw err;
    }
  });

  await boss.schedule(QUEUES.dueSoon, "0 7 * * *"); // daily 07:00
  // Hourly email digest for users with Preferences → Email cadence → Hourly
  await boss.schedule(QUEUES.notificationDigest, "5 * * * *"); // :05 every hour

  if (graphConfigured) {
    await boss.schedule(QUEUES.syncEntra, "*/30 * * * *"); // every 30 min
    await boss.schedule(QUEUES.syncPhotos, "0 3 * * *"); // daily 03:00
  } else {
    console.warn("DAEMON_CLIENT_ID/SECRET not set — Graph sync schedules disabled");
  }

  console.log("Worker started. Queues:", Object.values(QUEUES).join(", "));
}

main().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
