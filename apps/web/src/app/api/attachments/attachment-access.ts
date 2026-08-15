/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 */
import { attachments, db, lists, spaces, tasks } from "@aitim/db";
import { eq } from "drizzle-orm";
import { getListRole } from "@/lib/rbac";

export async function getAttachmentAccess(params: {
  attachmentId: string;
  userId: string;
  platformRole?: string | null;
}) {
  const [row] = await db
    .select({ attachment: attachments, task: tasks, list: lists, space: spaces })
    .from(attachments)
    .innerJoin(tasks, eq(attachments.taskId, tasks.id))
    .innerJoin(lists, eq(tasks.listId, lists.id))
    .innerJoin(spaces, eq(lists.spaceId, spaces.id))
    .where(eq(attachments.id, params.attachmentId));
  if (!row) return null;

  const listRole = await getListRole(
    params.userId,
    row.list.id,
    params.platformRole ?? undefined,
  );
  if (!listRole) return null;
  const canManage =
    params.platformRole === "admin" ||
    listRole === "owner" ||
    listRole === "member" ||
    row.attachment.uploaderId === params.userId;
  return { ...row, listRole, canManage };
}
