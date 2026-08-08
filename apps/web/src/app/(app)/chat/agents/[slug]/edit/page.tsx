/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { notFound, redirect } from "next/navigation";
import { listPickerUsers } from "@/lib/directory-users";
import { hasXaiKey } from "@/lib/xai";
import { requireUser } from "@/lib/rbac";
import {
  listAgentMemories,
  listAgentPeople,
} from "@/modules/chat/actions/agents";
import { EditAgentForm } from "@/modules/chat/components/edit-agent-form";
import { getAgentAccess } from "@/modules/chat/lib/agent-access";
import { listDocPickerOptions } from "@/modules/chat/lib/knowledge";
import { getAgentBySlug, getAgentKnowledge } from "@/modules/chat/queries";

export default async function EditAgentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const agent = await getAgentBySlug(slug);
  if (!agent) notFound();

  const access = await getAgentAccess(agent, user.id);
  if (!access.canEdit) redirect("/chat/agents");

  const [knowledge, docOptions, memories, people, directory] = await Promise.all([
    getAgentKnowledge(agent.id),
    listDocPickerOptions(),
    listAgentMemories(agent.id),
    listAgentPeople(agent.id),
    listPickerUsers(),
  ]);

  return (
    <EditAgentForm
      agent={{
        id: agent.id,
        slug: agent.slug,
        displayName: agent.displayName,
        title: agent.title,
        description: agent.description,
        avatarEmoji: agent.avatarEmoji,
        systemPrompt: agent.systemPrompt,
        tools: agent.tools,
        runtime: agent.runtime,
        buildModel: agent.buildModel,
        chatModel: agent.chatModel,
        model: agent.model,
        isEnabled: agent.isEnabled,
        isSystem: agent.isSystem,
        config: agent.config,
      }}
      knowledge={knowledge.map((k) => ({
        sourceType: k.sourceType,
        sourceId: k.sourceId,
        label: k.label,
      }))}
      docOptions={docOptions}
      memories={memories.map((m) => ({
        id: m.id,
        kind: m.kind,
        content: m.content,
        userId: m.userId,
        updatedAt: m.updatedAt,
      }))}
      people={people}
      directory={directory.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        photoKey: u.photoKey,
      }))}
      canManage={access.canManage || access.isPlatformAdmin}
      xaiConfigured={hasXaiKey()}
    />
  );
}
