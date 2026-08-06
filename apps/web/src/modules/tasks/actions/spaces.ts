"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  activityLog,
  db,
  folders,
  lists,
  modules,
  spaceMembers,
  spaces,
  spaceTaskCounters,
} from "@aitim/db";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertSpaceRole, requireUser } from "@/lib/rbac";
import { logActivity } from "../lib/activity";
import { getActiveUsers, getSpaceMembers } from "../queries";
import {
  purgeListHard,
  requireFolder,
  requireList,
  requireSpace,
  revalidateTrashAndTasks,
  seedDefaultStatuses,
  slugify,
  uniqueListSlug,
} from "./shared";

/** Default list name when a space is created (ClickUp-style starter list). */
const DEFAULT_LIST_NAME = "List";

async function uniqueValue(column: typeof spaces.slug | typeof spaces.taskPrefix, base: string) {
  let candidate = base;
  let n = 2;

  while ((await db.select({ id: spaces.id }).from(spaces).where(eq(column, candidate))).length > 0) {
    candidate = `${base}${column === spaces.slug ? "-" : ""}${n++}`;
  }
  return candidate;
}

export async function createSpace(formData: FormData) {
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "create_spaces", "You do not have permission to create spaces");

  const name = z.string().min(1).max(100).parse(formData.get("name"));
  const rawPrefix = formData.get("taskPrefix");
  const color = z.string().max(20).optional().parse(formData.get("color")?.toString() || undefined);
  const moduleIdRaw = formData.get("moduleId")?.toString();
  const moduleSlugRaw = formData.get("moduleSlug")?.toString();

  let moduleRow:
    | { id: string; slug: string; isEnabled: boolean }
    | undefined;
  if (moduleIdRaw) {
    const id = z.string().uuid().parse(moduleIdRaw);
    const [row] = await db
      .select({ id: modules.id, slug: modules.slug, isEnabled: modules.isEnabled })
      .from(modules)
      .where(eq(modules.id, id));
    moduleRow = row;
  } else if (moduleSlugRaw) {
    const [row] = await db
      .select({ id: modules.id, slug: modules.slug, isEnabled: modules.isEnabled })
      .from(modules)
      .where(eq(modules.slug, moduleSlugRaw));
    moduleRow = row;
  } else {
    const [row] = await db
      .select({ id: modules.id, slug: modules.slug, isEnabled: modules.isEnabled })
      .from(modules)
      .where(eq(modules.slug, "tasks"));
    moduleRow = row;
  }
  if (!moduleRow) throw new Error("Workspace app not found");
  if (!moduleRow.isEnabled) throw new Error("This workspace app is disabled");

  const slug = await uniqueValue(spaces.slug, slugify(name));
  const prefixBase =
    (rawPrefix ? String(rawPrefix) : name).replace(/[^a-zA-Z]/g, "").slice(0, 4).toUpperCase() || "SPC";
  const taskPrefix = await uniqueValue(spaces.taskPrefix, prefixBase);

  let newSlug = "";
  let newListSlug = "";
  await db.transaction(async (tx) => {
    const [space] = await tx
      .insert(spaces)
      .values({
        moduleId: moduleRow!.id,
        name,
        slug,
        taskPrefix,
        color: color || null,
        createdBy: user.id,
      })
      .returning();
    newSlug = space.slug;
    await tx.insert(spaceTaskCounters).values({ spaceId: space.id, nextNumber: 1 });
    await tx.insert(spaceMembers).values({
      spaceId: space.id,
      principalType: "user",
      userId: user.id,
      role: "owner",
    });

    // Starter list so the space is immediately usable (kanban needs statuses).
    const listSlug = await uniqueListSlug(space.id, slugify(DEFAULT_LIST_NAME));
    const [list] = await tx
      .insert(lists)
      .values({ spaceId: space.id, name: DEFAULT_LIST_NAME, slug: listSlug })
      .returning();
    await seedDefaultStatuses(tx, list.id);
    newListSlug = list.slug;

    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "space.created",
      payload: { name },
    });
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "list.created",
      payload: { name: DEFAULT_LIST_NAME, default: true },
    });
  });
  revalidatePath("/tasks");
  redirect(`/tasks/${newSlug}/${newListSlug}`);
}

