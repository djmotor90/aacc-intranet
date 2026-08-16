-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
CREATE TABLE "outreach_price_book_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"price_book_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"hours" integer DEFAULT 0 NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"context_level" "outreach_context_level" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_price_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_standard" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outreach_catalog_items" ADD COLUMN "product_code" text;--> statement-breakpoint
ALTER TABLE "outreach_catalog_items" ADD COLUMN "family" text;--> statement-breakpoint
ALTER TABLE "outreach_catalog_items" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "outreach_price_book_entries" ADD CONSTRAINT "outreach_price_book_entries_price_book_id_outreach_price_books_id_fk" FOREIGN KEY ("price_book_id") REFERENCES "public"."outreach_price_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_price_book_entries" ADD CONSTRAINT "outreach_price_book_entries_catalog_item_id_outreach_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."outreach_catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_price_books" ADD CONSTRAINT "outreach_price_books_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_price_book_entry_unique_idx" ON "outreach_price_book_entries" USING btree ("price_book_id","catalog_item_id");--> statement-breakpoint
CREATE INDEX "outreach_price_book_entries_book_idx" ON "outreach_price_book_entries" USING btree ("price_book_id");--> statement-breakpoint
CREATE INDEX "outreach_price_books_active_idx" ON "outreach_price_books" USING btree ("is_active");