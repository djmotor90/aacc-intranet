/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { JSONContent } from "@tiptap/react";

/** Structured task chip list embedded in agent messages. */
export type TaskListEmbed = {
  type: "task_list";
  items: {
    taskId: string;
    number: string;
    title: string;
    status?: string | null;
    statusColor?: string | null;
    dueDate?: string | null;
    priority?: string | null;
    assigneeNames?: string[];
  }[];
};

export type ChatEmbed = TaskListEmbed;

export type ChatMessageBody = {
  text: string;
  doc?: JSONContent;
  embeds?: ChatEmbed[];
};

export type AgentPublic = {
  id: string;
  slug: string;
  displayName: string;
  title: string | null;
  description: string | null;
  avatarEmoji: string;
  conversationId: string | null;
  unread: boolean;
  lastMessageAt: string | null;
  lastPreview: string | null;
};

export type ChatMessageDTO = {
  id: string;
  conversationId: string;
  authorUserId: string | null;
  authorAgentId: string | null;
  authorName: string;
  authorEmoji: string | null;
  /** Present for human authors — drives UserAvatar */
  authorPhotoKey?: string | null;
  isAgent: boolean;
  body: ChatMessageBody;
  createdAt: string;
  deletedAt: string | null;
};
