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
  spaceTaskCounters,
  statuses,
  taskAssignees,
  tasks,
  taskTags,
} from "@aitim/db";
import { valueSchemaFor, type CustomFieldDefinitionLike, type CustomFieldType } from "@aitim/shared";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { notifyUsers, pingListUpdate } from "@/lib/notify";
import { assertListRole, requireUser } from "@/lib/rbac";
import { logActivity } from "../lib/activity";
import { ensureTaskFollowers, getTaskWatcherIds } from "../lib/task-watchers";
import {
  listPath,
  requireList,
  requireTask,
  resolveListDefaultStatusId,
  revalidateTrashAndTasks,
} from "./shared";

function parseCustomFieldsFromForm(
  formData: FormData,
  defs: (typeof customFieldDefinitions.$inferSelect)[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const def of defs) {
    const raw = formData.getAll(`cf_${def.id}`);
    const first = raw[0];
    let value: unknown;
    switch (def.type as CustomFieldType) {
      case "checkbox":
        value = first === "on" || first === "true";
        break;
      case "number":
        value = first === undefined || first === "" ? undefined : Number(first);
        break;
      case "multi_select":
        value = raw.length > 0 ? raw.map(String) : undefined;
        break;
      case "user": {
        // People field — one or more user ids (repeated form keys).
        const ids = raw.map(String).filter((s) => s.length > 0);
        value = ids; // empty array → validated as required or omitted
        if (ids.length === 0) {
          if (def.isRequired) throw new Error(`Field "${def.label}" is required`);
          continue;
        }
        break;
      }
      case "file":
        // Files are uploaded via attachment APIs / public form — not plain form posts.
        continue;
      case "dropdown":
      case "color":
      default:
        value = first === undefined || first === "" ? undefined : String(first);
    }
    if (value === undefined) {
      if (def.isRequired) throw new Error(`Field "${def.label}" is required`);
      continue;
    }
    const schema = valueSchemaFor(def as unknown as CustomFieldDefinitionLike);
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new Error(`Invalid value for "${def.label}": ${parsed.error.issues[0]?.message}`);
    }
    values[def.id] = parsed.data;
  }
  return values;
}

