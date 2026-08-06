"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, taskFollowers, users } from "@aitim/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertListRole, requireUser } from "@/lib/rbac";
import { requireTask } from "./shared";

/** Whether the current user is following this task (assignee auto-follow counts). */
export async function getTaskFollowState(taskId: string): Promise<{ following: boolean }> {
  const id = z.string().uuid().parse(taskId);
  const user = await requireUser();
  const { list } = await requireTask(id);
  await assertListRole(list.id, "guest");

  const [row] = await db
    .select({ userId: taskFollowers.userId })
    .from(taskFollowers)
    .where(and(eq(taskFollowers.taskId, id), eq(taskFollowers.userId, user.id)))
    .limit(1);
  return { following: Boolean(row) };
}

/**
 * Toggle follow. Followers get inbox updates for status changes, assignee
 * changes, and comments (same channels as assignees).
 */
export async function toggleTaskFollow(taskId: string): Promise<{ following: boolean }> {
  const id = z.string().uuid().parse(taskId);
  const user = await requireUser();
  const { task, list } = await requireTask(id);
  await assertListRole(list.id, "guest");

  const [existing] = await db
    .select()
    .from(taskFollowers)
    .where(and(eq(taskFollowers.taskId, id), eq(taskFollowers.userId, user.id)))
    .limit(1);

  if (existing) {
    await db
      .delete(taskFollowers)
      .where(and(eq(taskFollowers.taskId, id), eq(taskFollowers.userId, user.id)));
    revalidatePath(`/tasks/task/${task.number}`);
    return { following: false };
  }

  await db
    .insert(taskFollowers)
    .values({ taskId: id, userId: user.id, source: "manual" })
    .onConflictDoNothing();
  revalidatePath(`/tasks/task/${task.number}`);
  return { following: true };
}

/**
 * Explicit-state follow (ClickUp bell popover's Follow/Unfollow rows —
 * idempotent, unlike the "..." menu's toggle).
 */
export async function setTaskFollowing(
  taskId: string,
  following: boolean,
): Promise<{ following: boolean }> {
  const id = z.string().uuid().parse(taskId);
  const user = await requireUser();
  const { task, list } = await requireTask(id);
  await assertListRole(list.id, "guest");

  if (following) {
    await db
      .insert(taskFollowers)
      .values({ taskId: id, userId: user.id, source: "manual" })
      .onConflictDoNothing();
  } else {
    await db
      .delete(taskFollowers)
      .where(and(eq(taskFollowers.taskId, id), eq(taskFollowers.userId, user.id)));
  }
  revalidatePath(`/tasks/task/${task.number}`);
  return { following };
}

/** Add someone else as a follower (bell popover's "People" list) — requires list edit access. */
export async function addTaskFollowerFor(
  taskId: string,
  userId: string,
): Promise<{ userId: string; displayName: string; photoKey: string | null; createdAt: Date }> {
  const id = z.string().uuid().parse(taskId);
  const targetUserId = z.string().uuid().parse(userId);
  const { task, list } = await requireTask(id);
  await assertListRole(list.id, "member");

  const [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId));
  if (!targetUser) throw new Error("User not found");

  const [row] = await db
    .insert(taskFollowers)
    .values({ taskId: id, userId: targetUserId, source: "manual" })
    .onConflictDoNothing()
    .returning({ createdAt: taskFollowers.createdAt });

  revalidatePath(`/tasks/task/${task.number}`);
  return {
    userId: targetUserId,
    displayName: targetUser.displayName,
    photoKey: targetUser.photoKey,
    createdAt: row?.createdAt ?? new Date(),
  };
}

/** Remove someone else's follow (bell popover) — requires list edit access. */
export async function removeTaskFollowerFor(taskId: string, userId: string): Promise<void> {
  const id = z.string().uuid().parse(taskId);
  const targetUserId = z.string().uuid().parse(userId);
  const { task, list } = await requireTask(id);
  await assertListRole(list.id, "member");

  await db
    .delete(taskFollowers)
    .where(and(eq(taskFollowers.taskId, id), eq(taskFollowers.userId, targetUserId)));
  revalidatePath(`/tasks/task/${task.number}`);
}
