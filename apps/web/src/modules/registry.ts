/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { docsManifest } from "./docs/manifest";
import { shellManifest } from "./shell/manifest";
import type { ModuleManifest, NavIcon, NavItem, SessionUserLike } from "./types";

/** Built-in shell modules only. Workspace apps (Tasks, Accounts, …) come from the DB. */
export const moduleRegistry: ModuleManifest[] = [shellManifest, docsManifest];

export function navItemsFor(user: SessionUserLike) {
  return moduleRegistry.filter((m) => m.access(user)).flatMap((m) => m.navItems);
}

export function adminNavItems() {
  return moduleRegistry.flatMap((m) => m.adminNavItems ?? []);
}

/** Map a DB module icon string to a known NavIcon. */
export function resolveNavIcon(icon: string | null | undefined): NavIcon {
  const allowed: NavIcon[] = [
    "users",
    "bell",
    "shield",
    "building",
    "tasks",
    "home",
    "docs",
  ];
  if (icon && (allowed as string[]).includes(icon)) return icon as NavIcon;
  return "tasks";
}

export function workspaceModulesToNavItems(
  rows: { id: string; slug: string; name: string; icon: string }[],
): NavItem[] {
  return rows.map((m) => ({
    label: m.name,
    href: m.slug === "tasks" ? "/tasks" : `/w/${m.slug}`,
    icon: resolveNavIcon(m.icon),
    moduleId: m.id,
    moduleSlug: m.slug,
  }));
}
