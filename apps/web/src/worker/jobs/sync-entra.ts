/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  db,
  entraGroups,
  groupRoleMappings,
  spaceMembers,
  syncState,
  userGroupMemberships,
  users,
} from "@aitim/db";
import { eq, inArray, isNotNull, sql } from "drizzle-orm";
import { collectPaged, graphFetch, type GraphUser } from "@/lib/graph/app-client";

async function getDeltaLink(): Promise<string | null> {
  const [row] = await db.select().from(syncState).where(eq(syncState.key, "users_delta_link"));
  return (row?.value as { url?: string })?.url ?? null;
}

async function saveDeltaLink(url: string) {
  await db
    .insert(syncState)
    .values({ key: "users_delta_link", value: { url } })
    .onConflictDoUpdate({ target: syncState.key, set: { value: { url } } });
}

async function syncUsers() {
  const startUrl =
    (await getDeltaLink()) ??
    "/users/delta?$select=id,displayName,mail,userPrincipalName,jobTitle,department,accountEnabled";
  const { values, deltaLink } = await collectPaged<GraphUser>(startUrl);

  for (const gu of values) {
    if (gu["@removed"]) {
      await db
        .update(users)
        .set({ isActive: false, deactivatedAt: new Date() })
        .where(eq(users.entraObjectId, gu.id));
      continue;
    }
    const email = gu.mail ?? gu.userPrincipalName;
    if (!email) continue;
    const values_ = {
      email,
      displayName: gu.displayName ?? email,
      jobTitle: gu.jobTitle ?? null,
      department: gu.department ?? null,
      // Don't flip access here — deactivate/reactivate based on group membership below.
      // Still record Graph accountEnabled for debugging via lastSyncedAt.
      lastSyncedAt: new Date(),
    };
    await db
      .insert(users)
      .values({
        entraObjectId: gu.id,
        ...values_,
        // New rows start inactive until group membership confirms access.
        isActive: false,
      })
      .onConflictDoUpdate({
        target: users.entraObjectId,
        // Never re-activate everyone via delta; membership step owns is_active.
        set: values_,
      });
  }
  if (deltaLink) await saveDeltaLink(deltaLink);
  return values.length;
}

/**
 * Ensure every Graph member OID exists as a local user row (create if missing).
 * Group membership sync previously only linked OIDs already in `users`, so people
 * who were only in a security group never appeared after the first full delta.
 */
async function ensureUsersForOids(oids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>(); // oid -> user id
  if (oids.length === 0) return map;

  const existing = await db
    .select({ id: users.id, entraObjectId: users.entraObjectId })
    .from(users)
    .where(inArray(users.entraObjectId, oids));
  for (const row of existing) {
    if (row.entraObjectId) map.set(row.entraObjectId, row.id);
  }

  const missing = oids.filter((oid) => !map.has(oid));
  for (const oid of missing) {
    try {
      const res = await graphFetch(
        `/users/${oid}?$select=id,displayName,mail,userPrincipalName,jobTitle,department,accountEnabled`,
      );
      if (!res.ok) {
        console.warn(`[sync-entra] failed to fetch user ${oid}: ${res.status}`);
        continue;
      }
      const gu = (await res.json()) as GraphUser;
      const email = gu.mail ?? gu.userPrincipalName;
      if (!email) continue;
      const [created] = await db
        .insert(users)
        .values({
          entraObjectId: gu.id,
          email,
          displayName: gu.displayName ?? email,
          jobTitle: gu.jobTitle ?? null,
          department: gu.department ?? null,
          isActive: false,
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: users.entraObjectId,
          set: {
            email,
            displayName: gu.displayName ?? email,
            jobTitle: gu.jobTitle ?? null,
            department: gu.department ?? null,
            lastSyncedAt: new Date(),
          },
        })
        .returning({ id: users.id, entraObjectId: users.entraObjectId });
      if (created?.entraObjectId) map.set(created.entraObjectId, created.id);
    } catch (err) {
      console.warn(`[sync-entra] ensure user ${oid} failed`, err);
    }
  }
  return map;
}

