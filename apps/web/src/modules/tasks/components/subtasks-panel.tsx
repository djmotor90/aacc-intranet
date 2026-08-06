"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { CheckCircle2, Circle, ListTree, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createSubtask, updateTaskStatus } from "../actions";
import type { SubtaskRow } from "../queries";

export function SubtasksCardHeader({ count }: { count: number }) {
  return (
    <CardTitle className="flex items-center gap-2 text-base">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
        <ListTree className="size-3" />
      </span>
      Subtasks {count > 0 ? `(${count})` : ""}
    </CardTitle>
  );
}

export function SubtasksPanel({
  parentTaskId,
  subtasks: initial,
  statuses,
  canEdit,
  allowCreate = true,
}: {
  parentTaskId: string;
  subtasks: SubtaskRow[];
  statuses: { id: string; name: string; color: string; category: string }[];
  canEdit: boolean;
  /** When false (list setting), hide create UI; existing subtasks stay editable. */
  allowCreate?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const doneIds = new Set(
    statuses.filter((s) => s.category === "done" || s.category === "cancelled").map((s) => s.id),
  );
  const openStatus = statuses.find((s) => s.category === "open") ?? statuses[0];
  const doneStatus =
    statuses.find((s) => s.category === "done") ??
    statuses.find((s) => s.category === "cancelled") ??
    statuses[statuses.length - 1];

  const completed = initial.filter((s) => doneIds.has(s.statusId)).length;
  const total = initial.length;

  function submit() {
    const t = title.trim();
    if (!t) return;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("parentTaskId", parentTaskId);
        fd.set("title", t);
        await createSubtask(fd);
        setTitle("");
        setAdding(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create subtask");
      }
    });
  }

  function toggleDone(sub: SubtaskRow) {
    if (!canEdit || !openStatus || !doneStatus) return;
    const nextId = doneIds.has(sub.statusId) ? openStatus.id : doneStatus.id;
    startTransition(async () => {
      try {
        await updateTaskStatus(sub.id, nextId);
        router.refresh();
      } catch {
        // ignore
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {total > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${total === 0 ? 0 : Math.round((completed / total) * 100)}%` }}
            />
          </div>
          <span className="shrink-0 tabular-nums">
            {completed}/{total} done
          </span>
        </div>
      )}

      <ul className="flex flex-col gap-1">
        {initial.map((sub) => {
          const done = doneIds.has(sub.statusId);
          return (
            <li
              key={sub.id}
              className="group flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 hover:border-border hover:bg-muted/40"
            >
              {canEdit ? (
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  title={done ? "Mark open" : "Mark done"}
                  disabled={pending}
                  onClick={() => toggleDone(sub)}
                >
                  {done ? (
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  ) : (
                    <Circle className="size-4" />
                  )}
                </button>
              ) : done ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: sub.statusColor }}
                title={sub.statusName}
              />
              <Link
                href={`/tasks/task/${sub.number}`}
                className={cn(
                  "min-w-0 flex-1 truncate text-sm font-medium hover:underline",
                  done && "text-muted-foreground line-through",
                )}
              >
                {sub.title}
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground">{sub.number}</span>
            </li>
          );
        })}
        {initial.length === 0 && !adding && (
          <li className="py-4 text-center text-sm text-muted-foreground">No subtasks yet.</li>
        )}
      </ul>

      {canEdit && allowCreate && (
        <div className="flex flex-col gap-2">
          {adding ? (
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Subtask title"
                className="h-9 flex-1"
                autoFocus
                disabled={pending}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setAdding(false);
                    setTitle("");
                  }
                }}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pending || !title.trim()}>
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAdding(false);
                    setTitle("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start gap-1.5"
              onClick={() => setAdding(true)}
            >
              <Plus className="size-3.5" />
              Add subtask
            </Button>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {canEdit && !allowCreate && (
        <p className="text-xs text-muted-foreground">
          Creating subtasks is disabled for this list. Existing ones above still work.
        </p>
      )}
    </div>
  );
}
