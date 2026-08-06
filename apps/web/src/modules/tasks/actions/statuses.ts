"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, statuses, tasks } from "@aitim/db";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSpaceRole, requireUser } from "@/lib/rbac";
import { logActivity } from "../lib/activity";
import { invalidateListMetaCache } from "../queries";
import { listPath, requireList } from "./shared";

export async function createStatus(formData: FormData) {
  const listId = z.string().uuid().parse(formData.get("listId"));
  const name = z.string().min(1).max(50).parse(formData.get("name"));
  const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(formData.get("color") ?? "#94a3b8");
  const category = z.enum(["open", "active", "done", "cancelled"]).parse(formData.get("category"));
  const { list, space } = await requireList(listId);
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    const existing = await tx.select().from(statuses).where(eq(statuses.listId, listId));
    await tx.insert(statuses).values({
      listId,
      name,
      color,
      category,
      position: `a${existing.length}`,
    });
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "status.created",
      payload: { name, listName: list.name },
    });
  });
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}

export async function deleteStatus(formData: FormData) {
  const statusId = z.string().uuid().parse(formData.get("statusId"));
  const [status] = await db.select().from(statuses).where(eq(statuses.id, statusId));
  if (!status) return;
  const { list, space } = await requireList(status.listId);
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(eq(tasks.statusId, statusId));
  if (count > 0) throw new Error("Cannot delete a status that has tasks");
  if (list.defaultStatusId === statusId) throw new Error("Cannot delete the default status");

  await db.transaction(async (tx) => {
    await tx.delete(statuses).where(eq(statuses.id, statusId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "status.deleted",
      payload: { name: status.name, listName: list.name },
    });
  });
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}

export async function updateStatus(formData: FormData) {
  const statusId = z.string().uuid().parse(formData.get("statusId"));
  const name = z.string().min(1).max(50).parse(formData.get("name"));
  const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(formData.get("color"));
  const [status] = await db.select().from(statuses).where(eq(statuses.id, statusId));
  if (!status) return;
  const { list, space } = await requireList(status.listId);
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    await tx.update(statuses).set({ name, color }).where(eq(statuses.id, statusId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "status.updated",
      payload: { from: status.name, to: name, listName: list.name },
    });
  });
  invalidateListMetaCache(list.id);
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}

const reorderStatusSchema = z.array(
  z.object({
    id: z.string().uuid(),
    category: z.enum(["open", "active", "done", "cancelled"]),
    position: z.string().max(20),
  }),
);

/** Bulk reorder/recategorize after a drag-and-drop reorder in the Statuses tab. */
export async function reorderStatuses(
  listId: string,
  updates: { id: string; category: "open" | "active" | "done" | "cancelled"; position: string }[],
) {
  "use server";
  const { list, space } = await requireList(listId);
  await assertSpaceRole(space.id, "owner");
  const parsed = reorderStatusSchema.parse(updates);

  await db.transaction(async (tx) => {
    for (const u of parsed) {
      await tx
        .update(statuses)
        .set({ category: u.category, position: u.position })
        .where(and(eq(statuses.id, u.id), eq(statuses.listId, listId)));
    }
  });
  invalidateListMetaCache(listId);
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}
