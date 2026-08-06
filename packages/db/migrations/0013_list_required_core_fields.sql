-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
ALTER TABLE "lists" ADD COLUMN "required_core_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;
