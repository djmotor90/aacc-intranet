/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
/** Defaults for built-in sidebar items. Safe to import from client components. */

export const NAV_ICONS = [
  "home",
  "tasks",
  "users",
  "bell",
  "shield",
  "building",
  "docs",
  "forms",
  "files",
  "chat",
  "database",
] as const;

export type NavIconKey = (typeof NAV_ICONS)[number];

export type BuiltinNavSeed = {
  key: string;
  label: string;
  href: string;
  icon: NavIconKey;
  adminOnly?: boolean;
  locked?: boolean;
};

/** Default order matches the original hardcoded sidebar. */
export const BUILTIN_NAV: BuiltinNavSeed[] = [
  { key: "home", label: "Home", href: "/", icon: "home", locked: true },
  { key: "directory", label: "Directory", href: "/directory", icon: "users" },
  { key: "notifications", label: "Notifications", href: "/notifications", icon: "bell" },
  { key: "docs", label: "Docs", href: "/docs", icon: "docs" },
  { key: "forms", label: "Forms", href: "/forms", icon: "forms" },
  { key: "files", label: "Files", href: "/files", icon: "files" },
  { key: "chat", label: "Chat", href: "/chat", icon: "chat" },
  {
    key: "ee-dictionary",
    label: "DB Dictionary",
    href: "/ee-dictionary",
    icon: "database",
    adminOnly: true,
  },
  { key: "outreach", label: "Outreach", href: "/outreach", icon: "building" },
];

export function moduleNavKey(moduleId: string) {
  return `module:${moduleId}`;
}
