"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  customFieldDefinitions,
  db,
  statuses,
  taskAssignees,
  tasks,
  taskTags,
  tags,
} from "@aitim/db";
import { valueSchemaFor, type CustomFieldDefinitionLike } from "@aitim/shared";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pingListUpdate } from "@/lib/notify";
import { assertListRole, requireUser } from "@/lib/rbac";
import { logActivity } from "../lib/activity";
import { ensureTaskFollowers } from "../lib/task-watchers";
import { setTaskFollowing } from "./follow";
import { listPath, requireTask } from "./shared";
import { copyTaskToList, duplicateTask, moveTaskToList } from "./tags";
import { archiveTaskById, trashTaskById } from "./tasks";
import { setTaskType } from "./task-types";

const idsSchema = z.array(z.string().uuid()).min(1).max(100);

async function loadSameList(taskIds: string[]) {
  const ids = idsSchema.parse(taskIds);
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "edit_tasks");
  const first = await requireTask(ids[0]);
  await assertListRole(first.list.id, "member");
  const rows = await db
    .select({
      id: tasks.id,
      number: tasks.number,
      title: tasks.title,
      listId: tasks.listId,
      parentTaskId: tasks.parentTaskId,
      statusId: tasks.statusId,
      customFields: tasks.customFields,
    })
    .from(tasks)
    .where(inArray(tasks.id, ids));
  if (rows.length !== ids.length) throw new Error("One or more tasks were not found");
  if (rows.some((row) => row.listId !== first.list.id)) {
    throw new Error("Selected tasks must be on the same list");
  }
  return { user, ids, rows, list: first.list, space: first.space };
}

async function finish(listId: string, spaceSlug: string, listSlug: string) {
  await pingListUpdate(listId);
  revalidatePath(listPath(spaceSlug, listSlug));
  revalidatePath("/tasks", "layout");
}

export async function bulkUpdateStatus(taskIds: string[], statusId: string) {
  const { user, ids, rows, list, space } = await loadSameList(taskIds);
  const sid = z.string().uuid().parse(statusId);
  const [toStatus] = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.id, sid), eq(statuses.listId, list.id)));
  if (!toStatus) throw new Error("Invalid status");
  const done = toStatus.category === "done" || toStatus.category === "cancelled";
  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ statusId: sid, completedAt: done ? new Date() : null })
      .where(inArray(tasks.id, ids));
    for (const row of rows) {
      if (row.statusId === sid) continue;
      await logActivity(tx, {
        spaceId: space.id,
        taskId: row.id,
        actorId: user.id,
        verb: "task.status_changed",
        payload: { to: toStatus.name, bulk: true },
      });
    }
  });
  await finish(list.id, space.slug, list.slug);
  return { ok: ids.length };
}

export async function bulkAddAssignee(taskIds: string[], userId: string) {
  const { user, ids, list, space } = await loadSameList(taskIds);
  const assigneeId = z.string().uuid().parse(userId);
  const existing = await db
    .select({ taskId: taskAssignees.taskId })
    .from(taskAssignees)
    .where(and(inArray(taskAssignees.taskId, ids), eq(taskAssignees.userId, assigneeId)));
  const have = new Set(existing.map((r) => r.taskId));
  const missing = ids.filter((id) => !have.has(id));
  if (missing.length > 0) {
    await db.insert(taskAssignees).values(
      missing.map((taskId) => ({ taskId, userId: assigneeId, assignedBy: user.id })),
    );
    for (const taskId of missing) {
      await ensureTaskFollowers(taskId, [assigneeId], "assigned");
    }
  }
  await finish(list.id, space.slug, list.slug);
  return { ok: missing.length };
}

export async function bulkSetDate(
  taskIds: string[],
  field: "dueDate" | "startDate",
  value: string | null,
) {
  const { user, ids, list, space } = await loadSameList(taskIds);
  if (field !== "dueDate" && field !== "startDate") throw new Error("Invalid date field");
  const parsed = value ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(value) : null;
  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ [field]: parsed }).where(inArray(tasks.id, ids));
    if (field === "dueDate") {
      for (const id of ids) {
        await logActivity(tx, {
          spaceId: space.id,
          taskId: id,
          actorId: user.id,
          verb: "task.due_date_changed",
          payload: { to: parsed, bulk: true },
        });
      }
    }
  });
  await finish(list.id, space.slug, list.slug);
  return { ok: ids.length };
}

export async function bulkSetCustomField(taskIds: string[], defId: string, value: unknown) {
  const { user, ids, rows, list, space } = await loadSameList(taskIds);
  const fieldId = z.string().uuid().parse(defId);
  const [def] = await db.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.id, fieldId));
  if (!def || def.listId !== list.id) throw new Error("Field not found");
  const parsed = valueSchemaFor(def as unknown as CustomFieldDefinitionLike).safeParse(value);
  if (!parsed.success) throw new Error(`Invalid value: ${parsed.error.issues[0]?.message}`);
  await db.transaction(async (tx) => {
    for (const row of rows) {
      const before = (row.customFields ?? {}) as Record<string, unknown>;
      await tx
        .update(tasks)
        .set({ customFields: { ...before, [fieldId]: parsed.data } })
        .where(eq(tasks.id, row.id));
      await logActivity(tx, {
        spaceId: space.id,
        taskId: row.id,
        actorId: user.id,
        verb: "task.field_changed",
        payload: { field: def.label, from: before[fieldId] ?? null, to: parsed.data ?? null, bulk: true },
      });
    }
  });
  await finish(list.id, space.slug, list.slug);
  return { ok: ids.length };
}

