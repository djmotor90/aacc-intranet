/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use server";

import {
  activityLog,
  comments,
  db,
  lists,
  spaces,
  statuses,
  taskAssignees,
  tasks,
  users,
} from "@aitim/db";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { platformRoleLabel } from "@/lib/role-labels";
import { requireUser } from "@/lib/rbac";

/** Heartbeat pings every 2 minutes (see presence-heartbeat.tsx) — allow some slack. */
const ONLINE_MS = 5 * 60 * 1000;

export type PublicProfileFocusedTask = {
  taskId: string;
  number: string;
  title: string;
  spaceName: string;
  spaceSlug: string;
  listName: string;
  listSlug: string;
  statusName: string | null;
  activityCount: number;
  percent: number;
};

export type PublicProfileActivityItem = {
  id: number;
  verb: string;
  createdAt: string;
  taskNumber: string | null;
  taskTitle: string | null;
  spaceName: string | null;
  spaceSlug: string | null;
  listSlug: string | null;
  summary: string;
};

export type PublicUserProfile = {
  id: string;
  displayName: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  photoKey: string | null;
  hasPhoto: boolean;
  roleLabel: string;
  isActive: boolean;
  /** Derived from the client heartbeat (falls back to last sign-in). */
  presence: "online" | "offline";
  lastSignedInAt: string | null;
  lastSeenLabel: string;
  counts: {
    tasks: number;
    comments: number;
    activity24h: number;
  };
  focusedTasks: PublicProfileFocusedTask[];
  recentActivity: PublicProfileActivityItem[];
};

function summarizeVerb(verb: string, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (verb) {
    case "task.created":
      return "created a task";
    case "task.status_changed":
      return `changed status${p.from || p.to ? `: ${p.from ?? "?"} → ${p.to ?? "?"}` : ""}`;
    case "task.title_changed":
      return "renamed a task";
    case "task.priority_changed":
      return `set priority to ${p.to ?? "none"}`;
    case "task.due_date_changed":
      return `changed due date to ${p.to ?? "none"}`;
    case "task.assignee_added":
      return "added an assignee";
    case "task.assignee_removed":
      return "removed an assignee";
    case "task.field_changed":
      return `updated ${String(p.field ?? "a field")}`;
    case "comment.created":
      return "commented";
    case "comment.replied":
      return "replied to a comment";
    case "comment.edited":
      return "edited a comment";
    case "attachment.added":
      return "added an attachment";
    case "attachment.version_added":
      return `uploaded attachment version ${p.versionLabel ?? p.versionNumber ?? ""}`.trim();
    case "attachment.version_labeled":
      return `set an attachment version to ${p.versionLabel ?? "a new label"}`;
    case "task.archived":
      return "archived a task";
    case "task.deleted":
      return "moved a task to Trash";
    case "task.restored":
      return "restored a task from Trash";
    case "task.purged":
      return "permanently deleted a task";
    default:
      return verb.replace(/\./g, " ");
  }
}

function lastSeenLabel(lastSignedInAt: Date | null): string {
  if (!lastSignedInAt) return "No recent sign-in";
  const ms = Date.now() - lastSignedInAt.getTime();
  if (ms < ONLINE_MS) return "Online now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `Last seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Last seen ${days}d ago`;
}

