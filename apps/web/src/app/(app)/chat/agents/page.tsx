/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { hasXaiKey } from "@/lib/xai";
import { Button } from "@/components/ui/button";
import { AgentHubCard } from "@/modules/chat/components/agent-hub-card";
import { getAgentAccess } from "@/modules/chat/lib/agent-access";
import { listAllAgents } from "@/modules/chat/queries";
import { userCanCreateSuperAgent } from "@/lib/app-settings";

export const metadata: Metadata = {
  title: "Super Agents",
  description: "Create and manage Super Agents",
};

export default async function AgentsHubPage() {
  const user = await requireUser();
  const canCreate = await userCanCreateSuperAgent(user.id);
  const all = await listAllAgents();
  const xai = hasXaiKey();

  const cards: {
    agent: (typeof all)[0];
    canChat: boolean;
    canEdit: boolean;
    canManage: boolean;
  }[] = [];
  for (const a of all) {
    const access = await getAgentAccess(a, user.id);
    if (!access.canChat && !access.canEdit) continue;
    if (!a.isEnabled && !access.canEdit) continue;
    cards.push({
      agent: a,
      canChat: access.canChat,
      canEdit: access.canEdit,
      canManage: access.canManage || access.isPlatformAdmin,
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Super Agents</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          AI teammates for AACC — chat with them, turn them off, or delete ones you own.
        </p>
        {!xai && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Live LLM replies need <code className="rounded bg-muted px-1">XAI_API_KEY</code> in
            your env.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {canCreate && (
          <Button asChild>
            <Link href="/chat/agents/new">Create Agent</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href="/chat">Open Chat</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ agent: a, canChat, canEdit, canManage }) => (
          <AgentHubCard
            key={a.id}
            agent={{
              id: a.id,
              slug: a.slug,
              displayName: a.displayName,
              title: a.title,
              description: a.description,
              avatarEmoji: a.avatarEmoji,
              isEnabled: a.isEnabled,
              isSystem: a.isSystem,
            }}
            canChat={canChat}
            canEdit={canEdit}
            canManage={canManage}
          />
        ))}
      </div>

      {cards.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          No Super Agents available to you yet.
        </p>
      )}
    </div>
  );
}
