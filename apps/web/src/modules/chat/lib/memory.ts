/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Hermes / OpenClaw–aligned Super Agent memory:
 * - Hot USER / AGENT / PROCEDURE blocks (capped, declarative — not chat)
 * - Conversation = short raw window + rolling summary on the conversation row
 * - Legacy kind "recent" is no longer written or injected
 *
 * See docs/super-agent-memory.md
 */
import { agentMemories, agents, chatConversations, chatMessages, db } from "@aitim/db";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { hasXaiKey, xaiChat } from "@/lib/xai";
import {
  mergeMemorySettings,
  parseAgentConfig,
  type AgentMemorySettings,
} from "./agent-config";

/** Hermes-like hot caps (characters of rendered block body). */
export const MEMORY_CAPS = {
  user: 1_375,
  agent: 2_200,
  procedure: 1_500,
  summary: 1_200,
  /** Raw chat turns sent to the model (not memory). */
  historyMessages: 6,
  /** Max length of a single memory entry. */
  entry: 600,
} as const;

export type HotMemoryKind = "preference" | "fact" | "intelligence" | "procedure";

export type MemoryRow = {
  id: string;
  kind: string;
  content: string;
  userId: string | null;
  importance: string;
  updatedAt: Date;
};

function importanceNum(v: string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 50;
}

function takeByCharBudget(
  lines: { text: string; importance: number }[],
  budget: number,
): string[] {
  // Prefer higher importance; stable order among equals by original index
  const ranked = lines
    .map((l, i) => ({ ...l, i }))
    .sort((a, b) => b.importance - a.importance || a.i - b.i);
  const out: { text: string; i: number }[] = [];
  let used = 0;
  for (const row of ranked) {
    const cost = row.text.length + (out.length ? 1 : 0);
    if (used + cost > budget) continue;
    out.push({ text: row.text, i: row.i });
    used += cost;
  }
  return out.sort((a, b) => a.i - b.i).map((o) => o.text);
}

/**
 * Load hot memory for the system prompt (preferences / facts / procedures).
 * Never includes legacy chat-clone "recent" rows.
 */
export async function loadHotMemoryContext(
  agentId: string,
  userId: string,
  settings: AgentMemorySettings,
): Promise<string> {
  const wantUser = settings.preferences;
  const wantAgent = settings.intelligence;
  const wantProc = settings.procedures;

  if (!wantUser && !wantAgent && !wantProc) return "";

  const rows = await db
    .select({
      id: agentMemories.id,
      kind: agentMemories.kind,
      content: agentMemories.content,
      userId: agentMemories.userId,
      importance: agentMemories.importance,
      updatedAt: agentMemories.updatedAt,
    })
    .from(agentMemories)
    .where(
      and(
        eq(agentMemories.agentId, agentId),
        or(isNull(agentMemories.userId), eq(agentMemories.userId, userId)),
        sql`${agentMemories.kind} <> 'recent'`,
      ),
    )
    .orderBy(desc(agentMemories.updatedAt))
    .limit(80);

  const sections: string[] = [];

  if (wantUser) {
    const prefs = rows.filter((r) => r.kind === "preference" && r.userId === userId);
    const lines = takeByCharBudget(
      prefs.map((r) => ({
        text: r.content.trim(),
        importance: importanceNum(r.importance),
      })),
      MEMORY_CAPS.user,
    );
    if (lines.length) {
      sections.push(
        `### USER (preferences for this person) [${lines.join("\n").length}/${MEMORY_CAPS.user} chars]\n` +
          lines.map((l) => `§ ${l}`).join("\n"),
      );
    }
  }

  if (wantAgent) {
    const facts = rows.filter(
      (r) => (r.kind === "fact" || r.kind === "intelligence") && !r.userId,
    );
    const lines = takeByCharBudget(
      facts.map((r) => ({
        text: r.content.trim(),
        importance: importanceNum(r.importance),
      })),
      MEMORY_CAPS.agent,
    );
    if (lines.length) {
      sections.push(
        `### AGENT (facts & lessons) [${lines.join("\n").length}/${MEMORY_CAPS.agent} chars]\n` +
          lines.map((l) => `§ ${l}`).join("\n"),
      );
    }
  }

  if (wantProc) {
    const procs = rows.filter((r) => r.kind === "procedure");
    const lines = takeByCharBudget(
      procs.map((r) => ({
        text: r.content.trim(),
        importance: importanceNum(r.importance),
      })),
      MEMORY_CAPS.procedure,
    );
    if (lines.length) {
      sections.push(
        `### PROCEDURES (flows / when→do) [${lines.join("\n").length}/${MEMORY_CAPS.procedure} chars]\n` +
          lines.map((l) => `§ ${l}`).join("\n"),
      );
    }
  }

  if (!sections.length) return "";
  return (
    `## Hot memory (curated — not chat history; respect these; do not invent)\n` +
    sections.join("\n\n")
  );
}

