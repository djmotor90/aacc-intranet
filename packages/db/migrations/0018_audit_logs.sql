-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" bigserial PRIMARY KEY,
  "category" text NOT NULL,
  "event_type" text NOT NULL,
  "event_status" text DEFAULT 'success' NOT NULL,
  "title" text NOT NULL,
  "actor_id" uuid,
  "actor_email" text,
  "actor_name" text,
  "actor_role" text,
  "target_type" text,
  "target_id" text,
  "target_label" text,
  "space_id" uuid,
  "task_id" uuid,
  "client_ip" text,
  "client_agent" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_category_created_idx" ON "audit_logs" USING btree ("category","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_actor_created_idx" ON "audit_logs" USING btree ("actor_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_event_type_idx" ON "audit_logs" USING btree ("event_type");
