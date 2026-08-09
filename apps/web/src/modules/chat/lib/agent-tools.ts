/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Owner-privileged Super Agent tool definitions + executor, wired to xAI's
 * native function-calling (see lib/xai.ts) instead of a hand-parsed JSON
 * reply convention — the model's tool_calls are schema-validated by the API,
 * so a malformed/unexpected shape can't silently swallow an action.
 */
import type { XaiToolCall, XaiToolDef } from "@/lib/xai";
import { encodeMentionToken } from "./agent-mentions";
import { saveMemoryFromChat, updateLinkedDocContent } from "./agent-write-tools";
import { loadAgentKnowledgeContext } from "./knowledge";

export const UPDATE_DOC_TOOL = "update_linked_doc";
export const SAVE_MEMORY_TOOL = "save_memory";
export const SEARCH_KNOWLEDGE_TOOL = "search_knowledge";

const updateDocTool: XaiToolDef = {
  type: "function",
  function: {
    name: UPDATE_DOC_TOOL,
    description:
      "Append (default) or replace content on a writable linked Knowledge doc. " +
      "Content must be GitHub-flavored Markdown (never HTML or TipTap JSON). " +
      "Prefer append; only replace on explicit overwrite language from the user.",
    parameters: {
      type: "object",
      properties: {
        pageId: {
          type: "string",
          description: "Exact uuid of the target doc, when known from the writable-docs list.",
        },
        pageTitle: {
          type: "string",
          description: "Exact or partial title of the target doc, when pageId is not known.",
        },
        mode: { type: "string", enum: ["append", "replace"] },
        content: { type: "string", description: "Markdown content to write." },
        sectionHeading: {
          type: "string",
          description: "Optional heading label to file an append under.",
        },
      },
      required: ["mode", "content"],
    },
  },
};

const searchKnowledgeTool: XaiToolDef = {
  type: "function",
  function: {
    name: SEARCH_KNOWLEDGE_TOOL,
    description:
      "Actively search linked Knowledge docs for content about a specific topic, term, or rule — " +
      "on your own reformulated query, not just whatever the user happened to type. " +
      "Use this BEFORE calling update_linked_doc to add or change a rule: search for the topic first " +
      "to check whether existing guidance already says something different. This is how you catch a " +
      "new instruction quietly contradicting a rule written somewhere else in the doc.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Topic or phrase to search for, e.g. \"waitlist size\" or \"senior section fees\".",
        },
      },
      required: ["query"],
    },
  },
};

const saveMemoryTool: XaiToolDef = {
  type: "function",
  function: {
    name: SAVE_MEMORY_TOOL,
    description:
      "Save a short, durable note to this agent's memory — a preference, stable fact, or a " +
      "when→do procedure. Never save full chat transcripts or secrets.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["preference", "fact", "intelligence", "procedure"],
        },
        content: { type: "string", description: "Short declarative note." },
      },
      required: ["kind", "content"],
    },
  },
};

/** Build the tool list this turn actually offers, based on the agent's enabled tools. */
export function buildOwnerToolDefs(toolList: string[]): XaiToolDef[] {
  const tools: XaiToolDef[] = [];
  if (toolList.includes("docs.search") || toolList.includes("docs.update")) {
    tools.push(searchKnowledgeTool);
  }
  if (toolList.includes("docs.update")) tools.push(updateDocTool);
  if (toolList.includes("memory.save")) tools.push(saveMemoryTool);
  return tools;
}

export type ToolExecResult = {
  toolCallId: string;
  /** JSON string sent back to the model as the tool's result. */
  resultContent: string;
  /** Human-readable note appended to the reply if the model doesn't mention it. */
  actionNote: string | null;
};

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Execute one tool call against the real write tools and report the outcome. */
export async function executeOwnerToolCall(
  call: XaiToolCall,
  ctx: { agentId: string; userId: string; conversationId: string },
): Promise<ToolExecResult> {
  const args = safeParseArgs(call.function.arguments);

  if (call.function.name === SEARCH_KNOWLEDGE_TOOL) {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) {
      return {
        toolCallId: call.id,
        resultContent: JSON.stringify({ ok: false, error: "Empty query" }),
        actionNote: null,
      };
    }
    const result = await loadAgentKnowledgeContext(ctx.agentId, query, ctx.userId);
    return {
      toolCallId: call.id,
      resultContent: JSON.stringify({
        ok: true,
        result: result || "No matching content found in linked Knowledge docs.",
      }),
      actionNote: null,
    };
  }

  if (call.function.name === UPDATE_DOC_TOOL) {
    const mode = args.mode === "replace" ? "replace" : "append";
    const content = typeof args.content === "string" ? args.content : "";
    const res = await updateLinkedDocContent({
      agentId: ctx.agentId,
      userId: ctx.userId,
      pageId: typeof args.pageId === "string" ? args.pageId : undefined,
      pageTitle: typeof args.pageTitle === "string" ? args.pageTitle : undefined,
      mode,
      content,
      sectionHeading: typeof args.sectionHeading === "string" ? args.sectionHeading : undefined,
    });
    if (res.ok) {
      const chip = encodeMentionToken({ type: "doc", id: res.pageId, label: res.title });
      return {
        toolCallId: call.id,
        resultContent: JSON.stringify({ ok: true, pageId: res.pageId, title: res.title, mode: res.mode }),
        actionNote: res.mode === "replace" ? `Replaced the ${chip} document.` : `Saved an update to ${chip}.`,
      };
    }
    return {
      toolCallId: call.id,
      resultContent: JSON.stringify({ ok: false, error: res.error }),
      actionNote: null,
    };
  }

  if (call.function.name === SAVE_MEMORY_TOOL) {
    const kind =
      args.kind === "fact" || args.kind === "intelligence" || args.kind === "procedure"
        ? args.kind
        : "preference";
    const content = typeof args.content === "string" ? args.content : "";
    const res = await saveMemoryFromChat({
      agentId: ctx.agentId,
      userId: ctx.userId,
      conversationId: ctx.conversationId,
      kind,
      content,
    });
    return {
      toolCallId: call.id,
      resultContent: JSON.stringify(res.ok ? { ok: true } : { ok: false, error: res.error }),
      actionNote: res.ok
        ? kind === "procedure"
          ? "Saved that workflow for next time."
          : "Got it — I'll remember that."
        : null,
    };
  }

  return {
    toolCallId: call.id,
    resultContent: JSON.stringify({ ok: false, error: `Unknown tool: ${call.function.name}` }),
    actionNote: null,
  };
}
