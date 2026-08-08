-- Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver). Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
CREATE EXTENSION IF NOT EXISTS "vector";--> statement-breakpoint
CREATE TABLE "doc_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"heading" text,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doc_chunks" ADD CONSTRAINT "doc_chunks_page_id_doc_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."doc_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "doc_chunks_page_chunk_idx" ON "doc_chunks" USING btree ("page_id","chunk_index");--> statement-breakpoint
CREATE INDEX "doc_chunks_embedding_idx" ON "doc_chunks" USING hnsw ("embedding" vector_cosine_ops);
