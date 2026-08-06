"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, spaceTaskCounters, statuses, tags, taskAssignees, tasks, taskTags } from "@aitim/db";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pingListUpdate } from "@/lib/notify";
import { assertListRole, requireUser } from "@/lib/rbac";
import { logActivity } from "../lib/activity";
import {
  allocateTaskNumber,
  listPath,
  requireList,
  requireTask,
  resolveListDefaultStatusId,
} from "./shared";

/** Private palette for auto-coloring new tags (not exported — "use server" forbids non-async exports). */
const TAG_COLORS = [
  "#ef4444",
  "#BE5513",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#007582",
  "#15515A",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
] as const;

function pickTagColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

/** Add or remove an existing space tag on a task. */
export async function toggleTaskTag(taskId: string, tagId: string) {
  "use server";
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  await assertListRole(list.id, "member");

  const [tag] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.spaceId, space.id)));
  if (!tag) throw new Error("Tag not found in this space");

  const existing = await db
    .select()
    .from(taskTags)
    .where(and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tagId)));

  await db.transaction(async (tx) => {
    if (existing.length > 0) {
      await tx
        .delete(taskTags)
        .where(and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tagId)));
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.tag_removed",
        payload: { tagId, name: tag.name },
      });
    } else {
      await tx.insert(taskTags).values({ taskId, tagId, addedBy: user.id });
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.tag_added",
        payload: { tagId, name: tag.name },
      });
    }
  });

  await pingListUpdate(task.listId);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${task.number}`);
}

/**
 * Create a new space tag (or reuse an existing one with the same name,
 * case-insensitive) and attach it to the task — same flow as ClickUp's
 * "type a name → Create" action in the tag picker.
 */
export async function createAndAddTag(
  taskId: string,
  name: string,
  color?: string,
): Promise<{ id: string; name: string; color: string }> {
  "use server";
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  await assertListRole(list.id, "member");

  const trimmed = z.string().min(1).max(40).parse(name.trim());
  const colorValue = color
    ? z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(color)
    : pickTagColor(trimmed.toLowerCase());

  // Reuse existing tag if the name already exists in this space (any casing).
  const [existingTag] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.spaceId, space.id), sql`lower(${tags.name}) = lower(${trimmed})`));

  let tag = existingTag;
  if (!tag) {
    const [created] = await db
      .insert(tags)
      .values({
        spaceId: space.id,
        name: trimmed,
        color: colorValue,
        createdBy: user.id,
      })
      .returning();
    tag = created;
  }

  const alreadyOnTask = await db
    .select()
    .from(taskTags)
    .where(and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tag.id)));

  if (alreadyOnTask.length === 0) {
    await db.transaction(async (tx) => {
      await tx.insert(taskTags).values({ taskId, tagId: tag.id, addedBy: user.id });
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.tag_added",
        payload: { tagId: tag.id, name: tag.name, created: !existingTag },
      });
    });
  }

  await pingListUpdate(task.listId);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${task.number}`);
  return { id: tag.id, name: tag.name, color: tag.color };
}

/**
 * Duplicate a task in the same list (new number, "(copy)" title).
 * Copies core fields, assignees, and tags. Does not copy subtasks/comments/attachments.
 */
export async function duplicateTask(taskId: string): Promise<{ id: string; number: string }> {
  const id = z.string().uuid().parse(taskId);
  const { task, list, space } = await requireTask(id);
  const user = await requireUser();
  await assertListRole(list.id, "member");

  const assigneeRows = await db
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, id));
  const tagRows = await db
    .select({ tagId: taskTags.tagId })
    .from(taskTags)
    .where(eq(taskTags.taskId, id));

  let createdId = "";
  let createdNumber = "";
  await db.transaction(async (tx) => {
    const number = await allocateTaskNumber(tx, space.id, space.taskPrefix);
    const title = task.title.endsWith(" (copy)") ? task.title : `${task.title} (copy)`;
    const [created] = await tx
      .insert(tasks)
      .values({
        listId: list.id,
        parentTaskId: task.parentTaskId,
        number,
        title,
        description: task.description,
        statusId: task.statusId,
        priority: task.priority,
        dueDate: task.dueDate,
        startDate: task.startDate,
        customFields: task.customFields ?? {},
        createdBy: user.id,
        source: "manual",
      })
      .returning({ id: tasks.id, number: tasks.number });
    createdId = created!.id;
    createdNumber = created!.number;

    if (assigneeRows.length > 0) {
      await tx.insert(taskAssignees).values(
        assigneeRows.map((a) => ({
          taskId: createdId,
          userId: a.userId,
          assignedBy: user.id,
        })),
      );
    }
    if (tagRows.length > 0) {
      await tx.insert(taskTags).values(
        tagRows.map((t) => ({ taskId: createdId, tagId: t.tagId, addedBy: user.id })),
      );
    }
    await logActivity(tx, {
      spaceId: space.id,
      taskId: createdId,
      actorId: user.id,
      verb: "task.created",
      payload: { title, number: createdNumber, duplicatedFrom: task.number },
    });
  });

  await pingListUpdate(list.id);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath("/tasks", "layout");
  return { id: createdId, number: createdNumber };
}

