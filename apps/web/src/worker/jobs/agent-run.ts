/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { JSONContent } from "@tiptap/react";
import {
  agents,
  chatConversationMembers,
  chatConversations,
  chatMessages,
  db,
} from "@aitim/db";
import { and, eq, isNull } from "drizzle-orm";
import { hasXaiKey, xaiChatCompletion, type XaiChatMessage } from "@/lib/xai";
import { encodeMentionToken, injectDocMentionTokens } from "@/modules/chat/lib/agent-mentions";
import {
  buildOwnerToolDefs,
  executeOwnerToolCall,
  SEARCH_KNOWLEDGE_TOOL,
  UPDATE_DOC_TOOL,
} from "@/modules/chat/lib/agent-tools";
import { agentReplyBody } from "@/modules/chat/lib/body";
import {
  DEFAULT_CHAT_MODEL,
  mergeMemorySettings,
  parseAgentConfig,
} from "@/modules/chat/lib/agent-config";
import {
  loadAgentKnowledgeContext,
  loadAgentKnowledgeImages,
  type KnowledgeImage,
} from "@/modules/chat/lib/knowledge";
import { loadChatMessageImages, type ChatMessageImage } from "@/modules/chat/lib/chat-images";
import {
  formatConversationSearchHits,
  looksLikeRecallIntent,
  searchAgentConversationHistory,
} from "@/modules/chat/lib/conversation-search";
import {
  loadConversationWindow,
  loadHotMemoryContext,
  maybeExtractIntelligenceMemory,
  updateConversationSummary,
} from "@/modules/chat/lib/memory";
import { publishChatMessage } from "@/modules/chat/lib/notify-chat";
import { listOverdueTasksForUser } from "@/modules/chat/lib/tools-overdue";
import { getAgentAccess } from "@/modules/chat/lib/agent-access";
import {
  listWritableAgentDocs,
  saveMemoryFromChat,
  updateLinkedDocContent,
} from "@/modules/chat/lib/agent-write-tools";
import {
  buildOwnerActionContract,
  buildPlatformOpsGuide,
} from "@/modules/chat/lib/platform-ops-guide";
import type { ChatMessageBody } from "@/modules/chat/lib/types";

export type AgentRunPayload = {
  conversationId: string;
  triggerMessageId: string;
  agentId: string;
  userId: string;
};

function toolsInclude(tools: unknown, name: string): boolean {
  if (!Array.isArray(tools)) return false;
  return tools.some((t) => t === name || t === name.replace("tasks.", ""));
}

function simpleSocialReply(agentName: string, triggerText: string): ChatMessageBody | null {
  const normalized = triggerText.trim().toLowerCase().replace(/[!.?]+$/g, "").trim();
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|how are you)$/.test(normalized)) {
    return agentReplyBody(`Hi! I'm ${agentName}. How can I help?`);
  }
  if (/^(thanks|thank you|thank you very much|got it|okay|ok)$/.test(normalized)) {
    return agentReplyBody("You're welcome! Let me know what you need next.");
  }
  if (
    /^(i am|i'm|im|i’m) (good|great|fine|okay|ok|doing good|doing well|all good)$/.test(
      normalized,
    ) ||
    /^(doing good|doing well|all good|pretty good|not bad|no thanks|nothing|nothing right now|maybe later)$/.test(
      normalized,
    )
  ) {
    return agentReplyBody("Glad to hear it! I'm here whenever you need me.");
  }
  return null;
}

function docContainsImage(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const value = node as { type?: unknown; content?: unknown[]; doc?: unknown };
  if (value.type === "image") return true;
  if (value.doc && docContainsImage(value.doc)) return true;
  return Array.isArray(value.content) && value.content.some(docContainsImage);
}

function asksAboutVisuals(text: string): boolean {
  return /\b(image|images|screenshot|screenshots|picture|pictures|photo|photos|diagram|visual|figure|chart)\b|\bwhat (?:is|are) (?:this|these)\b/i.test(
    text,
  );
}

