/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deleteSuperAgent,
  setSuperAgentEnabled,
} from "../actions/agents";
import { openAgentConversation } from "../actions/conversations";

export function AgentHubCard({
  agent,
  canChat,
  canEdit,
  canManage,
}: {
  agent: {
    id: string;
    slug: string;
    displayName: string;
    title: string | null;
    description: string | null;
    avatarEmoji: string;
    isEnabled: boolean;
    isSystem: boolean;
  };
  canChat: boolean;
  canEdit: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function toggleEnabled() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await setSuperAgentEnabled({
        agentId: agent.id,
        isEnabled: !agent.isEnabled,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function onAsk() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const { conversationId } = await openAgentConversation(agent.slug);
        router.push(`/chat/${conversationId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not open chat");
      }
    });
  }

  function onDelete() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteSuperAgent({ agentId: agent.id });
      if (!res.ok) {
        setError(res.error);
        setConfirmDelete(false);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm",
        !agent.isEnabled && "opacity-80",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-2xl">
          {agent.avatarEmoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{agent.displayName}</p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                agent.isEnabled
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {agent.isEnabled ? "On" : "Off"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{agent.title ?? "Super Agent"}</p>
          {agent.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{agent.description}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {canChat && agent.isEnabled && (
          <Button type="button" size="sm" onClick={onAsk} disabled={pending}>
            Ask
          </Button>
        )}
        {canEdit && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/chat/agents/${agent.slug}/edit`}>Edit</Link>
          </Button>
        )}
        {canEdit && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={toggleEnabled}
            disabled={pending}
          >
            {agent.isEnabled ? "Turn off" : "Turn on"}
          </Button>
        )}
        {canManage && !confirmDelete && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
          >
            Delete
          </Button>
        )}
        {canManage && confirmDelete && (
          <>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={onDelete}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={pending}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