async function resolveTargetStatusId(
  targetListId: string,
  sourceStatusName: string | null,
  targetDefaultStatusId: string | null,
): Promise<string> {
  if (sourceStatusName) {
    const [match] = await db
      .select({ id: statuses.id })
      .from(statuses)
      .where(and(eq(statuses.listId, targetListId), eq(statuses.name, sourceStatusName)))
      .limit(1);
    if (match) return match.id;
  }
  return resolveListDefaultStatusId(targetListId, targetDefaultStatusId);
}

/**
 * Move a task to another list the user can edit.
 * Same-space keeps the task number; cross-space allocates a new number.
 * Status is remapped by name when possible, else list default.
 * Custom fields reset when leaving the source list (defs are list-scoped).
 * Tags kept only when staying in the same space.
 */
export async function moveTaskToList(taskId: string, targetListId: string) {
  const id = z.string().uuid().parse(taskId);
  const targetId = z.string().uuid().parse(targetListId);
  const { task, list: sourceList, space: sourceSpace } = await requireTask(id);
  const { list: targetList, space: targetSpace } = await requireList(targetId);
  const user = await requireUser();
  await assertListRole(sourceList.id, "member");
  await assertListRole(targetList.id, "member");

  if (sourceList.id === targetList.id) {
    throw new Error("Task is already on this list");
  }

  const [sourceStatus] = await db
    .select({ name: statuses.name })
    .from(statuses)
    .where(eq(statuses.id, task.statusId))
    .limit(1);
  const statusId = await resolveTargetStatusId(
    targetList.id,
    sourceStatus?.name ?? null,
    targetList.defaultStatusId,
  );

  const sameSpace = sourceSpace.id === targetSpace.id;
  const customFields = sameSpace && sourceList.id === targetList.id ? (task.customFields ?? {}) : {};

  await db.transaction(async (tx) => {
    let number = task.number;
    if (!sameSpace) {
      number = await allocateTaskNumber(tx, targetSpace.id, targetSpace.taskPrefix);
    }

    await tx
      .update(tasks)
      .set({
        listId: targetList.id,
        statusId,
        number,
        // Detach from parent if moving away — parent would be on another list
        parentTaskId: null,
        customFields,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id));

    // Direct subtasks move with the parent so the hierarchy stays intact
    const children = await tx
      .select({ id: tasks.id, statusId: tasks.statusId })
      .from(tasks)
      .where(eq(tasks.parentTaskId, id));

    for (const child of children) {
      const childNumber = sameSpace
        ? undefined
        : await allocateTaskNumber(tx, targetSpace.id, targetSpace.taskPrefix);
      const [childStatus] = await db
        .select({ name: statuses.name })
        .from(statuses)
        .where(eq(statuses.id, child.statusId))
        .limit(1);
      const childStatusId = await resolveTargetStatusId(
        targetList.id,
        childStatus?.name ?? null,
        targetList.defaultStatusId,
      );
      await tx
        .update(tasks)
        .set({
          listId: targetList.id,
          statusId: childStatusId,
          ...(childNumber ? { number: childNumber } : {}),
          customFields: {},
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, child.id));
      if (!sameSpace) {
        await tx.delete(taskTags).where(eq(taskTags.taskId, child.id));
      }
    }

    if (!sameSpace) {
      // Drop space-scoped tags that don't belong to the target space
      await tx.delete(taskTags).where(eq(taskTags.taskId, id));
    }

    await logActivity(tx, {
      spaceId: targetSpace.id,
      taskId: id,
      actorId: user.id,
      verb: "task.moved",
      payload: {
        number,
        fromList: sourceList.name,
        toList: targetList.name,
        fromSpace: sourceSpace.name,
        toSpace: targetSpace.name,
      },
    });
  });

  await pingListUpdate(sourceList.id);
  await pingListUpdate(targetList.id);
  revalidatePath(listPath(sourceSpace.slug, sourceList.slug));
  revalidatePath(listPath(targetSpace.slug, targetList.slug));
  revalidatePath(`/tasks/task/${task.number}`);
  revalidatePath("/tasks", "layout");
}

/**
 * Copy a task into another list (new task + new number). Same rules as move for
 * fields/tags, but source task is left untouched.
 */
