-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
ALTER TABLE "public_forms" ADD COLUMN IF NOT EXISTS "default_status_id" uuid;--> statement-breakpoint
ALTER TABLE "public_forms" ADD COLUMN IF NOT EXISTS "default_assignee_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "public_forms" ADD COLUMN IF NOT EXISTS "allow_attachments" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "public_forms" ADD COLUMN IF NOT EXISTS "max_attachments" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_forms_list_idx" ON "public_forms" USING btree ("list_id");
