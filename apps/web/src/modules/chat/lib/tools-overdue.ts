/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Task tool helpers for Super Agents. Uses @aitim/db only (no modules/tasks imports).
 */
import {
  db,
  statuses,
  taskAssignees,
  tasks,
  users,
} from "@aitim/db";
import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { TaskListEmbed } from "./types";

export async function listOverdueTasksForUser(userId: string, limit = 10): Promise<TaskListEmbed> {
  const today = new Date().toISOString().slice(0, 10);

  // Tasks assigned to user that are open and past due
  const assigned = await db
    .select({ taskId: taskAssignees.taskId })
    .from(taskAssignees)
    .where(eq(taskAssignees.userId, userId));

  const taskIds = assigned.map((a) => a.taskId);
  if (taskIds.length === 0) {
    return { type: "task_list", items: [] };
  }

  const rows = await db
    .select({
      id: tasks.id,
      number: tasks.number,
      title: tasks.title,
      dueDate: tasks.dueDate,
      priority: tasks.priority,
      statusName: statuses.name,
      statusColor: statuses.color,
    })
    .from(tasks)
    .innerJoin(statuses, eq(statuses.id, tasks.statusId))
    .where(
      and(
        inArray(tasks.id, taskIds),
        isNull(tasks.completedAt),
        isNull(tasks.deletedAt),
        eq(tasks.isArchived, false),
        lt(tasks.dueDate, today),
        sql`${statuses.category} not in ('done', 'cancelled')`,
      ),
    )
    .orderBy(asc(tasks.dueDate))
    .limit(limit);

  const items = [];
  for (const r of rows) {
    const assignees = await db
      .select({ name: users.displayName })
      .from(taskAssignees)
      .innerJoin(users, eq(users.id, taskAssignees.userId))
      .where(eq(taskAssignees.taskId, r.id));
    items.push({
      taskId: r.id,
      number: r.number,
      title: r.title,
      status: r.statusName,
      statusColor: r.statusColor,
      dueDate: r.dueDate,
      priority: r.priority,
      assigneeNames: assignees.map((a) => a.name),
    });
  }

  return { type: "task_list", items };
}