export async function bulkAddTag(taskIds: string[], tagId: string) {
  const { user, ids, list, space } = await loadSameList(taskIds);
  const tid = z.string().uuid().parse(tagId);
  const [tag] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.id, tid), eq(tags.spaceId, space.id)));
  if (!tag) throw new Error("Tag not found in this space");
  const existing = await db
    .select({ taskId: taskTags.taskId })
    .from(taskTags)
    .where(and(inArray(taskTags.taskId, ids), eq(taskTags.tagId, tid)));
  const have = new Set(existing.map((r) => r.taskId));
  const missing = ids.filter((id) => !have.has(id));
  if (missing.length > 0) {
    await db.insert(taskTags).values(missing.map((taskId) => ({ taskId, tagId: tid, addedBy: user.id })));
  }
  await finish(list.id, space.slug, list.slug);
  return { ok: missing.length };
}

export async function bulkSetPriority(
  taskIds: string[],
  priority: "urgent" | "high" | "normal" | "low" | null,
) {
  const { user, ids, list, space } = await loadSameList(taskIds);
  const value =
    priority === null ? null : z.enum(["urgent", "high", "normal", "low"]).parse(priority);
  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ priority: value }).where(inArray(tasks.id, ids));
    for (const id of ids) {
      await logActivity(tx, {
        spaceId: space.id,
        taskId: id,
        actorId: user.id,
        verb: "task.priority_changed",
        payload: { to: value, bulk: true },
      });
    }
  });
  await finish(list.id, space.slug, list.slug);
  return { ok: ids.length };
}

export async function bulkSetTaskType(taskIds: string[], taskTypeId: string | null) {
  const ids = idsSchema.parse(taskIds);
  let ok = 0;
  for (const id of ids) {
    await setTaskType(id, taskTypeId);
    ok += 1;
  }
  return { ok };
}

export async function bulkFollow(taskIds: string[], following: boolean) {
  const ids = idsSchema.parse(taskIds);
  for (const id of ids) {
    await setTaskFollowing(id, following);
  }
  return { ok: ids.length };
}

export async function bulkMoveToList(taskIds: string[], targetListId: string) {
  const ids = idsSchema.parse(taskIds);
  const target = z.string().uuid().parse(targetListId);
  for (const id of ids) {
    await moveTaskToList(id, target);
  }
  return { ok: ids.length };
}

export async function bulkCopyToList(taskIds: string[], targetListId: string) {
  const ids = idsSchema.parse(taskIds);
  const target = z.string().uuid().parse(targetListId);
  for (const id of ids) {
    await copyTaskToList(id, target);
  }
  return { ok: ids.length };
}

export async function bulkDuplicate(taskIds: string[]) {
  const ids = idsSchema.parse(taskIds);
  for (const id of ids) {
    await duplicateTask(id);
  }
  return { ok: ids.length };
}

export async function bulkArchive(taskIds: string[]) {
  const ids = idsSchema.parse(taskIds);
  for (const id of ids) {
    await archiveTaskById(id);
  }
  return { ok: ids.length };
}

export async function bulkTrash(taskIds: string[]) {
  const ids = idsSchema.parse(taskIds);
  for (const id of ids) {
    await trashTaskById(id);
  }
  return { ok: ids.length };
}

const MAX_SUBTASK_DEPTH = 5;

export async function convertTasksToSubtasks(parentId: string, childIds: string[]) {
  const parent = z.string().uuid().parse(parentId);
  const children = idsSchema.parse(childIds).filter((id) => id !== parent);
  if (children.length === 0) throw new Error("Pick at least one task to nest");
  const { user, list, space } = await loadSameList([parent, ...children]);
  const { task: parentTask } = await requireTask(parent);
  if (!list.subtasksEnabled) {
    throw new Error("Subtasks are disabled for this list. Enable them in list settings.");
  }

  let depth = 0;
  let walkId: string | null = parentTask.parentTaskId;
  const seen = new Set<string>([parent]);
  while (walkId && !seen.has(walkId) && depth < MAX_SUBTASK_DEPTH + 1) {
    seen.add(walkId);
    depth += 1;
    const [row] = await db.select({ parentTaskId: tasks.parentTaskId }).from(tasks).where(eq(tasks.id, walkId)).limit(1);
    walkId = row?.parentTaskId ?? null;
  }
  if (depth >= MAX_SUBTASK_DEPTH) {
    throw new Error(`Subtasks can only nest ${MAX_SUBTASK_DEPTH} levels deep`);
  }

  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ parentTaskId: parent }).where(inArray(tasks.id, children));
    for (const id of children) {
      await logActivity(tx, {
        spaceId: space.id,
        taskId: id,
        actorId: user.id,
        verb: "task.parent_changed",
        payload: { parentId: parent, parentNumber: parentTask.number },
      });
    }
  });
  await finish(list.id, space.slug, list.slug);
  revalidatePath(`/tasks/task/${parentTask.number}`);
  return { ok: children.length };
}