/** @deprecated name — use loadHotMemoryContext */
export async function loadAgentMemoryContext(
  agentId: string,
  userId: string,
  settings: AgentMemorySettings,
): Promise<string> {
  return loadHotMemoryContext(agentId, userId, settings);
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * Conversation continuity: rolling summary + last N raw messages.
 * Does not use agent_memories for chat clones.
 */
export async function loadConversationWindow(
  conversationId: string,
  opts?: { historyLimit?: number; useSummary?: boolean },
): Promise<{
  summary: string | null;
  history: ChatTurn[];
  totalMessages: number;
}> {
  const limit = opts?.historyLimit ?? MEMORY_CAPS.historyMessages;
  const useSummary = opts?.useSummary !== false;

  const [conv] = await db
    .select({
      contextSummary: chatConversations.contextSummary,
    })
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);

  const recent = await db
    .select({
      body: chatMessages.body,
      authorUserId: chatMessages.authorUserId,
      authorAgentId: chatMessages.authorAgentId,
    })
    .from(chatMessages)
    .where(
      and(eq(chatMessages.conversationId, conversationId), isNull(chatMessages.deletedAt)),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  const history = recent
    .reverse()
    .map((m) => {
      const text =
        m.body && typeof m.body === "object" && "text" in m.body
          ? String((m.body as { text?: string }).text ?? "")
          : "";
      const role = m.authorAgentId ? ("assistant" as const) : ("user" as const);
      return { role, content: text };
    })
    .filter((m) => m.content.trim());

  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
    .from(chatMessages)
    .where(
      and(eq(chatMessages.conversationId, conversationId), isNull(chatMessages.deletedAt)),
    );

  const summary =
    useSummary && conv?.contextSummary?.trim() ? conv.contextSummary.trim() : null;

  return { summary, history, totalMessages: n };
}

/**
 * After a turn: fold older content into context_summary so we never re-send full history.
 * Uses a cheap roll-up (no LLM required). Optional LLM polish when xAI is available and due.
 */
export async function updateConversationSummary(input: {
  conversationId: string;
  userText: string;
  agentText: string;
  enabled: boolean;
}): Promise<void> {
  if (!input.enabled) return;

  const [conv] = await db
    .select({
      contextSummary: chatConversations.contextSummary,
    })
    .from(chatConversations)
    .where(eq(chatConversations.id, input.conversationId))
    .limit(1);
  if (!conv) return;

  const window = MEMORY_CAPS.historyMessages;
  // Count messages including the ones just written
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.conversationId, input.conversationId),
        isNull(chatMessages.deletedAt),
      ),
    );

  // Only maintain summary once history would overflow the raw window
  if (n <= window) return;

  const u = input.userText.replace(/\s+/g, " ").trim().slice(0, 160);
  const a = input.agentText.replace(/\s+/g, " ").trim().slice(0, 160);
  const beat = `• User: ${u} → Agent: ${a}`;
  let next = [conv.contextSummary?.trim(), beat].filter(Boolean).join("\n");

  // Hard cap: keep the most recent summary tail
  if (next.length > MEMORY_CAPS.summary) {
    next = next.slice(next.length - MEMORY_CAPS.summary);
    const cut = next.indexOf("\n");
    if (cut > 0 && cut < 80) next = next.slice(cut + 1);
  }

  // Optional: every ~8 messages past window, compress with a cheap model
  const overdue = n - window;
  if (hasXaiKey() && overdue > 0 && overdue % 8 === 0 && next.length > 400) {
    try {
      const polished = await xaiChat({
        model: process.env.XAI_AGENT_CHAT_MODEL?.trim() || "grok-4.3",
        temperature: 0.2,
        maxTokens: 220,
        messages: [
          {
            role: "system",
            content:
              "Compress this conversation continuity note into ≤900 characters. Keep decisions, open threads, names, and preferences. No greetings. Plain text bullets.",
          },
          { role: "user", content: next.slice(0, 2000) },
        ],
      });
      if (polished.trim()) next = polished.trim().slice(0, MEMORY_CAPS.summary);
    } catch {
      // keep heuristic summary
    }
  }

  await db
    .update(chatConversations)
    .set({
      contextSummary: next,
      contextSummaryAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(chatConversations.id, input.conversationId));
}

/**
 * @deprecated Chat clones are retired. No-op kept so old workers don't crash if stale.
 */
export async function recordRecentMemory(_input: {
  agentId: string;
  userId: string;
  conversationId: string;
  userText: string;
  agentText: string;
}): Promise<void> {
  // Intentionally empty — conversation continuity uses context_summary + short window.
}

/**
 * Persist a hot-memory entry with kind-specific scoping and soft budget enforcement.
 */
