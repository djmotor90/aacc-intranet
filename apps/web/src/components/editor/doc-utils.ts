/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { JSONContent } from "@tiptap/react";

/** Legacy comment/description shape: `{ text: string }` or TipTap `{ type:'doc', ... }` or hybrid. */
export type StoredRichDoc = {
  text?: string;
  doc?: JSONContent;
  type?: string;
  content?: JSONContent[];
} | null;

export function emptyDoc(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/**
 * prosemirror-model builds every node/mark `attrs` object via
 * `Object.create(null)` (see computeAttrs) and `Node.prototype.toJSON` /
 * `Mark.prototype.toJSON` assign that object in by reference, never cloning
 * it into a plain object. Any node or mark with a non-empty attrs bag —
 * an image, a heading, a `textStyle` color mark from pasted formatting —
 * therefore comes out of `editor.getJSON()` holding a null-prototype value.
 * React's Server Action argument encoder treats null-prototype objects as
 * non-serializable class instances: it doesn't throw client-side (Next.js
 * enables `temporaryReferences` for real action calls), it just swaps the
 * value for an opaque reference, and the server then throws the moment any
 * code reads a property off it (e.g. "Cannot access src on the server").
 * Round-tripping through JSON strips every prototype back to plain Object.
 */
export function toPlainJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Build a minimal TipTap doc from plain text (legacy data). */
export function plainTextToDoc(text: string): JSONContent {
  const trimmed = text.trim();
  if (!trimmed) return emptyDoc();
  const paragraphs = trimmed.split(/\n+/).map((line) => ({
    type: "paragraph" as const,
    content: line ? [{ type: "text" as const, text: line }] : undefined,
  }));
  return { type: "doc", content: paragraphs };
}

/** True when a fileAttachment (or file meta) is actually an image, not a chip. */
export function isImageAttachmentMeta(attrs: {
  mimeType?: unknown;
  fileName?: unknown;
  href?: unknown;
  src?: unknown;
} | null | undefined): boolean {
  if (!attrs) return false;
  const mime = String(attrs.mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = String(attrs.fileName ?? attrs.href ?? attrs.src ?? "");
  return /\.(png|jpe?g|gif|webp|heic|bmp|svg)(\?|$)/i.test(name);
}

/**
 * Convert image-like `fileAttachment` nodes into real `image` nodes so
 * comments and notification replies always render the same (as images,
 * never paperclip chips).
 */
export function normalizeImageAttachments(doc: JSONContent): JSONContent {
  function walk(node: JSONContent): JSONContent {
    if (node.type === "fileAttachment" && isImageAttachmentMeta(node.attrs)) {
      const href = String(node.attrs?.href ?? "");
      const name = String(node.attrs?.fileName ?? "Image");
      if (href && href !== "#") {
        return {
          type: "image",
          attrs: {
            src: href,
            alt: name,
            title: name,
          },
        };
      }
    }
    if (!node.content?.length) return node;
    return {
      ...node,
      content: node.content.map(walk),
    };
  }
  return walk(doc);
}

/** Extract plain text from a TipTap JSON doc (for previews / notifications). */
export function docToPlainText(doc: JSONContent | null | undefined): string {
  if (!doc) return "";
  const parts: string[] = [];
  function walk(node: JSONContent) {
    if (node.type === "text" && node.text) parts.push(node.text);
    if (node.type === "hardBreak") parts.push("\n");
    if (node.type === "image") {
      const alt = (node.attrs?.alt as string | undefined)?.trim();
      parts.push(alt ? `[Image: ${alt}]` : "[Image]");
    }
    if (node.type === "fileAttachment") {
      const name = (node.attrs?.fileName as string | undefined)?.trim();
      if (isImageAttachmentMeta(node.attrs)) {
        parts.push(name ? `[Image: ${name}]` : "[Image]");
      } else {
        parts.push(name ? `[File: ${name}]` : "[File]");
      }
    }
    if (node.content) {
      for (const child of node.content) walk(child);
      if (node.type === "tableCell" || node.type === "tableHeader") {
        parts.push("\t");
      }
      if (
        node.type === "paragraph" ||
        node.type === "heading" ||
        node.type === "bulletList" ||
        node.type === "orderedList" ||
        node.type === "taskList" ||
        node.type === "blockquote" ||
        node.type === "codeBlock" ||
        node.type === "tableRow" ||
        node.type === "table" ||
        node.type === "image" ||
        node.type === "fileAttachment"
      ) {
        parts.push("\n");
      }
    }
  }
  walk(doc);
  return parts.join("").replace(/\n+$/, "").trim();
}

export type DocImageRef = { src: string; alt: string };

/** Every `image` node in a TipTap doc, in document order (rendering + vision). */
export function extractDocImages(doc: JSONContent | null | undefined): DocImageRef[] {
  const out: DocImageRef[] = [];
  function walk(node: JSONContent) {
    if (node.type === "image" && typeof node.attrs?.src === "string") {
      out.push({
        src: node.attrs.src,
        alt: typeof node.attrs.alt === "string" ? node.attrs.alt : "",
      });
    }
    if (node.content) for (const child of node.content) walk(child);
  }
  if (doc) walk(doc);
  return out;
}

/** True when the doc has any image or file-attachment node — never safe to
 * discard by regenerating the doc from its plain-text projection. */
export function docHasMedia(doc: JSONContent | null | undefined): boolean {
  if (!doc) return false;
  let hasMedia = false;
  function walk(node: JSONContent) {
    if (node.type === "image" && node.attrs?.src) hasMedia = true;
    if (node.type === "fileAttachment" && (node.attrs?.href || node.attrs?.id)) {
      hasMedia = true;
    }
    if (node.content) for (const child of node.content) walk(child);
  }
  walk(doc);
  return hasMedia;
}

/** True when the doc has no text and no media (images / file chips). */
export function docHasContent(doc: JSONContent | null | undefined): boolean {
  if (!doc) return false;
  if (docToPlainText(doc).trim()) return true;
  return docHasMedia(doc);
}

/** Normalize anything we might have stored into a TipTap doc. */
export function storedToDoc(stored: StoredRichDoc | string | null | undefined): JSONContent {
  if (!stored) return emptyDoc();
  let doc: JSONContent | null = null;
  if (typeof stored === "string") {
    doc = plainTextToDoc(stored);
  } else if (stored.type === "doc") {
    // Full TipTap doc stored at top level
    doc = stored as JSONContent;
  } else if (stored.doc && stored.doc.type === "doc") {
    // Hybrid: { text, doc }
    doc = stored.doc;
  } else if (typeof stored.text === "string") {
    // Legacy: { text: "..." }
    doc = plainTextToDoc(stored.text);
  } else {
    return emptyDoc();
  }
  // Images must render as images (same path in comments + notification replies)
  return normalizeImageAttachments(doc);
}

/** Persist TipTap doc + plain text for backwards-compatible previews. */
export function docToStored(doc: JSONContent): { text: string; doc: JSONContent } {
  return { text: docToPlainText(doc), doc };
}

export function isDocEmpty(doc: JSONContent | null | undefined): boolean {
  return !docHasContent(doc);
}
