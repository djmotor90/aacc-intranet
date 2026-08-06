/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { auditLogs, db, users } from "@aitim/db";
import { desc, eq, and, sql, type SQL } from "drizzle-orm";
import { headers } from "next/headers";

/** ClickUp-style audit categories (tabs). */
export const AUDIT_CATEGORIES = [
  "user",
  "task",
  "fields",
  "hierarchy",
  "agents",
  "other",
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export type AuditEventStatus = "success" | "failure" | "denied";

export type WriteAuditInput = {
  category: AuditCategory;
  eventType: string;
  title: string;
  eventStatus?: AuditEventStatus;
  actorId?: string | null;
  actorEmail?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  spaceId?: string | null;
  taskId?: string | null;
  clientIp?: string | null;
  clientAgent?: string | null;
  payload?: Record<string, unknown>;
};

/** Map product activity verbs → audit category + event type + title. */
export function mapActivityVerbToAudit(verb: string): {
  category: AuditCategory;
  eventType: string;
  title: string;
} {
  const upper = verb.toUpperCase().replace(/\./g, "_");
  if (verb.startsWith("task.") || verb.startsWith("comment.") || verb.startsWith("attachment")) {
    return {
      category: "task",
      eventType: upper,
      title: humanizeVerb(verb),
    };
  }
  if (verb.startsWith("field.") || verb.startsWith("status.") || verb.includes("tag")) {
    return {
      category: "fields",
      eventType: upper,
      title: humanizeVerb(verb),
    };
  }
  if (
    verb.startsWith("space.") ||
    verb.startsWith("folder.") ||
    verb.startsWith("list.") ||
    verb.includes("member_") ||
    verb.includes("privacy") ||
    verb.includes("moved")
  ) {
    return {
      category: "hierarchy",
      eventType: upper,
      title: humanizeVerb(verb),
    };
  }
  if (verb.startsWith("user.") || verb.includes("login") || verb.includes("logout")) {
    return { category: "user", eventType: upper, title: humanizeVerb(verb) };
  }
  return { category: "other", eventType: upper, title: humanizeVerb(verb) };
}

function humanizeVerb(verb: string): string {
  return verb
    .split(/[._]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function requestClientMeta(): Promise<{
  clientIp: string | null;
  clientAgent: string | null;
}> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const clientIp =
      (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
      h.get("x-real-ip") ||
      null;
    const clientAgent = h.get("user-agent");
    return { clientIp, clientAgent };
  } catch {
    return { clientIp: null, clientAgent: null };
  }
}

/**
 * Append an enterprise audit log entry. Never throws to callers — audit must
 * not break product mutations.
 */
export async function writeAuditLog(input: WriteAuditInput): Promise<void> {
  try {
    let actorEmail = input.actorEmail ?? null;
    let actorName = input.actorName ?? null;
    let actorRole = input.actorRole ?? null;

    if (input.actorId && (!actorEmail || !actorName || !actorRole)) {
      const [u] = await db
        .select({
          email: users.email,
          displayName: users.displayName,
          platformRole: users.platformRole,
          isProtectedAdmin: users.isProtectedAdmin,
        })
        .from(users)
        .where(eq(users.id, input.actorId))
        .limit(1);
      if (u) {
        actorEmail = actorEmail ?? u.email;
        actorName = actorName ?? u.displayName;
        actorRole =
          actorRole ??
          (u.isProtectedAdmin || u.platformRole === "admin" ? "super_admin" : u.platformRole);
      }
    }

    const meta =
      input.clientIp != null || input.clientAgent != null
        ? { clientIp: input.clientIp ?? null, clientAgent: input.clientAgent ?? null }
        : await requestClientMeta();

    const status = input.eventStatus ?? "success";
    const payload = {
      title: input.title,
      eventType: input.eventType,
      eventStatus: status,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      eventContext: {
        userId: input.actorId ?? null,
        userName: actorName,
        userEmail: actorEmail,
        userRole: actorRole,
        clientIp: meta.clientIp,
        clientAgent: meta.clientAgent,
      },
      ...(input.payload ?? {}),
    };

    await db.insert(auditLogs).values({
      category: input.category,
      eventType: input.eventType,
      eventStatus: status,
      title: input.title,
      actorId: input.actorId ?? null,
      actorEmail,
      actorName,
      actorRole,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      targetLabel: input.targetLabel ?? null,
      spaceId: input.spaceId ?? null,
      taskId: input.taskId ?? null,
      clientIp: meta.clientIp,
      clientAgent: meta.clientAgent,
      payload,
    });
  } catch (err) {
    console.error("[audit] write failed", err);
  }
}

/** Dual-write from product activity (space-scoped mutations). */
export async function auditFromActivity(entry: {
  spaceId: string;
  taskId?: string;
  actorId?: string | null;
  actorLabel?: string;
  verb: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const mapped = mapActivityVerbToAudit(entry.verb);
  await writeAuditLog({
    category: mapped.category,
    eventType: mapped.eventType,
    title: mapped.title,
    eventStatus: "success",
    actorId: entry.actorId,
    actorName: entry.actorLabel,
    spaceId: entry.spaceId,
    taskId: entry.taskId,
    payload: {
      activityVerb: entry.verb,
      activityPayload: entry.payload ?? {},
    },
    targetType: entry.taskId ? "task" : "space",
    targetId: entry.taskId ?? entry.spaceId,
  });
}

export type AuditLogRow = {
  id: number;
  category: string;
  eventType: string;
  eventStatus: string;
  title: string;
  actorId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  spaceId: string | null;
  taskId: string | null;
  clientIp: string | null;
  clientAgent: string | null;
  payload: unknown;
  createdAt: string;
};

export async function queryAuditLogs(params: {
  category?: AuditCategory | "all";
  status?: AuditEventStatus | "all";
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: AuditLogRow[]; total: number }> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  const conditions: SQL[] = [];
  if (params.category && params.category !== "all") {
    conditions.push(eq(auditLogs.category, params.category));
  }
  if (params.status && params.status !== "all") {
    conditions.push(eq(auditLogs.eventStatus, params.status));
  }
  if (params.q?.trim()) {
    const like = `%${params.q.trim()}%`;
    conditions.push(
      sql`(
        ${auditLogs.title} ilike ${like}
        or ${auditLogs.eventType} ilike ${like}
        or ${auditLogs.actorName} ilike ${like}
        or ${auditLogs.actorEmail} ilike ${like}
        or ${auditLogs.targetLabel} ilike ${like}
      )`,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(where);

  const rows = await db
    .select()
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(limit)
    .offset(offset);

  return {
    total: countRow?.n ?? 0,
    items: rows.map((r) => ({
      id: r.id,
      category: r.category,
      eventType: r.eventType,
      eventStatus: r.eventStatus,
      title: r.title,
      actorId: r.actorId,
      actorEmail: r.actorEmail,
      actorName: r.actorName,
      actorRole: r.actorRole,
      targetType: r.targetType,
      targetId: r.targetId,
      targetLabel: r.targetLabel,
      spaceId: r.spaceId,
      taskId: r.taskId,
      clientIp: r.clientIp,
      clientAgent: r.clientAgent,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
