/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { SettingsTeamsPanel } from "@/components/shell/settings-teams-panel";
import { requireAdmin } from "@/lib/rbac";

export default async function AdminGroupsPage() {
  await requireAdmin();
  return (
    <div className="mx-auto w-full max-w-6xl">
      <SettingsTeamsPanel />
    </div>
  );
}
