/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * SpaceXAI / xAI OpenAI-compatible client (https://api.x.ai/v1).
 */
import { DEFAULT_BUILD_MODEL, DEFAULT_CHAT_MODEL } from "@/modules/chat/lib/agent-config";
import {
  extractMentionTokens,
  rehydrateMentionsInText,
} from "@/modules/chat/lib/agent-mentions";

export function hasXaiKey(): boolean {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

/** OpenAI-compatible function-tool definition (xAI's tool-calling schema). */
export type XaiToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    /** JSON Schema for the arguments object. */
    parameters: Record<string, unknown>;
  };
};

export type XaiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

/** OpenAI-compatible multimodal content part (vision input). */
export type XaiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export type XaiChatMessage =
  | { role: "system" | "user"; content: string | XaiContentPart[] }
  | { role: "assistant"; content: string; tool_calls?: XaiToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type XaiChatResult = {
  /** May be "" when the model only returned tool_calls. */
  content: string;
  toolCalls: XaiToolCall[];
};

/**
 * Chat completions against xAI, with optional tool-calling. Returns the raw
 * assistant message content plus any requested tool_calls — callers decide
 * whether/how to execute tools and continue the conversation.
 */
export async function xaiChatCompletion(input: {
  model?: string;
  messages: XaiChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: XaiToolDef[];
  toolChoice?: "auto" | "none";
}): Promise<XaiChatResult> {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) throw new Error("XAI_API_KEY is not set");

  const model = input.model?.trim() || DEFAULT_CHAT_MODEL;
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: input.messages,
      temperature: input.temperature ?? 0.4,
      max_tokens: input.maxTokens ?? 2048,
      ...(input.tools?.length
        ? { tools: input.tools, tool_choice: input.toolChoice ?? "auto" }
        : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`xAI error ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: {
      message?: { content?: string | null; tool_calls?: XaiToolCall[] };
    }[];
  };
  const message = data.choices?.[0]?.message;
  return {
    content: message?.content?.trim() ?? "",
    toolCalls: message?.tool_calls ?? [],
  };
}

/**
 * Chat completions against xAI. Returns plain text content or throws.
 * Convenience wrapper over {@link xaiChatCompletion} for the common
 * no-tools case.
 */
export async function xaiChat(input: {
  model?: string;
  messages: XaiChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const result = await xaiChatCompletion(input);
  if (!result.content) throw new Error("xAI returned empty content");
  return result.content;
}

/** Expand a natural-language brief into structured Super Agent instructions. */
export async function expandAgentBrief(brief: string, agentName?: string): Promise<{
  displayName: string;
  title: string;
  description: string;
  systemPrompt: string;
  suggestedTools: string[];
  avatarEmoji: string;
}> {
  const model =
    process.env.XAI_AGENT_BUILD_MODEL?.trim() || DEFAULT_BUILD_MODEL;

  const sourceTokens = extractMentionTokens(brief);
  const tokenList =
    sourceTokens.length > 0
      ? sourceTokens.map((t) => t.token).join("\n")
      : "(none)";

  const raw = await xaiChat({
    model,
    temperature: 0.5,
    maxTokens: 2500,
    messages: [
      {
        role: "system",
        content: `You design Super Agents for a workplace intranet (tasks + docs), similar to ClickUp Super Agents.
Return ONLY valid JSON (no markdown fences) with keys:
{
  "displayName": string (short human name like "Deadline Dale" or "Doc Daisy"),
  "title": string (one-line role),
  "description": string (1 sentence),
  "avatarEmoji": single emoji,
  "systemPrompt": string (full instructions — use markdown sections with emoji headers like "## 🎯 Role and Objective", "## Objectives", "## Every run", "## Tone", "## Constraints"),
  "suggestedTools": string[] from ["tasks.list_overdue","tasks.search","docs.search"]
}
CRITICAL: When the brief contains entity tokens like @{doc:uuid|Label}, copy those tokens EXACTLY (character-for-character) into systemPrompt and description wherever you refer to that entity. Never rewrite them as @doc:Label or plain names only.`,
      },
      {
        role: "user",
        content: [
          agentName ? `Agent working name: ${agentName}` : null,
          `What it should do:\n${brief}`,
          `Entity tokens you MUST preserve exactly when referenced:\n${tokenList}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  // Strip accidental fences
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as {
    displayName?: string;
    title?: string;
    description?: string;
    systemPrompt?: string;
    suggestedTools?: string[];
    avatarEmoji?: string;
  };

  const systemPrompt = rehydrateMentionsInText(
    (parsed.systemPrompt ?? brief).trim(),
    sourceTokens,
  );
  const description = rehydrateMentionsInText(
    (parsed.description ?? "").trim(),
    sourceTokens,
  );

  return {
    displayName: (parsed.displayName ?? agentName ?? "New Agent").trim(),
    title: (parsed.title ?? "Super Agent").trim(),
    description,
    systemPrompt,
    suggestedTools: Array.isArray(parsed.suggestedTools)
      ? parsed.suggestedTools.filter((t) => typeof t === "string")
      : ["tasks.list_overdue", "docs.search"],
    avatarEmoji: (parsed.avatarEmoji ?? "🤖").trim().slice(0, 8) || "🤖",
  };
}

export { DEFAULT_BUILD_MODEL, DEFAULT_CHAT_MODEL };
