/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Re-embed one Doc page's body into doc_chunks for pgvector retrieval.
 * Runs async after every save (see enqueue call sites) so saving never waits
 * on an embeddings API round trip. Chunk rows for the page are fully
 * replaced each run rather than diffed — chunk boundaries can shift on any
 * edit, so incremental diffing isn't worth the complexity at this scale.
 */
import { db, docChunks, docPages } from "@aitim/db";
import { eq } from "drizzle-orm";
import { EMBEDDING_MODEL, embedTexts, hasOpenAiKey } from "@/lib/embeddings";
import { chunkDoc, chunkEmbeddingText } from "@/modules/docs/lib/chunking";

export type EmbedDocPayload = { pageId: string };

export async function runEmbedDocJob(payload: EmbedDocPayload): Promise<string> {
  const { pageId } = payload;
  if (!hasOpenAiKey()) return `skipped ${pageId}: OPENAI_API_KEY not set`;

  const [page] = await db
    .select({ id: docPages.id, title: docPages.title, body: docPages.body, deletedAt: docPages.deletedAt })
    .from(docPages)
    .where(eq(docPages.id, pageId))
    .limit(1);
  if (!page || page.deletedAt) {
    // Page gone — drop any stale chunks for it (cascade would also handle a
    // hard delete, but a soft-delete leaves the page row, and the chunks,
    // behind unless we clear them explicitly).
    await db.delete(docChunks).where(eq(docChunks.pageId, pageId));
    return `removed chunks for missing/deleted page ${pageId}`;
  }

  const doc = (page.body as { doc?: unknown } | null)?.doc;
  const chunks = chunkDoc(doc, page.title || "Untitled");

  if (chunks.length === 0) {
    await db.delete(docChunks).where(eq(docChunks.pageId, pageId));
    return `page ${pageId} has no chunkable text — cleared any stale chunks`;
  }

  const vectors = await embedTexts(chunks.map(chunkEmbeddingText));

  await db.transaction(async (tx) => {
    await tx.delete(docChunks).where(eq(docChunks.pageId, pageId));
    await tx.insert(docChunks).values(
      chunks.map((chunk, i) => ({
        pageId,
        chunkIndex: i,
        heading: chunk.heading,
        content: chunk.content,
        embedding: vectors[i]!,
        model: EMBEDDING_MODEL,
      })),
    );
  });

  return `embedded ${chunks.length} chunk(s) for page ${pageId}`;
}
