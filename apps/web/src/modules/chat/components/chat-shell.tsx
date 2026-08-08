/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import { ChevronLeft, ChevronRight, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { openAgentConversation } from "../actions/conversations";
import type { AgentPublic } from "../lib/types";

const STORAGE_KEY = "aacc:chat-rail-collapsed";

export function ChatShell({
  agents,
  activeConversationId,
  canCreateAgent = false,
  children,
}: {
  agents: AgentPublic[];
  activeConversationId?: string | null;
  /** Whether the current user may create Super Agents (admin or allowed group). */
  canCreateAgent?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
      } catch {
        // ignore
      }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed, hydrated]);

  function openAgent(agent: AgentPublic) {
    if (agent.conversationId) {
      router.push(`/chat/${agent.conversationId}`);
      return;
    }
    startTransition(async () => {
      const { conversationId } = await openAgentConversation(agent.slug);
      router.push(`/chat/${conversationId}`);
    });
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden bg-background">
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col overflow-hidden border-r bg-muted/20 transition-[width] duration-200 ease-out",
          collapsed ? "w-14" : "w-64",
        )}
      >
        {/*
          Match app shell math: brand is h-28, top bar is h-14 —
          this rail header is also h-14 so its border-b lines up with the
          brand’s orange rule under “Operations Hub”.
        */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b",
            collapsed ? "justify-center px-1" : "gap-1 px-3",
          )}
        >
          {collapsed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => setCollapsed(false)}
              title="Expand Super Agents"
              aria-label="Expand Super Agents list"
              aria-expanded={false}
            >
              <ChevronRight className="size-4" />
            </Button>
          ) : (
            <>
              <div className="min-w-0 flex-1 leading-tight">
                <Link href="/chat" className="block text-sm font-semibold tracking-tight">
                  Chat
                </Link>
                <p className="truncate text-[11px] text-muted-foreground">
                  Super Agents & conversations
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => setCollapsed(true)}
                title="Minimize Super Agents"
                aria-label="Minimize Super Agents list"
                aria-expanded
              >
                <ChevronLeft className="size-4" />
              </Button>
            </>
          )}
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overflow-x-hidden",
            collapsed ? "p-1.5" : "p-2",
          )}
        >
          {!collapsed && (
            <div className="mb-1.5 flex items-center justify-between gap-1 px-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Super Agents
              </p>
              <div className="flex items-center gap-0.5">
                <Link
                  href="/chat/agents"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Super Agents hub"
                >
                  <Settings2 className="size-3.5" />
                </Link>
                {canCreateAgent && (
                  <Link
                    href="/chat/agents/new"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Create Super Agent"
                  >
                    <Plus className="size-3.5" />
                  </Link>
                )}
              </div>
            </div>
          )}
          {collapsed && canCreateAgent && (
            <Link
              href="/chat/agents/new"
              className="mb-1 flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Create Super Agent"
            >
              <Plus className="size-4" />
            </Link>
          )}
          {agents.length === 0 ? (
            !collapsed && (
              <p className="px-2 text-xs text-muted-foreground">No agents enabled yet.</p>
            )
          ) : (
            <ul className="space-y-0.5">
              {agents.map((a) => {
                const active =
                  activeConversationId && a.conversationId === activeConversationId;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => openAgent(a)}
                      title={
                        collapsed
                          ? `${a.displayName}${a.lastPreview ? ` — ${a.lastPreview}` : ""}`
                          : undefined
                      }
                      className={cn(
                        "flex w-full items-center rounded-md text-left text-sm transition-colors",
                        collapsed ? "justify-center p-1.5" : "gap-2 px-2 py-2",
                        active
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "relative flex shrink-0 items-center justify-center rounded-full bg-background text-base shadow-sm",
                          collapsed ? "size-9" : "size-8",
                        )}
                      >
                        {a.avatarEmoji}
                        {a.unread && (
                          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-background" />
                        )}
                      </span>
                      {!collapsed && (
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1">
                            <span className="truncate">{a.displayName}</span>
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {a.lastPreview ?? a.title ?? "Say hello"}
                          </span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
