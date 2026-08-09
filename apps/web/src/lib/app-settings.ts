/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { userHasPermission } from "@/lib/permissions";
import { requireUser } from "@/lib/rbac";

/**
 * Whether the current (or given) user may create Super Agents.
 * Backed by the `create_super_agents` permission in Security & Permissions —
 * Super Admins always pass (userHasPermission's super_admin bypass); everyone
 * else needs their role's toggle on, same as Export/Delete/etc.
 */
export async function userCanCreateSuperAgent(userId?: string): Promise<boolean> {
  const id = userId ?? (await requireUser()).id;
  return userHasPermission({ id }, "create_super_agents");
}
