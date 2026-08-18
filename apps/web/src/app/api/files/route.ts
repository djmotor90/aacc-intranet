/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { randomUUID } from "node:crypto";
import { db, driveFiles, driveFolders } from "@aitim/db";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { BUCKETS, putObject } from "@/lib/storage";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from "@/lib/upload-limits";
import { assertSpaceAccess } from "@/modules/files/lib/access";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  const spaceId = String(formData.get("spaceId") ?? "");
  const folderRaw = String(formData.get("folderId") ?? "").trim();
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (!spaceId) return NextResponse.json({ error: "space required" }, { status: 400 });
  if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: `file too large (max ${MAX_ATTACHMENT_LABEL})` }, { status: 413 });
  }

  try {
    await assertSpaceAccess(
      { id: session.user.id, platformRole: session.user.platformRole ?? "member" },
      spaceId,
      "member",
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "forbidden" }, { status: 403 });
  }

  let folderId: string | null = null;
  if (folderRaw) {
    const [folder] = await db
      .select()
      .from(driveFolders)
      .where(and(eq(driveFolders.id, folderRaw), eq(driveFolders.homeSpaceId, spaceId), isNull(driveFolders.deletedAt)));
    if (!folder) return NextResponse.json({ error: "folder not found" }, { status: 400 });
    folderId = folder.id;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const rawName = file.name?.trim() || `file-${Date.now()}`;
  const safeName = rawName.replace(/[^\w.\- ]+/g, "_").slice(0, 200);
  const objectKey = `drive/${spaceId}/${randomUUID()}-${safeName}`;
  const mimeType = file.type || "application/octet-stream";
  await putObject(BUCKETS.attachments, objectKey, buffer, mimeType);

  const [row] = await db
    .insert(driveFiles)
    .values({
      homeSpaceId: spaceId,
      folderId,
      fileName: safeName,
      mimeType,
      sizeBytes: file.size,
      objectKey,
      uploaderId: session.user.id,
    })
    .returning({ id: driveFiles.id });

  revalidatePath("/files");
  return NextResponse.json({ id: row.id });
}
