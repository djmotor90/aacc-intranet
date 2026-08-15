-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
CREATE TABLE "attachment_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"uploader_id" uuid,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "current_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "attachment_versions" ADD CONSTRAINT "attachment_versions_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_versions" ADD CONSTRAINT "attachment_versions_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attachment_versions_attachment_version_idx" ON "attachment_versions" USING btree ("attachment_id","version_number");--> statement-breakpoint
CREATE INDEX "attachment_versions_attachment_idx" ON "attachment_versions" USING btree ("attachment_id");--> statement-breakpoint
INSERT INTO "attachment_versions" (
	"attachment_id",
	"version_number",
	"uploader_id",
	"object_key",
	"file_name",
	"mime_type",
	"size_bytes",
	"checksum_sha256",
	"created_at"
)
SELECT
	"id",
	1,
	"uploader_id",
	"object_key",
	"file_name",
	"mime_type",
	"size_bytes",
	"checksum_sha256",
	"created_at"
FROM "attachments"
ON CONFLICT ("attachment_id", "version_number") DO NOTHING;
