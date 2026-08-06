-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
CREATE TABLE "list_secret_viewers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"principal_type" "principal_type" NOT NULL,
	"user_id" uuid,
	"group_id" uuid,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secret_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#64748b' NOT NULL,
	"position" text DEFAULT 'a0' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"title" text NOT NULL,
	"fields_schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"encrypted_values" text NOT NULL,
	"encryption_iv" text NOT NULL,
	"encryption_tag" text NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "secrets_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "list_secret_viewers" ADD CONSTRAINT "list_secret_viewers_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_secret_viewers" ADD CONSTRAINT "list_secret_viewers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_secret_viewers" ADD CONSTRAINT "list_secret_viewers_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_categories" ADD CONSTRAINT "secret_categories_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_categories" ADD CONSTRAINT "secret_categories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_category_id_secret_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."secret_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "list_secret_viewers_user_idx" ON "list_secret_viewers" USING btree ("list_id","user_id") WHERE "list_secret_viewers"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "list_secret_viewers_group_idx" ON "list_secret_viewers" USING btree ("list_id","group_id") WHERE "list_secret_viewers"."group_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "secret_categories_list_name_idx" ON "secret_categories" USING btree ("list_id",lower("name"));--> statement-breakpoint
CREATE INDEX "secret_categories_list_idx" ON "secret_categories" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "secrets_task_idx" ON "secrets" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "secrets_category_idx" ON "secrets" USING btree ("category_id");
