/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Lightweight markdown → TipTap JSON for Super Agent doc writes.
 * Supports the subset the Docs editor renders well (headings, lists, tasks, etc.).
 */
import type { JSONContent } from "@tiptap/react";
import { docToPlainText, emptyDoc } from "@/components/editor/doc-utils";

type Mark = { type: string; attrs?: Record<string, unknown> };

function textNode(text: string, marks?: Mark[]): JSONContent {
  const node: JSONContent = { type: "text", text };
  if (marks?.length) node.marks = marks;
  return node;
}

/** Inline markdown: **bold**, *italic*, `code`, [label](url), ~~strike~~ */
export function parseInlineMarkdown(line: string): JSONContent[] {
  if (!line) return [];
  const nodes: JSONContent[] = [];
  // Order matters: links, code, bold, strike, italic
  const re =
    /(!?\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*]+)\*|_([^_]+)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) {
      nodes.push(textNode(line.slice(last, m.index)));
    }
    if (m[2] !== undefined && m[3] !== undefined) {
      // link (ignore image !)
      nodes.push(
        textNode(m[2], [{ type: "link", attrs: { href: m[3], target: "_blank" } }]),
      );
    } else if (m[4] !== undefined) {
      nodes.push(textNode(m[4], [{ type: "code" }]));
    } else if (m[5] !== undefined || m[6] !== undefined) {
      nodes.push(textNode(m[5] ?? m[6]!, [{ type: "bold" }]));
    } else if (m[7] !== undefined) {
      nodes.push(textNode(m[7], [{ type: "strike" }]));
    } else if (m[8] !== undefined || m[9] !== undefined) {
      nodes.push(textNode(m[8] ?? m[9]!, [{ type: "italic" }]));
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) nodes.push(textNode(line.slice(last)));
  return nodes.length ? nodes : [textNode(line)];
}

function paragraph(line: string): JSONContent {
  const content = parseInlineMarkdown(line);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

function heading(level: 1 | 2 | 3 | 4, line: string): JSONContent {
  return {
    type: "heading",
    attrs: { level },
    content: parseInlineMarkdown(line),
  };
}

function listItemParagraph(text: string): JSONContent {
  return {
    type: "listItem",
    content: [paragraph(text)],
  };
}

function taskItem(checked: boolean, text: string): JSONContent {
  return {
    type: "taskItem",
    attrs: { checked },
    content: [paragraph(text)],
  };
}

/**
 * Convert markdown (or plain text) into a TipTap doc matching the Docs editor.
 */
export function markdownToDoc(md: string): JSONContent {
  const raw = md.replace(/\r\n/g, "\n").trim();
  if (!raw) return emptyDoc();

  const lines = raw.split("\n");
  const content: JSONContent[] = [];
  let i = 0;

  const flushParagraphBuffer = (buf: string[]) => {
    if (!buf.length) return;
    content.push(paragraph(buf.join(" ").trim()));
    buf.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // blank → skip (separates blocks)
    if (!trimmed) {
      i++;
      continue;
    }

    // fenced code block
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim() || null;
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      if (i < lines.length) i++; // closing fence
      content.push({
        type: "codeBlock",
        attrs: lang ? { language: lang } : {},
        content: codeLines.length ? [textNode(codeLines.join("\n"))] : undefined,
      });
      continue;
    }

    // horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      content.push({ type: "horizontalRule" });
      i++;
      continue;
    }

    // headings
    const hm = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hm) {
      const level = Math.min(4, hm[1]!.length) as 1 | 2 | 3 | 4;
      content.push(heading(level, hm[2]!));
      i++;
      continue;
    }

    // blockquote (merge consecutive)
    if (trimmed.startsWith(">")) {
      const qLines: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith(">")) {
        qLines.push((lines[i] ?? "").trim().replace(/^>\s?/, ""));
        i++;
      }
      content.push({
        type: "blockquote",
        content: [paragraph(qLines.join(" "))],
      });
      continue;
    }

    // task list
    if (/^[-*]\s+\[[ xX]\]\s+/.test(trimmed)) {
      const items: JSONContent[] = [];
      while (i < lines.length && /^[-*]\s+\[[ xX]\]\s+/.test((lines[i] ?? "").trim())) {
        const t = (lines[i] ?? "").trim();
        const checked = /^[-*]\s+\[[xX]\]/.test(t);
        const text = t.replace(/^[-*]\s+\[[ xX]\]\s+/, "");
        items.push(taskItem(checked, text));
        i++;
      }
      content.push({ type: "taskList", content: items });
      continue;
    }

    // bullet list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: JSONContent[] = [];
      while (i < lines.length && /^[-*+]\s+/.test((lines[i] ?? "").trim())) {
        items.push(listItemParagraph((lines[i] ?? "").trim().replace(/^[-*+]\s+/, "")));
        i++;
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }

    // ordered list
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: JSONContent[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test((lines[i] ?? "").trim())) {
        items.push(listItemParagraph((lines[i] ?? "").trim().replace(/^\d+[.)]\s+/, "")));
        i++;
      }
      content.push({ type: "orderedList", content: items });
      continue;
    }

    // plain paragraph (merge soft-wrapped consecutive non-special lines)
    const buf: string[] = [trimmed];
    i++;
    while (i < lines.length) {
      const next = (lines[i] ?? "").trim();
      if (!next) break;
      if (
        next.startsWith("#") ||
        next.startsWith(">") ||
        next.startsWith("```") ||
        /^[-*+]\s+/.test(next) ||
        /^\d+[.)]\s+/.test(next) ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(next)
      ) {
        break;
      }
      buf.push(next);
      i++;
    }
    flushParagraphBuffer(buf);
  }

  if (!content.length) return emptyDoc();
  return { type: "doc", content };
}

/** Merge append content into an existing TipTap doc without flattening history. */
export function appendMarkdownToDoc(
  existingDoc: JSONContent | null | undefined,
  markdown: string,
  headingLabel?: string,
): JSONContent {
  const base: JSONContent =
    existingDoc && existingDoc.type === "doc" && Array.isArray(existingDoc.content)
      ? { type: "doc", content: [...(existingDoc.content ?? [])] }
      : emptyDoc();

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const sectionMd = [
    "",
    `## ${headingLabel?.trim() || `Update (${stamp})`}`,
    markdown.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  const addition = markdownToDoc(sectionMd);
  const added = addition.content ?? [];
  base.content = [...(base.content ?? []), ...added];
  return base;
}

export function docBodyFromMarkdown(markdown: string): { text: string; doc: JSONContent } {
  const doc = markdownToDoc(markdown);
  return { text: docToPlainText(doc), doc };
}

export function docBodyAppendMarkdown(
  existingBody: unknown,
  markdown: string,
  headingLabel?: string,
): { text: string; doc: JSONContent } {
  let existingDoc: JSONContent | null = null;
  if (existingBody && typeof existingBody === "object") {
    const o = existingBody as { doc?: JSONContent; type?: string; content?: JSONContent[] };
    if (o.doc?.type === "doc") existingDoc = o.doc;
    else if (o.type === "doc") existingDoc = o as JSONContent;
  }
  const doc = appendMarkdownToDoc(existingDoc, markdown, headingLabel);
  return { text: docToPlainText(doc), doc };
}
