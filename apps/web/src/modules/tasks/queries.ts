/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  activityLog,
  attachments,
  customFieldDefinitions,
  db,
  folderMembers,
  folders,
  formSubmissions,
  listMembers,
  listSecretViewers,
  lists,
  listViews,
  publicForms,
  secretCategories,
  spaceMembers,
  spaces,
  statuses,
  tags,
  withDbRetry,
  taskAssignees,
  taskGroupAssignees,
  taskChecklistItems,
  taskChecklists,
  tasks,
  taskTags,
  taskTypes,
  teamMemberships,
  teams,
  users,
} from "@aitim/db";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { cache } from "react";
import { getFolderRole, getListRole, getSpaceRole, getUserTeamIds } from "@/lib/rbac";
import type { SessionUserLike } from "../types";
import { DEFAULT_TASK_TYPE } from "./lib/task-types";

export const getSpaceBySlug = cache(async (slug: string) => {
  const [space] = await withDbRetry(() =>
    db
      .select()
      .from(spaces)
      .where(and(eq(spaces.slug, slug), eq(spaces.isArchived, false), isNull(spaces.deletedAt))),
  );
  return space ?? null;
});

export const getListsForSpace = cache(async (spaceId: string) => {
  return db
    .select()
    .from(lists)
    .where(and(eq(lists.spaceId, spaceId), eq(lists.isArchived, false), isNull(lists.deletedAt)))
    .orderBy(asc(lists.position), asc(lists.createdAt));
});

export const getFoldersForSpace = cache(async (spaceId: string) => {
  return db
    .select()
    .from(folders)
    .where(and(eq(folders.spaceId, spaceId), eq(folders.isArchived, false), isNull(folders.deletedAt)))
    .orderBy(asc(folders.position), asc(folders.createdAt));
});

export interface ListNavNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
}

export interface FolderNavNode {
  id: string;
  name: string;
  slug: string;
  isPrivate: boolean;
  icon: string | null;
  color: string | null;
  subfolders: FolderNavNode[];
  lists: ListNavNode[];
}

/**
 * Builds the folder/list tree for a single space, filtered to what `userId` can see.
 * Owners bypass everything and get the full tree. Otherwise a folder or list is
 * included if the user has any role on it (getFolderRole/getListRole), and its
 * ancestor folders are pulled in as pass-through containers so the path to a
 * directly-granted deep item stays navigable even if intermediate folders are
 * private and the user has no role on them directly.
 */
export async function getSpaceContentTree(
  spaceId: string,
  userId: string,
  platformRole: string | undefined,
  isOwner: boolean,
): Promise<{ folders: FolderNavNode[]; lists: ListNavNode[] }> {
  const [folderRows, listRows] = await Promise.all([
    withDbRetry(() =>
      db
        .select()
        .from(folders)
        .where(
          and(
            eq(folders.spaceId, spaceId),
            eq(folders.isArchived, false),
            isNull(folders.deletedAt),
          ),
        )
        .orderBy(asc(folders.position), asc(folders.createdAt)),
    ),
    withDbRetry(() =>
      db
        .select()
        .from(lists)
        .where(
          and(
            eq(lists.spaceId, spaceId),
            eq(lists.isArchived, false),
            isNull(lists.deletedAt),
          ),
        )
        .orderBy(asc(lists.position), asc(lists.createdAt)),
    ),
  ]);

  let visibleFolderIds: Set<string>;
  let visibleListIds: Set<string>;

  if (isOwner) {
    visibleFolderIds = new Set(folderRows.map((f) => f.id));
    visibleListIds = new Set(listRows.map((l) => l.id));
  } else {
    // Sequential role resolution — parallel fan-out exhausted the remote pool
    // ("timeout exceeded when trying to connect"). React cache still dedupes.
    const folderRoles: (Awaited<ReturnType<typeof getFolderRole>>)[] = [];
    for (const f of folderRows) {
      folderRoles.push(await getFolderRole(userId, f.id, platformRole));
    }
    const listRoles: (Awaited<ReturnType<typeof getListRole>>)[] = [];
    for (const l of listRows) {
      listRoles.push(await getListRole(userId, l.id, platformRole));
    }
    const directFolderIds = new Set(
      folderRows.filter((_, i) => folderRoles[i] !== null).map((f) => f.id),
    );
    visibleListIds = new Set(listRows.filter((_, i) => listRoles[i] !== null).map((l) => l.id));

    const folderById = new Map(folderRows.map((f) => [f.id, f]));
    visibleFolderIds = new Set(directFolderIds);
    const markAncestors = (startFolderId: string | null) => {
      let folderId = startFolderId;
      while (folderId && !visibleFolderIds.has(folderId)) {
        visibleFolderIds.add(folderId);
        folderId = folderById.get(folderId)?.parentFolderId ?? null;
      }
    };
    for (const id of directFolderIds) markAncestors(folderById.get(id)?.parentFolderId ?? null);
    for (const l of listRows) if (visibleListIds.has(l.id)) markAncestors(l.folderId);
  }

  const listsByFolder = new Map<string | null, ListNavNode[]>();
  for (const l of listRows) {
    if (!visibleListIds.has(l.id)) continue;
    const arr = listsByFolder.get(l.folderId) ?? [];
    arr.push({
      id: l.id,
      name: l.name,
      slug: l.slug,
      description: l.description,
      icon: l.icon,
      color: l.color,
    });
    listsByFolder.set(l.folderId, arr);
  }

  const folderNodeById = new Map<string, FolderNavNode>();
  for (const f of folderRows) {
    if (!visibleFolderIds.has(f.id)) continue;
    folderNodeById.set(f.id, {
      id: f.id,
      name: f.name,
      slug: f.slug,
      isPrivate: f.isPrivate,
      icon: f.icon,
      color: f.color,
      subfolders: [],
      lists: listsByFolder.get(f.id) ?? [],
    });
  }
  const topFolders: FolderNavNode[] = [];
  for (const f of folderRows) {
    if (!visibleFolderIds.has(f.id)) continue;
    const node = folderNodeById.get(f.id)!;
    if (f.parentFolderId && folderNodeById.has(f.parentFolderId)) {
      folderNodeById.get(f.parentFolderId)!.subfolders.push(node);
    } else {
      topFolders.push(node);
    }
  }

  return { folders: topFolders, lists: listsByFolder.get(null) ?? [] };
}

/**
 * Full sidebar nav tree. React-cached per (userId, platformRole) so layout +
 * page both calling this only hit the DB once per request (was a major source
 * of pool exhaustion / "timeout exceeded when trying to connect").
 */
export async function getTaskNavTreeForUser(user: SessionUserLike) {
  return getTaskNavTreeForUserCached(user.id, user.platformRole);
}

const getTaskNavTreeForUserCached = cache(async (userId: string, platformRole: string | undefined) => {
  const candidateSpaces = await withDbRetry(() =>
    db
      .select({
        id: spaces.id,
        name: spaces.name,
        slug: spaces.slug,
        icon: spaces.icon,
        color: spaces.color,
        moduleId: spaces.moduleId,
      })
      .from(spaces)
      .where(and(eq(spaces.isArchived, false), isNull(spaces.deletedAt)))
      .orderBy(asc(spaces.name)),
  );

  // Keep role lookups sequential. On remote Postgres, a space-wide Promise.all
  // competes with the other AppLayout queries and can exhaust the connection pool.
  const roles: (Awaited<ReturnType<typeof getSpaceRole>>)[] = [];
  for (const space of candidateSpaces) {
    roles.push(await getSpaceRole(userId, space.id, platformRole));
  }
  const roleBySpaceId = new Map(candidateSpaces.map((space, i) => [space.id, roles[i]]));
  const visibleSpaces = candidateSpaces.filter((space) => roleBySpaceId.get(space.id) !== null);
  const visibleSpaceIds = new Set(visibleSpaces.map((space) => space.id));

  // Direct list/folder grants (list-only or folder-only sharing) can surface a space
  // the user otherwise has no role in at all.
  const groupIds = await getUserTeamIds(userId);

  const [directListSpaceRows, directFolderSpaceRows] = await Promise.all([
    withDbRetry(() =>
      db
        .select({ spaceId: lists.spaceId })
        .from(listMembers)
        .innerJoin(lists, eq(listMembers.listId, lists.id))
        .where(
          and(
            eq(lists.isArchived, false),
            isNull(lists.deletedAt),
            or(
              eq(listMembers.userId, userId),
              groupIds.length > 0 ? inArray(listMembers.groupId, groupIds) : undefined,
            ),
          ),
        ),
    ),
    withDbRetry(() =>
      db
        .select({ spaceId: folders.spaceId })
        .from(folderMembers)
        .innerJoin(folders, eq(folderMembers.folderId, folders.id))
        .where(
          and(
            eq(folders.isArchived, false),
            isNull(folders.deletedAt),
            or(
              eq(folderMembers.userId, userId),
              groupIds.length > 0 ? inArray(folderMembers.groupId, groupIds) : undefined,
            ),
          ),
        ),
    ),
  ]);

  const extraSpaceIds = new Set(
    [...directListSpaceRows, ...directFolderSpaceRows]
      .map((r) => r.spaceId)
      .filter((id) => !visibleSpaceIds.has(id)),
  );
  const extraSpaces = candidateSpaces.filter((space) => extraSpaceIds.has(space.id));
  const allSpaces = [...visibleSpaces, ...extraSpaces].sort((a, b) => a.name.localeCompare(b.name));
  if (allSpaces.length === 0) return [];

  // Build space trees sequentially to avoid exploding concurrent pool checkouts
  // against a remote DB (Promise.all × N spaces × role queries).
  const trees: Awaited<ReturnType<typeof getSpaceContentTree>>[] = [];
  for (const space of allSpaces) {
    trees.push(
      await getSpaceContentTree(
        space.id,
        userId,
        platformRole,
        roleBySpaceId.get(space.id) === "owner",
      ),
    );
  }

  return allSpaces.map((space, i) => ({
    ...space,
    hasSpaceAccess: visibleSpaceIds.has(space.id),
    isOwner: roleBySpaceId.get(space.id) === "owner",
    ...trees[i],
  }));
});

