/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  clearAgentMemories,
  createAgentMemory,
  deleteAgentMemory,
  updateAgentMemory,
} from "../actions/agents";
import type { AgentMemorySettings } from "../lib/agent-config";

type MemoryKind = "preference" | "fact" | "intelligence" | "procedure";

export type MemoryRow = {
  id: string;
  kind: string;
  content: string;
  userId: string | null;
  importance?: string | null;
  updatedAt: Date | string;
};

const KIND_META: Record<
  MemoryKind,
  { label: string; hint: string; filterLabel: string }
> = {
  preference: {
    label: "USER preference",
    hint: "Per-person tone/format",
    filterLabel: "Preferences",
  },
  fact: {
    label: "AGENT fact",
    hint: "Shared durable fact",
    filterLabel: "Facts",
  },
  intelligence: {
    label: "AGENT lesson",
    hint: "Lesson learned",
    filterLabel: "Lessons",
  },
  procedure: {
    label: "PROCEDURE",
    hint: "When→do flow",
    filterLabel: "Procedures",
  },
};

function isHotKind(k: string): k is MemoryKind {
  return k === "preference" || k === "fact" || k === "intelligence" || k === "procedure";
}

export function AgentMemoryPanel({
  agentId,
  initialRows,
  memoryToggles,
  onTogglesChange,
}: {
  agentId: string;
  initialRows: MemoryRow[];
  memoryToggles: AgentMemorySettings;
  onTogglesChange: (next: AgentMemorySettings) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | MemoryKind>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editKind, setEditKind] = useState<MemoryKind>("fact");
  const [newKind, setNewKind] = useState<MemoryKind>("preference");
  const [newContent, setNewContent] = useState("");

  const filtered = useMemo(() => {
    const hot = rows.filter((r) => isHotKind(r.kind));
    if (filter === "all") return hot;
    return hot.filter((r) => r.kind === filter);
  }, [rows, filter]);

  function startEdit(m: MemoryRow) {
    if (!isHotKind(m.kind)) return;
    setEditingId(m.id);
    setEditContent(m.content);
    setEditKind(m.kind);
    setError(null);
  }

  function onSaveEdit() {
    if (!editingId || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await updateAgentMemory({
        memoryId: editingId,
        content: editContent,
        kind: editKind,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === editingId
            ? {
                ...r,
                content: editContent.trim().slice(0, 600),
                kind: editKind,
                userId: editKind === "preference" ? r.userId ?? "local" : null,
              }
            : r,
        ),
      );
      setEditingId(null);
    });
  }

  function onDelete(id: string) {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteAgentMemory(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) setEditingId(null);
    });
  }

  function onAdd() {
    if (pending || !newContent.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await createAgentMemory({
        agentId,
        kind: newKind,
        content: newContent,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRows((prev) => [
        {
          id: res.id || `tmp-${Date.now()}`,
          kind: newKind,
          content: newContent.trim().slice(0, 600),
          userId: newKind === "preference" ? "local" : null,
          updatedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setNewContent("");
    });
  }

  function onClearAll() {
    if (pending) return;
    if (!window.confirm("Clear all hot memory for this agent? Conversation history is kept.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await clearAgentMemories(agentId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRows([]);
      setEditingId(null);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Memory</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Hermes/OpenClaw-style: hot memory is small curated facts and flows on the prompt — not a
          copy of chat. Manage entries below; toggles control what loads at chat time.
        </p>
      </div>

      {/* Toggles */}
      <div className="space-y-2">
        {(
          [
            [
              "recent",
              "Conversation continuity",
              "Rolling summary of older turns + last few messages",
            ],
            [
              "preferences",
              "USER preferences",
              "Per-person directives (tone, format)",
            ],
            [
              "intelligence",
              "AGENT facts & lessons",
              "Shared notes + auto-extract",
            ],
            [
              "procedures",
              "PROCEDURES / flows",
              "When→do playbooks on the prompt",
            ],
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
              checked={memoryToggles[key]}
              onChange={(e) =>
                onTogglesChange({ ...memoryToggles, [key]: e.target.checked })
              }
            />
          </label>
        ))}
      </div>

      {/* Add */}
      <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Plus className="size-3.5" />
          Add memory
        </div>
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
          <div>
            <Label className="text-xs">Kind</Label>
            <select
              className="mt-1 flex h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as MemoryKind)}
            >
              {(Object.keys(KIND_META) as MemoryKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_META[k].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Content</Label>
            <Input
              className="mt-1"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder={
                newKind === "procedure"
                  ? "When morning brief: list overdue → top 3 risks → offer doc append"
                  : "Short declarative note (not a chat transcript)"
              }
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">{KIND_META[newKind].hint}</p>
        <Button
          type="button"
          size="sm"
          onClick={onAdd}
          className={cn(
            (!newContent.trim() || pending) && "pointer-events-none opacity-50",
          )}
        >
          Save entry
        </Button>
      </div>

      {/* List */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["all", "All"],
              ["preference", KIND_META.preference.filterLabel],
              ["fact", KIND_META.fact.filterLabel],
              ["intelligence", KIND_META.intelligence.filterLabel],
              ["procedure", KIND_META.procedure.filterLabel],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                filter === id
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onClearAll}
          className={cn(pending && "pointer-events-none opacity-50")}
        >
          Clear all
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hot memory entries yet — add one above or chat with the agent (with Intelligence on).
        </p>
      ) : (
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {filtered.map((m) => {
            const kind = isHotKind(m.kind) ? m.kind : "fact";
            const editing = editingId === m.id;
            return (
              <li key={m.id} className="rounded-xl border bg-card px-3 py-2.5 text-sm shadow-sm">
                {editing ? (
                  <div className="space-y-2">
                    <select
                      className="flex h-8 w-full max-w-xs rounded-md border bg-background px-2 text-xs"
                      value={editKind}
                      onChange={(e) => setEditKind(e.target.value as MemoryKind)}
                    >
                      {(Object.keys(KIND_META) as MemoryKind[]).map((k) => (
                        <option key={k} value={k}>
                          {KIND_META[k].label}
                        </option>
                      ))}
                    </select>
                    <textarea
                      className="min-h-[72px] w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={onSaveEdit} disabled={pending}>
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <span className="rounded-full bg-muted px-1.5 py-0.5">
                          {KIND_META[kind]?.label ?? m.kind}
                        </span>
                        <span>·</span>
                        <span>{m.userId ? "per-user" : "shared"}</span>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Edit"
                          onClick={() => startEdit(m)}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Delete"
                          onClick={() => onDelete(m.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap text-foreground/90">{m.content}</p>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
