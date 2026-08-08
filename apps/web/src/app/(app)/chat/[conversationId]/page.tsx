/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { ChatShell } from "@/modules/chat/components/chat-shell";
import { ConversationView } from "@/modules/chat/components/conversation-view";
import {
  getConversationForUser,
  listEnabledAgentsWithUserState,
  listMessages,
} from "@/modules/chat/queries";
import { userCanCreateSuperAgent } from "@/lib/app-settings";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const user = await requireUser();
  const [ctx, agents, messages, canCreateAgent] = await Promise.all([
    getConversationForUser(conversationId, user.id),
    listEnabledAgentsWithUserState(user.id),
    listMessages(conversationId),
    userCanCreateSuperAgent(user.id),
  ]);
  if (!ctx) notFound();

  const agentName = ctx.agent?.displayName ?? ctx.conversation.title ?? "Chat";
  const agentTitle = ctx.agent?.title ?? null;
  const agentEmoji = ctx.agent?.avatarEmoji ?? "💬";
  const isAdmin = user.platformRole === "admin";

  return (
    <ChatShell
      agents={agents}
      activeConversationId={conversationId}
      canCreateAgent={canCreateAgent}
    >
      <ConversationView
        key={conversationId}
        conversationId={conversationId}
        agentName={agentName}
        agentTitle={agentTitle}
        agentEmoji={agentEmoji}
        agentSlug={ctx.agent?.slug}
        isAdmin={isAdmin}
        currentUserId={user.id}
        initialMessages={messages}
      />
    </ChatShell>
  );
}
