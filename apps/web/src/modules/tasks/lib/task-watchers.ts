/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, taskAssignees, taskFollowers } from "@aitim/db";
import { eq } from "drizzle-orm";

/**
 * Assignees + explicit followers of a task (ClickUp-style watchers).
 * Used for status / assignee / comment fan-out.
 */
export async function getTaskWatcherIds(taskId: string): Promise<string[]> {
  const [assignees, followers] = await Promise.all([
    db
      .select({ userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, taskId)),
    db
      .select({ userId: taskFollowers.userId })
      .from(taskFollowers)
      .where(eq(taskFollowers.taskId, taskId)),
  ]);
  return [...new Set([...assignees, ...followers].map((r) => r.userId))];
}

/** Ensure users follow a task (idempotent). Used when assigning. */
export async function ensureTaskFollowers(
  taskId: string,
  userIds: string[],
  source: "assigned" | "manual" = "assigned",
): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;
  await db
    .insert(taskFollowers)
    .values(unique.map((userId) => ({ taskId, userId, source })))
    .onConflictDoNothing();
}