export async function createTask(formData: FormData) {
  const listId = z.string().uuid().parse(formData.get("listId"));
  const title = z.string().min(1).max(300).parse(formData.get("title"));
  const priorityRaw = String(formData.get("priority") ?? "");
  const priority = priorityRaw
    ? z.enum(["urgent", "high", "normal", "low"]).parse(priorityRaw)
    : null;
  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const dueDate = dueDateRaw ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(dueDateRaw) : null;
  const startDateRaw = String(formData.get("startDate") ?? "");
  const startDate = startDateRaw
    ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(startDateRaw)
    : null;
  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const description = descriptionRaw ? descriptionRaw.slice(0, 50_000) : null;
  const assigneeIds = formData.getAll("assignees").map((v) => z.string().uuid().parse(v));
  const tagIds = formData
    .getAll("tags")
    .map((v) => String(v))
    .filter(Boolean)
    .map((v) => z.string().uuid().parse(v));

  const { list, space } = await requireList(listId);
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "create_tasks");
  await assertListRole(list.id, "member");

  const { parseRequiredCoreFields, CORE_FIELD_LABELS } = await import("../lib/required-fields");
  const requiredCore = parseRequiredCoreFields(list.requiredCoreFields);

  if (requiredCore.includes("priority") && !priority) {
    throw new Error(`${CORE_FIELD_LABELS.priority} is required`);
  }
  if (requiredCore.includes("dueDate") && !dueDate) {
    throw new Error(`${CORE_FIELD_LABELS.dueDate} is required`);
  }
  if (requiredCore.includes("startDate") && !startDate) {
    throw new Error(`${CORE_FIELD_LABELS.startDate} is required`);
  }
  if (requiredCore.includes("assignees") && assigneeIds.length === 0) {
    throw new Error(`${CORE_FIELD_LABELS.assignees} is required`);
  }
  if (requiredCore.includes("description") && !description) {
    throw new Error(`${CORE_FIELD_LABELS.description} is required`);
  }
  if (requiredCore.includes("tags") && tagIds.length === 0) {
    throw new Error(`${CORE_FIELD_LABELS.tags} is required`);
  }

  const defs = (
    await db
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.listId, listId))
  ).filter((d) => !d.isArchived);
  const customFields = parseCustomFieldsFromForm(formData, defs);

  const statusId = await resolveListDefaultStatusId(list.id, list.defaultStatusId);

  let createdTaskId: string | undefined;
  let createdTaskNumber: string | undefined;
  await db.transaction(async (tx) => {
    const [counter] = await tx
      .update(spaceTaskCounters)
      .set({ nextNumber: sql`${spaceTaskCounters.nextNumber} + 1` })
      .where(eq(spaceTaskCounters.spaceId, space.id))
      .returning({ next: spaceTaskCounters.nextNumber });
    // counter.next is the value AFTER increment; the allocated number is next - 1
    const number = `${space.taskPrefix}-${counter.next - 1}`;

    const [task] = await tx
      .insert(tasks)
      .values({
        listId,
        number,
        title,
        description: description ? { text: description } : null,
        statusId,
        priority,
        dueDate,
        startDate,
        customFields,
        createdBy: user.id,
        source: "manual",
      })
      .returning();

    if (assigneeIds.length > 0) {
      await tx.insert(taskAssignees).values(
        assigneeIds.map((userId) => ({ taskId: task.id, userId, assignedBy: user.id })),
      );
    }
    if (tagIds.length > 0) {
      await tx.insert(taskTags).values(tagIds.map((tagId) => ({ taskId: task.id, tagId })));
    }
    await logActivity(tx, {
      spaceId: space.id,
      taskId: task.id,
      actorId: user.id,
      verb: "task.created",
      payload: { title, number },
    });
    createdTaskId = task.id;
    createdTaskNumber = number;
  });

  // Assignees auto-follow; the creator can follow manually if desired.
  if (createdTaskId && assigneeIds.length > 0) {
    await ensureTaskFollowers(createdTaskId, assigneeIds, "assigned");
  }

  if (assigneeIds.length > 0 && createdTaskId) {
    await notifyUsers({
      recipientIds: assigneeIds,
      type: "assigned",
      taskId: createdTaskId,
      actorId: user.id,
      payload: { number: createdTaskNumber, title },
    });
  }
  await pingListUpdate(listId);
  revalidatePath(listPath(space.slug, list.slug));
}

const taskPosition = (index: number) => `m${index.toString().padStart(10, "0")}`;

