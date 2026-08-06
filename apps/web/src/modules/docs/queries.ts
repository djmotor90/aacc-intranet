/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  db,
  docFolders,
  docLinks,
  docPages,
  lists,
  spaceMembers,
  spaces,
  statuses,
  tasks,
  userGroupMemberships,
  users,
} from "@aitim/db";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { getSpaceRole } from "@/lib/rbac";
import type { SessionUserLike } from "@/modules/types";
import { isDocStale } from "./lib/constants";

export type DocPageListItem = {
  id: string;
  /** Shared doc container id (for move whole-doc). */
  docId: string;
  title: string;
  slug: string;
  icon: string | null;
  kind: "page" | "wiki";
  homeSpaceId: string;
  spaceName: string;
  spaceSlug: string;
  parentPageId: string | null;
  folderId: string | null;
  isProtected: boolean;
  ownerId: string | null;
  ownerName: string | null;
  ownerPhotoKey: string | null;
  verifiedAt: string | null;
  isStale: boolean;
  updatedAt: string;
  createdAt: string;
  linkCount: number;
  /** Other pages in the same doc (hub). */
  childCount: number;
};

export type DocFolderListItem = {
  id: string;
  name: string;
  homeSpaceId: string;
  spaceName: string;
  parentFolderId: string | null;
  updatedAt: string;
  /** Immediate child folders + docs in this folder. */
  itemCount: number;
};

export type DocPageDetail = DocPageListItem & {
  body: unknown;
  bodyVersion: number;
  coverObjectKey: string | null;
  position: string;
  createdById: string | null;
  updatedById: string | null;
  deletedAt: string | null;
  canEdit: boolean;
  canManage: boolean;
};

async function accessibleSpaceIds(user: SessionUserLike): Promise<string[] | "all"> {
  if (user.platformRole === "admin") return "all";

  const groupRows = await db
    .select({ groupId: userGroupMemberships.groupId })
    .from(userGroupMemberships)
    .where(eq(userGroupMemberships.userId, user.id));
  const groupIds = groupRows.map((g) => g.groupId);

  const memberships = await db
    .select({ spaceId: spaceMembers.spaceId })
    .from(spaceMembers)
    .where(
      or(
        eq(spaceMembers.userId, user.id),
        groupIds.length > 0 ? inArray(spaceMembers.groupId, groupIds) : undefined,
      ),
    );

  return [...new Set(memberships.map((m) => m.spaceId))];
}

function mapListRow(row: {
  id: string;
  docId?: string;
  title: string;
  slug: string;
  icon: string | null;
  kind: "page" | "wiki";
  homeSpaceId: string;
  spaceName: string;
  spaceSlug: string;
  parentPageId: string | null;
  folderId?: string | null;
  isProtected: boolean;
  ownerId: string | null;
  ownerName: string | null;
  ownerPhotoKey?: string | null;
  verifiedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
  linkCount: number;
  childCount?: number;
}): DocPageListItem {
  return {
    id: row.id,
    docId: row.docId ?? row.id,
    title: row.title,
    slug: row.slug,
    icon: row.icon,
    kind: row.kind,
    homeSpaceId: row.homeSpaceId,
    spaceName: row.spaceName,
    spaceSlug: row.spaceSlug,
    parentPageId: row.parentPageId,
    folderId: row.folderId ?? null,
    isProtected: row.isProtected,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    ownerPhotoKey: row.ownerPhotoKey ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    isStale: isDocStale(row.verifiedAt),
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    linkCount: row.linkCount,
    childCount: row.childCount ?? 0,
  };
}

export async function listDocsHub(
  user: SessionUserLike,
  opts: {
    q?: string;
    filter?: "all" | "recent" | "mine" | "wikis";
    limit?: number;
    /** null = root; undefined = any folder (search across all). */
    folderId?: string | null;
  } = {},
): Promise<DocPageListItem[]> {
  try {
    return await listDocsHubInner(user, opts);
  } catch (err) {
    console.error("[docs] listDocsHub failed:", err);
    return [];
  }
}

export async function listDocFoldersHub(
  user: SessionUserLike,
  opts: {
    /** null = root folders */
    parentFolderId?: string | null;
    q?: string;
  } = {},
): Promise<DocFolderListItem[]> {
  try {
    return await listDocFoldersHubInner(user, opts);
  } catch (err) {
    console.error("[docs] listDocFoldersHub failed:", err);
    return [];
  }
}

