/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Lightweight app-wide settings stored in `sync_state` (key/value JSON).
 */
import { db, syncState, userGroupMemberships, users } from "@aitim/db";
import { and, eq, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/rbac";

export const SUPER_AGENT_SETTINGS_KEY = "app_settings.super_agents";

export type SuperAgentAppSettings = {
  /**
   * When true, members of `createGroupIds` may create Super Agents.
   * Platform Super Admins always may create, regardless of this flag.
   */
  allowGroupCreate: boolean;
  /** Internal `entra_groups.id` UUIDs */
  createGroupIds: string[];
};

export const DEFAULT_SUPER_AGENT_SETTINGS: SuperAgentAppSettings = {
  allowGroupCreate: false,
  createGroupIds: [],
};

export function parseSuperAgentSettings(raw: unknown): SuperAgentAppSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SUPER_AGENT_SETTINGS };
  const o = raw as Record<string, unknown>;
  const ids = Array.isArray(o.createGroupIds)
    ? o.createGroupIds.filter((x): x is string => typeof x === "string")
    : [];
  return {
    allowGroupCreate: o.allowGroupCreate === true,
    createGroupIds: ids,
  };
}

export async function getSuperAgentAppSettings(): Promise<SuperAgentAppSettings> {
  const [row] = await db
    .select()
    .from(syncState)
    .where(eq(syncState.key, SUPER_AGENT_SETTINGS_KEY))
    .limit(1);
  if (!row) return { ...DEFAULT_SUPER_AGENT_SETTINGS };
  return parseSuperAgentSettings(row.value);
}

export async function setSuperAgentAppSettings(
  next: SuperAgentAppSettings,
): Promise<SuperAgentAppSettings> {
  const value: SuperAgentAppSettings = {
    allowGroupCreate: next.allowGroupCreate === true,
    createGroupIds: [...new Set(next.createGroupIds.filter(Boolean))],
  };
  await db
    .insert(syncState)
    .values({ key: SUPER_AGENT_SETTINGS_KEY, value })
    .onConflictDoUpdate({
      target: syncState.key,
      set: { value, updatedAt: new Date() },
    });
  return value;
}

/**
 * Whether the current (or given) user may create Super Agents.
 * Super Admins always can; others need the settings toggle + group membership.
 */
export async function userCanCreateSuperAgent(userId?: string): Promise<boolean> {
  const user = userId
    ? (
        await db
          .select({ id: users.id, platformRole: users.platformRole })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
      )[0]
    : await requireUser().then(async (u) => {
        const [row] = await db
          .select({ id: users.id, platformRole: users.platformRole })
          .from(users)
          .where(eq(users.id, u.id))
          .limit(1);
        return row;
      });

  if (!user) return false;
  if (user.platformRole === "admin") return true;

  const settings = await getSuperAgentAppSettings();
  if (!settings.allowGroupCreate || settings.createGroupIds.length === 0) return false;

  const [hit] = await db
    .select({ groupId: userGroupMemberships.groupId })
    .from(userGroupMemberships)
    .where(
      and(
        eq(userGroupMemberships.userId, user.id),
        inArray(userGroupMemberships.groupId, settings.createGroupIds),
      ),
    )
    .limit(1);

  return Boolean(hit);
}
