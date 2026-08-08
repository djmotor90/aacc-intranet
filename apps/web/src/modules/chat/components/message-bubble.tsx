/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import { UserAvatar } from "@/components/shell/user-avatar";
import { cn } from "@/lib/utils";
import type { ChatMessageDTO } from "../lib/types";
import { MentionText } from "./mention-text";
import { TaskEmbedChips } from "./task-embed-chips";

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function MessageBubble({
  message,
  isOwn,
}: {
  message: ChatMessageDTO;
  isOwn: boolean;
}) {
  const embeds = message.body.embeds ?? [];
  const plain = message.body.text ?? "";

  return (
    <div className={cn("flex gap-3 px-4 py-3", isOwn && "flex-row-reverse")}>
      {message.isAgent ? (
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg"
          aria-hidden
        >
          {message.authorEmoji ?? "🤖"}
        </div>
      ) : message.authorUserId ? (
        <UserAvatar
          userId={message.authorUserId}
          name={message.authorName}
          hasPhoto={message.authorPhotoKey != null ? true : undefined}
          photoVersion={message.authorPhotoKey}
          className="size-9 shrink-0"
        />
      ) : (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
          {(message.authorName?.[0] ?? "?").toUpperCase()}
        </div>
      )}
      <div className={cn("min-w-0 max-w-[min(100%,42rem)] flex-1", isOwn && "text-right")}>
        <div className={cn("mb-0.5 flex items-baseline gap-2", isOwn && "justify-end")}>
          <span className="text-sm font-semibold">{message.authorName}</span>
          <span className="text-xs text-muted-foreground">{formatTime(message.createdAt)}</span>
        </div>
        <div
          className={cn(
            "inline-block max-w-full rounded-2xl px-3.5 py-2.5 text-left text-sm leading-relaxed",
            message.isAgent
              ? "bg-muted/80"
              : isOwn
                ? "bg-primary text-primary-foreground"
                : "bg-muted",
          )}
        >
          {/* Unified path: DOC/Task chips + markdown in the same bubble */}
          {plain ? (
            <MentionText text={plain} onPrimary={isOwn && !message.isAgent} />
          ) : null}
          {embeds.map((embed, i) =>
            embed.type === "task_list" ? (
              <div key={i} className={cn(isOwn && !message.isAgent && "text-primary-foreground")}>
                <TaskEmbedChips embed={embed} />
              </div>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

/** Animated “agent is typing…” bubble */
export function TypingIndicator({
  agentName,
  agentEmoji,
}: {
  agentName: string;
  agentEmoji: string;
}) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg">
        {agentEmoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline gap-2">
          <span className="text-sm font-semibold">{agentName}</span>
          <span className="text-xs text-muted-foreground">typing…</span>
        </div>
        <div className="inline-flex items-center gap-1 rounded-2xl bg-muted/80 px-4 py-3">
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:0ms]" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:150ms]" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
