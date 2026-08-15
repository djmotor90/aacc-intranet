/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Suspense } from "react";
import { Settings } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getListRole, getSpaceRole, requireUser } from "@/lib/rbac";
import { Board } from "@/modules/tasks/components/board";
import { EntityIcon } from "@/modules/tasks/components/entity-icon";
import { type FilterCondition } from "@/modules/tasks/components/filter-bar";
import { FormViewPanel } from "@/modules/tasks/components/form-view-panel";
import { ListLiveRefresh } from "@/modules/tasks/components/list-live-refresh";
import { ListTasksShell } from "@/modules/tasks/components/list-tasks-shell";
import { ListViewTabs } from "@/modules/tasks/components/list-view-tabs";
import { NewTaskDialog } from "@/modules/tasks/components/new-task-dialog";
import { ShowClosedToggle } from "@/modules/tasks/components/show-closed-toggle";
import { TaskGrid } from "@/modules/tasks/components/task-grid";
import { parseRequiredCoreFields } from "@/modules/tasks/lib/required-fields";
import {
  countFormSubmissions,
  ensureListViews,
  getActiveUsers,
  getFieldDefinitions,
  getFormByViewId,
  getListBySlug,
  getSpaceBySlug,
  getStatusesForList,
  getTagsForSpace,
  getTeamsWithListAccess,
  getTasksPage,
  getTaskTypesForSpace,
  getWritableListsForUser,
  type ListViewRow,
} from "@/modules/tasks/queries";

const TABLE_PAGE_SIZE = 200;
/** Board renders every card at once, so it gets a hard cap. */
const BOARD_LIMIT = 1000;

function parseFilters(raw: string | undefined, fallback: unknown): FilterCondition[] {
  try {
    if (raw) return JSON.parse(raw) as FilterCondition[];
  } catch {
    // malformed URL JSON
  }
  if (Array.isArray(fallback)) return fallback as FilterCondition[];
  return [];
}

