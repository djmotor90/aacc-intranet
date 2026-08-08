/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { agentKnowledge, db, docAttachments, docChunks, docFolders, docPages } from "@aitim/db";
import { and, cosineDistance, eq, inArray, isNull } from "drizzle-orm";
import { embedText, hasOpenAiKey } from "@/lib/embeddings";
import { BUCKETS, getObjectStream } from "@/lib/storage";

/** Full-dump fallback cap — used only when retrieval can't run (see below). */
const MAX_CHARS = 12_000;

/** How many chunks retrieval pulls in per turn, across all linked docs. */
const TOP_K_CHUNKS = 8;

/** Bound both request payload size and per-turn vision cost. */
const MAX_KNOWLEDGE_IMAGES = 6;
const MAX_IMAGE_BYTES = 4_000_000;

const ATTACHMENT_SRC_RE = /^\/api\/docs\/attachments\/([0-9a-f-]{36})/i;

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

/** Pages linked to this agent, either directly or via a linked folder. */
async function loadLinkedPages(
  agentId: string,
): Promise<{ id: string; title: string; body: unknown }[]> {
  const links = await db
    .select()
    .from(agentKnowledge)
    .where(eq(agentKnowledge.agentId, agentId));

  if (links.length === 0) return [];

  const pageIds = links.filter((l) => l.sourceType === "doc_page").map((l) => l.sourceId);
  const folderIds = links.filter((l) => l.sourceType === "doc_folder").map((l) => l.sourceId);

  const pages: { id: string; title: string; body: unknown }[] = [];

  if (pageIds.length > 0) {
    const rows = await db
      .select({ id: docPages.id, title: docPages.title, body: docPages.body })
      .from(docPages)
      .where(and(inArray(docPages.id, pageIds), isNull(docPages.deletedAt)));
    pages.push(...rows.map((r) => ({ id: r.id, title: r.title || "Untitled", body: r.body })));
  }

  if (folderIds.length > 0) {
    const rows = await db
      .select({ id: docPages.id, title: docPages.title, body: docPages.body })
      .from(docPages)
      .where(and(inArray(docPages.folderId, folderIds), isNull(docPages.deletedAt)))
      .limit(40);
    pages.push(...rows.map((r) => ({ id: r.id, title: r.title || "Untitled", body: r.body })));
  }

  return pages;
}

/** Load text from docs linked as agent knowledge (for LLM context). */
function fullDumpFallback(pages: { title: string; body: unknown }[]): string {
  let out = pages.map((p) => pageChunk(p.title, p.body)).join("\n\n---\n\n");
  if (out.length > MAX_CHARS) {
    out = `${out.slice(0, MAX_CHARS)}\n\n[…knowledge truncated…]`;
  }
  return out;
}

/**
 * Load knowledge context for this turn: retrieve the chunks most relevant to
 * `query` via pgvector instead of dumping every linked doc's full text and
 * truncating at a fixed char budget. That worked when an agent had one or
 * two short docs; it silently drops content once knowledge scales up (a
 * single ~90KB doc already blows the old 12k-char cap on its own).
 *
 * Falls back to the old full-dump behavior when retrieval genuinely can't
 * run (no OpenAI key, API error) — never leave the agent knowledge-blind
 * over an embeddings outage. Pages that are linked but not embedded yet
 * (just linked, or its embed job hasn't run) still get a short raw-text
 * snippet folded in so they're not invisible during that window.
 */
