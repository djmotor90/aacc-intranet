-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
-- Independent optimistic-concurrency token for Doc body edits.

ALTER TABLE "doc_pages" ADD COLUMN IF NOT EXISTS "body_version" integer DEFAULT 0 NOT NULL;