async function buildStubReply(
  agent: typeof agents.$inferSelect,
  userId: string,
  triggerText: string,
  isOwner: boolean,
): Promise<ChatMessageBody> {
  const lower = triggerText.toLowerCase();

  // Owner: simple doc append when clearly requested
  if (
    isOwner &&
    toolsInclude(agent.tools, "docs.update") &&
    /update|append|add (to )?(the )?doc|write (to|in) (the )?doc|edit (the )?doc/.test(lower)
  ) {
    // Extract content after "with" / "about" as best-effort
    const m =
      triggerText.match(/(?:with|about|:\s*)([\s\S]{8,})$/i) ??
      triggerText.match(/(?:update.*?doc(?:ument)?\s+)([\s\S]+)/i);
    const content = (m?.[1] ?? triggerText).trim();
    const res = await updateLinkedDocContent({
      agentId: agent.id,
      userId,
      mode: "append",
      content,
      pageTitle: "Test",
    });
    if (res.ok) {
      const chip = encodeMentionToken({ type: "doc", id: res.pageId, label: res.title });
      return agentReplyBody(
        `Updated ${chip} with your notes. Open it in Docs anytime to review.`,
      );
    }
    return agentReplyBody(`I couldn't update the doc: ${res.error}`);
  }

  if (
    isOwner &&
    toolsInclude(agent.tools, "memory.save") &&
    /remember|save (this )?to memory|don't forget|note that/.test(lower)
  ) {
    const content = triggerText.replace(/^(please\s+)?(remember|note that|save to memory)\s*/i, "").trim();
    const res = await saveMemoryFromChat({
      agentId: agent.id,
      userId,
      kind: "preference",
      content: content || triggerText,
    });
    return agentReplyBody(
      res.ok
        ? "Saved to my memory — I'll keep that in mind for next time."
        : `Couldn't save memory: ${res.error}`,
    );
  }

  const wantsOverdue =
    toolsInclude(agent.tools, "tasks.list_overdue") ||
    /overdue|deadline|due|what.*open|status|morning|nudge|help|hi|hello|hey/.test(lower) ||
    triggerText.trim().length < 40;

  if (wantsOverdue && toolsInclude(agent.tools, "tasks.list_overdue")) {
    const embed = await listOverdueTasksForUser(userId, 10);
    const n = embed.items.length;
    let text: string;
    if (n === 0) {
      text =
        "Morning! You're clear — no overdue tasks on your plate right now. Keep it that way.";
    } else if (n === 1) {
      text = `Morning — **1 overdue task** is still open. Close it, delegate it, or reschedule it.`;
    } else {
      text = `Morning — **${n} overdue tasks** are still breathing.\n\nTop offenders below. Close, delegate, or reschedule.`;
    }
    return agentReplyBody(text, n > 0 ? [embed] : undefined);
  }

  const text = `Hi — I'm ${agent.displayName}. ${agent.title ?? "How can I help?"}`.trim();
  return agentReplyBody(text);
}