export async function saveHotMemory(input: {
  agentId: string;
  userId: string;
  conversationId?: string | null;
  kind: HotMemoryKind;
  content: string;
  importance?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const content = input.content?.trim().slice(0, MEMORY_CAPS.entry);
  if (!content) return { ok: false, error: "Empty memory" };

  // Prefer declarative, short entries
  if (/^User:\s/i.test(content) && /Agent:\s/i.test(content)) {
    return {
      ok: false,
      error: "Refused: do not store chat transcripts as memory. Save a preference, fact, or procedure.",
    };
  }

  // preferences are per-user; facts/intelligence/procedure are shared
  const scopeUserId = input.kind === "preference" ? input.userId : null;

  await db.insert(agentMemories).values({
    agentId: input.agentId,
    userId: scopeUserId,
    kind: input.kind,
    content,
    sourceConversationId: input.conversationId ?? null,
    importance:
      input.importance ??
      (input.kind === "preference" ? "90" : input.kind === "procedure" ? "85" : "70"),
  });

  // Soft prune: keep top entries by importance within a generous row count per kind
  await pruneHotMemoryKind(input.agentId, input.kind, scopeUserId);

  return { ok: true };
}

async function pruneHotMemoryKind(
  agentId: string,
  kind: HotMemoryKind,
  userId: string | null,
): Promise<void> {
  const maxRows = kind === "preference" ? 20 : kind === "procedure" ? 15 : 30;
  const cond =
    userId === null
      ? and(
          eq(agentMemories.agentId, agentId),
          eq(agentMemories.kind, kind),
          isNull(agentMemories.userId),
        )
      : and(
          eq(agentMemories.agentId, agentId),
          eq(agentMemories.kind, kind),
          eq(agentMemories.userId, userId),
        );

  const rows = await db
    .select({ id: agentMemories.id, importance: agentMemories.importance })
    .from(agentMemories)
    .where(cond)
    .orderBy(desc(agentMemories.updatedAt));

  if (rows.length <= maxRows) return;
  // Drop oldest among lowest importance
  const sorted = [...rows].sort(
    (a, b) => importanceNum(a.importance) - importanceNum(b.importance),
  );
  const drop = sorted.slice(0, rows.length - maxRows);
  for (const d of drop) {
    await db.delete(agentMemories).where(eq(agentMemories.id, d.id));
  }
}

/**
 * Optionally extract a durable preference / fact / procedure from the exchange.
 */
export async function maybeExtractIntelligenceMemory(input: {
  agentId: string;
  userId: string;
  conversationId: string;
  userText: string;
  agentText: string;
}): Promise<void> {
  const [agent] = await db.select().from(agents).where(eq(agents.id, input.agentId)).limit(1);
  if (!agent) return;
  const settings = mergeMemorySettings(parseAgentConfig(agent.config));
  if (!settings.intelligence || !hasXaiKey()) return;
  if (input.userText.trim().length < 24) return;

  try {
    const raw = await xaiChat({
      model: process.env.XAI_AGENT_CHAT_MODEL?.trim() || "grok-4.3",
      temperature: 0.2,
      maxTokens: 220,
      messages: [
        {
          role: "system",
          content: `Extract at most ONE durable Super Agent memory. Memory is NOT chat history.
Return ONLY JSON:
{"save":boolean,"kind":"preference"|"fact"|"intelligence"|"procedure","content":string}

kind meanings:
- preference: how this person wants you to communicate or work (per-user)
- fact: stable environment/project fact (shared)
- intelligence: lesson learned / correction (shared)
- procedure: a reusable when→do flow or command (shared), e.g. "When user asks for morning brief: list overdue, summarize top 3, offer doc append"

Save only if durable and useful across sessions.
Do NOT save greetings, one-off questions, secrets, or paraphrases of the whole conversation.`,
        },
        {
          role: "user",
          content: `User said:\n${input.userText.slice(0, 800)}\n\nAgent replied:\n${input.agentText.slice(0, 800)}`,
        },
      ],
    });
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as {
      save?: boolean;
      kind?: HotMemoryKind;
      content?: string;
    };
    if (!parsed.save || !parsed.content?.trim()) return;
    const kind: HotMemoryKind =
      parsed.kind === "preference" ||
      parsed.kind === "fact" ||
      parsed.kind === "intelligence" ||
      parsed.kind === "procedure"
        ? parsed.kind
        : "intelligence";
    // Respect procedures toggle
    if (kind === "procedure" && !settings.procedures) return;
    if (kind === "preference" && !settings.preferences) return;

    await saveHotMemory({
      agentId: input.agentId,
      userId: input.userId,
      conversationId: input.conversationId,
      kind,
      content: parsed.content.trim(),
    });
  } catch {
    // non-fatal
  }
}

/** One-time style cleanup: delete legacy chat-clone recent rows for an agent (optional bulk). */
export async function purgeLegacyRecentMemories(agentId?: string): Promise<number> {
  if (agentId) {
    const res = await db
      .delete(agentMemories)
      .where(and(eq(agentMemories.agentId, agentId), eq(agentMemories.kind, "recent")))
      .returning({ id: agentMemories.id });
    return res.length;
  }
  const res = await db
    .delete(agentMemories)
    .where(eq(agentMemories.kind, "recent"))
    .returning({ id: agentMemories.id });
  return res.length;
}
