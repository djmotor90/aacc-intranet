"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, spaceMembers, users } from "@aitim/db";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSpaceRole, requireUser } from "@/lib/rbac";
import { logActivity } from "../lib/activity";
import { requireSpace, spaceRoleSchema } from "./shared";

export async function addSpaceMember(formData: FormData) {
  const spaceId = z.string().uuid().parse(formData.get("spaceId"));
  const userId = z.string().uuid().parse(formData.get("userId"));
  const role = spaceRoleSchema.parse(formData.get("role"));
  const space = await requireSpace(spaceId);
  const actor = await requireUser();
  await assertSpaceRole(spaceId, "owner");

  const [targetUser] = await db.select().from(users).where(eq(users.id, userId));
  if (!targetUser) throw new Error("User not found");

  const [existing] = await db
    .select()
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)));

  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(spaceMembers).set({ role }).where(eq(spaceMembers.id, existing.id));
    } else {
      await tx.insert(spaceMembers).values({ spaceId, principalType: "user", userId, role });
    }
    await logActivity(tx, {
      spaceId,
      actorId: actor.id,
      verb: "space.member_added",
      payload: { userId, displayName: targetUser.displayName, role },
    });
  });
  revalidatePath(`/tasks/${space.slug}`);
}

export async function removeSpaceMember(formData: FormData) {
  const memberId = z.string().uuid().parse(formData.get("memberId"));
  const [member] = await db.select().from(spaceMembers).where(eq(spaceMembers.id, memberId));
  if (!member) return;
  const space = await requireSpace(member.spaceId);
  const actor = await requireUser();
  await assertSpaceRole(space.id, "owner");

  if (member.role === "owner") {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, space.id), eq(spaceMembers.role, "owner")));
    if (count <= 1) throw new Error("Cannot remove the last owner of a space");
  }

  await db.transaction(async (tx) => {
    await tx.delete(spaceMembers).where(eq(spaceMembers.id, memberId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: actor.id,
      verb: "space.member_removed",
      payload: { userId: member.userId },
    });
  });
  revalidatePath(`/tasks/${space.slug}`);
}
