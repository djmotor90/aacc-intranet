/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  db,
  folderMembers,
  folders,
  listMembers,
  listSecretViewers,
  lists,
  spaceMembers,
  userGroupMemberships,
} from "@aitim/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

export type SpaceRole = "owner" | "member" | "guest";
const ROLE_RANK: Record<SpaceRole, number> = { owner: 3, member: 2, guest: 1 };

/** Session user or redirect to login. */
export const requireUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user;
});

export const requireAdmin = cache(async () => {
  const user = await requireUser();
  if (user.platformRole !== "admin") redirect("/");
  return user;
});

/**
 * Entra group ids for a user — fetched once per request (React cache).
 * Previously every getSpaceRole / getFolderRole / getListRole re-queried this,
 * which stacked dozens of pool checkouts and caused
 * "timeout exceeded when trying to connect".
 */
export const getUserGroupIds = cache(async (userId: string): Promise<string[]> => {
  const groupRows = await db
    .select({ groupId: userGroupMemberships.groupId })
    .from(userGroupMemberships)
    .where(eq(userGroupMemberships.userId, userId));
  return groupRows.map((r) => r.groupId);
});

/**
 * Effective role in a space: direct membership OR membership via a mapped
 * Entra group; highest role wins.
 *
 * Platform Super Admin (`platformRole === "admin"`) is god mode — treated as
 * space Admin (internal key `owner`) everywhere and bypasses privacy gates.
 * That is separate from space membership Admin, which is permission-matrix controlled.
 */
export const getSpaceRole = cache(
  async (userId: string, spaceId: string, platformRole?: string): Promise<SpaceRole | null> => {
    if (platformRole === "admin") return "owner";

    const groupIds = await getUserGroupIds(userId);

    const memberships = await db
      .select({ role: spaceMembers.role })
      .from(spaceMembers)
      .where(
        and(
          eq(spaceMembers.spaceId, spaceId),
          or(
            eq(spaceMembers.userId, userId),
            groupIds.length > 0 ? inArray(spaceMembers.groupId, groupIds) : undefined,
          ),
        ),
      );

    if (memberships.length === 0) return null;
    return memberships.reduce<SpaceRole>(
      (best, m) => (ROLE_RANK[m.role] > ROLE_RANK[best] ? m.role : best),
      "guest",
    );
  },
);

/** True if the user is Admin (owner role) of at least one space — direct or via group. Super Admin always true. */
export const userOwnsAnySpace = cache(
  async (userId: string, platformRole?: string): Promise<boolean> => {
    if (platformRole === "admin") return true;
    const groupIds = await getUserGroupIds(userId);
    const [row] = await db
      .select({ id: spaceMembers.spaceId })
      .from(spaceMembers)
      .where(
        and(
          eq(spaceMembers.role, "owner"),
          or(
            eq(spaceMembers.userId, userId),
            groupIds.length > 0 ? inArray(spaceMembers.groupId, groupIds) : undefined,
          ),
        ),
      )
      .limit(1);
    return !!row;
  },
);

export async function assertSpaceRole(spaceId: string, minimum: SpaceRole): Promise<SpaceRole> {
  const user = await requireUser();
  const role = await getSpaceRole(user.id, spaceId, user.platformRole);
  if (!role || ROLE_RANK[role] < ROLE_RANK[minimum]) redirect("/");
  return role;
}

/**
 * Effective role on a folder: platform admins and **space** owners always get
 * "owner" (they bypass `isPrivate`). Folder-level `owner` grants do NOT pierce
 * private child folders — only direct `folderMembers` (or space ownership)
 * grant access there. Otherwise a folder's parent is either another folder
 * (recurse) or the space itself. A private folder only grants access via a
 * direct folderMembers row (the parent's role is ignored entirely); a
 * non-private folder unions the direct folder role with the inherited parent
 * role, direct grants only ever adding/upgrading, never downgrading below it.
 */
export const getFolderRole = cache(
  async (userId: string, folderId: string, platformRole?: string): Promise<SpaceRole | null> => {
    if (platformRole === "admin") return "owner";

    const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
    if (!folder) return null;

    // Space owners always own every folder in the space (bypass isPrivate).
    // Do not treat folder-level "owner" membership the same way — that would
    // let an invite to a parent folder pierce private nested folders.
    const spaceRole = await getSpaceRole(userId, folder.spaceId, platformRole);
    if (spaceRole === "owner") return "owner";

    const parentRole = folder.parentFolderId
      ? await getFolderRole(userId, folder.parentFolderId, platformRole)
      : spaceRole;

    const groupIds = await getUserGroupIds(userId);

    const directRows = await db
      .select({ role: folderMembers.role })
      .from(folderMembers)
      .where(
        and(
          eq(folderMembers.folderId, folderId),
          or(
            eq(folderMembers.userId, userId),
            groupIds.length > 0 ? inArray(folderMembers.groupId, groupIds) : undefined,
          ),
        ),
      );
    const directRole =
      directRows.length > 0
        ? directRows.reduce<SpaceRole>(
            (best, m) => (ROLE_RANK[m.role] > ROLE_RANK[best] ? m.role : best),
            "guest",
          )
        : null;

    if (folder.isPrivate) return directRole;
    if (!directRole) return parentRole;
    if (!parentRole) return directRole;
    return ROLE_RANK[directRole] > ROLE_RANK[parentRole] ? directRole : parentRole;
  },
);

