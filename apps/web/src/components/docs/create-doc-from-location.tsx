/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

/**
 * Bridge for Tasks nav menus → Docs create dialog (avoids modules/tasks → modules/docs imports).
 */
import { CreatePageDialog } from "@/modules/docs/components/create-page-dialog";

export function CreateDocFromLocationDialog({
  open,
  onOpenChange,
  spaceId,
  spaceName,
  folderId,
  folderName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  spaceName: string;
  folderId?: string;
  folderName?: string;
}) {
  const isFolder = Boolean(folderId);
  const locationLabel = isFolder
    ? `${spaceName} / ${folderName ?? "Folder"}`
    : spaceName;

  return (
    <CreatePageDialog
      open={open}
      onOpenChange={onOpenChange}
      spaces={[{ id: spaceId, name: spaceName }]}
      defaultSpaceId={spaceId}
      lockSpace
      locationLabel={locationLabel}
      dialogTitle={isFolder ? "New Doc in folder" : "New Doc in space"}
      linkTargetType={isFolder ? "folder" : "space"}
      linkTargetId={isFolder ? folderId : spaceId}
    />
  );
}
