/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { JSONContent } from "@tiptap/react";
import { chatAttachments, db } from "@aitim/db";
import { inArray } from "drizzle-orm";
import { extractDocImages } from "@/components/editor/doc-utils";
import { BUCKETS, getObjectStream } from "@/lib/storage";

/** Bound both request payload size and per-turn vision cost. */
const MAX_MESSAGE_IMAGES = 6;
const MAX_IMAGE_BYTES = 4_000_000;

const ATTACHMENT_SRC_RE = /^\/api\/chat\/attachments\/([0-9a-f-]{36})/i;

export type ChatMessageImage = {
  alt: string;
  /** data: URI — safe to hand straight to a vision-capable chat completion. */
  dataUri: string;
};

/**
 * Fetch (and inline as base64) images the user pasted/dropped into the
 * triggering chat message, so the model can actually see them. xAI has no
 * way to fetch our attachment URLs itself — they're session-gated, not
 * publicly reachable — so we read the bytes from storage server-side and
 * hand them over as data: URIs, same pattern as loadAgentKnowledgeImages.
 */
export async function loadChatMessageImages(
  doc: JSONContent | null | undefined,
): Promise<ChatMessageImage[]> {
  const refs = extractDocImages(doc)
    .map((img) => {
      const m = ATTACHMENT_SRC_RE.exec(img.src);
      return m ? { alt: img.alt, attachmentId: m[1]! } : null;
    })
    .filter((r): r is { alt: string; attachmentId: string } => r !== null)
    .slice(0, MAX_MESSAGE_IMAGES);
  if (refs.length === 0) return [];

  const rows = await db
    .select({
      id: chatAttachments.id,
      objectKey: chatAttachments.objectKey,
      mimeType: chatAttachments.mimeType,
      sizeBytes: chatAttachments.sizeBytes,
    })
    .from(chatAttachments)
    .where(inArray(chatAttachments.id, refs.map((r) => r.attachmentId)));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const out: ChatMessageImage[] = [];
  for (const ref of refs) {
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
        alt: ref.alt,
        dataUri: `data:${att.mimeType};base64,${buf.toString("base64")}`,
      });
    } catch (err) {
      console.error("[chat-images] failed to load image", att.objectKey, err);
    }
  }
  return out;
}
