"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, timeEntries } from "@aitim/db";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertListRole, getListRole, requireUser } from "@/lib/rbac";
import { logActivity } from "../lib/activity";
import {
  DEFAULT_DAILY_CAPACITY_SECONDS,
  endOfLocalDay,
  normalizeTimeTags,
  startOfLocalDay,
} from "../lib/time";
import {
  getActiveUsers,
  getRunningTimerForUser,
  getTaskTimeSummary,
  getUserTimeEntries,
  getUserTodayTrackedSeconds,
  getWritableListsForUser,
  searchTasksForTimeTracking,
  type TaskTimeSummary,
  type TimeEntryRow,
  type TimeTaskSuggestion,
} from "../queries";
import { requireTask } from "./shared";

const uuid = z.string().uuid();
const optionalTaskId = z.string().uuid().nullable().optional();
const notesSchema = z.string().max(2000).optional().nullable();
const tagsSchema = z.array(z.string().max(40)).max(12).optional();

function revalidateTimePaths(taskNumber?: string | null) {
  revalidatePath("/tasks");
  revalidatePath("/tasks/timesheet");
  if (taskNumber) revalidatePath(`/tasks/task/${taskNumber}`);
}

async function requireWritableTask(taskId: string) {
  const ctx = await requireTask(taskId);
  await assertListRole(ctx.list.id, "member");
  return ctx;
}

async function stopRunningTimer(userId: string, now = new Date()) {
  const [running] = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.endedAt)))
    .limit(1);
  if (!running) return null;
  const seconds = Math.max(0, Math.floor((now.getTime() - running.startedAt.getTime()) / 1000));
  const [updated] = await db
    .update(timeEntries)
    .set({
      endedAt: now,
      durationSeconds: seconds || 1,
    })
    .where(eq(timeEntries.id, running.id))
    .returning();
  return updated ?? running;
}

export async function startTimeTimer(input: {
  taskId?: string | null;
  notes?: string | null;
  billable?: boolean;
  tags?: string[];
}): Promise<TimeEntryRow> {
  const user = await requireUser();
  const taskId = optionalTaskId.parse(input.taskId ?? null) ?? null;
  const notes = notesSchema.parse(input.notes ?? null) ?? null;
  const tags = normalizeTimeTags(tagsSchema.parse(input.tags ?? []));
  const billable = Boolean(input.billable);

  let taskNumber: string | null = null;
  let spaceId: string | null = null;
  if (taskId) {
    const ctx = await requireWritableTask(taskId);
    taskNumber = ctx.task.number;
    spaceId = ctx.space.id;
  }

  const now = new Date();
  await stopRunningTimer(user.id, now);

  let created: typeof timeEntries.$inferSelect;
  try {
    const [row] = await db
      .insert(timeEntries)
      .values({
        taskId,
        userId: user.id,
        startedAt: now,
        endedAt: null,
        durationSeconds: 0,
        notes,
        billable,
        tags,
        createdBy: user.id,
      })
      .returning();
    created = row;
  } catch {
    throw new Error("Could not start timer. Stop the current one and try again.");
  }

  if (taskId && spaceId) {
    await logActivity(db, {
      spaceId,
      taskId,
      actorId: user.id,
      verb: "time.started",
      payload: { entryId: created.id },
    });
  }
  revalidateTimePaths(taskNumber);
  const [row] = await import("../queries").then((q) => q.getTimeEntriesByIds([created.id]));
  if (!row) throw new Error("Timer could not be started");
  return row;
}

export async function stopTimeTimer(): Promise<TimeEntryRow | null> {
  const user = await requireUser();
  const stopped = await stopRunningTimer(user.id);
  if (!stopped) return null;

  let taskNumber: string | null = null;
  if (stopped.taskId) {
    try {
      const ctx = await requireTask(stopped.taskId);
      taskNumber = ctx.task.number;
      await logActivity(db, {
        spaceId: ctx.space.id,
        taskId: stopped.taskId,
        actorId: user.id,
        verb: "time.stopped",
        payload: { entryId: stopped.id, seconds: stopped.durationSeconds },
      });
    } catch {
      // Task may have been deleted; still persist the stopped timer.
    }
  }
  revalidateTimePaths(taskNumber);
  const [row] = await import("../queries").then((q) => q.getTimeEntriesByIds([stopped.id]));
  return row ?? null;
}

