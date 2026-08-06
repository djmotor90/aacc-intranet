-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
-- Track when the recipient last opened the in-notification reply thread
-- so we can badge "new messages" while the thread panel is collapsed.
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "thread_viewed_at" timestamp with time zone;