export default async function ListPage(props: {
  params: Promise<{ spaceSlug: string; listSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { spaceSlug, listSlug } = await props.params;
  const sp = await props.searchParams;

  const user = await requireUser();
  const space = await getSpaceBySlug(spaceSlug);
  if (!space) notFound();
  const list = await getListBySlug(space.id, listSlug);
  if (!list) notFound();
  const role = await getListRole(user.id, list.id, user.platformRole);
  if (!role) notFound();
  const canEdit = role === "owner" || role === "member";
  const isSpaceOwner = (await getSpaceRole(user.id, space.id, user.platformRole)) === "owner";

  // Seed List and Board named views if the list has none yet.
  const views = await ensureListViews(list.id);
  if (views.length === 0) notFound();

  const activeView: ListViewRow =
    (sp.v ? views.find((v) => v.id === sp.v) : undefined) ?? views[0];

  // URL overrides for the active view's stored settings (so live filters work
  // without waiting for a save). When no override is present, use the view.
  const view: "table" | "board" | "form" | "grid" =
    sp.view === "board" || sp.view === "table" || sp.view === "form" || sp.view === "grid"
      ? sp.view
      : activeView.type;

  const isFormView = view === "form" || activeView.type === "form";

  const conditions = parseFilters(
    sp.filters,
    // Only use stored filters when the URL didn't supply an explicit filters param.
    sp.filters === undefined ? activeView.filters : undefined,
  );

  const groupBy =
    sp.groupBy !== undefined
      ? sp.groupBy
      : (activeView.groupBy ?? list.defaultGroupBy ?? "");

  const showClosed =
    sp.closed !== undefined
      ? sp.closed === "1" || sp.closed === "true"
      : activeView.showClosed;

  const columnOrder =
    (activeView.tableColumnOrder as string[] | null) ??
    (list.tableColumnOrder as string[] | null) ??
    undefined;

  const boardFieldIds = Array.isArray(activeView.boardFieldIds)
    ? activeView.boardFieldIds.filter((id): id is string => typeof id === "string")
    : [];

  const publicBaseUrl =
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    process.env.APP_BASE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";

  // Form views skip the heavy task query.
  if (isFormView) {
    const [fieldDefs, form, listStatuses, activeUsers] = await Promise.all([
      getFieldDefinitions(list.id),
      getFormByViewId(activeView.id),
      getStatusesForList(list.id),
      getActiveUsers(),
    ]);
    const submissionCount = form ? await countFormSubmissions(form.id) : 0;

    return (
      <div className="flex h-full flex-col">
        <ListLiveRefresh listId={list.id} />
        <div className="mb-3 flex flex-col gap-2">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-muted-foreground">
                <Link href={`/tasks/${space.slug}`} className="hover:underline">
                  {space.name}
                </Link>
                {" · "}
                <Link href="/tasks/forms" className="hover:underline">
                  Forms Hub
                </Link>
              </div>
              <h1 className="flex items-center gap-2 text-xl font-semibold leading-tight">
                <EntityIcon icon={list.icon} color={list.color} fallback="list" size="sm" />
                {list.name}
              </h1>
            </div>
            {isSpaceOwner && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/tasks/${space.slug}/${list.slug}/settings`} aria-label="List settings">
                  <Settings className="size-4" aria-hidden />
                </Link>
              </Button>
            )}
          </div>
          <Suspense fallback={<Skeleton className="h-8 w-64" />}>
            <ListViewTabs
              listId={list.id}
              views={views}
              activeViewId={activeView.id}
              canManage={canEdit}
            />
          </Suspense>
        </div>
        {form ? (
          <FormViewPanel
            form={form}
            fieldDefs={fieldDefs}
            statuses={listStatuses.map((s) => ({
              id: s.id,
              name: s.name,
              color: s.color,
            }))}
            users={activeUsers.map((u) => ({
              id: u.id,
              displayName: u.displayName,
            }))}
            submissionCount={submissionCount}
            canEdit={canEdit}
            publicBaseUrl={publicBaseUrl}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            This form view is missing its form configuration. Delete the tab and create a new Form
            view.
          </div>
        )}
      </div>
    );
  }

  const [listStatuses, fieldDefs, activeUsers, assignableTeams, page, spaceTags, writableLists, spaceTaskTypes] =
    await Promise.all([
      getStatusesForList(list.id),
      getFieldDefinitions(list.id),
      getActiveUsers(),
      getTeamsWithListAccess(list.id),
      getTasksPage({
        listId: list.id,
        conditions,
        groupBy: view === "table" ? groupBy || undefined : undefined,
        limit: view === "board" ? BOARD_LIMIT : TABLE_PAGE_SIZE,
        offset: 0,
        showClosed,
      }),
      getTagsForSpace(space.id),
      getWritableListsForUser(user),
      getTaskTypesForSpace(space.id),
    ]);
  const boardStatuses = showClosed
    ? listStatuses
    : listStatuses.filter((s) => s.category !== "done" && s.category !== "cancelled");

  const statusById = new Map(listStatuses.map((s) => [s.id, s]));
  const boardTasks = page.items.map(({ task, assignees, teamAssignees, tags: taskTags, hasAttachments, taskType }) => {
    const st = statusById.get(task.statusId);
    return {
      id: task.id,
      number: task.number,
      title: task.title,
      priority: task.priority,
      dueDate: task.dueDate,
      statusId: task.statusId,
      statusName: st?.name ?? null,
      statusColor: st?.color ?? null,
      assignees,
      teamAssignees,
      tags: taskTags,
      hasAttachments,
      taskType,
      customFields: (task.customFields ?? {}) as Record<string, unknown>,
      listId: list.id,
    };
  });

  return (
    <div className="flex h-full flex-col">
      <ListLiveRefresh listId={list.id} />

      {/* ── header: title + actions, then view tabs under the list name ── */}
      <div className="mb-3 flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-muted-foreground">
              <Link href={`/tasks/${space.slug}`} className="hover:underline">
                {space.name}
              </Link>
            </div>
            <h1 className="flex items-center gap-2 text-xl font-semibold leading-tight">
              <EntityIcon icon={list.icon} color={list.color} fallback="list" size="sm" />
              {list.name}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            {isSpaceOwner && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/tasks/${space.slug}/${list.slug}/settings`} aria-label="List settings">
                  <Settings className="size-4" aria-hidden />
                </Link>
              </Button>
            )}
            {canEdit && (
              <NewTaskDialog
                listId={list.id}
                fieldDefs={fieldDefs}
                users={activeUsers}
                teams={assignableTeams}
                requiredCoreFields={parseRequiredCoreFields(list.requiredCoreFields)}
                spaceTags={spaceTags}
              />
            )}
          </div>
        </div>

        {/* View tabs sit under the list name. */}
        <Suspense fallback={<Skeleton className="h-8 w-64" />}>
          <ListViewTabs
            listId={list.id}
            views={views}
            activeViewId={activeView.id}
            canManage={canEdit}
          />
        </Suspense>
      </div>

      {view === "board" ? (
        <Board
          key={activeView.id}
          listId={list.id}
          viewId={activeView.id}
          statuses={boardStatuses}
          tasks={boardTasks}
          canEdit={canEdit}
          writableLists={writableLists}
          taskTypes={spaceTaskTypes}
          fieldDefs={fieldDefs}
          activeUsers={activeUsers}
          initialFieldIds={boardFieldIds}
          toolbar={
            <>
              <Badge variant="secondary">{page.total} tasks</Badge>
              <Suspense fallback={<Skeleton className="h-7 w-20" />}>
                <ShowClosedToggle
                  showClosed={showClosed}
                  listId={list.id}
                  viewId={activeView.id}
                />
              </Suspense>
              {page.total > BOARD_LIMIT && (
                <span className="text-xs text-muted-foreground">
                  Board shows the first {BOARD_LIMIT} tasks — use filters or the table view for the
                  rest.
                </span>
              )}
            </>
          }
        />
      ) : view === "grid" ? (
        <TaskGrid
          listId={list.id}
          viewId={activeView.id}
          items={page.items}
          totalCount={page.total}
          conditions={conditions}
          statuses={listStatuses}
          fieldDefs={fieldDefs}
          activeUsers={activeUsers}
          spaceTags={spaceTags}
          showClosed={showClosed}
          canEdit={canEdit}
          initialColumnOrder={columnOrder}
          currentUserId={user.id}
        />
      ) : (
        <ListTasksShell
          listId={list.id}
          viewId={activeView.id}
          view="table"
          initialGroupBy={groupBy || ""}
          initialItems={page.items}
          initialTotal={page.total}
          initialGroupCounts={page.groupCounts}
          conditions={conditions}
          statuses={listStatuses}
          fieldDefs={fieldDefs}
          activeUsers={activeUsers}
          spaceTags={spaceTags}
          writableLists={writableLists}
          taskTypes={spaceTaskTypes}
          showClosed={showClosed}
          canEdit={canEdit}
          initialColumnOrder={columnOrder}
          currentUserId={user.id}
        />
      )}
    </div>
  );
}
