/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { FolderNavNode, ListNavNode } from "../queries";

export function flattenLists(folders: FolderNavNode[], lists: ListNavNode[]): ListNavNode[] {
  return [...lists, ...folders.flatMap((folder) => flattenLists(folder.subfolders, folder.lists))];
}

export function findFolderInTree(folders: FolderNavNode[], folderId: string): FolderNavNode | null {
  for (const folder of folders) {
    if (folder.id === folderId) return folder;
    const nested = findFolderInTree(folder.subfolders, folderId);
    if (nested) return nested;
  }
  return null;
}
