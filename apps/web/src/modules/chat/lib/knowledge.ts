/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { agentKnowledge, db, docFolders, docPages } from "@aitim/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

const MAX_CHARS = 12_000;

function bodyToText(body: unknown): string {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (typeof body !== "object") return "";
  const o = body as { text?: string; doc?: { content?: unknown[] } };
  if (typeof o.text === "string" && o.text.trim()) return o.text;
  // Fallback: shallow walk TipTap JSON for text nodes
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (typeof n.text === "string") parts.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  if (o.doc) walk(o.doc);
  else walk(body);
  return parts.join("");
}

function pageChunk(title: string, body: unknown): string {
  const text = bodyToText(body).trim();
  if (text) return `# ${title}\n${text}`;
  return `# ${title}\n(This page has little or no extractable text — it may be image-only or empty. Refer to it by title "${title}" only; do not invent content.)`;
}

/** Load text from docs linked as agent knowledge (for LLM context). */
export async function loadAgentKnowledgeContext(agentId: string): Promise<string> {
  const links = await db
    .select()
    .from(agentKnowledge)
    .where(eq(agentKnowledge.agentId, agentId));

  if (links.length === 0) return "";

  const pageIds = links.filter((l) => l.sourceType === "doc_page").map((l) => l.sourceId);
  const folderIds = links.filter((l) => l.sourceType === "doc_folder").map((l) => l.sourceId);

  const chunks: string[] = [];

  if (pageIds.length > 0) {
    const pages = await db
      .select({ id: docPages.id, title: docPages.title, body: docPages.body })
      .from(docPages)
      .where(and(inArray(docPages.id, pageIds), isNull(docPages.deletedAt)));
    for (const p of pages) {
      chunks.push(pageChunk(p.title || "Untitled", p.body));
    }
  }

  if (folderIds.length > 0) {
    const pagesInFolders = await db
      .select({ id: docPages.id, title: docPages.title, body: docPages.body, folderId: docPages.folderId })
      .from(docPages)
      .where(and(inArray(docPages.folderId, folderIds), isNull(docPages.deletedAt)))
      .limit(40);
    for (const p of pagesInFolders) {
      chunks.push(pageChunk(p.title || "Untitled", p.body));
    }
  }

  let out = chunks.join("\n\n---\n\n");
  if (out.length > MAX_CHARS) {
    out = `${out.slice(0, MAX_CHARS)}\n\n[…knowledge truncated…]`;
  }
  return out;
}

export async function listDocPickerOptions(): Promise<
  { id: string; type: "doc_page" | "doc_folder"; label: string; subtitle: string }[]
> {
  const [folders, pages] = await Promise.all([
    db
      .select({ id: docFolders.id, name: docFolders.name })
      .from(docFolders)
      .where(isNull(docFolders.deletedAt))
      .limit(100),
    db
      .select({ id: docPages.id, title: docPages.title, folderId: docPages.folderId })
      .from(docPages)
      .where(and(isNull(docPages.deletedAt), isNull(docPages.parentPageId)))
      .limit(150),
  ]);

  return [
    ...folders.map((f) => ({
      id: f.id,
      type: "doc_folder" as const,
      label: f.name,
      subtitle: "Folder",
    })),
    ...pages.map((p) => ({
      id: p.id,
      type: "doc_page" as const,
      label: p.title || "Untitled",
      subtitle: "Page",
    })),
  ];
}