/** Move a top-level task immediately before or after another task in the same list. */
export async function reorderTask(
  taskId: string,
  targetTaskId: string,
  placement: "before" | "after",
) {
  const id = z.string().uuid().parse(taskId);
  const targetId = z.string().uuid().parse(targetTaskId);
  const parsedPlacement = z.enum(["before", "after"]).parse(placement);
  if (id === targetId) return;

  const { task, list, space } = await requireTask(id);
  const { task: target } = await requireTask(targetId);
  if (task.listId !== target.listId || task.parentTaskId || target.parentTaskId) {
    throw new Error("Tasks must be top-level tasks in the same list to be reordered");
  }
  if (task.deletedAt || target.deletedAt || task.isArchived || target.isArchived) {
    throw new Error("Archived or deleted tasks cannot be reordered");
  }

  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "edit_tasks");
  await assertListRole(list.id, "member");

  await db.transaction(async (tx) => {
    // Serialize reorders within one list so simultaneous drops cannot interleave.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${list.id}))`);
    const siblings = await tx
      .select({ id: tasks.id, position: tasks.position })
      .from(tasks)
      .where(
        and(
          eq(tasks.listId, list.id),
          isNull(tasks.parentTaskId),
          eq(tasks.isArchived, false),
          isNull(tasks.deletedAt),
        ),
      )
      .orderBy(asc(tasks.position), desc(tasks.createdAt), asc(tasks.id));

    const sourceIndex = siblings.findIndex((row) => row.id === id);
    if (sourceIndex < 0) throw new Error("Task is not available for reordering");
    const normalized = siblings.every((row, index) => row.position === taskPosition(index));
    const ordered = siblings.filter((row) => row.id !== id);
    const targetIndex = ordered.findIndex((row) => row.id === targetId);
    if (targetIndex < 0) throw new Error("Target task is not available for reordering");
    const insertAt = targetIndex + (parsedPlacement === "after" ? 1 : 0);
    ordered.splice(insertAt, 0, { id, position: task.position });

    // Legacy lists may contain duplicate/unpadded keys. Normalize once; later
    // nearby moves only update the affected range.
    const changedFrom = normalized ? Math.min(sourceIndex, insertAt) : 0;
    const changedTo = normalized ? Math.max(sourceIndex, insertAt) : ordered.length - 1;
    const changed = ordered.slice(changedFrom, changedTo + 1);
    const positionCases = changed.map((row, offset) =>
      sql`when ${tasks.id} = ${row.id} then ${taskPosition(changedFrom + offset)}`,
    );
    if (positionCases.length > 0) {
      await tx
        .update(tasks)
        .set({
          position: sql`case ${sql.join(positionCases, sql.raw(" "))} else ${tasks.position} end`,
        })
        .where(inArray(tasks.id, changed.map((row) => row.id)));
    }
  });

  await pingListUpdate(list.id);
  revalidatePath(listPath(space.slug, list.slug));
}

export async function updateTaskStatus(taskId: string, statusId: string) {
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "edit_tasks");
  await assertListRole(list.id, "member");
  if (task.statusId === statusId) return;

  const [fromStatus] = await db.select().from(statuses).where(eq(statuses.id, task.statusId));
  const [toStatus] = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.id, statusId), eq(statuses.listId, task.listId)));
  if (!toStatus) throw new Error("Invalid status");

  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({
        statusId,
        completedAt: (toStatus.category === "done" || toStatus.category === "cancelled")
          ? new Date()
          : null,
      })
      .where(eq(tasks.id, taskId));
    await logActivity(tx, {
      spaceId: space.id,
      taskId,
      actorId: user.id,
      verb: "task.status_changed",
      payload: { from: fromStatus?.name, to: toStatus.name },
    });
  });

  const watchers = await getTaskWatcherIds(taskId);
  await notifyUsers({
    recipientIds: watchers,
    type: "status_changed",
    taskId,
    actorId: user.id,
    payload: { from: fromStatus?.name, to: toStatus.name, number: task.number },
  });
  await pingListUpdate(task.listId);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${task.number}`);
}

/** Single-field update for the table's inline title cell. */
export async function updateTaskTitle(taskId: string, title: string) {
  const parsed = z.string().min(1).max(300).parse(title.trim());
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "edit_tasks");
  await assertListRole(list.id, "member");
  if (task.title === parsed) return;

  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ title: parsed }).where(eq(tasks.id, taskId));
    await logActivity(tx, {
      spaceId: space.id,
      taskId,
      actorId: user.id,
      verb: "task.title_changed",
      payload: { from: task.title, to: parsed },
    });
  });
  await pingListUpdate(task.listId);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${task.number}`);
}

