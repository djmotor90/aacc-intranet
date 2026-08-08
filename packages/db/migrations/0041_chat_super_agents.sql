-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
-- ClickUp-style Chat: Super Agents + conversations + messages (Phase 1 agent DMs).

DO $$ BEGIN
  CREATE TYPE "public"."chat_conversation_kind" AS ENUM('agent_dm', 'channel', 'dm', 'group');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "display_name" text NOT NULL,
  "title" text,
  "description" text,
  "avatar_emoji" text DEFAULT '🤖' NOT NULL,
  "avatar_key" text,
  "system_prompt" text DEFAULT '' NOT NULL,
  "tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "runtime" text DEFAULT 'stub' NOT NULL,
  "model" text,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agents_slug_idx" ON "agents" USING btree ("slug");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "chat_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" "chat_conversation_kind" DEFAULT 'agent_dm' NOT NULL,
  "agent_id" uuid,
  "title" text,
  "is_private" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "last_message_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_agent_id_agents_id_fk"
    FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_conversations_agent_idx" ON "chat_conversations" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_conversations_last_message_idx" ON "chat_conversations" USING btree ("last_message_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "chat_conversation_members" (
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text DEFAULT 'member' NOT NULL,
  "last_read_at" timestamp with time zone,
  "muted_at" timestamp with time zone,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chat_conversation_members_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "chat_conversation_members" ADD CONSTRAINT "chat_conversation_members_conversation_id_chat_conversations_id_fk"
    FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "chat_conversation_members" ADD CONSTRAINT "chat_conversation_members_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_conversation_members_user_idx" ON "chat_conversation_members" USING btree ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "author_user_id" uuid,
  "author_agent_id" uuid,
  "body" jsonb NOT NULL,
  "client_message_id" text,
  "edited_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk"
    FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_user_id_users_id_fk"
    FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_agent_id_agents_id_fk"
    FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_conversation_created_idx" ON "chat_messages" USING btree ("conversation_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_author_user_idx" ON "chat_messages" USING btree ("author_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_author_agent_idx" ON "chat_messages" USING btree ("author_agent_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_messages_client_id_idx" ON "chat_messages" USING btree ("conversation_id","client_message_id");