export async function getDocFolderBreadcrumb(
  user: SessionUserLike,
  folderId: string | null,
): Promise<{ id: string; name: string }[]> {
  if (!folderId) return [];
  try {
    const crumbs: { id: string; name: string }[] = [];
    let cursor: string | null = folderId;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const [row] = await db
        .select({
          id: docFolders.id,
          name: docFolders.name,
          parentFolderId: docFolders.parentFolderId,
          homeSpaceId: docFolders.homeSpaceId,
          deletedAt: docFolders.deletedAt,
        })
        .from(docFolders)
        .where(eq(docFolders.id, cursor))
        .limit(1);
      if (!row || row.deletedAt) break;
      const role = await getSpaceRole(user.id, row.homeSpaceId, user.platformRole);
      if (!role) break;
      crumbs.unshift({ id: row.id, name: row.name });
      cursor = row.parentFolderId;
    }
    return crumbs;
  } catch {
    return [];
  }
}

async function listDocFoldersHubInner(
  user: SessionUserLike,
  opts: {
    parentFolderId?: string | null;
    q?: string;
  },
): Promise<DocFolderListItem[]> {
  const spaceIds = await accessibleSpaceIds(user);
  if (spaceIds !== "all" && spaceIds.length === 0) return [];

  const parentFolderId = opts.parentFolderId ?? null;
  const q = opts.q?.trim();

  const conditions = [isNull(docFolders.deletedAt)];
  if (spaceIds !== "all") {
    conditions.push(inArray(docFolders.homeSpaceId, spaceIds));
  }
  // When searching, show matching folders anywhere; otherwise only current parent.
  if (q) {
    conditions.push(ilike(docFolders.name, `%${q}%`));
  } else {
    conditions.push(
      parentFolderId
        ? eq(docFolders.parentFolderId, parentFolderId)
        : isNull(docFolders.parentFolderId),
    );
  }

  const rows = await db
    .select({
      id: docFolders.id,
      name: docFolders.name,
      homeSpaceId: docFolders.homeSpaceId,
      spaceName: spaces.name,
      parentFolderId: docFolders.parentFolderId,
      updatedAt: docFolders.updatedAt,
      itemCount: sql<number>`(
        (
          select count(*)::int from doc_folders as kids
          where kids.parent_folder_id = ${docFolders.id} and kids.deleted_at is null
        ) + (
          select count(distinct p.doc_id)::int from doc_pages p
          where p.folder_id = ${docFolders.id} and p.deleted_at is null
        )
      )`,
    })
    .from(docFolders)
    .innerJoin(spaces, eq(docFolders.homeSpaceId, spaces.id))
    .where(and(...conditions))
    .orderBy(asc(docFolders.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    homeSpaceId: r.homeSpaceId,
    spaceName: r.spaceName,
    parentFolderId: r.parentFolderId,
    updatedAt: r.updatedAt.toISOString(),
    itemCount: r.itemCount,
  }));
}