/** Public AACC Hub profile for a user. */
export async function getPublicUserProfile(userId: string): Promise<PublicUserProfile> {
  await requireUser();
  const id = z.string().uuid().parse(userId);

  const [row] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      jobTitle: users.jobTitle,
      department: users.department,
      photoKey: users.photoKey,
      platformRole: users.platformRole,
      isProtectedAdmin: users.isProtectedAdmin,
      isActive: users.isActive,
      lastSignedInAt: users.lastSignedInAt,
      lastActiveAt: users.lastActiveAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!row) throw new Error("User not found");

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [taskCountRow] = await db
    .select({ n: count() })
    .from(taskAssignees)
    .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
    .where(
      and(eq(taskAssignees.userId, id), eq(tasks.isArchived, false), isNull(tasks.deletedAt)),
    );

  const [commentCountRow] = await db
    .select({ n: count() })
    .from(comments)
    .where(and(eq(comments.authorId, id), isNull(comments.deletedAt)));

  const [activity24hRow] = await db
    .select({ n: count() })
    .from(activityLog)
    .where(and(eq(activityLog.actorId, id), gte(activityLog.createdAt, since24h)));

  const focusedRaw = await db
    .select({
      taskId: activityLog.taskId,
      activityCount: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.actorId, id),
        gte(activityLog.createdAt, since24h),
        isNotNull(activityLog.taskId),
      ),
    )
    .groupBy(activityLog.taskId)
    .orderBy(desc(sql`count(*)`))
    .limit(6);

  const totalFocus = focusedRaw.reduce((s, r) => s + (r.activityCount ?? 0), 0) || 1;
  const focusTaskIds = focusedRaw.map((r) => r.taskId).filter((x): x is string => !!x);

  let focusedTasks: PublicProfileFocusedTask[] = [];
  if (focusTaskIds.length > 0) {
    const taskRows = await db
      .select({
        id: tasks.id,
        number: tasks.number,
        title: tasks.title,
        spaceName: spaces.name,
        spaceSlug: spaces.slug,
        listName: lists.name,
        listSlug: lists.slug,
        statusName: statuses.name,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(spaces, eq(spaces.id, lists.spaceId))
      .leftJoin(statuses, eq(statuses.id, tasks.statusId))
      .where(inArray(tasks.id, focusTaskIds));

    const byId = new Map(taskRows.map((t) => [t.id, t]));
    focusedTasks = focusedRaw
      .map((r) => {
        if (!r.taskId) return null;
        const t = byId.get(r.taskId);
        if (!t) return null;
        return {
          taskId: t.id,
          number: t.number,
          title: t.title,
          spaceName: t.spaceName,
          spaceSlug: t.spaceSlug,
          listName: t.listName,
          listSlug: t.listSlug,
          statusName: t.statusName,
          activityCount: r.activityCount,
          percent: Math.round((r.activityCount / totalFocus) * 100),
        } satisfies PublicProfileFocusedTask;
      })
      .filter((x): x is PublicProfileFocusedTask => !!x);
  }

  // If little activity, pad "Focused on" with open assigned tasks
  if (focusedTasks.length < 3) {
    const assigned = await db
      .select({
        id: tasks.id,
        number: tasks.number,
        title: tasks.title,
        spaceName: spaces.name,
        spaceSlug: spaces.slug,
        listName: lists.name,
        listSlug: lists.slug,
        statusName: statuses.name,
      })
      .from(taskAssignees)
      .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(spaces, eq(spaces.id, lists.spaceId))
      .leftJoin(statuses, eq(statuses.id, tasks.statusId))
      .where(
        and(eq(taskAssignees.userId, id), eq(tasks.isArchived, false), isNull(tasks.deletedAt)),
      )
      .orderBy(desc(tasks.updatedAt))
      .limit(8);

    const have = new Set(focusedTasks.map((f) => f.taskId));
    for (const t of assigned) {
      if (have.has(t.id)) continue;
      focusedTasks.push({
        taskId: t.id,
        number: t.number,
        title: t.title,
        spaceName: t.spaceName,
        spaceSlug: t.spaceSlug,
        listName: t.listName,
        listSlug: t.listSlug,
        statusName: t.statusName,
        activityCount: 0,
        percent: 0,
      });
      if (focusedTasks.length >= 6) break;
    }
  }

  const activityRows = await db
    .select({
      id: activityLog.id,
      verb: activityLog.verb,
      payload: activityLog.payload,
      createdAt: activityLog.createdAt,
      taskNumber: tasks.number,
      taskTitle: tasks.title,
      spaceName: spaces.name,
      spaceSlug: spaces.slug,
      listSlug: lists.slug,
    })
    .from(activityLog)
    .leftJoin(tasks, eq(tasks.id, activityLog.taskId))
    .leftJoin(lists, eq(lists.id, tasks.listId))
    .leftJoin(spaces, eq(spaces.id, activityLog.spaceId))
    .where(eq(activityLog.actorId, id))
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .limit(40);

  // Most recent of "signed in" and "heartbeat while app open" — a session
  // older than ONLINE_MS still counts as online as long as the tab is open.
  const last =
    row.lastActiveAt && (!row.lastSignedInAt || row.lastActiveAt > row.lastSignedInAt)
      ? row.lastActiveAt
      : row.lastSignedInAt;
  const presence: "online" | "offline" =
    last && Date.now() - last.getTime() < ONLINE_MS ? "online" : "offline";

  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    jobTitle: row.jobTitle,
    department: row.department,
    photoKey: row.photoKey,
    hasPhoto: !!row.photoKey,
    roleLabel: platformRoleLabel(row.platformRole, { protected: row.isProtectedAdmin }),
    isActive: row.isActive,
    presence,
    lastSignedInAt: last ? last.toISOString() : null,
    lastSeenLabel: lastSeenLabel(last),
    counts: {
      tasks: Number(taskCountRow?.n ?? 0),
      comments: Number(commentCountRow?.n ?? 0),
      activity24h: Number(activity24hRow?.n ?? 0),
    },
    focusedTasks,
    recentActivity: activityRows.map((a) => ({
      id: a.id,
      verb: a.verb,
      createdAt: a.createdAt.toISOString(),
      taskNumber: a.taskNumber,
      taskTitle: a.taskTitle,
      spaceName: a.spaceName,
      spaceSlug: a.spaceSlug,
      listSlug: a.listSlug,
      summary: summarizeVerb(a.verb, a.payload),
    })),
  };
}
