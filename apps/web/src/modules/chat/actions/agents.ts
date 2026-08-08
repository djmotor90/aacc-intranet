/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use server";

import { agentKnowledge, agentMembers, agentMemories, agents, db, users } from "@aitim/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { userCanCreateSuperAgent } from "@/lib/app-settings";
import { hasXaiKey, expandAgentBrief } from "@/lib/xai";
import { requireUser } from "@/lib/rbac";
import { getAgentAccess, type AgentMemberRole } from "../lib/agent-access";
import {
  DEFAULT_BUILD_MODEL,
  DEFAULT_CHAT_MODEL,
  defaultMemorySettings,
  defaultTriggers,
  parseAgentConfig,
  slugifyAgentName,
  type AgentConfig,
  type AgentMemorySettings,
  type AgentTriggers,
} from "../lib/agent-config";
import { extractMentionTokens } from "../lib/agent-mentions";

function revalidateAgentPaths(slug?: string) {
  revalidatePath("/chat");
  revalidatePath("/chat/agents");
  if (slug) {
    revalidatePath(`/chat/agents/${slug}/edit`);
  }
}

export async function expandBriefAction(brief: string, nameHint?: string) {
  const canCreate = await userCanCreateSuperAgent();
  if (!canCreate) {
    return { ok: false as const, error: "You don't have permission to create Super Agents." };
  }
  if (!brief.trim()) return { ok: false as const, error: "Describe what the agent should do." };
  const tokens = extractMentionTokens(brief);
  if (!hasXaiKey()) {
    // Offline fallback — still usable without xAI
    const name = nameHint?.trim() || "New Super Agent";
    return {
      ok: true as const,
      draft: {
        displayName: name,
        title: "Custom Super Agent",
        description: brief.trim().slice(0, 160),
        systemPrompt: `You are ${name}, a Super Agent for this intranet.\n\n## 🎯 Role and Objective\n${brief.trim()}\n\n## Guidelines\n- Be concise and actionable.\n- Use tools when they help answer the user.\n- Prefer listing concrete tasks with due dates when discussing work.`,
        suggestedTools: ["tasks.list_overdue", "tasks.search", "docs.search"],
        avatarEmoji: "📄",
        usedAi: false,
        knowledgeFromMentions: tokens
          .filter((t) => t.type === "doc" || t.type === "folder")
          .map((t) => ({
            sourceType: (t.type === "folder" ? "doc_folder" : "doc_page") as
              | "doc_page"
              | "doc_folder",
            sourceId: t.id,
            label: t.label,
          })),
      },
    };
  }
  try {
    const draft = await expandAgentBrief(brief.trim(), nameHint);
    return {
      ok: true as const,
      draft: {
        ...draft,
        usedAi: true,
        knowledgeFromMentions: tokens
          .filter((t) => t.type === "doc" || t.type === "folder")
          .map((t) => ({
            sourceType: (t.type === "folder" ? "doc_folder" : "doc_page") as
              | "doc_page"
              | "doc_folder",
            sourceId: t.id,
            label: t.label,
          })),
      },
    };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Failed to expand brief with AI",
    };
  }
}

