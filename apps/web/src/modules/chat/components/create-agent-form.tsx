/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createSuperAgent, expandBriefAction } from "../actions/agents";
import { TOOL_CATALOG } from "../lib/agent-config";
import { AgentInstructionEditor } from "./agent-instruction-editor";

export function CreateAgentForm({ xaiConfigured }: { xaiConfigured: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [avatarEmoji, setAvatarEmoji] = useState("🤖");
  const [tools, setTools] = useState<string[]>([
    "tasks.list_overdue",
    "docs.search",
    "conversation.search",
  ]);
  const [expanded, setExpanded] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  // Do not use the HTML `disabled` attribute for dynamic enablement — React 19
  // SSR often emits disabled={null} while the client emits disabled={true},
  // which triggers a hydration mismatch. Gate with aria-disabled + styles.
  const buildBlocked = pending || brief.trim().length === 0;
  const createBlocked = pending || displayName.trim().length === 0;

  function toggleTool(id: string) {
    setTools((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  function onExpand() {
    if (pending || brief.trim().length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await expandBriefAction(brief, displayName || undefined);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDisplayName(res.draft.displayName);
      setTitle(res.draft.title);
      setDescription(res.draft.description);
      setSystemPrompt(res.draft.systemPrompt);
      setAvatarEmoji(res.draft.avatarEmoji);
      if (res.draft.suggestedTools.length) setTools(res.draft.suggestedTools);
      setExpanded(true);
      setAiNote(
        res.draft.usedAi
          ? "Instructions drafted with xAI (build model). Review and save."
          : "XAI_API_KEY not set — drafted offline. Add a key for smarter builds.",
      );
    });
  }

  function onCreate() {
    if (pending || displayName.trim().length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await createSuperAgent({
        displayName,
        title,
        description,
        avatarEmoji,
        systemPrompt: systemPrompt || brief,
        creatorBrief: brief,
        tools,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/chat/agents/${res.slug}/edit`);
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Super Agents
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Create Super Agent</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Describe what it should do — like ClickUp. We&apos;ll turn that into instructions you can
          edit anytime.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <Label htmlFor="brief">Tell your Super Agent what to tackle</Label>
        <div className="mt-2">
          <AgentInstructionEditor
            id="brief"
            minHeightClass="min-h-[120px]"
            placeholder="e.g. Every morning, find overdue tasks assigned to @me, sort oldest first… Use @ for people, @@ for tasks, @@@ workspaces, @@@@ docs, @@@@@ folders."
            value={brief}
            onChange={setBrief}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={onExpand}
            className={cn(buildBlocked && "pointer-events-none opacity-50")}
          >
            <Sparkles className="mr-1.5 size-4" />
            {pending ? "Building…" : "Build instructions"}
          </Button>
          {!xaiConfigured && (
            <span className="text-xs text-muted-foreground">
              Tip: set <code className="rounded bg-muted px-1">XAI_API_KEY</code> for AI-assisted
              builds
            </span>
          )}
        </div>
      </div>

      {(expanded || systemPrompt) && (
        <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
          {aiNote && <p className="text-xs text-muted-foreground">{aiNote}</p>}
          <div className="grid gap-3 sm:grid-cols-[4rem_1fr]">
            <div>
              <Label htmlFor="emoji">Emoji</Label>
              <Input
                id="emoji"
                className="mt-1 text-center text-xl"
                value={avatarEmoji}
                onChange={(e) => setAvatarEmoji(e.target.value)}
                maxLength={4}
              />
            </div>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                className="mt-1"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Deadline Dale"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              className="mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Daily overdue task alerts"
            />
          </div>
          <div>
            <Label htmlFor="desc">Description</Label>
            <Input
              id="desc"
              className="mt-1"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="prompt">Instructions</Label>
            <div className="mt-1">
              <AgentInstructionEditor
                id="prompt"
                minHeightClass="min-h-[200px]"
                placeholder="Full agent instructions. Tag people with @, tasks with @@, spaces with @@@, docs with @@@@, folders with @@@@@…"
                value={systemPrompt}
                onChange={setSystemPrompt}
              />
            </div>
          </div>
          <div>
            <Label>Tools</Label>
            <ul className="mt-2 space-y-2">
              {TOOL_CATALOG.map((t) => (
                <li key={t.id}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
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
          </div>
          <Button
            type="button"
            onClick={onCreate}
            className={cn(createBlocked && "pointer-events-none opacity-50")}
          >
            {pending ? "Creating…" : "Create Super Agent"}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