/** Single-field update for the table's inline priority cell. */
export async function updateTaskPriority(
  taskId: string,
  priority: "urgent" | "high" | "normal" | "low" | null,
) {
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "edit_tasks");
  await assertListRole(list.id, "member");
  if (task.priority === priority) return;

  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ priority }).where(eq(tasks.id, taskId));
    await logActivity(tx, {
      spaceId: space.id,
      taskId,
      actorId: user.id,
      verb: "task.priority_changed",
      payload: { from: task.priority, to: priority },
    });
  });
  await pingListUpdate(task.listId);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${task.number}`);
}

/** Single-field update for the table's inline due/start date cells. */
export async function updateTaskDate(
  taskId: string,
  field: "dueDate" | "startDate",
  value: string | null,
) {
  const parsed = value ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(value) : null;
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "edit_tasks");
  await assertListRole(list.id, "member");
  if (task[field] === parsed) return;

  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ [field]: parsed }).where(eq(tasks.id, taskId));
    if (field === "dueDate") {
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.due_date_changed",
        payload: { from: task.dueDate, to: parsed },
      });
    }
  });
  await pingListUpdate(task.listId);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${task.number}`);
}

/** Single-field update for the table's inline custom-field cells. */
export async function updateTaskCustomField(taskId: string, defId: string, value: unknown) {
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "edit_tasks");
  await assertListRole(list.id, "member");

  const [def] = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.id, defId));
  if (!def || def.listId !== task.listId) throw new Error("Field not found");

  const schema = valueSchemaFor(def as unknown as CustomFieldDefinitionLike);
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid value: ${parsed.error.issues[0]?.message}`);

  const before = (task.customFields ?? {}) as Record<string, unknown>;
  const after = { ...before, [defId]: parsed.data };
  if (parsed.data === undefined) delete after[defId];

  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ customFields: after }).where(eq(tasks.id, taskId));
    await logActivity(tx, {
      spaceId: space.id,
      taskId,
      actorId: user.id,
      verb: "task.field_changed",
      payload: { field: def.label, from: before[defId] ?? null, to: parsed.data ?? null },
    });
  });
  await pingListUpdate(task.listId);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${task.number}`);
}

