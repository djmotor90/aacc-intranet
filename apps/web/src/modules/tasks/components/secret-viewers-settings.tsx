"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addSecretViewer, removeSecretViewer } from "../actions";
import type { SecretViewerRow } from "../queries";

interface UserOption {
  id: string;
  displayName: string;
}

/**
 * Grants Secrets-vault access to specific members/guests on this list,
 * independent of their regular list role. Space owners always have access
 * and are never listed here — this is only for everyone else.
 */
export function SecretViewersSettings({
  listId,
  viewers,
  addableUsers,
}: {
  listId: string;
  viewers: SecretViewerRow[];
  addableUsers: UserOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function add(formData: FormData) {
    const userId = String(formData.get("userId") ?? "");
    if (!userId) return;
    startTransition(async () => {
      try {
        await addSecretViewer({ listId, userId });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to grant access");
      }
    });
  }

  function remove(viewerId: string) {
    startTransition(async () => {
      try {
        await removeSecretViewer(viewerId);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to remove access");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Space owners always have Secrets access. Grant it to a specific member or guest here without
        changing their list role.
      </p>
      <form action={add} className="flex items-end gap-2">
        <select
          name="userId"
          required
          defaultValue=""
          disabled={pending}
          className="h-9 flex-1 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="" disabled>
            Grant access to…
          </option>
          {addableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={pending || addableUsers.length === 0}>
          Grant
        </Button>
      </form>

      <div className="flex flex-col gap-1">
        {viewers.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-2 py-1">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{v.displayName}</p>
              {v.email && <p className="truncate text-xs text-muted-foreground">{v.email}</p>}
            </div>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(v.id)}>
              Remove
            </Button>
          </div>
        ))}
        {viewers.length === 0 && (
          <p className="text-sm text-muted-foreground">No one granted directly yet.</p>
        )}
      </div>
    </div>
  );
}
