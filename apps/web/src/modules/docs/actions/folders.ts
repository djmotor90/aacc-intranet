/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use server";

import { db, docFolders, docPages } from "@aitim/db";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/rbac";
import { requireCreateDocs, requireEditDocs } from "../lib/access";

async function nextFolderPosition(
  homeSpaceId: string,
  parentFolderId: string | null,
): Promise<string> {
  const [last] = await db
    .select({ position: docFolders.position })
    .from(docFolders)
    .where(
      and(
        eq(docFolders.homeSpaceId, homeSpaceId),
        parentFolderId
          ? eq(docFolders.parentFolderId, parentFolderId)
          : isNull(docFolders.parentFolderId),
        isNull(docFolders.deletedAt),
      ),
    )
    .orderBy(desc(docFolders.position))
    .limit(1);
  if (!last) return "a0";
  return `${last.position}a`;
}

const createFolderSchema = z.object({
  name: z.string().min(1).max(120),
  homeSpaceId: z.string().uuid(),
  parentFolderId: z.string().uuid().optional().nullable(),
});

export async function createDocFolder(input: z.infer<typeof createFolderSchema>) {
  const user = await requireUser();
  const data = createFolderSchema.parse(input);
  await requireCreateDocs(user, data.homeSpaceId);

  let parentFolderId: string | null = data.parentFolderId ?? null;
  if (parentFolderId) {
    const [parent] = await db
      .select()
      .from(docFolders)
      .where(
        and(
          eq(docFolders.id, parentFolderId),
          eq(docFolders.homeSpaceId, data.homeSpaceId),
          isNull(docFolders.deletedAt),
        ),
      )
      .limit(1);
    if (!parent) throw new Error("Parent folder not found");
  }

  const position = await nextFolderPosition(data.homeSpaceId, parentFolderId);
  const [folder] = await db
    .insert(docFolders)
    .values({
      name: data.name.trim(),
      homeSpaceId: data.homeSpaceId,
      parentFolderId,
      position,
      createdById: user.id,
    })
    .returning();

  revalidatePath("/docs");
  return { id: folder.id, name: folder.name };
}

const renameFolderSchema = z.object({
  folderId: z.string().uuid(),
  name: z.string().min(1).max(120),
});

export async function renameDocFolder(input: z.infer<typeof renameFolderSchema>) {
  const user = await requireUser();
  const data = renameFolderSchema.parse(input);
  const [folder] = await db
    .select()
    .from(docFolders)
    .where(eq(docFolders.id, data.folderId))
    .limit(1);
  if (!folder || folder.deletedAt) throw new Error("Folder not found");
  await requireEditDocs(user, folder.homeSpaceId, false);

  await db
    .update(docFolders)
    .set({ name: data.name.trim(), updatedAt: new Date() })
    .where(eq(docFolders.id, folder.id));

  revalidatePath("/docs");
  return { ok: true as const };
}

const moveFolderSchema = z.object({
  folderId: z.string().uuid(),
  /** null = All Docs root */
  parentFolderId: z.string().uuid().nullable(),
});

export async function moveDocFolder(input: z.infer<typeof moveFolderSchema>) {
  const user = await requireUser();
  const data = moveFolderSchema.parse(input);
  const [folder] = await db
    .select()
    .from(docFolders)
    .where(eq(docFolders.id, data.folderId))
    .limit(1);
  if (!folder || folder.deletedAt) throw new Error("Folder not found");
  await requireEditDocs(user, folder.homeSpaceId, false);

  if (data.parentFolderId === folder.id) {
    throw new Error("Cannot move a folder into itself");
  }

  if (data.parentFolderId) {
    const [parent] = await db
      .select()
      .from(docFolders)
      .where(
        and(
          eq(docFolders.id, data.parentFolderId),
          eq(docFolders.homeSpaceId, folder.homeSpaceId),
          isNull(docFolders.deletedAt),
        ),
      )
      .limit(1);
    if (!parent) throw new Error("Destination folder not found");

    // Block nesting under a descendant
    const all = await db
      .select({ id: docFolders.id, parentFolderId: docFolders.parentFolderId })
      .from(docFolders)
      .where(
        and(eq(docFolders.homeSpaceId, folder.homeSpaceId), isNull(docFolders.deletedAt)),
      );
    const childrenOf = new Map<string, string[]>();
    for (const r of all) {
      if (!r.parentFolderId) continue;
      const list = childrenOf.get(r.parentFolderId) ?? [];
      list.push(r.id);
      childrenOf.set(r.parentFolderId, list);
    }
    const stack = [folder.id];
    const subtree = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (subtree.has(id)) continue;
      subtree.add(id);
      for (const c of childrenOf.get(id) ?? []) stack.push(c);
    }
    if (subtree.has(data.parentFolderId)) {
      throw new Error("Cannot move a folder into its own subfolder");
    }
  }

  const position = await nextFolderPosition(folder.homeSpaceId, data.parentFolderId);
  await db
    .update(docFolders)
    .set({
      parentFolderId: data.parentFolderId,
      position,
      updatedAt: new Date(),
    })
    .where(eq(docFolders.id, folder.id));

  revalidatePath("/docs");
  return { ok: true as const };
}

