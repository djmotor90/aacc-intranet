-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
-- Add the file custom field type (safe if already present).
DO $$ BEGIN
  ALTER TYPE "public"."custom_field_type" ADD VALUE IF NOT EXISTS 'file';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