export type WritableListOption = {
  id: string;
  name: string;
  slug: string;
  spaceId: string;
  spaceName: string;
  spaceSlug: string;
};

/**
 * Lists the signed-in user can create/move tasks into (member or owner).
 * Used by the task context menu Move/Copy pickers.
 */
export async function getWritableListsForUser(
  user: SessionUserLike,
): Promise<WritableListOption[]> {
  const tree = await getTaskNavTreeForUser(user);
  const out: WritableListOption[] = [];

  function walkLists(
    space: { id: string; name: string; slug: string },
    listNodes: ListNavNode[],
  ) {
    for (const list of listNodes) {
      out.push({
        id: list.id,
        name: list.name,
        slug: list.slug,
        spaceId: space.id,
        spaceName: space.name,
        spaceSlug: space.slug,
      });
    }
  }

  function walkFolder(
    space: { id: string; name: string; slug: string },
    folder: FolderNavNode,
  ) {
    walkLists(space, folder.lists);
    for (const sub of folder.subfolders) walkFolder(space, sub);
  }

  for (const space of tree) {
    walkLists(space, space.lists);
    for (const folder of space.folders) walkFolder(space, folder);
  }

  // Filter to write access (guest can see but not move/copy into)
  const roles = await Promise.all(
    out.map((l) => getListRole(user.id, l.id, user.platformRole)),
  );
  return out.filter((_, i) => {
    const role = roles[i];
    return role === "owner" || role === "member";
  });
}

export const getListBySlug = cache(async (spaceId: string, slug: string) => {
  const [list] = await withDbRetry(() =>
    db
      .select()
      .from(lists)
      .where(
        and(
          eq(lists.spaceId, spaceId),
          eq(lists.slug, slug),
          eq(lists.isArchived, false),
          isNull(lists.deletedAt),
        ),
      ),
    );
  return list ?? null;
});

export type ListViewType = "table" | "board" | "form" | "grid";

export interface ListViewRow {
  id: string;
  listId: string;
  name: string;
  type: ListViewType;
  filters: unknown;
  groupBy: string | null;
  showClosed: boolean;
  tableColumnOrder: unknown;
  boardFieldIds: unknown;
  position: string;
}

function normalizeViewType(type: string): ListViewType {
  if (type === "board") return "board";
  if (type === "form") return "form";
  if (type === "grid") return "grid";
  return "table";
}

/** All named views for a list, ordered by position. */
export async function getListViews(listId: string): Promise<ListViewRow[]> {
  const rows = await db
    .select({
      id: listViews.id,
      listId: listViews.listId,
      name: listViews.name,
      type: listViews.type,
      filters: listViews.filters,
      groupBy: listViews.groupBy,
      showClosed: listViews.showClosed,
      tableColumnOrder: listViews.tableColumnOrder,
      boardFieldIds: listViews.boardFieldIds,
      position: listViews.position,
    })
    .from(listViews)
    .where(eq(listViews.listId, listId))
    .orderBy(asc(listViews.position), asc(listViews.createdAt));

  return rows.map((r) => ({
    ...r,
    type: normalizeViewType(r.type),
  }));
}

export type PublicFormRow = typeof publicForms.$inferSelect;


export const getFormByViewId = cache(async (viewId: string): Promise<PublicFormRow | null> => {
  const [row] = await db
    .select()
    .from(publicForms)
    .where(eq(publicForms.listViewId, viewId))
    .limit(1);
  return row ?? null;
});

export const getFormBySlug = cache(async (slug: string): Promise<PublicFormRow | null> => {
  const [row] = await db
    .select()
    .from(publicForms)
    .where(eq(publicForms.slug, slug))
    .limit(1);
  return row ?? null;
});

export async function countFormSubmissions(formId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(formSubmissions)
    .where(eq(formSubmissions.formId, formId));
  return row?.n ?? 0;
}

export interface FormsHubRow {
  id: string;
  slug: string;
  title: string;
  isActive: boolean;
  listId: string;
  listName: string;
  listSlug: string;
  listViewId: string | null;
  spaceId: string;
  spaceName: string;
  spaceSlug: string;
  submissionCount: number;
  updatedAt: Date;
  allowAttachments: boolean;
}

/**
 * All forms on lists the user can open (guest+), for the Forms Hub.
 */
export async function getFormsHubForUser(user: SessionUserLike): Promise<FormsHubRow[]> {
  const allForms = await db
    .select({
      id: publicForms.id,
      slug: publicForms.slug,
      title: publicForms.title,
      isActive: publicForms.isActive,
      listId: publicForms.listId,
      listViewId: publicForms.listViewId,
      allowAttachments: publicForms.allowAttachments,
      updatedAt: publicForms.updatedAt,
      listName: lists.name,
      listSlug: lists.slug,
      spaceId: spaces.id,
      spaceName: spaces.name,
      spaceSlug: spaces.slug,
    })
    .from(publicForms)
    .innerJoin(lists, eq(publicForms.listId, lists.id))
    .innerJoin(spaces, eq(lists.spaceId, spaces.id))
    .where(
      and(
        isNull(lists.deletedAt),
        eq(lists.isArchived, false),
        isNull(spaces.deletedAt),
        eq(spaces.isArchived, false),
      ),
    )
    .orderBy(desc(publicForms.updatedAt));

  const accessible: FormsHubRow[] = [];
  for (const f of allForms) {
    const role = await getListRole(user.id, f.listId, user.platformRole);
    if (!role) continue;
    const submissionCount = await countFormSubmissions(f.id);
    accessible.push({
      id: f.id,
      slug: f.slug,
      title: f.title,
      isActive: f.isActive,
      listId: f.listId,
      listName: f.listName,
      listSlug: f.listSlug,
      listViewId: f.listViewId,
      spaceId: f.spaceId,
      spaceName: f.spaceName,
      spaceSlug: f.spaceSlug,
      submissionCount,
      updatedAt: f.updatedAt,
      allowAttachments: f.allowAttachments,
    });
  }
  return accessible;
}

/**
 * Ensure a list has at least one view (new lists created after migration).
 * Returns the views, creating List + Board defaults when empty.
 */
export async function ensureListViews(listId: string): Promise<ListViewRow[]> {
  const existing = await getListViews(listId);
  if (existing.length > 0) return existing;

  const [list] = await db.select().from(lists).where(eq(lists.id, listId));
  if (!list) return [];

  await db.insert(listViews).values([
    {
      listId,
      name: "List",
      type: "table",
      filters: [],
      groupBy: list.defaultGroupBy,
      showClosed: false,
      tableColumnOrder: list.tableColumnOrder,
      boardFieldIds: [],
      position: "a0",
    },
    {
      listId,
      name: "Board",
      type: "board",
      filters: [],
      groupBy: null,
      showClosed: false,
      tableColumnOrder: null,
      boardFieldIds: [],
      position: "a1",
    },
  ]);
  return getListViews(listId);
}

/** Short process-local cache — cuts repeat DB hits on list SSR + fetchTasksPage. */
const LIST_META_TTL_MS = 20_000;
type MetaCacheEntry<T> = { at: number; value: T };
const statusesCache = new Map<string, MetaCacheEntry<Awaited<ReturnType<typeof loadStatusesForList>>>>();
const fieldDefsCache = new Map<
  string,
  MetaCacheEntry<Awaited<ReturnType<typeof loadFieldDefinitions>>>
