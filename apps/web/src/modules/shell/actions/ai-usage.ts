/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use server";

import { agents, aiUsageEvents, db, users } from "@aitim/db";
import { and, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/rbac";

const RANGE_TO_HOURS: Record<string, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
  "90d": 24 * 90,
};

function rangeStart(range?: string): Date | null {
  const hours = range ? RANGE_TO_HOURS[range] : undefined;
  if (!hours) return null;
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/** Aggregate usage — totals plus breakdowns by day/agent/model/user/purpose. Admin only. */
export async function getAiUsageSummary(params?: { range?: string }) {
  await requireAdmin();
  const since = rangeStart(params?.range ?? "7d");
  const where = since ? gte(aiUsageEvents.createdAt, since) : undefined;

  const [totals] = await db
    .select({
      calls: sql<number>`count(*)::int`.mapWith(Number),
      errors: sql<number>`count(*) filter (where ${aiUsageEvents.ok} = false)::int`.mapWith(Number),
      promptTokens: sql<number>`coalesce(sum(${aiUsageEvents.promptTokens}), 0)::bigint`.mapWith(Number),
      completionTokens:
        sql<number>`coalesce(sum(${aiUsageEvents.completionTokens}), 0)::bigint`.mapWith(Number),
      totalTokens: sql<number>`coalesce(sum(${aiUsageEvents.totalTokens}), 0)::bigint`.mapWith(Number),
      avgDurationMs: sql<number>`coalesce(avg(${aiUsageEvents.durationMs}), 0)::int`.mapWith(Number),
      maxDurationMs: sql<number>`coalesce(max(${aiUsageEvents.durationMs}), 0)::int`.mapWith(Number),
    })
    .from(aiUsageEvents)
    .where(where);

  const byDay = await db
    .select({
      day: sql<string>`to_char(${aiUsageEvents.createdAt}, 'YYYY-MM-DD')`,
      calls: sql<number>`count(*)::int`.mapWith(Number),
      totalTokens: sql<number>`coalesce(sum(${aiUsageEvents.totalTokens}), 0)::bigint`.mapWith(Number),
    })
    .from(aiUsageEvents)
    .where(where)
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const byAgent = await db
    .select({
      agentId: aiUsageEvents.agentId,
      agentName: agents.displayName,
      calls: sql<number>`count(*)::int`.mapWith(Number),
      totalTokens: sql<number>`coalesce(sum(${aiUsageEvents.totalTokens}), 0)::bigint`.mapWith(Number),
    })
    .from(aiUsageEvents)
    .leftJoin(agents, eq(agents.id, aiUsageEvents.agentId))
    .where(where)
    .groupBy(aiUsageEvents.agentId, agents.displayName)
    .orderBy(desc(sql`3`))
    .limit(15);

  const byModel = await db
    .select({
      model: aiUsageEvents.model,
      calls: sql<number>`count(*)::int`.mapWith(Number),
      totalTokens: sql<number>`coalesce(sum(${aiUsageEvents.totalTokens}), 0)::bigint`.mapWith(Number),
    })
    .from(aiUsageEvents)
    .where(where)
    .groupBy(aiUsageEvents.model)
    .orderBy(desc(sql`3`))
    .limit(15);

  const byUser = await db
    .select({
      actorUserId: aiUsageEvents.actorUserId,
      actorName: users.displayName,
      actorEmail: users.email,
      calls: sql<number>`count(*)::int`.mapWith(Number),
      totalTokens: sql<number>`coalesce(sum(${aiUsageEvents.totalTokens}), 0)::bigint`.mapWith(Number),
    })
    .from(aiUsageEvents)
    .leftJoin(users, eq(users.id, aiUsageEvents.actorUserId))
    .where(where)
    .groupBy(aiUsageEvents.actorUserId, users.displayName, users.email)
    .orderBy(desc(sql`5`))
    .limit(15);

  const byPurpose = await db
    .select({
      purpose: aiUsageEvents.purpose,
      calls: sql<number>`count(*)::int`.mapWith(Number),
      totalTokens: sql<number>`coalesce(sum(${aiUsageEvents.totalTokens}), 0)::bigint`.mapWith(Number),
    })
    .from(aiUsageEvents)
    .where(where)
    .groupBy(aiUsageEvents.purpose)
    .orderBy(desc(sql`3`));

  return {
    totals: totals ?? {
      calls: 0,
      errors: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      avgDurationMs: 0,
      maxDurationMs: 0,
    },
    byDay,
    byAgent,
    byModel,
    byUser,
    byPurpose,
  };
}

/** Paginated raw usage events for drill-down. Admin only. */
export async function getAiUsageEvents(params?: {
  range?: string;
  agentId?: string;
  actorUserId?: string;
  model?: string;
  purpose?: string;
  status?: "all" | "ok" | "error";
  q?: string;
  limit?: number;
  offset?: number;
}) {
  await requireAdmin();
  const since = rangeStart(params?.range ?? "7d");
  const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
  const offset = Math.max(params?.offset ?? 0, 0);

  const conditions = [];
  if (since) conditions.push(gte(aiUsageEvents.createdAt, since));
  if (params?.agentId) conditions.push(eq(aiUsageEvents.agentId, params.agentId));
  if (params?.actorUserId) conditions.push(eq(aiUsageEvents.actorUserId, params.actorUserId));
  if (params?.model) conditions.push(eq(aiUsageEvents.model, params.model));
  if (params?.purpose) conditions.push(eq(aiUsageEvents.purpose, params.purpose));
  if (params?.status === "ok") conditions.push(eq(aiUsageEvents.ok, true));
  if (params?.status === "error") conditions.push(eq(aiUsageEvents.ok, false));
  if (params?.q?.trim()) {
    const like = `%${params.q.trim()}%`;
    conditions.push(
      or(
        ilike(users.displayName, like),
        ilike(users.email, like),
        ilike(agents.displayName, like),
        ilike(aiUsageEvents.model, like),
        ilike(aiUsageEvents.purpose, like),
      ),
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [items, [{ n: total } = { n: 0 }]] = await Promise.all([
    db
      .select({
        id: aiUsageEvents.id,
        provider: aiUsageEvents.provider,
        model: aiUsageEvents.model,
        purpose: aiUsageEvents.purpose,
        actorUserId: aiUsageEvents.actorUserId,
        actorName: users.displayName,
        actorEmail: users.email,
        agentId: aiUsageEvents.agentId,
        agentName: agents.displayName,
        conversationId: aiUsageEvents.conversationId,
        promptTokens: aiUsageEvents.promptTokens,
        completionTokens: aiUsageEvents.completionTokens,
        totalTokens: aiUsageEvents.totalTokens,
        durationMs: aiUsageEvents.durationMs,
        ok: aiUsageEvents.ok,
        errorMessage: aiUsageEvents.errorMessage,
        createdAt: aiUsageEvents.createdAt,
      })
      .from(aiUsageEvents)
      .leftJoin(users, eq(users.id, aiUsageEvents.actorUserId))
      .leftJoin(agents, eq(agents.id, aiUsageEvents.agentId))
      .where(where)
      .orderBy(desc(aiUsageEvents.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
      .from(aiUsageEvents)
      .leftJoin(users, eq(users.id, aiUsageEvents.actorUserId))
      .leftJoin(agents, eq(agents.id, aiUsageEvents.agentId))
      .where(where),
  ]);

  return {
    items: items.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    total,
  };
}