export async function updateTaskCore(formData: FormData) {
  const taskId = z.string().uuid().parse(formData.get("taskId"));
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "edit_tasks");
  await assertListRole(list.id, "member");

  const title = z.string().min(1).max(300).parse(formData.get("title"));
  // Description: TipTap hybrid JSON `{ text, doc }` or legacy plain string.
  const descriptionRaw = String(formData.get("description") ?? "");
  let descriptionValue: { text: string; doc?: unknown } | null = null;
  if (descriptionRaw.trim()) {
    try {
      const parsed = JSON.parse(descriptionRaw) as { text?: string; doc?: unknown };
      if (parsed && typeof parsed === "object" && (parsed.text || parsed.doc)) {
        descriptionValue = {
          text: String(parsed.text ?? "").slice(0, 50_000),
          doc: parsed.doc,
        };
        if (!descriptionValue.text && !parsed.doc) descriptionValue = null;
      } else {
        descriptionValue = { text: descriptionRaw.slice(0, 50_000) };
      }
    } catch {
      descriptionValue = { text: descriptionRaw.slice(0, 50_000) };
    }
    if (descriptionValue && !descriptionValue.text?.trim() && !descriptionValue.doc) {
      descriptionValue = null;
    }
  }
  const priorityRaw = String(formData.get("priority") ?? "");
  const priority = priorityRaw
    ? z.enum(["urgent", "high", "normal", "low"]).parse(priorityRaw)
    : null;
  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const dueDate = dueDateRaw ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(dueDateRaw) : null;
  const startDateRaw = String(formData.get("startDate") ?? "");
  const startDate = startDateRaw ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(startDateRaw) : null;
  const statusId = z.string().uuid().parse(formData.get("statusId"));

  const defs = (
    await db
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.listId, task.listId))
  ).filter((d) => !d.isArchived);
  const customFields = parseCustomFieldsFromForm(formData, defs);

  const [toStatus] = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.id, statusId), eq(statuses.listId, task.listId)));
  if (!toStatus) throw new Error("Invalid status");

  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({
        title,
        description: descriptionValue,
        priority,
        dueDate,
        startDate,
        statusId,
        customFields,
        completedAt: (toStatus.category === "done" || toStatus.category === "cancelled")
          ? (task.completedAt ?? new Date())
          : null,
      })
      .where(eq(tasks.id, taskId));

    if (title !== task.title) {
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.title_changed",
        payload: { from: task.title, to: title },
      });
    }
    if (statusId !== task.statusId) {
      const [fromStatus] = await tx.select().from(statuses).where(eq(statuses.id, task.statusId));
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.status_changed",
        payload: { from: fromStatus?.name, to: toStatus.name },
      });
    }
    if (priority !== task.priority) {
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.priority_changed",
        payload: { from: task.priority, to: priority },
      });
    }
    if (dueDate !== task.dueDate) {
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.due_date_changed",
        payload: { from: task.dueDate, to: dueDate },
      });
    }
    const oldCf = (task.customFields ?? {}) as Record<string, unknown>;
    for (const def of defs) {
      const before = JSON.stringify(oldCf[def.id] ?? null);
      const after = JSON.stringify(customFields[def.id] ?? null);
      if (before !== after) {
        await logActivity(tx, {
          spaceId: space.id,
          taskId,
          actorId: user.id,
          verb: "task.field_changed",
          payload: { field: def.label, from: oldCf[def.id] ?? null, to: customFields[def.id] ?? null },
        });
      }
    }
  });

  if (statusId !== task.statusId) {
    const watchers = await getTaskWatcherIds(taskId);
    await notifyUsers({
      recipientIds: watchers,
      type: "status_changed",
      taskId,
      actorId: user.id,
      payload: { to: toStatus.name, number: task.number },
    });
  }
  await pingListUpdate(task.listId);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${task.number}`);
}

export async function toggleAssignee(formData: FormData) {
  const taskId = z.string().uuid().parse(formData.get("taskId"));
  const userId = z.string().uuid().parse(formData.get("userId"));
  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  await assertListRole(list.id, "member");

  const existing = await db
    .select()
    .from(taskAssignees)
    .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)));

  await db.transaction(async (tx) => {
    if (existing.length > 0) {
      await tx
        .delete(taskAssignees)
        .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)));
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.assignee_removed",
        payload: { userId },
      });
    } else {
      await tx.insert(taskAssignees).values({ taskId, userId, assignedBy: user.id });
      await logActivity(tx, {
        spaceId: space.id,
        taskId,
        actorId: user.id,
        verb: "task.assignee_added",
        payload: { userId },
      });
    }
  });
  if (existing.length === 0) {
    // Auto-follow when assigned.
    await ensureTaskFollowers(taskId, [userId], "assigned");
    await notifyUsers({
      recipientIds: [userId],
      type: "assigned",
      taskId,
      actorId: user.id,
      payload: { number: task.number, title: task.title },
    });
    // Other watchers hear about assignee changes.
    const watchers = (await getTaskWatcherIds(taskId)).filter((id) => id !== userId);
    if (watchers.length > 0) {
      await notifyUsers({
        recipientIds: watchers,
        type: "status_changed",
        taskId,
        actorId: user.id,
        payload: {
          number: task.number,
          title: task.title,
          kind: "assignee_added",
          userId,
        },
      });
    }
  }
  await pingListUpdate(task.listId);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${task.number}`);
}

/** Form-action wrapper for the task detail page's "Archive task" button — sends the user back to the list. */
export async function archiveTask(formData: FormData) {
  const taskId = z.string().uuid().parse(formData.get("taskId"));
  const { list, space } = await requireTask(taskId);
  await archiveTaskById(taskId);
  redirect(listPath(space.slug, list.slug));
}

