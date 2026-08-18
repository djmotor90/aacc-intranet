-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
CREATE TABLE "drive_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_space_id" uuid NOT NULL,
	"parent_folder_id" uuid,
	"name" text NOT NULL,
	"created_by_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drive_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_space_id" uuid NOT NULL,
	"folder_id" uuid,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"object_key" text NOT NULL,
	"uploader_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drive_stars" (
	"file_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drive_stars_file_id_user_id_pk" PRIMARY KEY("file_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "drive_folders" ADD CONSTRAINT "drive_folders_home_space_id_spaces_id_fk" FOREIGN KEY ("home_space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_folders" ADD CONSTRAINT "drive_folders_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_home_space_id_spaces_id_fk" FOREIGN KEY ("home_space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_folder_id_drive_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."drive_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_stars" ADD CONSTRAINT "drive_stars_file_id_drive_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."drive_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_stars" ADD CONSTRAINT "drive_stars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drive_folders_space_parent_idx" ON "drive_folders" USING btree ("home_space_id","parent_folder_id");--> statement-breakpoint
CREATE INDEX "drive_folders_parent_idx" ON "drive_folders" USING btree ("parent_folder_id");--> statement-breakpoint
CREATE INDEX "drive_folders_deleted_idx" ON "drive_folders" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "drive_files_space_folder_idx" ON "drive_files" USING btree ("home_space_id","folder_id");--> statement-breakpoint
CREATE INDEX "drive_files_folder_idx" ON "drive_files" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "drive_files_deleted_idx" ON "drive_files" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "drive_files_updated_idx" ON "drive_files" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "drive_stars_user_idx" ON "drive_stars" USING btree ("user_id");
