/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Privileged Super Agent write tools (owner / Super Admin only).
 * Used when the human chat partner is the agent creator or a platform admin.
 */
import { agentKnowledge, agents, db, docPageRevisions, docPages } from "@aitim/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { encodeDocAsYjsState } from "@/lib/collab-schema";
import { getAgentAccess, userIsAgentOwnerOrAdmin } from "./agent-access";
import {
  docBodyAppendMarkdown,
  docBodyFromMarkdown,
} from "./markdown-to-doc";

export { userIsAgentOwnerOrAdmin };

/** Soft caps — large dumps risk wiping useful pages or overflowing context. */
const MAX_WRITE_CHARS = 12_000;
const MIN_REPLACE_RATIO = 0.15; // replace body should not shrink a long page to a stub without clear intent

/** Write tools: owners, agent admins, and platform Super Admins. */
export async function userCanUseWriteTools(
  userId: string,
  agent: { id: string; createdById: string | null; config?: unknown },
): Promise<boolean> {
  const access = await getAgentAccess(
    { id: agent.id, createdById: agent.createdById, isEnabled: true, config: agent.config },
    userId,
  );
  return access.canEdit;
}

function bodyToText(body: unknown): string {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (typeof body !== "object") return "";
  const o = body as { text?: string; doc?: unknown };
  if (typeof o.text === "string" && o.text.trim()) return o.text;
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { text?: string; content?: unknown[] };
    if (typeof n.text === "string") parts.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(o.doc ?? body);
  return parts.join("");
}

/** Pages this agent may edit (linked knowledge only). */
export async function listWritableAgentDocs(agentId: string): Promise<
  { id: string; title: string }[]
> {
  const links = await db
    .select()
    .from(agentKnowledge)
    .where(eq(agentKnowledge.agentId, agentId));
  const pageIds = links.filter((l) => l.sourceType === "doc_page").map((l) => l.sourceId);
  const folderIds = links.filter((l) => l.sourceType === "doc_folder").map((l) => l.sourceId);

  const pages: { id: string; title: string }[] = [];
  if (pageIds.length) {
    const rows = await db
      .select({ id: docPages.id, title: docPages.title })
      .from(docPages)
      .where(and(inArray(docPages.id, pageIds), isNull(docPages.deletedAt)));
    pages.push(...rows.map((r) => ({ id: r.id, title: r.title || "Untitled" })));
  }
  if (folderIds.length) {
    const rows = await db
      .select({ id: docPages.id, title: docPages.title })
      .from(docPages)
      .where(and(inArray(docPages.folderId, folderIds), isNull(docPages.deletedAt)))
      .limit(40);
    for (const r of rows) {
      if (!pages.some((p) => p.id === r.id)) {
        pages.push({ id: r.id, title: r.title || "Untitled" });
      }
    }
  }
  return pages;
}

