-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_deleted_at_idx" ON "tasks" USING btree ("deleted_at");