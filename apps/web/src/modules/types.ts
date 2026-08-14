/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
export interface SessionUserLike {
  id: string;
  platformRole: "admin" | "member";
}

/** Icon names resolved client-side in sidebar-nav.tsx */
export type NavIcon =
  | "users"
  | "bell"
  | "shield"
  | "building"
  | "tasks"
  | "home"
  | "docs"
  | "chat"
  | "database";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  /** When set, this nav item is a workspace app with its own spaces tree. */
  moduleId?: string;
  moduleSlug?: string;
}

export interface ModuleManifest {
  slug: string;
  name: string;
  basePath: string;
  navItems: NavItem[];
  /** Whether this user can see/use the module. */
  access: (user: SessionUserLike) => boolean;
  /** Extra nav items shown under Admin for platform admins. */
  adminNavItems?: NavItem[];
}