/** Archive a space (hide from sidebar; not in Trash). Space owners only. */
export async function archiveSpace(spaceId: string) {
  const id = z.string().uuid().parse(spaceId);
  const space = await requireSpace(id);
  if (space.deletedAt) throw new Error("Cannot archive a space that is in the Trash");
  const user = await requireUser();
  await assertSpaceRole(id, "owner");

  await db.transaction(async (tx) => {
    await tx.update(spaces).set({ isArchived: true }).where(eq(spaces.id, id));
    // Hide nested content so direct list/folder memberships don't re-surface the space.
    await tx
      .update(folders)
      .set({ isArchived: true })
      .where(and(eq(folders.spaceId, id), eq(folders.isArchived, false), isNull(folders.deletedAt)));
    await tx
      .update(lists)
      .set({ isArchived: true })
      .where(and(eq(lists.spaceId, id), eq(lists.isArchived, false), isNull(lists.deletedAt)));
    await logActivity(tx, {
      spaceId: id,
      actorId: user.id,
      verb: "space.archived",
      payload: { name: space.name, spaceId: id },
    });
  });
  revalidateTrashAndTasks(space.slug);
  return { spaceSlug: space.slug };
}

/** Move a space (and all folders/lists) to Trash. Restorable. Space owners only. */
export async function deleteSpace(spaceId: string) {
  const id = z.string().uuid().parse(spaceId);
  const space = await requireSpace(id);
  if (space.deletedAt) throw new Error("Space is already in the Trash");
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "delete_items");
  await assertSpaceRole(id, "owner");
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.update(spaces).set({ deletedAt: now }).where(eq(spaces.id, id));
    await tx
      .update(folders)
      .set({ deletedAt: now })
      .where(and(eq(folders.spaceId, id), isNull(folders.deletedAt)));
    await tx
      .update(lists)
      .set({ deletedAt: now })
      .where(and(eq(lists.spaceId, id), isNull(lists.deletedAt)));
    await logActivity(tx, {
      spaceId: id,
      actorId: user.id,
      verb: "space.deleted",
      payload: { name: space.name, spaceId: id },
    });
  });
  revalidateTrashAndTasks(space.slug);
  return { spaceSlug: space.slug };
}

/** Restore a space and its nested folders/lists from Trash. */
export async function restoreSpace(spaceId: string) {
  const id = z.string().uuid().parse(spaceId);
  const space = await requireSpace(id);
  if (!space.deletedAt) throw new Error("Space is not in the Trash");
  const user = await requireUser();
  // Platform admin, previous owner membership, or manage_trash still grants access while trashed.
  const { assertCanManageTrash } = await import("@/lib/permissions");
  await assertCanManageTrash(user, id);

  // uniqueValue does not exclude self — pick a free slug if another space took it.
  let finalSlug = space.slug;
  const [slugTaken] = await db
    .select({ id: spaces.id })
    .from(spaces)
    .where(and(eq(spaces.slug, space.slug), ne(spaces.id, id)));
  if (slugTaken) finalSlug = await uniqueValue(spaces.slug, space.slug);

  await db.transaction(async (tx) => {
    await tx
      .update(spaces)
      .set({ deletedAt: null, isArchived: false, slug: finalSlug })
      .where(eq(spaces.id, id));
    // Only restore nested items that were deleted (including those deleted with the space).
    await tx
      .update(folders)
      .set({ deletedAt: null, isArchived: false })
      .where(and(eq(folders.spaceId, id), sql`${folders.deletedAt} is not null`));
    await tx
      .update(lists)
      .set({ deletedAt: null, isArchived: false })
      .where(and(eq(lists.spaceId, id), sql`${lists.deletedAt} is not null`));
    await logActivity(tx, {
      spaceId: id,
      actorId: user.id,
      verb: "space.restored",
      payload: { name: space.name, spaceId: id },
    });
  });
  revalidateTrashAndTasks(finalSlug);
  return { spaceSlug: finalSlug };
}