>();

function readMetaCache<T>(map: Map<string, MetaCacheEntry<T>>, key: string): T | null {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > LIST_META_TTL_MS) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

/** Drop cached statuses/fields for a list after settings mutations. */
export function invalidateListMetaCache(listId: string) {
  statusesCache.delete(listId);
  fieldDefsCache.delete(`${listId}:all`);
  fieldDefsCache.delete(`${listId}:active`);
}

async function loadStatusesForList(listId: string) {
  return db
    .select()
    .from(statuses)
    .where(eq(statuses.listId, listId))
    .orderBy(asc(statuses.position), asc(statuses.createdAt));
}

async function loadFieldDefinitions(listId: string, includeArchived: boolean) {
  const rows = await db
    .select()
    .from(customFieldDefinitions)
    .where(and(eq(customFieldDefinitions.listId, listId), isNull(customFieldDefinitions.deletedAt)))
    .orderBy(asc(customFieldDefinitions.position), asc(customFieldDefinitions.createdAt));
  return includeArchived ? rows : rows.filter((r) => !r.isArchived);
}

export const getStatusesForList = cache(async (listId: string) => {
  const cached = readMetaCache(statusesCache, listId);
  if (cached) return cached;
  const value = await loadStatusesForList(listId);
  statusesCache.set(listId, { at: Date.now(), value });
  return value;
});

export const getFieldDefinitions = cache(async (listId: string, includeArchived = false) => {
  const key = `${listId}:${includeArchived ? "all" : "active"}`;
  const cached = readMetaCache(fieldDefsCache, key);
  if (cached) return cached;
  const value = await loadFieldDefinitions(listId, includeArchived);
  fieldDefsCache.set(key, { at: Date.now(), value });
  return value;
});

export interface TaskTag {
  id: string;
  name: string;
  color: string;
}

export interface TeamOption {
  id: string;
  displayName: string;
  alias: string | null;
  description?: string | null;
  icon: string | null;
  color: string | null;
  memberCount: number;
}

export interface TaskTypeMeta {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  showDeliveryTimeline: boolean;
}

export interface TaskWithMeta {
  task: typeof tasks.$inferSelect;
  assignees: { id: string; displayName: string; photoKey: string | null }[];
  teamAssignees: TeamOption[];
  tags: TaskTag[];
  /** True when the task has at least one file attachment. */
  hasAttachments: boolean;
  /** Non-archived, non-trashed direct children — drives the table's expand chevron. */
  subtaskCount: number;
  taskType: TaskTypeMeta | null;
}

