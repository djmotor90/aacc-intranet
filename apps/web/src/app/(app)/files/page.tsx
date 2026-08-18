/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { FilesHubClient } from "@/modules/files/components/files-hub-client";
import {
  getDriveFolderBreadcrumb,
  listDriveFiles,
  listDriveFolders,
  listSpacesForFiles,
  listTaskFiles,
  type DriveSection,
} from "@/modules/files/queries";
import { requireUser } from "@/lib/rbac";

const SECTIONS = new Set<DriveSection>(["all", "recent", "starred", "tasks", "trash"]);

export default async function FilesHubPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; section?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const rawSection = params.section === "drive" ? "all" : params.section;
  const section: DriveSection = SECTIONS.has(rawSection as DriveSection)
    ? (rawSection as DriveSection)
    : "all";
  const folderId = section === "all" ? params.folder?.trim() || null : null;

  const [folders, files, taskFiles, breadcrumbs, spaces] = await Promise.all([
    section === "all" || section === "trash"
      ? listDriveFolders(user, { parentFolderId: folderId, trash: section === "trash" })
      : Promise.resolve([]),
    section === "tasks" ? Promise.resolve([]) : listDriveFiles(user, { folderId, section }),
    section === "tasks" ? listTaskFiles(user) : Promise.resolve([]),
    getDriveFolderBreadcrumb(user, folderId),
    listSpacesForFiles(user),
  ]);

  const currentFolderSpaceId =
    folders[0]?.homeSpaceId ?? files[0]?.homeSpaceId ?? spaces[0]?.id ?? null;

  return (
    <FilesHubClient
      section={section}
      folders={folders}
      files={files}
      taskFiles={taskFiles}
      breadcrumbs={breadcrumbs}
      currentFolderId={folderId}
      currentFolderSpaceId={folderId ? currentFolderSpaceId : null}
      spaces={spaces}
    />
  );
}
