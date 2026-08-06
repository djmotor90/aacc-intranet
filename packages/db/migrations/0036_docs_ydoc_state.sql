-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
-- Yjs document state for live multiplayer editing.

ALTER TABLE "doc_pages" ADD COLUMN IF NOT EXISTS "ydoc_state" bytea;
