/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./platform";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Conversation kinds — Phase 1 uses agent_dm; channel/dm/group reserved for Phase 2. */
export const chatConversationKind = pgEnum("chat_conversation_kind", [
  "agent_dm",
  "channel",
  "dm",
  "group",
]);

/**
 * Super Agents — first-class AI teammates (not Entra users).
 *
 * Dual models (ClickUp-style cost split):
 * - buildModel: stronger model used when drafting/refining instructions
 * - chatModel / model: cheaper default for day-to-day DM replies
 *
 * config jsonb (AgentConfig):
 * {
 *   triggers?: { mention?: boolean; directMessage?: boolean; scheduleEnabled?: boolean; scheduleCron?: string },
 *   creatorBrief?: string,   // original natural-language brief
 *   visibility?: "members" | "admins"
 * }
 */
export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    title: text("title"),
    description: text("description"),
    /** Lucide-friendly emoji or short glyph for avatar fallback */
    avatarEmoji: text("avatar_emoji").notNull().default("🤖"),
    /** Optional S3 object key for custom avatar */
    avatarKey: text("avatar_key"),
    systemPrompt: text("system_prompt").notNull().default(""),
    /** Tool allowlist, e.g. ["tasks.list_overdue","tasks.search","docs.search"] */
    tools: jsonb("tools").notNull().default(sql`'[]'::jsonb`),
    /** stub | xai — default from env when empty */
    runtime: text("runtime").notNull().default("stub"),
    /** @deprecated prefer chatModel — kept for older rows */
    model: text("model"),
    /** Stronger model for builder / instruction expansion */
    buildModel: text("build_model"),
    /** Cheaper model for conversational replies */
    chatModel: text("chat_model"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    isSystem: boolean("is_system").notNull().default(false),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    /** triggers, brief, visibility, etc. */
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (t) => [uniqueIndex("agents_slug_idx").on(t.slug)],
);

/**
 * Who can use / manage a Super Agent (ClickUp-style sharing).
 * - owner: full control (usually creator)
 * - admin: edit instructions, knowledge, members, write tools
 * - member: chat / interact only
 */
export const agentMemberRole = pgEnum("agent_member_role", ["owner", "admin", "member"]);

export const agentMembers = pgTable(
  "agent_members",
  {
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: agentMemberRole("role").notNull().default("member"),
    addedById: uuid("added_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.agentId, t.userId] }),
    index("agent_members_user_idx").on(t.userId),
  ],
);

export const agentMembersRelations = relations(agentMembers, ({ one }) => ({
  agent: one(agents, { fields: [agentMembers.agentId], references: [agents.id] }),
  user: one(users, { fields: [agentMembers.userId], references: [users.id] }),
}));

/** Knowledge sources attached to an agent (Docs pages / folders). */
export const agentKnowledgeSourceType = pgEnum("agent_knowledge_source_type", [
  "doc_page",
  "doc_folder",
]);

export const agentKnowledge = pgTable(
  "agent_knowledge",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    sourceType: agentKnowledgeSourceType("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    /** Optional label snapshot for UI */
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_knowledge_unique_idx").on(t.agentId, t.sourceType, t.sourceId),
    index("agent_knowledge_agent_idx").on(t.agentId),
  ],
);

export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: chatConversationKind("kind").notNull().default("agent_dm"),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    title: text("title"),
    isPrivate: boolean("is_private").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    /**
     * Rolling summary of turns that fell out of the raw message window.
     * Not a chat clone — short continuity so we do not re-send full history every turn.
     */
    contextSummary: text("context_summary"),
    contextSummaryAt: timestamp("context_summary_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("chat_conversations_agent_idx").on(t.agentId),
    index("chat_conversations_last_message_idx").on(t.lastMessageAt),
  ],
);

export const chatConversationMembers = pgTable(
  "chat_conversation_members",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    mutedAt: timestamp("muted_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index("chat_conversation_members_user_idx").on(t.userId),
  ],
);

/**
 * Message body jsonb shape:
 * { text: string, doc?: TipTapJSON, embeds?: ChatEmbed[] }
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    authorAgentId: uuid("author_agent_id").references(() => agents.id, { onDelete: "set null" }),
    body: jsonb("body").notNull(),
    clientMessageId: text("client_message_id"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("chat_messages_conversation_created_idx").on(t.conversationId, t.createdAt),
    index("chat_messages_author_user_idx").on(t.authorUserId),
    index("chat_messages_author_agent_idx").on(t.authorAgentId),
    uniqueIndex("chat_messages_client_id_idx").on(t.conversationId, t.clientMessageId),
  ],
);

/** Images/files pasted or dropped into chat, embedded as `image`/`fileAttachment`
 * nodes in a message's body.doc — served via `/api/chat/attachments/:id`. */
