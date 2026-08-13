"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { JSONContent } from "@tiptap/react";
import { AtSign } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { extractMentionRefs } from "@/components/editor/mention-extension";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import {
  docToPlainText,
  isDocEmpty,
  normalizeImageAttachments,
  storedToDoc,
  type StoredRichDoc,
} from "@/components/editor/doc-utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addComment, editComment } from "../actions";

interface UserOption {
  id: string;
  displayName: string;
  photoKey?: string | null;
  kind?: "user" | "team";
  alias?: string | null;
  color?: string | null;
}

/**
 * Comment composer with TipTap: `/` slash commands + `@` mentions
 * (only users who have access to this task's list).
 */
export function CommentBox({
  taskId,
  users,
  commentId,
  initialContent,
  parentCommentId,
  placeholder,
  autoFocus,
  onSuccess,
  onCancel,
  className,
}: {
  taskId: string;
  /** Mentionable users — people with list access only. */
  users: UserOption[];
  /** Existing comment id switches the composer into author-only edit mode. */
  commentId?: string;
  initialContent?: StoredRichDoc | null;
  parentCommentId?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  /**
   * Called after a successful post with stored rich content (text + TipTap doc)
   * so inbox UI can keep replies (including images) visible.
   */
  onSuccess?: (posted: { text: string; doc: JSONContent }) => void;
  onCancel?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const startingDoc = useMemo(
    () => (initialContent ? storedToDoc(initialContent) : null),
    [initialContent],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(!commentId);
  const [empty, setEmpty] = useState(() => !startingDoc || isDocEmpty(startingDoc));
  const [editorKey, setEditorKey] = useState(0);
  const [payload, setPayload] = useState<{
    text: string;
    doc: JSONContent;
  } | null>(() =>
    startingDoc
      ? { text: docToPlainText(startingDoc), doc: startingDoc }
      : null,
  );
  // After hydration we allow the real empty/pending logic. Server snapshot is
  // false, client snapshot true — React re-renders before paint on hydrate, so
  // SSR + first client paint stay identical and TipTap-related state never
  // flips attributes during hydrate.
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const mentionedUsers = useMemo(() => {
    if (!payload?.doc) return [];
    const refs = extractMentionRefs(payload.doc);
    return [...refs.userIds, ...refs.groupIds]
      .map((id) => userById.get(id))
      .filter((u): u is UserOption => Boolean(u));
  }, [payload, userById]);

  const submitLabel = commentId ? "Save changes" : parentCommentId ? "Reply" : "Comment";
  const canSubmit =
    ready && !pending && (!commentId || dirty) && !empty && Boolean(payload && !isDocEmpty(payload.doc));

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (!canSubmit || !payload || isDocEmpty(payload.doc)) {
        if (ready) setError("Write something first");
        return;
      }
      // Normalize so stored comments + inbox reply bubbles match (images, not chips).
      const normalizedDoc = normalizeImageAttachments(payload.doc);
      const posted = {
        text: payload.text.trim() || docToPlainText(normalizedDoc),
        doc: normalizedDoc,
      };
      const formData = new FormData();
      if (commentId) formData.set("commentId", commentId);
      else {
        formData.set("taskId", taskId);
        if (parentCommentId) formData.set("parentCommentId", parentCommentId);
      }
      formData.set("body", JSON.stringify(posted));
      const mentionRefs = extractMentionRefs(normalizedDoc);
      for (const id of mentionRefs.userIds) {
        formData.append("mentions", id);
      }
      for (const id of mentionRefs.groupIds) formData.append("mentionGroups", id);
      startTransition(async () => {
        try {
          if (commentId) await editComment(formData);
          else {
            await addComment(formData);
            setPayload(null);
            setEmpty(true);
            setEditorKey((k) => k + 1);
          }
          onSuccess?.(posted);
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : commentId
                ? "Failed to update comment"
                : "Failed to comment",
          );
        }
      });
    },
    [canSubmit, payload, ready, taskId, commentId, parentCommentId, onSuccess],
  );

  return (
    <form className={cn("flex flex-col gap-2", className)} onSubmit={onSubmit}>
      <RichTextEditor
        key={editorKey}
        variant="compact"
        initialContent={initialContent}
        contentClassName="max-h-[min(20rem,40dvh)] min-w-0 overflow-y-auto overscroll-contain scroll-py-3"
        editorClassName="min-w-0 break-words [overflow-wrap:anywhere]"
        autoFocus={autoFocus}
        taskId={taskId}
        mentionUsers={users}
        onFilesUploaded={() => router.refresh()}
        placeholder={
          placeholder ??
          "Write a comment… attach files, paste screenshots, @ mention, / blocks"
        }
        onChange={({ text, doc, empty: isEmpty }) => {
          setDirty(true);
          setEmpty(isEmpty);
          setPayload({ text, doc });
        }}
      />

      {mentionedUsers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <AtSign className="size-3.5 text-muted-foreground" />
          {mentionedUsers.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {u.displayName}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
        {/*
          Do not use the HTML `disabled` attribute here. React 19 SSR often
          emits disabled={null} while the client expects disabled={true}, which
          causes a hydration mismatch on this button. Guard submit in onSubmit
          and mirror the disabled look with aria-disabled + CSS.
        */}
        <Button
          type="submit"
          size="sm"
          aria-disabled={!canSubmit}
          className={cn(!canSubmit && "pointer-events-none opacity-50")}
          tabIndex={canSubmit ? 0 : -1}
        >
          {pending ? "Posting…" : submitLabel}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
