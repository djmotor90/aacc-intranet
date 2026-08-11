"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, entraGroups, groupRoleMappings, userGroupMemberships, users } from "@aitim/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enqueue, JOBS } from "@/lib/queue";
import { requireAdmin, requireUser, userOwnsAnySpace } from "@/lib/rbac";

export type AdminUserRow = {
  id: string;
  displayName: string;
  email: string;
  department: string | null;
  platformRole: "admin" | "member";
  isProtectedAdmin: boolean;
  isActive: boolean;
  photoKey: string | null;
  /** Last successful app sign-in (null if never signed in). */
  lastSignedInAt: string | null;
  /** Entra security groups this user is synced into (mapped only). */
  entraGroups: string[];
  /**
   * Super Admin from Entra Super Admin group mapping or protected break-glass.
   * Role cannot be changed in-app — only via Entra / protected flag.
   */
  roleLocked: boolean;
  roleLockReason: string | null;
  /** Security & Permissions membership role (Guest / Member / Admin / custom). */
  permissionRoleId: string | null;
  permissionRoleName: string | null;
  permissionRoleSlug: string | null;
};

export type AssignablePermissionRole = {
  id: string;
  slug: string;
  name: string;
  isSystem: boolean;
};

export type AdminGroupRow = { id: string; displayName: string };

export type AdminMappingRow = {
  id: string;
  role: string;
  targetType: string;
  groupName: string;
};

/** User IDs that belong to an Entra group mapped to platform Super Admin. */
async function entraSuperAdminUserIds(): Promise<Set<string>> {
  const rows = await db
    .select({ userId: userGroupMemberships.userId })
    .from(userGroupMemberships)
    .innerJoin(groupRoleMappings, eq(groupRoleMappings.groupId, userGroupMemberships.groupId))
    .where(
      and(
        eq(groupRoleMappings.targetType, "platform_role"),
        eq(groupRoleMappings.role, "admin"),
      ),
    );
  return new Set(rows.map((r) => r.userId));
}

export async function getAdminUsersData(): Promise<{
  users: AdminUserRow[];
  graphConfigured: boolean;
  permissionRoles: AssignablePermissionRole[];
}> {
  await requireAdmin();
  const { listAssignablePermissionRoles } = await import("@/lib/permissions");
  const permissionRolesList = await listAssignablePermissionRoles();
  const roleById = new Map(permissionRolesList.map((r) => [r.id, r]));
  const memberRoleId = permissionRolesList.find((r) => r.slug === "member")?.id ?? null;

  // Only Hub-eligible people: Entra access-group members, protected admins,
  // and inactive legacy imports retained for historical assignments.
  const { directoryAdminWhere } = await import("@/lib/directory-users");
  const where = await directoryAdminWhere();
  const rows = await db.select().from(users).where(where).orderBy(asc(users.displayName));
  const ids = rows.map((u) => u.id);
  const superAdminIds = await entraSuperAdminUserIds();

  // Only groups we map for platform access (Super Admin / Member) — ignore the rest of Entra.
  const groupRows =
    ids.length > 0
      ? await db
          .select({
            userId: userGroupMemberships.userId,
            groupName: entraGroups.displayName,
            mappingRole: groupRoleMappings.role,
          })
          .from(userGroupMemberships)
          .innerJoin(entraGroups, eq(entraGroups.id, userGroupMemberships.groupId))
          .innerJoin(
            groupRoleMappings,
            and(
              eq(groupRoleMappings.groupId, entraGroups.id),
              eq(groupRoleMappings.targetType, "platform_role"),
            ),
          )
          .where(inArray(userGroupMemberships.userId, ids))
      : [];

  const groupsByUser = new Map<string, string[]>();
  for (const g of groupRows) {
    const list = groupsByUser.get(g.userId) ?? [];
    const label =
      g.mappingRole === "admin"
        ? `${g.groupName} (Super Admin)`
        : g.mappingRole === "member"
          ? `${g.groupName} (Member)`
          : g.groupName;
    if (!list.includes(label)) list.push(label);
    groupsByUser.set(g.userId, list);
  }

  return {
    graphConfigured: !!process.env.DAEMON_CLIENT_ID,
    permissionRoles: permissionRolesList,
    users: rows.map((u) => {
      const viaEntraSuper = superAdminIds.has(u.id);
      const roleLocked = u.isProtectedAdmin || viaEntraSuper;
      let roleLockReason: string | null = null;
      if (u.isProtectedAdmin) roleLockReason = "Protected break-glass Super Admin";
      else if (viaEntraSuper) roleLockReason = "Assigned via Entra Super Admin group — manage in Entra ID";

      const prId = roleLocked ? null : (u.permissionRoleId ?? memberRoleId);
      const pr = prId ? roleById.get(prId) : null;

      return {
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        department: u.department,
        platformRole: u.platformRole,
        isProtectedAdmin: u.isProtectedAdmin,
        isActive: u.isActive,
        photoKey: u.photoKey,
        lastSignedInAt: u.lastSignedInAt
          ? u.lastSignedInAt.toISOString().slice(0, 16).replace("T", " ")
          : null,
        entraGroups: groupsByUser.get(u.id) ?? [],
        roleLocked,
        roleLockReason,
        permissionRoleId: prId,
        permissionRoleName: roleLocked ? "Super Admin (full access)" : (pr?.name ?? "Member"),
        permissionRoleSlug: roleLocked ? "super_admin" : (pr?.slug ?? "member"),
      };
    }),
  };
}

