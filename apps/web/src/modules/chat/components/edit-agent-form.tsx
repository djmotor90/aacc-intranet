/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import {
  BookOpen,
  Brain,
  Clock,
  MessageSquare,
  Power,
  Settings2,
  Sparkles,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  addAgentPerson,
  deleteSuperAgent,
  removeAgentPerson,
  setAgentKnowledge,
  setSuperAgentEnabled,
  updateAgentPersonRole,
  updateSuperAgent,
} from "../actions/agents";
import type { AgentMemberRole } from "../lib/agent-access";
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_BUILD_MODEL,
  DEFAULT_CHAT_MODEL,
  TOOL_CATALOG,
  mergeMemorySettings,
  mergeTriggers,
  parseAgentConfig,
  type AgentMemorySettings,
} from "../lib/agent-config";
import { AgentInstructionEditor } from "./agent-instruction-editor";
import { AgentMemoryPanel } from "./agent-memory-panel";

type AgentRow = {
  id: string;
  slug: string;
  displayName: string;
  title: string | null;
  description: string | null;
  avatarEmoji: string;
  systemPrompt: string;
  tools: unknown;
  runtime: string;
  buildModel: string | null;
  chatModel: string | null;
  model: string | null;
  isEnabled: boolean;
  isSystem?: boolean;
  config: unknown;
};

type KnowledgeItem = {
  sourceType: "doc_page" | "doc_folder";
  sourceId: string;
  label: string | null;
};

type DocOption = {
  id: string;
  type: "doc_page" | "doc_folder";
  label: string;
  subtitle: string;
};

type MemoryRow = {
  id: string;
  kind: string;
  content: string;
  userId: string | null;
  updatedAt: Date | string;
};

type PersonRow = {
  userId: string;
  role: AgentMemberRole;
  displayName: string;
  email: string | null;
  photoKey: string | null;
};

type DirectoryUser = {
  id: string;
  displayName: string;
  email: string | null;
  photoKey: string | null;
};

type TabId = "instructions" | "people" | "triggers" | "skills" | "knowledge" | "memory";

const TABS: { id: TabId; label: string; icon: typeof BookOpen }[] = [
  { id: "instructions", label: "Instructions", icon: BookOpen },
  { id: "people", label: "People", icon: Users },
  { id: "triggers", label: "Triggers", icon: MessageSquare },
  { id: "skills", label: "Skills", icon: Wrench },
  { id: "knowledge", label: "Knowledge", icon: Sparkles },
  { id: "memory", label: "Memory", icon: Brain },
];

