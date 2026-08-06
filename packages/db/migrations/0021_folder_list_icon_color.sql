-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "icon" text;
--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "color" text;
--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "icon" text;
--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "color" text;
