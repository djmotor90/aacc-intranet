/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { activityLog } from "@aitim/db";

/** Transaction-scoped DB handle (works with both db and tx). */
export type DbLike = {
  insert: typeof import("@aitim/db").db.insert;
};

export interface ActivityEntry {
  spaceId: string;
  taskId?: string;
  actorId?: string | null;
  actorLabel?: string;
  verb:
    | "task.created"
    | "task.title_changed"
    | "task.description_changed"
    | "task.status_changed"
    | "task.priority_changed"
    | "task.due_date_changed"
    | "task.assignee_added"
    | "task.assignee_removed"
    | "task.tag_added"
    | "task.tag_removed"
    | "task.field_changed"
    | "task.archived"
    | "task.deleted"
    | "task.restored"
    | "task.purged"
    | "task.moved"
    | "task.subtask_created"
    | "task.type_changed"
    | "task_type.created"
    | "task_type.updated"
    | "task_type.archived"
    | "checklist.created"
    | "checklist.deleted"
    | "checklist_item.created"
    | "checklist_item.toggled"
    | "checklist_item.deleted"
    | "comment.created"
    | "comment.replied"
    | "attachment.added"
    | "attachment.removed"
    | "attachment.moved"
    | "attachment_folder.created"
    | "attachment_folder.renamed"
    | "attachment_folder.moved"
    | "attachment_folder.deleted"
    | "space.created"
    | "space.archived"
    | "space.deleted"
    | "space.restored"
    | "space.purged"
    | "list.created"
    | "list.renamed"
    | "list.archived"
    | "list.deleted"
    | "list.restored"
    | "list.purged"
    | "status.created"
    | "status.updated"
    | "status.deleted"
    | "field.created"
    | "field.updated"
    | "field.archived"
    | "field.deleted"
    | "field.restored"
    | "field.purged"
    | "space.member_added"
    | "space.member_removed"
    | "list.member_added"
    | "list.member_removed"
    | "list.privacy_changed"
    | "list.moved"
    | "folder.created"
    | "folder.archived"
    | "folder.deleted"
    | "folder.restored"
    | "folder.purged"
    | "folder.privacy_changed"
    | "folder.member_added"
    | "folder.member_removed"
    | "folder.moved"
    | "secret.created"
    | "secret.updated"
    | "secret.deleted"
    | "secret.viewed"
    | "secret_category.created"
    | "secret_category.renamed"
    | "secret_category.deleted"
    | "list.secret_viewer_added"
    | "list.secret_viewer_removed"
    | "form.created"
    | "form.updated";
  payload?: Record<string, unknown>;
}

/** Call inside the same transaction as the mutation it describes. */
export async function logActivity(tx: DbLike, entry: ActivityEntry) {
  await tx.insert(activityLog).values({
    spaceId: entry.spaceId,
    taskId: entry.taskId,
    actorId: entry.actorId ?? null,
    actorLabel: entry.actorLabel,
    verb: entry.verb,
    payload: entry.payload,
  });
  // Enterprise audit trail (non-blocking dual-write after tx row is staged).
  // Fire-and-forget so product mutations aren't blocked by audit failures.
  void import("@/lib/audit").then(({ auditFromActivity }) =>
    auditFromActivity({
      spaceId: entry.spaceId,
      taskId: entry.taskId,
      actorId: entry.actorId,
      actorLabel: entry.actorLabel,
      verb: entry.verb,
      payload: entry.payload,
    }),
  );
}
