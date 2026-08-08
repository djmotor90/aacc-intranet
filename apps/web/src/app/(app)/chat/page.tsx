/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { Metadata } from "next";
import { requireUser } from "@/lib/rbac";
import { ChatShell } from "@/modules/chat/components/chat-shell";
import { listEnabledAgentsWithUserState } from "@/modules/chat/queries";
import { userCanCreateSuperAgent } from "@/lib/app-settings";

export const metadata: Metadata = {
  title: "Chat",
  description: "Talk with Super Agents and teammates",
};

export default async function ChatPage() {
  const user = await requireUser();
  const [agents, canCreateAgent] = await Promise.all([
    listEnabledAgentsWithUserState(user.id),
    userCanCreateSuperAgent(user.id),
  ]);

  return (
    <ChatShell agents={agents} canCreateAgent={canCreateAgent}>
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden p-8 text-center">
        <span className="text-5xl">💬</span>
        <h2 className="text-lg font-semibold">Super Agents</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Pick an agent on the left to open a private chat — same idea as ClickUp Super Agents.
          They can surface overdue work and keep you moving.
        </p>
      </div>
    </ChatShell>
  );
}
