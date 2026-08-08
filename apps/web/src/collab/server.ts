/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Live multiplayer collab server (Hocuspocus + Yjs).
 * Run: pnpm collab:dev   (port COLLAB_PORT, default 1234)
 */
import { Server } from "@hocuspocus/server";
import { TiptapTransformer } from "@hocuspocus/transformer";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { and, eq, isNull, sql } from "drizzle-orm";
import * as Y from "yjs";
import { verifyCollabToken } from "./token";

const PORT = Number(process.env.COLLAB_PORT ?? 1234);

type BodyShape = { text?: string; doc?: unknown };

/**
 * Match the image attributes used by the browser editor. Without this schema,
 * TiptapTransformer keeps the image node but strips src/size attributes.
 */
const CollabImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      uploadId: { default: null },
      width: { default: null },
      height: { default: null },
    };
  },
});

const COLLAB_SCHEMA_EXTENSIONS = [StarterKit, CollabImage];
const UPLOAD_BATCH_MAP = "aitim-upload-batches";

function plainTextFromDoc(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (typeof n.text === "string") parts.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(doc);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function hasUnresolvedImage(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const value = node as {
    type?: unknown;
    attrs?: { src?: unknown; uploadId?: unknown };
    content?: unknown[];
  };
  if (value.type === "image") {
    const src = typeof value.attrs?.src === "string" ? value.attrs.src.trim() : "";
    if (!src || src.startsWith("data:") || value.attrs?.uploadId) return true;
  }
  return Array.isArray(value.content) && value.content.some(hasUnresolvedImage);
}

async function getDb() {
  const { db, docPages } = await import("@aitim/db");
  return { db, docPages };
}

const server = new Server({
  port: PORT,
  quiet: process.env.COLLAB_QUIET === "1",

  async onAuthenticate({ token, documentName }) {
    if (!token) throw new Error("Missing collab token");
    const payload = verifyCollabToken(token);
    if (payload.pageId !== documentName) {
      throw new Error("Token is not valid for this document");
    }
    return {
      user: {
        id: payload.userId,
        name: payload.name,
        color: payload.color,
        canEdit: payload.canEdit,
      },
    };
  },

  async onLoadDocument({ document, documentName }) {
    const { db, docPages } = await getDb();
    const [row] = await db
      .select({
        id: docPages.id,
        body: docPages.body,
        ydocState: docPages.ydocState,
        deletedAt: docPages.deletedAt,
      })
      .from(docPages)
      .where(eq(docPages.id, documentName))
      .limit(1);

    if (!row || row.deletedAt) {
      throw new Error("Document not found");
    }

    // Prefer binary Yjs snapshot (preserves full schema / custom nodes).
    if (row.ydocState && row.ydocState.length > 0) {
      Y.applyUpdate(document, new Uint8Array(row.ydocState));
      return document;
    }

    // Seed from TipTap JSON body when no Yjs state exists yet.
    const body = row.body as BodyShape | null;
    const json =
      body?.doc && typeof body.doc === "object"
        ? body.doc
        : { type: "doc", content: [{ type: "paragraph" }] };

    try {
      const seeded = TiptapTransformer.toYdoc(
        json,
        "default",
        COLLAB_SCHEMA_EXTENSIONS,
      );
      const update = Y.encodeStateAsUpdate(seeded);
      Y.applyUpdate(document, update);
    } catch (err) {
      console.error("[collab] failed to seed ydoc from body", documentName, err);
    }
    return document;
  },

  async onStoreDocument({ document, documentName, context }) {
    const user = (context as { user?: { canEdit?: boolean; id?: string } })?.user;
    if (user && user.canEdit === false) {
      // Read-only connections should not persist (server still may call store — skip).
      return;
    }

    // A Word paste can replace hundreds of image placeholders. Keep the live
    // Yjs document updating, but serialize to Postgres only after the batch's
    // final URL replacement so an intermediate body cannot win on refresh.
    if (document.getMap(UPLOAD_BATCH_MAP).size > 0) return;

    const { db, docPages } = await getDb();
    const state = Buffer.from(Y.encodeStateAsUpdate(document));

    let jsonDoc: unknown = { type: "doc", content: [{ type: "paragraph" }] };
    try {
      jsonDoc = TiptapTransformer.fromYdoc(document, "default");
    } catch (err) {
      console.error("[collab] fromYdoc failed", documentName, err);
    }

    if (hasUnresolvedImage(jsonDoc)) {
      console.warn("[collab] skipped unresolved image snapshot", documentName);
      return;
    }

    const text = plainTextFromDoc(jsonDoc);
    const body = { text, doc: jsonDoc };

    // The first store initializes the CRDT snapshot from the page's existing
    // JSON. It is infrastructure bookkeeping, not a user edit, so it must not
    // advance updatedAt and make a simultaneous local fallback report a false
    // "someone else saved" conflict. The conditional update keeps this atomic.
    const [initialized] = await db
      .update(docPages)
      .set({
        ydocState: state,
        body,
        updatedById: user?.id ?? null,
      })
      .where(and(eq(docPages.id, documentName), isNull(docPages.ydocState)))
      .returning({ id: docPages.id });

    if (initialized) return;

    const [contentUpdated] = await db
      .update(docPages)
      .set({
        ydocState: state,
        body,
        bodyVersion: sql`${docPages.bodyVersion} + 1`,
        updatedAt: new Date(),
        updatedById: user?.id ?? null,
      })
      .where(
        and(
          eq(docPages.id, documentName),
          sql`${docPages.body} IS DISTINCT FROM ${JSON.stringify(body)}::jsonb`,
        ),
      )
      .returning({ id: docPages.id });

    if (contentUpdated) {
      const { enqueue } = await import("@/lib/queue");
      void enqueue("embed-doc", { pageId: documentName }).catch((err) =>
        console.error("[collab] enqueue embed-doc failed", documentName, err),
      );
      return;
    }

    // Equivalent JSON can still produce a newer binary snapshot. Persist that
    // bookkeeping without advancing the body revision or visible edit time.
    await db
      .update(docPages)
      .set({ ydocState: state })
      .where(eq(docPages.id, documentName));
  },
});

server.listen().then(() => {
  console.log(`[collab] Hocuspocus listening on ws://0.0.0.0:${PORT}`);
});