export async function copyTaskToList(
  taskId: string,
  targetListId: string,
): Promise<{ id: string; number: string }> {
  const id = z.string().uuid().parse(taskId);
  const targetId = z.string().uuid().parse(targetListId);
  const { task, list: sourceList, space: sourceSpace } = await requireTask(id);
  const { list: targetList, space: targetSpace } = await requireList(targetId);
  const user = await requireUser();
  await assertListRole(sourceList.id, "member");
  await assertListRole(targetList.id, "member");

  const [sourceStatus] = await db
    .select({ name: statuses.name })
    .from(statuses)
    .where(eq(statuses.id, task.statusId))
    .limit(1);
  const statusId = await resolveTargetStatusId(
    targetList.id,
    sourceStatus?.name ?? null,
    targetList.defaultStatusId,
  );

  const sameSpace = sourceSpace.id === targetSpace.id;
  const assigneeRows = await db
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, id));
  const tagRows = sameSpace
    ? await db.select({ tagId: taskTags.tagId }).from(taskTags).where(eq(taskTags.taskId, id))
    : [];

  let createdId = "";
  let createdNumber = "";
  await db.transaction(async (tx) => {
    const number = await allocateTaskNumber(tx, targetSpace.id, targetSpace.taskPrefix);
    const [created] = await tx
      .insert(tasks)
      .values({
        listId: targetList.id,
        number,
        title: task.title,
        description: task.description,
        statusId,
        priority: task.priority,
        dueDate: task.dueDate,
        startDate: task.startDate,
        customFields: sameSpace && sourceList.id === targetList.id ? (task.customFields ?? {}) : {},
        createdBy: user.id,
        source: "manual",
      })
      .returning({ id: tasks.id, number: tasks.number });
    createdId = created!.id;
    createdNumber = created!.number;

    if (assigneeRows.length > 0) {
      await tx.insert(taskAssignees).values(
        assigneeRows.map((a) => ({
          taskId: createdId,
          userId: a.userId,
          assignedBy: user.id,
        })),
      );
    }
    if (tagRows.length > 0) {
      await tx.insert(taskTags).values(
        tagRows.map((t) => ({ taskId: createdId, tagId: t.tagId, addedBy: user.id })),
      );
    }
    await logActivity(tx, {
      spaceId: targetSpace.id,
      taskId: createdId,
      actorId: user.id,
      verb: "task.created",
      payload: {
        title: task.title,
        number: createdNumber,
        copiedFrom: task.number,
        toList: targetList.name,
      },
    });
  });

  await pingListUpdate(targetList.id);
  revalidatePath(listPath(targetSpace.slug, targetList.slug));
  revalidatePath("/tasks", "layout");
  return { id: createdId, number: createdNumber };
}

const MAX_SUBTASK_DEPTH = 5;

/** Create a subtask under an existing task (same list, inherits default status). */
export async function createSubtask(formData: FormData) {
  const parentTaskId = z.string().uuid().parse(formData.get("parentTaskId"));
  const title = z.string().min(1).max(300).parse(String(formData.get("title") ?? "").trim());

  const { task: parent, list, space } = await requireTask(parentTaskId);
  const user = await requireUser();
  await assertListRole(list.id, "member");

  if (!list.subtasksEnabled) {
    throw new Error("Subtasks are disabled for this list. Enable them in list settings to add more.");
  }

  // Depth limit (count ancestors)
  let depth = 0;
  let walkId: string | null = parent.parentTaskId;
  const seen = new Set<string>([parent.id]);
  while (walkId && !seen.has(walkId) && depth < MAX_SUBTASK_DEPTH + 1) {
    seen.add(walkId);
    depth++;
    const [row] = await db
      .select({ parentTaskId: tasks.parentTaskId })
      .from(tasks)
      .where(eq(tasks.id, walkId))
      .limit(1);
    walkId = row?.parentTaskId ?? null;
  }
  if (depth >= MAX_SUBTASK_DEPTH) {
    throw new Error(`Subtasks can only nest ${MAX_SUBTASK_DEPTH} levels deep`);
  }

  const statusId = await resolveListDefaultStatusId(list.id, list.defaultStatusId);

  let createdNumber = "";
  await db.transaction(async (tx) => {
    const [counter] = await tx
      .update(spaceTaskCounters)
      .set({ nextNumber: sql`${spaceTaskCounters.nextNumber} + 1` })
      .where(eq(spaceTaskCounters.spaceId, space.id))
      .returning({ next: spaceTaskCounters.nextNumber });
    const number = `${space.taskPrefix}-${counter.next - 1}`;

    const siblings = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.parentTaskId, parentTaskId));

    const [created] = await tx
      .insert(tasks)
      .values({
        listId: parent.listId,
        parentTaskId: parent.id,
        number,
        title,
        statusId,
        position: `a${siblings.length}`,
        createdBy: user.id,
        source: "manual",
      })
      .returning({ id: tasks.id, number: tasks.number });

    createdNumber = created!.number;

    await logActivity(tx, {
      spaceId: space.id,
      taskId: parent.id,
      actorId: user.id,
      verb: "task.subtask_created",
      payload: { title, number: created!.number, subtaskId: created!.id },
    });
    await logActivity(tx, {
      spaceId: space.id,
      taskId: created!.id,
      actorId: user.id,
      verb: "task.created",
      payload: { title, number: created!.number, parentTaskId: parent.id, parentNumber: parent.number },
    });
  });

  await pingListUpdate(list.id);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${parent.number}`);
  revalidatePath(`/tasks/task/${createdNumber}`);
  return { number: createdNumber };
}
