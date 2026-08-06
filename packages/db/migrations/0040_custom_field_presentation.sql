-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
ALTER TABLE "custom_field_definitions"
  ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "custom_field_definitions"
  ADD COLUMN IF NOT EXISTS "label_position" text NOT NULL DEFAULT 'top';
--> statement-breakpoint
ALTER TABLE "custom_field_definitions"
  DROP CONSTRAINT IF EXISTS "custom_field_definitions_label_position_check";
--> statement-breakpoint
ALTER TABLE "custom_field_definitions"
  ADD CONSTRAINT "custom_field_definitions_label_position_check"
  CHECK ("label_position" IN ('top', 'left', 'right', 'bottom', 'inside', 'hidden'));
