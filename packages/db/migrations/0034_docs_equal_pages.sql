-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
-- Equal peer pages: doc_id container + top-level pages all have parent_page_id null.

ALTER TABLE "doc_pages" ADD COLUMN "doc_id" uuid;--> statement-breakpoint

-- Each former root page becomes a doc container id.
UPDATE "doc_pages" SET "doc_id" = "id" WHERE "parent_page_id" IS NULL;--> statement-breakpoint

-- Propagate doc_id down the tree (repeat for deep nests).
UPDATE "doc_pages" AS c
SET "doc_id" = p."doc_id"
FROM "doc_pages" AS p
WHERE c."parent_page_id" = p."id"
  AND c."doc_id" IS NULL
  AND p."doc_id" IS NOT NULL;--> statement-breakpoint

UPDATE "doc_pages" AS c
SET "doc_id" = p."doc_id"
FROM "doc_pages" AS p
WHERE c."parent_page_id" = p."id"
  AND c."doc_id" IS NULL
  AND p."doc_id" IS NOT NULL;--> statement-breakpoint

UPDATE "doc_pages" AS c
SET "doc_id" = p."doc_id"
FROM "doc_pages" AS p
WHERE c."parent_page_id" = p."id"
  AND c."doc_id" IS NULL
  AND p."doc_id" IS NOT NULL;--> statement-breakpoint

UPDATE "doc_pages" AS c
SET "doc_id" = p."doc_id"
FROM "doc_pages" AS p
WHERE c."parent_page_id" = p."id"
  AND c."doc_id" IS NULL
  AND p."doc_id" IS NOT NULL;--> statement-breakpoint

UPDATE "doc_pages" AS c
SET "doc_id" = p."doc_id"
FROM "doc_pages" AS p
WHERE c."parent_page_id" = p."id"
  AND c."doc_id" IS NULL
  AND p."doc_id" IS NOT NULL;--> statement-breakpoint

UPDATE "doc_pages" AS c
SET "doc_id" = p."doc_id"
FROM "doc_pages" AS p
WHERE c."parent_page_id" = p."id"
  AND c."doc_id" IS NULL
  AND p."doc_id" IS NOT NULL;--> statement-breakpoint

UPDATE "doc_pages" AS c
SET "doc_id" = p."doc_id"
FROM "doc_pages" AS p
WHERE c."parent_page_id" = p."id"
  AND c."doc_id" IS NULL
  AND p."doc_id" IS NOT NULL;--> statement-breakpoint

UPDATE "doc_pages" AS c
SET "doc_id" = p."doc_id"
FROM "doc_pages" AS p
WHERE c."parent_page_id" = p."id"
  AND c."doc_id" IS NULL
  AND p."doc_id" IS NOT NULL;--> statement-breakpoint

-- Safety: any leftover row becomes its own doc.
UPDATE "doc_pages" SET "doc_id" = "id" WHERE "doc_id" IS NULL;--> statement-breakpoint

ALTER TABLE "doc_pages" ALTER COLUMN "doc_id" SET NOT NULL;--> statement-breakpoint

-- Promote former "children of home" to equal top-level peers (parent null, same doc).
UPDATE "doc_pages"
SET "parent_page_id" = NULL
WHERE "parent_page_id" = "doc_id";--> statement-breakpoint

-- Resolve slug collisions among new top-level peers within a doc.
WITH ranked AS (
  SELECT
    id,
    slug,
    ROW_NUMBER() OVER (
      PARTITION BY doc_id, coalesce(parent_page_id, '00000000-0000-0000-0000-000000000000'::uuid), slug
      ORDER BY created_at, id
    ) AS rn
  FROM doc_pages
  WHERE deleted_at IS NULL
)
UPDATE doc_pages AS d
SET slug = d.slug || '-' || ranked.rn
FROM ranked
WHERE d.id = ranked.id AND ranked.rn > 1;--> statement-breakpoint

DROP INDEX IF EXISTS "doc_pages_sibling_slug_idx";--> statement-breakpoint

CREATE UNIQUE INDEX "doc_pages_sibling_slug_idx" ON "doc_pages" USING btree (
  "doc_id",
  coalesce("parent_page_id", '00000000-0000-0000-0000-000000000000'::uuid),
  "slug"
);--> statement-breakpoint

CREATE INDEX "doc_pages_doc_parent_idx" ON "doc_pages" USING btree ("doc_id","parent_page_id","position");
