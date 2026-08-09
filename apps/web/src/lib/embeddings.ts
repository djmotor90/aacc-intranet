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
import { recordAiUsage, type AiUsagePurpose } from "@/lib/ai-usage";

export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** OpenAI embeddings accept up to 2048 inputs per request; keep well under it. */
const BATCH_SIZE = 100;

/** Who/what to attribute an embeddings call's token usage to, for the admin AI tab. */
export type EmbeddingUsageContext = {
  purpose: AiUsagePurpose;
  actorUserId?: string | null;
  agentId?: string | null;
};

/**
 * Embed a batch of texts in input order. Throws on any API failure.
 * Every request — success or failure — is logged via recordAiUsage when
 * `usageContext` is passed.
 */
export async function embedTexts(
  texts: string[],
  usageContext?: EmbeddingUsageContext,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const startedAt = Date.now();

    const logUsage = (totalTokens: number, ok: boolean, errorMessage?: string) => {
      if (!usageContext) return;
      void recordAiUsage({
        provider: "openai",
        model: EMBEDDING_MODEL,
        purpose: usageContext.purpose,
        actorUserId: usageContext.actorUserId,
        agentId: usageContext.agentId,
        promptTokens: totalTokens,
        totalTokens,
        durationMs: Date.now() - startedAt,
        ok,
        errorMessage,
      });
    };

    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch }),
      });
    } catch (err) {
      logUsage(0, false, err instanceof Error ? err.message : String(err));
      throw err;
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const message = `OpenAI embeddings error ${res.status}: ${errText.slice(0, 400)}`;
      logUsage(0, false, message);
      throw new Error(message);
    }
    const data = (await res.json()) as {
      data?: { index: number; embedding: number[] }[];
      usage?: { total_tokens?: number };
    };
    const rows = data.data ?? [];
    if (rows.length !== batch.length) {
      const message = `OpenAI embeddings returned ${rows.length} vectors for ${batch.length} inputs`;
      logUsage(data.usage?.total_tokens ?? 0, false, message);
      throw new Error(message);
    }
    logUsage(data.usage?.total_tokens ?? 0, true);
    // API guarantees order matches input, but sort by index defensively.
    for (const row of [...rows].sort((a, b) => a.index - b.index)) {
      out.push(row.embedding);
    }
  }
  return out;
}

export async function embedText(
  text: string,
  usageContext?: EmbeddingUsageContext,
): Promise<number[]> {
  const [vec] = await embedTexts([text], usageContext);
  return vec!;
}
