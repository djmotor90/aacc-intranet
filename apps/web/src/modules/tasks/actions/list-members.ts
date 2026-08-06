"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, listMembers, lists, users } from "@aitim/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSpaceRole, requireUser } from "@/lib/rbac";
import { logActivity } from "../lib/activity";
import { listPath, requireList, spaceRoleSchema } from "./shared";

export async function addListMember(formData: FormData) {
  const listId = z.string().uuid().parse(formData.get("listId"));
  const userId = z.string().uuid().parse(formData.get("userId"));
  const role = spaceRoleSchema.parse(formData.get("role"));
  const { list, space } = await requireList(listId);
  const actor = await requireUser();
  await assertSpaceRole(space.id, "owner");

  const [targetUser] = await db.select().from(users).where(eq(users.id, userId));
  if (!targetUser) throw new Error("User not found");

  const [existing] = await db
    .select()
    .from(listMembers)
    .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, userId)));

  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(listMembers).set({ role }).where(eq(listMembers.id, existing.id));
    } else {
      await tx.insert(listMembers).values({ listId, principalType: "user", userId, role });
    }
    await logActivity(tx, {
      spaceId: space.id,
      actorId: actor.id,
      verb: "list.member_added",
      payload: { userId, displayName: targetUser.displayName, role, listName: list.name },
    });
  });
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}

export async function removeListMember(formData: FormData) {
  const memberId = z.string().uuid().parse(formData.get("memberId"));
  const [member] = await db.select().from(listMembers).where(eq(listMembers.id, memberId));
  if (!member) return;
  const { list, space } = await requireList(member.listId);
  const actor = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    await tx.delete(listMembers).where(eq(listMembers.id, memberId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: actor.id,
      verb: "list.member_removed",
      payload: { userId: member.userId, listName: list.name },
    });
  });
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}

/**
 * Toggle whether a list inherits access from its space. When restricted,
 * only direct listMembers rows grant access — space owners still bypass
 * this (see getListRole), so the acting owner can never lock themselves out.
 */
export async function setListPrivacy(formData: FormData) {
  const listId = z.string().uuid().parse(formData.get("listId"));
  const isPrivate = formData.get("isPrivate") === "true";
  const { list, space } = await requireList(listId);
  const actor = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    await tx.update(lists).set({ isPrivate }).where(eq(lists.id, listId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: actor.id,
      verb: "list.privacy_changed",
      payload: { listName: list.name, isPrivate },
    });
  });
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
  revalidatePath(`/tasks/${space.slug}`);
}
