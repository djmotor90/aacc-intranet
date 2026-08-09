/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Usage ledger for every outbound AI API call (chat completion or
 * embeddings) — who triggered it, which agent/conversation it was for, what
 * it cost in tokens, and how long it took. Called from every provider call
 * site in lib/xai.ts and lib/embeddings.ts, on both success and failure, so
 * the admin AI tab reflects real usage rather than a sample.
 */
import { aiUsageEvents, db } from "@aitim/db";

export type AiUsageProvider = "xai" | "openai";

export type AiUsagePurpose =
  | "agent-chat-reply"
  | "agent-brief-expand"
  | "doc-embedding"
  | "knowledge-query";

export type RecordAiUsageInput = {
  provider: AiUsageProvider;
  model: string;
  purpose: AiUsagePurpose;
  actorUserId?: string | null;
  agentId?: string | null;
  conversationId?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs: number;
  ok: boolean;
  errorMessage?: string | null;
};

/**
 * Fire-and-forget usage recording — never throws. A logging failure must
 * never turn a successful AI call into a visible failure for the caller.
 */
export async function recordAiUsage(input: RecordAiUsageInput): Promise<void> {
  try {
    await db.insert(aiUsageEvents).values({
      provider: input.provider,
      model: input.model,
      purpose: input.purpose,
      actorUserId: input.actorUserId ?? null,
      agentId: input.agentId ?? null,
      conversationId: input.conversationId ?? null,
      promptTokens: input.promptTokens ?? 0,
      completionTokens: input.completionTokens ?? 0,
      totalTokens: input.totalTokens ?? 0,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      ok: input.ok,
      errorMessage: input.errorMessage?.slice(0, 2000) ?? null,
    });
  } catch (err) {
    console.error("[ai-usage] failed to record usage event", err);
  }
}
