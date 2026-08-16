-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
ALTER TYPE "outreach_quote_status" ADD VALUE IF NOT EXISTS 'needs_review';--> statement-breakpoint
ALTER TYPE "outreach_quote_status" ADD VALUE IF NOT EXISTS 'in_review';--> statement-breakpoint
ALTER TYPE "outreach_quote_status" ADD VALUE IF NOT EXISTS 'approved';--> statement-breakpoint
ALTER TYPE "outreach_quote_status" ADD VALUE IF NOT EXISTS 'rejected';--> statement-breakpoint
ALTER TYPE "outreach_quote_status" ADD VALUE IF NOT EXISTS 'presented';--> statement-breakpoint
ALTER TYPE "outreach_quote_status" ADD VALUE IF NOT EXISTS 'denied';--> statement-breakpoint
ALTER TABLE "outreach_quotes" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "outreach_quotes" ADD COLUMN "details" text;--> statement-breakpoint
ALTER TABLE "outreach_quotes" ADD COLUMN "discount_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_quotes" ADD COLUMN "tax_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_quotes" ADD COLUMN "shipping_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_quotes" ADD COLUMN "bill_to_name" text;--> statement-breakpoint
ALTER TABLE "outreach_quotes" ADD COLUMN "ship_to_name" text;--> statement-breakpoint
ALTER TABLE "outreach_quotes" ADD COLUMN "ship_to_address" text;--> statement-breakpoint
ALTER TABLE "outreach_quote_lines" ADD COLUMN "list_price_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "outreach_quotes" SET "name" = "number" WHERE "name" IS NULL;--> statement-breakpoint
UPDATE "outreach_quote_lines" SET "list_price_cents" = "unit_price_cents" WHERE "list_price_cents" = 0;--> statement-breakpoint
CREATE TABLE "outreach_quote_pdfs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"content" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outreach_quote_pdfs" ADD CONSTRAINT "outreach_quote_pdfs_quote_id_outreach_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."outreach_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_quote_pdfs" ADD CONSTRAINT "outreach_quote_pdfs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outreach_quote_pdfs_quote_idx" ON "outreach_quote_pdfs" USING btree ("quote_id");
