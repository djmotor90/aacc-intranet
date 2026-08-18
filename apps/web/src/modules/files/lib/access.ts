/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { getSpaceRole, type SpaceRole } from "@/lib/rbac";
import type { SessionUserLike } from "@/modules/types";

export async function assertSpaceAccess(
  user: SessionUserLike,
  spaceId: string,
  minRole: SpaceRole = "guest",
) {
  const role = await getSpaceRole(user.id, spaceId, user.platformRole);
  if (!role) throw new Error("You do not have access to this space");
  const rank = { guest: 1, member: 2, owner: 3 } as const;
  if (rank[role] < rank[minRole]) throw new Error("You cannot change files here");
  return role;
}

export function canEditFiles(role: SpaceRole | null, platformRole: string) {
  return platformRole === "admin" || role === "member" || role === "owner";
}
