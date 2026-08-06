/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use server";

import { db, docFolders, docLinks, docPages, spaces } from "@aitim/db";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/rbac";
import {
  assertSpaceAccess,
  assertTargetAccessible,
  canCreatePage,
  canManagePage,
  requireCreateDocs,
  requireEditDocs,
} from "../lib/access";
import { pagePath } from "../lib/constants";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "page"
  );
}

async function uniquePageSlug(
  docId: string,
  parentPageId: string | null,
  base: string,
  excludeId?: string,
) {
  let candidate = base;
  let n = 2;
  for (;;) {
    const rows = await db
      .select({ id: docPages.id })
      .from(docPages)
      .where(
        and(
          eq(docPages.docId, docId),
          parentPageId
            ? eq(docPages.parentPageId, parentPageId)
            : isNull(docPages.parentPageId),
          eq(docPages.slug, candidate),
          excludeId ? ne(docPages.id, excludeId) : undefined,
        ),
      )
      .limit(1);
    if (rows.length === 0) return candidate;
    candidate = `${base}-${n++}`;
  }
}

/** True for a Postgres unique-violation (23505) — the race `uniquePageSlug`'s read-then-insert can't fully close. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

async function nextSiblingPosition(
  docId: string,
  parentPageId: string | null,
): Promise<string> {
  const [last] = await db
    .select({ position: docPages.position })
    .from(docPages)
    .where(
      and(
        eq(docPages.docId, docId),
        parentPageId
          ? eq(docPages.parentPageId, parentPageId)
          : isNull(docPages.parentPageId),
        isNull(docPages.deletedAt),
      ),
    )
    .orderBy(desc(docPages.position))
    .limit(1);
  if (!last) return "a0";
  // Simple lexicographic next: append char — good enough for MVP ordering.
  return `${last.position}a`;
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  homeSpaceId: z.string().uuid(),
  /** Nest under this page (inherits its docId). */
  parentPageId: z.string().uuid().optional().nullable(),
  /**
   * Add a top-level peer page into an existing doc (parent null).
   * Ignored when parentPageId is set. Omit to create a brand-new doc.
   */
  docId: z.string().uuid().optional().nullable(),
  /** Hub folder for a new doc (ignored when nesting into an existing doc). */
  folderId: z.string().uuid().optional().nullable(),
  kind: z.enum(["page", "wiki"]).optional(),
  linkTargetType: z.enum(["space", "folder", "list", "task"]).optional(),
  linkTargetId: z.string().uuid().optional(),
  template: z.enum(["blank", "sop", "meeting", "decision"]).optional(),
});

function templateBody(template: string | undefined, title: string) {
  const empty = { text: "", doc: null as null };
  if (!template || template === "blank") return empty;

  const blocks: Record<string, { text: string; doc: object }> = {
    sop: {
      text: `${title}\n\nPurpose\n\nScope\n\nProcedure\n\n1. \n2. \n\nSafety notes\n`,
      doc: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: title }],
          },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Purpose" }],
          },
          { type: "paragraph" },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Scope" }],
          },
          { type: "paragraph" },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Procedure" }],
          },
          {
            type: "orderedList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
              },
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
              },
            ],
          },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Safety notes" }],
          },
          { type: "paragraph" },
        ],
      },
    },
    meeting: {
      text: `${title}\n\nAttendees\n\nAgenda\n\nNotes\n\nAction items\n`,
      doc: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: title }],
          },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Attendees" }],
          },
          { type: "paragraph" },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Agenda" }],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
              },
            ],
          },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Notes" }],
          },
          { type: "paragraph" },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Action items" }],
          },
          {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: { checked: false },
                content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
              },
            ],
          },
        ],
      },
    },
    decision: {
      text: `${title}\n\nContext\n\nDecision\n\nConsequences\n\nDate\n`,
      doc: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: title }],
          },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Context" }],
          },
          { type: "paragraph" },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Decision" }],
          },
          { type: "paragraph" },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Consequences" }],
          },
          { type: "paragraph" },
        ],
      },
    },
  };

  return blocks[template] ?? empty;
}

