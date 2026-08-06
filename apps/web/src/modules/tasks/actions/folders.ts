"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, folderMembers, folders, lists, spaces, users } from "@aitim/db";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSpaceRole, requireUser } from "@/lib/rbac";
import { logActivity } from "../lib/activity";
import { getActiveUsers, getFolderMembers } from "../queries";
import {
  purgeListHard,
  requireFolder,
  requireList,
  revalidateTrashAndTasks,
  slugify,
  uniqueListSlug,
} from "./shared";

const folderRoleSchema = z.enum(["owner", "member", "guest"]);

async function uniqueFolderSlug(spaceId: string, base: string, excludeFolderId?: string) {
  let candidate = base;
  let n = 2;

  while (
    (
      await db
        .select({ id: folders.id })
        .from(folders)
        .where(
          and(
            eq(folders.spaceId, spaceId),
            eq(folders.slug, candidate),
            excludeFolderId ? ne(folders.id, excludeFolderId) : undefined,
          ),
        )
    ).length > 0
  ) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

/** Collect folder id + all nested descendant folder ids within a space. */
async function collectFolderSubtree(spaceId: string, rootFolderId: string): Promise<string[]> {
  const allFolders = await db
    .select({ id: folders.id, parentFolderId: folders.parentFolderId })
    .from(folders)
    .where(eq(folders.spaceId, spaceId));

  const childrenByParent = new Map<string | null, string[]>();
  for (const f of allFolders) {
    const arr = childrenByParent.get(f.parentFolderId) ?? [];
    arr.push(f.id);
    childrenByParent.set(f.parentFolderId, arr);
  }

  const ids: string[] = [];
  const walk = (fid: string) => {
    ids.push(fid);
    for (const child of childrenByParent.get(fid) ?? []) walk(child);
  };
  walk(rootFolderId);
  return ids;
}

export async function createFolder(formData: FormData) {
  const spaceId = z.string().uuid().parse(formData.get("spaceId"));
  const name = z.string().min(1).max(100).parse(formData.get("name"));
  const parentFolderId = z
    .string()
    .uuid()
    .optional()
    .parse(formData.get("parentFolderId")?.toString() || undefined);
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "create_folders");
  await assertSpaceRole(spaceId, "owner");

  const [space] = await db.select().from(spaces).where(eq(spaces.id, spaceId));
  if (parentFolderId) {
    const { folder: parentFolder } = await requireFolder(parentFolderId);
    if (parentFolder.spaceId !== spaceId) throw new Error("Parent folder does not belong to this space");
  }

  const slug = await uniqueFolderSlug(spaceId, slugify(name));
  const siblingCount = await db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.spaceId, spaceId),
        parentFolderId ? eq(folders.parentFolderId, parentFolderId) : isNull(folders.parentFolderId),
      ),
    );

  await db.transaction(async (tx) => {
    await tx.insert(folders).values({
      spaceId,
      parentFolderId,
      name,
      slug,
      position: `a${siblingCount.length}`,
      createdBy: user.id,
    });
    await logActivity(tx, {
      spaceId,
      actorId: user.id,
      verb: "folder.created",
      payload: { name },
    });
  });
  revalidatePath(`/tasks/${space.slug}`);
}

/**
 * Archive a folder and cascade to nested subfolders + lists inside them.
 * Space owners only. Does not affect Trash items.
 */
export async function archiveFolder(folderId: string) {
  const id = z.string().uuid().parse(folderId);
  const { folder, space } = await requireFolder(id);
  if (folder.deletedAt) throw new Error("Cannot archive a folder that is in the Trash");
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  const toArchive = await collectFolderSubtree(space.id, id);

  await db.transaction(async (tx) => {
    await tx
      .update(folders)
      .set({ isArchived: true })
      .where(and(inArray(folders.id, toArchive), isNull(folders.deletedAt)));
    await tx
      .update(lists)
      .set({ isArchived: true })
      .where(
        and(eq(lists.spaceId, space.id), inArray(lists.folderId, toArchive), isNull(lists.deletedAt)),
      );
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "folder.archived",
      payload: { name: folder.name, folderId: id, cascadedFolderCount: toArchive.length },
    });
  });
  revalidateTrashAndTasks(space.slug);
  return { spaceSlug: space.slug };
}

