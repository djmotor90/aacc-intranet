"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { CheckSquare, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  createChecklist,
  createChecklistItem,
  deleteChecklist,
  deleteChecklistItem,
  toggleChecklistItem,
} from "../actions";
import type { ChecklistRow } from "../queries";

export function ChecklistCardHeader({ count }: { count: number }) {
  return (
    <CardTitle className="flex items-center gap-2 text-base">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
        <CheckSquare className="size-3" />
      </span>
      Checklists {count > 0 ? `(${count})` : ""}
    </CardTitle>
  );
}

function ChecklistItemRow({
  item,
  canEdit,
}: {
  item: ChecklistRow["items"][number];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <li className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/40">
      <Checkbox
        checked={item.isChecked}
        disabled={!canEdit || pending}
        onCheckedChange={(checked) =>
          startTransition(async () => {
            await toggleChecklistItem(item.id, checked === true);
            router.refresh();
          })
        }
      />
      <span className={cn("min-w-0 flex-1 truncate text-sm", item.isChecked && "text-muted-foreground line-through")}>
        {item.title}
      </span>
      {canEdit && (
        <button
          type="button"
          className="shrink-0 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
          title="Delete item"
          onClick={() =>
            startTransition(async () => {
              await deleteChecklistItem(item.id);
              router.refresh();
            })
          }
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </li>
  );
}

function ChecklistCard({
  checklist,
  canEdit,
}: {
  checklist: ChecklistRow;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [itemTitle, setItemTitle] = useState("");
  const [adding, setAdding] = useState(false);

  const total = checklist.items.length;
  const done = checklist.items.filter((i) => i.isChecked).length;

  function submitItem() {
    const t = itemTitle.trim();
    if (!t) return;
    startTransition(async () => {
      await createChecklistItem(checklist.id, t);
      setItemTitle("");
      setAdding(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{checklist.title}</span>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{done}/{total}</span>
          )}
          {canEdit && (
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              title="Delete checklist"
              onClick={() =>
                startTransition(async () => {
                  await deleteChecklist(checklist.id);
                  router.refresh();
                })
              }
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {total > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.round((done / total) * 100)}%` }}
          />
        </div>
      )}

      <ul className="flex flex-col gap-0.5">
        {checklist.items.map((item) => (
          <ChecklistItemRow key={item.id} item={item} canEdit={canEdit} />
        ))}
      </ul>

      {canEdit && (
        adding ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); submitItem(); }}
          >
            <Input
              value={itemTitle}
              onChange={(e) => setItemTitle(e.target.value)}
              placeholder="Checklist item"
              className="h-8 flex-1"
              autoFocus
              disabled={pending}
              onKeyDown={(e) => { if (e.key === "Escape") { setAdding(false); setItemTitle(""); } }}
            />
            <Button type="submit" size="sm" disabled={pending || !itemTitle.trim()}>Add</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setItemTitle(""); }}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button type="button" variant="ghost" size="sm" className="self-start gap-1.5 text-muted-foreground" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
            Add item
          </Button>
        )
      )}
    </div>
  );
}

export function ChecklistPanel({
  taskId,
  checklists,
  canEdit,
}: {
  taskId: string;
  checklists: ChecklistRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newTitle, setNewTitle] = useState("");
  const [addingChecklist, setAddingChecklist] = useState(false);

  function submitChecklist() {
    startTransition(async () => {
      await createChecklist(taskId, newTitle.trim() || undefined);
      setNewTitle("");
      setAddingChecklist(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {checklists.map((c) => (
        <ChecklistCard key={c.id} checklist={c} canEdit={canEdit} />
      ))}
      {checklists.length === 0 && !addingChecklist && (
        <p className="py-2 text-center text-sm text-muted-foreground">No checklists yet.</p>
      )}

      {canEdit && (
        addingChecklist ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); submitChecklist(); }}
          >
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Checklist name"
              className="h-9 flex-1"
              autoFocus
              disabled={pending}
              onKeyDown={(e) => { if (e.key === "Escape") { setAddingChecklist(false); setNewTitle(""); } }}
            />
            <Button type="submit" size="sm" disabled={pending}>Add</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAddingChecklist(false); setNewTitle(""); }}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button type="button" variant="outline" size="sm" className="self-start gap-1.5" onClick={() => setAddingChecklist(true)}>
            <Plus className="size-3.5" />
            Add checklist
          </Button>
        )
      )}
    </div>
  );
}
