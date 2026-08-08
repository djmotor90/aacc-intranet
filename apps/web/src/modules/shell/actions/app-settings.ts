/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use server";

import { db, entraGroups } from "@aitim/db";
import { asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  getSuperAgentAppSettings,
  setSuperAgentAppSettings,
  userCanCreateSuperAgent,
  type SuperAgentAppSettings,
} from "@/lib/app-settings";
import { requireAdmin } from "@/lib/rbac";

export type SuperAgentSettingsPanelData = {
  settings: SuperAgentAppSettings;
  groups: { id: string; displayName: string }[];
};

export async function getSuperAgentSettingsPanelData(): Promise<SuperAgentSettingsPanelData> {
  await requireAdmin();
  const [settings, groups] = await Promise.all([
    getSuperAgentAppSettings(),
    db
      .select({ id: entraGroups.id, displayName: entraGroups.displayName })
      .from(entraGroups)
      .orderBy(asc(entraGroups.displayName)),
  ]);
  return { settings, groups };
}

export async function saveSuperAgentAppSettings(input: {
  allowGroupCreate: boolean;
  createGroupIds: string[];
}): Promise<{ ok: true; settings: SuperAgentAppSettings } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    const settings = await setSuperAgentAppSettings({
      allowGroupCreate: input.allowGroupCreate,
      createGroupIds: input.createGroupIds,
    });
    revalidatePath("/");
    revalidatePath("/chat");
    revalidatePath("/chat/agents");
    return { ok: true, settings };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save" };
  }
}

/** Re-export for server-action callers that already use this module. */
export { userCanCreateSuperAgent };
