/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import { Radio } from "lucide-react";
import { UserAvatar } from "@/components/shell/user-avatar";
import { cn } from "@/lib/utils";
import type { CollabAwarenessUser, CollabUser } from "@/modules/docs/hooks/use-doc-collab";

type PresencePerson = {
  id: string;
  name: string;
  color: string;
  photoKey: string | null;
  isSelf: boolean;
};

/**
 * Live presence strip — real profile avatars for people in this doc.
 */
export function CollabPresence({
  self,
  peers,
  status,
  error,
}: {
  self: CollabUser | null;
  peers: CollabAwarenessUser[];
  status: string;
  error?: string | null;
}) {
  // One entry per user id (multiple tabs collapse).
  const byUser = new Map<string, PresencePerson>();
  if (self) {
    byUser.set(self.id, {
      id: self.id,
      name: self.name,
      color: self.color,
      photoKey: self.photoKey ?? null,
      isSelf: true,
    });
  }
  for (const p of peers) {
    const id = p.user?.id;
    if (!id || !p.user?.name) continue;
    if (byUser.has(id)) continue;
    byUser.set(id, {
      id,
      name: p.user.name,
      color: p.user.color || "#64748b",
      photoKey: p.user.photoKey ?? null,
      isSelf: false,
    });
  }
  const users = [...byUser.values()];
  // Self first, then others
  users.sort((a, b) => Number(b.isSelf) - Number(a.isSelf));
  const others = users.filter((u) => !u.isSelf);

  // Quiet when offline — only show when connecting/live.
  if (status === "offline" || status === "error") {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          status === "synced" &&
            "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
          (status === "connecting" || status === "loading") &&
            "bg-amber-500/15 text-amber-800 dark:text-amber-200",
        )}
        title={error || status}
      >
        <Radio
          className={cn("size-3", status === "synced" && "animate-pulse")}
        />
        {status === "synced" ? "Live" : "Connecting…"}
      </span>

      {status === "synced" && users.length > 0 && (
        <div className="flex items-center -space-x-1.5">
          {users.slice(0, 6).map((u) => (
            <span
              key={u.id}
              className="relative inline-flex rounded-full ring-2 ring-background"
              style={{ boxShadow: `0 0 0 1.5px ${u.color}` }}
              title={u.isSelf ? `${u.name} (you)` : u.name}
            >
              <UserAvatar
                userId={u.id}
                name={u.name}
                photoVersion={u.photoKey}
                className="size-6 text-[10px]"
                priority={u.isSelf}
              />
            </span>
          ))}
          {users.length > 6 && (
            <span className="inline-flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground">
              +{users.length - 6}
            </span>
          )}
        </div>
      )}

      {status === "synced" && others.length > 0 && (
        <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
          {others.length === 1
            ? `${others[0]!.name} is here`
            : `${others.length} others here`}
        </span>
      )}
    </div>
  );
}
