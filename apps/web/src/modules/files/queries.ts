/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  attachments,
  db,
  driveFiles,
  driveFolders,
  driveStars,
  lists,
  spaceMembers,
  spaces,
  tasks,
  teamMemberships,
  users,
} from "@aitim/db";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getListRole, getSpaceRole } from "@/lib/rbac";
import type { SessionUserLike } from "@/modules/types";

export type DriveFolderItem = {
  id: string;
  name: string;
  homeSpaceId: string;
  spaceName: string;
  parentFolderId: string | null;
  updatedAt: string;
  itemCount: number;
};

export type DriveFileItem = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  folderId: string | null;
  homeSpaceId: string;
  spaceName: string;
  uploaderName: string | null;
  updatedAt: string;
  starred: boolean;
};

export type TaskFileItem = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  taskNumber: string | number;
  taskTitle: string;
  spaceName: string;
  updatedAt: string;
};

export type DriveSection = "all" | "recent" | "starred" | "tasks" | "trash";

async function accessibleSpaceIds(user: SessionUserLike): Promise<string[] | "all"> {
  if (user.platformRole === "admin") return "all";
  const groupRows = await db
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, user.id));
  const groupIds = groupRows.map((g) => g.teamId);
  const memberships = await db
    .select({ spaceId: spaceMembers.spaceId })
    .from(spaceMembers)
    .where(
      or(
        eq(spaceMembers.userId, user.id),
        groupIds.length > 0 ? inArray(spaceMembers.groupId, groupIds) : undefined,
      ),
    );
  return [...new Set(memberships.map((m) => m.spaceId))];
}

export async function listSpacesForFiles(user: SessionUserLike) {
  const spaceIds = await accessibleSpaceIds(user);
  if (spaceIds !== "all" && spaceIds.length === 0) return [];
  return db
    .select({ id: spaces.id, name: spaces.name })
    .from(spaces)
    .where(
      and(
        isNull(spaces.deletedAt),
        eq(spaces.isArchived, false),
        spaceIds === "all" ? undefined : inArray(spaces.id, spaceIds),
      ),
    )
    .orderBy(spaces.name);
}

export async function getDriveFolderBreadcrumb(user: SessionUserLike, folderId: string | null) {
  if (!folderId) return [];
  const crumbs: { id: string; name: string }[] = [];
  let walk: string | null = folderId;
  for (let i = 0; i < 12 && walk; i++) {
    const [row] = await db
      .select({
        id: driveFolders.id,
        name: driveFolders.name,
        parentFolderId: driveFolders.parentFolderId,
        homeSpaceId: driveFolders.homeSpaceId,
        deletedAt: driveFolders.deletedAt,
      })
      .from(driveFolders)
      .where(eq(driveFolders.id, walk))
      .limit(1);
    if (!row) break;
    const role = await getSpaceRole(user.id, row.homeSpaceId, user.platformRole);
    if (!role) break;
    crumbs.unshift({ id: row.id, name: row.name });
    walk = row.parentFolderId;
  }
  return crumbs;
}

export async function listDriveFolders(
  user: SessionUserLike,
  opts: { parentFolderId: string | null; trash?: boolean },
): Promise<DriveFolderItem[]> {
  const spaceIds = await accessibleSpaceIds(user);
  if (spaceIds !== "all" && spaceIds.length === 0) return [];
  const folders = opts.trash
    ? await listTrashFolders(user, spaceIds)
    : await db
        .select({
          id: driveFolders.id,
          name: driveFolders.name,
          homeSpaceId: driveFolders.homeSpaceId,
          spaceName: spaces.name,
          parentFolderId: driveFolders.parentFolderId,
          updatedAt: driveFolders.updatedAt,
        })
        .from(driveFolders)
        .innerJoin(spaces, eq(driveFolders.homeSpaceId, spaces.id))
        .where(
          and(
            isNull(driveFolders.deletedAt),
            opts.parentFolderId
              ? eq(driveFolders.parentFolderId, opts.parentFolderId)
              : isNull(driveFolders.parentFolderId),
            spaceIds === "all" ? undefined : inArray(driveFolders.homeSpaceId, spaceIds),
            isNull(spaces.deletedAt),
          ),
        )
        .orderBy(driveFolders.name);

  const out: DriveFolderItem[] = [];
  for (const row of folders) {
    const [kids, files] = await Promise.all([
      db
        .select({ id: driveFolders.id })
        .from(driveFolders)
        .where(and(eq(driveFolders.parentFolderId, row.id), isNull(driveFolders.deletedAt))),
      db
        .select({ id: driveFiles.id })
        .from(driveFiles)
        .where(and(eq(driveFiles.folderId, row.id), isNull(driveFiles.deletedAt))),
    ]);
    out.push({
      id: row.id,
      name: row.name,
      homeSpaceId: row.homeSpaceId,
      spaceName: row.spaceName,
      parentFolderId: row.parentFolderId,
      updatedAt: row.updatedAt.toISOString(),
      itemCount: kids.length + files.length,
    });
  }
  return out;
}

