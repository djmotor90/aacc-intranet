"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, permissionRoles } from "@aitim/db";
import { and, asc, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ALL_PERMISSION_KEYS,
  normalizePermissionMap,
  SYSTEM_ROLE_DEFAULTS,
  type PermissionKey,
  type PermissionMap,
} from "@/lib/permissions-catalog";
import { requireAdmin } from "@/lib/rbac";

export type PermissionRoleRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  position: string;
  permissions: PermissionMap;
};

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "role"
  );
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let candidate = base;
  let n = 2;
   
  while (true) {
    const existing = await db
      .select({ id: permissionRoles.id })
      .from(permissionRoles)
      .where(
        and(
          eq(permissionRoles.slug, candidate),
          excludeId ? ne(permissionRoles.id, excludeId) : undefined,
        ),
      );
    if (existing.length === 0) return candidate;
    candidate = `${base}-${n++}`;
  }
}

/** Ensure system roles exist with at least default permissions. Idempotent. */
export async function ensureSystemPermissionRoles(): Promise<void> {
  for (const [slug, def] of Object.entries(SYSTEM_ROLE_DEFAULTS)) {
    const [existing] = await db
      .select({ id: permissionRoles.id, name: permissionRoles.name })
      .from(permissionRoles)
      .where(eq(permissionRoles.slug, slug));
    if (existing) {
      // Keep toggled permissions; sync display name/description (e.g. Owner → Admin).
      await db
        .update(permissionRoles)
        .set({
          name: def.name,
          description: def.description,
          updatedAt: new Date(),
        })
        .where(eq(permissionRoles.id, existing.id));
      continue;
    }
    await db.insert(permissionRoles).values({
      slug,
      name: def.name,
      description: def.description,
      isSystem: true,
      position: def.position,
      permissions: def.permissions,
    });
  }
}

export async function getPermissionRolesData(): Promise<{ roles: PermissionRoleRow[] }> {
  await requireAdmin();
  await ensureSystemPermissionRoles();
  const rows = await db
    .select()
    .from(permissionRoles)
    .orderBy(asc(permissionRoles.position), asc(permissionRoles.name));
  return {
    roles: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      position: r.position,
      permissions: normalizePermissionMap(r.permissions),
    })),
  };
}

export async function setRolePermission(params: {
  roleId: string;
  permission: PermissionKey;
  enabled: boolean;
}) {
  await requireAdmin();
  const roleId = z.string().uuid().parse(params.roleId);
  const permission = z.enum(ALL_PERMISSION_KEYS as [PermissionKey, ...PermissionKey[]]).parse(
    params.permission,
  );
  const enabled = z.boolean().parse(params.enabled);

  const [role] = await db.select().from(permissionRoles).where(eq(permissionRoles.id, roleId));
  if (!role) throw new Error("Role not found");

  const permissions = normalizePermissionMap(role.permissions);
  permissions[permission] = enabled;

  // manage_custom_fields implies create + edit when turned on
  if (permission === "manage_custom_fields" && enabled) {
    permissions.create_custom_fields = true;
    permissions.edit_custom_fields = true;
  }

  await db
    .update(permissionRoles)
    .set({ permissions, updatedAt: new Date() })
    .where(eq(permissionRoles.id, roleId));

  revalidatePermissionPaths();
}

function revalidatePermissionPaths() {
  revalidatePath("/");
  revalidatePath("/admin/users");
  revalidatePath("/settings");
}

export async function createCustomRole(params: { name: string; description?: string }) {
  await requireAdmin();
  const name = z.string().min(1).max(60).parse(params.name.trim());
  const description = params.description?.trim()
    ? z.string().max(200).parse(params.description.trim())
    : null;

  const baseSlug = slugify(name);
  if (baseSlug in SYSTEM_ROLE_DEFAULTS) {
    throw new Error("That name is reserved for a system role");
  }
  const slug = await uniqueSlug(baseSlug);

  // Place after existing roles
  const existing = await db
    .select({ position: permissionRoles.position })
    .from(permissionRoles)
    .orderBy(asc(permissionRoles.position));
  const position = `a${existing.length}`;

  // Start from member defaults as a sensible custom baseline
  const permissions = { ...SYSTEM_ROLE_DEFAULTS.member.permissions };

  const [created] = await db
    .insert(permissionRoles)
    .values({
      slug,
      name,
      description,
      isSystem: false,
      position,
      permissions,
    })
    .returning({ id: permissionRoles.id });

  revalidatePermissionPaths();
  return { id: created!.id };
}

export async function renameCustomRole(params: {
  roleId: string;
  name: string;
  description?: string | null;
}) {
  await requireAdmin();
  const roleId = z.string().uuid().parse(params.roleId);
  const name = z.string().min(1).max(60).parse(params.name.trim());
  const description =
    params.description === undefined || params.description === null
      ? params.description ?? null
      : z.string().max(200).parse(params.description.trim());

  const [role] = await db.select().from(permissionRoles).where(eq(permissionRoles.id, roleId));
  if (!role) throw new Error("Role not found");
  if (role.isSystem) throw new Error("System roles cannot be renamed");

  await db
    .update(permissionRoles)
    .set({ name, description, updatedAt: new Date() })
    .where(eq(permissionRoles.id, roleId));
  revalidatePermissionPaths();
}

export async function deleteCustomRole(roleId: string) {
  await requireAdmin();
  const id = z.string().uuid().parse(roleId);
  const [role] = await db.select().from(permissionRoles).where(eq(permissionRoles.id, id));
  if (!role) throw new Error("Role not found");
  if (role.isSystem) throw new Error("System roles cannot be deleted");

  // Reassign users on this role to system Member so membership stays valid.
  const { users } = await import("@aitim/db");
  const [member] = await db
    .select({ id: permissionRoles.id })
    .from(permissionRoles)
    .where(eq(permissionRoles.slug, "member"))
    .limit(1);
  if (member) {
    await db
      .update(users)
      .set({ permissionRoleId: member.id, updatedAt: new Date() })
      .where(eq(users.permissionRoleId, id));
  }

  await db.delete(permissionRoles).where(eq(permissionRoles.id, id));
  revalidatePermissionPaths();
}

export async function resetSystemRoleDefaults(roleId: string) {
  await requireAdmin();
  const id = z.string().uuid().parse(roleId);
  const [role] = await db.select().from(permissionRoles).where(eq(permissionRoles.id, id));
  if (!role) throw new Error("Role not found");
  if (!role.isSystem) throw new Error("Only system roles have defaults");
  const def = SYSTEM_ROLE_DEFAULTS[role.slug as keyof typeof SYSTEM_ROLE_DEFAULTS];
  if (!def) throw new Error("No defaults for this role");
  await db
    .update(permissionRoles)
    .set({
      name: def.name,
      description: def.description,
      permissions: def.permissions,
      updatedAt: new Date(),
    })
    .where(eq(permissionRoles.id, id));
  revalidatePermissionPaths();
}
