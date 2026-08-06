/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, docAttachments, docPages } from "@aitim/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSpaceRole } from "@/lib/rbac";
import { BUCKETS, getObjectStream } from "@/lib/storage";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });

  const { id } = await ctx.params;
  const [row] = await db
    .select({
      attachment: docAttachments,
      homeSpaceId: docPages.homeSpaceId,
    })
    .from(docAttachments)
    .innerJoin(docPages, eq(docAttachments.pageId, docPages.id))
    .where(eq(docAttachments.id, id))
    .limit(1);
  if (!row) return new NextResponse(null, { status: 404 });

  const role = await getSpaceRole(
    session.user.id,
    row.homeSpaceId,
    session.user.platformRole,
  );
  if (!role) return new NextResponse(null, { status: 403 });

  try {
    const { body, contentType, length } = await getObjectStream(
      BUCKETS.attachments,
      row.attachment.objectKey,
    );
    const mime = contentType ?? row.attachment.mimeType;
    const isImage = mime.startsWith("image/");
    const disposition = isImage
      ? `inline; filename="${encodeURIComponent(row.attachment.fileName)}"`
      : `attachment; filename="${encodeURIComponent(row.attachment.fileName)}"`;
    return new NextResponse(body as unknown as ReadableStream, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(length ?? row.attachment.sizeBytes),
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
