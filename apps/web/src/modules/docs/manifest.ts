/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { ModuleManifest } from "../types";

export const docsManifest: ModuleManifest = {
  slug: "docs",
  name: "Docs",
  basePath: "/docs",
  navItems: [{ label: "Docs", href: "/docs", icon: "docs" }],
  access: () => true,
};
