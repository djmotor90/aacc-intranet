-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
ALTER TABLE "attachment_versions" ADD COLUMN "version_label" text;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "current_version_label" text;
