-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
CREATE TABLE "doc_page_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "page_id" uuid NOT NULL,
  "body_version" integer NOT NULL,
  "body" jsonb NOT NULL,
  "change_type" text DEFAULT 'saved' NOT NULL,
  "restored_from_revision_id" uuid,
  "created_by_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doc_page_revisions" ADD CONSTRAINT "doc_page_revisions_page_id_doc_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."doc_pages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "doc_page_revisions" ADD CONSTRAINT "doc_page_revisions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "doc_page_revisions_page_created_idx" ON "doc_page_revisions" USING btree ("page_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "doc_page_revisions_page_version_idx" ON "doc_page_revisions" USING btree ("page_id","body_version");