export async function getAdminGroupsData(): Promise<{
  groups: AdminGroupRow[];
  mappings: AdminMappingRow[];
}> {
  await requireAdmin();
  const groups = await db
    .select({ id: entraGroups.id, displayName: entraGroups.displayName })
    .from(entraGroups)
    .orderBy(asc(entraGroups.displayName));
  const mappings = await db
    .select({
      id: groupRoleMappings.id,
      role: groupRoleMappings.role,
      targetType: groupRoleMappings.targetType,
      groupName: entraGroups.displayName,
    })
    .from(groupRoleMappings)
    .innerJoin(entraGroups, eq(groupRoleMappings.groupId, entraGroups.id));
  return { groups, mappings };
}

export async function triggerEntraSync() {
  await requireAdmin();
  await enqueue(JOBS.syncEntra);
  await enqueue("sync-group-catalog");
  await enqueue(JOBS.syncPhotos);
  revalidatePath("/admin/users");
}

const mappingSchema = z.object({
  groupId: z.string().uuid(),
  role: z.enum(["admin", "member"]),
});

export async function createPlatformRoleMapping(formData: FormData) {
  await requireAdmin();
  const parsed = mappingSchema.parse({
    groupId: formData.get("groupId"),
    role: formData.get("role"),
  });
  await db.insert(groupRoleMappings).values({
    groupId: parsed.groupId,
    targetType: "platform_role",
    role: parsed.role,
  });
  revalidatePath("/admin/groups");
}

export async function deleteRoleMapping(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  await db.delete(groupRoleMappings).where(eq(groupRoleMappings.id, id));
  revalidatePath("/admin/groups");
}

