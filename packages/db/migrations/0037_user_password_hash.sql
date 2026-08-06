-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
-- Local password auth for pre-Entra deployments (optional scrypt hash).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;