async function listDocsHubInner(
  user: SessionUserLike,
  opts: {
    q?: string;
    filter?: "all" | "recent" | "mine" | "wikis";
    limit?: number;
    folderId?: string | null;
  },
): Promise<DocPageListItem[]> {
  const spaceIds = await accessibleSpaceIds(user);
  if (spaceIds !== "all" && spaceIds.length === 0) return [];

  const filter = opts.filter ?? "recent";
  const limit = opts.limit ?? 50;
  const q = opts.q?.trim();
  // When searching, ignore folder scope so results surface from any folder.
  const folderId = q ? undefined : opts.folderId;

  // One hub card per doc (doc_id). Top-level pages are equal peers (parent null).
  const conditions = [isNull(docPages.deletedAt), isNull(docPages.parentPageId)];
  if (spaceIds !== "all") {
    conditions.push(inArray(docPages.homeSpaceId, spaceIds));
  }
  if (folderId === null) {
    conditions.push(isNull(docPages.folderId));
  } else if (typeof folderId === "string") {
    conditions.push(eq(docPages.folderId, folderId));
  }
  if (filter === "mine") {
    conditions.push(eq(docPages.ownerId, user.id));
  }
  if (filter === "wikis") {
    conditions.push(eq(docPages.kind, "wiki"));
  }
  if (q) {
    // Match any page in the doc (title/body), not only the card representative.
    conditions.push(
      sql`${docPages.docId} in (
        select m.doc_id from doc_pages m
        where m.deleted_at is null
          and (
            m.title ilike ${`%${q}%`}
            or coalesce(m.body->>'text','') ilike ${`%${q}%`}
          )
      )`,
    );
  }

  const rows = await db
    .select({
      id: docPages.id,
      docId: docPages.docId,
      folderId: docPages.folderId,
      title: docPages.title,
      slug: docPages.slug,
      icon: docPages.icon,
      kind: docPages.kind,
      homeSpaceId: docPages.homeSpaceId,
      spaceName: spaces.name,
      spaceSlug: spaces.slug,
      parentPageId: docPages.parentPageId,
      position: docPages.position,
      isProtected: docPages.isProtected,
      ownerId: docPages.ownerId,
      ownerName: users.displayName,
      ownerPhotoKey: users.photoKey,
      verifiedAt: docPages.verifiedAt,
      updatedAt: docPages.updatedAt,
      createdAt: docPages.createdAt,
      linkCount: sql<number>`(
        select count(*)::int from ${docLinks} where ${docLinks.pageId} = ${docPages.id}
      )`,
      // Other pages in the same doc (peers + nested).
      childCount: sql<number>`(
        select count(*)::int from doc_pages as kids
        where kids.doc_id = ${docPages.docId}
          and kids.id <> ${docPages.id}
          and kids.deleted_at is null
      )`,
      docUpdatedAt: sql<Date>`(
        select max(u.updated_at) from doc_pages u
        where u.doc_id = ${docPages.docId} and u.deleted_at is null
      )`,
    })
    .from(docPages)
    .innerJoin(spaces, eq(docPages.homeSpaceId, spaces.id))
    .leftJoin(users, eq(docPages.ownerId, users.id))
    .where(and(...conditions))
    .orderBy(asc(docPages.position), asc(docPages.title));

  // Collapse multiple top-level peers into one hub card per doc (first by position).
  const byDoc = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const prev = byDoc.get(row.docId);
    if (!prev) {
      byDoc.set(row.docId, row);
      continue;
    }
    // Prefer earlier position as the card face; keep newest doc activity for sort.
    if (
      row.position < prev.position ||
      (row.position === prev.position && row.title < prev.title)
    ) {
      byDoc.set(row.docId, {
        ...row,
        childCount: row.childCount,
        docUpdatedAt: prev.docUpdatedAt > row.docUpdatedAt ? prev.docUpdatedAt : row.docUpdatedAt,
      });
    } else if (row.docUpdatedAt > prev.docUpdatedAt) {
      byDoc.set(row.docId, { ...prev, docUpdatedAt: row.docUpdatedAt });
    }
  }

  return [...byDoc.values()]
    .sort((a, b) => {
      const ta = new Date(a.docUpdatedAt ?? a.updatedAt).getTime();
      const tb = new Date(b.docUpdatedAt ?? b.updatedAt).getTime();
      return tb - ta;
    })
    .slice(0, limit)
    .map((row) =>
      mapListRow({
        ...row,
        updatedAt: row.docUpdatedAt ? new Date(row.docUpdatedAt) : row.updatedAt,
      }),
    );
}

