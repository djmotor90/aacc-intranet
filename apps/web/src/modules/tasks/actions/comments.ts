"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db } from "@aitim/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertListRole, requireUser } from "@/lib/rbac";
import { logActivity } from "../lib/activity";
import { getTaskWatcherIds } from "../lib/task-watchers";
import { requireTask } from "./shared";

export async function addComment(formData: FormData) {
  const taskId = z.string().uuid().parse(formData.get("taskId"));
  const bodyRaw = String(formData.get("body") ?? "");
  // Body may be TipTap hybrid JSON `{ text, doc }` or plain text.
  let bodyText = bodyRaw;
  let bodyDoc: unknown = undefined;
  try {
    const parsed = JSON.parse(bodyRaw) as { text?: string; doc?: unknown };
    if (parsed && typeof parsed === "object" && ("text" in parsed || "doc" in parsed)) {
      bodyText = String(parsed.text ?? "");
      bodyDoc = parsed.doc;
    }
  } catch {
    // plain text
  }

  // Normalize image-like file chips → real image nodes so comments and
  // notification replies always render images the same way (never as files).
  if (bodyDoc && typeof bodyDoc === "object") {
    const {
      normalizeImageAttachments,
      docToPlainText,
      docHasContent,
    } = await import("@/components/editor/doc-utils");
    const normalized = normalizeImageAttachments(bodyDoc as import("@tiptap/react").JSONContent);
    bodyDoc = normalized;
    const fromDoc = docToPlainText(normalized).trim();
    if (fromDoc) bodyText = fromDoc;
    // Image-only / media-only: allow empty client text when doc has media.
    if (!bodyText.trim() && docHasContent(normalized)) {
      bodyText = "[Image]";
    }
  }

  bodyText = z.string().min(1).max(10_000).parse(bodyText.trim());
  const rawMentionIds = formData.getAll("mentions").map((v) => z.string().uuid().parse(v));
  const parentRaw = formData.get("parentCommentId")?.toString();
  const parentInput = parentRaw ? z.string().uuid().parse(parentRaw) : null;

  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "comment");
  await assertListRole(list.id, "guest"); // guests may comment

  // Only allow mentions of people who can actually see this task.
  const { getUsersWithListAccess } = await import("../queries");
  const allowed = await getUsersWithListAccess(list.id);
  const allowedIds = new Set(allowed.map((u) => u.id));
  const mentionIds = [...new Set(rawMentionIds)].filter((id) => allowedIds.has(id));

  const { comments, commentMentions } = await import("@aitim/db");

  // Flatten threads: replies always hang off the root comment (Slack-style).
  let parentCommentId: string | null = null;
  if (parentInput) {
    const [parent] = await db
      .select({
        id: comments.id,
        taskId: comments.taskId,
        parentCommentId: comments.parentCommentId,
      })
      .from(comments)
      .where(eq(comments.id, parentInput));
    if (!parent || parent.taskId !== taskId) throw new Error("Parent comment not found");
    parentCommentId = parent.parentCommentId ?? parent.id;
  }

  const bodyPayload = bodyDoc
    ? { text: bodyText, doc: bodyDoc }
    : { text: bodyText };

  let createdCommentId = "";
  await db.transaction(async (tx) => {
    const [comment] = await tx
      .insert(comments)
      .values({
        taskId,
        authorId: user.id,
        parentCommentId,
        body: bodyPayload,
      })
      .returning();
    createdCommentId = comment!.id;
    if (mentionIds.length > 0) {
      await tx
        .insert(commentMentions)
        .values(mentionIds.map((userId) => ({ commentId: comment!.id, userId })))
        .onConflictDoNothing();
    }
    await logActivity(tx, {
      spaceId: space.id,
      taskId,
      actorId: user.id,
      verb: parentCommentId ? "comment.replied" : "comment.created",
      payload: {
        preview: bodyText.slice(0, 140),
        parentCommentId,
        commentId: comment!.id,
      },
    });
  });

  // Thread root for inbox replies: parent root if replying, else this comment.
  const replyParentId = parentCommentId ?? createdCommentId;

  // Fan-out: assignees + followers + creator get "comment"; mentions get "mentioned"
  const watchers = await getTaskWatcherIds(taskId);
  const mentionSet = new Set(mentionIds);
  const commentRecipients = [
    ...watchers,
    ...(task.createdBy ? [task.createdBy] : []),
  ].filter((id) => !mentionSet.has(id));

  const { notifyUsers } = await import("@/lib/notify");
  const preview = bodyText.slice(0, 140);
  await notifyUsers({
    recipientIds: commentRecipients,
    type: "comment",
    taskId,
    actorId: user.id,
    payload: {
      preview,
      number: task.number,
      threaded: !!parentCommentId,
      commentId: createdCommentId,
      parentCommentId: replyParentId,
    },
  });
  await notifyUsers({
    recipientIds: mentionIds,
    type: "mentioned",
    taskId,
    actorId: user.id,
    payload: {
      preview,
      number: task.number,
      commentId: createdCommentId,
      parentCommentId: replyParentId,
    },
  });

  revalidatePath(`/tasks/task/${task.number}`);
}

/** Soft-delete a comment. Author may delete own; platform admins may delete any. */
export async function deleteComment(formData: FormData) {
  const commentId = z.string().uuid().parse(formData.get("commentId"));
  const user = await requireUser();
  const { comments } = await import("@aitim/db");

  const [row] = await db
    .select({
      id: comments.id,
      authorId: comments.authorId,
      taskId: comments.taskId,
      deletedAt: comments.deletedAt,
    })
    .from(comments)
    .where(eq(comments.id, commentId));
  if (!row || row.deletedAt) throw new Error("Comment not found");

  const { task, list } = await requireTask(row.taskId);
  await assertListRole(list.id, "guest"); // must at least see the task

  const isAdmin = user.platformRole === "admin";
  const isAuthor = row.authorId === user.id;
  if (!isAdmin && !isAuthor) {
    throw new Error("You can only delete your own comments");
  }

  await db
    .update(comments)
    .set({ deletedAt: new Date() })
    .where(eq(comments.id, commentId));

  revalidatePath(`/tasks/task/${task.number}`);
}
