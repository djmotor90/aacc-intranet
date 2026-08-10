"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, taskChecklistItems, taskChecklists } from "@aitim/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertListRole, requireUser } from "@/lib/rbac";
import { logActivity } from "../lib/activity";
import { requireTask } from "./shared";

async function requireChecklist(checklistId: string) {
  const [checklist] = await db
    .select()
    .from(taskChecklists)
    .where(eq(taskChecklists.id, checklistId));
  if (!checklist) throw new Error("Checklist not found");
  const { task, list, space } = await requireTask(checklist.taskId);
  return { checklist, task, list, space };
}

async function requireChecklistItem(itemId: string) {
  const [item] = await db
    .select()
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.id, itemId));
  if (!item) throw new Error("Checklist item not found");
  const { checklist, task, list, space } = await requireChecklist(item.checklistId);
  return { item, checklist, task, list, space };
}

export async function createChecklist(taskId: string, title?: string): Promise<{ id: string }> {
  "use server";
  const id = z.string().uuid().parse(taskId);
  const name = title?.trim() ? z.string().max(80).parse(title.trim()) : "Checklist";
  const { task, list, space } = await requireTask(id);
  const user = await requireUser();
  await assertListRole(list.id, "member");

  const existing = await db
    .select()
    .from(taskChecklists)
    .where(eq(taskChecklists.taskId, id));

  const [created] = await db
    .insert(taskChecklists)
    .values({ taskId: id, title: name, position: `a${existing.length}`, createdBy: user.id })
    .returning({ id: taskChecklists.id });

  await logActivity(db, {
    spaceId: space.id,
    taskId: id,
    actorId: user.id,
    verb: "checklist.created",
    payload: { title: name },
  });
  revalidatePath(`/tasks/task/${task.number}`);
  return { id: created.id };
}

export async function renameChecklist(checklistId: string, title: string) {
  "use server";
  const name = z.string().min(1).max(80).parse(title.trim());
  const { task, list } = await requireChecklist(checklistId);
  await assertListRole(list.id, "member");

  await db.update(taskChecklists).set({ title: name }).where(eq(taskChecklists.id, checklistId));
  revalidatePath(`/tasks/task/${task.number}`);
}

export async function deleteChecklist(checklistId: string) {
  "use server";
  const { checklist, task, list, space } = await requireChecklist(checklistId);
  const user = await requireUser();
  await assertListRole(list.id, "member");

  await db.delete(taskChecklists).where(eq(taskChecklists.id, checklistId));
  await logActivity(db, {
    spaceId: space.id,
    taskId: task.id,
    actorId: user.id,
    verb: "checklist.deleted",
    payload: { title: checklist.title },
  });
  revalidatePath(`/tasks/task/${task.number}`);
}

export async function createChecklistItem(
  checklistId: string,
  title: string,
): Promise<{ id: string }> {
  "use server";
  const name = z.string().min(1).max(300).parse(title.trim());
  const { task, list, space } = await requireChecklist(checklistId);
  const user = await requireUser();
  await assertListRole(list.id, "member");

  const existing = await db
    .select()
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.checklistId, checklistId));

  const [created] = await db
    .insert(taskChecklistItems)
    .values({ checklistId, title: name, position: `a${existing.length}` })
    .returning({ id: taskChecklistItems.id });

  await logActivity(db, {
    spaceId: space.id,
    taskId: task.id,
    actorId: user.id,
    verb: "checklist_item.created",
    payload: { title: name },
  });
  revalidatePath(`/tasks/task/${task.number}`);
  return { id: created.id };
}

export async function toggleChecklistItem(itemId: string, checked: boolean) {
  "use server";
  const id = z.string().uuid().parse(itemId);
  const { item, task, list, space } = await requireChecklistItem(id);
  const user = await requireUser();
  await assertListRole(list.id, "member");
  if (item.isChecked === checked) return;

  await db.update(taskChecklistItems).set({ isChecked: checked }).where(eq(taskChecklistItems.id, id));
  await logActivity(db, {
    spaceId: space.id,
    taskId: task.id,
    actorId: user.id,
    verb: "checklist_item.toggled",
    payload: { title: item.title, checked },
  });
  revalidatePath(`/tasks/task/${task.number}`);
}

export async function renameChecklistItem(itemId: string, title: string) {
  "use server";
  const name = z.string().min(1).max(300).parse(title.trim());
  const { task, list } = await requireChecklistItem(itemId);
  await assertListRole(list.id, "member");

  await db.update(taskChecklistItems).set({ title: name }).where(eq(taskChecklistItems.id, itemId));
  revalidatePath(`/tasks/task/${task.number}`);
}

export async function deleteChecklistItem(itemId: string) {
  "use server";
  const { item, task, list, space } = await requireChecklistItem(itemId);
  const user = await requireUser();
  await assertListRole(list.id, "member");

  await db.delete(taskChecklistItems).where(eq(taskChecklistItems.id, itemId));
  await logActivity(db, {
    spaceId: space.id,
    taskId: task.id,
    actorId: user.id,
    verb: "checklist_item.deleted",
    payload: { title: item.title },
  });
  revalidatePath(`/tasks/task/${task.number}`);
}