export async function getPageForUser(
  user: SessionUserLike,
  pageId: string,
): Promise<DocPageDetail | null> {
  const [row] = await db
    .select({
      id: docPages.id,
      docId: docPages.docId,
      folderId: docPages.folderId,
      title: docPages.title,
      slug: docPages.slug,
      icon: docPages.icon,
      kind: docPages.kind,
      homeSpaceId: docPages.homeSpaceId,
      spaceName: spaces.name,
      spaceSlug: spaces.slug,
      parentPageId: docPages.parentPageId,
      isProtected: docPages.isProtected,
      ownerId: docPages.ownerId,
      ownerName: users.displayName,
      ownerPhotoKey: users.photoKey,
      verifiedAt: docPages.verifiedAt,
      updatedAt: docPages.updatedAt,
      createdAt: docPages.createdAt,
      body: docPages.body,
      bodyVersion: docPages.bodyVersion,
      coverObjectKey: docPages.coverObjectKey,
      position: docPages.position,
      createdById: docPages.createdById,
      updatedById: docPages.updatedById,
      deletedAt: docPages.deletedAt,
      linkCount: sql<number>`(
        select count(*)::int from ${docLinks} where ${docLinks.pageId} = ${docPages.id}
      )`,
    })
    .from(docPages)
    .innerJoin(spaces, eq(docPages.homeSpaceId, spaces.id))
    .leftJoin(users, eq(docPages.ownerId, users.id))
    .where(eq(docPages.id, pageId))
    .limit(1);

  if (!row || row.deletedAt != null) return null;

  const role = await getSpaceRole(user.id, row.homeSpaceId, user.platformRole);
  if (!role) return null;

  const { canEditPageContent, canManagePage } = await import("./lib/access");
  const canEdit = await canEditPageContent(user, row.homeSpaceId, row.isProtected);
  const canManage = await canManagePage(user, row.homeSpaceId);

  return {
    ...mapListRow({
      id: row.id,
      docId: row.docId,
      folderId: row.folderId,
      title: row.title,
      slug: row.slug,
      icon: row.icon,
      kind: row.kind,
      homeSpaceId: row.homeSpaceId,
      spaceName: row.spaceName,
      spaceSlug: row.spaceSlug,
      parentPageId: row.parentPageId,
      isProtected: row.isProtected,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      ownerPhotoKey: row.ownerPhotoKey,
      verifiedAt: row.verifiedAt,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
      linkCount: row.linkCount,
    }),
    body: row.body,
    bodyVersion: row.bodyVersion,
    coverObjectKey: row.coverObjectKey,
    position: row.position,
    createdById: row.createdById,
    updatedById: row.updatedById,
    deletedAt: null,
    canEdit,
    canManage,
  };
}

