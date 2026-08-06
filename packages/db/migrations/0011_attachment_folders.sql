-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
CREATE TABLE "attachment_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"parent_folder_id" uuid,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachment_folders" ADD CONSTRAINT "attachment_folders_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attachment_folders" ADD CONSTRAINT "attachment_folders_parent_folder_id_attachment_folders_id_fk" FOREIGN KEY ("parent_folder_id") REFERENCES "public"."attachment_folders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "attachment_folders_task_idx" ON "attachment_folders" USING btree ("task_id");
--> statement-breakpoint
CREATE INDEX "attachment_folders_parent_idx" ON "attachment_folders" USING btree ("parent_folder_id");
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "folder_id" uuid;
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_folder_id_attachment_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."attachment_folders"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "attachments_folder_idx" ON "attachments" USING btree ("folder_id");
