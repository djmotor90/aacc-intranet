-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
CREATE TABLE "ee_db_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"name" text NOT NULL,
	"data_type" text NOT NULL,
	"nullable" boolean DEFAULT true NOT NULL,
	"comment" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ee_db_indexes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_unique" boolean DEFAULT false NOT NULL,
	"is_clustered" boolean DEFAULT false NOT NULL,
	"fields" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ee_db_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"schema_name" text NOT NULL,
	"table_name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ee_db_columns" ADD CONSTRAINT "ee_db_columns_table_id_ee_db_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."ee_db_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ee_db_indexes" ADD CONSTRAINT "ee_db_indexes_table_id_ee_db_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."ee_db_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ee_db_columns_table_idx" ON "ee_db_columns" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "ee_db_columns_name_idx" ON "ee_db_columns" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ee_db_indexes_table_idx" ON "ee_db_indexes" USING btree ("table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ee_db_tables_full_name_idx" ON "ee_db_tables" USING btree ("full_name");