/** Archive a task and its direct subtasks (soft-hide from lists). */
export async function archiveTaskById(taskId: string) {
  const id = z.string().uuid().parse(taskId);
  const { task, list, space } = await requireTask(id);
  if (task.deletedAt) throw new Error("Cannot archive a task that is in the Trash");
  const user = await requireUser();
  const { assertCanDelete } = await import("@/lib/permissions");
  await assertCanDelete(user, task.createdBy);
  await assertListRole(list.id, "member");

  await db.transaction(async (tx) => {
    // Archive this task and all nested subtasks
    await tx.update(tasks).set({ isArchived: true }).where(eq(tasks.id, id));
    await tx.update(tasks).set({ isArchived: true }).where(eq(tasks.parentTaskId, id));
    await logActivity(tx, {
      spaceId: space.id,
      taskId: id,
      actorId: user.id,
      verb: "task.archived",
      payload: { number: task.number },
    });
  });
  await pingListUpdate(list.id);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/tasks/task/${task.number}`);
  revalidatePath("/tasks", "layout");
}

/**
 * Move a task (and its direct subtasks) to Trash. Restorable from Settings → Trash
 * until purged. This is what the "Delete" menu action calls.
 */
export async function trashTaskById(taskId: string) {
  const id = z.string().uuid().parse(taskId);
  const { task, list, space } = await requireTask(id);
  if (task.deletedAt) throw new Error("Task is already in the Trash");
  const user = await requireUser();
  const { assertCanDelete } = await import("@/lib/permissions");
  await assertCanDelete(user, task.createdBy);
  await assertListRole(list.id, "member");
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ deletedAt: now }).where(eq(tasks.id, id));
    await tx.update(tasks).set({ deletedAt: now }).where(eq(tasks.parentTaskId, id));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "task.deleted",
      payload: { number: task.number, title: task.title },
    });
  });
  await pingListUpdate(list.id);
  revalidateTrashAndTasks(space.slug);
  revalidatePath(listPath(space.slug, list.slug));
}

/** Restore a task (and subtasks trashed with it) from Trash. */
export async function restoreTaskById(taskId: string) {
  const id = z.string().uuid().parse(taskId);
  const { task, list, space } = await requireTask(id);
  if (!task.deletedAt) throw new Error("Task is not in the Trash");
  if (list.deletedAt) throw new Error("Restore the list first");
  const user = await requireUser();
  const { assertCanManageTrash } = await import("@/lib/permissions");
  await assertCanManageTrash(user, space.id);

  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ deletedAt: null }).where(eq(tasks.id, id));
    await tx
      .update(tasks)
      .set({ deletedAt: null })
      .where(and(eq(tasks.parentTaskId, id), isNotNull(tasks.deletedAt)));
    await logActivity(tx, {
      spaceId: space.id,
      taskId: id,
      actorId: user.id,
      verb: "task.restored",
      payload: { number: task.number, title: task.title },
    });
  });
  await pingListUpdate(list.id);
  revalidateTrashAndTasks(space.slug);
  revalidatePath(listPath(space.slug, list.slug));
  return { spaceSlug: space.slug, listSlug: list.slug };
}

/**
 * Permanently delete a task from Trash (and cascaded assignees/tags/comments/
 * attachments/subtasks). Must be in Trash first — prefer `trashTaskById` otherwise.
 */
export async function purgeTaskById(taskId: string) {
  const id = z.string().uuid().parse(taskId);
  const { task, list, space } = await requireTask(id);
  if (!task.deletedAt) throw new Error("Move the task to Trash before permanently deleting");
  const user = await requireUser();
  const { assertCanManageTrash } = await import("@/lib/permissions");
  await assertCanManageTrash(user, space.id);

  // Delete children first so parent_task_id cascades don't leave orphans mid-way
  await db.transaction(async (tx) => {
    await tx.delete(tasks).where(eq(tasks.parentTaskId, id));
    await tx.delete(tasks).where(eq(tasks.id, id));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "task.purged",
      payload: { number: task.number, title: task.title },
    });
  });
  await pingListUpdate(list.id);
  revalidateTrashAndTasks(space.slug);
  revalidatePath(listPath(space.slug, list.slug));
}
