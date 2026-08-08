/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Shared TipTap/Yjs schema for Docs collaboration — used by both the collab
 * server (src/collab/server.ts) and any server-side code that writes a doc's
 * body outside of live collab (e.g. Super Agent doc writes) and needs to keep
 * ydoc_state in sync rather than nulling it out and forcing a reseed.
 */
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { TiptapTransformer } from "@hocuspocus/transformer";
import * as Y from "yjs";

/**
 * Match the image attributes used by the browser editor. Without this schema,
 * TiptapTransformer's JSON→Yjs seeding keeps the image node but drops
 * uploadId/width/height (anything the base Image extension doesn't declare).
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

export const COLLAB_SCHEMA_EXTENSIONS = [StarterKit, CollabImage];

/** Encode a TipTap JSON doc as a fresh Yjs binary snapshot (what onLoadDocument
 * does when seeding from body for the first time). Lets a non-collab writer
 * (e.g. a Super Agent doc update) keep ydoc_state in sync immediately instead
 * of nulling it and relying on the next collab connection to reseed correctly. */
export function encodeDocAsYjsState(doc: unknown): Buffer {
  const seeded = TiptapTransformer.toYdoc(doc, "default", COLLAB_SCHEMA_EXTENSIONS);
  return Buffer.from(Y.encodeStateAsUpdate(seeded));
}
