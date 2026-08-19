-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
ALTER TABLE "custom_field_definitions"
  ADD COLUMN IF NOT EXISTS "option_color_display" text NOT NULL DEFAULT 'dot';
--> statement-breakpoint
ALTER TABLE "custom_field_definitions"
  DROP CONSTRAINT IF EXISTS "custom_field_definitions_option_color_display_check";
--> statement-breakpoint
ALTER TABLE "custom_field_definitions"
  ADD CONSTRAINT "custom_field_definitions_option_color_display_check"
  CHECK ("option_color_display" IN ('dot', 'fill'));
