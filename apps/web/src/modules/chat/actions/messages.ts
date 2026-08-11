/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use server";

import {
  chatConversationMembers,
  chatConversations,
  chatMessages,
  db,
} from "@aitim/db";
import { and, eq, isNull } from "drizzle-orm";
import type { JSONContent } from "@tiptap/react";
import { revalidatePath } from "next/cache";
import {
  docToPlainText,
  isDocEmpty,
  normalizeImageAttachments,
} from "@/components/editor/doc-utils";
import { enqueue } from "@/lib/queue";
import { requireUser } from "@/lib/rbac";
import { userIsConversationMember } from "../lib/access";
import { parseMessageBody } from "../lib/body";
import { publishChatMessage } from "../lib/notify-chat";
import type { ChatMessageBody, ChatMessageDTO } from "../lib/types";

export async function sendChatMessage(input: {
  conversationId: string;
  text?: string;
  doc?: JSONContent;
  clientMessageId?: string;
}): Promise<{ ok: true; message: ChatMessageDTO } | { ok: false; error: string }> {
  const user = await requireUser();
  const conversationId = input.conversationId;
  if (!(await userIsConversationMember(user.id, conversationId))) {
    return { ok: false, error: "Not a member of this conversation" };
  }

  const doc = input.doc ? normalizeImageAttachments(input.doc) : undefined;
  let text = (input.text ?? "").trim();
  if (doc) {
    if (isDocEmpty(doc)) return { ok: false, error: "Write something first" };
    text = docToPlainText(doc).trim() || text;
  } else if (!text) {
    return { ok: false, error: "Write something first" };
  }

  const body: ChatMessageBody = {
    text,
    doc: doc ?? undefined,
  };

  // Idempotent resend
  if (input.clientMessageId) {
    const [dup] = await db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.conversationId, conversationId),
          eq(chatMessages.clientMessageId, input.clientMessageId),
        ),
      )
      .limit(1);
    if (dup) {
      return {
        ok: true,
        message: {
          id: dup.id,
          conversationId: dup.conversationId,
          authorUserId: dup.authorUserId,
          authorAgentId: dup.authorAgentId,
          authorName: user.name ?? "You",
          authorEmoji: null,
          isAgent: false,
          body: parseMessageBody(dup.body),
          createdAt: dup.createdAt.toISOString(),
          deletedAt: null,
        },
      };
    }
  }

  const [conv] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);
  if (!conv) return { ok: false, error: "Conversation not found" };

  const [row] = await db
    .insert(chatMessages)
    .values({
      conversationId,
      authorUserId: user.id,
      authorAgentId: null,
      body,
      clientMessageId: input.clientMessageId ?? null,
    })
    .returning();

  await db
    .update(chatConversations)
    .set({ lastMessageAt: row.createdAt, updatedAt: new Date() })
    .where(eq(chatConversations.id, conversationId));

  await db
    .update(chatConversationMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(chatConversationMembers.conversationId, conversationId),
        eq(chatConversationMembers.userId, user.id),
      ),
    );

  await publishChatMessage({
    conversationId,
    messageId: row.id,
    excludeUserId: user.id,
  });

  // Super Agent reply
  if (conv.kind === "agent_dm" && conv.agentId) {
    await enqueue("agent-run", {
      conversationId,
      triggerMessageId: row.id,
      agentId: conv.agentId,
      userId: user.id,
    }).catch((err) => console.error("[chat] enqueue agent-run failed", err));
  }

  revalidatePath(`/chat/${conversationId}`);
  revalidatePath("/chat");

  const { users } = await import("@aitim/db");
  const [me] = await db
    .select({ photoKey: users.photoKey, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return {
    ok: true,
    message: {
      id: row.id,
      conversationId: row.conversationId,
      authorUserId: row.authorUserId,
      authorAgentId: null,
      authorName: me?.displayName ?? user.name ?? "You",
      authorEmoji: null,
      authorPhotoKey: me?.photoKey ?? null,
      isAgent: false,
      body,
      createdAt: row.createdAt.toISOString(),
      deletedAt: null,
    },
  };
}

export async function getChatMessage(messageId: string): Promise<ChatMessageDTO | null> {
  const user = await requireUser();
  const [row] = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), isNull(chatMessages.deletedAt)))
    .limit(1);
  if (!row) return null;
  if (!(await userIsConversationMember(user.id, row.conversationId))) return null;

  const body = parseMessageBody(row.body);
  const isAgent = Boolean(row.authorAgentId);
  let authorName = "User";
  let authorEmoji: string | null = null;
  let authorPhotoKey: string | null = null;
  if (isAgent && row.authorAgentId) {
    const { agents } = await import("@aitim/db");
    const [a] = await db.select().from(agents).where(eq(agents.id, row.authorAgentId)).limit(1);
    authorName = a?.displayName ?? "Agent";
    authorEmoji = a?.avatarEmoji ?? "🤖";
  } else if (row.authorUserId) {
    const { users } = await import("@aitim/db");
    const [u] = await db
      .select({ displayName: users.displayName, photoKey: users.photoKey })
      .from(users)
      .where(eq(users.id, row.authorUserId))
      .limit(1);
    authorName = u?.displayName ?? "User";
    authorPhotoKey = u?.photoKey ?? null;
  }

  return {
    id: row.id,
    conversationId: row.conversationId,
    authorUserId: row.authorUserId,
    authorAgentId: row.authorAgentId,
    authorName,
    authorEmoji,
    authorPhotoKey,
    isAgent,
    body,
    createdAt: row.createdAt.toISOString(),
    deletedAt: null,
  };
}

/**
 * Poll helper: messages created after `afterMessageId` (or latest N if null).
 * Used when SSE drops agent replies across Next.js processes.
 */
export async function pollConversationMessages(
  conversationId: string,
  afterMessageId: string | null,
): Promise<ChatMessageDTO[]> {
  const user = await requireUser();
  if (!(await userIsConversationMember(user.id, conversationId))) return [];
  const { listMessagesAfter } = await import("../queries");
  return listMessagesAfter(conversationId, afterMessageId, 40);
}
