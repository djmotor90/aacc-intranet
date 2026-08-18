/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { BUCKETS, getObjectStream } from "@/lib/storage";
import { getDriveFileForUser } from "@/modules/files/queries";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });
  const { id } = await ctx.params;
  const file = await getDriveFileForUser(
    { id: session.user.id, platformRole: session.user.platformRole ?? "member" },
    id,
  );
  if (!file) return new NextResponse(null, { status: 404 });
  try {
    const { body, contentType, length } = await getObjectStream(BUCKETS.attachments, file.objectKey);
    const download = new URL(req.url).searchParams.get("download");
    const mime = contentType ?? file.mimeType;
    const disposition = download
      ? `attachment; filename="${encodeURIComponent(file.fileName)}"`
      : `inline; filename="${encodeURIComponent(file.fileName)}"`;
    return new NextResponse(body as unknown as ReadableStream, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(length ?? file.sizeBytes),
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
