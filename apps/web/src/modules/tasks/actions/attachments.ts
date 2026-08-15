"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db } from "@aitim/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getListRole, requireUser } from "@/lib/rbac";
import { logActivity } from "../lib/activity";
import { requireTask } from "./shared";

/** Delete a task attachment (S3 + DB). Uploader, list members, or platform admin. */
export async function deleteAttachment(formData: FormData) {
  const attachmentId = z.string().uuid().parse(formData.get("attachmentId"));
  const user = await requireUser();
  const { attachmentVersions, attachments } = await import("@aitim/db");

  const [row] = await db
    .select({
      id: attachments.id,
      taskId: attachments.taskId,
      uploaderId: attachments.uploaderId,
      objectKey: attachments.objectKey,
      fileName: attachments.fileName,
    })
    .from(attachments)
    .where(eq(attachments.id, attachmentId));
  if (!row) throw new Error("Attachment not found");

  const { task, list, space } = await requireTask(row.taskId);
  const listRole = await getListRole(user.id, list.id, user.platformRole);
  if (!listRole) throw new Error("Forbidden");

  const isAdmin = user.platformRole === "admin";
  const isUploader = row.uploaderId === user.id;
  const canEditList = listRole === "owner" || listRole === "member";
  if (!isAdmin && !isUploader && !canEditList) {
    throw new Error("You cannot delete this attachment");
  }

  const versions = await db
    .select({ objectKey: attachmentVersions.objectKey })
    .from(attachmentVersions)
    .where(eq(attachmentVersions.attachmentId, attachmentId));
  const { BUCKETS, deleteObject } = await import("@/lib/storage");
  const objectKeys = new Set([row.objectKey, ...versions.map((version) => version.objectKey)]);
  await Promise.all(
    [...objectKeys].map((objectKey) =>
      deleteObject(BUCKETS.attachments, objectKey).catch(() => undefined),
    ),
  );

  await db.transaction(async (tx) => {
    await tx.delete(attachments).where(eq(attachments.id, attachmentId));
    await logActivity(tx, {
      spaceId: space.id,
      taskId: task.id,
      actorId: user.id,
      verb: "attachment.removed",
      payload: { fileName: row.fileName, attachmentId },
    });
  });

  revalidatePath(`/tasks/task/${task.number}`);
}

const MAX_ATTACHMENT_FOLDER_DEPTH = 8;

async function assertCanEditAttachments(taskId: string) {
  const user = await requireUser();
  const { task, list, space } = await requireTask(taskId);
  const listRole = await getListRole(user.id, list.id, user.platformRole);
  if (!listRole) throw new Error("Forbidden");
  const canEdit = listRole === "owner" || listRole === "member" || user.platformRole === "admin";
  if (!canEdit) throw new Error("Only list members can manage attachment folders");
  return { user, task, list, space };
}

/** Validate folder belongs to task; return its depth (0 = root child). */
async function folderDepthOnTask(
  taskId: string,
  folderId: string | null,
): Promise<{ ok: true; depth: number } | { ok: false }> {
  if (!folderId) return { ok: true, depth: -1 };
  const { attachmentFolders } = await import("@aitim/db");
  const all = await db
    .select({
      id: attachmentFolders.id,
      parentFolderId: attachmentFolders.parentFolderId,
      taskId: attachmentFolders.taskId,
    })
    .from(attachmentFolders)
    .where(eq(attachmentFolders.taskId, taskId));
  const byId = new Map(all.map((f) => [f.id, f]));
  let depth = 0;
  let cur: string | null = folderId;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur)) return { ok: false };
    seen.add(cur);
    const row = byId.get(cur);
    if (!row) return { ok: false };
    depth++;
    cur = row.parentFolderId;
  }
  return { ok: true, depth: depth - 1 };
}

/** True if `maybeDescendantId` is the same as or nested under `ancestorId`. */
function isFolderUnder(
  folders: { id: string; parentFolderId: string | null }[],
  ancestorId: string,
  maybeDescendantId: string,
): boolean {
  if (ancestorId === maybeDescendantId) return true;
  const byId = new Map(folders.map((f) => [f.id, f]));
  let cur: string | null = maybeDescendantId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === ancestorId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = byId.get(cur)?.parentFolderId ?? null;
  }
  return false;
}

export async function createAttachmentFolder(params: {
  taskId: string;
  name: string;
  parentFolderId?: string | null;
}) {
  const taskId = z.string().uuid().parse(params.taskId);
  const name = z.string().min(1).max(100).parse(params.name.trim());
  const parentFolderId = params.parentFolderId
    ? z.string().uuid().parse(params.parentFolderId)
    : null;
  const { user, task, space } = await assertCanEditAttachments(taskId);
  const { attachmentFolders } = await import("@aitim/db");

  if (parentFolderId) {
    const depth = await folderDepthOnTask(taskId, parentFolderId);
    if (!depth.ok) throw new Error("Parent folder not found");
    if (depth.depth + 1 >= MAX_ATTACHMENT_FOLDER_DEPTH) {
      throw new Error(`Folders can only nest ${MAX_ATTACHMENT_FOLDER_DEPTH} levels deep`);
    }
  }

  await db.transaction(async (tx) => {
    await tx.insert(attachmentFolders).values({
      taskId,
      parentFolderId,
      name,
    });
    await logActivity(tx, {
      spaceId: space.id,
      taskId: task.id,
      actorId: user.id,
      verb: "attachment_folder.created",
      payload: { name, parentFolderId },
    });
  });
  revalidatePath(`/tasks/task/${task.number}`);
}