export async function createSuperAgent(input: {
  displayName: string;
  title?: string;
  description?: string;
  avatarEmoji?: string;
  systemPrompt: string;
  creatorBrief?: string;
  tools?: string[];
  buildModel?: string;
  chatModel?: string;
  runtime?: "stub" | "xai";
}): Promise<{ ok: true; slug: string; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const canCreate = await userCanCreateSuperAgent(user.id);
  if (!canCreate) {
    return { ok: false, error: "You don't have permission to create Super Agents." };
  }
  const displayName = input.displayName.trim();
  if (!displayName) return { ok: false, error: "Name is required" };
  if (!input.systemPrompt.trim()) return { ok: false, error: "Instructions are required" };

  let slug = slugifyAgentName(displayName);
  // Ensure unique slug
  for (let i = 0; i < 8; i++) {
    const [existing] = await db.select({ id: agents.id }).from(agents).where(eq(agents.slug, slug)).limit(1);
    if (!existing) break;
    slug = `${slugifyAgentName(displayName)}-${i + 2}`;
  }

  const runtime =
    input.runtime ??
    (hasXaiKey() ? "xai" : (process.env.CHAT_AGENT_DEFAULT_RUNTIME as "stub" | "xai") || "stub");

  const config: AgentConfig = {
    creatorBrief: input.creatorBrief?.trim() || undefined,
    triggers: defaultTriggers(),
    memory: defaultMemorySettings(),
    // Default open chat; restrict via People tab → "members only"
    visibility: "all",
  };

  const [row] = await db
    .insert(agents)
    .values({
      slug,
      displayName,
      title: input.title?.trim() || null,
      description: input.description?.trim() || null,
      avatarEmoji: (input.avatarEmoji?.trim() || "🤖").slice(0, 8),
      systemPrompt: input.systemPrompt.trim(),
      tools: input.tools?.length
        ? input.tools
        : [
            "tasks.list_overdue",
            "docs.search",
            "docs.update",
            "memory.save",
            "conversation.search",
          ],
      runtime,
      buildModel: input.buildModel?.trim() || DEFAULT_BUILD_MODEL,
      chatModel: input.chatModel?.trim() || DEFAULT_CHAT_MODEL,
      model: input.chatModel?.trim() || DEFAULT_CHAT_MODEL,
      isEnabled: true,
      isSystem: false,
      createdById: user.id,
      config,
    })
    .returning({ id: agents.id, slug: agents.slug });

  // Creator is always owner on the roster
  await db.insert(agentMembers).values({
    agentId: row.id,
    userId: user.id,
    role: "owner",
    addedById: user.id,
  });

  // Auto-attach docs/folders tagged in the brief or instructions
  const mentionSources = extractMentionTokens(
    `${input.creatorBrief ?? ""}\n${input.systemPrompt}`,
  )
    .filter((t) => t.type === "doc" || t.type === "folder")
    .map((t) => ({
      agentId: row.id,
      sourceType: (t.type === "folder" ? "doc_folder" : "doc_page") as "doc_page" | "doc_folder",
      sourceId: t.id,
      label: t.label,
    }));
  if (mentionSources.length > 0) {
    // Dedupe by source
    const seen = new Set<string>();
    const unique = mentionSources.filter((s) => {
      const k = `${s.sourceType}:${s.sourceId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    await db.insert(agentKnowledge).values(unique);
  }

  revalidateAgentPaths(row.slug);
  return { ok: true, slug: row.slug, id: row.id };
}

export async function updateSuperAgent(input: {
  agentId: string;
  displayName?: string;
  title?: string | null;
  description?: string | null;
  avatarEmoji?: string;
  systemPrompt?: string;
  tools?: string[];
  buildModel?: string | null;
  chatModel?: string | null;
  runtime?: "stub" | "xai";
  isEnabled?: boolean;
  triggers?: Partial<AgentTriggers>;
  memory?: Partial<AgentMemorySettings>;
  visibility?: "all" | "members";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const [existing] = await db.select().from(agents).where(eq(agents.id, input.agentId)).limit(1);
  if (!existing) return { ok: false, error: "Agent not found" };
  const access = await getAgentAccess(existing, user.id);
  if (!access.canEdit) return { ok: false, error: "You cannot edit this agent" };

  const config = parseAgentConfig(existing.config);
  if (input.triggers) {
    config.triggers = { ...defaultTriggers(), ...config.triggers, ...input.triggers };
  }
  if (input.memory) {
    config.memory = { ...defaultMemorySettings(), ...config.memory, ...input.memory };
  }
  if (input.visibility) {
    config.visibility = input.visibility;
  }

  const [updated] = await db
    .update(agents)
    .set({
      displayName: input.displayName?.trim() || existing.displayName,
      title: input.title === undefined ? existing.title : input.title?.trim() || null,
      description:
        input.description === undefined ? existing.description : input.description?.trim() || null,
      avatarEmoji: input.avatarEmoji?.trim() || existing.avatarEmoji,
      systemPrompt: input.systemPrompt?.trim() ?? existing.systemPrompt,
      tools: input.tools ?? existing.tools,
      buildModel: input.buildModel === undefined ? existing.buildModel : input.buildModel,
      chatModel: input.chatModel === undefined ? existing.chatModel : input.chatModel,
      model: input.chatModel === undefined ? existing.model : input.chatModel,
      runtime: input.runtime ?? existing.runtime,
      isEnabled: input.isEnabled ?? existing.isEnabled,
      config,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, input.agentId))
    .returning({ slug: agents.slug });

  revalidateAgentPaths(updated.slug);
  return { ok: true };
}

export async function listAgentPeople(agentId: string) {
  const user = await requireUser();
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) throw new Error("Agent not found");
  const access = await getAgentAccess(agent, user.id);
  if (!access.canEdit && !access.canChat) throw new Error("Access denied");

  const rows = await db
    .select({
      userId: agentMembers.userId,
      role: agentMembers.role,
      createdAt: agentMembers.createdAt,
      displayName: users.displayName,
      email: users.email,
      photoKey: users.photoKey,
    })
    .from(agentMembers)
    .innerJoin(users, eq(users.id, agentMembers.userId))
    .where(eq(agentMembers.agentId, agentId))
    .orderBy(asc(agentMembers.role), asc(users.displayName));

  return rows.map((r) => ({
    userId: r.userId,
    role: r.role as AgentMemberRole,
    displayName: r.displayName,
    email: r.email,
    photoKey: r.photoKey,
    createdAt: r.createdAt,
  }));
}

export async function addAgentPerson(input: {
  agentId: string;
  userId: string;
  role: "admin" | "member";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireUser();
  const [agent] = await db.select().from(agents).where(eq(agents.id, input.agentId)).limit(1);
  if (!agent) return { ok: false, error: "Agent not found" };
  const access = await getAgentAccess(agent, actor.id);
  if (!access.canEdit) return { ok: false, error: "You cannot manage people on this agent" };

  if (input.role === "admin" && !access.canManage && !access.isPlatformAdmin) {
    return { ok: false, error: "Only the agent owner can add admins" };
  }

  const [target] = await db
    .select({ id: users.id, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!target?.isActive) return { ok: false, error: "User not found or inactive" };

  const existing = await db
    .select()
    .from(agentMembers)
    .where(and(eq(agentMembers.agentId, input.agentId), eq(agentMembers.userId, input.userId)))
    .limit(1);
  if (existing[0]) {
    if (existing[0].role === "owner") {
      return { ok: false, error: "This person is already the owner" };
    }
    await db
      .update(agentMembers)
      .set({ role: input.role })
      .where(and(eq(agentMembers.agentId, input.agentId), eq(agentMembers.userId, input.userId)));
  } else {
    await db.insert(agentMembers).values({
      agentId: input.agentId,
      userId: input.userId,
      role: input.role,
      addedById: actor.id,
    });
  }
  revalidateAgentPaths(agent.slug);
  return { ok: true };
}

export async function updateAgentPersonRole(input: {
  agentId: string;
  userId: string;
  role: "admin" | "member";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireUser();
  const [agent] = await db.select().from(agents).where(eq(agents.id, input.agentId)).limit(1);
  if (!agent) return { ok: false, error: "Agent not found" };
  const access = await getAgentAccess(agent, actor.id);
  if (!access.canManage && !access.isPlatformAdmin) {
    return { ok: false, error: "Only the owner can change roles" };
  }

  const [row] = await db
    .select()
    .from(agentMembers)
    .where(and(eq(agentMembers.agentId, input.agentId), eq(agentMembers.userId, input.userId)))
    .limit(1);
  if (!row) return { ok: false, error: "Person not on this agent" };
  if (row.role === "owner") return { ok: false, error: "Cannot change the owner role" };

  await db
    .update(agentMembers)
    .set({ role: input.role })
    .where(and(eq(agentMembers.agentId, input.agentId), eq(agentMembers.userId, input.userId)));
  revalidateAgentPaths(agent.slug);
  return { ok: true };
}

export async function removeAgentPerson(input: {
  agentId: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireUser();
  const [agent] = await db.select().from(agents).where(eq(agents.id, input.agentId)).limit(1);
  if (!agent) return { ok: false, error: "Agent not found" };
  const access = await getAgentAccess(agent, actor.id);
  if (!access.canEdit) return { ok: false, error: "You cannot manage people on this agent" };

  const [row] = await db
    .select()
    .from(agentMembers)
    .where(and(eq(agentMembers.agentId, input.agentId), eq(agentMembers.userId, input.userId)))
    .limit(1);
  if (!row) return { ok: false, error: "Person not on this agent" };
  if (row.role === "owner") return { ok: false, error: "Cannot remove the owner" };
  if (row.role === "admin" && !access.canManage && !access.isPlatformAdmin) {
    return { ok: false, error: "Only the owner can remove admins" };
  }

  await db
    .delete(agentMembers)
    .where(and(eq(agentMembers.agentId, input.agentId), eq(agentMembers.userId, input.userId)));
  revalidateAgentPaths(agent.slug);
  return { ok: true };
}

export async function listAgentMemories(agentId: string, limit = 80) {
  const user = await requireUser();
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) throw new Error("Agent not found");
  const access = await getAgentAccess(agent, user.id);
  if (!access.canEdit) throw new Error("Access denied");
  return db
    .select()
    .from(agentMemories)
    .where(and(eq(agentMemories.agentId, agentId), sql`${agentMemories.kind} <> 'recent'`))
    .orderBy(desc(agentMemories.updatedAt))
    .limit(limit);
}

export async function clearAgentMemories(
  agentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const [existing] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!existing) return { ok: false, error: "Agent not found" };
  const access = await getAgentAccess(existing, user.id);
  if (!access.canEdit) return { ok: false, error: "You cannot clear memory on this agent" };
  await db.delete(agentMemories).where(eq(agentMemories.agentId, agentId));
  revalidateAgentPaths(existing.slug);
  return { ok: true };
}

export async function createAgentMemory(input: {
  agentId: string;
  kind: "preference" | "fact" | "intelligence" | "procedure";
  content: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const [existing] = await db.select().from(agents).where(eq(agents.id, input.agentId)).limit(1);
  if (!existing) return { ok: false, error: "Agent not found" };
  const access = await getAgentAccess(existing, user.id);
  if (!access.canEdit) return { ok: false, error: "You cannot edit memory on this agent" };

  const { saveHotMemory } = await import("../lib/memory");
  const res = await saveHotMemory({
    agentId: input.agentId,
    userId: user.id,
    kind: input.kind,
    content: input.content,
  });
  if (!res.ok) return res;

  const [row] = await db
    .select({ id: agentMemories.id })
    .from(agentMemories)
    .where(
      and(eq(agentMemories.agentId, input.agentId), eq(agentMemories.content, input.content.trim().slice(0, 600))),
    )
    .orderBy(desc(agentMemories.createdAt))
    .limit(1);

  revalidateAgentPaths(existing.slug);
  return { ok: true, id: row?.id ?? "" };
}

export async function updateAgentMemory(input: {
  memoryId: string;
  content?: string;
  kind?: "preference" | "fact" | "intelligence" | "procedure";
  importance?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const [row] = await db
    .select()
    .from(agentMemories)
    .where(eq(agentMemories.id, input.memoryId))
    .limit(1);
  if (!row) return { ok: false, error: "Memory not found" };
  if (row.kind === "recent") return { ok: false, error: "Legacy chat-clone rows cannot be edited" };

  const [agent] = await db.select().from(agents).where(eq(agents.id, row.agentId)).limit(1);
  if (!agent) return { ok: false, error: "Agent not found" };
  const access = await getAgentAccess(agent, user.id);
  if (!access.canEdit) return { ok: false, error: "You cannot edit memory on this agent" };

  const content = input.content?.trim();
  if (content !== undefined) {
    if (!content) return { ok: false, error: "Content cannot be empty" };
    if (/^User:\s/i.test(content) && /Agent:\s/i.test(content)) {
      return { ok: false, error: "Do not store chat transcripts as memory" };
    }
  }

  const kind = input.kind ?? (row.kind as "preference" | "fact" | "intelligence" | "procedure");
  const userId = kind === "preference" ? (row.userId ?? user.id) : null;

  await db
    .update(agentMemories)
    .set({
      content: content !== undefined ? content.slice(0, 600) : row.content,
      kind,
      userId,
      importance: input.importance?.trim() || row.importance,
      updatedAt: new Date(),
    })
    .where(eq(agentMemories.id, input.memoryId));

  revalidateAgentPaths(agent.slug);
  return { ok: true };
}

export async function deleteAgentMemory(
  memoryId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const [row] = await db
    .select()
    .from(agentMemories)
    .where(eq(agentMemories.id, memoryId))
    .limit(1);
  if (!row) return { ok: false, error: "Memory not found" };

  const [agent] = await db.select().from(agents).where(eq(agents.id, row.agentId)).limit(1);
  if (!agent) return { ok: false, error: "Agent not found" };
  const access = await getAgentAccess(agent, user.id);
  if (!access.canEdit) return { ok: false, error: "You cannot delete memory on this agent" };

  await db.delete(agentMemories).where(eq(agentMemories.id, memoryId));
  revalidateAgentPaths(agent.slug);
  return { ok: true };
}

export async function setAgentKnowledge(input: {
  agentId: string;
  items: { sourceType: "doc_page" | "doc_folder"; sourceId: string; label?: string }[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const [existing] = await db.select().from(agents).where(eq(agents.id, input.agentId)).limit(1);
  if (!existing) return { ok: false, error: "Agent not found" };
  const access = await getAgentAccess(existing, user.id);
  if (!access.canEdit) return { ok: false, error: "You cannot edit knowledge on this agent" };

  await db.delete(agentKnowledge).where(eq(agentKnowledge.agentId, input.agentId));
  if (input.items.length > 0) {
    await db.insert(agentKnowledge).values(
      input.items.map((i) => ({
        agentId: input.agentId,
        sourceType: i.sourceType,
        sourceId: i.sourceId,
        label: i.label ?? null,
      })),
    );
  }
  revalidateAgentPaths(existing.slug);
  return { ok: true };
}

export async function xaiStatusAction() {
  await requireUser();
  return {
    configured: hasXaiKey(),
    defaultBuildModel: process.env.XAI_AGENT_BUILD_MODEL?.trim() || DEFAULT_BUILD_MODEL,
    defaultChatModel: process.env.XAI_AGENT_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL,
  };
}

/** Turn a Super Agent on/off in Chat (owners/admins). */
export async function setSuperAgentEnabled(input: {
  agentId: string;
  isEnabled: boolean;
}): Promise<{ ok: true; isEnabled: boolean } | { ok: false; error: string }> {
  const user = await requireUser();
  const [existing] = await db.select().from(agents).where(eq(agents.id, input.agentId)).limit(1);
  if (!existing) return { ok: false, error: "Agent not found" };
  const access = await getAgentAccess(existing, user.id);
  if (!access.canEdit) return { ok: false, error: "You cannot enable or disable this agent" };

  await db
    .update(agents)
    .set({ isEnabled: input.isEnabled, updatedAt: new Date() })
    .where(eq(agents.id, input.agentId));

  revalidateAgentPaths(existing.slug);
  revalidatePath("/chat");
  revalidatePath("/chat/agents");
  return { ok: true, isEnabled: input.isEnabled };
}

/**
 * Permanently delete a Super Agent (owner or Super Admin).
 * Cascades membership, knowledge, memories; conversations cascade from schema.
 * Seeded system agents can only be deleted by platform Super Admins.
 */
export async function deleteSuperAgent(input: {
  agentId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const [existing] = await db.select().from(agents).where(eq(agents.id, input.agentId)).limit(1);
  if (!existing) return { ok: false, error: "Agent not found" };
  const access = await getAgentAccess(existing, user.id);
  if (!access.canManage && !access.isPlatformAdmin) {
    return { ok: false, error: "Only the agent owner or a Super Admin can delete this agent" };
  }
  if (existing.isSystem && !access.isPlatformAdmin) {
    return {
      ok: false,
      error: "This is a system Super Agent. A Super Admin can delete it, or you can turn it off.",
    };
  }

  const slug = existing.slug;
  await db.delete(agents).where(eq(agents.id, input.agentId));

  revalidatePath("/chat");
  revalidatePath("/chat/agents");
  revalidatePath(`/chat/agents/${slug}/edit`);
  return { ok: true };
}
