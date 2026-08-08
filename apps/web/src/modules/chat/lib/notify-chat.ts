/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { chatConversationMembers, db } from "@aitim/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

/** Fan out a chat SSE event to every conversation member via pg NOTIFY. */
export async function publishChatMessage(input: {
  conversationId: string;
  messageId: string;
  excludeUserId?: string | null;
}): Promise<void> {
  const members = await db
    .select({ userId: chatConversationMembers.userId })
    .from(chatConversationMembers)
    .where(eq(chatConversationMembers.conversationId, input.conversationId));

  for (const m of members) {
    if (input.excludeUserId && m.userId === input.excludeUserId) continue;
    await db.execute(
      sql`select pg_notify('app_events', ${JSON.stringify({
        kind: "chat",
        conversationId: input.conversationId,
        messageId: input.messageId,
        recipientId: m.userId,
      })})`,
    );
  }
  // Also notify without recipient filter for pages subscribed to conversationId
  await db.execute(
    sql`select pg_notify('app_events', ${JSON.stringify({
      kind: "chat",
      conversationId: input.conversationId,
      messageId: input.messageId,
    })})`,
  );
}
