/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use server";

import {
  agents,
  chatConversationMembers,
  chatConversations,
  db,
} from "@aitim/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/rbac";
import { getAgentAccess } from "../lib/agent-access";

/** Get or create a private agent_dm for the current user + agent. */
export async function openAgentConversation(agentSlug: string): Promise<{ conversationId: string }> {
  const user = await requireUser();
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.slug, agentSlug), eq(agents.isEnabled, true)))
    .limit(1);
  if (!agent) throw new Error("Agent not found");

  const access = await getAgentAccess(agent, user.id);
  if (!access.canChat) {
    throw new Error("You don't have access to chat with this Super Agent");
  }

  // Existing membership for this agent_dm
  const existing = await db
    .select({
      conversationId: chatConversations.id,
    })
    .from(chatConversationMembers)
    .innerJoin(
      chatConversations,
      eq(chatConversations.id, chatConversationMembers.conversationId),
    )
    .where(
      and(
        eq(chatConversationMembers.userId, user.id),
        eq(chatConversations.kind, "agent_dm"),
        eq(chatConversations.agentId, agent.id),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return { conversationId: existing[0].conversationId };
  }

  const [conv] = await db
    .insert(chatConversations)
    .values({
      kind: "agent_dm",
      agentId: agent.id,
      title: agent.displayName,
      isPrivate: true,
      createdBy: user.id,
    })
    .returning();

  await db.insert(chatConversationMembers).values({
    conversationId: conv.id,
    userId: user.id,
    role: "owner",
    lastReadAt: new Date(),
  });

  revalidatePath("/chat");
  return { conversationId: conv.id };
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const user = await requireUser();
  await db
    .update(chatConversationMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(chatConversationMembers.conversationId, conversationId),
        eq(chatConversationMembers.userId, user.id),
      ),
    );
  revalidatePath("/chat");
  revalidatePath(`/chat/${conversationId}`);
}
