/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { chatAttachments, chatConversationMembers, db } from "@aitim/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { BUCKETS, getObjectStream } from "@/lib/storage";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });

  const { id } = await ctx.params;
  const [attachment] = await db
    .select()
    .from(chatAttachments)
    .where(eq(chatAttachments.id, id))
    .limit(1);
  if (!attachment) return new NextResponse(null, { status: 404 });

  const [member] = await db
    .select({ userId: chatConversationMembers.userId })
    .from(chatConversationMembers)
    .where(
      and(
        eq(chatConversationMembers.conversationId, attachment.conversationId),
        eq(chatConversationMembers.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!member) return new NextResponse(null, { status: 403 });

  try {
    const { body, contentType, length } = await getObjectStream(
      BUCKETS.attachments,
      attachment.objectKey,
    );
    const mime = contentType ?? attachment.mimeType;
    const isImage = mime.startsWith("image/");
    const disposition = isImage
      ? `inline; filename="${encodeURIComponent(attachment.fileName)}"`
      : `attachment; filename="${encodeURIComponent(attachment.fileName)}"`;
    return new NextResponse(body as unknown as ReadableStream, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(length ?? attachment.sizeBytes),
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
