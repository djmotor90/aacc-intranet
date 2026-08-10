"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { archiveTaskType, createTaskType, reorderTaskTypes, updateTaskType } from "../actions";
import { ColorIconDialog } from "./color-icon-dialog";
import { EntityIcon } from "./entity-icon";

interface TaskTypeItem {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  showDeliveryTimeline: boolean;
}

function TaskTypeRow({
  type,
  onSaved,
  onDelete,
  onOpenAppearance,
}: {
  type: TaskTypeItem;
  onSaved: (patch: Partial<TaskTypeItem>) => void;
  onDelete: () => void;
  onOpenAppearance: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: type.id,
  });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(type.name);
  const [pending, startTransition] = useTransition();

  function save() {
    const trimmed = name.trim();
    if (!trimmed) { setName(type.name); setEditing(false); return; }
    startTransition(async () => {
      try {
        await updateTaskType(type.id, { name: trimmed });
        onSaved({ name: trimmed });
        setEditing(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to rename task type");
      }
    });
  }

  function toggleTimeline(checked: boolean) {
    onSaved({ showDeliveryTimeline: checked });
    startTransition(async () => {
      try {
        await updateTaskType(type.id, { showDeliveryTimeline: checked });
      } catch (err) {
        onSaved({ showDeliveryTimeline: !checked });
        toast.error(err instanceof Error ? err.message : "Failed to update");
      }
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-background px-2 py-1.5",
        isDragging && "opacity-40",
      )}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </span>

      <button
        type="button"
        onClick={onOpenAppearance}
        title="Change icon & color"
        className="shrink-0 rounded hover:bg-muted"
      >
        <EntityIcon icon={type.icon} color={type.color} fallback="taskType" size="md" />
      </button>

      {editing ? (
        <>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-7 flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") { setName(type.name); setEditing(false); }
            }}
          />
          <Button variant="ghost" size="icon-sm" onClick={save} disabled={pending} aria-label="Save name">
            <Check className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => { setName(type.name); setEditing(false); }}
            aria-label="Cancel"
          >
            <X className="size-3.5" />
          </Button>
        </>
      ) : (
        <>
          <span className="flex-1 truncate font-medium">{type.name}</span>
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox checked={type.showDeliveryTimeline} onCheckedChange={(c) => toggleTimeline(c === true)} />
            Delivery timeline
          </label>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-muted-foreground hover:text-foreground"
            title="Rename"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

export function TaskTypeManager({
  spaceId,
  initialTypes,
}: {
  spaceId: string;
  initialTypes: TaskTypeItem[];
}) {
  const [items, setItems] = useState<TaskTypeItem[]>(initialTypes);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [appearanceForId, setAppearanceForId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function persist(list: TaskTypeItem[]) {
    startTransition(async () => {
      try {
        await reorderTaskTypes(spaceId, list.map((t) => t.id));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to reorder task types");
      }
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const from = items.findIndex((t) => t.id === active.id);
    const to = items.findIndex((t) => t.id === over.id);
    if (from === -1 || to === -1) return;
    const next = arrayMove(items, from, to);
    setItems(next);
    persist(next);
  }

  function handleSaved(id: string, patch: Partial<TaskTypeItem>) {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function handleDelete(id: string) {
    const prev = items;
    setItems((cur) => cur.filter((t) => t.id !== id));
    try {
      await archiveTaskType(id);
    } catch (err) {
      setItems(prev);
      toast.error(err instanceof Error ? err.message : "Failed to delete task type");
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await createTaskType({ spaceId, name });
      setItems((prev) => [
        ...prev,
        { id: created.id, name, icon: null, color: "#64748b", showDeliveryTimeline: false },
      ]);
      setNewName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create task type");
    } finally {
      setCreating(false);
    }
  }

  const activeType = activeId ? items.find((t) => t.id === activeId) : null;
  const appearanceType = appearanceForId ? items.find((t) => t.id === appearanceForId) : null;

  return (
    <div className="flex flex-col gap-3">
      <DndContext
        id="task-type-manager-dnd"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {items.map((t) => (
              <TaskTypeRow
                key={t.id}
                type={t}
                onSaved={(patch) => handleSaved(t.id, patch)}
                onDelete={() => handleDelete(t.id)}
                onOpenAppearance={() => setAppearanceForId(t.id)}
              />
            ))}
            {items.length === 0 && (
              <p className="py-2 text-center text-xs text-muted-foreground">
                No task types yet — add one below.
              </p>
            )}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeType && (
            <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 shadow-lg">
              <GripVertical className="size-4 text-muted-foreground" />
              <EntityIcon icon={activeType.icon} color={activeType.color} fallback="taskType" size="md" />
              <span className="text-sm">{activeType.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <div className="flex items-center gap-2 border-t pt-3">
        <Label className="sr-only" htmlFor="new-task-type-name">New task type name</Label>
        <Input
          id="new-task-type-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. Project"
          className="h-8 flex-1"
          onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
        />
        <Button type="button" size="sm" onClick={() => void handleCreate()} disabled={creating || !newName.trim()}>
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>

      {appearanceType && (
        <ColorIconDialog
          open={Boolean(appearanceForId)}
          onOpenChange={(open) => { if (!open) setAppearanceForId(null); }}
          kind="taskType"
          name={appearanceType.name}
          initialIcon={appearanceType.icon}
          initialColor={appearanceType.color}
          onSave={async ({ icon, color }) => {
            await updateTaskType(appearanceType.id, { icon, color: color ?? undefined });
            handleSaved(appearanceType.id, { icon, color: color ?? appearanceType.color });
          }}
        />
      )}
    </div>
  );
}