async function syncGroupMemberships(): Promise<{ groups: number; memberships: number; details: string[] }> {
  // Groups referenced by role mappings or space membership are the ones we track.
  const mapped = await db
    .select({ groupId: groupRoleMappings.groupId })
    .from(groupRoleMappings);
  const spaceGroups = await db
    .select({ groupId: spaceMembers.groupId })
    .from(spaceMembers)
    .where(isNotNull(spaceMembers.groupId));
  const groupIds = [
    ...new Set([...mapped.map((r) => r.groupId), ...spaceGroups.map((r) => r.groupId!)]),
  ];
  if (groupIds.length === 0) {
    return { groups: 0, memberships: 0, details: ["no mapped groups"] };
  }

  const groups = await db.select().from(entraGroups).where(inArray(entraGroups.id, groupIds));
  let totalMemberships = 0;
  const details: string[] = [];

  for (const group of groups) {
    // Prefer direct members first; transitive can pull nested groups with ConsistencyLevel.
    let values: GraphUser[] = [];
    try {
      const page = await collectPaged<GraphUser>(
        `/groups/${group.entraGroupId}/members/microsoft.graph.user?$select=id,displayName,mail,userPrincipalName&$top=999`,
      );
      values = page.values;
    } catch (err) {
      console.warn(`[sync-entra] members failed for ${group.displayName}, trying transitive`, err);
      const page = await collectPaged<GraphUser>(
        `/groups/${group.entraGroupId}/transitiveMembers/microsoft.graph.user?$select=id,displayName,mail,userPrincipalName&$top=999`,
      );
      values = page.values;
    }

    const memberOids = [...new Set(values.map((m) => m.id).filter(Boolean))];
    const oidToUserId = await ensureUsersForOids(memberOids);
    const memberUserIds = [...new Set(memberOids.map((oid) => oidToUserId.get(oid)).filter(Boolean))] as string[];

    await db.transaction(async (tx) => {
      await tx.delete(userGroupMemberships).where(eq(userGroupMemberships.groupId, group.id));
      if (memberUserIds.length > 0) {
        await tx
          .insert(userGroupMemberships)
          .values(memberUserIds.map((userId) => ({ userId, groupId: group.id })))
          .onConflictDoNothing();
      }
      await tx
        .update(entraGroups)
        .set({ lastSyncedAt: new Date() })
        .where(eq(entraGroups.id, group.id));
    });

    totalMemberships += memberUserIds.length;
    details.push(`${group.displayName}=${memberUserIds.length}`);
    console.log(
      `[sync-entra] group "${group.displayName}": graph=${memberOids.length} linked=${memberUserIds.length}`,
    );
  }
  return { groups: groups.length, memberships: totalMemberships, details };
}

async function recomputePlatformRoles() {
  // Prefer admin over member when a user is in multiple mapped groups.
  // (String MAX would pick "member" over "admin" lexicographically — wrong.)
  await db.execute(sql`
    update users u set platform_role = coalesce(sub.role, 'member')::platform_role
    from (
      select u2.id,
        case
          when bool_or(m.role = 'admin') then 'admin'
          when bool_or(m.role = 'member') then 'member'
          else null
        end as role
      from users u2
      left join user_group_memberships ugm on ugm.user_id = u2.id
      left join group_role_mappings m
        on m.group_id = ugm.group_id and m.target_type = 'platform_role'
      group by u2.id
    ) sub
    where sub.id = u.id
      and u.is_protected_admin = false
      and u.platform_role is distinct from coalesce(sub.role, 'member')::platform_role
  `);
}

/**
 * Deactivate users who are no longer members of any group that grants intranet
 * access (i.e. any group with a platform_role mapping). This runs after group
 * memberships are synced so the data is fresh.
 *
 * Only runs when at least one platform_role mapping exists — prevents
 * accidentally deactivating everyone on a fresh install with no mappings yet.
 * Never touches ClickUp import placeholders or protected admins.
 */
async function deactivateNonMembers() {
  const result = await db.execute<{ count: string }>(sql`
    select count(*)::text as count from group_role_mappings where target_type = 'platform_role'
  `);
  if (Number(result.rows[0]?.count ?? 0) === 0) return 0;

  const deactivated = await db.execute<{ id: string }>(sql`
    update users u
    set is_active = false, deactivated_at = now()
    where u.is_active = true
      and u.is_protected_admin = false
      and u.entra_object_id is not null
      and not exists (
        select 1
        from user_group_memberships ugm
        join group_role_mappings m on m.group_id = ugm.group_id
        where ugm.user_id = u.id
          and m.target_type = 'platform_role'
      )
    returning u.id
  `);
  return deactivated.rows?.length ?? 0;
}

/**
 * Reactivate users who regained access, i.e. are now members of a group that
 * grants a platform_role but were previously deactivated.
 */
async function reactivateMembers() {
  const reactivated = await db.execute<{ id: string }>(sql`
    update users u
    set is_active = true, deactivated_at = null
    where u.is_active = false
      and u.is_protected_admin = false
      and exists (
        select 1
        from user_group_memberships ugm
        join group_role_mappings m on m.group_id = ugm.group_id
        where ugm.user_id = u.id
          and m.target_type = 'platform_role'
      )
    returning u.id
  `);
  return reactivated.rows?.length ?? 0;
}

export async function runSyncEntra(): Promise<string> {
  const userCount = await syncUsers();
  const { groups, memberships, details } = await syncGroupMemberships();
  await recomputePlatformRoles();
  const deactivated = await deactivateNonMembers();
  const reactivated = await reactivateMembers();
  return (
    `delta=${userCount}, groups=${groups}, memberships=${memberships}` +
    ` [${details.join(", ")}], reactivated=${reactivated}, deactivated=${deactivated}`
  );
}

/** Import all tenant groups (id + name) so admins can pick them in mappings. */
export async function runSyncGroupCatalog(): Promise<number> {
  const { values } = await collectPaged<{ id: string; displayName: string }>(
    "/groups?$select=id,displayName&$filter=securityEnabled eq true",
  );
  for (const g of values) {
    await db
      .insert(entraGroups)
      .values({ entraGroupId: g.id, displayName: g.displayName })
      .onConflictDoUpdate({
        target: entraGroups.entraGroupId,
        set: { displayName: g.displayName },
      });
  }
  return values.length;
}