/**
 * Move a folder (and nested subfolders + lists) to Trash. Restorable.
 * Space owners only.
 */
export async function deleteFolder(folderId: string) {
  const id = z.string().uuid().parse(folderId);
  const { folder, space } = await requireFolder(id);
  if (folder.deletedAt) throw new Error("Folder is already in the Trash");
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  const folderIds = await collectFolderSubtree(space.id, id);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(folders)
      .set({ deletedAt: now })
      .where(and(inArray(folders.id, folderIds), isNull(folders.deletedAt)));
    await tx
      .update(lists)
      .set({ deletedAt: now })
      .where(
        and(eq(lists.spaceId, space.id), inArray(lists.folderId, folderIds), isNull(lists.deletedAt)),
      );
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "folder.deleted",
      payload: { name: folder.name, folderId: id, cascadedFolderCount: folderIds.length },
    });
  });
  revalidateTrashAndTasks(space.slug);
  return { spaceSlug: space.slug };
}

/** Restore a folder (and nested items that were trashed with it) from Trash. */
export async function restoreFolder(folderId: string) {
  const id = z.string().uuid().parse(folderId);
  const { folder, space } = await requireFolder(id);
  if (!folder.deletedAt) throw new Error("Folder is not in the Trash");
  if (space.deletedAt) throw new Error("Restore the space first");
  const user = await requireUser();
  const { assertCanManageTrash } = await import("@/lib/permissions");
  await assertCanManageTrash(user, space.id);

  const folderIds = await collectFolderSubtree(space.id, id);

  // If parent is still trashed, reattach at space root.
  let parentFolderId = folder.parentFolderId;
  if (parentFolderId) {
    const [parent] = await db.select().from(folders).where(eq(folders.id, parentFolderId));
    if (!parent || parent.deletedAt) parentFolderId = null;
  }

  const slug = await uniqueFolderSlug(space.id, folder.slug, id);

  await db.transaction(async (tx) => {
    await tx
      .update(folders)
      .set({ deletedAt: null, isArchived: false })
      .where(inArray(folders.id, folderIds));
    await tx
      .update(folders)
      .set({ parentFolderId, slug })
      .where(eq(folders.id, id));
    await tx
      .update(lists)
      .set({ deletedAt: null, isArchived: false })
      .where(and(eq(lists.spaceId, space.id), inArray(lists.folderId, folderIds)));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "folder.restored",
      payload: { name: folder.name, folderId: id },
    });
  });
  revalidateTrashAndTasks(space.slug);
  return { spaceSlug: space.slug };
}

/** Permanently delete a folder and nested lists from Trash. */
export async function purgeFolder(folderId: string) {
  const id = z.string().uuid().parse(folderId);
  const { folder, space } = await requireFolder(id);
  if (!folder.deletedAt) throw new Error("Move the folder to Trash before permanently deleting");
  const user = await requireUser();
  const { assertCanManageTrash } = await import("@/lib/permissions");
  await assertCanManageTrash(user, space.id);

  const folderIds = await collectFolderSubtree(space.id, id);
  const listRows = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.spaceId, space.id), inArray(lists.folderId, folderIds)));

  await db.transaction(async (tx) => {
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "folder.purged",
      payload: {
        name: folder.name,
        folderId: id,
        cascadedFolderCount: folderIds.length,
        listCount: listRows.length,
      },
    });
    for (const row of listRows) {
      await purgeListHard(tx, row.id);
    }
    await tx.delete(folders).where(inArray(folders.id, folderIds));
  });
  revalidateTrashAndTasks(space.slug);
  return { spaceSlug: space.slug };
}

export async function setFolderPrivacy(formData: FormData) {
  const folderId = z.string().uuid().parse(formData.get("folderId"));
  const isPrivate = formData.get("isPrivate") === "true";
  const { folder, space } = await requireFolder(folderId);
  const actor = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    await tx.update(folders).set({ isPrivate }).where(eq(folders.id, folderId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: actor.id,
      verb: "folder.privacy_changed",
      payload: { folderName: folder.name, isPrivate },
    });
  });
  revalidatePath(`/tasks/${space.slug}`);
}

