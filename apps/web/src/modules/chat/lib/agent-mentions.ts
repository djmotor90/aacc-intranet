/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Structured mention tokens for Super Agent instructions (ClickUp-style @ refs).
 *
 * Prefix when typing (before the query):
 *   @      → user (default) / all types when empty query
 *   @@     → task
 *   @@@    → space (workspace)
 *   @@@@   → doc page
 *   @@@@@  → doc folder
 *
 * Stored form (stable for LLM + reload):
 *   @{user:uuid|Kim Gurinov}
 *   @{task:uuid|CEWD-12 Title}
 *   @{space:uuid|Safety}
 *   @{doc:uuid|SOP Handbook}
 *   @{folder:uuid|Policies}
 */

export type AgentMentionType = "user" | "task" | "space" | "doc" | "folder";

export type AgentMentionItem = {
  type: AgentMentionType;
  id: string;
  label: string;
  /** Secondary line in the picker */
  subtitle?: string;
};

/** Stored token pattern */
export const MENTION_TOKEN_RE =
  /@\{(user|task|space|doc|folder):([0-9a-f-]{36})\|([^}]+)\}/gi;

export function encodeMentionToken(item: AgentMentionItem): string {
  const label = item.label.replace(/[{}]/g, "").trim() || item.id;
  return `@{${item.type}:${item.id}|${label}}`;
}

export function mentionTypeFromAtCount(atCount: number): AgentMentionType | "all" {
  if (atCount <= 1) return "all"; // @ alone — show all (default rank users first)
  if (atCount === 2) return "task";
  if (atCount === 3) return "space";
  if (atCount === 4) return "doc";
  return "folder";
}

export function mentionTypeLabel(type: AgentMentionType | "all"): string {
  switch (type) {
    case "user":
      return "People";
    case "task":
      return "Tasks";
    case "space":
      return "Workspaces";
    case "doc":
      return "Docs";
    case "folder":
      return "Folders";
    default:
      return "All";
  }
}

/**
 * Detect an open @-mention query just before `cursor` in `text`.
 * Returns range to replace and parsed type/query.
 */
