/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
/**
 * Cross-domain helpers shared by the `modules/tasks/actions/*` server-action
 * files (used by 2+ domains — single-domain helpers stay co-located with the
 * domain file that owns them). Not a "use server" file itself: nothing here
 * is directly callable from the client.
 */
import {
  allocateTaskNumber,
  db,
  folders,
  formSubmissions,
  lists,
  publicForms,
  spaces,
  statuses,
  tasks,
} from "@aitim/db";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/** Fixed-width keys keep text sorting correct beyond 9 siblings. */
export function orderedSidebarPosition(index: number) {
  return `m${index.toString().padStart(10, "0")}`;
}

/** New items sort after normalized/reordered items without renumbering siblings. */
export function appendedSidebarPosition() {
  return `z${Date.now().toString().padStart(16, "0")}-${crypto.randomUUID()}`;
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}

export async function requireList(listId: string) {
  const [row] = await db
    .select({ list: lists, space: spaces })
    .from(lists)
    .innerJoin(spaces, eq(lists.spaceId, spaces.id))
    .where(eq(lists.id, listId));
  if (!row) throw new Error("List not found");
  return row;
}

export async function requireFolder(folderId: string) {
  const [row] = await db
    .select({ folder: folders, space: spaces })
    .from(folders)
    .innerJoin(spaces, eq(folders.spaceId, spaces.id))
    .where(eq(folders.id, folderId));
  if (!row) throw new Error("Folder not found");
  return row;
}

export async function requireSpace(spaceId: string) {
  const [space] = await db.select().from(spaces).where(eq(spaces.id, spaceId));
  if (!space) throw new Error("Space not found");
  return space;
}

export async function requireTask(taskId: string) {
  const [row] = await db
    .select({ task: tasks, list: lists, space: spaces })
    .from(tasks)
    .innerJoin(lists, eq(tasks.listId, lists.id))
    .innerJoin(spaces, eq(lists.spaceId, spaces.id))
    .where(eq(tasks.id, taskId));
  if (!row) throw new Error("Task not found");
  return row;
}

export async function uniqueListSlug(spaceId: string, base: string, excludeListId?: string) {
  let candidate = base;
  let n = 2;

  while (
    (
      await db
        .select({ id: lists.id })
        .from(lists)
        .where(
          and(
            eq(lists.spaceId, spaceId),
            eq(lists.slug, candidate),
            excludeListId ? ne(lists.id, excludeListId) : undefined,
          ),
        )
    ).length > 0
  ) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

export function listPath(spaceSlug: string, listSlug: string) {
  return `/tasks/${spaceSlug}/${listSlug}`;
}

export const spaceRoleSchema = z.enum(["owner", "member", "guest"]);

/** Transaction-scoped DB handle used by helpers below. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Default workflow statuses applied to every newly created list. */
const DEFAULT_STATUSES = [
  { name: "New", color: "#64748b", category: "open" as const, position: "a0" },
  { name: "In Progress", color: "#007582", category: "active" as const, position: "a1" },
  { name: "Done", color: "#22c55e", category: "done" as const, position: "a2" },
];

/** Insert default statuses for a list and set the list's defaultStatusId (first = "New"). */
export async function seedDefaultStatuses(tx: Tx, listId: string) {
  const statusRows = await tx
    .insert(statuses)
    .values(DEFAULT_STATUSES.map((s) => ({ ...s, listId })))
    .returning();
  const defaultStatusId = statusRows[0]?.id;
  if (!defaultStatusId) throw new Error("Failed to create default statuses");
  await tx.update(lists).set({ defaultStatusId }).where(eq(lists.id, listId));
  return statusRows;
}

export function revalidateTrashAndTasks(spaceSlug?: string) {
  revalidatePath("/tasks");
  revalidatePath("/tasks/trash");
  revalidatePath("/"); // admin Settings → Trash may be open
  if (spaceSlug) revalidatePath(`/tasks/${spaceSlug}`);
}

/** Permanently remove a list and all dependent rows (tasks, forms, statuses, …). */
export async function purgeListHard(tx: Tx, listId: string) {
  const formRows = await tx
    .select({ id: publicForms.id })
    .from(publicForms)
    .where(eq(publicForms.listId, listId));
  if (formRows.length > 0) {
    const formIds = formRows.map((f) => f.id);
    await tx.delete(formSubmissions).where(inArray(formSubmissions.formId, formIds));
    await tx.delete(publicForms).where(inArray(publicForms.id, formIds));
  }
  // tasks.list_id and tasks.status_id are NO ACTION — remove tasks before the list/statuses.
  await tx.delete(tasks).where(eq(tasks.listId, listId));
  await tx.delete(lists).where(eq(lists.id, listId));
}

export { allocateTaskNumber };

/**
 * Resolve which status new tasks/subtasks should start in.
 * Prefers list.defaultStatusId; if unset, uses first "open" status, else first status,
 * and backfills default_status_id so the list stays consistent.
 */
export async function resolveListDefaultStatusId(
  listId: string,
  defaultStatusId: string | null,
): Promise<string> {
  if (defaultStatusId) {
    const [ok] = await db
      .select({ id: statuses.id })
      .from(statuses)
      .where(and(eq(statuses.id, defaultStatusId), eq(statuses.listId, listId)))
      .limit(1);
    if (ok) return ok.id;
  }

  const listStatuses = await db
    .select({ id: statuses.id, category: statuses.category })
    .from(statuses)
    .where(eq(statuses.listId, listId))
    .orderBy(asc(statuses.position), asc(statuses.createdAt));

  if (listStatuses.length === 0) {
    throw new Error("List has no statuses — add a status in list settings first");
  }

  const open = listStatuses.find((s) => s.category === "open");
  const chosen = open?.id ?? listStatuses[0]!.id;

  // Heal missing/stale default so create task + subtask keep working
  await db
    .update(lists)
    .set({ defaultStatusId: chosen, updatedAt: new Date() })
    .where(eq(lists.id, listId));

  return chosen;
}
