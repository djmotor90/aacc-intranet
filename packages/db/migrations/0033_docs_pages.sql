-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
CREATE TYPE "public"."doc_page_kind" AS ENUM('page', 'wiki');--> statement-breakpoint
CREATE TYPE "public"."doc_link_target_type" AS ENUM('space', 'folder', 'list', 'task');--> statement-breakpoint
CREATE TABLE "doc_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_space_id" uuid NOT NULL,
	"parent_page_id" uuid,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"slug" text NOT NULL,
	"icon" text,
	"cover_object_key" text,
	"body" jsonb DEFAULT '{"text":"","doc":null}'::jsonb NOT NULL,
	"kind" "doc_page_kind" DEFAULT 'page' NOT NULL,
	"position" text DEFAULT 'a0' NOT NULL,
	"is_protected" boolean DEFAULT false NOT NULL,
	"owner_id" uuid,
	"verified_at" timestamp with time zone,
	"verified_by_id" uuid,
	"created_by_id" uuid,
	"updated_by_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"target_type" "doc_link_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"uploader_id" uuid,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doc_pages" ADD CONSTRAINT "doc_pages_home_space_id_spaces_id_fk" FOREIGN KEY ("home_space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_pages" ADD CONSTRAINT "doc_pages_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_pages" ADD CONSTRAINT "doc_pages_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_pages" ADD CONSTRAINT "doc_pages_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_pages" ADD CONSTRAINT "doc_pages_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_links" ADD CONSTRAINT "doc_links_page_id_doc_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."doc_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_links" ADD CONSTRAINT "doc_links_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_attachments" ADD CONSTRAINT "doc_attachments_page_id_doc_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."doc_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_attachments" ADD CONSTRAINT "doc_attachments_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_pages_space_parent_idx" ON "doc_pages" USING btree ("home_space_id","parent_page_id","position");--> statement-breakpoint
CREATE INDEX "doc_pages_space_updated_idx" ON "doc_pages" USING btree ("home_space_id","updated_at");--> statement-breakpoint
CREATE INDEX "doc_pages_owner_idx" ON "doc_pages" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "doc_pages_deleted_idx" ON "doc_pages" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_pages_sibling_slug_idx" ON "doc_pages" USING btree ("home_space_id",coalesce("parent_page_id", '00000000-0000-0000-0000-000000000000'::uuid),"slug");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_links_unique_idx" ON "doc_links" USING btree ("page_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "doc_links_target_idx" ON "doc_links" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "doc_links_page_idx" ON "doc_links" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "doc_attachments_page_idx" ON "doc_attachments" USING btree ("page_id");