async function buildXaiReply(
  agent: typeof agents.$inferSelect,
  userId: string,
  conversationId: string,
  triggerText: string,
  isOwner: boolean,
  triggerDoc?: JSONContent | null,
): Promise<ChatMessageBody> {
  const chatModel =
    agent.chatModel?.trim() ||
    agent.model?.trim() ||
    process.env.XAI_AGENT_CHAT_MODEL?.trim() ||
    DEFAULT_CHAT_MODEL;

  const contextBlocks: string[] = [];
  if (toolsInclude(agent.tools, "tasks.list_overdue")) {
    const embed = await listOverdueTasksForUser(userId, 10);
    if (embed.items.length) {
      contextBlocks.push(
        "Overdue tasks for this user:\n" +
          embed.items
            .map(
              (i, idx) =>
                `${idx + 1}. [${i.number}] ${i.title} — due ${i.dueDate ?? "?"} — priority ${i.priority ?? "none"} — status ${i.status ?? "?"}`,
            )
            .join("\n"),
      );
    } else {
      contextBlocks.push("Overdue tasks for this user: none.");
    }
  }

  // Images the user pasted/dropped directly into the triggering message —
  // shown to the model regardless of tool config, since the user handed
  // them over explicitly this turn (unlike linked-knowledge screenshots).
  const messageImages: ChatMessageImage[] = await loadChatMessageImages(triggerDoc);

  let knowledgeImages: KnowledgeImage[] = [];
  if (toolsInclude(agent.tools, "docs.search") || toolsInclude(agent.tools, "docs.update")) {
    const knowledge = await loadAgentKnowledgeContext(agent.id, triggerText, userId);
    if (knowledge) {
      contextBlocks.push(`Knowledge base (linked Docs):\n${knowledge}`);
    }
    // Linked Docs may contain many screenshots. Only attach them when the
    // current request is actually visual; otherwise vision can overwhelm a
    // short text question and make the model describe an unrelated image.
    if (asksAboutVisuals(triggerText)) {
      knowledgeImages = await loadAgentKnowledgeImages(agent.id);
    }
    if (knowledgeImages.length) {
      contextBlocks.push(
        `Knowledge base images: ${knowledgeImages.length} screenshot(s)/image(s) from linked docs are attached below as vision input — ` +
          knowledgeImages.map((img) => `"${img.pageTitle}"${img.alt ? ` (${img.alt})` : ""}`).join(", ") +
          ". Look at them directly when relevant instead of guessing from surrounding text.",
      );
    }
  }

  // Linked knowledge docs — used for write tools + re-linking titles as DOC chips in replies
  const linkedDocs = await listWritableAgentDocs(agent.id);
  const writableDocs = isOwner && toolsInclude(agent.tools, "docs.update") ? linkedDocs : [];
  if (writableDocs.length) {
    contextBlocks.push(
      "Writable linked docs (owner/admin may update):\n" +
        writableDocs.map((d) => `- id=${d.id} title="${d.title}"`).join("\n"),
    );
  }

  const memorySettings = mergeMemorySettings(parseAgentConfig(agent.config));
  const memoryCtx = await loadHotMemoryContext(agent.id, userId, memorySettings);
  if (memoryCtx) {
    contextBlocks.push(memoryCtx);
  }

  // Conversation continuity: short raw window + rolling summary (not memory-as-chat)
  const { summary, history } = await loadConversationWindow(conversationId, {
    useSummary: memorySettings.recent,
  });
  if (summary) {
    contextBlocks.push(
      `## Conversation continuity (summary of older turns — not full chat)\n${summary}`,
    );
  }

  const toolList = Array.isArray(agent.tools) ? (agent.tools as string[]) : [];

  // Cold recall: past DMs (Hermes session_search style) — only when tool on + intent
  if (
    toolsInclude(toolList, "conversation.search") &&
    looksLikeRecallIntent(triggerText)
  ) {
    try {
      const hits = await searchAgentConversationHistory({
        agentId: agent.id,
        userId,
        query: triggerText,
        limit: 5,
        excludeConversationId: conversationId,
      });
      const block = formatConversationSearchHits(hits);
      if (block) contextBlocks.push(block);
    } catch (err) {
      console.error("[agent-run] conversation search failed", err);
    }
  }

  const systemParts = [
    agent.systemPrompt || `You are ${agent.displayName}, a Super Agent.`,
    buildPlatformOpsGuide({ canWrite: isOwner, tools: toolList }),
  ];

  if (isOwner) {
    systemParts.push(buildOwnerActionContract());
  } else {
    systemParts.push(
      "You cannot edit documents or change system memory for this user. Answer from knowledge and tools only. If they ask to update a doc, explain that only the agent owner/admin can do that from chat (or they can edit in Docs).",
    );
  }

  if (contextBlocks.length) {
    systemParts.push("## Live context\n" + contextBlocks.join("\n\n"));
  }

  // Prefer prior turns in history except the latest user message (we pass triggerText as user)
  const prior = history.length
    ? history.slice(0, -1).filter((m) => m.content.trim())
    : [];

  const ownerTools = isOwner ? buildOwnerToolDefs(toolList) : [];

  // Attach the message's own images plus linked-doc images as vision input
  // on the current turn — the knowledge text block above only ever
  // described that an image exists, never showed it.
  const turnImages = [...messageImages, ...knowledgeImages];
  const userTurn: XaiChatMessage = turnImages.length
    ? {
        role: "user",
        content: [
          { type: "text", text: triggerText || "Hello" },
          ...turnImages.map(
            (img): { type: "image_url"; image_url: { url: string } } => ({
              type: "image_url",
              image_url: { url: img.dataUri },
            }),
          ),
        ],
      }
    : { role: "user", content: triggerText || "Hello" };

  const messages: XaiChatMessage[] = [
    { role: "system", content: systemParts.join("\n\n") },
    ...prior,
    userTurn,
  ];

  const actionNotes: string[] = [];
  let messageText = "";

  // Native function-calling loop: the model either answers directly, or asks
  // for tools; we execute them, feed the results back, and let it compose
  // the final reply grounded in what actually happened. Capped so a model
  // that insists on chaining calls can't loop forever.
  //
  // The very first update_linked_doc call this turn is intercepted rather
  // than executed: a model told in the prompt to "search for conflicts
  // before writing" mostly does — but "mostly" isn't good enough for a
  // governing/policy doc (temperature > 0 means the exact same prompt can
  // skip the check on a bad sample; verified empirically that it does,
  // sometimes). Withholding the tool entirely until after a search was
  // tried first and made things worse — the model concluded it had no write
  // capability at all instead of understanding "search unlocks it." So
  // instead the tool stays visible and callable; the first attempt just
  // gets redirected into the search results instead of a real write, and
  // the model decides from there whether to proceed or ask the user.
  const MAX_TOOL_ROUNDS = 4;
  let hasSearchedThisTurn = false;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await xaiChatCompletion({
      model: chatModel,
      temperature: 0.4,
      maxTokens: 2000,
      messages,
      tools: ownerTools.length ? ownerTools : undefined,
      usageContext: {
        purpose: "agent-chat-reply",
        actorUserId: userId,
        agentId: agent.id,
        conversationId,
      },
    });

    if (result.toolCalls.length === 0) {
      messageText = result.content;
      break;
    }

    messages.push({ role: "assistant", content: result.content, tool_calls: result.toolCalls });
    for (const call of result.toolCalls) {
      if (call.function.name === SEARCH_KNOWLEDGE_TOOL) hasSearchedThisTurn = true;

      if (call.function.name === UPDATE_DOC_TOOL && !hasSearchedThisTurn) {
        const knowledgeCheck = await loadAgentKnowledgeContext(agent.id, triggerText, userId);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            ok: false,
            deferred: true,
            reason:
              "Not written yet — check this existing guidance for a conflict with what you're about to write first.",
            existingGuidance: knowledgeCheck || "(nothing relevant found in linked docs)",
            instruction:
              "If nothing here conflicts with the requested change, call update_linked_doc again to proceed. " +
              "If something here conflicts (a different number, an opposite rule), do not call it again — " +
              "tell the user what conflicts, quoting the existing text, and ask which version should stand.",
          }),
        });
        hasSearchedThisTurn = true;
        continue;
      }

      const exec = await executeOwnerToolCall(call, { agentId: agent.id, userId, conversationId });
      messages.push({ role: "tool", tool_call_id: exec.toolCallId, content: exec.resultContent });
      if (exec.actionNote) actionNotes.push(exec.actionNote);
    }
  }

  if (!messageText) {
    messageText = actionNotes.length
      ? "Done — see below for what I did."
      : "Sorry, I couldn't put together a reply that time — try rephrasing?";
  }

  if (actionNotes.length) {
    // Ensure the user sees action results even if the model forgot to mention them
    const joined = actionNotes.join(" ");
    const already =
      messageText.toLowerCase().includes("updated") ||
      messageText.toLowerCase().includes("saved") ||
      messageText.toLowerCase().includes("appended") ||
      messageText.toLowerCase().includes("remember");
    if (!already) {
      messageText = `${messageText.trim()}\n\n${joined}`;
    }
  }

  let embeds: ChatMessageBody["embeds"];
  if (toolsInclude(agent.tools, "tasks.list_overdue")) {
    const embed = await listOverdueTasksForUser(userId, 10);
    if (embed.items.length) embeds = [embed];
  }

  // Re-link plain doc titles → @{doc:…} so every reply shows the same DOC chip
  const chipText = injectDocMentionTokens(messageText, linkedDocs);
  return agentReplyBody(chipText, embeds);
}

