-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
ALTER TABLE "public_forms" ADD COLUMN IF NOT EXISTS "list_view_id" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_forms_list_view_idx" ON "public_forms" USING btree ("list_view_id");
