-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
-- Drive-style folders for All Docs hub.

CREATE TABLE "doc_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_space_id" uuid NOT NULL,
	"parent_folder_id" uuid,
	"name" text NOT NULL,
	"position" text DEFAULT 'a0' NOT NULL,
	"created_by_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doc_folders" ADD CONSTRAINT "doc_folders_home_space_id_spaces_id_fk" FOREIGN KEY ("home_space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_folders" ADD CONSTRAINT "doc_folders_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_folders_space_parent_idx" ON "doc_folders" USING btree ("home_space_id","parent_folder_id","position");--> statement-breakpoint
CREATE INDEX "doc_folders_parent_idx" ON "doc_folders" USING btree ("parent_folder_id");--> statement-breakpoint
CREATE INDEX "doc_folders_deleted_idx" ON "doc_folders" USING btree ("deleted_at");--> statement-breakpoint

ALTER TABLE "doc_pages" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "doc_pages" ADD CONSTRAINT "doc_pages_folder_id_doc_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."doc_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_pages_folder_idx" ON "doc_pages" USING btree ("folder_id");
