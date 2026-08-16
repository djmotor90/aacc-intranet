-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
CREATE TABLE "outreach_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "outreach_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"location" text,
	"description" text,
	"completed_at" timestamp with time zone,
	"owner_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_followers" (
	"entity_type" "outreach_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_followers_entity_type_entity_id_user_id_pk" PRIMARY KEY("entity_type","entity_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "outreach_events" ADD CONSTRAINT "outreach_events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_events" ADD CONSTRAINT "outreach_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_followers" ADD CONSTRAINT "outreach_followers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outreach_events_entity_idx" ON "outreach_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "outreach_events_starts_idx" ON "outreach_events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "outreach_events_owner_idx" ON "outreach_events" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "outreach_followers_user_idx" ON "outreach_followers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "outreach_followers_entity_idx" ON "outreach_followers" USING btree ("entity_type","entity_id");