/**
 * Run a Super Agent turn: load context, produce a reply (stub or xAI), post message.
 */
export async function runAgentJob(payload: AgentRunPayload): Promise<string> {
  const { conversationId, triggerMessageId, agentId, userId } = payload;

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent || !agent.isEnabled) return "agent disabled";

  const [member] = await db
    .select()
    .from(chatConversationMembers)
    .where(
      and(
        eq(chatConversationMembers.conversationId, conversationId),
        eq(chatConversationMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!member) return "not a member";

  const [trigger] = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.id, triggerMessageId),
        eq(chatMessages.conversationId, conversationId),
        eq(chatMessages.authorUserId, userId),
        isNull(chatMessages.authorAgentId),
        isNull(chatMessages.deletedAt),
      ),
    )
    .limit(1);
  if (!trigger) return "invalid trigger message";
  const triggerText =
    trigger && typeof trigger.body === "object" && trigger.body && "text" in trigger.body
      ? String((trigger.body as { text?: string }).text ?? "")
      : "";
  const triggerDoc =
    trigger && typeof trigger.body === "object" && trigger.body && "doc" in trigger.body
      ? ((trigger.body as { doc?: JSONContent }).doc ?? null)
      : null;

  const access = await getAgentAccess(agent, userId);
  const canWrite = access.canEdit; // owner + agent admin + platform super admin

  // Ensure tools available: cold conversation search for everyone; write tools for editors
  const toolList = Array.isArray(agent.tools) ? [...(agent.tools as string[])] : [];
  if (!toolList.includes("conversation.search")) toolList.push("conversation.search");
  if (!toolList.includes("docs.search")) toolList.push("docs.search");
  if (canWrite) {
    if (!toolList.includes("docs.update")) toolList.push("docs.update");
    if (!toolList.includes("memory.save")) toolList.push("memory.save");
  }
  const agentWithTools = { ...agent, tools: toolList };

  const defaultRuntime = process.env.CHAT_AGENT_DEFAULT_RUNTIME ?? "stub";
  const runtime = agent.runtime || defaultRuntime;
  const canXai = runtime === "xai" && hasXaiKey();

  let body: ChatMessageBody;
  const socialReply = docContainsImage(triggerDoc)
    ? null
    : simpleSocialReply(agent.displayName, triggerText);
  if (socialReply) {
    body = socialReply;
  } else {
    try {
      if (canXai) {
        body = await buildXaiReply(
          agentWithTools,
          userId,
          conversationId,
          triggerText,
          canWrite,
          triggerDoc,
        );
      } else {
        body = await buildStubReply(agentWithTools, userId, triggerText, canWrite);
      }
    } catch (err) {
      console.error("[agent-run] LLM failed, falling back to stub", err);
      body = await buildStubReply(agentWithTools, userId, triggerText, canWrite);
      body = agentReplyBody(
        `${body.text}\n\n_Note: live model unavailable — used offline reply._`,
        body.embeds,
      );
    }
  }

  const [row] = await db
    .insert(chatMessages)
    .values({
      conversationId,
      authorUserId: null,
      authorAgentId: agent.id,
      body,
    })
    .returning();

  await db
    .update(chatConversations)
    .set({ lastMessageAt: row.createdAt, updatedAt: new Date() })
    .where(eq(chatConversations.id, conversationId));

  await publishChatMessage({ conversationId, messageId: row.id });

  const replyText = typeof body.text === "string" ? body.text : "";
  const memSettings = mergeMemorySettings(parseAgentConfig(agent.config));
  void updateConversationSummary({
    conversationId,
    userText: triggerText,
    agentText: replyText,
    enabled: memSettings.recent,
  }).catch((err) => console.error("[agent-run] conversation summary failed", err));
  void maybeExtractIntelligenceMemory({
    agentId: agent.id,
    userId,
    conversationId,
    userText: triggerText,
    agentText: replyText,
  }).catch((err) => console.error("[agent-run] intelligence memory failed", err));

  return `agent ${agent.slug} replied ${row.id} via ${canXai ? "xai" : "stub"} write=${canWrite}`;
}
