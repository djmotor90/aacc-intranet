-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
ALTER TABLE "modules" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "icon" text DEFAULT 'tasks' NOT NULL;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "position" text DEFAULT 'a0' NOT NULL;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "modules_position_idx" ON "modules" USING btree ("position");--> statement-breakpoint
-- Mark the existing Tasks module as system so it cannot be deleted.
UPDATE "modules" SET "is_system" = true, "icon" = 'tasks', "position" = 'a0', "name" = COALESCE(NULLIF("name", ''), 'Tasks') WHERE "slug" = 'tasks';
