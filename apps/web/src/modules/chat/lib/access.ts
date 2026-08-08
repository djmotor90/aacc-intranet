/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { chatConversationMembers, db } from "@aitim/db";
import { and, eq } from "drizzle-orm";

export async function userIsConversationMember(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ userId: chatConversationMembers.userId })
    .from(chatConversationMembers)
    .where(
      and(
        eq(chatConversationMembers.conversationId, conversationId),
        eq(chatConversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}