export async function createPage(input: z.infer<typeof createSchema>) {
  const user = await requireUser();
  const data = createSchema.parse(input);
  await requireCreateDocs(user, data.homeSpaceId);

  let parentPageId: string | null = data.parentPageId ?? null;
  let docId: string | null = null;
  let folderId: string | null = null;

  if (parentPageId) {
    const [parent] = await db
      .select()
      .from(docPages)
      .where(
        and(
          eq(docPages.id, parentPageId),
          eq(docPages.homeSpaceId, data.homeSpaceId),
          isNull(docPages.deletedAt),
        ),
      )
      .limit(1);
    if (!parent) throw new Error("Parent page not found");
    docId = parent.docId;
    folderId = parent.folderId;
  } else if (data.docId) {
    // Top-level peer in an existing doc.
    const [anchor] = await db
      .select({
        id: docPages.id,
        docId: docPages.docId,
        homeSpaceId: docPages.homeSpaceId,
        folderId: docPages.folderId,
      })
      .from(docPages)
      .where(
        and(
          eq(docPages.docId, data.docId),
          eq(docPages.homeSpaceId, data.homeSpaceId),
          isNull(docPages.deletedAt),
        ),
      )
      .limit(1);
    if (!anchor) throw new Error("Doc not found");
    docId = anchor.docId;
    folderId = anchor.folderId;
    parentPageId = null;
  } else if (data.folderId) {
    const [folder] = await db
      .select()
      .from(docFolders)
      .where(
        and(
          eq(docFolders.id, data.folderId),
          eq(docFolders.homeSpaceId, data.homeSpaceId),
          isNull(docFolders.deletedAt),
        ),
      )
      .limit(1);
    if (!folder) throw new Error("Folder not found");
    folderId = folder.id;
  }

  // New doc: page id === doc id so the container is stable without a separate table.
  const pageId = crypto.randomUUID();
  const resolvedDocId = docId ?? pageId;

  const baseSlug = slugify(data.title);
  const position = await nextSiblingPosition(resolvedDocId, parentPageId);
  const body = templateBody(data.template, data.title);
  const kind = data.kind ?? (data.template === "sop" ? "wiki" : "page");

  // uniquePageSlug is read-then-insert (not atomic), so a concurrent create
  // with the same title can still collide on the DB's unique index. Retry
  // with a freshly re-checked slug instead of surfacing a raw 500.
  let page: typeof docPages.$inferSelect | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = await uniquePageSlug(resolvedDocId, parentPageId, baseSlug);
    try {
      [page] = await db
        .insert(docPages)
        .values({
          id: pageId,
          docId: resolvedDocId,
          folderId,
          homeSpaceId: data.homeSpaceId,
          parentPageId,
          title: data.title.trim(),
          slug,
          kind,
          position,
          body,
          ownerId: user.id,
          createdById: user.id,
          updatedById: user.id,
          verifiedAt: new Date(),
          verifiedById: user.id,
        })
        .returning();
      break;
    } catch (err) {
      if (!isUniqueViolation(err) || attempt === 2) throw err;
    }
  }

  if (data.linkTargetType && data.linkTargetId && page) {
    await db
      .insert(docLinks)
      .values({
        pageId: page.id,
        targetType: data.linkTargetType,
        targetId: data.linkTargetId,
        createdById: user.id,
      })
      .onConflictDoNothing();
  }

  revalidatePath("/docs");
  revalidatePath(pagePath(page!.id, page!.slug));
  return { id: page!.id, slug: page!.slug, path: pagePath(page!.id, page!.slug) };
}

const updateMetaSchema = z.object({
  pageId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  icon: z.string().max(32).nullable().optional(),
  kind: z.enum(["page", "wiki"]).optional(),
});

