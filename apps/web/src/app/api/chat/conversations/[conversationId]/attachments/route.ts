/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { createHash, randomUUID } from "node:crypto";
import { chatAttachments, db } from "@aitim/db";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getConversationForUser } from "@/modules/chat/queries";
import { BUCKETS, putObject } from "@/lib/storage";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from "@/lib/upload-limits";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ conversationId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { conversationId } = await ctx.params;
  const ctxConv = await getConversationForUser(conversationId, session.user.id);
  if (!ctxConv) return NextResponse.json({ error: "not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: `file too large (max ${MAX_ATTACHMENT_LABEL})` },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const rawName = file.name?.trim() || `paste-${Date.now()}.png`;
  const safeName = rawName.replace(/[^\w.\- ]+/g, "_").slice(0, 200);
  const mimeType = file.type || "application/octet-stream";

  // Reuse the same object if this exact bytes were already pasted/retried
  // into this conversation, instead of storing duplicate S3 objects/rows.
  const [existing] = await db
    .select({
      id: chatAttachments.id,
      fileName: chatAttachments.fileName,
      mimeType: chatAttachments.mimeType,
      sizeBytes: chatAttachments.sizeBytes,
    })
    .from(chatAttachments)
    .where(
      and(
        eq(chatAttachments.conversationId, conversationId),
        eq(chatAttachments.checksumSha256, checksum),
      ),
    )
    .orderBy(desc(chatAttachments.createdAt))
    .limit(1);

  if (existing) {
    return NextResponse.json({
      id: existing.id,
      fileName: existing.fileName,
      mimeType: existing.mimeType,
      sizeBytes: existing.sizeBytes,
      url: `/api/chat/attachments/${existing.id}`,
      reused: true,
    });
  }

  const objectKey = `chat/${conversationId}/${randomUUID()}-${safeName}`;

  await putObject(BUCKETS.attachments, objectKey, buffer, mimeType);

  const [created] = await db
    .insert(chatAttachments)
    .values({
      conversationId,
      uploaderId: session.user.id,
      objectKey,
      fileName: safeName,
      mimeType,
      sizeBytes: file.size,
      checksumSha256: checksum,
    })
    .returning({
      id: chatAttachments.id,
      fileName: chatAttachments.fileName,
      mimeType: chatAttachments.mimeType,
      sizeBytes: chatAttachments.sizeBytes,
    });

  return NextResponse.json({
    id: created.id,
    fileName: created.fileName,
    mimeType: created.mimeType,
    sizeBytes: created.sizeBytes,
    url: `/api/chat/attachments/${created.id}`,
  });
}
