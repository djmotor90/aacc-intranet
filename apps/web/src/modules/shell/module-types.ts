/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
/** Shared types/constants for workspace apps (safe to import from client components). */

export const MODULE_ICONS = [
  "tasks",
  "building",
  "users",
  "shield",
  "bell",
  "home",
] as const;

export type ModuleIcon = (typeof MODULE_ICONS)[number];

export type WorkspaceModuleRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  color: string | null;
  position: string;
  isEnabled: boolean;
  isSystem: boolean;
  spaceCount: number;
};