export async function addFolderMember(formData: FormData) {
  const folderId = z.string().uuid().parse(formData.get("folderId"));
  const userId = z.string().uuid().parse(formData.get("userId"));
  const role = folderRoleSchema.parse(formData.get("role"));
  const { folder, space } = await requireFolder(folderId);
  const actor = await requireUser();
  await assertSpaceRole(space.id, "owner");

  const [targetUser] = await db.select().from(users).where(eq(users.id, userId));
  if (!targetUser) throw new Error("User not found");

  const [existing] = await db
    .select()
    .from(folderMembers)
    .where(and(eq(folderMembers.folderId, folderId), eq(folderMembers.userId, userId)));

  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(folderMembers).set({ role }).where(eq(folderMembers.id, existing.id));
    } else {
      await tx.insert(folderMembers).values({ folderId, principalType: "user", userId, role });
    }
    await logActivity(tx, {
      spaceId: space.id,
      actorId: actor.id,
      verb: "folder.member_added",
      payload: { userId, displayName: targetUser.displayName, role, folderName: folder.name },
    });
  });
  revalidatePath(`/tasks/${space.slug}`);
}

export async function removeFolderMember(formData: FormData) {
  const memberId = z.string().uuid().parse(formData.get("memberId"));
  const [member] = await db.select().from(folderMembers).where(eq(folderMembers.id, memberId));
  if (!member) return;
  const { folder, space } = await requireFolder(member.folderId);
  const actor = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    await tx.delete(folderMembers).where(eq(folderMembers.id, memberId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: actor.id,
      verb: "folder.member_removed",
      payload: { userId: member.userId, folderName: folder.name },
    });
  });
  revalidatePath(`/tasks/${space.slug}`);
}

/** Lazily fetched by client components (e.g. the sidebar's right-click menu). */
export async function getFolderSharingData(folderId: string) {
  const { space } = await requireFolder(folderId);
  await assertSpaceRole(space.id, "owner");
  const [members, activeUsers] = await Promise.all([getFolderMembers(folderId), getActiveUsers()]);
  const memberUserIds = new Set(members.map((m) => m.userId));
  return { members, addableUsers: activeUsers.filter((u) => !memberUserIds.has(u.id)) };
}

/** Move a list into another folder (or to a space's top level) and/or another space entirely. */
export async function moveList(listId: string, targetSpaceId: string, targetFolderId: string | null) {
  "use server";
  const { list, space: sourceSpace } = await requireList(listId);
  await assertSpaceRole(sourceSpace.id, "owner");
  const [targetSpace] = await db.select().from(spaces).where(eq(spaces.id, targetSpaceId));
  if (!targetSpace) throw new Error("Target space not found");
  await assertSpaceRole(targetSpaceId, "owner");

  if (targetFolderId) {
    const { folder: targetFolder } = await requireFolder(targetFolderId);
    if (targetFolder.spaceId !== targetSpaceId) throw new Error("Folder does not belong to target space");
  }

  const crossSpace = targetSpaceId !== sourceSpace.id;
  const slug = crossSpace ? await uniqueListSlug(targetSpaceId, list.slug, listId) : list.slug;
  const siblingCount = await db
    .select({ id: lists.id })
    .from(lists)
    .where(
      and(
        eq(lists.spaceId, targetSpaceId),
        targetFolderId ? eq(lists.folderId, targetFolderId) : isNull(lists.folderId),
      ),
    );
  const actor = await requireUser();

  await db.transaction(async (tx) => {
    await tx
      .update(lists)
      .set({
        spaceId: targetSpaceId,
        folderId: targetFolderId,
        slug,
        position: `a${siblingCount.length}`,
      })
      .where(eq(lists.id, listId));
    await logActivity(tx, {
      spaceId: targetSpaceId,
      actorId: actor.id,
      verb: "list.moved",
      payload: { listName: list.name, fromSpace: sourceSpace.name, toSpace: targetSpace.name },
    });
  });
  revalidatePath(`/tasks/${sourceSpace.slug}`);
  revalidatePath(`/tasks/${targetSpace.slug}`);
}