export async function updatePageMeta(input: z.infer<typeof updateMetaSchema>) {
  const user = await requireUser();
  const data = updateMetaSchema.parse(input);
  const [page] = await db.select().from(docPages).where(eq(docPages.id, data.pageId)).limit(1);
  if (!page || page.deletedAt) throw new Error("Page not found");
  await requireEditDocs(user, page.homeSpaceId, page.isProtected);

  const patch: Partial<typeof docPages.$inferInsert> = {
    updatedById: user.id,
    updatedAt: new Date(),
  };
  if (data.title !== undefined) {
    patch.title = data.title.trim();
    patch.slug = await uniquePageSlug(
      page.docId,
      page.parentPageId,
      slugify(data.title),
      page.id,
    );
  }
  if (data.icon !== undefined) patch.icon = data.icon;
  if (data.kind !== undefined) patch.kind = data.kind;

  const [updated] = await db
    .update(docPages)
    .set(patch)
    .where(eq(docPages.id, page.id))
    .returning();

  revalidatePath("/docs");
  revalidatePath(pagePath(page.id, updated.slug));
  return { id: updated.id, slug: updated.slug, title: updated.title };
}

type DocTransferTarget = {
  docId: string;
  title: string;
  homeSpaceId: string;
  spaceName: string;
};

async function pageSubtree(root: typeof docPages.$inferSelect) {
  const rows = await db
    .select()
    .from(docPages)
    .where(and(eq(docPages.docId, root.docId), isNull(docPages.deletedAt)));
  const children = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.parentPageId) continue;
    const siblings = children.get(row.parentPageId) ?? [];
    siblings.push(row);
    children.set(row.parentPageId, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((a, b) => a.position.localeCompare(b.position));
  }

  const ordered: typeof rows = [];
  const visit = (row: typeof rows[number]) => {
    ordered.push(row);
    for (const child of children.get(row.id) ?? []) visit(child);
  };
  visit(root);
  return ordered;
}

async function copyPageTree({
  userId,
  source,
  destination,
  parentPageId,
  rootTitle,
}: {
  userId: string;
  source: typeof docPages.$inferSelect;
  destination: { docId: string; homeSpaceId: string; folderId: string | null };
  parentPageId: string | null;
  rootTitle: string;
}) {
  const sourceRows = await pageSubtree(source);
  const idMap = new Map(sourceRows.map((row) => [row.id, crypto.randomUUID()]));
  const rootId = idMap.get(source.id)!;
  const rootSlug = await uniquePageSlug(
    destination.docId,
    parentPageId,
    slugify(rootTitle),
  );
  const rootPosition = await nextSiblingPosition(destination.docId, parentPageId);

  const pageValues: (typeof docPages.$inferInsert)[] = sourceRows.map((row) => {
    const isRoot = row.id === source.id;
    return {
      id: idMap.get(row.id)!,
      docId: destination.docId,
      homeSpaceId: destination.homeSpaceId,
      folderId: destination.folderId,
      parentPageId: isRoot
        ? parentPageId
        : row.parentPageId
          ? (idMap.get(row.parentPageId) ?? null)
          : null,
      title: isRoot ? rootTitle : row.title,
      slug: isRoot ? rootSlug : row.slug,
      icon: row.icon,
      coverObjectKey: row.coverObjectKey,
      body: row.body,
      bodyVersion: 0,
      ydocState: null,
      kind: row.kind,
      position: isRoot ? rootPosition : row.position,
      isProtected: false,
      ownerId: userId,
      verifiedAt: null,
      verifiedById: null,
      createdById: userId,
      updatedById: userId,
    };
  });

  const sourceIds = sourceRows.map((row) => row.id);
  const links = await db
    .select({
      pageId: docLinks.pageId,
      targetType: docLinks.targetType,
      targetId: docLinks.targetId,
    })
    .from(docLinks)
    .where(inArray(docLinks.pageId, sourceIds));
  const linkValues = links.map((link) => ({
    pageId: idMap.get(link.pageId)!,
    targetType: link.targetType,
    targetId: link.targetId,
    createdById: userId,
  }));

  await db.transaction(async (tx) => {
    await tx.insert(docPages).values(pageValues);
    if (linkValues.length > 0) await tx.insert(docLinks).values(linkValues);
  });

  return { id: rootId, slug: rootSlug, path: pagePath(rootId, rootSlug) };
}

