/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Cold recall over past Super Agent DMs (Hermes session_search analogue).
 * Results are injected only when useful — not full chat dumps.
 */
import {
  chatConversationMembers,
  chatConversations,
  chatMessages,
  db,
} from "@aitim/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

export type ConversationSearchHit = {
  messageId: string;
  conversationId: string;
  createdAt: Date;
  role: "user" | "assistant";
  snippet: string;
};

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "is",
  "it",
  "we",
  "you",
  "i",
  "me",
  "my",
  "our",
  "your",
  "what",
  "when",
  "where",
  "who",
  "how",
  "did",
  "do",
  "does",
  "was",
  "were",
  "be",
  "been",
  "about",
  "with",
  "from",
  "this",
  "that",
  "these",
  "those",
  "please",
  "can",
  "could",
  "would",
  "should",
  "remember",
  "recall",
  "last",
  "week",
  "time",
  "again",
]);

/** Extract search terms from a free-text query. */
export function extractSearchTerms(query: string, maxTerms = 6): string[] {
  const raw = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t));
  const uniq: string[] = [];
  for (const t of raw) {
    if (!uniq.includes(t)) uniq.push(t);
    if (uniq.length >= maxTerms) break;
  }
  return uniq;
}

/**
 * Whether the user message looks like it wants past-conversation recall.
 * Used to avoid running search on every "hi".
 */
export function looksLikeRecallIntent(text: string): boolean {
  const t = text.toLowerCase();
  if (t.length < 12) return false;
  return (
    /\b(remember|recall|last time|previously|earlier|we (said|decided|discussed|talked)|what did (we|i|you)|you (told|said)|from (our|the) (chat|conversation|last))\b/i.test(
      t,
    ) ||
    // Explicit search-ish phrasing
    /\b(find|look up|search).{0,40}\b(chat|conversation|message|said|talked)\b/i.test(t)
  );
}

function bodyText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const o = body as { text?: string };
  return typeof o.text === "string" ? o.text : "";
}

/**
 * Full-text-ish search over this user's DMs with a given Super Agent.
 * Uses ILIKE on stored message text (json body->>'text').
 */
export async function searchAgentConversationHistory(input: {
  agentId: string;
  userId: string;
  query: string;
  limit?: number;
  /** Exclude current conversation so we don't echo the live window */
  excludeConversationId?: string | null;
}): Promise<ConversationSearchHit[]> {
  const limit = Math.min(input.limit ?? 5, 12);
  const terms = extractSearchTerms(input.query);
  if (terms.length === 0) return [];

  // Prefer the longest term first for a focused pattern; also try multi-term AND via successive filters in app if needed
  const primary = terms[0]!;
  const pattern = `%${primary.replace(/[%_]/g, "")}%`;
  if (pattern.length < 5) return []; // %ab% too broad

  const conditions = [
    eq(chatConversations.agentId, input.agentId),
    eq(chatConversations.kind, "agent_dm"),
    eq(chatConversationMembers.userId, input.userId),
    isNull(chatMessages.deletedAt),
    sql`coalesce(${chatMessages.body}->>'text','') ilike ${pattern}`,
  ];
  if (input.excludeConversationId) {
    conditions.push(sql`${chatMessages.conversationId} <> ${input.excludeConversationId}`);
  }

  const rows = await db
    .select({
      messageId: chatMessages.id,
      conversationId: chatMessages.conversationId,
      createdAt: chatMessages.createdAt,
      authorUserId: chatMessages.authorUserId,
      authorAgentId: chatMessages.authorAgentId,
      body: chatMessages.body,
    })
    .from(chatMessages)
    .innerJoin(
      chatConversations,
      eq(chatConversations.id, chatMessages.conversationId),
    )
    .innerJoin(
      chatConversationMembers,
      and(
        eq(chatConversationMembers.conversationId, chatConversations.id),
        eq(chatConversationMembers.userId, input.userId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(chatMessages.createdAt))
    .limit(40);

  // Rank: more matching terms first, then recency
  const scored = rows
    .map((r) => {
      const text = bodyText(r.body).replace(/\s+/g, " ").trim();
      const lower = text.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (lower.includes(t)) score += t.length >= 5 ? 2 : 1;
      }
      return { r, text, score };
    })
    .filter((x) => x.score > 0 && x.text.length > 0)
    .sort((a, b) => b.score - a.score || b.r.createdAt.getTime() - a.r.createdAt.getTime())
    .slice(0, limit);

  return scored.map(({ r, text }) => ({
    messageId: r.messageId,
    conversationId: r.conversationId,
    createdAt: r.createdAt,
    role: r.authorAgentId ? ("assistant" as const) : ("user" as const),
    snippet: text.length > 280 ? `${text.slice(0, 277)}…` : text,
  }));
}

/** Format hits for system prompt injection (bounded). */
export function formatConversationSearchHits(
  hits: ConversationSearchHit[],
  maxChars = 1_800,
): string {
  if (!hits.length) return "";
  const lines = hits.map((h, i) => {
    const when = h.createdAt.toISOString().slice(0, 16).replace("T", " ");
    return `${i + 1}. [${when}] ${h.role}: ${h.snippet}`;
  });
  let out = lines.join("\n");
  if (out.length > maxChars) out = `${out.slice(0, maxChars)}\n…`;
  return (
    `## Past conversation search (cold recall — snippets only, not full history)\n` +
    `Use only if relevant. Prefer current live context when they conflict.\n` +
    out
  );
}
