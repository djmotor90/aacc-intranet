/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Split a TipTap doc into retrieval-sized chunks for pgvector embedding.
 * Chunk boundaries follow headings (a natural semantic unit — "what section
 * is this part of") rather than an arbitrary character cut, and a heading
 * carries forward as context for every chunk under it so a mid-section chunk
 * still reads sensibly out of context at retrieval time.
 */

/** Soft target — a heading section longer than this splits into multiple
 * chunks (still under the same heading) rather than growing unbounded. */
const MAX_CHUNK_CHARS = 1800;
/** Chunks shorter than this get merged into the next one — not worth a
 * separate embedding call/row for a stray one-line paragraph. */
const MIN_CHUNK_CHARS = 80;

type Node = {
  type?: string;
  attrs?: { level?: number; alt?: string };
  content?: Node[];
  text?: string;
};

function nodeText(node: Node): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "image") return node.attrs?.alt ? `[Image: ${node.attrs.alt}]` : "[Image]";
  if (!node.content) return "";
  return node.content.map(nodeText).join("");
}

type Block = { kind: "heading"; level: number; text: string } | { kind: "text"; text: string };

function toBlocks(doc: Node): Block[] {
  const blocks: Block[] = [];
  for (const node of doc.content ?? []) {
    if (node.type === "heading") {
      const text = nodeText(node).trim();
      if (text) blocks.push({ kind: "heading", level: node.attrs?.level ?? 1, text });
      continue;
    }
    const text = nodeText(node).trim();
    if (text) blocks.push({ kind: "text", text });
  }
  return blocks;
}

export type DocChunk = { heading: string | null; content: string };

/** Chunk a page's TipTap doc for embedding. `pageTitle` seeds the first
 * chunk's heading context so content before any real heading isn't orphaned. */
export function chunkDoc(doc: unknown, pageTitle: string): DocChunk[] {
  if (!doc || typeof doc !== "object") return [];
  const blocks = toBlocks(doc as Node);
  if (blocks.length === 0) return [];

  const chunks: DocChunk[] = [];
  let currentHeading: string | null = pageTitle || null;
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n\n").trim();
    buffer = [];
    if (!text) return;
    // Merge a too-short trailing chunk into the previous one under the same heading.
    const prev = chunks[chunks.length - 1];
    if (prev && prev.heading === currentHeading && text.length < MIN_CHUNK_CHARS) {
      prev.content = `${prev.content}\n\n${text}`;
      return;
    }
    chunks.push({ heading: currentHeading, content: text });
  };

  for (const block of blocks) {
    if (block.kind === "heading") {
      flush();
      currentHeading = block.text;
      continue;
    }
    const wouldBe = buffer.join("\n\n").length + block.text.length;
    if (buffer.length > 0 && wouldBe > MAX_CHUNK_CHARS) flush();
    buffer.push(block.text);
  }
  flush();

  return chunks;
}

/** Text actually sent to the embedding model — heading context folded in, so
 * a chunk about "Tuition amount is always $40" embeds knowing it's under
 * "Senior Section Fees page", not as a floating, context-free sentence. */
export function chunkEmbeddingText(chunk: DocChunk): string {
  return chunk.heading ? `${chunk.heading}\n\n${chunk.content}` : chunk.content;
}
