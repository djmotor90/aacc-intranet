/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { JSONContent } from "@tiptap/react";
import { docHasMedia, emptyDoc, plainTextToDoc } from "@/components/editor/doc-utils";
import { markdownToDoc } from "./markdown-to-doc";
import type { ChatEmbed, ChatMessageBody } from "./types";

/** True when text looks like markdown we should render (not strip raw **). */
export function textLooksLikeMarkdown(text: string): boolean {
  return /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|^\s{0,3}#{1,4}\s|^\s*[-*+]\s|^\s*\d+[.)]\s|^\s*>\s|^\s*---\s*$)/m.test(
    text,
  );
}

export function plainBody(text: string, embeds?: ChatEmbed[]): ChatMessageBody {
  const trimmed = text.trim();
  return {
    text: trimmed,
    doc: plainTextToDoc(trimmed || " "),
    embeds: embeds?.length ? embeds : undefined,
  };
}

/** Agent replies: markdown → TipTap so bold/lists/etc. render in the bubble. */
export function agentReplyBody(text: string, embeds?: ChatEmbed[]): ChatMessageBody {
  const trimmed = text.trim();
  return {
    text: trimmed,
    doc: markdownToDoc(trimmed || " "),
    embeds: embeds?.length ? embeds : undefined,
  };
}

export function parseMessageBody(raw: unknown): ChatMessageBody {
  if (!raw || typeof raw !== "object") {
    return { text: "", doc: emptyDoc() };
  }
  const o = raw as Record<string, unknown>;
  const text = typeof o.text === "string" ? o.text : "";
  let doc = o.doc as JSONContent | undefined;
  // Prefer markdown rendering when the stored doc was a flat plain-text conversion
  // but the text still has markdown markers (legacy agent replies). Never discard
  // a doc that actually carries media (pasted images/files) just because its
  // caption happens to contain markdown-looking characters like "**".
  if (!doc) {
    doc = textLooksLikeMarkdown(text) ? markdownToDoc(text) : plainTextToDoc(text);
  } else if (textLooksLikeMarkdown(text) && !docHasMedia(doc)) {
    doc = markdownToDoc(text);
  }
  const embeds = Array.isArray(o.embeds) ? (o.embeds as ChatEmbed[]) : undefined;
  return { text, doc, embeds };
}