export async function logTimeEntry(input: {
  taskId?: string | null;
  userId?: string;
  startedAt: string;
  endedAt: string;
  notes?: string | null;
  billable?: boolean;
  tags?: string[];
}): Promise<TimeEntryRow> {
  const actor = await requireUser();
  const taskId = optionalTaskId.parse(input.taskId ?? null) ?? null;
  const userId = uuid.parse(input.userId ?? actor.id);
  const notes = notesSchema.parse(input.notes ?? null) ?? null;
  const tags = normalizeTimeTags(tagsSchema.parse(input.tags ?? []));
  const billable = Boolean(input.billable);
  const startedAt = z.coerce.date().parse(input.startedAt);
  const endedAt = z.coerce.date().parse(input.endedAt);
  if (endedAt.getTime() <= startedAt.getTime()) {
    throw new Error("End time must be after start time");
  }
  const durationSeconds = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  if (durationSeconds > 48 * 3600) {
    throw new Error("A single time entry cannot be longer than 48 hours");
  }

  let taskNumber: string | null = null;
  let spaceId: string | null = null;
  if (taskId) {
    const ctx = await requireWritableTask(taskId);
    taskNumber = ctx.task.number;
    spaceId = ctx.space.id;
  }

  const [created] = await db
    .insert(timeEntries)
    .values({
      taskId,
      userId,
      startedAt,
      endedAt,
      durationSeconds,
      notes,
      billable,
      tags,
      createdBy: actor.id,
    })
    .returning();

  if (taskId && spaceId) {
    await logActivity(db, {
      spaceId,
      taskId,
      actorId: actor.id,
      verb: "time.logged",
      payload: { entryId: created.id, seconds: durationSeconds, userId },
    });
  }
  revalidateTimePaths(taskNumber);
  const [row] = await import("../queries").then((q) => q.getTimeEntriesByIds([created.id]));
  if (!row) throw new Error("Time entry could not be saved");
  return row;
}

export async function updateTimeEntry(
  entryId: string,
  input: {
    taskId?: string | null;
    startedAt?: string;
    endedAt?: string | null;
    notes?: string | null;
    billable?: boolean;
    tags?: string[];
  },
): Promise<TimeEntryRow> {
  const actor = await requireUser();
  const id = uuid.parse(entryId);
  const [existing] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
  if (!existing) throw new Error("Time entry not found");

  if (existing.taskId) {
    const ctx = await requireTask(existing.taskId);
    const role = await getListRole(actor.id, ctx.list.id, actor.platformRole);
    const canEdit = existing.userId === actor.id || role === "owner" || actor.platformRole === "admin";
    if (!canEdit) throw new Error("You can only edit your own time entries");
  } else if (existing.userId !== actor.id && actor.platformRole !== "admin") {
    throw new Error("You can only edit your own time entries");
  }

  const nextTaskId =
    input.taskId === undefined ? existing.taskId : (optionalTaskId.parse(input.taskId) ?? null);
  if (nextTaskId && nextTaskId !== existing.taskId) {
    await requireWritableTask(nextTaskId);
  }

  const startedAt = input.startedAt ? z.coerce.date().parse(input.startedAt) : existing.startedAt;
  const endedAt =
    input.endedAt === undefined
      ? existing.endedAt
      : input.endedAt === null
        ? null
        : z.coerce.date().parse(input.endedAt);

  let durationSeconds = existing.durationSeconds;
  if (endedAt) {
    if (endedAt.getTime() <= startedAt.getTime()) throw new Error("End time must be after start time");
    durationSeconds = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  }

  await db
    .update(timeEntries)
    .set({
      taskId: nextTaskId,
      startedAt,
      endedAt,
      durationSeconds: endedAt ? durationSeconds : 0,
      notes: input.notes === undefined ? existing.notes : (notesSchema.parse(input.notes) ?? null),
      billable: input.billable === undefined ? existing.billable : Boolean(input.billable),
      tags: input.tags === undefined ? existing.tags : normalizeTimeTags(tagsSchema.parse(input.tags)),
    })
    .where(eq(timeEntries.id, id));

  let taskNumber: string | null = null;
  const taskIdForLog = nextTaskId ?? existing.taskId;
  if (taskIdForLog) {
    try {
      const ctx = await requireTask(taskIdForLog);
      taskNumber = ctx.task.number;
      await logActivity(db, {
        spaceId: ctx.space.id,
        taskId: taskIdForLog,
        actorId: actor.id,
        verb: "time.updated",
        payload: { entryId: id },
      });
    } catch {
      // ignore missing task
    }
  }
  revalidateTimePaths(taskNumber);
  const [row] = await import("../queries").then((q) => q.getTimeEntriesByIds([id]));
  if (!row) throw new Error("Time entry could not be updated");
  return row;
}

