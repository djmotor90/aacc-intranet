/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, permissionRoles, users } from "@aitim/db";
import { asc, eq } from "drizzle-orm";
import { cache } from "react";
import {
  normalizePermissionMap,
  SYSTEM_ROLE_DEFAULTS,
  type PermissionKey,
  type PermissionMap,
} from "@/lib/permissions-catalog";
import type { SessionUserLike } from "@/modules/types";

export type EffectiveAccess =
  | { kind: "super_admin" }
  | { kind: "role"; roleId: string; roleSlug: string; roleName: string; permissions: PermissionMap };

/**
 * Resolve app permissions for a user.
 * Super Admin (platform admin / protected) → god mode.
 * Everyone else → Security & Permissions role (Guest / Member / Admin / custom).
 */
export const getEffectiveAccess = cache(async (userId: string): Promise<EffectiveAccess> => {
  const [u] = await db
    .select({
      platformRole: users.platformRole,
      isProtectedAdmin: users.isProtectedAdmin,
      permissionRoleId: users.permissionRoleId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!u) {
    return {
      kind: "role",
      roleId: "",
      roleSlug: "guest",
      roleName: "Guest",
      permissions: normalizePermissionMap(SYSTEM_ROLE_DEFAULTS.guest.permissions),
    };
  }

  if (u.isProtectedAdmin || u.platformRole === "admin") {
    return { kind: "super_admin" };
  }

  let roleRow =
    u.permissionRoleId != null
      ? (
          await db
            .select()
            .from(permissionRoles)
            .where(eq(permissionRoles.id, u.permissionRoleId))
            .limit(1)
        )[0]
      : null;

  // Fallback: system Member role
  if (!roleRow) {
    const [member] = await db
      .select()
      .from(permissionRoles)
      .where(eq(permissionRoles.slug, "member"))
      .limit(1);
    roleRow = member ?? null;
  }

  if (!roleRow) {
    return {
      kind: "role",
      roleId: "",
      roleSlug: "member",
      roleName: "Member",
      permissions: normalizePermissionMap(SYSTEM_ROLE_DEFAULTS.member.permissions),
    };
  }

  return {
    kind: "role",
    roleId: roleRow.id,
    roleSlug: roleRow.slug,
    roleName: roleRow.name,
    permissions: normalizePermissionMap(roleRow.permissions),
  };
});

export async function userHasPermission(
  user: SessionUserLike | { id: string },
  key: PermissionKey,
): Promise<boolean> {
  const access = await getEffectiveAccess(user.id);
  if (access.kind === "super_admin") return true;
  return access.permissions[key] === true;
}

/** Throws if the user lacks the permission (for server actions). */
export async function assertPermission(
  user: SessionUserLike | { id: string },
  key: PermissionKey,
  message?: string,
): Promise<void> {
  const ok = await userHasPermission(user, key);
  if (!ok) {
    throw new Error(message ?? "You do not have permission to perform this action");
  }
}

/**
 * Delete: `delete_items` allows any item; otherwise `delete_own_only` when
 * the caller created the resource (`createdBy` matches).
 */
export async function assertCanDelete(
  user: SessionUserLike | { id: string },
  createdBy?: string | null,
  message?: string,
): Promise<void> {
  if (await userHasPermission(user, "delete_items")) return;
  if (createdBy && createdBy === user.id && (await userHasPermission(user, "delete_own_only"))) {
    return;
  }
  throw new Error(message ?? "You do not have permission to delete this item");
}

/**
 * Trash access (restore / permanently delete) for a given space: Super Admins
 * and the space's own Admins (owner role) always have it, same as the rest of
 * the Trash panel; `manage_trash` additionally grants it platform-wide to
 * whatever role an admin chooses, independent of space ownership.
 */
export async function canManageTrash(user: SessionUserLike, spaceId: string): Promise<boolean> {
  const { getSpaceRole } = await import("@/lib/rbac");
  const role = await getSpaceRole(user.id, spaceId, user.platformRole);
  if (role === "owner") return true;
  return userHasPermission(user, "manage_trash");
}

/** Throws if the user cannot manage Trash for this space. */
export async function assertCanManageTrash(
  user: SessionUserLike,
  spaceId: string,
  message?: string,
): Promise<void> {
  if (await canManageTrash(user, spaceId)) return;
  throw new Error(message ?? "You do not have permission to manage Trash");
}

export async function listAssignablePermissionRoles(): Promise<
  { id: string; slug: string; name: string; isSystem: boolean }[]
> {
  const { ensureSystemPermissionRoles } = await import("@/modules/shell/actions/permissions");
  await ensureSystemPermissionRoles();
  const rows = await db
    .select({
      id: permissionRoles.id,
      slug: permissionRoles.slug,
      name: permissionRoles.name,
      isSystem: permissionRoles.isSystem,
      position: permissionRoles.position,
    })
    .from(permissionRoles)
    .orderBy(asc(permissionRoles.position), asc(permissionRoles.name));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    isSystem: r.isSystem,
  }));
}
