/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { JSONContent } from "@tiptap/core";
import type { ReactNode } from "react";

/**
 * Match http(s) and www. URLs in plain text.
 * Trailing sentence punctuation is excluded from the match.
 */
const URL_RE =
  /(?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)"'\]]/gi;

export function normalizeHref(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t) || t.startsWith("mailto:")) return t;
  return `https://${t}`;
}

export function isSafeHref(href: string): boolean {
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:";
  } catch {
    return false;
  }
}

/** Split plain text into React nodes with clickable external links. */
export function linkifyPlainText(text: string, className?: string): ReactNode[] {
  if (!text) return [];
  const nodes: ReactNode[] = [];
  let last = 0;
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const matched = m[0];
    if (start > last) {
      nodes.push(text.slice(last, start));
    }
    const href = normalizeHref(matched);
    if (isSafeHref(href)) {
      nodes.push(
        <a
          key={`url-${i++}-${start}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={
            className ??
            "text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary break-all"
          }
        >
          {matched}
        </a>,
      );
    } else {
      nodes.push(matched);
    }
    last = start + matched.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length > 0 ? nodes : [text];
}

type TipTapMark = { type: string; attrs?: Record<string, unknown> };

/**
 * Walk a TipTap JSON doc and wrap bare URL substrings in `link` marks
 * so read-only viewers make them clickable even when the author didn't
 * explicitly create a link.
 */
export function linkifyJsonContent(doc: JSONContent | null | undefined): JSONContent | null {
  if (!doc) return null;
  return walkNode(doc);
}

function walkNode(node: JSONContent): JSONContent {
  if (node.type === "text" && typeof node.text === "string") {
    return linkifyTextNode(node);
  }
  if (!node.content?.length) return node;
  const content: JSONContent[] = [];
  for (const child of node.content) {
    const walked = walkNode(child);
    // linkifyTextNode may return a fragment-like multi via content expansion
    if (walked.type === "__fragment" && walked.content) {
      content.push(...walked.content);
    } else {
      content.push(walked);
    }
  }
  return { ...node, content };
}

function linkifyTextNode(node: JSONContent): JSONContent {
  const text = node.text ?? "";
  const existingMarks = (node.marks ?? []) as TipTapMark[];
  if (existingMarks.some((m) => m.type === "link")) {
    return node; // already a link
  }

  const re = new RegExp(URL_RE.source, URL_RE.flags);
  const parts: JSONContent[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let found = false;

  while ((m = re.exec(text)) !== null) {
    found = true;
    const start = m.index;
    const matched = m[0];
    if (start > last) {
      parts.push({
        type: "text",
        text: text.slice(last, start),
        ...(existingMarks.length ? { marks: existingMarks } : {}),
      });
    }
    const href = normalizeHref(matched);
    if (isSafeHref(href)) {
      parts.push({
        type: "text",
        text: matched,
        marks: [
          ...existingMarks.filter((mk) => mk.type !== "link"),
          { type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer nofollow" } },
        ],
      });
    } else {
      parts.push({
        type: "text",
        text: matched,
        ...(existingMarks.length ? { marks: existingMarks } : {}),
      });
    }
    last = start + matched.length;
  }

  if (!found) return node;

  if (last < text.length) {
    parts.push({
      type: "text",
      text: text.slice(last),
      ...(existingMarks.length ? { marks: existingMarks } : {}),
    });
  }

  // Parent expects a single node; use a synthetic fragment the walker expands.
  return { type: "__fragment", content: parts };
}
