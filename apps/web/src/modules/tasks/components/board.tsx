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
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useOptimistic, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { updateTaskStatus } from "../actions";
import type { WritableListOption } from "../queries";
import { TaskCardContent, type TaskCardData } from "./task-card";
import { TaskActionsMenu, TaskContextMenu } from "./task-context-menu";

export interface BoardStatus {
  id: string;
  name: string;
  color: string;
  category: string;
}

export interface BoardTask extends TaskCardData {
  statusId: string;
  listId: string;
}

function DraggableCard({
  task,
  canEdit,
  writableLists,
}: {
  task: BoardTask;
  canEdit: boolean;
  writableLists: WritableListOption[];
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn("cursor-grab active:cursor-grabbing", isDragging && "opacity-40")}
    >
      <TaskContextMenu
        task={{
          id: task.id,
          number: task.number,
          title: task.title,
          listId: task.listId,
        }}
        canEdit={canEdit}
        lists={writableLists}
      >
        <div className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <TaskCardContent
            task={task}
            menu={
              <TaskActionsMenu
                task={{
                  id: task.id,
                  number: task.number,
                  title: task.title,
                  listId: task.listId,
                }}
                canEdit={canEdit}
                lists={writableLists}
              />
            }
          />
        </div>
      </TaskContextMenu>
    </div>
  );
}

function Column({
  status,
  tasks,
  canEdit,
  writableLists,
}: {
  status: BoardStatus;
  tasks: BoardTask[];
  canEdit: boolean;
  writableLists: WritableListOption[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id, disabled: !canEdit });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col gap-2 rounded-lg bg-muted/50 p-2 transition-colors",
        canEdit && isOver && "bg-muted ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-center gap-2 px-1 py-1">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: status.color }} />
        <span className="text-sm font-medium">{status.name}</span>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div className="flex min-h-16 flex-col gap-2">
        {tasks.length === 0 ? (
          <div className="flex min-h-16 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            No tasks
          </div>
        ) : (
          tasks.map((t) =>
            canEdit ? (
              <DraggableCard
                key={t.id}
                task={t}
                canEdit={canEdit}
                writableLists={writableLists}
              />
            ) : (
              <TaskContextMenu
                key={t.id}
                task={{
                  id: t.id,
                  number: t.number,
                  title: t.title,
                  listId: t.listId,
                }}
                canEdit={false}
                lists={writableLists}
              >
                <div>
                  <TaskCardContent
                    task={t}
                    menu={
                      <TaskActionsMenu
                        task={{
                          id: t.id,
                          number: t.number,
                          title: t.title,
                          listId: t.listId,
                        }}
                        canEdit={false}
                        lists={writableLists}
                      />
                    }
                  />
                </div>
              </TaskContextMenu>
            ),
          )
        )}
      </div>
    </div>
  );
}

export function Board({
  statuses,
  tasks,
  canEdit,
  writableLists = [],
}: {
  statuses: BoardStatus[];
  tasks: BoardTask[];
  canEdit: boolean;
  writableLists?: WritableListOption[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimisticTasks, moveTask] = useOptimistic(
    tasks,
    (state, { taskId, statusId }: { taskId: string; statusId: string }) =>
      state.map((t) => (t.id === taskId ? { ...t, statusId } : t)),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const taskId = String(event.active.id);
    const statusId = event.over ? String(event.over.id) : null;
    if (!statusId || !canEdit) return;
    const task = optimisticTasks.find((t) => t.id === taskId);
    if (!task || task.statusId === statusId) return;
    startTransition(async () => {
      moveTask({ taskId, statusId });
      await updateTaskStatus(taskId, statusId);
    });
  }

  const activeTask = activeId ? optimisticTasks.find((t) => t.id === activeId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {statuses.map((status) => (
          <Column
            key={status.id}
            status={status}
            tasks={optimisticTasks.filter((t) => t.statusId === status.id)}
            canEdit={canEdit}
            writableLists={writableLists}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="rotate-1 opacity-95 shadow-lg">
            <TaskCardContent task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