export async function renameAttachmentFolder(params: { folderId: string; name: string }) {
  const folderId = z.string().uuid().parse(params.folderId);
  const name = z.string().min(1).max(100).parse(params.name.trim());
  const { attachmentFolders } = await import("@aitim/db");
  const [folder] = await db
    .select()
    .from(attachmentFolders)
    .where(eq(attachmentFolders.id, folderId));
  if (!folder) throw new Error("Folder not found");
  const { user, task, space } = await assertCanEditAttachments(folder.taskId);

  await db.transaction(async (tx) => {
    await tx
      .update(attachmentFolders)
      .set({ name, updatedAt: new Date() })
      .where(eq(attachmentFolders.id, folderId));
    await logActivity(tx, {
      spaceId: space.id,
      taskId: task.id,
      actorId: user.id,
      verb: "attachment_folder.renamed",
      payload: { folderId, name, previousName: folder.name },
    });
  });
  revalidatePath(`/tasks/task/${task.number}`);
}

/**
 * Delete a folder. Files inside move to the parent (or root). Child folders are
 * re-parented to the deleted folder's parent so nothing is lost.
 */
export async function deleteAttachmentFolder(folderId: string) {
  const id = z.string().uuid().parse(folderId);
  const { attachmentFolders, attachments } = await import("@aitim/db");
  const [folder] = await db.select().from(attachmentFolders).where(eq(attachmentFolders.id, id));
  if (!folder) throw new Error("Folder not found");
  const { user, task, space } = await assertCanEditAttachments(folder.taskId);
  const parentId = folder.parentFolderId;

  await db.transaction(async (tx) => {
    await tx
      .update(attachments)
      .set({ folderId: parentId })
      .where(eq(attachments.folderId, id));
    await tx
      .update(attachmentFolders)
      .set({ parentFolderId: parentId, updatedAt: new Date() })
      .where(eq(attachmentFolders.parentFolderId, id));
    await tx.delete(attachmentFolders).where(eq(attachmentFolders.id, id));
    await logActivity(tx, {
      spaceId: space.id,
      taskId: task.id,
      actorId: user.id,
      verb: "attachment_folder.deleted",
      payload: { folderId: id, name: folder.name },
    });
  });
  revalidatePath(`/tasks/task/${task.number}`);
}

/** Move a file into a folder (null = root). */
export async function moveAttachment(params: {
  attachmentId: string;
  folderId: string | null;
}) {
  const attachmentId = z.string().uuid().parse(params.attachmentId);
  const folderId = params.folderId ? z.string().uuid().parse(params.folderId) : null;
  const { attachments, attachmentFolders } = await import("@aitim/db");
  const [row] = await db.select().from(attachments).where(eq(attachments.id, attachmentId));
  if (!row) throw new Error("Attachment not found");
  const { user, task, space } = await assertCanEditAttachments(row.taskId);

  if (folderId) {
    const [folder] = await db
      .select()
      .from(attachmentFolders)
      .where(and(eq(attachmentFolders.id, folderId), eq(attachmentFolders.taskId, row.taskId)));
    if (!folder) throw new Error("Folder not found on this task");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(attachments)
      .set({ folderId, updatedAt: new Date() })
      .where(eq(attachments.id, attachmentId));
    await logActivity(tx, {
      spaceId: space.id,
      taskId: task.id,
      actorId: user.id,
      verb: "attachment.moved",
      payload: { attachmentId, fileName: row.fileName, folderId },
    });
  });
  revalidatePath(`/tasks/task/${task.number}`);
}

/** Move a folder under another folder (null = root). Prevents cycles. */
export async function moveAttachmentFolder(params: {
  folderId: string;
  parentFolderId: string | null;
}) {
  const folderId = z.string().uuid().parse(params.folderId);
  const parentFolderId = params.parentFolderId
    ? z.string().uuid().parse(params.parentFolderId)
    : null;
  if (parentFolderId === folderId) throw new Error("Cannot move a folder into itself");

  const { attachmentFolders } = await import("@aitim/db");
  const [folder] = await db
    .select()
    .from(attachmentFolders)
    .where(eq(attachmentFolders.id, folderId));
  if (!folder) throw new Error("Folder not found");
  const { user, task, space } = await assertCanEditAttachments(folder.taskId);

  const all = await db
    .select({
      id: attachmentFolders.id,
      parentFolderId: attachmentFolders.parentFolderId,
    })
    .from(attachmentFolders)
    .where(eq(attachmentFolders.taskId, folder.taskId));

  if (parentFolderId) {
    if (!all.some((f) => f.id === parentFolderId)) throw new Error("Target folder not found");
    if (isFolderUnder(all, folderId, parentFolderId)) {
      throw new Error("Cannot move a folder into one of its subfolders");
    }
    const depth = await folderDepthOnTask(folder.taskId, parentFolderId);
    if (!depth.ok) throw new Error("Target folder not found");
    // Approximate: parent depth + 1 + subtree height of moved folder
    if (depth.depth + 1 >= MAX_ATTACHMENT_FOLDER_DEPTH) {
      throw new Error(`Folders can only nest ${MAX_ATTACHMENT_FOLDER_DEPTH} levels deep`);
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(attachmentFolders)
      .set({ parentFolderId, updatedAt: new Date() })
      .where(eq(attachmentFolders.id, folderId));
    await logActivity(tx, {
      spaceId: space.id,
      taskId: task.id,
      actorId: user.id,
      verb: "attachment_folder.moved",
      payload: { folderId, parentFolderId, name: folder.name },
    });
  });
  revalidatePath(`/tasks/task/${task.number}`);
}
