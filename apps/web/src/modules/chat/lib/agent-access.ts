/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { agentMembers, agents, db, users } from "@aitim/db";
import { and, eq } from "drizzle-orm";
import { parseAgentConfig } from "./agent-config";

export type AgentMemberRole = "owner" | "admin" | "member";

export type AgentAccess = {
  role: AgentMemberRole | null;
  /** Platform Super Admin */
  isPlatformAdmin: boolean;
  /** Chat / DM with this agent */
  canChat: boolean;
  /** Edit agent config, knowledge, people */
  canEdit: boolean;
  /** Owner-level (or platform admin): write docs, destructive ops */
  canManage: boolean;
};

async function platformIsAdmin(userId: string): Promise<boolean> {
  const [u] = await db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u?.platformRole === "admin";
}

export async function getAgentMembership(
  agentId: string,
  userId: string,
): Promise<{ role: AgentMemberRole } | null> {
  const [row] = await db
    .select({ role: agentMembers.role })
    .from(agentMembers)
    .where(and(eq(agentMembers.agentId, agentId), eq(agentMembers.userId, userId)))
    .limit(1);
  if (!row) return null;
  return { role: row.role as AgentMemberRole };
}

/**
 * Resolve what a user may do with an agent.
 * visibility in config: "all" (default) | "members" — who may chat.
 */
export async function getAgentAccess(
  agent: {
    id: string;
    createdById: string | null;
    isEnabled: boolean;
    config?: unknown;
  },
  userId: string,
): Promise<AgentAccess> {
  const isPlatformAdmin = await platformIsAdmin(userId);
  const membership = await getAgentMembership(agent.id, userId);
  let role = membership?.role ?? null;

  // Creator without a membership row still counts as owner
  if (!role && agent.createdById === userId) role = "owner";

  const config = parseAgentConfig(agent.config);
  const visibility = config.visibility === "members" ? "members" : "all";

  const canEdit =
    isPlatformAdmin || role === "owner" || role === "admin";
  const canManage = isPlatformAdmin || role === "owner";

  let canChat = false;
  if (agent.isEnabled) {
    if (isPlatformAdmin || canEdit) canChat = true;
    else if (visibility === "all") canChat = true;
    else canChat = role === "member" || role === "admin" || role === "owner";
  }

  return { role, isPlatformAdmin, canChat, canEdit, canManage };
}

export async function getAgentAccessBySlug(
  slug: string,
  userId: string,
): Promise<{ agent: typeof agents.$inferSelect; access: AgentAccess } | null> {
  const [agent] = await db.select().from(agents).where(eq(agents.slug, slug)).limit(1);
  if (!agent) return null;
  const access = await getAgentAccess(agent, userId);
  return { agent, access };
}

/** @deprecated name kept for write-tools — use getAgentAccess().canEdit / canManage */
export async function userIsAgentOwnerOrAdmin(
  userId: string,
  agent: { id: string; createdById: string | null; config?: unknown },
): Promise<boolean> {
  const access = await getAgentAccess(
    { id: agent.id, createdById: agent.createdById, isEnabled: true, config: agent.config },
    userId,
  );
  return access.canEdit;
}