export async function loadAgentKnowledgeContext(agentId: string, query: string): Promise<string> {
  const pages = await loadLinkedPages(agentId);
  if (pages.length === 0) return "";

  if (!hasOpenAiKey()) return fullDumpFallback(pages);

  const pageIds = pages.map((p) => p.id);
  try {
    const queryVector = await embedText(query);
    const distance = cosineDistance(docChunks.embedding, queryVector);
    const hits = await db
      .select({
        pageId: docChunks.pageId,
        pageTitle: docPages.title,
        heading: docChunks.heading,
        content: docChunks.content,
      })
      .from(docChunks)
      .innerJoin(docPages, eq(docChunks.pageId, docPages.id))
      .where(inArray(docChunks.pageId, pageIds))
      .orderBy(distance)
      .limit(TOP_K_CHUNKS);

    if (hits.length === 0) return fullDumpFallback(pages);

    const sections = hits.map((h) => {
      const title = h.pageTitle || "Untitled";
      return h.heading && h.heading !== title
        ? `# ${title} — ${h.heading}\n${h.content}`
        : `# ${title}\n${h.content}`;
    });

    // Pages with zero chunks at all (never embedded yet) are invisible to
    // the query above — fold in a short raw snippet so linking a doc is
    // useful immediately, not just after its embed job finishes.
    const embeddedPageIds = new Set(hits.map((h) => h.pageId));
    for (const page of pages) {
      if (embeddedPageIds.has(page.id)) continue;
      const hasAnyChunk = await db
        .select({ id: docChunks.id })
        .from(docChunks)
        .where(eq(docChunks.pageId, page.id))
        .limit(1);
      if (hasAnyChunk.length > 0) continue; // has chunks, just none matched this query
      const text = bodyToText(page.body).trim();
      if (text) {
        sections.push(`# ${page.title} (not yet indexed for search)\n${text.slice(0, 800)}`);
      }
    }

    return sections.join("\n\n---\n\n");
  } catch (err) {
    console.error("[knowledge] vector retrieval failed, falling back to full dump", err);
    return fullDumpFallback(pages);
  }
}

type ImageRef = { pageTitle: string; alt: string; attachmentId: string };

/** Find `image` nodes in a TipTap doc that point at our own attachment store
 * (external image URLs aren't ours to fetch/base64 — skipped). */
function extractAttachmentImageRefs(pageTitle: string, body: unknown): ImageRef[] {
  if (!body || typeof body !== "object") return [];
  const doc = (body as { doc?: unknown }).doc ?? body;
  const out: ImageRef[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; attrs?: { src?: unknown; alt?: unknown }; content?: unknown[] };
    if (n.type === "image" && typeof n.attrs?.src === "string") {
      const m = ATTACHMENT_SRC_RE.exec(n.attrs.src);
      if (m) {
        out.push({
          pageTitle,
          alt: typeof n.attrs.alt === "string" ? n.attrs.alt : "",
          attachmentId: m[1]!,
        });
      }
    }
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(doc);
  return out;
}

export type KnowledgeImage = {
  pageTitle: string;
  alt: string;
  /** data: URI — safe to hand straight to a vision-capable chat completion. */
  dataUri: string;
};

/**
 * Fetch (and inline as base64) images embedded in linked Knowledge docs, so
 * the model can actually see them instead of only getting the surrounding
 * text. xAI has no way to fetch our attachment URLs itself — they're
 * session-gated, not publicly reachable — so we read the bytes from storage
 * server-side and hand them over as data: URIs.
 *
 * Bounded by MAX_KNOWLEDGE_IMAGES / MAX_IMAGE_BYTES: every image costs real
 * vision tokens and inflates the request body, and a single linked doc can
 * easily contain dozens of screenshots.
 */
export async function loadAgentKnowledgeImages(agentId: string): Promise<KnowledgeImage[]> {
  const pages = await loadLinkedPages(agentId);
  if (pages.length === 0) return [];

  const refs = pages.flatMap((p) => extractAttachmentImageRefs(p.title, p.body));
  if (refs.length === 0) return [];

  const capped = refs.slice(0, MAX_KNOWLEDGE_IMAGES);
  const attachmentIds = capped.map((r) => r.attachmentId);
  const rows = await db
    .select({
      id: docAttachments.id,
      objectKey: docAttachments.objectKey,
      mimeType: docAttachments.mimeType,
      sizeBytes: docAttachments.sizeBytes,
    })
    .from(docAttachments)
    .where(inArray(docAttachments.id, attachmentIds));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const out: KnowledgeImage[] = [];
  for (const ref of capped) {
    const att = byId.get(ref.attachmentId);
    if (!att || !att.mimeType.startsWith("image/")) continue;
    if (att.sizeBytes > MAX_IMAGE_BYTES) continue;
    try {
      const { body } = await getObjectStream(BUCKETS.attachments, att.objectKey);
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
      }
      const buf = Buffer.concat(chunks);
      out.push({
        pageTitle: ref.pageTitle,
        alt: ref.alt,
        dataUri: `data:${att.mimeType};base64,${buf.toString("base64")}`,
      });
    } catch (err) {
      console.error("[knowledge] failed to load image", att.objectKey, err);
    }
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
