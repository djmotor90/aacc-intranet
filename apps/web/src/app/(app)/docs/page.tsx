/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, docFolders } from "@aitim/db";
import { and, eq, isNull } from "drizzle-orm";
import { DocsHubClient } from "@/modules/docs/components/docs-hub-client";
import {
  getDocFolderBreadcrumb,
  listDocFoldersHub,
  listDocsHub,
  listSpacesForDocs,
} from "@/modules/docs/queries";
import { requireUser } from "@/lib/rbac";

export default async function DocsHubPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const folderId = params.folder?.trim() || null;

  const [pages, folders, breadcrumbs, spaces] = await Promise.all([
    listDocsHub(user, { filter: "recent", limit: 100, folderId }),
    listDocFoldersHub(user, { parentFolderId: folderId }),
    getDocFolderBreadcrumb(user, folderId),
    listSpacesForDocs(user),
  ]);

  let currentFolderSpaceId: string | null =
    folders[0]?.homeSpaceId ?? pages[0]?.homeSpaceId ?? null;
  if (folderId && !currentFolderSpaceId) {
    const [row] = await db
      .select({ homeSpaceId: docFolders.homeSpaceId })
      .from(docFolders)
      .where(and(eq(docFolders.id, folderId), isNull(docFolders.deletedAt)))
      .limit(1);
    currentFolderSpaceId = row?.homeSpaceId ?? null;
  }

  return (
    <DocsHubClient
      initialPages={pages}
      initialFolders={folders}
      breadcrumbs={breadcrumbs}
      currentFolderId={folderId}
      currentFolderSpaceId={currentFolderSpaceId}
      spaces={spaces.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