/** Move a folder (and its whole subtree of subfolders/lists) into another folder, space root, or space. */
export async function moveFolder(
  folderId: string,
  targetSpaceId: string,
  targetParentFolderId: string | null,
) {
  "use server";
  const { folder, space: sourceSpace } = await requireFolder(folderId);
  await assertSpaceRole(sourceSpace.id, "owner");
  const [targetSpace] = await db.select().from(spaces).where(eq(spaces.id, targetSpaceId));
  if (!targetSpace) throw new Error("Target space not found");
  await assertSpaceRole(targetSpaceId, "owner");

  if (targetParentFolderId === folderId) throw new Error("Cannot move a folder into itself");

  const allSourceFolders = await db.select().from(folders).where(eq(folders.spaceId, sourceSpace.id));
  const subtreeIds = new Set<string>([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of allSourceFolders) {
      if (f.parentFolderId && subtreeIds.has(f.parentFolderId) && !subtreeIds.has(f.id)) {
        subtreeIds.add(f.id);
        grew = true;
      }
    }
  }
  if (targetParentFolderId && subtreeIds.has(targetParentFolderId)) {
    throw new Error("Cannot move a folder into one of its own subfolders");
  }
  if (targetParentFolderId) {
    const { folder: targetFolder } = await requireFolder(targetParentFolderId);
    if (targetFolder.spaceId !== targetSpaceId) throw new Error("Target folder does not belong to target space");
  }

  const crossSpace = targetSpaceId !== sourceSpace.id;
  const actor = await requireUser();

  // Pre-compute slug renames (if crossing spaces) before opening the transaction.
  const folderSlugUpdates = new Map<string, string>();
  const listSlugUpdates = new Map<string, string>();
  if (crossSpace) {
    for (const id of subtreeIds) {
      const f = allSourceFolders.find((row) => row.id === id)!;
      const newSlug = await uniqueFolderSlug(targetSpaceId, f.slug, id);
      if (newSlug !== f.slug) folderSlugUpdates.set(id, newSlug);
    }
    const subtreeLists = await db
      .select()
      .from(lists)
      .where(inArray(lists.folderId, [...subtreeIds]));
    for (const l of subtreeLists) {
      const newSlug = await uniqueListSlug(targetSpaceId, l.slug, l.id);
      if (newSlug !== l.slug) listSlugUpdates.set(l.id, newSlug);
    }
  }

  const siblingCount = await db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.spaceId, targetSpaceId),
        targetParentFolderId
          ? eq(folders.parentFolderId, targetParentFolderId)
          : isNull(folders.parentFolderId),
      ),
    );

  await db.transaction(async (tx) => {
    if (crossSpace) {
      await tx
        .update(folders)
        .set({ spaceId: targetSpaceId })
        .where(inArray(folders.id, [...subtreeIds]));
      await tx.update(lists).set({ spaceId: targetSpaceId }).where(inArray(lists.folderId, [...subtreeIds]));
      for (const [id, newSlug] of folderSlugUpdates) {
        await tx.update(folders).set({ slug: newSlug }).where(eq(folders.id, id));
      }
      for (const [id, newSlug] of listSlugUpdates) {
        await tx.update(lists).set({ slug: newSlug }).where(eq(lists.id, id));
      }
    }
    await tx
      .update(folders)
      .set({ parentFolderId: targetParentFolderId, position: `a${siblingCount.length}` })
      .where(eq(folders.id, folderId));
    await logActivity(tx, {
      spaceId: targetSpaceId,
      actorId: actor.id,
      verb: "folder.moved",
      payload: { folderName: folder.name, fromSpace: sourceSpace.name, toSpace: targetSpace.name },
    });
  });
  revalidatePath(`/tasks/${sourceSpace.slug}`);
  revalidatePath(`/tasks/${targetSpace.slug}`);
}
