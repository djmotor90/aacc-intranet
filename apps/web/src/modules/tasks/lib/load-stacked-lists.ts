/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { getListRole } from "@/lib/rbac";
import type { StackedListBundle } from "../components/stacked-lists-view";
import {
  getFieldDefinitions,
  getStatusesForList,
  getTasksPage,
  type ListNavNode,
} from "../queries";

const PER_LIST_LIMIT = 100;

export async function loadStackedListBundles(
  lists: ListNavNode[],
  userId: string,
  platformRole: string | undefined,
): Promise<StackedListBundle[]> {
  const bundles: StackedListBundle[] = [];
  for (const list of lists.slice(0, 40)) {
    const role = await getListRole(userId, list.id, platformRole);
    if (!role) continue;
    const [page, statuses, fieldDefs] = await Promise.all([
      getTasksPage({ listId: list.id, groupBy: "status", limit: PER_LIST_LIMIT, offset: 0 }),
      getStatusesForList(list.id),
      getFieldDefinitions(list.id),
    ]);
    bundles.push({
      list,
      items: page.items,
      total: page.total,
      groupCounts: page.groupCounts,
      statuses: statuses.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        category: s.category,
      })),
      fieldDefs: fieldDefs.map((d) => ({
        id: d.id,
        key: d.key,
        label: d.label,
        type: d.type,
        options: d.options,
        isRequired: Boolean(d.isRequired),
      })),
      canEdit: role === "owner" || role === "member",
    });
  }
  return bundles;
}
