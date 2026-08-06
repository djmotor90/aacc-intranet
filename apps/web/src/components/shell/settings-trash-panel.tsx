"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useCallback, useEffect, useState } from "react";
import { TrashPanel, type TrashItemClient } from "@/modules/tasks/components/trash-panel";
import { getAdminTrashData } from "@/modules/shell/actions/admin";

export function SettingsTrashPanel() {
  const [items, setItems] = useState<TrashItemClient[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getAdminTrashData();
      setItems(data.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trash");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (items === null) {
    return <p className="text-sm text-muted-foreground">Loading trash…</p>;
  }

  return (
    <TrashPanel
      items={items}
      title="Trash"
      description="Soft-deleted spaces, folders, lists, and tasks you can manage. Restore or permanently delete."
    />
  );
}
