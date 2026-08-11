/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, groupRoleMappings, userGroupMemberships, users } from "@aitim/db";
import { and, asc, eq, exists, isNull, or, sql, type SQL } from "drizzle-orm";

/**
 * Who may appear in the directory, admin user list, and assignee pickers:
 *
 * 1. Protected (break-glass) admins
 * 2. Members of any Entra group mapped to a platform_role (intranet access)
 * 3. Legacy imported users (inactive accounts without an Entra id)
 *
 * Full-tenant Entra delta sync may create many users; only the above should be
 * visible in the product. When no platform_role mappings exist yet (fresh / local
 * dev), fall back to active users so the app stays usable.
 */

/** Inactive imported users retained so historical assignments remain readable. */
export function isLegacyImportedUserSql(): SQL {
  return and(
    isNull(users.entraObjectId),
    eq(users.isActive, false),
  )!;
}

/** User is in an Entra group that grants platform admin/member access. */
export function isPlatformAccessMemberSql(): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(userGroupMemberships)
      .innerJoin(
        groupRoleMappings,
        and(
          eq(groupRoleMappings.groupId, userGroupMemberships.groupId),
          eq(groupRoleMappings.targetType, "platform_role"),
        ),
      )
      .where(eq(userGroupMemberships.userId, users.id)),
  );
}

export async function hasPlatformRoleMappings(): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(groupRoleMappings)
    .where(eq(groupRoleMappings.targetType, "platform_role"));
  return (row?.n ?? 0) > 0;
}

/**
 * Eligibility for pickers (assignees, sharing add-user lists).
 * Active access-group members + protected admins + legacy imported users.
 */
export async function directoryPickerWhere(): Promise<SQL> {
  const gated = await hasPlatformRoleMappings();
  if (!gated) {
    // Dev / unconfigured: only active accounts (previous behavior).
    return eq(users.isActive, true);
  }
  return or(
    eq(users.isProtectedAdmin, true),
    isLegacyImportedUserSql(),
    and(eq(users.isActive, true), isPlatformAccessMemberSql()),
  )!;
}

/**
 * Eligibility for admin Users settings & directory pages.
 * Same set as pickers, but also includes inactive access-group members so
 * admins can re-enable them.
 */
export async function directoryAdminWhere(): Promise<SQL> {
  const gated = await hasPlatformRoleMappings();
  if (!gated) {
    return sql`true`;
  }
  return or(
    eq(users.isProtectedAdmin, true),
    isLegacyImportedUserSql(),
    isPlatformAccessMemberSql(),
  )!;
}

/** Active picker users (assignees, sharing, mentions). */
export async function listPickerUsers() {
  const where = await directoryPickerWhere();
  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      photoKey: users.photoKey,
      email: users.email,
    })
    .from(users)
    .where(where)
    .orderBy(asc(users.displayName));
}
