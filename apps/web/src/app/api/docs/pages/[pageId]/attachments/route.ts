/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { createHash, randomUUID } from "node:crypto";
import { db, docAttachments, docPages } from "@aitim/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSpaceRole } from "@/lib/rbac";
import { BUCKETS, putObject } from "@/lib/storage";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_LABEL,
} from "@/lib/upload-limits";
import { userHasPermission } from "@/lib/permissions";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ pageId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { pageId } = await ctx.params;
  const [page] = await db
    .select()
    .from(docPages)
    .where(and(eq(docPages.id, pageId), isNull(docPages.deletedAt)))
    .limit(1);
  if (!page) return NextResponse.json({ error: "not found" }, { status: 404 });

  const role = await getSpaceRole(
    session.user.id,
    page.homeSpaceId,
    session.user.platformRole,
  );
  if (!role || role === "guest") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!(await userHasPermission(session.user, "edit_docs"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (page.isProtected && role !== "owner" && session.user.platformRole !== "admin") {
    if (!(await userHasPermission(session.user, "manage_docs"))) {
      return NextResponse.json({ error: "page protected" }, { status: 403 });
    }
  }

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

  // Word often exposes the same binary more than once (HTML data URL plus a
  // clipboard File), and users may retry a paste. Reuse the page attachment
  // instead of storing duplicate S3 objects and duplicate metadata rows.
  const [existing] = await db
    .select({
      id: docAttachments.id,
      fileName: docAttachments.fileName,
      mimeType: docAttachments.mimeType,
      sizeBytes: docAttachments.sizeBytes,
    })
    .from(docAttachments)
    .where(
      and(
        eq(docAttachments.pageId, pageId),
        eq(docAttachments.checksumSha256, checksum),
      ),
    )
    .orderBy(desc(docAttachments.createdAt))
    .limit(1);

  if (existing) {
    return NextResponse.json({
      id: existing.id,
      fileName: existing.fileName,
      mimeType: existing.mimeType,
      sizeBytes: existing.sizeBytes,
      url: `/api/docs/attachments/${existing.id}`,
      reused: true,
    });
  }

  const objectKey = `docs/${pageId}/${randomUUID()}-${safeName}`;

  await putObject(BUCKETS.attachments, objectKey, buffer, mimeType);

  const [created] = await db
    .insert(docAttachments)
    .values({
      pageId,
      uploaderId: session.user.id,
      objectKey,
      fileName: safeName,
      mimeType,
      sizeBytes: file.size,
      checksumSha256: checksum,
    })
    .returning({
      id: docAttachments.id,
      fileName: docAttachments.fileName,
      mimeType: docAttachments.mimeType,
      sizeBytes: docAttachments.sizeBytes,
    });

  return NextResponse.json({
    id: created.id,
    fileName: created.fileName,
    mimeType: created.mimeType,
    sizeBytes: created.sizeBytes,
    url: `/api/docs/attachments/${created.id}`,
  });
}
