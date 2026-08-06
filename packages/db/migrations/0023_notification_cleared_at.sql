-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
-- Soft-dismiss notifications from the inbox (Clear / Clear all).
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "cleared_at" timestamp with time zone;
