-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
CREATE TABLE "task_group_assignees" (
	"task_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_group_assignees_task_id_group_id_pk" PRIMARY KEY("task_id","group_id")
);
--> statement-breakpoint
ALTER TABLE "entra_groups" ALTER COLUMN "entra_group_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "entra_groups" ADD COLUMN "alias" text;--> statement-breakpoint
ALTER TABLE "entra_groups" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "entra_groups" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "entra_groups" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "entra_groups" ADD COLUMN "source" text DEFAULT 'entra' NOT NULL;--> statement-breakpoint
ALTER TABLE "entra_groups" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "task_group_assignees" ADD CONSTRAINT "task_group_assignees_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_group_assignees" ADD CONSTRAINT "task_group_assignees_group_id_entra_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."entra_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_group_assignees" ADD CONSTRAINT "task_group_assignees_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_group_assignees_group_idx" ON "task_group_assignees" USING btree ("group_id");--> statement-breakpoint
ALTER TABLE "entra_groups" ADD CONSTRAINT "entra_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entra_groups" ADD CONSTRAINT "entra_groups_alias_unique" UNIQUE("alias");