export async function duplicateDocPage(pageId: string) {
  const user = await requireUser();
  const [source] = await db.select().from(docPages).where(eq(docPages.id, pageId)).limit(1);
  if (!source || source.deletedAt) throw new Error("Page not found");
  await requireEditDocs(user, source.homeSpaceId, source.isProtected);

  const result = await copyPageTree({
    userId: user.id,
    source,
    destination: {
      docId: source.docId,
      homeSpaceId: source.homeSpaceId,
      folderId: source.folderId,
    },
    parentPageId: source.parentPageId,
    rootTitle: `${source.title} copy`,
  });

  revalidatePath("/docs");
  revalidatePath(result.path);
  return result;
}

export async function listDocTransferTargets(pageId: string): Promise<DocTransferTarget[]> {
  const user = await requireUser();
  const [source] = await db.select().from(docPages).where(eq(docPages.id, pageId)).limit(1);
  if (!source || source.deletedAt) throw new Error("Page not found");
  await requireEditDocs(user, source.homeSpaceId, source.isProtected);

  const rows = await db
    .select({
      docId: docPages.docId,
      title: docPages.title,
      homeSpaceId: docPages.homeSpaceId,
      spaceName: spaces.name,
      position: docPages.position,
    })
    .from(docPages)
    .innerJoin(spaces, eq(docPages.homeSpaceId, spaces.id))
    .where(
      and(
        ne(docPages.docId, source.docId),
        isNull(docPages.parentPageId),
        isNull(docPages.deletedAt),
      ),
    )
    .orderBy(asc(docPages.docId), asc(docPages.position))
    .limit(500);

  const targets: DocTransferTarget[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.docId)) continue;
    seen.add(row.docId);
    if (!(await canCreatePage(user, row.homeSpaceId))) continue;
    targets.push({
      docId: row.docId,
      title: row.title,
      homeSpaceId: row.homeSpaceId,
      spaceName: row.spaceName,
    });
    if (targets.length >= 100) break;
  }
  return targets;
}

const transferPageSchema = z.object({
  pageId: z.string().uuid(),
  destinationDocId: z.string().uuid(),
  mode: z.enum(["copy", "move"]),
});

export async function transferDocPage(input: z.infer<typeof transferPageSchema>) {
  const user = await requireUser();
  const data = transferPageSchema.parse(input);
  const [source] = await db.select().from(docPages).where(eq(docPages.id, data.pageId)).limit(1);
  if (!source || source.deletedAt) throw new Error("Page not found");
  await requireEditDocs(user, source.homeSpaceId, source.isProtected);
  if (source.docId === data.destinationDocId) {
    throw new Error("Choose a different Doc");
  }

  const [destination] = await db
    .select()
    .from(docPages)
    .where(
      and(
        eq(docPages.docId, data.destinationDocId),
        isNull(docPages.deletedAt),
      ),
    )
    .orderBy(asc(docPages.position))
    .limit(1);
  if (!destination) throw new Error("Destination Doc not found");
  await requireCreateDocs(user, destination.homeSpaceId);

  if (data.mode === "copy") {
    const result = await copyPageTree({
      userId: user.id,
      source,
      destination: {
        docId: destination.docId,
        homeSpaceId: destination.homeSpaceId,
        folderId: destination.folderId,
      },
      parentPageId: null,
      rootTitle: source.title,
    });
    revalidatePath("/docs");
    revalidatePath(result.path);
    return result;
  }

  const subtree = await pageSubtree(source);
  const subtreeIds = subtree.map((row) => row.id);
  const rootSlug = await uniquePageSlug(
    destination.docId,
    null,
    slugify(source.title),
    source.id,
  );
  const rootPosition = await nextSiblingPosition(destination.docId, null);
  const now = new Date();

  const descendantIds = subtreeIds.filter((id) => id !== source.id);
  await db.transaction(async (tx) => {
    await tx
      .update(docPages)
      .set({
        docId: destination.docId,
        homeSpaceId: destination.homeSpaceId,
        folderId: destination.folderId,
        parentPageId: null,
        slug: rootSlug,
        position: rootPosition,
        updatedById: user.id,
        updatedAt: now,
      })
      .where(eq(docPages.id, source.id));

    if (descendantIds.length > 0) {
      await tx
        .update(docPages)
        .set({
          docId: destination.docId,
          homeSpaceId: destination.homeSpaceId,
          folderId: destination.folderId,
          updatedById: user.id,
          updatedAt: now,
        })
        .where(inArray(docPages.id, descendantIds));
    }
  });

  const result = { id: source.id, slug: rootSlug, path: pagePath(source.id, rootSlug) };
  revalidatePath("/docs");
  revalidatePath(result.path);
  return result;
}