/**
 * Permanently delete a space and everything in it from Trash.
 * Space owners only.
 */
export async function purgeSpace(spaceId: string) {
  const id = z.string().uuid().parse(spaceId);
  const space = await requireSpace(id);
  if (!space.deletedAt) throw new Error("Move the space to Trash before permanently deleting");
  const user = await requireUser();
  const { assertCanManageTrash } = await import("@/lib/permissions");
  await assertCanManageTrash(user, id);

  const listRows = await db.select({ id: lists.id }).from(lists).where(eq(lists.spaceId, id));

  await db.transaction(async (tx) => {
    await logActivity(tx, {
      spaceId: id,
      actorId: user.id,
      verb: "space.purged",
      payload: { name: space.name, spaceId: id },
    });
    for (const row of listRows) {
      await purgeListHard(tx, row.id);
    }
    // activity_log.space_id is NO ACTION — clear before dropping the space.
    await tx.delete(activityLog).where(eq(activityLog.spaceId, id));
    await tx.delete(folders).where(eq(folders.spaceId, id));
    await tx.delete(spaces).where(eq(spaces.id, id));
  });
  revalidateTrashAndTasks();
  return { spaceSlug: space.slug };
}

/** Lazily fetched by client components (e.g. the sidebar's right-click menu) that need
 * sharing data for a space without the nav tree query eagerly loading it for every space. */
export async function getSpaceSharingData(spaceId: string) {
  await assertSpaceRole(spaceId, "owner");
  const [members, activeUsers] = await Promise.all([getSpaceMembers(spaceId), getActiveUsers()]);
  const memberUserIds = new Set(members.map((m) => m.userId));
  return { members, addableUsers: activeUsers.filter((u) => !memberUserIds.has(u.id)) };
}

const appearanceIconSchema = z
  .string()
  .max(16)
  .nullable()
  .optional()
  .transform((v) => {
    if (v == null) return null;
    const t = v.trim();
    return t ? t.slice(0, 16) : null;
  });
const appearanceColorSchema = z
  .string()
  .max(20)
  .nullable()
  .optional()
  .transform((v) => {
    if (v == null) return null;
    const t = v.trim();
    if (!t) return null;
    if (/^#[0-9a-fA-F]{3,8}$/.test(t)) return t;
    return t.slice(0, 20);
  });

/** ClickUp-style Color & Icon for spaces, folders, and lists. */
export async function setEntityAppearance(params: {
  kind: "space" | "folder" | "list";
  id: string;
  icon?: string | null;
  color?: string | null;
}) {
  const kind = z.enum(["space", "folder", "list"]).parse(params.kind);
  const id = z.string().uuid().parse(params.id);
  const icon = appearanceIconSchema.parse(params.icon ?? null);
  const color = appearanceColorSchema.parse(params.color ?? null);
  await requireUser();

  if (kind === "space") {
    await assertSpaceRole(id, "owner");
    const space = await requireSpace(id);
    await db.update(spaces).set({ icon, color }).where(eq(spaces.id, id));
    revalidatePath("/");
    revalidatePath(`/tasks/${space.slug}`);
    return;
  }

  if (kind === "folder") {
    const { space } = await requireFolder(id);
    await assertSpaceRole(space.id, "owner");
    await db.update(folders).set({ icon, color }).where(eq(folders.id, id));
    revalidatePath("/");
    revalidatePath(`/tasks/${space.slug}`);
    return;
  }

  // list
  const { list, space } = await requireList(id);
  await assertSpaceRole(space.id, "owner");
  await db.update(lists).set({ icon, color }).where(eq(lists.id, id));
  revalidatePath("/");
  revalidatePath(`/tasks/${space.slug}`);
  revalidatePath(`/tasks/${space.slug}/${list.slug}`);
}
