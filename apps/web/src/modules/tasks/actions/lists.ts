"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, folders, lists, spaces } from "@aitim/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSpaceRole, requireUser } from "@/lib/rbac";
import { logActivity } from "../lib/activity";
import {
  listPath,
  purgeListHard,
  requireFolder,
  requireList,
  revalidateTrashAndTasks,
  seedDefaultStatuses,
  slugify,
  uniqueListSlug,
} from "./shared";

export async function createList(formData: FormData) {
  const spaceId = z.string().uuid().parse(formData.get("spaceId"));
  const name = z.string().min(1).max(100).parse(formData.get("name"));
  const folderId = z.string().uuid().optional().parse(formData.get("folderId")?.toString() || undefined);
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "create_lists");
  await assertSpaceRole(spaceId, "owner");

  const [space] = await db.select().from(spaces).where(eq(spaces.id, spaceId));
  if (folderId) {
    const { folder } = await requireFolder(folderId);
    if (folder.spaceId !== spaceId) throw new Error("Folder does not belong to this space");
  }

  const slug = await uniqueListSlug(spaceId, slugify(name));

  await db.transaction(async (tx) => {
    const [list] = await tx
      .insert(lists)
      .values({ spaceId, folderId, name, slug })
      .returning();
    await seedDefaultStatuses(tx, list.id);
    await logActivity(tx, {
      spaceId,
      actorId: user.id,
      verb: "list.created",
      payload: { name },
    });
  });
  revalidatePath(`/tasks/${space.slug}`);
}

/** Rename a list. Display name only — the URL slug is left unchanged. Space owners only. */
export async function renameList(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("listId"));
  const name = z.string().min(1).max(100).parse(formData.get("name"));
  const { list, space } = await requireList(id);
  if (list.deletedAt) throw new Error("Cannot rename a list that is in the Trash");
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  if (name === list.name) return;

  await db.transaction(async (tx) => {
    await tx.update(lists).set({ name }).where(eq(lists.id, id));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "list.renamed",
      payload: { from: list.name, to: name, listId: id },
    });
  });
  revalidatePath(`/tasks/${space.slug}`);
  revalidatePath(listPath(space.slug, list.slug));
}

/** Archive a list (hide from sidebar; not in Trash). Space owners only. */
export async function archiveList(listId: string) {
  const id = z.string().uuid().parse(listId);
  const { list, space } = await requireList(id);
  if (list.deletedAt) throw new Error("Cannot archive a list that is in the Trash");
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    await tx.update(lists).set({ isArchived: true }).where(eq(lists.id, id));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "list.archived",
      payload: { name: list.name, listId: id },
    });
  });
  revalidateTrashAndTasks(space.slug);
  revalidatePath(listPath(space.slug, list.slug));
  return { spaceSlug: space.slug };
}

/** Move a list to Trash (restorable). Space owners only. */
export async function deleteList(listId: string) {
  const id = z.string().uuid().parse(listId);
  const { list, space } = await requireList(id);
  if (list.deletedAt) throw new Error("List is already in the Trash");
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "delete_items");
  await assertSpaceRole(space.id, "owner");
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.update(lists).set({ deletedAt: now }).where(eq(lists.id, id));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "list.deleted",
      payload: { name: list.name, listId: id },
    });
  });
  revalidateTrashAndTasks(space.slug);
  return { spaceSlug: space.slug };
}

/** Restore a list from Trash. Space owners only. */
export async function restoreList(listId: string) {
  const id = z.string().uuid().parse(listId);
  const { list, space } = await requireList(id);
  if (!list.deletedAt) throw new Error("List is not in the Trash");
  if (space.deletedAt) throw new Error("Restore the space first");
  const user = await requireUser();
  const { assertCanManageTrash } = await import("@/lib/permissions");
  await assertCanManageTrash(user, space.id);

  // If parent folder is still trashed, detach so the list reappears at space root.
  let folderId = list.folderId;
  if (folderId) {
    const [parent] = await db.select().from(folders).where(eq(folders.id, folderId));
    if (!parent || parent.deletedAt) folderId = null;
  }

  const slug = await uniqueListSlug(space.id, list.slug, id);

  await db.transaction(async (tx) => {
    await tx
      .update(lists)
      .set({ deletedAt: null, folderId, slug, isArchived: false })
      .where(eq(lists.id, id));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "list.restored",
      payload: { name: list.name, listId: id },
    });
  });
  revalidateTrashAndTasks(space.slug);
  return { spaceSlug: space.slug, listSlug: slug };
}

/** Permanently delete a list from Trash. Space owners only. */
export async function purgeList(listId: string) {
  const id = z.string().uuid().parse(listId);
  const { list, space } = await requireList(id);
  if (!list.deletedAt) throw new Error("Move the list to Trash before permanently deleting");
  const user = await requireUser();
  const { assertCanManageTrash } = await import("@/lib/permissions");
  await assertCanManageTrash(user, space.id);

  await db.transaction(async (tx) => {
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "list.purged",
      payload: { name: list.name, listId: id },
    });
    await purgeListHard(tx, id);
  });
  revalidateTrashAndTasks(space.slug);
  return { spaceSlug: space.slug };
}