export async function assertFolderRole(folderId: string, minimum: SpaceRole): Promise<SpaceRole> {
  const user = await requireUser();
  const role = await getFolderRole(user.id, folderId, user.platformRole);
  if (!role || ROLE_RANK[role] < ROLE_RANK[minimum]) redirect("/");
  return role;
}

/**
 * Effective role on a list: platform admins and **space** owners always get
 * "owner" (they bypass a list's `isPrivate` restriction). Folder-level
 * `owner` grants do NOT pierce private lists — only direct `listMembers`
 * (or space ownership) grant access there. Otherwise, a list's parent is
 * either the folder it sits in (recurse) or the space directly. A private
 * list only grants access via a direct listMembers row (the parent role is
 * ignored entirely); a non-private list unions the direct list role with
 * the inherited parent role, direct grants only ever adding/upgrading,
 * never downgrading below the inherited role.
 */
export const getListRole = cache(
  async (userId: string, listId: string, platformRole?: string): Promise<SpaceRole | null> => {
    if (platformRole === "admin") return "owner";

    const [list] = await db.select().from(lists).where(eq(lists.id, listId));
    if (!list) return null;

    // Space owners always own every list in the space (bypass isPrivate).
    // Do not short-circuit on folder-level "owner" — that would let a folder
    // invite pierce private nested lists without a listMembers row.
    const spaceRole = await getSpaceRole(userId, list.spaceId, platformRole);
    if (spaceRole === "owner") return "owner";

    const parentRole = list.folderId
      ? await getFolderRole(userId, list.folderId, platformRole)
      : spaceRole;

    const groupIds = await getUserGroupIds(userId);

    const directRows = await db
      .select({ role: listMembers.role })
      .from(listMembers)
      .where(
        and(
          eq(listMembers.listId, listId),
          or(
            eq(listMembers.userId, userId),
            groupIds.length > 0 ? inArray(listMembers.groupId, groupIds) : undefined,
          ),
        ),
      );
    const directRole =
      directRows.length > 0
        ? directRows.reduce<SpaceRole>(
            (best, m) => (ROLE_RANK[m.role] > ROLE_RANK[best] ? m.role : best),
            "guest",
          )
        : null;

    if (list.isPrivate) return directRole;
    if (!directRole) return parentRole;
    if (!parentRole) return directRole;
    return ROLE_RANK[directRole] > ROLE_RANK[parentRole] ? directRole : parentRole;
  },
);

export async function assertListRole(listId: string, minimum: SpaceRole): Promise<SpaceRole> {
  const user = await requireUser();
  const role = await getListRole(user.id, listId, user.platformRole);
  if (!role || ROLE_RANK[role] < ROLE_RANK[minimum]) redirect("/");
  return role;
}

/**
 * Secrets vault access: space owners always have it (same bypass as every
 * other role check here). Anyone else — including list owners/members/guests —
 * only gets in via an explicit `listSecretViewers` grant, made by a space
 * owner from the list's Features settings. This is a single yes/no
 * permission, independent of a person's regular list role.
 */
export const canViewSecrets = cache(
  async (userId: string, listId: string, platformRole?: string): Promise<boolean> => {
    if (platformRole === "admin") return true;

    const [list] = await db.select().from(lists).where(eq(lists.id, listId));
    if (!list) return false;

    const spaceRole = await getSpaceRole(userId, list.spaceId, platformRole);
    if (spaceRole === "owner") return true;

    const groupIds = await getUserGroupIds(userId);
    const grants = await db
      .select({ id: listSecretViewers.id })
      .from(listSecretViewers)
      .where(
        and(
          eq(listSecretViewers.listId, listId),
          or(
            eq(listSecretViewers.userId, userId),
            groupIds.length > 0 ? inArray(listSecretViewers.groupId, groupIds) : undefined,
          ),
        ),
      )
      .limit(1);
    return grants.length > 0;
  },
);

export async function assertSecretsAccess(listId: string): Promise<void> {
  const user = await requireUser();
  const allowed = await canViewSecrets(user.id, listId, user.platformRole);
  if (!allowed) redirect("/");
}