export const chatAttachments = pgTable(
  "chat_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    uploaderId: uuid("uploader_id").references(() => users.id, { onDelete: "set null" }),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksumSha256: text("checksum_sha256"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("chat_attachments_conversation_idx").on(t.conversationId),
    index("chat_attachments_checksum_idx").on(t.conversationId, t.checksumSha256),
  ],
);

export const chatAttachmentsRelations = relations(chatAttachments, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatAttachments.conversationId],
    references: [chatConversations.id],
  }),
  uploader: one(users, { fields: [chatAttachments.uploaderId], references: [users.id] }),
}));

/** Upstream LLM/embeddings provider a usage event was billed against. */
export const aiUsageProvider = pgEnum("ai_usage_provider", ["xai", "openai"]);

/**
 * One row per outbound AI API call (chat completion or embeddings request) —
 * the full usage ledger: who triggered it, which agent/conversation it was
 * for, what it cost in tokens, and how long it took. Written by
 * `recordAiUsage` (apps/web/src/lib/ai-usage.ts) from every call site in
 * lib/xai.ts and lib/embeddings.ts, success or failure, so the admin AI tab
 * has a complete picture rather than a sample.
 */
export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: aiUsageProvider("provider").notNull(),
    model: text("model").notNull(),
    /** e.g. "agent-chat-reply", "agent-brief-expand", "doc-embedding", "knowledge-query" */
    purpose: text("purpose").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id").references(() => chatConversations.id, {
      onDelete: "set null",
    }),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    durationMs: integer("duration_ms").notNull(),
    ok: boolean("ok").notNull().default(true),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_usage_events_created_idx").on(t.createdAt),
    index("ai_usage_events_actor_idx").on(t.actorUserId),
    index("ai_usage_events_agent_idx").on(t.agentId),
    index("ai_usage_events_model_idx").on(t.model),
  ],
);

export const aiUsageEventsRelations = relations(aiUsageEvents, ({ one }) => ({
  actor: one(users, { fields: [aiUsageEvents.actorUserId], references: [users.id] }),
  agent: one(agents, { fields: [aiUsageEvents.agentId], references: [agents.id] }),
  conversation: one(chatConversations, {
    fields: [aiUsageEvents.conversationId],
    references: [chatConversations.id],
  }),
}));

export const agentsRelations = relations(agents, ({ many, one }) => ({
  conversations: many(chatConversations),
  messages: many(chatMessages),
  knowledge: many(agentKnowledge),
  members: many(agentMembers),
  creator: one(users, { fields: [agents.createdById], references: [users.id] }),
}));

export const agentKnowledgeRelations = relations(agentKnowledge, ({ one }) => ({
  agent: one(agents, { fields: [agentKnowledge.agentId], references: [agents.id] }),
}));

/**
 * Super Agent memory kinds (Hermes/OpenClaw-aligned).
 * - recent: LEGACY chat-clone rows — no longer written or injected
 * - preference: per-user directives (USER hot block)
 * - fact / intelligence: shared durable notes (AGENT hot block)
 * - procedure: playbooks / "when X do Y" flows (PROCEDURE hot block)
 */
export const agentMemoryKind = pgEnum("agent_memory_kind", [
  "recent",
  "preference",
  "fact",
  "intelligence",
  "procedure",
]);

export const agentMemories = pgTable(
  "agent_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /** Null = shared agent memory; set = per-user preference / recent */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    kind: agentMemoryKind("kind").notNull().default("fact"),
    content: text("content").notNull(),
    /** Optional link back to the conversation that produced this memory */
    sourceConversationId: uuid("source_conversation_id").references(() => chatConversations.id, {
      onDelete: "set null",
    }),
    /** 0–100; higher = keep longer when pruning */
    importance: text("importance").notNull().default("50"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("agent_memories_agent_idx").on(t.agentId, t.kind),
    index("agent_memories_user_idx").on(t.userId),
  ],
);

export const agentMemoriesRelations = relations(agentMemories, ({ one }) => ({
  agent: one(agents, { fields: [agentMemories.agentId], references: [agents.id] }),
  user: one(users, { fields: [agentMemories.userId], references: [users.id] }),
}));

export const chatConversationsRelations = relations(chatConversations, ({ one, many }) => ({
  agent: one(agents, { fields: [chatConversations.agentId], references: [agents.id] }),
  creator: one(users, { fields: [chatConversations.createdBy], references: [users.id] }),
  members: many(chatConversationMembers),
  messages: many(chatMessages),
}));

export const chatConversationMembersRelations = relations(chatConversationMembers, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatConversationMembers.conversationId],
    references: [chatConversations.id],
  }),
  user: one(users, { fields: [chatConversationMembers.userId], references: [users.id] }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
  authorUser: one(users, { fields: [chatMessages.authorUserId], references: [users.id] }),
  authorAgent: one(agents, { fields: [chatMessages.authorAgentId], references: [agents.id] }),
}));
