/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, folders, lists, spaces, tasks } from "@aitim/db";
import { eq } from "drizzle-orm";
import { assertPermission, userHasPermission } from "@/lib/permissions";
import { getSpaceRole, type SpaceRole } from "@/lib/rbac";
import type { SessionUserLike } from "@/modules/types";

export type DocLinkTargetType = "space" | "folder" | "list" | "task";

/** Space a link target lives in — needed to gate access to it (targets aren't necessarily in the page's own home space). */
async function resolveTargetSpaceId(
  targetType: DocLinkTargetType,
  targetId: string,
): Promise<string | null> {
  switch (targetType) {
    case "space": {
      const [row] = await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, targetId)).limit(1);
      return row?.id ?? null;
    }
    case "folder": {
      const [row] = await db
        .select({ spaceId: folders.spaceId })
        .from(folders)
        .where(eq(folders.id, targetId))
        .limit(1);
      return row?.spaceId ?? null;
    }
    case "list": {
      const [row] = await db
        .select({ spaceId: lists.spaceId })
        .from(lists)
        .where(eq(lists.id, targetId))
        .limit(1);
      return row?.spaceId ?? null;
    }
    case "task": {
      const [row] = await db
        .select({ spaceId: lists.spaceId })
        .from(tasks)
        .innerJoin(lists, eq(tasks.listId, lists.id))
        .where(eq(tasks.id, targetId))
        .limit(1);
      return row?.spaceId ?? null;
    }
  }
}

/** Throws unless the target exists and the caller has at least guest access to the space it lives in. */
export async function assertTargetAccessible(
  user: SessionUserLike,
  targetType: DocLinkTargetType,
  targetId: string,
) {
  const spaceId = await resolveTargetSpaceId(targetType, targetId);
  if (!spaceId) throw new Error("Linked item not found");
  const role = await getSpaceRole(user.id, spaceId, user.platformRole);
  if (!role) throw new Error("You do not have access to that item");
}

export async function assertSpaceAccess(
  user: SessionUserLike,
  spaceId: string,
  minRole: SpaceRole = "guest",
) {
  const role = await getSpaceRole(user.id, spaceId, user.platformRole);
  if (!role) throw new Error("You do not have access to this space");
  const rank = { guest: 1, member: 2, owner: 3 } as const;
  if (rank[role] < rank[minRole]) {
    throw new Error("Insufficient space role");
  }
  return role;
}

export async function canViewPageInSpace(user: SessionUserLike, spaceId: string) {
  const role = await getSpaceRole(user.id, spaceId, user.platformRole);
  return role != null;
}

export async function canCreatePage(user: SessionUserLike, spaceId: string) {
  if (!(await userHasPermission(user, "create_docs"))) return false;
  const role = await getSpaceRole(user.id, spaceId, user.platformRole);
  return role === "member" || role === "owner";
}

export async function canEditPageContent(
  user: SessionUserLike,
  spaceId: string,
  isProtected: boolean,
) {
  if (!(await userHasPermission(user, "edit_docs"))) return false;
  const role = await getSpaceRole(user.id, spaceId, user.platformRole);
  if (!role || role === "guest") return false;
  if (isProtected) {
    if (user.platformRole === "admin") return true;
    if (role === "owner") return true;
    return userHasPermission(user, "manage_docs");
  }
  return true;
}

export async function canManagePage(user: SessionUserLike, spaceId: string) {
  if (user.platformRole === "admin") return true;
  if (!(await userHasPermission(user, "manage_docs"))) {
    const role = await getSpaceRole(user.id, spaceId, user.platformRole);
    return role === "owner";
  }
  const role = await getSpaceRole(user.id, spaceId, user.platformRole);
  return role === "member" || role === "owner";
}

export async function requireCreateDocs(user: SessionUserLike, spaceId: string) {
  await assertPermission(user, "create_docs");
  return assertSpaceAccess(user, spaceId, "member");
}

export async function requireEditDocs(
  user: SessionUserLike,
  spaceId: string,
  isProtected: boolean,
) {
  await assertPermission(user, "edit_docs");
  const role = await assertSpaceAccess(user, spaceId, "member");
  if (isProtected) {
    const ok = await canEditPageContent(user, spaceId, true);
    if (!ok) throw new Error("This page is protected");
  }
  return role;
}
