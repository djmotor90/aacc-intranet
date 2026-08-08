-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
-- Super Agent memory layers: procedure kind + conversation rolling summary
ALTER TYPE "agent_memory_kind" ADD VALUE IF NOT EXISTS 'procedure';
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "context_summary" text;
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "context_summary_at" timestamp with time zone;