export async function deleteTimeEntry(entryId: string): Promise<void> {
  const actor = await requireUser();
  const id = uuid.parse(entryId);
  const [existing] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
  if (!existing) return;

  let taskNumber: string | null = null;
  if (existing.taskId) {
    const ctx = await requireTask(existing.taskId);
    const role = await getListRole(actor.id, ctx.list.id, actor.platformRole);
    const canDelete = existing.userId === actor.id || role === "owner" || actor.platformRole === "admin";
    if (!canDelete) throw new Error("You can only delete your own time entries");
    taskNumber = ctx.task.number;
    await logActivity(db, {
      spaceId: ctx.space.id,
      taskId: existing.taskId,
      actorId: actor.id,
      verb: "time.deleted",
      payload: { entryId: id, seconds: existing.durationSeconds },
    });
  } else if (existing.userId !== actor.id && actor.platformRole !== "admin") {
    throw new Error("You can only delete your own time entries");
  }

  await db.delete(timeEntries).where(eq(timeEntries.id, id));
  revalidateTimePaths(taskNumber);
}

export async function getTaskTimeTracking(taskId: string): Promise<TaskTimeSummary> {
  const id = uuid.parse(taskId);
  const ctx = await requireTask(id);
  await assertListRole(ctx.list.id, "guest");
  return getTaskTimeSummary(id);
}

export async function searchTimeTasks(query: string): Promise<TimeTaskSuggestion[]> {
  const user = await requireUser();
  const lists = await getWritableListsForUser(user);
  return searchTasksForTimeTracking(
    lists.map((l) => l.id),
    query,
    12,
  );
}

export interface TimeTrackerState {
  currentUser: { id: string; displayName: string; photoKey: string | null };
  users: { id: string; displayName: string; photoKey: string | null }[];
  running: TimeEntryRow | null;
  todaySeconds: number;
  capacitySeconds: number;
  recent: TimeEntryRow[];
}

export async function getMyTimeTrackerState(): Promise<TimeTrackerState> {
  const user = await requireUser();
  const now = new Date();
  const from = startOfLocalDay(now);
  const to = endOfLocalDay(now);
  const weekAgo = new Date(from);
  weekAgo.setDate(weekAgo.getDate() - 13);
  const [running, todaySeconds, recent, users] = await Promise.all([
    getRunningTimerForUser(user.id),
    getUserTodayTrackedSeconds(user.id, from, new Date(to.getTime() + 1)),
    getUserTimeEntries(user.id, weekAgo, new Date(to.getTime() + 1)),
    getActiveUsers(),
  ]);
  const me = users.find((u) => u.id === user.id);
  return {
    currentUser: {
      id: user.id,
      displayName: me?.displayName ?? user.name ?? "Me",
      photoKey: me?.photoKey ?? null,
    },
    users,
    running,
    todaySeconds,
    capacitySeconds: DEFAULT_DAILY_CAPACITY_SECONDS,
    recent,
  };
}

export async function getMyTimesheet(fromIso: string, toIso: string): Promise<TimeEntryRow[]> {
  const user = await requireUser();
  const from = z.coerce.date().parse(fromIso);
  const to = z.coerce.date().parse(toIso);
  return getUserTimeEntries(user.id, from, to);
}
