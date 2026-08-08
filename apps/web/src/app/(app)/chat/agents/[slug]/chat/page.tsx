/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { openAgentConversation } from "@/modules/chat/actions/conversations";
import { getAgentBySlug } from "@/modules/chat/queries";

/** Deep link: open or create DM with this agent. */
export default async function AgentChatRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const agent = await getAgentBySlug(slug);
  if (!agent || !agent.isEnabled) notFound();
  const { conversationId } = await openAgentConversation(slug);
  redirect(`/chat/${conversationId}`);
}
