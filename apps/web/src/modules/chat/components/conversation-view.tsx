/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { markConversationRead } from "../actions/conversations";
import { getChatMessage, pollConversationMessages } from "../actions/messages";
import { resolveMentionLabels } from "../actions/mention-search";
import { extractMentionTokens } from "../lib/agent-mentions";
import type { ChatMessageDTO } from "../lib/types";
import { ChatComposer } from "./chat-composer";
import { MessageBubble, TypingIndicator } from "./message-bubble";

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function ConversationView({
  conversationId,
  agentName,
  agentTitle,
  agentEmoji,
  agentSlug,
  isAdmin = false,
  currentUserId,
  initialMessages,
  initialLabelOverrides,
}: {
  conversationId: string;
  agentName: string;
  agentTitle: string | null;
  agentEmoji: string;
  agentSlug?: string | null;
  isAdmin?: boolean;
  currentUserId: string;
  initialMessages: ChatMessageDTO[];
  /** Server-resolved current names for mentions in initialMessages, so chips
   * never flash the stale send-time label on first paint. */
  initialLabelOverrides?: Record<string, string>;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [agentTyping, setAgentTyping] = useState(false);
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>(
    initialLabelOverrides ?? {},
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMessageIdRef = useRef<string | null>(
    initialMessages[initialMessages.length - 1]?.id ?? null,
  );

  useEffect(() => {
    lastMessageIdRef.current = messages[messages.length - 1]?.id ?? null;
  }, [messages]);

  useEffect(() => {
    void markConversationRead(conversationId);
  }, [conversationId]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, agentTyping, scrollToBottom]);

  const clearTypingTimer = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);

  const startWaitingForAgent = useCallback(() => {
    setAgentTyping(true);
    clearTypingTimer();
    // Safety: don't spin forever if the worker is down
    typingTimeoutRef.current = setTimeout(() => setAgentTyping(false), 90_000);
  }, [clearTypingTimer]);

  const stopWaitingForAgent = useCallback(() => {
    setAgentTyping(false);
    clearTypingTimer();
  }, [clearTypingTimer]);

  useEffect(() => () => clearTypingTimer(), [clearTypingTimer]);

  const mergeIncoming = useCallback(
    (incoming: ChatMessageDTO[]) => {
      if (!incoming.length) return;
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const add = incoming.filter((m) => !seen.has(m.id));
        if (!add.length) return prev;
        return [...prev, ...add].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      });
      if (incoming.some((m) => m.isAgent)) stopWaitingForAgent();
      void markConversationRead(conversationId);
    },
    [conversationId, stopWaitingForAgent],
  );

  // Live SSE for this conversation (browser auto-reconnects; polling covers missed events)
  useEffect(() => {
    const es = new EventSource(
      `/api/sse?conversationId=${encodeURIComponent(conversationId)}`,
    );
    const onChat = (ev: Event) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as {
          conversationId?: string;
          messageId?: string;
        };
        if (data.conversationId !== conversationId || !data.messageId) return;
        void (async () => {
          const msg = await getChatMessage(data.messageId!);
          if (msg) mergeIncoming([msg]);
        })();
      } catch {
        // ignore
      }
    };
    es.addEventListener("chat", onChat);
    return () => {
      es.removeEventListener("chat", onChat);
      es.close();
    };
  }, [conversationId, mergeIncoming]);

  // Poll fallback while agent is typing — SSE often misses across Next.js processes
  useEffect(() => {
    if (!agentTyping) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const newer = await pollConversationMessages(
          conversationId,
          lastMessageIdRef.current,
        );
        if (cancelled || !newer.length) return;
        mergeIncoming(newer);
      } catch {
        // ignore transient poll errors
      }
    };

    const immediate = setTimeout(() => void poll(), 600);
    const interval = setInterval(() => void poll(), 1800);
    return () => {
      cancelled = true;
      clearTimeout(immediate);
      clearInterval(interval);
    };
  }, [agentTyping, conversationId, mergeIncoming]);

  const onSent = useCallback(
    (message: ChatMessageDTO) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
      lastMessageIdRef.current = message.id;
      // Human message enqueues agent-run — show typing until agent SSE/poll arrives
      if (!message.isAgent) startWaitingForAgent();
    },
    [startWaitingForAgent],
  );

  // Stored mention tokens freeze the entity's name at send time — resolve
  // current names (doc/task renamed since, etc.) so chips never go stale.
  const mentionKeys = useMemo(() => {
    const seen = new Set<string>();
    for (const m of messages) {
      for (const t of extractMentionTokens(m.body.text ?? "")) {
        seen.add(`${t.type}:${t.id}`);
      }
    }
    return [...seen].sort();
  }, [messages]);
  const mentionKeysSignature = mentionKeys.join(",");

  useEffect(() => {
    if (!mentionKeys.length) return;
    let cancelled = false;
    void resolveMentionLabels(
      mentionKeys.map((k) => {
        const [type, id] = k.split(":") as [
          "user" | "task" | "space" | "doc" | "folder",
          string,
        ];
        return { type, id };
      }),
    ).then((resolved) => {
      if (!cancelled) setLabelOverrides((prev) => ({ ...prev, ...resolved }));
    });
    return () => {
      cancelled = true;
    };
    // Re-resolve only when the actual set of referenced entities changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionKeysSignature]);

  const groups = useMemo(() => {
    const out: { label: string; items: ChatMessageDTO[] }[] = [];
    for (const m of messages) {
      const label = dayLabel(m.createdAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(m);
      else out.push({ label, items: [m] });
    }
    return out;
  }, [messages]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-xl">
          {agentEmoji}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{agentName}</h1>
          {agentTitle && <p className="truncate text-xs text-muted-foreground">{agentTitle}</p>}
        </div>
        <div className="ml-auto flex gap-1 text-xs text-muted-foreground">
          <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">Chat</span>
          {isAdmin && agentSlug ? (
            <Link
              href={`/chat/agents/${agentSlug}/edit`}
              className="rounded-md px-2 py-1 hover:bg-muted hover:text-foreground"
            >
              Edit
            </Link>
          ) : (
            <span className="rounded-md px-2 py-1 opacity-50" title="Admins only">
              Edit
            </span>
          )}
          {isAdmin && agentSlug ? (
            <Link
              href={`/chat/agents/${agentSlug}/edit`}
              className="rounded-md px-2 py-1 hover:bg-muted hover:text-foreground"
            >
              Memories
            </Link>
          ) : (
            <span className="rounded-md px-2 py-1 opacity-50" title="Coming soon">
              Memories
            </span>
          )}
        </div>
      </header>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {messages.length === 0 && !agentTyping ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
            <span className="text-4xl">{agentEmoji}</span>
            <p className="text-sm font-medium text-foreground">Start a conversation</p>
            <p className="max-w-sm text-xs">
              Say hi or ask about your docs — {agentName} will reply like a teammate.
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.label}>
              <div className="sticky top-0 z-10 flex justify-center py-2">
                <span className="rounded-full border bg-background px-3 py-0.5 text-xs text-muted-foreground shadow-sm">
                  {g.label}
                </span>
              </div>
              {g.items.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isOwn={m.authorUserId === currentUserId && !m.isAgent}
                  labelOverrides={labelOverrides}
                />
              ))}
            </section>
          ))
        )}
        {agentTyping && <TypingIndicator agentName={agentName} agentEmoji={agentEmoji} />}
        <div ref={bottomRef} />
      </div>

      <ChatComposer conversationId={conversationId} agentName={agentName} onSent={onSent} />
    </div>
  );
}