const updateBodySchema = z.object({
  pageId: z.string().uuid(),
  body: z.object({
    text: z.string(),
    doc: z.unknown().nullable(),
  }),
  /** Client's last saved body revision; unaffected by metadata updates. */
  expectedBodyVersion: z.number().int().nonnegative().optional(),
  /** Client's last known updatedAt — conflict detection */
  expectedUpdatedAt: z.string().optional(),
});

export async function updatePageBody(input: z.infer<typeof updateBodySchema>) {
  const user = await requireUser();
  const data = updateBodySchema.parse(input);
  const [page] = await db.select().from(docPages).where(eq(docPages.id, data.pageId)).limit(1);
  if (!page || page.deletedAt) throw new Error("Page not found");
  await requireEditDocs(user, page.homeSpaceId, page.isProtected);

  if (
    data.expectedBodyVersion !== undefined &&
    page.bodyVersion !== data.expectedBodyVersion
  ) {
    return {
      ok: false as const,
      conflict: true as const,
      bodyVersion: page.bodyVersion,
      updatedAt: page.updatedAt.toISOString(),
    };
  }

  // Compatibility for older clients that have not sent a body revision yet.
  if (data.expectedBodyVersion === undefined && data.expectedUpdatedAt) {
    const expected = new Date(data.expectedUpdatedAt).getTime();
    const actual = page.updatedAt.getTime();
    // Allow 1s skew
    if (Math.abs(actual - expected) > 1000 && actual > expected) {
      return {
        ok: false as const,
        conflict: true as const,
        bodyVersion: page.bodyVersion,
        updatedAt: page.updatedAt.toISOString(),
      };
    }
  }

  // Atomic compare-and-swap on the row's own updatedAt: if another save landed
  // between our SELECT above and this UPDATE, the WHERE won't match and we
  // report a conflict instead of silently overwriting it.
  const [updated] = await db
    .update(docPages)
    .set({
      body: data.body,
      bodyVersion: sql`${docPages.bodyVersion} + 1`,
      updatedById: user.id,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(docPages.id, page.id),
        eq(docPages.bodyVersion, page.bodyVersion),
      ),
    )
    .returning({
      bodyVersion: docPages.bodyVersion,
      updatedAt: docPages.updatedAt,
    });

  if (!updated) {
    const [fresh] = await db
      .select({
        bodyVersion: docPages.bodyVersion,
        updatedAt: docPages.updatedAt,
      })
      .from(docPages)
      .where(eq(docPages.id, page.id))
      .limit(1);
    return {
      ok: false as const,
      conflict: true as const,
      bodyVersion: fresh?.bodyVersion ?? page.bodyVersion,
      updatedAt: (fresh?.updatedAt ?? page.updatedAt).toISOString(),
    };
  }

  revalidatePath(pagePath(page.id, page.slug));
  return {
    ok: true as const,
    conflict: false as const,
    bodyVersion: updated.bodyVersion,
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function setPageProtected(pageId: string, isProtected: boolean) {
  const user = await requireUser();
  const [page] = await db.select().from(docPages).where(eq(docPages.id, pageId)).limit(1);
  if (!page || page.deletedAt) throw new Error("Page not found");
  if (!(await canManagePage(user, page.homeSpaceId))) {
    throw new Error("You cannot protect this page");
  }

  await db
    .update(docPages)
    .set({ isProtected, updatedById: user.id, updatedAt: new Date() })
    .where(eq(docPages.id, pageId));

  revalidatePath(pagePath(page.id, page.slug));
  revalidatePath("/docs");
  return { ok: true };
}

export async function verifyPage(pageId: string) {
  const user = await requireUser();
  const [page] = await db.select().from(docPages).where(eq(docPages.id, pageId)).limit(1);
  if (!page || page.deletedAt) throw new Error("Page not found");
  if (!(await canManagePage(user, page.homeSpaceId))) {
    // Editors can also mark verified (knowledge hygiene).
    await requireEditDocs(user, page.homeSpaceId, page.isProtected);
  }

  await db
    .update(docPages)
    .set({
      verifiedAt: new Date(),
      verifiedById: user.id,
      updatedById: user.id,
      updatedAt: new Date(),
    })
    .where(eq(docPages.id, pageId));

  revalidatePath(pagePath(page.id, page.slug));
  revalidatePath("/docs");
  return { ok: true };
}

export async function trashPage(pageId: string) {
  const user = await requireUser();
  const [page] = await db.select().from(docPages).where(eq(docPages.id, pageId)).limit(1);
  if (!page || page.deletedAt) throw new Error("Page not found");
  if (!(await canManagePage(user, page.homeSpaceId))) {
    throw new Error("You cannot trash this page");
  }

  await db
    .update(docPages)
    .set({ deletedAt: new Date(), updatedById: user.id, updatedAt: new Date() })
    .where(eq(docPages.id, pageId));

  revalidatePath("/docs");
  return { ok: true };
}

export async function restorePage(pageId: string) {
  const user = await requireUser();
  const [page] = await db.select().from(docPages).where(eq(docPages.id, pageId)).limit(1);
  if (!page) throw new Error("Page not found");
  if (!(await canManagePage(user, page.homeSpaceId))) {
    throw new Error("You cannot restore this page");
  }

  await db
    .update(docPages)
    .set({ deletedAt: null, updatedById: user.id, updatedAt: new Date() })
    .where(eq(docPages.id, pageId));

  revalidatePath("/docs");
  revalidatePath(pagePath(page.id, page.slug));
  return { ok: true, path: pagePath(page.id, page.slug) };
}

const linkSchema = z.object({
  pageId: z.string().uuid(),
  targetType: z.enum(["space", "folder", "list", "task"]),
  targetId: z.string().uuid(),
});

export async function linkPageToTarget(input: z.infer<typeof linkSchema>) {
  const user = await requireUser();
  const data = linkSchema.parse(input);
  const [page] = await db.select().from(docPages).where(eq(docPages.id, data.pageId)).limit(1);
  if (!page || page.deletedAt) throw new Error("Page not found");
  await requireEditDocs(user, page.homeSpaceId, page.isProtected);
  await assertTargetAccessible(user, data.targetType, data.targetId);

  await db
    .insert(docLinks)
    .values({
      pageId: data.pageId,
      targetType: data.targetType,
      targetId: data.targetId,
      createdById: user.id,
    })
    .onConflictDoNothing();

  revalidatePath(pagePath(page.id, page.slug));
  return { ok: true };
}

export async function unlinkPageFromTarget(input: z.infer<typeof linkSchema>) {
  const user = await requireUser();
  const data = linkSchema.parse(input);
  const [page] = await db.select().from(docPages).where(eq(docPages.id, data.pageId)).limit(1);
  if (!page || page.deletedAt) throw new Error("Page not found");
  await requireEditDocs(user, page.homeSpaceId, page.isProtected);

  await db
    .delete(docLinks)
    .where(
      and(
        eq(docLinks.pageId, data.pageId),
        eq(docLinks.targetType, data.targetType),
        eq(docLinks.targetId, data.targetId),
      ),
    );

  revalidatePath(pagePath(page.id, page.slug));
  return { ok: true };
}

export async function listTrashedPages() {
  const user = await requireUser();
  // Super admin or users who manage spaces they own — keep simple: any space they can manage.
  // Fetch a generous pool up front (deleted docs are rare), then filter by
  // permission and cap to 100 *after* filtering — capping before filtering
  // would silently under-report for callers who can't manage every space.
  const rows = await db
    .select({
      id: docPages.id,
      title: docPages.title,
      slug: docPages.slug,
      homeSpaceId: docPages.homeSpaceId,
      spaceName: spaces.name,
      deletedAt: docPages.deletedAt,
    })
    .from(docPages)
    .innerJoin(spaces, eq(docPages.homeSpaceId, spaces.id))
    .where(sql`${docPages.deletedAt} is not null`)
    .orderBy(desc(docPages.deletedAt))
    .limit(1000);

  // canManagePage only depends on (user, homeSpaceId), so cache per space
  // instead of re-checking it for every row (most trashed pages cluster in
  // a handful of spaces).
  const manageableSpace = new Map<string, boolean>();
  const out = [];
  for (const r of rows) {
    let allowed = manageableSpace.get(r.homeSpaceId);
    if (allowed === undefined) {
      allowed = await canManagePage(user, r.homeSpaceId);
      manageableSpace.set(r.homeSpaceId, allowed);
    }
    if (!allowed) continue;
    out.push({
      id: r.id,
      title: r.title,
      slug: r.slug,
      spaceName: r.spaceName,
      deletedAt: r.deletedAt?.toISOString() ?? null,
    });
    if (out.length >= 100) break;
  }
  return out;
}

// silence unused if tree reorder not yet used
export async function listRootPagesForSpace(spaceId: string) {
  const user = await requireUser();
  await assertSpaceAccess(user, spaceId, "guest");
  return db
    .select({
      id: docPages.id,
      title: docPages.title,
      slug: docPages.slug,
      icon: docPages.icon,
      kind: docPages.kind,
      position: docPages.position,
    })
    .from(docPages)
    .where(
      and(
        eq(docPages.homeSpaceId, spaceId),
        isNull(docPages.parentPageId),
        isNull(docPages.deletedAt),
      ),
    )
    .orderBy(asc(docPages.position), asc(docPages.title));
}

const moveSchema = z.object({
  pageId: z.string().uuid(),
  /** New parent page (null = top-level peer in the same doc). */
  parentPageId: z.string().uuid().nullable(),
  /** Optional: place before this sibling (same parent after move). */
  beforePageId: z.string().uuid().optional().nullable(),
  /** Optional home-space change (same ACL rules as edit). */
  homeSpaceId: z.string().uuid().optional(),
});

/**
 * Move / reparent a page (and keep its full subtree under it).
 * Used by the pages-rail drag-and-drop. Stays inside the same docId.
 */
export async function moveDocPage(input: z.infer<typeof moveSchema>) {
  const user = await requireUser();
  const data = moveSchema.parse(input);

  const [page] = await db.select().from(docPages).where(eq(docPages.id, data.pageId)).limit(1);
  if (!page || page.deletedAt) throw new Error("Page not found");
  await requireEditDocs(user, page.homeSpaceId, page.isProtected);

  const targetSpaceId = data.homeSpaceId ?? page.homeSpaceId;
  if (targetSpaceId !== page.homeSpaceId) {
    await requireEditDocs(user, targetSpaceId, false);
  }

  const docId = page.docId;

  if (data.parentPageId === page.id) {
    throw new Error("Cannot nest a page under itself");
  }

  if (data.parentPageId) {
    const [parent] = await db
      .select()
      .from(docPages)
      .where(
        and(
          eq(docPages.id, data.parentPageId),
          eq(docPages.docId, docId),
          eq(docPages.homeSpaceId, targetSpaceId),
          isNull(docPages.deletedAt),
        ),
      )
      .limit(1);
    if (!parent) throw new Error("Parent page not found");

    // Block cycles: parent cannot be a descendant of the page being moved.
    const allInDoc = await db
      .select({ id: docPages.id, parentPageId: docPages.parentPageId })
      .from(docPages)
      .where(and(eq(docPages.docId, docId), isNull(docPages.deletedAt)));
    const childrenOf = new Map<string, string[]>();
    for (const r of allInDoc) {
      if (!r.parentPageId) continue;
      const list = childrenOf.get(r.parentPageId) ?? [];
      list.push(r.id);
      childrenOf.set(r.parentPageId, list);
    }
    const stack = [page.id];
    const subtree = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (subtree.has(id)) continue;
      subtree.add(id);
      for (const c of childrenOf.get(id) ?? []) stack.push(c);
    }
    if (subtree.has(data.parentPageId)) {
      throw new Error("Cannot move a page into its own subpage");
    }
  }

  // Sibling positions under new parent (scoped to this doc).
  const siblings = await db
    .select({ id: docPages.id, position: docPages.position })
    .from(docPages)
    .where(
      and(
        eq(docPages.docId, docId),
        data.parentPageId
          ? eq(docPages.parentPageId, data.parentPageId)
          : isNull(docPages.parentPageId),
        isNull(docPages.deletedAt),
        ne(docPages.id, page.id),
      ),
    )
    .orderBy(asc(docPages.position), asc(docPages.title));

  let position = "a0";
  if (data.beforePageId) {
    const idx = siblings.findIndex((s) => s.id === data.beforePageId);
    if (idx === 0) {
      // Place first: use a position less than the first sibling
      position = `a0${siblings[0]?.position ?? ""}`.slice(0, 40);
    } else if (idx > 0) {
      const prev = siblings[idx - 1]!.position;
      const next = siblings[idx]!.position;
      position = `${prev}m`;
      if (position >= next) position = `${prev}z${Date.now().toString(36)}`;
    } else {
      position = await nextSiblingPosition(docId, data.parentPageId);
    }
  } else {
    position = await nextSiblingPosition(docId, data.parentPageId);
  }

  // When moving across spaces, update homeSpaceId for the whole subtree.
  const allRows = await db
    .select({ id: docPages.id, parentPageId: docPages.parentPageId })
    .from(docPages)
    .where(and(eq(docPages.docId, docId), isNull(docPages.deletedAt)));
  const childrenMap = new Map<string, string[]>();
  for (const r of allRows) {
    if (!r.parentPageId) continue;
    const list = childrenMap.get(r.parentPageId) ?? [];
    list.push(r.id);
    childrenMap.set(r.parentPageId, list);
  }
  const subtreeIds: string[] = [];
  const stack2 = [page.id];
  while (stack2.length) {
    const id = stack2.pop()!;
    subtreeIds.push(id);
    for (const c of childrenMap.get(id) ?? []) stack2.push(c);
  }

  // Parent change can collide on unique (doc, parent, slug) — re-unique if needed.
  const parentChanged =
    (page.parentPageId ?? null) !== (data.parentPageId ?? null) ||
    page.homeSpaceId !== targetSpaceId;
  const nextSlug = parentChanged
    ? await uniquePageSlug(
        docId,
        data.parentPageId,
        page.slug || slugify(page.title),
        page.id,
      )
    : page.slug;

  await db.transaction(async (tx) => {
    await tx
      .update(docPages)
      .set({
        parentPageId: data.parentPageId,
        homeSpaceId: targetSpaceId,
        position,
        slug: nextSlug,
        updatedById: user.id,
        updatedAt: new Date(),
      })
      .where(eq(docPages.id, page.id));

    if (targetSpaceId !== page.homeSpaceId) {
      const descendants = subtreeIds.filter((id) => id !== page.id);
      if (descendants.length) {
        await tx
          .update(docPages)
          .set({
            homeSpaceId: targetSpaceId,
            updatedById: user.id,
            updatedAt: new Date(),
          })
          .where(inArray(docPages.id, descendants));
      }
    }
  });

  revalidatePath("/docs");
  revalidatePath(pagePath(page.id, nextSlug));
  revalidatePath(pagePath(page.id, page.slug));
  // Ensure any open doc view (outline) reloads
  revalidatePath(`/docs/p/${page.id}`, "page");
  return { ok: true as const, slug: nextSlug };
}
