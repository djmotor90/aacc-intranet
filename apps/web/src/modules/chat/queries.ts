/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  agentKnowledge,
  agents,
  chatConversationMembers,
  chatConversations,
  chatMessages,
  db,
  users,
} from "@aitim/db";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getAgentAccess } from "./lib/agent-access";
import { parseMessageBody } from "./lib/body";
import type { AgentPublic, ChatMessageDTO } from "./lib/types";

export async function listEnabledAgentsWithUserState(userId: string): Promise<AgentPublic[]> {
  const agentRows = await db
    .select()
    .from(agents)
    .where(eq(agents.isEnabled, true))
    .orderBy(asc(agents.displayName));

  if (agentRows.length === 0) return [];

  // Filter to agents this user may chat with
  const accessible: typeof agentRows = [];
  for (const a of agentRows) {
    const access = await getAgentAccess(a, userId);
    if (access.canChat) accessible.push(a);
  }
  if (accessible.length === 0) return [];

  // Existing agent_dm memberships for this user
  const memberships = await db
    .select({
      conversationId: chatConversations.id,
      agentId: chatConversations.agentId,
      lastMessageAt: chatConversations.lastMessageAt,
      lastReadAt: chatConversationMembers.lastReadAt,
    })
    .from(chatConversationMembers)
    .innerJoin(
      chatConversations,
      eq(chatConversations.id, chatConversationMembers.conversationId),
    )
    .where(
      and(
        eq(chatConversationMembers.userId, userId),
        eq(chatConversations.kind, "agent_dm"),
      ),
    );

  const byAgent = new Map(
    memberships
      .filter((m) => m.agentId)
      .map((m) => [m.agentId as string, m]),
  );

  // Last message preview per conversation
  const convIds = memberships.map((m) => m.conversationId);
  const previews = new Map<string, string>();
  if (convIds.length > 0) {
    for (const convId of convIds) {
      const [msg] = await db
        .select({ body: chatMessages.body })
        .from(chatMessages)
        .where(and(eq(chatMessages.conversationId, convId), isNull(chatMessages.deletedAt)))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);
      if (msg) {
        const body = parseMessageBody(msg.body);
        previews.set(convId, body.text.slice(0, 120));
      }
    }
  }

  return accessible.map((a) => {
    const m = byAgent.get(a.id);
    const lastMessageAt = m?.lastMessageAt ?? null;
    const lastReadAt = m?.lastReadAt ?? null;
    const unread =
      Boolean(lastMessageAt) &&
      (!lastReadAt || (lastMessageAt && lastReadAt < lastMessageAt));
    return {
      id: a.id,
      slug: a.slug,
      displayName: a.displayName,
      title: a.title,
      description: a.description,
      avatarEmoji: a.avatarEmoji,
      conversationId: m?.conversationId ?? null,
      unread: Boolean(unread),
      lastMessageAt: lastMessageAt?.toISOString() ?? null,
      lastPreview: m ? previews.get(m.conversationId) ?? null : null,
    };
  });
}

export async function getAgentBySlug(slug: string) {
  const [row] = await db.select().from(agents).where(eq(agents.slug, slug)).limit(1);
  return row ?? null;
}

export async function getAgentById(id: string) {
  const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  return row ?? null;
}

export async function listAllAgents() {
  return db.select().from(agents).orderBy(asc(agents.displayName));
}

export async function getAgentKnowledge(agentId: string) {
  return db.select().from(agentKnowledge).where(eq(agentKnowledge.agentId, agentId));
}

export async function getConversationForUser(conversationId: string, userId: string) {
  const [member] = await db
    .select()
    .from(chatConversationMembers)
    .where(
      and(
        eq(chatConversationMembers.conversationId, conversationId),
        eq(chatConversationMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!member) return null;

  const [conv] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);
  if (!conv) return null;

  let agent = null;
  if (conv.agentId) {
    agent = await getAgentById(conv.agentId);
  }

  return { conversation: conv, member, agent };
}

function mapMessageRows(
  rows: {
    id: string;
    conversationId: string;
    authorUserId: string | null;
    authorAgentId: string | null;
    body: unknown;
    createdAt: Date;
    deletedAt: Date | null;
    userName: string | null;
    userPhotoKey: string | null;
    agentName: string | null;
    agentEmoji: string | null;
  }[],
): ChatMessageDTO[] {
  return rows
    .map((r) => {
      const isAgent = Boolean(r.authorAgentId);
      return {
        id: r.id,
        conversationId: r.conversationId,
        authorUserId: r.authorUserId,
        authorAgentId: r.authorAgentId,
        authorName: isAgent ? (r.agentName ?? "Agent") : (r.userName ?? "User"),
        authorEmoji: isAgent ? (r.agentEmoji ?? "🤖") : null,
        authorPhotoKey: isAgent ? null : (r.userPhotoKey ?? null),
        isAgent,
        body: parseMessageBody(r.body),
        createdAt: r.createdAt.toISOString(),
        deletedAt: r.deletedAt?.toISOString() ?? null,
      } satisfies ChatMessageDTO;
    })
    .reverse();
}

const messageSelect = {
  id: chatMessages.id,
  conversationId: chatMessages.conversationId,
  authorUserId: chatMessages.authorUserId,
  authorAgentId: chatMessages.authorAgentId,
  body: chatMessages.body,
  createdAt: chatMessages.createdAt,
  deletedAt: chatMessages.deletedAt,
  userName: users.displayName,
  userPhotoKey: users.photoKey,
  agentName: agents.displayName,
  agentEmoji: agents.avatarEmoji,
};

export async function listMessages(
  conversationId: string,
  opts: { limit?: number; before?: Date } = {},
): Promise<ChatMessageDTO[]> {
  const limit = opts.limit ?? 80;
  const conditions = [
    eq(chatMessages.conversationId, conversationId),
    isNull(chatMessages.deletedAt),
  ];
  if (opts.before) {
    conditions.push(sql`${chatMessages.createdAt} < ${opts.before}`);
  }

  const rows = await db
    .select(messageSelect)
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.authorUserId))
    .leftJoin(agents, eq(agents.id, chatMessages.authorAgentId))
    .where(and(...conditions))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  return mapMessageRows(rows);
}

/** Messages newer than a known id (for live poll fallback when SSE misses). */
export async function listMessagesAfter(
  conversationId: string,
  afterMessageId: string | null,
  limit = 30,
): Promise<ChatMessageDTO[]> {
  const conditions = [
    eq(chatMessages.conversationId, conversationId),
    isNull(chatMessages.deletedAt),
  ];

  if (afterMessageId) {
    const [anchor] = await db
      .select({ createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(eq(chatMessages.id, afterMessageId))
      .limit(1);
    if (anchor) {
      conditions.push(
        sql`(${chatMessages.createdAt} > ${anchor.createdAt} OR (${chatMessages.createdAt} = ${anchor.createdAt} AND ${chatMessages.id} > ${afterMessageId}))`,
      );
    }
  }

  const rows = await db
    .select(messageSelect)
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.authorUserId))
    .leftJoin(agents, eq(agents.id, chatMessages.authorAgentId))
    .where(and(...conditions))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  return mapMessageRows(rows);
}