export function EditAgentForm({
  agent,
  knowledge,
  docOptions,
  memories,
  people: initialPeople,
  directory,
  canManage,
  xaiConfigured,
}: {
  agent: AgentRow;
  knowledge: KnowledgeItem[];
  docOptions: DocOption[];
  memories: MemoryRow[];
  people: PersonRow[];
  directory: DirectoryUser[];
  canManage: boolean;
  xaiConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("instructions");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteName, setDeleteName] = useState("");

  const initialTools = useMemo(() => {
    return Array.isArray(agent.tools) ? (agent.tools as string[]) : [];
  }, [agent.tools]);

  const initialTriggers = useMemo(
    () => mergeTriggers(parseAgentConfig(agent.config)),
    [agent.config],
  );
  const initialMemory = useMemo(
    () => mergeMemorySettings(parseAgentConfig(agent.config)),
    [agent.config],
  );

  const [displayName, setDisplayName] = useState(agent.displayName);
  const [title, setTitle] = useState(agent.title ?? "");
  const [description, setDescription] = useState(agent.description ?? "");
  const [avatarEmoji, setAvatarEmoji] = useState(agent.avatarEmoji);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);
  const [tools, setTools] = useState<string[]>(initialTools);
  const [runtime, setRuntime] = useState<"stub" | "xai">(
    agent.runtime === "xai" ? "xai" : "stub",
  );
  const [buildModel, setBuildModel] = useState(agent.buildModel || DEFAULT_BUILD_MODEL);
  const [chatModel, setChatModel] = useState(
    agent.chatModel || agent.model || DEFAULT_CHAT_MODEL,
  );
  const [isEnabled, setIsEnabled] = useState(agent.isEnabled);
  const [triggers, setTriggers] = useState(initialTriggers);
  const [memory, setMemory] = useState<AgentMemorySettings>(initialMemory);
  const [selectedKnowledge, setSelectedKnowledge] = useState<string[]>(
    knowledge.map((k) => `${k.sourceType}:${k.sourceId}`),
  );
  const [people, setPeople] = useState(initialPeople);
  const [visibility, setVisibility] = useState<"all" | "members">(
    parseAgentConfig(agent.config).visibility === "members" ? "members" : "all",
  );
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "member">("member");

  function toggleTool(id: string) {
    setTools((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  function toggleKnowledge(key: string) {
    setSelectedKnowledge((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function onToggleEnabled() {
    if (pending) return;
    setError(null);
    setSaved(false);
    const next = !isEnabled;
    startTransition(async () => {
      const res = await setSuperAgentEnabled({ agentId: agent.id, isEnabled: next });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setIsEnabled(res.isEnabled);
      setSaved(true);
      router.refresh();
    });
  }

  function onDelete() {
    if (pending) return;
    if (deleteName.trim() !== agent.displayName) {
      setError(`Type “${agent.displayName}” exactly to confirm delete.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteSuperAgent({ agentId: agent.id });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/chat/agents");
      router.refresh();
    });
  }

  function onSave() {
    if (pending) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateSuperAgent({
        agentId: agent.id,
        displayName,
        title,
        description,
        avatarEmoji,
        systemPrompt,
        tools,
        runtime,
        buildModel,
        chatModel,
        isEnabled,
        triggers,
        memory,
        visibility,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const items = selectedKnowledge.map((key) => {
        const [sourceType, sourceId] = key.split(":") as ["doc_page" | "doc_folder", string];
        const opt = docOptions.find((d) => d.type === sourceType && d.id === sourceId);
        return { sourceType, sourceId, label: opt?.label };
      });
      const kRes = await setAgentKnowledge({ agentId: agent.id, items });
      if (!kRes.ok) {
        setError(kRes.error);
        return;
      }
      setSaved(true);
    });
  }

  function onAddPerson() {
    if (!addUserId) return;
    startTransition(async () => {
      const res = await addAgentPerson({
        agentId: agent.id,
        userId: addUserId,
        role: addRole,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const u = directory.find((d) => d.id === addUserId);
      if (u) {
        setPeople((prev) => {
          const without = prev.filter((p) => p.userId !== u.id);
          return [
            ...without,
            {
              userId: u.id,
              role: addRole,
              displayName: u.displayName,
              email: u.email,
              photoKey: u.photoKey,
            },
          ].sort((a, b) => a.displayName.localeCompare(b.displayName));
        });
      }
      setAddUserId("");
      setError(null);
    });
  }

  function onChangeRole(userId: string, role: "admin" | "member") {
    startTransition(async () => {
      const res = await updateAgentPersonRole({ agentId: agent.id, userId, role });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPeople((prev) => prev.map((p) => (p.userId === userId ? { ...p, role } : p)));
    });
  }

  function onRemovePerson(userId: string) {
    startTransition(async () => {
      const res = await removeAgentPerson({ agentId: agent.id, userId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPeople((prev) => prev.filter((p) => p.userId !== userId));
    });
  }

  const directoryAvailable = directory.filter(
    (d) => !people.some((p) => p.userId === d.id),
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-0 pb-16">
      {/* AACC Hub agent profile header. */}
      <div className="border-b bg-gradient-to-b from-muted/40 to-background px-6 pb-5 pt-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-background text-4xl shadow-sm ring-2 ring-border">
            {avatarEmoji}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="h-9 max-w-xs border-transparent bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:border-input focus-visible:bg-background focus-visible:px-2"
              />
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Super Agent
              </span>
            </div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="One-line role"
              className="h-8 max-w-md border-transparent bg-transparent px-0 text-sm text-muted-foreground shadow-none focus-visible:border-input focus-visible:bg-background focus-visible:px-2"
            />
            <p className="text-xs text-muted-foreground">
              <span
                className={cn(
                  "mr-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  isEnabled
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {isEnabled ? "On" : "Off"}
              </span>
              Runtime <span className="font-medium text-foreground">{runtime}</span>
              {xaiConfigured ? "" : " · add XAI_API_KEY for live replies"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={isEnabled ? "outline" : "default"}
              onClick={onToggleEnabled}
              className={cn(pending && "pointer-events-none opacity-50")}
            >
              <Power className="mr-1.5 size-3.5" />
              {isEnabled ? "Turn off" : "Turn on"}
            </Button>
            {isEnabled && (
              <Button asChild size="sm">
                <Link href={`/chat/agents/${agent.slug}/chat`}>Ask</Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link href="/chat/agents">All agents</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onSave}
              className={cn(pending && "pointer-events-none opacity-50")}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        {saved && (
          <p className="mt-3 text-sm text-emerald-600">Saved — agent will use the new setup on the next chat.</p>
        )}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-6 px-6 py-6">
        {tab === "instructions" && (
          <>
            <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-lg">🎯</span>
                <h2 className="text-sm font-semibold">Role and instructions</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                What should the agent do when it runs? Tag entities with @ (person), @@ (task), @@@
                (workspace), @@@@ (doc), @@@@@ (folder).
              </p>
              <AgentInstructionEditor
                minHeightClass="min-h-[320px]"
                value={systemPrompt}
                onChange={setSystemPrompt}
                placeholder="## 🎯 Role and Objective&#10;You are…"
              />
            </section>

            <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="text-sm font-semibold">Profile</h2>
              <div className="grid gap-3 sm:grid-cols-[5rem_1fr]">
                <div>
                  <Label>Emoji</Label>
                  <Input
                    className="mt-1 text-center text-xl"
                    value={avatarEmoji}
                    onChange={(e) => setAvatarEmoji(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    className="mt-1"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
              <label className="flex items-start gap-3 rounded-xl border bg-muted/20 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Enabled in Chat</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    When off, this agent is hidden from Chat for everyone and cannot start new
                    conversations. You can still edit it here. Save to apply, or use Turn off above
                    for an instant change.
                  </span>
                </span>
              </label>
            </section>

            <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Settings2 className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Models</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Stronger model to <strong>build</strong> instructions; cheaper for{" "}
                <strong>conversation</strong>.
              </p>
              <div>
                <Label>Runtime</Label>
                <select
                  className="mt-1 flex h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={runtime}
                  onChange={(e) => setRuntime(e.target.value as "stub" | "xai")}
                >
                  <option value="stub">Stub (rules only)</option>
                  <option value="xai" disabled={!xaiConfigured}>
                    xAI {xaiConfigured ? "" : "(needs XAI_API_KEY)"}
                  </option>
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Build model</Label>
                  <select
                    className="mt-1 flex h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={buildModel}
                    onChange={(e) => setBuildModel(e.target.value)}
                  >
                    {CHAT_MODEL_OPTIONS.filter((m) => m.id !== "stub").map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Chat model</Label>
                  <select
                    className="mt-1 flex h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={chatModel}
                    onChange={(e) => setChatModel(e.target.value)}
                  >
                    {CHAT_MODEL_OPTIONS.filter((m) => m.id !== "stub").map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>
          </>
        )}

        {tab === "people" && (
          <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold">People</h2>
            <p className="text-xs text-muted-foreground">
              <strong>Members</strong> can chat with this agent.
              <strong> Admins</strong> can also edit instructions, knowledge, and tools.
              <strong> Owner</strong> has full control (cannot be removed).
            </p>

            <div className="rounded-xl border px-4 py-3">
              <Label className="text-sm font-medium">Who can open a chat?</Label>
              <div className="mt-2 flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="visibility"
                    checked={visibility === "all"}
                    onChange={() => setVisibility("all")}
                  />
                  Everyone signed in (default)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="visibility"
                    checked={visibility === "members"}
                    onChange={() => setVisibility("members")}
                  />
                  Only people on this roster
                </label>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Save the agent to apply visibility changes.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2 rounded-xl border p-3">
              <div className="min-w-[12rem] flex-1">
                <Label>Add person</Label>
                <select
                  className="mt-1 flex h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                >
                  <option value="">Select user…</option>
                  {directoryAvailable.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                      {u.email ? ` (${u.email})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Role</Label>
                <select
                  className="mt-1 flex h-9 rounded-md border bg-background px-2 text-sm"
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as "admin" | "member")}
                >
                  <option value="member">Member (chat)</option>
                  <option value="admin" disabled={!canManage}>
                    Admin (edit)
                  </option>
                </select>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={onAddPerson}
                className={cn((pending || !addUserId) && "pointer-events-none opacity-50")}
              >
                Add
              </Button>
            </div>

            <ul className="divide-y rounded-xl border">
              {people.length === 0 ? (
                <li className="px-4 py-3 text-sm text-muted-foreground">No people yet.</li>
              ) : (
                people.map((p) => (
                  <li key={p.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <UserAvatar
                      userId={p.userId}
                      name={p.displayName}
                      hasPhoto={!!p.photoKey}
                      photoVersion={p.photoKey}
                      className="size-9"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.displayName}</p>
                      {p.email && (
                        <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                      )}
                    </div>
                    {p.role === "owner" ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                        Owner
                      </span>
                    ) : (
                      <select
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                        value={p.role}
                        disabled={!canManage || pending}
                        onChange={(e) =>
                          onChangeRole(p.userId, e.target.value as "admin" | "member")
                        }
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                    {p.role !== "owner" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={cn(pending && "pointer-events-none opacity-50")}
                        onClick={() => onRemovePerson(p.userId)}
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                ))
              )}
            </ul>
          </section>
        )}

        {tab === "triggers" && (
          <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold">When should this agent run?</h2>
            <p className="text-xs text-muted-foreground">
              Manual triggers for chat. Scheduled runs can be wired next.
            </p>
            {(
              [
                ["mention", "Mention", "Someone @mentions this agent"],
                ["directMessage", "Direct message", "Someone opens a DM with this agent"],
                ["scheduleEnabled", "Scheduled", "Run on a calendar schedule"],
              ] as const
            ).map(([key, label, hint]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
              >
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </span>
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={triggers[key]}
                  onChange={(e) => setTriggers((t) => ({ ...t, [key]: e.target.checked }))}
                />
              </label>
            ))}
            {triggers.scheduleEnabled && (
              <div>
                <Label className="flex items-center gap-1.5">
                  <Clock className="size-3.5" /> Schedule label
                </Label>
                <Input
                  className="mt-1"
                  value={triggers.scheduleLabel}
                  onChange={(e) =>
                    setTriggers((t) => ({ ...t, scheduleLabel: e.target.value }))
                  }
                  placeholder="Every weekday at 8:00 AM"
                />
              </div>
            )}
          </section>
        )}

        {tab === "skills" && (
          <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Skills / tools</h2>
            <p className="text-xs text-muted-foreground">
              What actions can this agent take in AACC Hub?
            </p>
            <ul className="space-y-2">
              {TOOL_CATALOG.map((t) => (
                <li key={t.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={tools.includes(t.id)}
                      onChange={() => toggleTool(t.id)}
                    />
                    <span>
                      <span className="font-medium">{t.label}</span>
                      <span className="block text-xs text-muted-foreground">{t.description}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === "knowledge" && (
          <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Knowledge</h2>
            <p className="text-xs text-muted-foreground">
              What can this agent access? Docs pages and folders are injected into chat context.
              Docs tagged with @@@@ / @@@@@ in the brief are attached automatically on create.
            </p>
            {docOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No docs yet — create pages under Docs first.
              </p>
            ) : (
              <ul className="max-h-80 space-y-1 overflow-y-auto rounded-xl border p-2">
                {docOptions.map((d) => {
                  const key = `${d.type}:${d.id}`;
                  return (
                    <li key={key}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted/60">
                        <input
                          type="checkbox"
                          checked={selectedKnowledge.includes(key)}
                          onChange={() => toggleKnowledge(key)}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{d.label}</span>
                        <span className="text-[11px] text-muted-foreground">{d.subtitle}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {tab === "memory" && (
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <AgentMemoryPanel
              agentId={agent.id}
              initialRows={memories}
              memoryToggles={memory}
              onTogglesChange={setMemory}
            />
          </section>
        )}

        <div className="flex items-center gap-3 border-t pt-4">
          <Button
            type="button"
            onClick={onSave}
            className={cn(pending && "pointer-events-none opacity-50")}
          >
            {pending ? "Saving…" : "Save Super Agent"}
          </Button>
          {saved && <span className="text-sm text-emerald-600">Saved</span>}
        </div>

        {/* Danger zone — disable / delete */}
        <section className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Trash2 className="size-4 text-destructive" />
            <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Turning off hides the agent from Chat but keeps history and settings. Delete removes the
            agent permanently (conversations and memory go with it).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onToggleEnabled}
              className={cn(pending && "pointer-events-none opacity-50")}
            >
              <Power className="mr-1.5 size-3.5" />
              {isEnabled ? "Turn off agent" : "Turn on agent"}
            </Button>
            {canManage && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  setConfirmDelete((v) => !v);
                  setDeleteName("");
                  setError(null);
                }}
                className={cn(pending && "pointer-events-none opacity-50")}
              >
                <Trash2 className="mr-1.5 size-3.5" />
                Delete Super Agent
              </Button>
            )}
          </div>
          {canManage && confirmDelete && (
            <div className="space-y-3 rounded-xl border border-destructive/40 bg-background p-4">
              <p className="text-sm text-foreground">
                Type <strong>{agent.displayName}</strong> to confirm permanent deletion.
                {agent.isSystem
                  ? " This is a system agent — only Super Admins can delete it."
                  : null}
              </p>
              <Input
                value={deleteName}
                onChange={(e) => setDeleteName(e.target.value)}
                placeholder={agent.displayName}
                autoComplete="off"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={onDelete}
                  className={cn(
                    (pending || deleteName.trim() !== agent.displayName) &&
                      "pointer-events-none opacity-50",
                  )}
                >
                  {pending ? "Deleting…" : "Yes, delete forever"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConfirmDelete(false);
                    setDeleteName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {!canManage && (
            <p className="text-xs text-muted-foreground">
              Only the agent owner (or a Super Admin) can permanently delete this agent. You can
              still turn it off if you have edit access.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
