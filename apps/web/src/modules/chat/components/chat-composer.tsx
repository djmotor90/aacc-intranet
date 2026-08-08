/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import type { JSONContent } from "@tiptap/react";
import { useCallback, useState, useSyncExternalStore, useTransition } from "react";
import {
  docToPlainText,
  isDocEmpty,
  normalizeImageAttachments,
} from "@/components/editor/doc-utils";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { Button } from "@/components/ui/button";
import { sendChatMessage } from "../actions/messages";
import type { ChatMessageDTO } from "../lib/types";

export function ChatComposer({
  conversationId,
  agentName,
  onSent,
}: {
  conversationId: string;
  agentName: string;
  onSent: (message: ChatMessageDTO) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [empty, setEmpty] = useState(true);
  const [editorKey, setEditorKey] = useState(0);
  const [payload, setPayload] = useState<{ text: string; doc: JSONContent } | null>(null);
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const canSubmit = ready && !pending && !empty && Boolean(payload && !isDocEmpty(payload.doc));

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (!canSubmit || !payload || isDocEmpty(payload.doc)) {
        if (ready) setError("Write something first");
        return;
      }
      const normalizedDoc = normalizeImageAttachments(payload.doc);
      const text = docToPlainText(normalizedDoc).trim();
      const clientMessageId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}`;

      startTransition(async () => {
        const res = await sendChatMessage({
          conversationId,
          doc: normalizedDoc,
          text,
          clientMessageId,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onSent(res.message);
        setPayload(null);
        setEmpty(true);
        setEditorKey((k) => k + 1);
      });
    },
    [canSubmit, conversationId, onSent, payload, ready],
  );

  return (
    <form onSubmit={onSubmit} className="shrink-0 border-t bg-background p-3">
      <div className="rounded-xl border bg-card p-2">
        <RichTextEditor
          key={editorKey}
          variant="compact"
          placeholder={`Message ${agentName}…`}
          onChange={({ text, doc, empty: isEmpty }) => {
            setPayload({ text, doc });
            setEmpty(isEmpty);
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          {error ? <p className="text-xs text-destructive">{error}</p> : <span />}
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {pending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </form>
  );
}
