-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
CREATE TYPE "public"."outreach_context_level" AS ENUM('none', 'light', 'full');--> statement-breakpoint
CREATE TYPE "public"."outreach_entity_type" AS ENUM('account', 'lead', 'opportunity', 'quote');--> statement-breakpoint
CREATE TYPE "public"."outreach_lead_status" AS ENUM('new', 'contacted', 'nurturing', 'unqualified', 'converted');--> statement-breakpoint
CREATE TYPE "public"."outreach_opp_stage" AS ENUM('prospect', 'analysis', 'pre_proposal', 'presentation', 'negotiation', 'contract', 'closed_won', 'closed_lost');--> statement-breakpoint
CREATE TYPE "public"."outreach_quote_status" AS ENUM('draft', 'sent', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "outreach_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"phone" text,
	"notes" text,
	"owner_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "outreach_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"default_hours" integer DEFAULT 0 NOT NULL,
	"default_unit_price_cents" integer DEFAULT 0 NOT NULL,
	"default_context" "outreach_context_level" DEFAULT 'none' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"title" text,
	"company" text,
	"email" text,
	"phone" text,
	"status" "outreach_lead_status" DEFAULT 'new' NOT NULL,
	"source" text,
	"notes" text,
	"account_id" uuid,
	"owner_id" uuid,
	"converted_opportunity_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"account_id" uuid,
	"lead_id" uuid,
	"stage" "outreach_opp_stage" DEFAULT 'prospect' NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"close_date" date,
	"description" text,
	"owner_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_opportunity_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"catalog_item_id" uuid,
	"name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"hours" integer DEFAULT 0 NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"context_level" "outreach_context_level" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_quote_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"hours" integer DEFAULT 0 NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"context_level" "outreach_context_level" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"account_id" uuid,
	"status" "outreach_quote_status" DEFAULT 'draft' NOT NULL,
	"valid_until" date,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_task_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"entity_type" "outreach_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outreach_accounts" ADD CONSTRAINT "outreach_accounts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_accounts" ADD CONSTRAINT "outreach_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_activities" ADD CONSTRAINT "outreach_activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_leads" ADD CONSTRAINT "outreach_leads_account_id_outreach_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."outreach_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_leads" ADD CONSTRAINT "outreach_leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_leads" ADD CONSTRAINT "outreach_leads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_opportunities" ADD CONSTRAINT "outreach_opportunities_account_id_outreach_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."outreach_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_opportunities" ADD CONSTRAINT "outreach_opportunities_lead_id_outreach_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."outreach_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_opportunities" ADD CONSTRAINT "outreach_opportunities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_opportunities" ADD CONSTRAINT "outreach_opportunities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_opportunity_lines" ADD CONSTRAINT "outreach_opportunity_lines_opportunity_id_outreach_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."outreach_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_opportunity_lines" ADD CONSTRAINT "outreach_opportunity_lines_catalog_item_id_outreach_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."outreach_catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_quote_lines" ADD CONSTRAINT "outreach_quote_lines_quote_id_outreach_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."outreach_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_quotes" ADD CONSTRAINT "outreach_quotes_opportunity_id_outreach_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."outreach_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_quotes" ADD CONSTRAINT "outreach_quotes_account_id_outreach_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."outreach_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_quotes" ADD CONSTRAINT "outreach_quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_task_links" ADD CONSTRAINT "outreach_task_links_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_task_links" ADD CONSTRAINT "outreach_task_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outreach_accounts_name_idx" ON "outreach_accounts" USING btree ("name");--> statement-breakpoint
CREATE INDEX "outreach_activities_entity_idx" ON "outreach_activities" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "outreach_catalog_active_idx" ON "outreach_catalog_items" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "outreach_leads_status_idx" ON "outreach_leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outreach_leads_owner_idx" ON "outreach_leads" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "outreach_opps_stage_idx" ON "outreach_opportunities" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "outreach_opps_account_idx" ON "outreach_opportunities" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "outreach_opp_lines_opp_idx" ON "outreach_opportunity_lines" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "outreach_quote_lines_quote_idx" ON "outreach_quote_lines" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_quotes_number_idx" ON "outreach_quotes" USING btree ("number");--> statement-breakpoint
CREATE INDEX "outreach_quotes_opp_idx" ON "outreach_quotes" USING btree ("opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_task_links_unique_idx" ON "outreach_task_links" USING btree ("task_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "outreach_task_links_entity_idx" ON "outreach_task_links" USING btree ("entity_type","entity_id");
