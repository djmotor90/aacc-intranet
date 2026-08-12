-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
CREATE TABLE "team_memberships" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_memberships_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"alias" text NOT NULL,
	"description" text,
	"icon" text,
	"color" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_alias_unique" UNIQUE("alias")
);
--> statement-breakpoint
-- Snapshot any legacy collaboration principal into an app-managed Team while
-- retaining the original Entra identity records untouched for access control.
INSERT INTO "teams" (
	"id", "display_name", "alias", "description", "icon", "color", "created_by", "created_at", "updated_at"
)
SELECT
	eg."id",
	eg."display_name",
	COALESCE(NULLIF(eg."alias", ''), 'migrated-' || eg."id"::text),
	eg."description",
	eg."icon",
	eg."color",
	eg."created_by",
	eg."created_at",
	eg."updated_at"
FROM "entra_groups" eg
WHERE eg."source" = 'manual'
	OR eg."id" IN (
		SELECT "group_id" FROM "space_members" WHERE "group_id" IS NOT NULL
		UNION SELECT "group_id" FROM "folder_members" WHERE "group_id" IS NOT NULL
		UNION SELECT "group_id" FROM "list_members" WHERE "group_id" IS NOT NULL
		UNION SELECT "group_id" FROM "list_secret_viewers" WHERE "group_id" IS NOT NULL
		UNION SELECT "group_id" FROM "task_group_assignees"
	)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "team_memberships" ("team_id", "user_id", "created_at")
SELECT ugm."group_id", ugm."user_id", now()
FROM "user_group_memberships" ugm
INNER JOIN "teams" t ON t."id" = ugm."group_id"
ON CONFLICT ("team_id", "user_id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "task_group_assignees" DROP CONSTRAINT "task_group_assignees_group_id_entra_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_members" ADD CONSTRAINT "folder_members_group_id_teams_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_group_id_teams_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_group_id_teams_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_group_assignees" ADD CONSTRAINT "task_group_assignees_group_id_teams_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_secret_viewers" ADD CONSTRAINT "list_secret_viewers_group_id_teams_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
