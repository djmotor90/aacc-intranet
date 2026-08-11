/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { ModuleManifest } from "../types";

export const shellManifest: ModuleManifest = {
  slug: "shell",
  name: "AACC Hub",
  basePath: "/",
  navItems: [
    { label: "Directory", href: "/directory", icon: "users" },
    { label: "Notifications", href: "/notifications", icon: "bell" },
  ],
  access: () => true,
  adminNavItems: [
    { label: "Users", href: "/admin/users", icon: "users" },
    { label: "Groups & Roles", href: "/admin/groups", icon: "shield" },
  ],
};