export async function listChildPages(
  user: SessionUserLike,
  parentPageId: string | null,
  homeSpaceId: string,
) {
  const role = await getSpaceRole(user.id, homeSpaceId, user.platformRole);
  if (!role) return [];

  const rows = await db
    .select({
      id: docPages.id,
      title: docPages.title,
      slug: docPages.slug,
      icon: docPages.icon,
      kind: docPages.kind,
      parentPageId: docPages.parentPageId,
      position: docPages.position,
      isProtected: docPages.isProtected,
      updatedAt: docPages.updatedAt,
    })
    .from(docPages)
    .where(
      and(
        eq(docPages.homeSpaceId, homeSpaceId),
        parentPageId
          ? eq(docPages.parentPageId, parentPageId)
          : isNull(docPages.parentPageId),
        isNull(docPages.deletedAt),
      ),
    )
    .orderBy(asc(docPages.position), asc(docPages.title));

  return rows.map((r) => ({
    ...r,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export type DocOutlineNode = {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  parentPageId: string | null;
  children: DocOutlineNode[];
};

/**
 * Full page forest for one Doc (docId). All top-level pages (parent null)
 * are equal peers — there is no privileged home page.
 */
export async function getDocOutlineForPage(
  user: SessionUserLike,
  pageId: string,
): Promise<{
  /** Shared container id for this Doc. */
  docId: string;
  /** Display title for the doc chrome (first top-level page by position). */
  docTitle: string;
  /** @deprecated alias of docId — kept for existing callers */
  rootId: string;
  /** @deprecated alias of docTitle */
  rootTitle: string;
  homeSpaceId: string;
  /** Forest of equal top-level pages (each may have nested children). */
  tree: DocOutlineNode[];
  ancestors: { id: string; title: string; slug: string }[];
} | null> {
  const [start] = await db
    .select({
      id: docPages.id,
      title: docPages.title,
      slug: docPages.slug,
      homeSpaceId: docPages.homeSpaceId,
      parentPageId: docPages.parentPageId,
      docId: docPages.docId,
      deletedAt: docPages.deletedAt,
    })
    .from(docPages)
    .where(eq(docPages.id, pageId))
    .limit(1);
  if (!start || start.deletedAt) return null;

  const role = await getSpaceRole(user.id, start.homeSpaceId, user.platformRole);
  if (!role) return null;

  // Breadcrumb = real parent chain only (no fake "home" container page).
  const ancestors: { id: string; title: string; slug: string }[] = [];
  let cursor: {
    id: string;
    title: string;
    slug: string;
    parentPageId: string | null;
  } | null = start;
  const seen = new Set<string>();
  while (cursor?.parentPageId) {
    if (seen.has(cursor.id)) break;
    seen.add(cursor.id);
    const [parent] = await db
      .select({
        id: docPages.id,
        title: docPages.title,
        slug: docPages.slug,
        parentPageId: docPages.parentPageId,
        deletedAt: docPages.deletedAt,
      })
      .from(docPages)
      .where(eq(docPages.id, cursor.parentPageId))
      .limit(1);
    if (!parent || parent.deletedAt) break;
    ancestors.unshift({ id: parent.id, title: parent.title, slug: parent.slug });
    cursor = parent;
  }

  // All pages in this doc (forest).
  const all = await db
    .select({
      id: docPages.id,
      title: docPages.title,
      slug: docPages.slug,
      icon: docPages.icon,
      parentPageId: docPages.parentPageId,
      position: docPages.position,
    })
    .from(docPages)
    .where(and(eq(docPages.docId, start.docId), isNull(docPages.deletedAt)))
    .orderBy(asc(docPages.position), asc(docPages.title));

  const byParent = new Map<string | null, typeof all>();
  for (const p of all) {
    const key = p.parentPageId;
    const list = byParent.get(key) ?? [];
    list.push(p);
    byParent.set(key, list);
  }

  function build(parentId: string | null): DocOutlineNode[] {
    const kids = byParent.get(parentId) ?? [];
    return kids.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      icon: p.icon,
      parentPageId: p.parentPageId,
      children: build(p.id),
    }));
  }

  const tree = build(null);
  const first = tree[0];
  const docTitle = first?.title ?? start.title;

  return {
    docId: start.docId,
    docTitle,
    rootId: start.docId,
    rootTitle: docTitle,
    homeSpaceId: start.homeSpaceId,
    tree,
    ancestors,
  };
}

export async function listSpacesForDocs(user: SessionUserLike) {
  const spaceIds = await accessibleSpaceIds(user);
  if (spaceIds !== "all" && spaceIds.length === 0) return [];

  const rows = await db
    .select({
      id: spaces.id,
      name: spaces.name,
      slug: spaces.slug,
      icon: spaces.icon,
      color: spaces.color,
    })
    .from(spaces)
    .where(
      and(
        isNull(spaces.deletedAt),
        eq(spaces.isArchived, false),
        spaceIds === "all" ? undefined : inArray(spaces.id, spaceIds),
      ),
    )
    .orderBy(asc(spaces.name));

  return rows;
}

export async function listPagesLinkedToTarget(
  user: SessionUserLike,
  targetType: "space" | "folder" | "list" | "task",
  targetId: string,
): Promise<DocPageListItem[]> {
  try {
    return await listPagesLinkedToTargetInner(user, targetType, targetId);
  } catch (err) {
    console.error("[docs] listPagesLinkedToTarget failed:", err);
    return [];
  }
}

async function listPagesLinkedToTargetInner(
  user: SessionUserLike,
  targetType: "space" | "folder" | "list" | "task",
  targetId: string,
): Promise<DocPageListItem[]> {
  const rows = await db
    .select({
      id: docPages.id,
      docId: docPages.docId,
      folderId: docPages.folderId,
      title: docPages.title,
      slug: docPages.slug,
      icon: docPages.icon,
      kind: docPages.kind,
      homeSpaceId: docPages.homeSpaceId,
      spaceName: spaces.name,
      spaceSlug: spaces.slug,
      parentPageId: docPages.parentPageId,
      isProtected: docPages.isProtected,
      ownerId: docPages.ownerId,
      ownerName: users.displayName,
      ownerPhotoKey: users.photoKey,
      verifiedAt: docPages.verifiedAt,
      updatedAt: docPages.updatedAt,
      createdAt: docPages.createdAt,
      linkCount: sql<number>`1`,
    })
    .from(docLinks)
    .innerJoin(docPages, eq(docLinks.pageId, docPages.id))
    .innerJoin(spaces, eq(docPages.homeSpaceId, spaces.id))
    .leftJoin(users, eq(docPages.ownerId, users.id))
    .where(
      and(
        eq(docLinks.targetType, targetType),
        eq(docLinks.targetId, targetId),
        isNull(docPages.deletedAt),
      ),
    )
    .orderBy(desc(docPages.updatedAt));

  const out: DocPageListItem[] = [];
  for (const row of rows) {
    const role = await getSpaceRole(user.id, row.homeSpaceId, user.platformRole);
    if (!role) continue;
    out.push(mapListRow(row));
  }
  return out;
}

export async function listPageLinks(pageId: string) {
  return db
    .select({
      id: docLinks.id,
      targetType: docLinks.targetType,
      targetId: docLinks.targetId,
      createdAt: docLinks.createdAt,
    })
    .from(docLinks)
    .where(eq(docLinks.pageId, pageId));
}

/** Lightweight task lookup for doc embeds (no tasks-module import). Gated on the caller having access to the task's space — embeds must not leak titles from spaces the user can't see. */
export async function resolveTaskEmbedMeta(
  user: SessionUserLike,
  taskNumber: string,
): Promise<{
  id: string;
  number: string;
  title: string;
  statusName: string | null;
  statusColor: string | null;
} | null> {
  const num = taskNumber.trim();
  if (!num) return null;
  const [row] = await db
    .select({
      id: tasks.id,
      number: tasks.number,
      title: tasks.title,
      statusName: statuses.name,
      statusColor: statuses.color,
      spaceId: lists.spaceId,
    })
    .from(tasks)
    .innerJoin(lists, eq(tasks.listId, lists.id))
    .leftJoin(statuses, eq(tasks.statusId, statuses.id))
    .where(eq(tasks.number, num))
    .limit(1);
  if (!row) return null;

  const role = await getSpaceRole(user.id, row.spaceId, user.platformRole);
  if (!role) return null;

  return {
    id: row.id,
    number: row.number,
    title: row.title,
    statusName: row.statusName,
    statusColor: row.statusColor,
  };
}

/**
 * Resolve display labels for linked work items (ids only — no tasks module
 * import). Filtered to spaces the caller can access: a page's own linked
 * items can point at tasks/lists/spaces outside the page's home space, so
 * this can't just trust `getPageForUser`'s access check on the page itself.
 */
export async function resolveLinkLabels(
  user: SessionUserLike,
  links: { targetType: string; targetId: string }[],
): Promise<Record<string, { label: string; href: string | null }>> {
  const out: Record<string, { label: string; href: string | null }> = {};
  const accessibleIds = await accessibleSpaceIds(user);
  const hasAccess = (spaceId: string) =>
    accessibleIds === "all" || accessibleIds.includes(spaceId);

  const tasksIds = links.filter((l) => l.targetType === "task").map((l) => l.targetId);
  const listIds = links.filter((l) => l.targetType === "list").map((l) => l.targetId);
  const spaceIds = links.filter((l) => l.targetType === "space").map((l) => l.targetId);

  if (tasksIds.length) {
    const rows = await db
      .select({
        id: tasks.id,
        number: tasks.number,
        title: tasks.title,
        spaceId: lists.spaceId,
      })
      .from(tasks)
      .innerJoin(lists, eq(tasks.listId, lists.id))
      .where(inArray(tasks.id, tasksIds));
    for (const t of rows) {
      if (!hasAccess(t.spaceId)) continue;
      out[`task:${t.id}`] = {
        label: `${t.number} · ${t.title}`,
        href: `/tasks/task/${t.number}`,
      };
    }
  }
  if (listIds.length) {
    const rows = await db
      .select({
        id: lists.id,
        name: lists.name,
        slug: lists.slug,
        spaceId: lists.spaceId,
        spaceSlug: spaces.slug,
      })
      .from(lists)
      .innerJoin(spaces, eq(lists.spaceId, spaces.id))
      .where(inArray(lists.id, listIds));
    for (const l of rows) {
      if (!hasAccess(l.spaceId)) continue;
      out[`list:${l.id}`] = {
        label: l.name,
        href: `/tasks/${l.spaceSlug}/${l.slug}`,
      };
    }
  }
  if (spaceIds.length) {
    const rows = await db
      .select({ id: spaces.id, name: spaces.name, slug: spaces.slug })
      .from(spaces)
      .where(inArray(spaces.id, spaceIds));
    for (const s of rows) {
      if (!hasAccess(s.id)) continue;
      out[`space:${s.id}`] = {
        label: s.name,
        href: `/tasks/${s.slug}`,
      };
    }
  }
  return out;
}
