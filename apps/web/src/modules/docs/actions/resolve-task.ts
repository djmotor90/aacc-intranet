/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use server";

import { requireUser } from "@/lib/rbac";
import { resolveTaskEmbedMeta } from "@/modules/docs/queries";

/** Resolve a task number for TipTap task embeds (ACL: caller must have space access to the task). */
export async function resolveTaskForEmbed(taskNumber: string) {
  const user = await requireUser();
  return resolveTaskEmbedMeta(user, taskNumber);
}
