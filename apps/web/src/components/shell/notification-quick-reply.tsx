"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { JSONContent } from "@tiptap/react";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CommentBox } from "@/modules/tasks/components/comment-box";
import { getMentionUsersForTask } from "@/modules/shell/actions/notifications";

/**
 * Inbox reply using the same TipTap CommentBox as task activity
 * (/, @mentions, attachments, paste screenshots).
 */
export function NotificationQuickReply({
  taskId,
  parentCommentId,
  mentionUserName,
  onPosted,
  onCancel,
  showCancel = true,
}: {
  taskId: string;
  parentCommentId: string;
  mentionUserName?: string | null;
  /** Fired after a successful send with full rich content for in-inbox display. */
  onPosted?: (posted: { text: string; doc: JSONContent }) => void;
  onCancel?: () => void;
  showCancel?: boolean;
}) {
  const [users, setUsers] = useState<
    { id: string; displayName: string; photoKey: string | null }[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getMentionUsersForTask(taskId);
        if (!cancelled) setUsers(list);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load editor");
          setUsers([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        {error}
      </div>
    );
  }

  if (!users) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-4 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading editor…
      </div>
    );
  }

  return (
    <div
      className="rounded-md border bg-background p-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <CommentBox
        taskId={taskId}
        users={users}
        parentCommentId={parentCommentId}
        autoFocus
        placeholder={
          mentionUserName
            ? `Reply to ${mentionUserName}… @ mention, / blocks, paste images`
            : "Write a reply… @ mention, / blocks, paste images"
        }
        onCancel={showCancel ? onCancel : undefined}
        onSuccess={(posted) => {
          toast.success("Reply sent");
          onPosted?.(posted);
        }}
      />
    </div>
  );
}
