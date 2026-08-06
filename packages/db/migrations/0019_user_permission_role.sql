-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "permission_role_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_permission_role_idx" ON "users" USING btree ("permission_role_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_permission_role_id_permission_roles_id_fk"
    FOREIGN KEY ("permission_role_id") REFERENCES "public"."permission_roles"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
-- Default existing non–Super-Admin users to the system Member role when present.
UPDATE "users" u
SET "permission_role_id" = pr.id
FROM "permission_roles" pr
WHERE pr.slug = 'member'
  AND u.permission_role_id IS NULL
  AND u.is_protected_admin = false
  AND u.platform_role = 'member';
