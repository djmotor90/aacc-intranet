"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Building2, Folder, List, ListTodo, RotateCcw, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  purgeFolder,
  purgeList,
  purgeSpace,
  purgeTaskById,
  purgeFieldDefinition,
  restoreFolder,
  restoreList,
  restoreSpace,
  restoreTaskById,
  restoreFieldDefinition,
} from "../actions";
import { TRASH_RETENTION_DAYS, type TrashItem } from "../lib/trash";

function kindIcon(kind: TrashItem["kind"]) {
  switch (kind) {
    case "space":
      return <Building2 className="size-4 shrink-0 text-muted-foreground" />;
    case "folder":
      return <Folder className="size-4 shrink-0 text-muted-foreground" />;
    case "list":
      return <List className="size-4 shrink-0 text-muted-foreground" />;
    case "task":
      return <ListTodo className="size-4 shrink-0 text-muted-foreground" />;
    case "custom_field":
      return <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" />;
  }
}

function kindLabel(kind: TrashItem["kind"]) {
  switch (kind) {
    case "space":
      return "Space";
    case "folder":
      return "Folder";
    case "list":
      return "List";
    case "task":
      return "Task";
    case "custom_field":
      return "Custom field";
  }
}

function formatWhen(d: string | Date) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d instanceof Date ? d : new Date(d));
  } catch {
    return String(d);
  }
}

function daysRemaining(deletedAt: string | Date): number {
  const deleted = deletedAt instanceof Date ? deletedAt : new Date(deletedAt);
  const expires = deleted.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return Math.ceil((expires - Date.now()) / (24 * 60 * 60 * 1000));
}

export type TrashItemClient = Omit<TrashItem, "deletedAt"> & { deletedAt: string | Date };

type KindFilter = "all" | TrashItem["kind"];

export function TrashPanel({
  items: initial,
  title,
  description,
}: {
  items: TrashItemClient[];
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [spaceId, setSpaceId] = useState<string>("all");

  // Keep in sync when parent refreshes props (adjust-state-during-render).
  const initialKey = initial.map((i) => `${i.kind}:${i.id}`).join(",");
  const [prevInitialKey, setPrevInitialKey] = useState(initialKey);
  if (prevInitialKey !== initialKey) {
    setPrevInitialKey(initialKey);
    setItems(initial);
  }

  const spaces = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) map.set(i.spaceId, i.spaceName);
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (kind !== "all" && i.kind !== kind) return false;
      if (spaceId !== "all" && i.spaceId !== spaceId) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        i.spaceName.toLowerCase().includes(q) ||
        (i.parentName?.toLowerCase().includes(q) ?? false) ||
        (i.taskNumber?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, query, kind, spaceId]);

  function removeLocal(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function onRestore(item: TrashItemClient) {
    setPendingId(item.id);
    startTransition(async () => {
      try {
        if (item.kind === "space") await restoreSpace(item.id);
        else if (item.kind === "folder") await restoreFolder(item.id);
        else if (item.kind === "list") await restoreList(item.id);
        else if (item.kind === "task") await restoreTaskById(item.id);
        else await restoreFieldDefinition(item.id);
        removeLocal(item.id);
        toast.success(`Restored “${item.name}”`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to restore");
      } finally {
        setPendingId(null);
      }
    });
  }

  function onPurge(item: TrashItemClient) {
    if (
      !window.confirm(
        `Permanently delete “${item.name}”? This cannot be undone${
          item.kind === "space" || item.kind === "folder"
            ? " and removes all nested content"
            : item.kind === "task"
              ? " and removes its subtasks, comments, and attachments"
              : item.kind === "custom_field"
                ? " and removes its saved values from every task"
              : ""
        }.`,
      )
    ) {
      return;
    }
    setPendingId(item.id);
    startTransition(async () => {
      try {
        if (item.kind === "space") await purgeSpace(item.id);
        else if (item.kind === "folder") await purgeFolder(item.id);
        else if (item.kind === "list") await purgeList(item.id);
        else if (item.kind === "task") await purgeTaskById(item.id);
        else await purgeFieldDefinition(item.id);
        removeLocal(item.id);
        toast.success(`Permanently deleted “${item.name}”`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to permanently delete");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {(title || description) && (
        <div>
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Items stay in Trash for <strong>{TRASH_RETENTION_DAYS} days</strong>, then should be
        permanently removed. Restore anytime before then.
      </p>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or space…"
            className="h-9 pl-8"
          />
        </div>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as KindFilter)}
          className="h-9 rounded-md border bg-transparent px-2 text-sm"
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          <option value="space">Spaces</option>
          <option value="folder">Folders</option>
          <option value="list">Lists</option>
          <option value="task">Tasks</option>
          <option value="custom_field">Custom fields</option>
        </select>
        <select
          value={spaceId}
          onChange={(e) => setSpaceId(e.target.value)}
          className="h-9 max-w-[14rem] rounded-md border bg-transparent px-2 text-sm"
          aria-label="Filter by space"
        >
          <option value="all">All spaces</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {(query || kind !== "all" || spaceId !== "all") && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setKind("all");
              setSpaceId("all");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        Showing {filtered.length} of {items.length}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Trash2 className="mx-auto mb-3 size-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">Trash is empty</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Deleted spaces, folders, lists, tasks, and custom fields appear here so you can restore them.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No items match these filters.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {filtered.map((item) => {
            const busy = pendingId === item.id;
            const days = daysRemaining(item.deletedAt);
            const urgent = days <= 7;
            const expired = days <= 0;
            return (
              <li
                key={`${item.kind}-${item.id}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {kindIcon(item.kind)}
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {item.kind === "task" && item.taskNumber ? `${item.taskNumber} · ` : ""}
                      {item.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {kindLabel(item.kind)}
                      {item.kind !== "space" && item.parentName
                        ? ` · in ${item.parentName}`
                        : null}
                      {item.kind !== "space" ? ` · ${item.spaceName}` : null}
                      {" · "}
                      deleted {formatWhen(item.deletedAt)}
                    </div>
                    <div
                      className={cn(
                        "mt-0.5 text-[11px] font-medium",
                        expired
                          ? "text-destructive"
                          : urgent
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground",
                      )}
                    >
                      {expired
                        ? "Retention expired — purge recommended"
                        : `${days} day${days === 1 ? "" : "s"} left in Trash`}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onRestore(item)}
                    className="gap-1.5"
                  >
                    <RotateCcw className="size-3.5" />
                    Restore
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => onPurge(item)}
                    className="gap-1.5"
                  >
                    <Trash2 className="size-3.5" />
                    Delete forever
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
