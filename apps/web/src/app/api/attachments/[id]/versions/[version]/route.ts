/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 */
import { attachmentVersions, attachments, db } from "@aitim/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { BUCKETS, getObjectStream } from "@/lib/storage";
import { logActivity } from "@/modules/tasks/lib/activity";
import { getAttachmentAccess } from "../../../attachment-access";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; version: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });
  const { id, version } = await ctx.params;
  const versionNumber = Number.parseInt(version, 10);
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    return new NextResponse(null, { status: 400 });
  }
  const access = await getAttachmentAccess({
    attachmentId: id,
    userId: session.user.id,
    platformRole: session.user.platformRole,
  });
  if (!access) return new NextResponse(null, { status: 404 });
  const [row] = await db
    .select()
    .from(attachmentVersions)
    .where(
      and(
        eq(attachmentVersions.attachmentId, id),
        eq(attachmentVersions.versionNumber, versionNumber),
      ),
    );
  if (!row) return new NextResponse(null, { status: 404 });

  try {
    const { body, contentType, length } = await getObjectStream(BUCKETS.attachments, row.objectKey);
    const mime = contentType ?? row.mimeType;
    return new NextResponse(body as unknown as ReadableStream, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(length ?? row.sizeBytes),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(row.fileName)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; version: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, version } = await ctx.params;
  const versionNumber = Number.parseInt(version, 10);
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    return NextResponse.json({ error: "invalid version" }, { status: 400 });
  }
  const access = await getAttachmentAccess({
    attachmentId: id,
    userId: session.user.id,
    platformRole: session.user.platformRole,
  });
  if (!access) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!access.canManage) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { versionLabel?: unknown } | null;
  const versionLabel = typeof body?.versionLabel === "string" ? body.versionLabel.trim() : "";
  if (!versionLabel || versionLabel.length > 50) {
    return NextResponse.json(
      { error: "Enter a file version such as v2024.2.0 (maximum 50 characters)" },
      { status: 400 },
    );
  }

  const updated = await db.transaction(async (tx) => {
    const [versionRow] = await tx
      .update(attachmentVersions)
      .set({ versionLabel })
      .where(
        and(
          eq(attachmentVersions.attachmentId, id),
          eq(attachmentVersions.versionNumber, versionNumber),
        ),
      )
      .returning({ versionNumber: attachmentVersions.versionNumber });
    if (!versionRow) return null;
    if (access.attachment.currentVersion === versionNumber) {
      await tx
        .update(attachments)
        .set({ currentVersionLabel: versionLabel, updatedAt: new Date() })
        .where(eq(attachments.id, id));
    }
    await logActivity(tx, {
      spaceId: access.space.id,
      taskId: access.task.id,
      actorId: session.user.id,
      verb: "attachment.version_labeled",
      payload: {
        attachmentId: id,
        fileName: access.attachment.fileName,
        versionNumber,
        versionLabel,
      },
    });
    return versionRow;
  });
  if (!updated) return NextResponse.json({ error: "version not found" }, { status: 404 });
  return NextResponse.json({ ok: true, versionNumber, versionLabel });
}
