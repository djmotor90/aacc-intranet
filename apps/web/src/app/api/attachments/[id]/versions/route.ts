/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 */
import { createHash, randomUUID } from "node:crypto";
import { attachmentVersions, attachments, db, users } from "@aitim/db";
import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { BUCKETS, deleteObject, putObject } from "@/lib/storage";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from "@/lib/upload-limits";
import { logActivity } from "@/modules/tasks/lib/activity";
import { getAttachmentAccess } from "../../attachment-access";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getAttachmentAccess({
    attachmentId: id,
    userId: session.user.id,
    platformRole: session.user.platformRole,
  });
  if (!access) return NextResponse.json({ error: "not found" }, { status: 404 });

  const versions = await db
    .select({
      versionNumber: attachmentVersions.versionNumber,
      versionLabel: attachmentVersions.versionLabel,
      fileName: attachmentVersions.fileName,
      mimeType: attachmentVersions.mimeType,
      sizeBytes: attachmentVersions.sizeBytes,
      checksumSha256: attachmentVersions.checksumSha256,
      createdAt: attachmentVersions.createdAt,
      uploaderId: attachmentVersions.uploaderId,
      uploaderName: users.displayName,
    })
    .from(attachmentVersions)
    .leftJoin(users, eq(attachmentVersions.uploaderId, users.id))
    .where(eq(attachmentVersions.attachmentId, id))
    .orderBy(desc(attachmentVersions.versionNumber));

  return NextResponse.json({ currentVersion: access.attachment.currentVersion, versions });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getAttachmentAccess({
    attachmentId: id,
    userId: session.user.id,
    platformRole: session.user.platformRole,
  });
  if (!access) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!access.canManage) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: `file too large (max ${MAX_ATTACHMENT_LABEL})` },
      { status: 413 },
    );
  }
  const versionLabelRaw = formData.get("versionLabel");
  const versionLabel = typeof versionLabelRaw === "string" ? versionLabelRaw.trim() : "";
  if (!versionLabel || versionLabel.length > 50) {
    return NextResponse.json(
      { error: "Enter a file version such as v2024.2.0 (maximum 50 characters)" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");
  if (checksum === access.attachment.checksumSha256) {
    return NextResponse.json({ error: "This file is identical to the current version" }, { status: 409 });
  }
  const rawName = file.name?.trim() || access.attachment.fileName;
  const safeName = rawName.replace(/[^\w.\- ]+/g, "_").slice(0, 200);
  const mimeType = file.type || "application/octet-stream";
  const objectKey = `${access.task.id}/${randomUUID()}-${safeName}`;
  await putObject(BUCKETS.attachments, objectKey, buffer, mimeType);

  try {
    const [updated] = await db.transaction(async (tx) => {
      const [attachment] = await tx
        .update(attachments)
        .set({
          currentVersion: sql`${attachments.currentVersion} + 1`,
          currentVersionLabel: versionLabel,
          objectKey,
          fileName: safeName,
          mimeType,
          sizeBytes: file.size,
          checksumSha256: checksum,
          uploaderId: session.user.id,
          updatedAt: new Date(),
        })
        .where(eq(attachments.id, id))
        .returning({ currentVersion: attachments.currentVersion });
      if (!attachment) throw new Error("Attachment not found");
      await tx.insert(attachmentVersions).values({
        attachmentId: id,
        versionNumber: attachment.currentVersion,
        versionLabel,
        uploaderId: session.user.id,
        objectKey,
        fileName: safeName,
        mimeType,
        sizeBytes: file.size,
        checksumSha256: checksum,
      });
      await logActivity(tx, {
        spaceId: access.space.id,
        taskId: access.task.id,
        actorId: session.user.id,
        verb: "attachment.version_added",
        payload: {
          attachmentId: id,
          fileName: safeName,
          versionNumber: attachment.currentVersion,
          versionLabel,
          sizeBytes: file.size,
          mimeType,
        },
      });
      return [attachment];
    });
    return NextResponse.json({
      ok: true,
      currentVersion: updated?.currentVersion,
      versionLabel,
      fileName: safeName,
    });
  } catch {
    await deleteObject(BUCKETS.attachments, objectKey).catch(() => undefined);
    return NextResponse.json({ error: "version upload failed" }, { status: 500 });
  }
}
