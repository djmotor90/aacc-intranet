"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  ArrowRightLeft,
  AtSign,
  CalendarClock,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  Reply,
  UserPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RichTextViewer } from "@/components/editor/rich-text-editor";
import { NotificationQuickReply } from "@/components/shell/notification-quick-reply";
import { UserAvatar } from "@/components/shell/user-avatar";
import { cn } from "@/lib/utils";
import {
  formatNotificationTime,
  notificationHeadline,
  notificationSnippet,
} from "@/lib/notification-copy";
import {
  getNotificationCommentThread,
  markNotificationThreadViewed,
  type InboxNotification,
  type NotificationThreadMessage,
} from "@/modules/shell/actions/notifications";

function TypeIcon({ type }: { type: string }) {
  const cls = "size-3.5 shrink-0 text-muted-foreground";
  switch (type) {
    case "assigned":
      return <UserPlus className={cls} />;
    case "mentioned":
      return <AtSign className={cls} />;
    case "comment":
      return <MessageSquare className={cls} />;
    case "status_changed":
      return <ArrowRightLeft className={cls} />;
    case "due_soon":
      return <CalendarClock className={cls} />;
    case "form_submission":
      return <Inbox className={cls} />;
    default:
      return <Inbox className={cls} />;
  }
}

export function NotificationRow({
  item,
  onOpen,
  onToggleRead,
  onClear,
  onReplySent,
  onThreadViewed,
  compact = false,
}: {
  item: InboxNotification;
  /** Called when the main row is activated (mark read + navigate). */
  onOpen?: (item: InboxNotification) => void;
  onToggleRead?: (item: InboxNotification) => void;
  /** Dismiss this notification from the inbox (ClickUp-style Clear). */
  onClear?: (item: InboxNotification) => void;
  /** After a successful quick reply from the inbox. */
  onReplySent?: (item: InboxNotification) => void;
  /** Thread opened — parent should clear threadHasNew on the item. */
  onThreadViewed?: (item: InboxNotification) => void;
  compact?: boolean;
}) {
  const unread = !item.readAt;
  const [threadHasNew, setThreadHasNew] = useState(Boolean(item.threadHasNew));
  // Re-sync from the prop when a different notification (or flag) arrives —
  // adjust-state-during-render instead of an effect.
  const [prevThreadFlag, setPrevThreadFlag] = useState({
    id: item.id,
    flag: Boolean(item.threadHasNew),
  });
  if (prevThreadFlag.id !== item.id || prevThreadFlag.flag !== Boolean(item.threadHasNew)) {
    setPrevThreadFlag({ id: item.id, flag: Boolean(item.threadHasNew) });
    setThreadHasNew(Boolean(item.threadHasNew));
  }
  const payload = item.payload ?? {};
  const headline = notificationHeadline({
    type: item.type,
    actorName: item.actorName,
    payload,
  });
  const snippet = notificationSnippet(item.type, payload);
  // Stable string ids only (never put object deps in the load effect).
  const canReply = item.type === "mentioned" || item.type === "comment";
  const replyTaskId = canReply ? (item.taskId ?? null) : null;
  let replyRootId: string | null = null;
  if (canReply) {
    if (typeof payload.parentCommentId === "string" && payload.parentCommentId) {
      replyRootId = payload.parentCommentId;
    } else if (typeof payload.commentId === "string" && payload.commentId) {
      replyRootId = payload.commentId;
    }
  }
  const reply =
    replyTaskId && replyRootId
      ? { taskId: replyTaskId, parentCommentId: replyRootId }
      : null;

  const [replyOpen, setReplyOpen] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const [thread, setThread] = useState<NotificationThreadMessage[] | null>(null);
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const fetchGen = useRef(0);

  const [time, setTime] = useState(() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
      }).format(new Date(item.createdAt));
    } catch {
      return "";
    }
  });
  useEffect(() => {
    // Switch to the relative label after mount (SSR-safe absolute label is the
    // initial state); deferred so setState isn't synchronous in the effect body.
    queueMicrotask(() => setTime(formatNotificationTime(item.createdAt)));
  }, [item.createdAt]);

  const loadThread = useCallback(async () => {
    if (!replyTaskId || !replyRootId) return;
    const gen = ++fetchGen.current;
    setThreadLoading(true);
    setThreadError(null);
    try {
      const data = await getNotificationCommentThread({
        taskId: replyTaskId,
        rootCommentId: replyRootId,
      });
      if (gen !== fetchGen.current) return; // stale response
      if (!data) {
        setThreadError("Thread not found");
        setThread([]);
        setThreadRootId(replyRootId);
        return;
      }
      setThread(data.messages);
      setThreadRootId(data.rootCommentId);
    } catch (e) {
      if (gen !== fetchGen.current) return;
      setThreadError(e instanceof Error ? e.message : "Could not load thread");
    } finally {
      if (gen === fetchGen.current) setThreadLoading(false);
    }
  }, [replyTaskId, replyRootId]);

  // Load once when the thread panel opens — not on every render.
  useEffect(() => {
    if (!threadOpen || !replyTaskId || !replyRootId) return;
    void (async () => {
      await loadThread();
    })();
    // Only re-fetch when opening or when the target thread ids change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadThread is stable on primitive ids
  }, [threadOpen, replyTaskId, replyRootId]);

  function openThread() {
    setThreadOpen(true);
    setReplyOpen(true);
    // Always stamp last-viewed so the red badge clears and future replies re-arm it.
    setThreadHasNew(false);
    void markNotificationThreadViewed(item.id)
      .then(() => onThreadViewed?.(item))
      .catch(() => {
        // Optimistic UI; next inbox load refreshes the flag.
      });
  }

  function toggleThread() {
    if (threadOpen) {
      setThreadOpen(false);
      setReplyOpen(false);
    } else {
      openThread();
    }
  }

  const parentForReply = threadRootId ?? replyRootId;

  return (
    <div
      className={cn(
        "group/nrow flex w-full flex-col rounded-lg transition-colors",
        unread ? "bg-primary/5 hover:bg-primary/[0.07]" : "hover:bg-muted/40",
        compact ? "px-1 py-1" : "px-1.5 py-1",
      )}
    >
      <div className="flex w-full items-start gap-1">
        <button
          type="button"
          className={cn(
            "flex min-w-0 flex-1 items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          onClick={() => onOpen?.(item)}
        >
          <div className="relative shrink-0">
            {item.actorId ? (
              <UserAvatar
                userId={item.actorId}
                name={item.actorName ?? "Someone"}
                hasPhoto={!!item.actorPhotoKey}
                photoVersion={item.actorPhotoKey}
                className={cn(compact ? "size-8" : "size-9")}
              />
            ) : (
              <div
                className={cn(
                  "flex items-center justify-center rounded-full bg-muted",
                  compact ? "size-8" : "size-9",
                )}
              >
                <TypeIcon type={item.type} />
              </div>
            )}
            {/* Unread notif (primary) vs new messages in thread (red mail) */}
            {unread && !threadHasNew && (
              <span className="absolute -left-0.5 top-0 size-2 rounded-full bg-primary ring-2 ring-background" />
            )}
            {threadHasNew && (
              <span
                className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-white ring-2 ring-background"
                title="New messages in thread"
                aria-label="New messages in thread"
              >
                <Mail className="size-2.5" strokeWidth={2.5} />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-sm leading-snug",
                unread || threadHasNew
                  ? "font-medium text-foreground"
                  : "text-foreground/90",
              )}
            >
              {headline}
              {threadHasNew && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
                  <Mail className="size-2.5" />
                  New in thread
                </span>
              )}
            </p>
            {item.taskNumber && (
              <p className="mt-0.5 truncate text-xs text-primary">
                <span className="font-medium">{item.taskNumber}</span>
                {item.taskTitle ? ` · ${item.taskTitle}` : ""}
              </p>
            )}
            {snippet && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">“{snippet}”</p>
            )}
            {typeof item.threadReplyCount === "number" && item.threadReplyCount > 0 && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {item.threadReplyCount}{" "}
                {item.threadReplyCount === 1 ? "reply" : "replies"} in thread
              </p>
            )}
          </div>

          <time className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground">
            {time}
          </time>
        </button>

        <div className="mt-1.5 flex shrink-0 flex-col items-end gap-0.5">
          {reply && (
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium",
                threadOpen
                  ? "text-primary"
                  : threadHasNew
                    ? "text-red-600 opacity-100 dark:text-red-400"
                    : "text-muted-foreground opacity-0 group-hover/nrow:opacity-100 focus-visible:opacity-100",
                "hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleThread();
              }}
            >
              {threadHasNew && !threadOpen ? (
                <Mail className="size-3 text-red-500" />
              ) : (
                <Reply className="size-3" />
              )}
              {threadOpen ? "Hide" : threadHasNew ? "New replies" : "Reply"}
            </button>
          )}
          {onToggleRead && (
            <button
              type="button"
              className={cn(
                "rounded px-1.5 py-1 text-[11px] font-medium text-muted-foreground",
                "opacity-0 transition-opacity hover:bg-muted hover:text-foreground",
                "group-hover/nrow:opacity-100 focus-visible:opacity-100",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleRead(item);
              }}
            >
              {unread ? "Mark read" : "Unread"}
            </button>
          )}
          {onClear && (
            <button
              type="button"
              title="Clear notification"
              aria-label="Clear notification"
              className={cn(
                "inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium text-muted-foreground",
                "opacity-0 transition-opacity hover:bg-muted hover:text-foreground",
                "group-hover/nrow:opacity-100 focus-visible:opacity-100",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClear(item);
              }}
            >
              <X className="size-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Persisted thread from the server — survives reloads until notification is cleared */}
      {threadOpen && reply && (
        <div className="mt-1 space-y-2 border-l-2 border-primary/20 px-1.5 pb-1.5 pl-4 ml-3">
          {threadLoading && !thread && (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading thread…
            </div>
          )}
          {threadError && (
            <p className="text-xs text-destructive">{threadError}</p>
          )}

          {thread && thread.length > 0 && (
            <div className="space-y-2">
              {thread.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "rounded-md px-2.5 py-2 text-sm",
                    m.isMine
                      ? "border border-primary/20 bg-primary/5"
                      : "bg-muted/50",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <UserAvatar
                        userId={m.authorId}
                        name={m.authorName}
                        hasPhoto={!!m.authorPhotoKey}
                        photoVersion={m.authorPhotoKey}
                        className="size-5"
                      />
                      <span
                        className={cn(
                          "truncate text-xs font-medium",
                          m.isMine ? "text-primary" : "text-foreground/80",
                        )}
                      >
                        {m.isMine ? "You" : m.authorName}
                      </span>
                    </div>
                    <time className="shrink-0 text-[10px] text-muted-foreground">
                      {formatNotificationTime(m.createdAt)}
                    </time>
                  </div>
                  <RichTextViewer
                    content={m.body as { text?: string; doc?: unknown }}
                    className="text-sm aitim-editor [&_img.aitim-editor-image]:my-2 [&_img.aitim-editor-image]:max-h-48 [&_img]:max-h-48 [&_img]:rounded-md"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Fallback when thread empty but we have a text snippet */}
          {thread && thread.length === 0 && snippet && (
            <div className="rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">
                {item.actorName ?? "Someone"}
              </span>
              <p className="mt-0.5 whitespace-pre-wrap break-words">“{snippet}”</p>
            </div>
          )}

          {replyOpen && parentForReply && (
            <NotificationQuickReply
              taskId={reply.taskId}
              parentCommentId={parentForReply}
              mentionUserName={item.actorName}
              showCancel={false}
              onCancel={() => setReplyOpen(false)}
              onPosted={() => {
                // Reload full thread from DB so messages persist after remount.
                void loadThread();
                onReplySent?.(item);
              }}
            />
          )}

          {!replyOpen && (
            <button
              type="button"
              className="text-[11px] font-medium text-primary hover:underline"
              onClick={() => setReplyOpen(true)}
            >
              Write a reply
            </button>
          )}
        </div>
      )}
    </div>
  );
}
