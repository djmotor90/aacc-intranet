-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
-- Super Agent long-term memory (recent / preferences / intelligence).

DO $$ BEGIN
  CREATE TYPE "public"."agent_memory_kind" AS ENUM('recent', 'preference', 'fact', 'intelligence');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_memories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL,
  "user_id" uuid,
  "kind" "agent_memory_kind" DEFAULT 'fact' NOT NULL,
  "content" text NOT NULL,
  "source_conversation_id" uuid,
  "importance" text DEFAULT '50' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_agent_id_agents_id_fk"
    FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_source_conversation_id_chat_conversations_id_fk"
    FOREIGN KEY ("source_conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_memories_agent_idx" ON "agent_memories" USING btree ("agent_id","kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_memories_user_idx" ON "agent_memories" USING btree ("user_id");
