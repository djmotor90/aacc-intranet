/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { SettingsAdminUsersPanel } from "@/components/shell/settings-admin-panels";
import { requireAdmin } from "@/lib/rbac";

export default async function AdminUsersPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-5xl">
      <SettingsAdminUsersPanel />
    </div>
  );
}