export function detectMentionQuery(
  text: string,
  cursor: number,
): {
  start: number;
  end: number;
  atCount: number;
  type: AgentMentionType | "all";
  query: string;
} | null {
  const before = text.slice(0, cursor);
  // Match trailing: one or more @, optional type keyword, optional query (no spaces mid-query for simplicity except after type keyword)
  // Examples: "@ki", "@@saf", "@@@ ", "@user kim", "@@@@pol"
  const m = before.match(/(^|[\s(\[{])(@{1,5})(?:(user|task|space|doc|folder)[\s:]*)?([^\s@{}]*)$/i);
  if (!m || m.index === undefined) return null;
  const lead = m[1] ?? "";
  const ats = m[2] ?? "@";
  const typeWord = (m[3] ?? "").toLowerCase() as AgentMentionType | "";
  const query = m[4] ?? "";
  const start = m.index + lead.length;
  const atCount = ats.length;
  let type: AgentMentionType | "all" = mentionTypeFromAtCount(atCount);
  if (typeWord && ["user", "task", "space", "doc", "folder"].includes(typeWord)) {
    type = typeWord;
  }
  // Single @ with empty query → all types; single @ with query → filter all
  if (atCount === 1 && !typeWord) type = "all";
  return { start, end: cursor, atCount, type, query };
}

export function insertMentionToken(
  text: string,
  start: number,
  end: number,
  item: AgentMentionItem,
): { next: string; cursor: number } {
  const token = encodeMentionToken(item);
  const next = `${text.slice(0, start)}${token} ${text.slice(end)}`;
  const cursor = start + token.length + 1;
  return { next, cursor };
}

/** Human-readable line for LLM without raw UUIDs when preferred. */
export function mentionsToPlainContext(text: string): string {
  return text.replace(MENTION_TOKEN_RE, (_full, type: string, _id: string, label: string) => {
    return `@${type}:${label}`;
  });
}

/** Short display label for a chip (ClickUp-style). */
export function mentionChipLabel(type: AgentMentionType, label: string): string {
  switch (type) {
    case "task":
      return label;
    case "user":
      return `@${label}`;
    case "space":
      return label;
    case "doc":
      return label;
    case "folder":
      return label;
    default:
      return label;
  }
}

export function mentionChipPrefix(type: AgentMentionType): string {
  switch (type) {
    case "user":
      return "Person";
    case "task":
      return "Task";
    case "space":
      return "Space";
    case "doc":
      return "Doc";
    case "folder":
      return "Folder";
    default:
      return "";
  }
}

/** All structured mention tokens found in text. */
export function extractMentionTokens(text: string): Array<{
  type: AgentMentionType;
  id: string;
  label: string;
  token: string;
}> {
  const out: Array<{ type: AgentMentionType; id: string; label: string; token: string }> = [];
  const re = new RegExp(MENTION_TOKEN_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({
      type: m[1] as AgentMentionType,
      id: m[2]!,
      label: m[3]!,
      token: m[0]!,
    });
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * After AI rewrites instructions it often turns `@{doc:id|Test}` into `@doc:Test`.
 * Put the structured tokens back so the chip editor can render them.
 */
export function rehydrateMentionsInText(
  text: string,
  sourceTokens: Array<{ type: AgentMentionType; id: string; label: string; token: string }>,
): string {
  if (sourceTokens.length === 0) return text;
  let out = text;
  for (const t of sourceTokens) {
    if (out.includes(t.token)) continue;
    // @doc:Test / @type:Label (AI plain form)
    const plainType = new RegExp(`@${escapeRegExp(t.type)}\\s*:\\s*${escapeRegExp(t.label)}`, "gi");
    if (plainType.test(out)) {
      out = out.replace(plainType, t.token);
      continue;
    }
    // bare @Label when unique enough (label length > 2)
    if (t.label.trim().length > 2) {
      const bare = new RegExp(`@${escapeRegExp(t.label)}\\b`, "g");
      // only replace if not already part of a token
      out = out.replace(bare, (match, offset) => {
        const slice = out.slice(Math.max(0, offset - 2), offset + match.length + 2);
        if (slice.includes("@{")) return match;
        return t.token;
      });
    }
  }
  return out;
}

/**
 * Turn plain-language doc titles in chat replies into structured tokens so the UI
 * always shows the amber DOC chip (not mixed plain "Test" / **Test**).
 * Longest titles first to avoid partial overlaps.
 */
export function injectDocMentionTokens(
  text: string,
  docs: Array<{ id: string; title: string }>,
): string {
  if (!text || docs.length === 0) return text;
  let out = text;
  const sorted = [...docs]
    .map((d) => ({ id: d.id, title: (d.title || "").trim() }))
    .filter((d) => d.title.length >= 2)
    .sort((a, b) => b.title.length - a.title.length);

  for (const d of sorted) {
    const token = encodeMentionToken({ type: "doc", id: d.id, label: d.title });
    if (out.includes(token)) continue;
    const esc = escapeRegExp(d.title);
    const patterns: RegExp[] = [
      // **Test** / __Test__
      new RegExp(`\\*\\*${esc}\\*\\*`, "g"),
      new RegExp(`__${esc}__`, "g"),
      // the Test document / Test document
      new RegExp(`\\bthe\\s+${esc}\\s+documents?\\b`, "gi"),
      new RegExp(`\\b${esc}\\s+documents?\\b`, "gi"),
      // doc Test / document "Test"
      new RegExp(`\\bdoc(?:ument)?\\s+[“"']?${esc}[”"']?\\b`, "gi"),
      // “Test” / "Test" when referring to a short unique title
      new RegExp(`[“"']${esc}[”"']`, "g"),
    ];
    // Bare title only for reasonably distinctive labels (≥4 chars) to avoid
    // turning common words into chips.
    if (d.title.length >= 4) {
      patterns.push(new RegExp(`(?<![\\w@|}])${esc}(?![\\w@{])`, "g"));
    }

    for (const re of patterns) {
      // Reset lastIndex for global regexes when testing
      re.lastIndex = 0;
      if (!re.test(out)) continue;
      re.lastIndex = 0;
      out = out.replace(re, (match, offset: number) => {
        // Skip if already inside a @{...} token
        const before = out.slice(Math.max(0, offset - 80), offset);
        const open = before.lastIndexOf("@{");
        const close = before.lastIndexOf("}");
        if (open > close) return match;
        return token;
      });
    }
  }

  // A model will occasionally introduce a source as `(per DOC Title):`.
  // Once the title becomes a DOC chip, the leftover `):` looks like a sad
  // emoticon instead of a citation. Normalize that specific construction
  // after token insertion so the citation remains readable in chat.
  out = out.replace(
    /\(\s*per\s+(@\{doc:[0-9a-f-]{36}\|[^}]+\})\s*\)\s*:/gi,
    "See $1:",
  );

  return out;
}

/** Parse stored instruction text into text / mention segments. */
export function parseInstructionSegments(
  text: string,
): Array<
  | { kind: "text"; text: string }
  | { kind: "mention"; type: AgentMentionType; id: string; label: string; token: string }
> {
  const out: Array<
    | { kind: "text"; text: string }
    | { kind: "mention"; type: AgentMentionType; id: string; label: string; token: string }
  > = [];
  const re = new RegExp(MENTION_TOKEN_RE.source, "gi");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ kind: "text", text: text.slice(last, m.index) });
    }
    out.push({
      kind: "mention",
      type: m[1] as AgentMentionType,
      id: m[2]!,
      label: m[3]!,
      token: m[0]!,
    });
    last = m.index + m[0]!.length;
  }
  if (last < text.length) {
    out.push({ kind: "text", text: text.slice(last) });
  }
  if (out.length === 0) out.push({ kind: "text", text: "" });
  return out;
}
