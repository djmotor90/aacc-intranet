-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
-- Super Agent people: owner / admin (edit) / member (chat).

DO $$ BEGIN
  CREATE TYPE "public"."agent_member_role" AS ENUM('owner', 'admin', 'member');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_members" (
  "agent_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" "agent_member_role" DEFAULT 'member' NOT NULL,
  "added_by_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_members_agent_id_user_id_pk" PRIMARY KEY("agent_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agent_members" ADD CONSTRAINT "agent_members_agent_id_agents_id_fk"
    FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agent_members" ADD CONSTRAINT "agent_members_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agent_members" ADD CONSTRAINT "agent_members_added_by_id_users_id_fk"
    FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_members_user_idx" ON "agent_members" USING btree ("user_id");

-- Backfill: agent creators become owners
INSERT INTO "agent_members" ("agent_id", "user_id", "role", "added_by_id")
SELECT a."id", a."created_by_id", 'owner', a."created_by_id"
FROM "agents" a
WHERE a."created_by_id" IS NOT NULL
ON CONFLICT DO NOTHING;
