"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useCallback, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fetchTasksPage, saveListViewPrefs } from "../actions";
import type { TaskFilterCondition, TaskTypeMeta, TaskWithMeta } from "../queries";
import { FilterBar } from "./filter-bar";
import { ShowClosedToggle } from "./show-closed-toggle";
import { TaskTable } from "./task-table";

const TABLE_PAGE_SIZE = 200;

type StatusLike = { id: string; name: string; color: string; category?: string };
type FieldDefLike = {
  id: string;
  key: string;
  label: string;
  type: string;
  options: unknown;
};
type TagOption = { id: string; name: string; color: string };
type WritableListOption = {
  id: string;
  name: string;
  slug: string;
  spaceId: string;
  spaceName: string;
  spaceSlug: string;
};

/**
 * Client shell for the table list body: group-by / soft URL / task refetch
 * without a full RSC navigation (~1s SSR). Prefs save in the background.
 */
export function ListTasksShell({
  listId,
  viewId,
  initialGroupBy,
  initialItems,
  initialTotal,
  initialGroupCounts,
  conditions,
  statuses,
  fieldDefs,
  activeUsers,
  spaceTags = [],
  writableLists = [],
  taskTypes = [],
  showClosed,
  canEdit,
  initialColumnOrder,
  view,
  currentUserId,
}: {
  listId: string;
  viewId?: string;
  initialGroupBy: string;
  initialItems: TaskWithMeta[];
  initialTotal: number;
  initialGroupCounts: { key: string; count: number }[] | null;
  conditions: TaskFilterCondition[];
  statuses: StatusLike[];
  fieldDefs: FieldDefLike[];
  activeUsers: { id: string; displayName: string; photoKey: string | null }[];
  spaceTags?: TagOption[];
  writableLists?: WritableListOption[];
  taskTypes?: TaskTypeMeta[];
  showClosed: boolean;
  canEdit: boolean;
  initialColumnOrder?: string[];
  view: "table" | "board";
  currentUserId: string;
}) {
  const [groupBy, setGroupBy] = useState(initialGroupBy);
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [groupCounts, setGroupCounts] = useState(initialGroupCounts);
  const [busy, setBusy] = useState(false);
  const fetchGen = useRef(0);

  // Full navigation (filters, closed, list change) — take server snapshot.
  // Adjust-state-during-render instead of an effect.
  const [prevSnapshot, setPrevSnapshot] = useState({
    listId,
    initialGroupBy,
    initialItems,
    initialTotal,
    initialGroupCounts,
    showClosed,
    conditions,
  });
  if (
    prevSnapshot.listId !== listId ||
    prevSnapshot.initialGroupBy !== initialGroupBy ||
    prevSnapshot.initialItems !== initialItems ||
    prevSnapshot.initialTotal !== initialTotal ||
    prevSnapshot.initialGroupCounts !== initialGroupCounts ||
    prevSnapshot.showClosed !== showClosed ||
    prevSnapshot.conditions !== conditions
  ) {
    setPrevSnapshot({
      listId,
      initialGroupBy,
      initialItems,
      initialTotal,
      initialGroupCounts,
      showClosed,
      conditions,
    });
    setGroupBy(initialGroupBy);
    setItems(initialItems);
    setTotal(initialTotal);
    setGroupCounts(initialGroupCounts);
  }

  const applyGroupBy = useCallback(
    async (value: string) => {
      setGroupBy(value);

      // Soft URL update — no Next navigation / no full SSR.
      try {
        const params = new URLSearchParams(window.location.search);
        if (value) params.set("groupBy", value);
        else params.delete("groupBy");
        const qs = params.toString();
        const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
        window.history.replaceState(window.history.state, "", url);
      } catch {
        // ignore
      }

      // Persist view prefs without blocking the list (and without revalidatePath).
      void saveListViewPrefs(listId, { groupBy: value || "", viewId });

      const gen = ++fetchGen.current;
      setBusy(true);
      try {
        const page = await fetchTasksPage({
          listId,
          conditions,
          groupBy: value || undefined,
          limit: TABLE_PAGE_SIZE,
          offset: 0,
          showClosed,
          includeCounts: true,
        });
        if (gen !== fetchGen.current) return;
        setItems(page.items);
        if (page.total >= 0) setTotal(page.total);
        setGroupCounts(page.groupCounts);
      } catch {
        // Keep previous rows; user can refresh.
      } finally {
        if (gen === fetchGen.current) setBusy(false);
      }
    },
    [listId, viewId, conditions, showClosed],
  );

  const userNames = new Map(activeUsers.map((u) => [u.id, u.displayName]));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 items-center gap-2">
        <Badge variant="secondary" className={cn(busy && "opacity-70")}>
          {total} tasks
        </Badge>
        <FilterBar
          listId={listId}
          statuses={statuses}
          fieldDefs={fieldDefs}
          activeUsers={activeUsers}
          view={view}
          spaceTags={spaceTags}
          taskTypes={taskTypes}
          viewId={viewId}
          groupBy={groupBy}
          onGroupByChange={applyGroupBy}
        />
        <ShowClosedToggle showClosed={showClosed} listId={listId} viewId={viewId} />
        {busy && (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            Updating…
          </span>
        )}
      </div>

      <TaskTable
        items={items}
        totalCount={total}
        groupCounts={groupCounts}
        conditions={conditions}
        statuses={statuses}
        fieldDefs={fieldDefs}
        userNames={userNames}
        activeUsers={activeUsers}
        writableLists={writableLists}
        taskTypes={taskTypes}
        groupBy={groupBy || undefined}
        listId={listId}
        initialColumnOrder={initialColumnOrder}
        canEdit={canEdit}
        showClosed={showClosed}
        spaceTags={spaceTags}
        viewId={viewId}
        onGroupByChange={applyGroupBy}
        currentUserId={currentUserId}
      />
    </div>
  );
}