export async function updateLinkedDocContent(input: {
  agentId: string;
  userId: string;
  /** Prefer exact page id when known */
  pageId?: string | null;
  /** Match by title (case-insensitive) among linked docs */
  pageTitle?: string | null;
  mode: "append" | "replace";
  content: string;
  /** Optional ## heading for append sections */
  sectionHeading?: string | null;
}): Promise<{ ok: true; pageId: string; title: string; mode: "append" | "replace" } | { ok: false; error: string }> {
  const content = input.content?.trim();
  if (!content) return { ok: false, error: "No content to write" };
  if (content.length > MAX_WRITE_CHARS) {
    return {
      ok: false,
      error: `Content too large (${content.length} chars). Keep writes under ${MAX_WRITE_CHARS} characters.`,
    };
  }

  // Destruction guard: refuse obvious wipe payloads
  if (/^(clear|delete|empty|wipe)\s*(this\s*)?(page|doc|document)?\.?$/i.test(content)) {
    return { ok: false, error: "Refused: that would wipe the page. Append a section instead, or edit in Docs." };
  }

  const [agent] = await db.select().from(agents).where(eq(agents.id, input.agentId)).limit(1);
  if (!agent) return { ok: false, error: "Agent not found" };
  if (!(await userCanUseWriteTools(input.userId, agent))) {
    return { ok: false, error: "Only agent owners/admins (or Super Admins) can edit linked docs" };
  }

  const writable = await listWritableAgentDocs(input.agentId);
  if (writable.length === 0) {
    return { ok: false, error: "No linked docs in Knowledge — attach a doc first" };
  }

  let target = input.pageId
    ? writable.find((p) => p.id === input.pageId)
    : undefined;
  if (!target && input.pageTitle?.trim()) {
    const q = input.pageTitle.trim().toLowerCase();
    target = writable.find((p) => p.title.toLowerCase() === q)
      ?? writable.find((p) => p.title.toLowerCase().includes(q));
  }
  if (!target && writable.length === 1) target = writable[0];
  if (!target) {
    return {
      ok: false,
      error: `Could not resolve which doc to update. Linked: ${writable.map((w) => w.title).join(", ")}`,
    };
  }

  const [page] = await db
    .select()
    .from(docPages)
    .where(and(eq(docPages.id, target.id), isNull(docPages.deletedAt)))
    .limit(1);
  if (!page) return { ok: false, error: "Page not found" };

  const existingText = bodyToText(page.body).trim();
  const mode: "append" | "replace" = input.mode === "replace" ? "replace" : "append";

  // Destruction guard: replacing a long page with a tiny stub is almost always a mistake
  if (mode === "replace" && existingText.length > 400) {
    const ratio = content.length / existingText.length;
    if (ratio < MIN_REPLACE_RATIO) {
      return {
        ok: false,
        error:
          "Refused replace: new content is much shorter than the existing page (possible wipe). " +
          "Use append, or rewrite with comparable substance, or edit the page in Docs.",
      };
    }
  }

  const body =
    mode === "replace"
      ? docBodyFromMarkdown(content)
      : docBodyAppendMarkdown(page.body, content, input.sectionHeading ?? undefined);

  // Keep ydoc_state in sync immediately rather than nulling it and relying on
  // the next collab connection to reseed correctly from body — that reseed
  // round trip (JSON -> Yjs -> JSON on next store) is extra surface area for
  // exactly the kind of attribute loss this schema mismatch already caused
  // once. Encoding it directly here means live collab picks up this write
  // with no round trip involved at all.
  let ydocState: Buffer | null;
  try {
    ydocState = encodeDocAsYjsState(body.doc);
  } catch (err) {
    console.error("[agent-write-tools] failed to encode ydoc_state, falling back to reseed", err);
    ydocState = null;
  }

  const [updated] = await db
    .update(docPages)
    .set({
      body,
      bodyVersion: sql`${docPages.bodyVersion} + 1`,
      updatedById: input.userId,
      updatedAt: new Date(),
      ydocState,
    })
    .where(eq(docPages.id, page.id))
    .returning({ bodyVersion: docPages.bodyVersion });
  if (updated) {
    try {
      await db.insert(docPageRevisions).values({
        pageId: page.id,
        bodyVersion: updated.bodyVersion,
        body,
        createdById: input.userId,
      });
    } catch (error) {
      console.error("[agent-write-tools] revision snapshot failed after page save", page.id, error);
    }
  }

  return { ok: true, pageId: page.id, title: page.title || target.title, mode };
}

export async function saveMemoryFromChat(input: {
  agentId: string;
  userId: string;
  conversationId?: string | null;
  kind: "preference" | "fact" | "intelligence" | "procedure";
  content: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [agent] = await db.select().from(agents).where(eq(agents.id, input.agentId)).limit(1);
  if (!agent) return { ok: false, error: "Agent not found" };
  if (!(await userCanUseWriteTools(input.userId, agent))) {
    return { ok: false, error: "Only agent owners/admins (or Super Admins) can write memory this way" };
  }

  const { saveHotMemory } = await import("./memory");
  return saveHotMemory({
    agentId: input.agentId,
    userId: input.userId,
    conversationId: input.conversationId,
    kind: input.kind,
    content: input.content,
  });
}
