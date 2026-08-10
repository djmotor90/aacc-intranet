"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, taskTypes, tasks } from "@aitim/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertListRole, assertSpaceRole, requireUser } from "@/lib/rbac";
import { logActivity } from "../lib/activity";
import { requireSpace, requireTask } from "./shared";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Create a task type for a space (icon/color pickers mirror space/list appearance). */
export async function createTaskType(params: {
  spaceId: string;
  name: string;
  icon?: string | null;
  color?: string;
  showDeliveryTimeline?: boolean;
}): Promise<{ id: string }> {
  "use server";
  const spaceId = z.string().uuid().parse(params.spaceId);
  const name = z.string().min(1).max(50).parse(params.name.trim());
  const icon = params.icon ? z.string().max(8).parse(params.icon) : null;
  const color = params.color ? hexColor.parse(params.color) : "#64748b";
  const showDeliveryTimeline = params.showDeliveryTimeline === true;

  const space = await requireSpace(spaceId);
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  const existing = await db.select().from(taskTypes).where(eq(taskTypes.spaceId, spaceId));

  const [created] = await db
    .insert(taskTypes)
    .values({
      spaceId,
      name,
      icon,
      color,
      showDeliveryTimeline,
      position: `a${existing.length}`,
      createdBy: user.id,
    })
    .returning({ id: taskTypes.id });

  await logActivity(db, {
    spaceId: space.id,
    actorId: user.id,
    verb: "task_type.created",
    payload: { name },
  });

  revalidatePath(`/tasks/${space.slug}`);
  return { id: created.id };
}

async function requireTaskType(taskTypeId: string) {
  const [row] = await db.select().from(taskTypes).where(eq(taskTypes.id, taskTypeId));
  if (!row) throw new Error("Task type not found");
  const space = await requireSpace(row.spaceId);
  return { taskType: row, space };
}

/** Update a task type's name/icon/color/delivery-timeline flag. */
export async function updateTaskType(
  taskTypeId: string,
  patch: { name?: string; icon?: string | null; color?: string; showDeliveryTimeline?: boolean },
) {
  "use server";
  const { taskType, space } = await requireTaskType(taskTypeId);
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  const updates: Partial<typeof taskTypes.$inferInsert> = {};
  if ("name" in patch && patch.name !== undefined) {
    updates.name = z.string().min(1).max(50).parse(patch.name.trim());
  }
  if ("icon" in patch) updates.icon = patch.icon ? z.string().max(8).parse(patch.icon) : null;
  if ("color" in patch && patch.color !== undefined) updates.color = hexColor.parse(patch.color);
  if ("showDeliveryTimeline" in patch) {
    updates.showDeliveryTimeline = patch.showDeliveryTimeline === true;
  }
  if (Object.keys(updates).length === 0) return;

  await db.update(taskTypes).set(updates).where(eq(taskTypes.id, taskTypeId));

  await logActivity(db, {
    spaceId: space.id,
    actorId: user.id,
    verb: "task_type.updated",
    payload: { name: updates.name ?? taskType.name },
  });
  revalidatePath(`/tasks/${space.slug}`);
}

/** Soft-archive a task type — existing tasks keep pointing at it, it just drops out of pickers. */
export async function archiveTaskType(taskTypeId: string) {
  "use server";
  const { taskType, space } = await requireTaskType(taskTypeId);
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.update(taskTypes).set({ isArchived: true }).where(eq(taskTypes.id, taskTypeId));
  await logActivity(db, {
    spaceId: space.id,
    actorId: user.id,
    verb: "task_type.archived",
    payload: { name: taskType.name },
  });
  revalidatePath(`/tasks/${space.slug}`);
}

/** Persist a new order after drag-and-drop in the Task Types manager. */
export async function reorderTaskTypes(spaceId: string, orderedIds: string[]) {
  "use server";
  const id = z.string().uuid().parse(spaceId);
  const ids = z.array(z.string().uuid()).min(1).max(200).parse(orderedIds);
  const space = await requireSpace(id);
  await assertSpaceRole(space.id, "owner");

  const existing = await db
    .select({ id: taskTypes.id })
    .from(taskTypes)
    .where(eq(taskTypes.spaceId, id));
  const existingIds = new Set(existing.map((r) => r.id));
  if (ids.length !== existingIds.size || ids.some((tid) => !existingIds.has(tid))) {
    throw new Error("Invalid task type order");
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(taskTypes)
        .set({ position: `a${i}` })
        .where(and(eq(taskTypes.id, ids[i]), eq(taskTypes.spaceId, id)));
    }
  });
  revalidatePath(`/tasks/${space.slug}`);
}

/** Assign (or clear, or "convert to") a task's type. */
export async function setTaskType(taskId: string, taskTypeId: string | null) {
  "use server";
  const id = z.string().uuid().parse(taskId);
  const { task, list, space } = await requireTask(id);
  const user = await requireUser();
  await assertListRole(list.id, "member");

  let nextName: string | null = null;
  let nextId: string | null = null;
  if (taskTypeId) {
    const parsedTypeId = z.string().uuid().parse(taskTypeId);
    const [type] = await db
      .select()
      .from(taskTypes)
      .where(and(eq(taskTypes.id, parsedTypeId), eq(taskTypes.spaceId, space.id)));
    if (!type) throw new Error("Task type not found in this space");
    nextName = type.name;
    nextId = type.id;
  }
  if (task.taskTypeId === nextId) return;

  await db.update(tasks).set({ taskTypeId: nextId }).where(eq(tasks.id, id));
  await logActivity(db, {
    spaceId: space.id,
    taskId: id,
    actorId: user.id,
    verb: "task.type_changed",
    payload: { to: nextName },
  });
  revalidatePath(`/tasks/${space.slug}/${list.slug}`);
  revalidatePath(`/tasks/task/${task.number}`);
}
