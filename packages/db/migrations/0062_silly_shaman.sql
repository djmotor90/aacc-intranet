-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
CREATE TABLE "sidebar_nav_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"kind" text DEFAULT 'builtin' NOT NULL,
	"label" text NOT NULL,
	"href" text NOT NULL,
	"icon" text DEFAULT 'tasks' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"admin_only" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"module_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sidebar_nav_items_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "sidebar_nav_items" ADD CONSTRAINT "sidebar_nav_items_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sidebar_nav_items_position_idx" ON "sidebar_nav_items" USING btree ("position");--> statement-breakpoint
CREATE INDEX "sidebar_nav_items_module_idx" ON "sidebar_nav_items" USING btree ("module_id");