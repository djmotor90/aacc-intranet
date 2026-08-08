/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */

/** Defaults: stronger for build, cheaper for chat (xAI pricing). */
export const DEFAULT_BUILD_MODEL = "grok-4.5";
export const DEFAULT_CHAT_MODEL = "grok-4.3";

export const CHAT_MODEL_OPTIONS = [
  { id: "grok-4.5", label: "Grok 4.5 (smartest)", tier: "premium" as const },
  { id: "grok-4.3", label: "Grok 4.3 (balanced)", tier: "standard" as const },
  {
    id: "grok-4.20-0309-non-reasoning",
    label: "Grok 4.20 non-reasoning (fast/cheap)",
    tier: "economy" as const,
  },
  { id: "stub", label: "Stub (no LLM)", tier: "offline" as const },
];

export const TOOL_CATALOG: {
  id: string;
  label: string;
  description: string;
}[] = [
  {
    id: "tasks.list_overdue",
    label: "List overdue tasks",
    description: "Find open past-due tasks for the person chatting.",
  },
  {
    id: "tasks.search",
    label: "Search tasks",
    description: "Search task titles/numbers the user can access (when wired).",
  },
  {
    id: "docs.search",
    label: "Search linked docs",
    description: "Read knowledge pages/folders attached to this agent.",
  },
  {
    id: "docs.update",
    label: "Update linked docs",
    description:
      "Owner/admin only: append (default) or carefully replace Markdown on linked Knowledge docs — converted to TipTap. Guardrails block accidental wipes.",
  },
  {
    id: "memory.save",
    label: "Save memory from chat",
    description:
      "Owner/admin only: store preferences, facts, or when→do procedures (no chat dumps, no secrets).",
  },
  {
    id: "conversation.search",
    label: "Search past conversations",
    description:
      "On-demand cold recall: find snippets from prior DMs with this agent (saves tokens vs replaying full history).",
  },
];

export type AgentTriggers = {
  mention: boolean;
  directMessage: boolean;
  scheduleEnabled: boolean;
  /** Cron-like label for UI; worker scheduling is Phase 1.5 */
  scheduleLabel: string;
};

/**
 * Memory toggles (Hermes/OpenClaw-aligned).
 * - recent → conversation continuity (rolling summary + short window), NOT chat clones
 * - preferences → USER hot block
 * - intelligence → AGENT facts/lessons + auto-extract
 * - procedures → when→do playbooks on the prompt
 */
export type AgentMemorySettings = {
  /**
   * Conversation continuity: rolling summary of older turns + short raw window.
   * (Config key kept as `recent` for backwards compatibility.)
   */
  recent: boolean;
  /** Explicit preferences the human teaches the agent (USER hot memory) */
  preferences: boolean;
  /** Durable facts / lessons + auto-extract (AGENT hot memory) */
  intelligence: boolean;
  /** Playbooks / command flows injected as PROCEDURE hot memory */
  procedures: boolean;
};

export type AgentConfig = {
  triggers?: Partial<AgentTriggers>;
  creatorBrief?: string;
  /**
   * Who may open a chat with this agent:
   * - all (default): any signed-in user
   * - members: only people on the agent roster (owner/admin/member)
   */
  visibility?: "all" | "members";
  memory?: Partial<AgentMemorySettings>;
};

export function parseAgentConfig(raw: unknown): AgentConfig {
  if (!raw || typeof raw !== "object") return {};
  return raw as AgentConfig;
}

export function defaultTriggers(): AgentTriggers {
  return {
    mention: true,
    directMessage: true,
    scheduleEnabled: false,
    scheduleLabel: "Every weekday at 8:00 AM",
  };
}

export function defaultMemorySettings(): AgentMemorySettings {
  return {
    recent: true,
    preferences: true,
    intelligence: true,
    procedures: true,
  };
}

export function mergeTriggers(config: AgentConfig): AgentTriggers {
  const d = defaultTriggers();
  return {
    mention: config.triggers?.mention ?? d.mention,
    directMessage: config.triggers?.directMessage ?? d.directMessage,
    scheduleEnabled: config.triggers?.scheduleEnabled ?? d.scheduleEnabled,
    scheduleLabel: config.triggers?.scheduleLabel ?? d.scheduleLabel,
  };
}

export function mergeMemorySettings(config: AgentConfig): AgentMemorySettings {
  const d = defaultMemorySettings();
  return {
    recent: config.memory?.recent ?? d.recent,
    preferences: config.memory?.preferences ?? d.preferences,
    intelligence: config.memory?.intelligence ?? d.intelligence,
    // Default on for new agents; respect explicit false when set
    procedures: config.memory?.procedures ?? d.procedures,
  };
}

export function slugifyAgentName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "agent";
}