/** Soft-delete folder; contents move up to its parent (or root). */
export async function deleteDocFolder(folderId: string) {
  const user = await requireUser();
  const [folder] = await db
    .select()
    .from(docFolders)
    .where(eq(docFolders.id, folderId))
    .limit(1);
  if (!folder || folder.deletedAt) throw new Error("Folder not found");
  await requireEditDocs(user, folder.homeSpaceId, false);

  const parentId = folder.parentFolderId;

  await db.transaction(async (tx) => {
    // Promote child folders
    await tx
      .update(docFolders)
      .set({ parentFolderId: parentId, updatedAt: new Date() })
      .where(
        and(eq(docFolders.parentFolderId, folder.id), isNull(docFolders.deletedAt)),
      );
    // Promote docs in this folder
    await tx
      .update(docPages)
      .set({ folderId: parentId, updatedAt: new Date() })
      .where(and(eq(docPages.folderId, folder.id), isNull(docPages.deletedAt)));
    // Soft-delete the folder
    await tx
      .update(docFolders)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(docFolders.id, folder.id));
  });

  revalidatePath("/docs");
  return { ok: true as const };
}

const moveDocSchema = z.object({
  /** Any page id in the doc — moves the whole doc (all pages with same docId). */
  pageId: z.string().uuid(),
  /** null = All Docs root */
  folderId: z.string().uuid().nullable(),
});

/**
 * Move an entire doc (by any page id) into a hub folder or back to root.
 * If the folder lives in another space, the whole doc moves to that space
 * (requires edit access on both spaces).
 */
export async function moveDocToFolder(input: z.infer<typeof moveDocSchema>) {
  const user = await requireUser();
  const data = moveDocSchema.parse(input);

  const [page] = await db
    .select()
    .from(docPages)
    .where(eq(docPages.id, data.pageId))
    .limit(1);
  if (!page || page.deletedAt) throw new Error("Page not found");
  await requireEditDocs(user, page.homeSpaceId, page.isProtected);

  let targetSpaceId = page.homeSpaceId;
  if (data.folderId) {
    const [folder] = await db
      .select()
      .from(docFolders)
      .where(and(eq(docFolders.id, data.folderId), isNull(docFolders.deletedAt)))
      .limit(1);
    if (!folder) throw new Error("Folder not found");
    targetSpaceId = folder.homeSpaceId;
    if (targetSpaceId !== page.homeSpaceId) {
      await requireEditDocs(user, targetSpaceId, false);
    }
  }

  await db
    .update(docPages)
    .set({
      folderId: data.folderId,
      homeSpaceId: targetSpaceId,
      updatedAt: new Date(),
      updatedById: user.id,
    })
    .where(and(eq(docPages.docId, page.docId), isNull(docPages.deletedAt)));

  revalidatePath("/docs");
  revalidatePath(`/docs/p/${page.id}`, "page");
  return { ok: true as const, folderId: data.folderId, homeSpaceId: targetSpaceId };
}

/**
 * Flat list of folders for the move picker.
 * Pass homeSpaceId to limit to one space; omit to list every accessible space.
 */
export async function listDocFoldersForMove(homeSpaceId?: string) {
  const user = await requireUser();

  if (homeSpaceId) {
    await requireEditDocs(user, homeSpaceId, false);
  }

  const { spaces } = await import("@aitim/db");
  const conditions = [isNull(docFolders.deletedAt)];
  if (homeSpaceId) {
    conditions.push(eq(docFolders.homeSpaceId, homeSpaceId));
  }

  const rows = await db
    .select({
      id: docFolders.id,
      name: docFolders.name,
      parentFolderId: docFolders.parentFolderId,
      homeSpaceId: docFolders.homeSpaceId,
      spaceName: spaces.name,
    })
    .from(docFolders)
    .innerJoin(spaces, eq(docFolders.homeSpaceId, spaces.id))
    .where(and(...conditions))
    .orderBy(asc(spaces.name), asc(docFolders.name));

  // When listing all spaces, drop folders the user cannot edit.
  if (!homeSpaceId) {
    const ok: typeof rows = [];
    const cache = new Map<string, boolean>();
    for (const r of rows) {
      let allowed = cache.get(r.homeSpaceId);
      if (allowed === undefined) {
        try {
          await requireEditDocs(user, r.homeSpaceId, false);
          allowed = true;
        } catch {
          allowed = false;
        }
        cache.set(r.homeSpaceId, allowed);
      }
      if (allowed) ok.push(r);
    }
    return ok;
  }

  return rows;
}