async function attachAssignees(taskRows: (typeof tasks.$inferSelect)[]): Promise<TaskWithMeta[]> {
  if (taskRows.length === 0) return [];
  const taskIds = taskRows.map((t) => t.id);
  const taskTypeIds = [...new Set(taskRows.map((t) => t.taskTypeId).filter((id): id is string => !!id))];

  const [assigneeRows, teamAssigneeRows, tagRows, attachmentRows, subtaskCountRows, taskTypeRows] = await Promise.all([
    db
      .select({
        taskId: taskAssignees.taskId,
        id: users.id,
        displayName: users.displayName,
        photoKey: users.photoKey,
      })
      .from(taskAssignees)
      .innerJoin(users, eq(taskAssignees.userId, users.id))
      .where(inArray(taskAssignees.taskId, taskIds)),
    db
      .select({
        taskId: taskGroupAssignees.taskId,
        id: teams.id,
        displayName: teams.displayName,
        alias: teams.alias,
        color: teams.color,
        icon: teams.icon,
      })
      .from(taskGroupAssignees)
      .innerJoin(teams, eq(taskGroupAssignees.groupId, teams.id))
      .where(inArray(taskGroupAssignees.taskId, taskIds)),
    db
      .select({
        taskId: taskTags.taskId,
        id: tags.id,
        name: tags.name,
        color: tags.color,
      })
      .from(taskTags)
      .innerJoin(tags, eq(taskTags.tagId, tags.id))
      .where(inArray(taskTags.taskId, taskIds))
      .orderBy(asc(tags.name)),
    db
      .selectDistinct({ taskId: attachments.taskId })
      .from(attachments)
      .where(inArray(attachments.taskId, taskIds)),
    db
      .select({
        parentTaskId: tasks.parentTaskId,
        n: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(tasks)
      .where(
        and(
          inArray(tasks.parentTaskId, taskIds),
          eq(tasks.isArchived, false),
          isNull(tasks.deletedAt),
        ),
      )
      .groupBy(tasks.parentTaskId),
    taskTypeIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: taskTypes.id,
            name: taskTypes.name,
            icon: taskTypes.icon,
            color: taskTypes.color,
            showDeliveryTimeline: taskTypes.showDeliveryTimeline,
          })
          .from(taskTypes)
          .where(inArray(taskTypes.id, taskTypeIds)),
  ]);

  const taskTypeById = new Map(taskTypeRows.map((r) => [r.id, r]));
  const assigneesByTask = new Map<string, TaskWithMeta["assignees"]>();
  for (const row of assigneeRows) {
    const list = assigneesByTask.get(row.taskId) ?? [];
    list.push({ id: row.id, displayName: row.displayName, photoKey: row.photoKey });
    assigneesByTask.set(row.taskId, list);
  }
  const teamAssigneesByTask = new Map<string, TeamOption[]>();
  for (const row of teamAssigneeRows) {
    const list = teamAssigneesByTask.get(row.taskId) ?? [];
    list.push({
      id: row.id,
      displayName: row.displayName,
      alias: row.alias,
      color: row.color,
      icon: row.icon,
      memberCount: 0,
    });
    teamAssigneesByTask.set(row.taskId, list);
  }
  const tagsByTask = new Map<string, TaskTag[]>();
  for (const row of tagRows) {
    const list = tagsByTask.get(row.taskId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    tagsByTask.set(row.taskId, list);
  }
  const tasksWithAttachments = new Set(attachmentRows.map((r) => r.taskId));
  const subtaskCountByTask = new Map(
    subtaskCountRows
      .filter((r): r is { parentTaskId: string; n: number } => r.parentTaskId !== null)
      .map((r) => [r.parentTaskId, r.n]),
  );
  return taskRows.map((task) => ({
    task,
    assignees: assigneesByTask.get(task.id) ?? [],
    teamAssignees: teamAssigneesByTask.get(task.id) ?? [],
    tags: tagsByTask.get(task.id) ?? [],
    hasAttachments: tasksWithAttachments.has(task.id),
    subtaskCount: subtaskCountByTask.get(task.id) ?? 0,
    taskType: task.taskTypeId ? (taskTypeById.get(task.taskTypeId) ?? null) : null,
  }));
}

/** All tags defined in a space (for pickers + filters). */
export const getTagsForSpace = cache(async (spaceId: string): Promise<TaskTag[]> => {
  return db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(eq(tags.spaceId, spaceId))
    .orderBy(asc(tags.name));
});

/** Tags currently on a single task. */
export async function getTagsForTask(taskId: string): Promise<TaskTag[]> {
  return withDbRetry(
    () =>
      db
        .select({ id: tags.id, name: tags.name, color: tags.color })
        .from(taskTags)
        .innerJoin(tags, eq(taskTags.tagId, tags.id))
        .where(eq(taskTags.taskId, taskId))
        .orderBy(asc(tags.name)),
    { attempts: 3, baseDelayMs: 300 },
  );
}

/** Active task types for a space (Task/Project/etc.), ordered for pickers/managers. */
export const getTaskTypesForSpace = cache(async (spaceId: string): Promise<TaskTypeMeta[]> => {
  const rows = await db
    .select({
      id: taskTypes.id,
      name: taskTypes.name,
      icon: taskTypes.icon,
      color: taskTypes.color,
      showDeliveryTimeline: taskTypes.showDeliveryTimeline,
    })
    .from(taskTypes)
    .where(and(eq(taskTypes.spaceId, spaceId), eq(taskTypes.isArchived, false)))
    .orderBy(asc(taskTypes.position), asc(taskTypes.createdAt));
  return rows;
});

export interface ChecklistItemRow {
  id: string;
  title: string;
  isChecked: boolean;
}
export interface ChecklistRow {
  id: string;
  title: string;
  items: ChecklistItemRow[];
}

/** A task's checklists with nested items, in display order. */
export async function getTaskChecklists(taskId: string): Promise<ChecklistRow[]> {
  const [checklistRows, itemRows] = await Promise.all([
    db
      .select({ id: taskChecklists.id, title: taskChecklists.title })
      .from(taskChecklists)
      .where(eq(taskChecklists.taskId, taskId))
      .orderBy(asc(taskChecklists.position), asc(taskChecklists.createdAt)),
    db
      .select({
        id: taskChecklistItems.id,
        checklistId: taskChecklistItems.checklistId,
        title: taskChecklistItems.title,
        isChecked: taskChecklistItems.isChecked,
      })
      .from(taskChecklistItems)
      .innerJoin(taskChecklists, eq(taskChecklistItems.checklistId, taskChecklists.id))
      .where(eq(taskChecklists.taskId, taskId))
      .orderBy(asc(taskChecklistItems.position), asc(taskChecklistItems.createdAt)),
  ]);

  const itemsByChecklist = new Map<string, ChecklistItemRow[]>();
  for (const row of itemRows) {
    const list = itemsByChecklist.get(row.checklistId) ?? [];
    list.push({ id: row.id, title: row.title, isChecked: row.isChecked });
    itemsByChecklist.set(row.checklistId, list);
  }
  return checklistRows.map((c) => ({ ...c, items: itemsByChecklist.get(c.id) ?? [] }));
}

export interface TaskProgress {
  subtasksDone: number;
  subtasksTotal: number;
  checklistDone: number;
  checklistTotal: number;
}

/**
 * Delivery-timeline progress for a Project-type task: completion across every
 * descendant subtask (recursive, not just direct children) plus every checklist
 * item on the task itself. Only called from the task detail page.
 */
export async function getTaskProgress(taskId: string): Promise<TaskProgress> {
  const [subtaskResult, checklistRows] = await Promise.all([
    db.execute<{ done: number; total: number }>(sql`
      WITH RECURSIVE descendants AS (
        SELECT id, status_id FROM tasks
        WHERE parent_task_id = ${taskId} AND is_archived = false AND deleted_at IS NULL
        UNION ALL
        SELECT t.id, t.status_id FROM tasks t
        INNER JOIN descendants d ON t.parent_task_id = d.id
        WHERE t.is_archived = false AND t.deleted_at IS NULL
      )
      SELECT
        count(*) FILTER (WHERE s.category IN ('done', 'cancelled'))::int AS done,
        count(*)::int AS total
      FROM descendants d
      JOIN statuses s ON s.id = d.status_id
    `),
    db
      .select({
        done: sql<number>`count(*) FILTER (WHERE ${taskChecklistItems.isChecked})::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(taskChecklistItems)
      .innerJoin(taskChecklists, eq(taskChecklistItems.checklistId, taskChecklists.id))
      .where(eq(taskChecklists.taskId, taskId)),
  ]);

  const subtaskRow = subtaskResult.rows[0];
  return {
    subtasksDone: subtaskRow?.done ?? 0,
    subtasksTotal: subtaskRow?.total ?? 0,
    checklistDone: checklistRows[0]?.done ?? 0,
    checklistTotal: checklistRows[0]?.total ?? 0,
  };
}

export async function getTasksForList(listId: string): Promise<TaskWithMeta[]> {
  const taskRows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.listId, listId), eq(tasks.isArchived, false), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.position), desc(tasks.createdAt));
  return attachAssignees(taskRows);
}

// ─── paginated, SQL-filtered task pages (scales to 100k+ rows per list) ────────

/** Mirror of the FilterBar's condition shape (kept here to avoid a client import). */
export interface TaskFilterCondition {
  field: string; // "status" | "priority" | "assignee" | `cf_${defId}`
  op: string;
  value: string;
  conjunction?: "and" | "or";
}

export interface TaskSortSpec {
  /**
   * Custom field definition UUID, or a native table column id:
   * number | title | status | priority | due | start_date | created_at | closed_at
   */
  fieldId: string;
  dir: "asc" | "desc";
}

type FieldDefRow = typeof customFieldDefinitions.$inferSelect;

/** SQL fragment for one filter condition. Unknown/valueless conditions become TRUE,
 * matching the previous in-JS behavior. */
function conditionSql(c: TaskFilterCondition, defsById: Map<string, FieldDefRow>) {
  const TRUE = sql`true`;
  if (!c.value && c.op !== "is_empty" && c.op !== "is_not_empty") return TRUE;

  if (c.field === "status") {
    return c.op === "is" ? sql`${tasks.statusId} = ${c.value}` : sql`${tasks.statusId} != ${c.value}`;
  }
  if (c.field === "priority") {
    return c.op === "is"
      ? sql`${tasks.priority} = ${c.value}`
      : sql`(${tasks.priority} IS NULL OR ${tasks.priority} != ${c.value})`;
  }
  if (c.field === "type") {
    if (c.value === DEFAULT_TASK_TYPE.filterValue) {
      return c.op === "is"
        ? sql`${tasks.taskTypeId} IS NULL`
        : sql`${tasks.taskTypeId} IS NOT NULL`;
    }
    return c.op === "is"
      ? sql`${tasks.taskTypeId} = ${c.value}`
      : sql`(${tasks.taskTypeId} IS NULL OR ${tasks.taskTypeId} != ${c.value})`;
  }
  if (c.field === "assignee") {
    const exists = sql`EXISTS (SELECT 1 FROM ${taskAssignees} ta WHERE ta.task_id = ${tasks.id} AND ta.user_id = ${c.value})`;
    return c.op === "is" ? exists : sql`NOT ${exists}`;
  }
  if (c.field === "tag") {
    const exists = sql`EXISTS (SELECT 1 FROM ${taskTags} tt WHERE tt.task_id = ${tasks.id} AND tt.tag_id = ${c.value})`;
    return c.op === "is" || c.op === "includes" ? exists : sql`NOT ${exists}`;
  }
  if (c.field.startsWith("cf_")) {
    const defId = c.field.slice(3);
    const def = defsById.get(defId);
    if (!def) return TRUE;
    const txt = sql`${tasks.customFields}->>${defId}`;
    switch (def.type) {
      case "dropdown":
      case "color":
        return c.op === "is" ? sql`${txt} = ${c.value}` : sql`(${txt} IS NULL OR ${txt} != ${c.value})`;
      case "user": {
        // People: JSON array of ids, or legacy single string uuid.
        const inArray = sql`(${tasks.customFields}->${defId}) ? ${c.value}`;
        const asScalar = sql`${txt} = ${c.value}`;
        const has = sql`(${inArray} OR ${asScalar})`;
        if (c.op === "is" || c.op === "includes") return has;
        return sql`NOT coalesce(${has}, false)`;
      }
      case "multi_select": {
        const has = sql`(${tasks.customFields}->${defId}) ? ${c.value}`;
        return c.op === "includes" ? has : sql`NOT coalesce(${has}, false)`;
      }
      case "checkbox":
        return c.value === "true"
          ? sql`(${tasks.customFields}->${defId})::text = 'true'`
          : sql`coalesce((${tasks.customFields}->${defId})::text, 'false') != 'true'`;
      case "number": {
        const num = sql`NULLIF(${txt}, '')::numeric`;
        const target = Number(c.value);
        if (!Number.isFinite(target)) return TRUE;
        const ops: Record<string, ReturnType<typeof sql>> = {
          eq: sql`${num} = ${target}`,
          neq: sql`${num} != ${target}`,
          gt: sql`${num} > ${target}`,
          lt: sql`${num} < ${target}`,
          gte: sql`${num} >= ${target}`,
          lte: sql`${num} <= ${target}`,
        };
        return ops[c.op] ?? TRUE;
      }
      case "date": {
        const ops: Record<string, ReturnType<typeof sql>> = {
          is: sql`left(${txt}, 10) = ${c.value}`,
          before: sql`left(${txt}, 10) < ${c.value}`,
          after: sql`left(${txt}, 10) > ${c.value}`,
        };
        return ops[c.op] ?? TRUE;
      }
      default: {
        // text-ish types
        const like = `%${c.value}%`;
        const ops: Record<string, ReturnType<typeof sql>> = {
          contains: sql`${txt} ILIKE ${like}`,
          not_contains: sql`coalesce(${txt}, '') NOT ILIKE ${like}`,
          is: sql`lower(${txt}) = lower(${c.value})`,
          is_not: sql`lower(coalesce(${txt}, '')) != lower(${c.value})`,
        };
        return ops[c.op] ?? TRUE;
      }
    }
  }
  return TRUE;
}

/** Left-associative and/or chain, parenthesized to match the old client-side evaluation. */
function conditionsSql(conditions: TaskFilterCondition[], defsById: Map<string, FieldDefRow>) {
  if (conditions.length === 0) return sql`true`;
  let acc = conditionSql(conditions[0], defsById);
  for (let i = 1; i < conditions.length; i++) {
    const frag = conditionSql(conditions[i], defsById);
    acc = conditions[i].conjunction === "or" ? sql`(${acc} OR ${frag})` : sql`(${acc} AND ${frag})`;
  }
  return acc;
}

/**
 * `tasks.custom_fields->>'…'` as identical SQL text for SELECT / GROUP BY / ORDER BY.
 * Postgres rejects GROUP BY when the same JSON path is bound as different $n params
 * even if the values match (42803: column must appear in GROUP BY).
 */
function cfJsonTextExpr(defId: string) {
  const safe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(defId)
      ? defId
      : "";
  if (!safe) return sql`NULL::text`;
  // defId is a UUID — safe to inline as a JSON key literal.
  return sql.raw(`("tasks"."custom_fields"->>'${safe}')`);
}

/** Case-insensitive A–Z ordering by the label users actually see for a group. */
function groupOrderParts(groupBy: string | undefined, defsById: Map<string, FieldDefRow>) {
  if (groupBy === "status") {
    return [
      sql`coalesce((SELECT lower(s.name) FROM ${statuses} s WHERE s.id = ${tasks.statusId}), lower(${tasks.statusId}::text)) ASC NULLS LAST`,
      sql`${tasks.statusId} ASC NULLS LAST`,
    ];
  }
  if (groupBy === "priority") {
    return [sql`lower(${tasks.priority}::text) ASC NULLS LAST`];
  }
  if (groupBy === "type") {
    return [
      sql`coalesce((SELECT lower(tt.name) FROM ${taskTypes} tt WHERE tt.id = ${tasks.taskTypeId}), lower(${tasks.taskTypeId}::text), 'task') ASC`,
      sql`${tasks.taskTypeId} ASC NULLS LAST`,
    ];
  }
  if (groupBy?.startsWith("cf_")) {
    const defId = groupBy.slice(3);
    const keyExpr = cfJsonTextExpr(defId);
    const def = defsById.get(defId);
    if (def?.type === "dropdown" || def?.type === "color") {
      const options = (def.options ?? []) as { id?: unknown; label?: unknown }[];
      const cases = options
        .filter((option): option is { id: string; label: string } =>
          typeof option.id === "string" && typeof option.label === "string",
        )
        .map((option) => sql`WHEN ${option.id} THEN ${option.label}`);
      if (cases.length > 0) {
        const labelExpr = sql`CASE ${keyExpr} ${sql.join(cases, sql.raw(" "))} ELSE ${keyExpr} END`;
        return [sql`lower(${labelExpr}) ASC NULLS LAST`, sql`${keyExpr} ASC NULLS LAST`];
      }
    }
    if (def?.type === "checkbox") {
      const labelExpr = sql`CASE ${keyExpr} WHEN 'true' THEN 'Yes' WHEN 'false' THEN 'No' ELSE ${keyExpr} END`;
      return [sql`lower(${labelExpr}) ASC NULLS LAST`, sql`${keyExpr} ASC NULLS LAST`];
    }
    if (def?.type === "user") {
      const firstUserId = sql`CASE WHEN left(${keyExpr}, 1) = '[' THEN (${keyExpr})::jsonb->>0 ELSE ${keyExpr} END`;
      const labelExpr = sql`coalesce((SELECT lower(u.display_name) FROM ${users} u WHERE u.id::text = ${firstUserId} LIMIT 1), lower(${keyExpr}))`;
      return [sql`${labelExpr} ASC NULLS LAST`, sql`${keyExpr} ASC NULLS LAST`];
    }
    return [sql`lower(${keyExpr}) ASC NULLS LAST`, sql`${keyExpr} ASC NULLS LAST`];
  }
  return [];
}

/** ORDER BY that puts A–Z grouped rows together, then applies stable row ordering. */
function orderSql(groupBy: string | undefined, sort: TaskSortSpec | null | undefined, defsById: Map<string, FieldDefRow>) {
  const parts: ReturnType<typeof sql>[] = [...groupOrderParts(groupBy, defsById)];
  if (sort) {
    const asc = sort.dir === "asc";
    const def = defsById.get(sort.fieldId);
    if (def) {
      const txt = sql`${tasks.customFields}->>${sort.fieldId}`;
      const expr = def.type === "number" ? sql`NULLIF(${txt}, '')::numeric` : txt;
      parts.push(asc ? sql`${expr} ASC NULLS LAST` : sql`${expr} DESC NULLS LAST`);
    } else {
      // Native / built-in columns
      switch (sort.fieldId) {
        case "number":
          parts.push(asc ? sql`${tasks.number} ASC NULLS LAST` : sql`${tasks.number} DESC NULLS LAST`);
          break;
        case "title":
          parts.push(
            asc ? sql`lower(${tasks.title}) ASC NULLS LAST` : sql`lower(${tasks.title}) DESC NULLS LAST`,
          );
          break;
        case "status":
          parts.push(
            asc
              ? sql`(SELECT s.position FROM ${statuses} s WHERE s.id = ${tasks.statusId}) ASC NULLS LAST`
              : sql`(SELECT s.position FROM ${statuses} s WHERE s.id = ${tasks.statusId}) DESC NULLS LAST`,
            asc ? sql`${tasks.statusId} ASC` : sql`${tasks.statusId} DESC`,
          );
          break;
        case "priority": {
          const prio = sql`CASE ${tasks.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`;
          parts.push(asc ? sql`${prio} ASC NULLS LAST` : sql`${prio} DESC NULLS LAST`);
          break;
        }
        case "due":
          parts.push(asc ? sql`${tasks.dueDate} ASC NULLS LAST` : sql`${tasks.dueDate} DESC NULLS LAST`);
          break;
        case "start_date":
          parts.push(
            asc ? sql`${tasks.startDate} ASC NULLS LAST` : sql`${tasks.startDate} DESC NULLS LAST`,
          );
          break;
        case "created_at":
          parts.push(
            asc ? sql`${tasks.createdAt} ASC NULLS LAST` : sql`${tasks.createdAt} DESC NULLS LAST`,
          );
          break;
        case "closed_at":
          parts.push(
            asc
              ? sql`${tasks.completedAt} ASC NULLS LAST`
              : sql`${tasks.completedAt} DESC NULLS LAST`,
          );
          break;
        default:
          break;
      }
    }
  }
  parts.push(sql`${tasks.position} ASC`, sql`${tasks.createdAt} DESC`, sql`${tasks.id} ASC`);
  return sql.join(parts, sql`, `);
}

export interface TaskPage {
  items: TaskWithMeta[];
  total: number;
  /** Present when groupBy was requested: total rows per group key (statusId / priority / cf value). */
  groupCounts: { key: string; count: number }[] | null;
}

export interface TaskPageParams {
  listId: string;
  conditions?: TaskFilterCondition[];
  groupBy?: string;
  sort?: TaskSortSpec | null;
  limit: number;
  offset: number;
  /**
   * When false (default), tasks whose status category is `done` or `cancelled`
   * are excluded from the default open-task list.
   * Pass true (e.g. URL `closed=1`) to include them.
   */
  showClosed?: boolean;
  /** Skip the count/groupCounts queries (used by follow-up pages). */
  countsAlreadyKnown?: boolean;
}

async function getTasksPageOnce(params: TaskPageParams): Promise<TaskPage> {
  const { listId, conditions = [], groupBy, sort, limit, offset, showClosed = false } = params;
  const defs = await getFieldDefinitions(listId, true);
  const defsById = new Map(defs.map((d) => [d.id, d]));

  // Closed = status categories done or cancelled.
  const openOnlySql = showClosed
    ? sql`true`
    : sql`EXISTS (
        SELECT 1 FROM ${statuses} s
        WHERE s.id = ${tasks.statusId}
          AND s.category NOT IN ('done', 'cancelled')
      )`;

  // Top-level tasks only — subtasks live under their parent on the detail page.
  const where = sql`${tasks.listId} = ${listId} AND ${tasks.isArchived} = false AND ${tasks.deletedAt} is null AND ${tasks.parentTaskId} is null AND (${openOnlySql}) AND (${conditionsSql(conditions, defsById)})`;

  const rows = await db
    .select()
    .from(tasks)
    .where(where)
    .orderBy(orderSql(groupBy, sort, defsById))
    .limit(limit)
    .offset(offset);
  const items = await attachAssignees(rows);

  if (params.countsAlreadyKnown) return { items, total: -1, groupCounts: null };

  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(where);

  let groupCounts: TaskPage["groupCounts"] = null;
  if (groupBy) {
    // Grouped by the raw key, with the same displayed-label A–Z ordering used by
    // orderSql — the client uses this to
    // compute every group's absolute row offset without loading the rows.
    let grouped: { key: string | null; count: number }[];
    if (groupBy === "status") {
      grouped = await db
        .select({ key: sql<string | null>`${tasks.statusId}::text`, count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(where)
        .groupBy(tasks.statusId)
        .orderBy(...groupOrderParts(groupBy, defsById));
    } else if (groupBy === "priority") {
      grouped = await db
        .select({ key: sql<string | null>`${tasks.priority}::text`, count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(where)
        .groupBy(tasks.priority)
        .orderBy(...groupOrderParts(groupBy, defsById));
    } else if (groupBy === "type") {
      grouped = await db
        .select({ key: sql<string | null>`${tasks.taskTypeId}::text`, count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(where)
        .groupBy(tasks.taskTypeId)
        .orderBy(...groupOrderParts(groupBy, defsById));
    } else if (groupBy.startsWith("cf_")) {
      // Same expression object/text for select, groupBy, and orderBy (see cfJsonTextExpr).
      const defId = groupBy.slice(3);
      const keyExpr = cfJsonTextExpr(defId);
      const def = defsById.get(defId);
      grouped = await db
        .select({ key: sql<string | null>`${keyExpr}`, count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(where)
        .groupBy(keyExpr);
      if (def?.type === "user") {
        const firstUserId = (key: string | null): string | null => {
          if (!key) return null;
          if (!key.startsWith("[")) return key;
          try {
            const parsed = JSON.parse(key) as unknown;
            return Array.isArray(parsed) && typeof parsed[0] === "string" ? parsed[0] : null;
          } catch {
            return null;
          }
        };
        const ids = [...new Set(grouped.map((g) => firstUserId(g.key)).filter((id): id is string => !!id))];
        const people = ids.length
          ? await db
              .select({ id: users.id, name: users.displayName })
              .from(users)
              .where(inArray(users.id, ids))
          : [];
        const names = new Map(people.map((person) => [person.id, person.name]));
        grouped.sort((a, b) => {
          if (a.key == null) return b.key == null ? 0 : 1;
          if (b.key == null) return -1;
          const aLabel = names.get(firstUserId(a.key) ?? "") ?? a.key;
          const bLabel = names.get(firstUserId(b.key) ?? "") ?? b.key;
          return (
            aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" }) ||
            a.key.localeCompare(b.key)
          );
        });
      } else {
        const labelForKey = (key: string | null): string => {
          if (key == null) return "";
          if (def?.type === "checkbox") return key === "true" ? "Yes" : key === "false" ? "No" : key;
          if (def?.type === "dropdown" || def?.type === "color") {
            const options = (def.options ?? []) as { id?: unknown; label?: unknown }[];
            const option = options.find((item) => item.id === key);
            return typeof option?.label === "string" ? option.label : key;
          }
          return key;
        };
        grouped.sort((a, b) => {
          if (a.key == null) return b.key == null ? 0 : 1;
          if (b.key == null) return -1;
          return (
            labelForKey(a.key).localeCompare(labelForKey(b.key), undefined, {
              sensitivity: "base",
            }) || a.key.localeCompare(b.key)
          );
        });
      }
    } else {
      grouped = [{ key: null, count: total }];
    }
    groupCounts = grouped.map((g) => ({ key: g.key ?? "__none__", count: g.count }));
  }

  return { items, total, groupCounts };
}

/** Load a task page again after a brief database or container-network interruption. */
export async function getTasksPage(params: TaskPageParams): Promise<TaskPage> {
  return withDbRetry(() => getTasksPageOnce(params), { attempts: 3, baseDelayMs: 300 });
}

export const getTaskByNumber = cache(async (number: string) => {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.number, number), isNull(tasks.deletedAt)));
  return task ?? null;
});

export type SubtaskRow = {
  id: string;
  number: string;
  title: string;
  statusId: string;
  statusName: string;
  statusColor: string;
  statusCategory: string;
  priority: string | null;
  dueDate: string | null;
  assigneeCount: number;
};

/** Direct children of a task (one level). Nested subtasks are loaded when opening that child. */
export async function getSubtasks(parentTaskId: string): Promise<SubtaskRow[]> {
  const rows = await db
    .select({
      id: tasks.id,
      number: tasks.number,
      title: tasks.title,
      statusId: tasks.statusId,
      statusName: statuses.name,
      statusColor: statuses.color,
      statusCategory: statuses.category,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .innerJoin(statuses, eq(tasks.statusId, statuses.id))
    .where(
      and(
        eq(tasks.parentTaskId, parentTaskId),
        eq(tasks.isArchived, false),
        isNull(tasks.deletedAt),
      ),
    )
    .orderBy(asc(tasks.position), asc(tasks.createdAt));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const assigneeCounts = await db
    .select({
      taskId: taskAssignees.taskId,
      n: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(taskAssignees)
    .where(inArray(taskAssignees.taskId, ids))
    .groupBy(taskAssignees.taskId);
  const countByTask = new Map(assigneeCounts.map((r) => [r.taskId, r.n]));

  return rows.map((r) => ({
    ...r,
    priority: r.priority,
    dueDate: r.dueDate,
    assigneeCount: countByTask.get(r.id) ?? 0,
  }));
}

/**
 * Direct children of a task, full `TaskWithMeta` shape — for the task table's
 * inline subtask expansion (same column data as top-level rows). One level;
 * nested subtasks are fetched the same way when that child is expanded.
 */
export async function getChildTasks(parentTaskId: string): Promise<TaskWithMeta[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.parentTaskId, parentTaskId),
        eq(tasks.isArchived, false),
        isNull(tasks.deletedAt),
      ),
    )
    .orderBy(asc(tasks.position), asc(tasks.createdAt));
  return attachAssignees(rows);
}

/** Breadcrumb chain from root parent down to immediate parent (excludes the task itself). */
export async function getTaskParentChain(
  taskId: string,
): Promise<{ id: string; number: string; title: string }[]> {
  type ParentRow = {
    id: string;
    number: string;
    title: string;
    parentTaskId: string | null;
  };
  const chain: { id: string; number: string; title: string }[] = [];
  let currentId: string | null = taskId;
  const seen = new Set<string>();
  // Walk up; collect then reverse so root is first
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const rows: ParentRow[] = await db
      .select({
        id: tasks.id,
        number: tasks.number,
        title: tasks.title,
        parentTaskId: tasks.parentTaskId,
      })
      .from(tasks)
      .where(eq(tasks.id, currentId))
      .limit(1);
    const row: ParentRow | undefined = rows[0];
    if (!row) break;
    if (row.id !== taskId) {
      chain.push({ id: row.id, number: row.number, title: row.title });
    }
    currentId = row.parentTaskId;
  }
  return chain.reverse();
}

export async function getTaskActivity(taskId: string, limit = 50) {
  return db
    .select({
      id: activityLog.id,
      verb: activityLog.verb,
      payload: activityLog.payload,
      actorId: activityLog.actorId,
      actorLabel: activityLog.actorLabel,
      createdAt: activityLog.createdAt,
      actorName: users.displayName,
      actorPhotoKey: users.photoKey,
    })
    .from(activityLog)
    .leftJoin(users, eq(activityLog.actorId, users.id))
    .where(eq(activityLog.taskId, taskId))
    .orderBy(desc(activityLog.id))
    .limit(limit);
}

/**
 * Users available for assignees, sharing, mentions, etc.
 * Only Entra platform-access group members (+ protected admins) and temporary
 * legacy imported accounts — not the full tenant directory.
 */
export const getActiveUsers = cache(async () => {
  const { listPickerUsers } = await import("@/lib/directory-users");
  const rows = await listPickerUsers();
  return rows.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    photoKey: u.photoKey,
  }));
});

/** App-managed AACC Teams available as reusable collaboration principals. */
export const getTeams = cache(async (): Promise<TeamOption[]> => {
  const rows = await db
    .select({
      id: teams.id,
      displayName: teams.displayName,
      alias: teams.alias,
      description: teams.description,
      icon: teams.icon,
      color: teams.color,
      memberCount: sql<number>`count(${teamMemberships.userId})::int`.mapWith(Number),
    })
    .from(teams)
    .leftJoin(teamMemberships, eq(teamMemberships.teamId, teams.id))
    .groupBy(teams.id)
    .orderBy(asc(teams.displayName));
  return rows;
});

/** Teams with at least one active member who can see the list. */
export async function getTeamsWithListAccess(listId: string): Promise<TeamOption[]> {
  const allowedUsers = await getUsersWithListAccess(listId);
  if (allowedUsers.length === 0) return [];
  const memberships = await db
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(inArray(teamMemberships.userId, allowedUsers.map((user) => user.id)));
  const allowedGroupIds = new Set(memberships.map((membership) => membership.teamId));
  return (await getTeams()).filter(
    (team) => allowedGroupIds.has(team.id) && team.memberCount > 0,
  );
}

/**
 * Expand membership rows that may point at a user OR an app-managed Team into
 * concrete active user ids.
 */
async function expandMemberUserIds(
  rows: { userId: string | null; groupId: string | null }[],
): Promise<Set<string>> {
  const ids = new Set<string>();
  const groupIds: string[] = [];
  for (const r of rows) {
    if (r.userId) ids.add(r.userId);
    if (r.groupId) groupIds.push(r.groupId);
  }
  if (groupIds.length > 0) {
    const groupUsers = await db
      .select({ userId: teamMemberships.userId })
      .from(teamMemberships)
      .where(inArray(teamMemberships.teamId, groupIds));
    for (const g of groupUsers) ids.add(g.userId);
  }
  return ids;
}

/**
 * Users who can access a list (and therefore its tasks) — mirrors RBAC:
 * platform admins, space owners always; private lists only + direct list
 * members; otherwise space/folder inheritance along the parent chain.
 * Used for @-mention pickers so we never offer people without access.
 */
export async function getUsersWithListAccess(
  listId: string,
): Promise<{ id: string; displayName: string; photoKey: string | null }[]> {
  const [list] = await db.select().from(lists).where(eq(lists.id, listId));
  if (!list) return [];

  const candidateIds = new Set<string>();

  // Platform admins always have access.
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.platformRole, "admin")));
  for (const a of admins) candidateIds.add(a.id);

  // Space memberships (user + group).
  const spaceMemberRows = await db
    .select({
      userId: spaceMembers.userId,
      groupId: spaceMembers.groupId,
      role: spaceMembers.role,
    })
    .from(spaceMembers)
    .where(eq(spaceMembers.spaceId, list.spaceId));

  const spaceOwnerRows = spaceMemberRows.filter((r) => r.role === "owner");
  const spaceOwnerIds = await expandMemberUserIds(spaceOwnerRows);
  for (const id of spaceOwnerIds) candidateIds.add(id);

  // Direct list members (always relevant; for private lists they are the only non-owner path).
  const listMemberRows = await db
    .select({ userId: listMembers.userId, groupId: listMembers.groupId })
    .from(listMembers)
    .where(eq(listMembers.listId, listId));
  const listMemberIds = await expandMemberUserIds(listMemberRows);
  for (const id of listMemberIds) candidateIds.add(id);

  if (!list.isPrivate) {
    // Walk folder chain: private folders only contribute their members;
    // non-private folders also inherit parent access; space root = all space members.
    let folderId: string | null = list.folderId;
    let hitPrivateFolder = false;

    while (folderId) {
      const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
      if (!folder) break;

      const folderMemberRows = await db
        .select({ userId: folderMembers.userId, groupId: folderMembers.groupId })
        .from(folderMembers)
        .where(eq(folderMembers.folderId, folderId));
      const folderMemberIds = await expandMemberUserIds(folderMemberRows);
      for (const id of folderMemberIds) candidateIds.add(id);

      if (folder.isPrivate) {
        hitPrivateFolder = true;
        break; // parent roles do not pierce private folders
      }
      folderId = folder.parentFolderId;
    }

    if (!hitPrivateFolder) {
      // Full space membership can see this list.
      const allSpaceIds = await expandMemberUserIds(spaceMemberRows);
      for (const id of allSpaceIds) candidateIds.add(id);
    }
  }

  if (candidateIds.size === 0) return [];

  return db
    .select({ id: users.id, displayName: users.displayName, photoKey: users.photoKey })
    .from(users)
    .where(and(eq(users.isActive, true), inArray(users.id, [...candidateIds])))
    .orderBy(asc(users.displayName));
}

export interface TaskFollowerRow {
  userId: string;
  displayName: string;
  photoKey: string | null;
  createdAt: Date;
}

/** Followers of a task (assignees + anyone who explicitly followed), newest first. */
export async function getTaskFollowers(taskId: string): Promise<TaskFollowerRow[]> {
  const { taskFollowers } = await import("@aitim/db");
  return db
    .select({
      userId: taskFollowers.userId,
      displayName: users.displayName,
      photoKey: users.photoKey,
      createdAt: taskFollowers.createdAt,
    })
    .from(taskFollowers)
    .innerJoin(users, eq(taskFollowers.userId, users.id))
    .where(eq(taskFollowers.taskId, taskId))
    .orderBy(desc(taskFollowers.createdAt));
}

export interface SpaceMemberRow {
  id: string;
  role: "owner" | "member" | "guest";
  userId: string | null;
  groupId: string | null;
  principalType: "user" | "group";
  displayName: string;
  email: string | null;
  alias: string | null;
}

export const getSpaceMembers = cache(async (spaceId: string): Promise<SpaceMemberRow[]> => {
  const rows = await db
    .select({
      id: spaceMembers.id,
      role: spaceMembers.role,
      userId: spaceMembers.userId,
      groupId: spaceMembers.groupId,
      principalType: spaceMembers.principalType,
      displayName: sql<string>`coalesce(${users.displayName}, ${teams.displayName})`,
      email: users.email,
      alias: teams.alias,
    })
    .from(spaceMembers)
    .leftJoin(users, eq(spaceMembers.userId, users.id))
    .leftJoin(teams, eq(spaceMembers.groupId, teams.id))
    .where(eq(spaceMembers.spaceId, spaceId))
    .orderBy(sql`lower(coalesce(${users.displayName}, ${teams.displayName}))`);
  return rows;
});

export const getListMembers = cache(async (listId: string): Promise<SpaceMemberRow[]> => {
  const rows = await db
    .select({
      id: listMembers.id,
      role: listMembers.role,
      userId: listMembers.userId,
      groupId: listMembers.groupId,
      principalType: listMembers.principalType,
      displayName: sql<string>`coalesce(${users.displayName}, ${teams.displayName})`,
      email: users.email,
      alias: teams.alias,
    })
    .from(listMembers)
    .leftJoin(users, eq(listMembers.userId, users.id))
    .leftJoin(teams, eq(listMembers.groupId, teams.id))
    .where(eq(listMembers.listId, listId))
    .orderBy(sql`lower(coalesce(${users.displayName}, ${teams.displayName}))`);
  return rows;
});

export interface SecretCategoryRow {
  id: string;
  name: string;
  color: string;
}

/** Categories defined on a list's Secrets vault, in display order. */
export const getSecretCategories = cache(async (listId: string): Promise<SecretCategoryRow[]> => {
  return db
    .select({ id: secretCategories.id, name: secretCategories.name, color: secretCategories.color })
    .from(secretCategories)
    .where(eq(secretCategories.listId, listId))
    .orderBy(asc(secretCategories.position), asc(secretCategories.createdAt));
});

export interface SecretViewerRow {
  id: string;
  userId: string | null;
  displayName: string;
  email: string | null;
}

/** People explicitly granted Secrets-vault access on this list (space owners aren't listed — they always have it). */
export const getSecretViewers = cache(async (listId: string): Promise<SecretViewerRow[]> => {
  return db
    .select({
      id: listSecretViewers.id,
      userId: listSecretViewers.userId,
      displayName: users.displayName,
      email: users.email,
    })
    .from(listSecretViewers)
    .innerJoin(users, eq(listSecretViewers.userId, users.id))
    .where(eq(listSecretViewers.listId, listId))
    .orderBy(asc(users.displayName));
});

export const getFolderMembers = cache(async (folderId: string): Promise<SpaceMemberRow[]> => {
  const rows = await db
    .select({
      id: folderMembers.id,
      role: folderMembers.role,
      userId: folderMembers.userId,
      groupId: folderMembers.groupId,
      principalType: folderMembers.principalType,
      displayName: sql<string>`coalesce(${users.displayName}, ${teams.displayName})`,
      email: users.email,
      alias: teams.alias,
    })
    .from(folderMembers)
    .leftJoin(users, eq(folderMembers.userId, users.id))
    .leftJoin(teams, eq(folderMembers.groupId, teams.id))
    .where(eq(folderMembers.folderId, folderId))
    .orderBy(sql`lower(coalesce(${users.displayName}, ${teams.displayName}))`);
  return rows;
});

export type TaskComment = {
  id: string;
  body: unknown;
  createdAt: Date;
  editedAt: Date | null;
  authorId: string;
  authorName: string;
  authorPhotoKey: string | null;
  parentCommentId: string | null;
};

export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  const { comments } = await import("@aitim/db");
  const { isNull } = await import("drizzle-orm");
  return db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      authorId: comments.authorId,
      authorName: users.displayName,
      authorPhotoKey: users.photoKey,
      parentCommentId: comments.parentCommentId,
    })
    .from(comments)
    .innerJoin(users, eq(comments.authorId, users.id))
    .where(and(eq(comments.taskId, taskId), isNull(comments.deletedAt)))
    .orderBy(asc(comments.createdAt));
}

export async function getTaskAttachments(taskId: string) {
  const { attachments } = await import("@aitim/db");
  return db
    .select({
      id: attachments.id,
      folderId: attachments.folderId,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      createdAt: attachments.createdAt,
      uploaderId: attachments.uploaderId,
      uploaderName: users.displayName,
    })
    .from(attachments)
    .leftJoin(users, eq(attachments.uploaderId, users.id))
    .where(eq(attachments.taskId, taskId))
    .orderBy(asc(attachments.createdAt));
}

export async function getTaskAttachmentFolders(taskId: string) {
  const { attachmentFolders } = await import("@aitim/db");
  return db
    .select({
      id: attachmentFolders.id,
      parentFolderId: attachmentFolders.parentFolderId,
      name: attachmentFolders.name,
      createdAt: attachmentFolders.createdAt,
    })
    .from(attachmentFolders)
    .where(eq(attachmentFolders.taskId, taskId))
    .orderBy(asc(attachmentFolders.name));
}

export type { TrashItem, TrashItemKind } from "./lib/trash";
export { TRASH_RETENTION_DAYS } from "./lib/trash";
import type { TrashItem } from "./lib/trash";

/**
 * Trashed spaces / folders / lists / tasks / custom fields.
 * - Default: items the user can manage (space Admin / Super Admin via getSpaceRole).
 * - `scope: "all"`: every trashed item (Super Admin / platform admin only — caller must gate).
 *
 * Nested items deleted with a parent space/folder are listed only when the parent is still
 * alive; when a space is trashed, only the space row is shown.
 */
export async function getTrashItemsForUser(
  user: SessionUserLike,
  opts?: { scope?: "managed" | "all" },
): Promise<TrashItem[]> {
  const scope = opts?.scope ?? "managed";
  const [spaceRows, folderRows, listRows, taskRows, fieldRows] = await Promise.all([
    db
      .select({
        id: spaces.id,
        name: spaces.name,
        slug: spaces.slug,
        deletedAt: spaces.deletedAt,
      })
      .from(spaces)
      .where(isNotNull(spaces.deletedAt)),
    db
      .select({
        id: folders.id,
        name: folders.name,
        deletedAt: folders.deletedAt,
        spaceId: folders.spaceId,
        spaceName: spaces.name,
        spaceSlug: spaces.slug,
        spaceDeletedAt: spaces.deletedAt,
      })
      .from(folders)
      .innerJoin(spaces, eq(folders.spaceId, spaces.id))
      .where(isNotNull(folders.deletedAt)),
    db
      .select({
        id: lists.id,
        name: lists.name,
        deletedAt: lists.deletedAt,
        spaceId: lists.spaceId,
        spaceName: spaces.name,
        spaceSlug: spaces.slug,
        spaceDeletedAt: spaces.deletedAt,
        folderId: lists.folderId,
        folderName: folders.name,
        folderDeletedAt: folders.deletedAt,
      })
      .from(lists)
      .innerJoin(spaces, eq(lists.spaceId, spaces.id))
      .leftJoin(folders, eq(lists.folderId, folders.id))
      .where(isNotNull(lists.deletedAt)),
    db
      .select({
        id: tasks.id,
        name: tasks.title,
        number: tasks.number,
        deletedAt: tasks.deletedAt,
        parentTaskId: tasks.parentTaskId,
        listId: tasks.listId,
        listName: lists.name,
        listSlug: lists.slug,
        listDeletedAt: lists.deletedAt,
        spaceId: lists.spaceId,
        spaceName: spaces.name,
        spaceSlug: spaces.slug,
        spaceDeletedAt: spaces.deletedAt,
      })
      .from(tasks)
      .innerJoin(lists, eq(tasks.listId, lists.id))
      .innerJoin(spaces, eq(lists.spaceId, spaces.id))
      .where(isNotNull(tasks.deletedAt)),
    db
      .select({
        id: customFieldDefinitions.id,
        name: customFieldDefinitions.label,
        deletedAt: customFieldDefinitions.deletedAt,
        listId: lists.id,
        listName: lists.name,
        listDeletedAt: lists.deletedAt,
        spaceId: lists.spaceId,
        spaceName: spaces.name,
        spaceSlug: spaces.slug,
        spaceDeletedAt: spaces.deletedAt,
      })
      .from(customFieldDefinitions)
      .innerJoin(lists, eq(customFieldDefinitions.listId, lists.id))
      .innerJoin(spaces, eq(lists.spaceId, spaces.id))
      .where(isNotNull(customFieldDefinitions.deletedAt)),
  ]);

  const spaceIds = [
    ...new Set([
      ...spaceRows.map((s) => s.id),
      ...folderRows.map((f) => f.spaceId),
      ...listRows.map((l) => l.spaceId),
      ...taskRows.map((t) => t.spaceId),
      ...fieldRows.map((f) => f.spaceId),
    ]),
  ];

  let canManage: Set<string>;
  if (scope === "all" && user.platformRole === "admin") {
    canManage = new Set(spaceIds);
  } else {
    const { userHasPermission } = await import("@/lib/permissions");
    const hasGlobalTrashPerm = await userHasPermission(user, "manage_trash");
    if (hasGlobalTrashPerm) {
      canManage = new Set(spaceIds);
    } else {
      const roles = await Promise.all(
        spaceIds.map(
          async (spaceId) =>
            [spaceId, await getSpaceRole(user.id, spaceId, user.platformRole)] as const,
        ),
      );
      canManage = new Set(roles.filter(([, r]) => r === "owner").map(([id]) => id));
    }
  }

  const items: TrashItem[] = [];

  for (const s of spaceRows) {
    if (!canManage.has(s.id) || !s.deletedAt) continue;
    items.push({
      kind: "space",
      id: s.id,
      name: s.name,
      deletedAt: s.deletedAt,
      spaceId: s.id,
      spaceName: s.name,
      spaceSlug: s.slug,
      parentName: null,
    });
  }

  // Hide nested folder/list rows when their parent space is also trashed (restore space restores all).
  for (const f of folderRows) {
    if (!canManage.has(f.spaceId) || !f.deletedAt || f.spaceDeletedAt) continue;
    items.push({
      kind: "folder",
      id: f.id,
      name: f.name,
      deletedAt: f.deletedAt,
      spaceId: f.spaceId,
      spaceName: f.spaceName,
      spaceSlug: f.spaceSlug,
      parentName: f.spaceName,
    });
  }

  for (const l of listRows) {
    if (!canManage.has(l.spaceId) || !l.deletedAt || l.spaceDeletedAt) continue;
    // Hide lists that were trashed as part of a still-trashed parent folder.
    if (l.folderId && l.folderDeletedAt) continue;
    items.push({
      kind: "list",
      id: l.id,
      name: l.name,
      deletedAt: l.deletedAt,
      spaceId: l.spaceId,
      spaceName: l.spaceName,
      spaceSlug: l.spaceSlug,
      parentName: l.folderName ?? l.spaceName,
    });
  }

  // Hide task rows whose own list (or that list's space) is also trashed —
  // restoring the list/space brings the task back with it. Same for a subtask
  // whose parent task is also trashed (restoring the parent restores it too).
  const trashedTaskIds = new Set(taskRows.filter((t) => t.deletedAt).map((t) => t.id));
  for (const t of taskRows) {
    if (!canManage.has(t.spaceId) || !t.deletedAt || t.spaceDeletedAt || t.listDeletedAt) continue;
    if (t.parentTaskId && trashedTaskIds.has(t.parentTaskId)) continue;
    items.push({
      kind: "task",
      id: t.id,
      name: t.name,
      deletedAt: t.deletedAt,
      spaceId: t.spaceId,
      spaceName: t.spaceName,
      spaceSlug: t.spaceSlug,
      parentName: t.listName,
      listId: t.listId,
      listSlug: t.listSlug,
      taskNumber: t.number,
    });
  }

  for (const f of fieldRows) {
    if (!canManage.has(f.spaceId) || !f.deletedAt || f.spaceDeletedAt || f.listDeletedAt) continue;
    items.push({
      kind: "custom_field",
      id: f.id,
      name: f.name,
      deletedAt: f.deletedAt,
      spaceId: f.spaceId,
      spaceName: f.spaceName,
      spaceSlug: f.spaceSlug,
      parentName: f.listName,
      listId: f.listId,
    });
  }

  items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
  return items;
}
