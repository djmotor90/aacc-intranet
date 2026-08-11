/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
/** Soft-deleted items stay restorable for this many days, then should be purged. */
export const TRASH_RETENTION_DAYS = 30;

export type TrashItemKind = "space" | "folder" | "list" | "task" | "custom_field";

/** Client-safe trash row shape (no DB imports). */
export interface TrashItem {
  kind: TrashItemKind;
  id: string;
  name: string;
  deletedAt: Date;
  spaceId: string;
  spaceName: string;
  spaceSlug: string;
  /** Parent folder/list name when applicable. */
  parentName: string | null;
  /** Task-only: originating list, and its human task number (e.g. "CEWD-142"). */
  listId?: string;
  listSlug?: string;
  taskNumber?: string;
}