/** Paginated enterprise audit logs (Super Admin). */
export async function getAdminAuditLogs(params?: {
  category?: string;
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  await requireAdmin();
  const { queryAuditLogs, AUDIT_CATEGORIES } = await import("@/lib/audit");
  const category =
    params?.category &&
    (params.category === "all" ||
      (AUDIT_CATEGORIES as readonly string[]).includes(params.category))
      ? (params.category as "all" | (typeof AUDIT_CATEGORIES)[number])
      : "all";
  const status =
    params?.status === "success" ||
    params?.status === "failure" ||
    params?.status === "denied" ||
    params?.status === "all"
      ? params.status
      : "all";
  return queryAuditLogs({
    category,
    status,
    q: params?.q,
    limit: params?.limit,
    offset: params?.offset,
  });
}

/**
 * Trash, scoped to what the caller can manage: Super Admins see everything;
 * space Admins (owner role) and `manage_trash` permission holders see spaces
 * they're allowed to manage.
 */
export async function getAdminTrashData(): Promise<{
  items: {
    kind: "space" | "folder" | "list" | "task" | "custom_field";
    id: string;
    name: string;
    deletedAt: string;
    spaceId: string;
    spaceName: string;
    spaceSlug: string;
    parentName: string | null;
    listId?: string;
    listSlug?: string;
    taskNumber?: string;
  }[];
}> {
  const user = await requireUser();
  const { userHasPermission } = await import("@/lib/permissions");
  const isSuperAdmin = user.platformRole === "admin";
  const canManage =
    isSuperAdmin ||
    (await userOwnsAnySpace(user.id, user.platformRole)) ||
    (await userHasPermission(user, "manage_trash"));
  if (!canManage) {
    throw new Error("You do not have permission to manage Trash");
  }

  const { getTrashItemsForUser } = await import("@/modules/tasks/queries");
  const items = await getTrashItemsForUser(user, { scope: isSuperAdmin ? "all" : "managed" });
  return {
    items: items.map((i) => ({
      ...i,
      deletedAt: i.deletedAt.toISOString(),
    })),
  };
}

export async function toggleUserActive(formData: FormData) {
  const admin = await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  if (id === admin.id) return; // don't deactivate yourself
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user || user.isProtectedAdmin) return;

  // Super Admins from Entra mapping: access is controlled only via Entra membership.
  const superIds = await entraSuperAdminUserIds();
  if (superIds.has(id)) {
    throw new Error(
      "This Super Admin is managed by Entra group mapping. Remove them from the Super Admin group in Entra ID instead.",
    );
  }

  await db
    .update(users)
    .set({
      isActive: !user.isActive,
      deactivatedAt: user.isActive ? new Date() : null,
    })
    .where(eq(users.id, id));
  revalidatePath("/admin/users");
  revalidatePath("/");
}

/**
 * Assign a Security & Permissions role (Guest / Member / Admin / custom) to a user.
 * Super Admin (Entra Super Admin group or protected) cannot be changed here —
 * only via Entra / break-glass. Super Admin is not a selectable membership role.
 */
export async function setUserMembershipRole(params: {
  userId: string;
  permissionRoleId: string;
}) {
  const admin = await requireAdmin();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(admin, "manage_users", "You cannot manage user memberships");

  const userId = z.string().uuid().parse(params.userId);
  const permissionRoleId = z.string().uuid().parse(params.permissionRoleId);

  if (userId === admin.id) {
    throw new Error("You cannot change your own membership role here");
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error("User not found");

  if (user.isProtectedAdmin) {
    throw new Error("Protected Super Admin membership cannot be changed in the app");
  }

  const superIds = await entraSuperAdminUserIds();
  if (superIds.has(userId)) {
    throw new Error(
      "This Super Admin is assigned via Entra group mapping. Change membership in Entra ID, then sync.",
    );
  }

  const { permissionRoles } = await import("@aitim/db");
  const [role] = await db
    .select()
    .from(permissionRoles)
    .where(eq(permissionRoles.id, permissionRoleId))
    .limit(1);
  if (!role) throw new Error("Permission role not found");

  const prevId = user.permissionRoleId;
  if (prevId === permissionRoleId) return;

  await db
    .update(users)
    .set({
      permissionRoleId,
      // Keep platform_role as member for non–Super-Admins (god mode only via Entra).
      platformRole: "member",
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  try {
    const { writeAuditLog } = await import("@/lib/audit");
    await writeAuditLog({
      category: "user",
      eventType: "USER_MEMBERSHIP_ROLE_CHANGED",
      title: "User Membership Role Changed",
      eventStatus: "success",
      actorId: admin.id,
      targetType: "user",
      targetId: userId,
      targetLabel: user.displayName,
      payload: {
        fromPermissionRoleId: prevId,
        toPermissionRoleId: permissionRoleId,
        toRoleSlug: role.slug,
        toRoleName: role.name,
      },
    });
  } catch {
    // ignore audit failures
  }

  revalidatePath("/admin/users");
  revalidatePath("/");
}
