"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, driveFiles, driveFolders, driveStars } from "@aitim/db";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/rbac";
import { assertSpaceAccess } from "./lib/access";
import { listDriveFoldersForMove } from "./queries";

function refresh() {
  revalidatePath("/files");
}

export async function createDriveFolder(input: {
  name: string;
  homeSpaceId: string;
  parentFolderId?: string | null;
}) {
  const user = await requireUser();
  const name = z.string().min(1).max(120).parse(input.name.trim());
  const homeSpaceId = z.string().uuid().parse(input.homeSpaceId);
  await assertSpaceAccess(user, homeSpaceId, "member");
  const parentFolderId: string | null = input.parentFolderId ?? null;
  if (parentFolderId) {
    const [parent] = await db.select().from(driveFolders).where(eq(driveFolders.id, parentFolderId));
    if (!parent || parent.deletedAt || parent.homeSpaceId !== homeSpaceId) {
      throw new Error("Parent folder not found");
    }
  }
  const [folder] = await db
    .insert(driveFolders)
    .values({ name, homeSpaceId, parentFolderId, createdById: user.id })
    .returning();
  refresh();
  return folder;
}

export async function renameDriveFolder(folderId: string, name: string) {
  const user = await requireUser();
  const id = z.string().uuid().parse(folderId);
  const next = z.string().min(1).max(120).parse(name.trim());
  const [folder] = await db.select().from(driveFolders).where(eq(driveFolders.id, id));
  if (!folder || folder.deletedAt) throw new Error("Folder not found");
  await assertSpaceAccess(user, folder.homeSpaceId, "member");
  await db.update(driveFolders).set({ name: next }).where(eq(driveFolders.id, id));
  refresh();
}

export async function moveDriveFolder(folderId: string, parentFolderId: string | null) {
  const user = await requireUser();
  const id = z.string().uuid().parse(folderId);
  const [folder] = await db.select().from(driveFolders).where(eq(driveFolders.id, id));
  if (!folder || folder.deletedAt) throw new Error("Folder not found");
  await assertSpaceAccess(user, folder.homeSpaceId, "member");
  if (parentFolderId === id) throw new Error("A folder cannot go inside itself");
  if (parentFolderId) {
    const [parent] = await db.select().from(driveFolders).where(eq(driveFolders.id, parentFolderId));
    if (!parent || parent.deletedAt || parent.homeSpaceId !== folder.homeSpaceId) {
      throw new Error("Destination folder not found");
    }
  }
  await db.update(driveFolders).set({ parentFolderId }).where(eq(driveFolders.id, id));
  refresh();
}

export async function trashDriveFolder(folderId: string) {
  const user = await requireUser();
  const id = z.string().uuid().parse(folderId);
  const [folder] = await db.select().from(driveFolders).where(eq(driveFolders.id, id));
  if (!folder) throw new Error("Folder not found");
  await assertSpaceAccess(user, folder.homeSpaceId, "member");
  await db.update(driveFolders).set({ deletedAt: new Date() }).where(eq(driveFolders.id, id));
  await db
    .update(driveFiles)
    .set({ deletedAt: new Date() })
    .where(and(eq(driveFiles.folderId, id), isNull(driveFiles.deletedAt)));
  refresh();
}

export async function restoreDriveFolder(folderId: string) {
  const user = await requireUser();
  const id = z.string().uuid().parse(folderId);
  const [folder] = await db.select().from(driveFolders).where(eq(driveFolders.id, id));
  if (!folder) throw new Error("Folder not found");
  await assertSpaceAccess(user, folder.homeSpaceId, "member");
  await db.update(driveFolders).set({ deletedAt: null }).where(eq(driveFolders.id, id));
  refresh();
}

export async function renameDriveFile(fileId: string, fileName: string) {
  const user = await requireUser();
  const id = z.string().uuid().parse(fileId);
  const next = z.string().min(1).max(200).parse(fileName.trim());
  const [file] = await db.select().from(driveFiles).where(eq(driveFiles.id, id));
  if (!file || file.deletedAt) throw new Error("File not found");
  await assertSpaceAccess(user, file.homeSpaceId, "member");
  await db.update(driveFiles).set({ fileName: next }).where(eq(driveFiles.id, id));
  refresh();
}

export async function moveDriveFile(fileId: string, folderId: string | null) {
  const user = await requireUser();
  const id = z.string().uuid().parse(fileId);
  const [file] = await db.select().from(driveFiles).where(eq(driveFiles.id, id));
  if (!file || file.deletedAt) throw new Error("File not found");
  await assertSpaceAccess(user, file.homeSpaceId, "member");
  if (folderId) {
    const [folder] = await db.select().from(driveFolders).where(eq(driveFolders.id, folderId));
    if (!folder || folder.deletedAt || folder.homeSpaceId !== file.homeSpaceId) {
      throw new Error("Destination folder not found");
    }
  }
  await db.update(driveFiles).set({ folderId }).where(eq(driveFiles.id, id));
  refresh();
}

export async function trashDriveFile(fileId: string) {
  const user = await requireUser();
  const id = z.string().uuid().parse(fileId);
  const [file] = await db.select().from(driveFiles).where(eq(driveFiles.id, id));
  if (!file) throw new Error("File not found");
  await assertSpaceAccess(user, file.homeSpaceId, "member");
  await db.update(driveFiles).set({ deletedAt: new Date() }).where(eq(driveFiles.id, id));
  refresh();
}

export async function restoreDriveFile(fileId: string) {
  const user = await requireUser();
  const id = z.string().uuid().parse(fileId);
  const [file] = await db.select().from(driveFiles).where(eq(driveFiles.id, id));
  if (!file) throw new Error("File not found");
  await assertSpaceAccess(user, file.homeSpaceId, "member");
  await db.update(driveFiles).set({ deletedAt: null }).where(eq(driveFiles.id, id));
  refresh();
}

export async function toggleDriveStar(fileId: string) {
  const user = await requireUser();
  const id = z.string().uuid().parse(fileId);
  const [file] = await db.select().from(driveFiles).where(eq(driveFiles.id, id));
  if (!file) throw new Error("File not found");
  await assertSpaceAccess(user, file.homeSpaceId, "guest");
  const [existing] = await db
    .select({ fileId: driveStars.fileId })
    .from(driveStars)
    .where(and(eq(driveStars.fileId, id), eq(driveStars.userId, user.id)));
  if (existing) {
    await db.delete(driveStars).where(and(eq(driveStars.fileId, id), eq(driveStars.userId, user.id)));
  } else {
    await db.insert(driveStars).values({ fileId: id, userId: user.id });
  }
  refresh();
}

export async function listMoveTargets(spaceId?: string) {
  const user = await requireUser();
  return listDriveFoldersForMove(user, spaceId);
}