async function listTrashFolders(user: SessionUserLike, spaceIds: string[] | "all") {
  const rows = await db
    .select({
      id: driveFolders.id,
      name: driveFolders.name,
      homeSpaceId: driveFolders.homeSpaceId,
      spaceName: spaces.name,
      parentFolderId: driveFolders.parentFolderId,
      updatedAt: driveFolders.updatedAt,
      deletedAt: driveFolders.deletedAt,
    })
    .from(driveFolders)
    .innerJoin(spaces, eq(driveFolders.homeSpaceId, spaces.id))
    .where(spaceIds === "all" ? undefined : inArray(driveFolders.homeSpaceId, spaceIds));
  return rows.filter((r) => r.deletedAt);
}

export async function listDriveFiles(
  user: SessionUserLike,
  opts: { folderId: string | null; section: DriveSection },
): Promise<DriveFileItem[]> {
  const spaceIds = await accessibleSpaceIds(user);
  if (spaceIds !== "all" && spaceIds.length === 0) return [];

  const starred = await db
    .select({ fileId: driveStars.fileId })
    .from(driveStars)
    .where(eq(driveStars.userId, user.id));
  const starredIds = new Set(starred.map((s) => s.fileId));

  const rows = await db
    .select({
      id: driveFiles.id,
      fileName: driveFiles.fileName,
      mimeType: driveFiles.mimeType,
      sizeBytes: driveFiles.sizeBytes,
      folderId: driveFiles.folderId,
      homeSpaceId: driveFiles.homeSpaceId,
      spaceName: spaces.name,
      uploaderName: users.displayName,
      updatedAt: driveFiles.updatedAt,
      deletedAt: driveFiles.deletedAt,
    })
    .from(driveFiles)
    .innerJoin(spaces, eq(driveFiles.homeSpaceId, spaces.id))
    .leftJoin(users, eq(driveFiles.uploaderId, users.id))
    .where(spaceIds === "all" ? undefined : inArray(driveFiles.homeSpaceId, spaceIds))
    .orderBy(desc(driveFiles.updatedAt));

  let list = rows;
  if (opts.section === "trash") list = rows.filter((r) => r.deletedAt);
  else list = rows.filter((r) => !r.deletedAt);
  if (opts.section === "all") {
    list = list.filter((r) => (opts.folderId ? r.folderId === opts.folderId : r.folderId == null));
  }
  if (opts.section === "starred") list = list.filter((r) => starredIds.has(r.id));
  if (opts.section === "recent") list = list.slice(0, 80);

  return list.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    folderId: r.folderId,
    homeSpaceId: r.homeSpaceId,
    spaceName: r.spaceName,
    uploaderName: r.uploaderName,
    updatedAt: r.updatedAt.toISOString(),
    starred: starredIds.has(r.id),
  }));
}

export async function listDriveFoldersForMove(user: SessionUserLike, spaceId?: string) {
  const spaceIds = await accessibleSpaceIds(user);
  if (spaceIds !== "all" && spaceIds.length === 0) return [];
  const rows = await db
    .select({
      id: driveFolders.id,
      name: driveFolders.name,
      parentFolderId: driveFolders.parentFolderId,
      homeSpaceId: driveFolders.homeSpaceId,
      spaceName: spaces.name,
    })
    .from(driveFolders)
    .innerJoin(spaces, eq(driveFolders.homeSpaceId, spaces.id))
    .where(
      and(
        isNull(driveFolders.deletedAt),
        spaceId ? eq(driveFolders.homeSpaceId, spaceId) : undefined,
        spaceIds === "all" ? undefined : inArray(driveFolders.homeSpaceId, spaceIds),
      ),
    )
    .orderBy(driveFolders.name);
  return rows;
}

export async function listTaskFiles(user: SessionUserLike): Promise<TaskFileItem[]> {
  const rows = await db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      taskNumber: tasks.number,
      taskTitle: tasks.title,
      listId: lists.id,
      spaceName: spaces.name,
      updatedAt: attachments.updatedAt,
    })
    .from(attachments)
    .innerJoin(tasks, eq(attachments.taskId, tasks.id))
    .innerJoin(lists, eq(tasks.listId, lists.id))
    .innerJoin(spaces, eq(lists.spaceId, spaces.id))
    .where(and(isNull(lists.deletedAt), isNull(spaces.deletedAt)))
    .orderBy(desc(attachments.updatedAt))
    .limit(200);

  const out: TaskFileItem[] = [];
  for (const row of rows) {
    const role = await getListRole(user.id, row.listId, user.platformRole);
    if (!role) continue;
    out.push({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      taskNumber: row.taskNumber,
      taskTitle: row.taskTitle,
      spaceName: row.spaceName,
      updatedAt: row.updatedAt.toISOString(),
    });
    if (out.length >= 80) break;
  }
  return out;
}

export async function getDriveFileForUser(user: SessionUserLike, fileId: string) {
  const [row] = await db
    .select({ file: driveFiles, spaceName: spaces.name })
    .from(driveFiles)
    .innerJoin(spaces, eq(driveFiles.homeSpaceId, spaces.id))
    .where(eq(driveFiles.id, fileId))
    .limit(1);
  if (!row) return null;
  const role = await getSpaceRole(user.id, row.file.homeSpaceId, user.platformRole);
  if (!role) return null;
  return row.file;
}
