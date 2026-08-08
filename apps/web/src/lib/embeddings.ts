/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * OpenAI embeddings client — used only for pgvector doc-knowledge indexing
 * and retrieval (chunking/search). xAI/Grok has no embeddings model; chat
 * replies still go through xAI exclusively (see lib/xai.ts).
 */
export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** OpenAI embeddings accept up to 2048 inputs per request; keep well under it. */
const BATCH_SIZE = 100;

/** Embed a batch of texts in input order. Throws on any API failure. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenAI embeddings error ${res.status}: ${errText.slice(0, 400)}`);
    }
    const data = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
    const rows = data.data ?? [];
    if (rows.length !== batch.length) {
      throw new Error(`OpenAI embeddings returned ${rows.length} vectors for ${batch.length} inputs`);
    }
    // API guarantees order matches input, but sort by index defensively.
    for (const row of [...rows].sort((a, b) => a.index - b.index)) {
      out.push(row.embedding);
    }
  }
  return out;
}

export async function embedText(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  return vec!;
}
