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
import { SlidersHorizontal } from "lucide-react";
import { type ReactNode, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { saveListViewPrefs, updateTaskStatus } from "../actions";
import type { TaskTypeMeta, WritableListOption } from "../queries";
import {
  TaskCardContent,
  type BoardCardFieldDefinition,
  type TaskCardData,
} from "./task-card";
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
  taskTypes,
  customFieldDefs,
  userNames,
}: {
  task: BoardTask;
  canEdit: boolean;
  writableLists: WritableListOption[];
  taskTypes: TaskTypeMeta[];
  customFieldDefs: BoardCardFieldDefinition[];
  userNames: Map<string, string>;
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
          taskTypeId: task.taskType?.id ?? null,
        }}
        canEdit={canEdit}
        lists={writableLists}
        taskTypes={taskTypes}
      >
        <div className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <TaskCardContent
            task={task}
            customFieldDefs={customFieldDefs}
            userNames={userNames}
            menu={
              <TaskActionsMenu
                task={{
                  id: task.id,
                  number: task.number,
                  title: task.title,
                  listId: task.listId,
                  taskTypeId: task.taskType?.id ?? null,
                }}
                canEdit={canEdit}
                lists={writableLists}
                taskTypes={taskTypes}
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
  taskTypes,
  customFieldDefs,
  userNames,
}: {
  status: BoardStatus;
  tasks: BoardTask[];
  canEdit: boolean;
  writableLists: WritableListOption[];
  taskTypes: TaskTypeMeta[];
  customFieldDefs: BoardCardFieldDefinition[];
  userNames: Map<string, string>;
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
                taskTypes={taskTypes}
                customFieldDefs={customFieldDefs}
                userNames={userNames}
              />
            ) : (
              <TaskContextMenu
                key={t.id}
                task={{
                  id: t.id,
                  number: t.number,
                  title: t.title,
                  listId: t.listId,
                  taskTypeId: t.taskType?.id ?? null,
                }}
                canEdit={false}
                lists={writableLists}
                taskTypes={taskTypes}
              >
                <div>
                  <TaskCardContent
                    task={t}
                    customFieldDefs={customFieldDefs}
                    userNames={userNames}
                    menu={
                      <TaskActionsMenu
                        task={{
                          id: t.id,
                          number: t.number,
                          title: t.title,
                          listId: t.listId,
                          taskTypeId: t.taskType?.id ?? null,
                        }}
                        canEdit={false}
                        lists={writableLists}
                        taskTypes={taskTypes}
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
  listId,
  viewId,
  statuses,
  tasks,
  canEdit,
  writableLists = [],
  taskTypes = [],
  fieldDefs,
  activeUsers,
  initialFieldIds,
  toolbar,
}: {
  listId: string;
  viewId: string;
  statuses: BoardStatus[];
  tasks: BoardTask[];
  canEdit: boolean;
  writableLists?: WritableListOption[];
  taskTypes?: TaskTypeMeta[];
  fieldDefs: BoardCardFieldDefinition[];
  activeUsers: { id: string; displayName: string }[];
  initialFieldIds: string[];
  toolbar?: ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const fieldSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const fieldSaveVersion = useRef(0);
  const [selectedFieldIds, setSelectedFieldIds] = useState(() =>
    initialFieldIds.filter((id) => fieldDefs.some((field) => field.id === id)),
  );
  const selectedFields = useMemo(
    () => fieldDefs.filter((field) => selectedFieldIds.includes(field.id)),
    [fieldDefs, selectedFieldIds],
  );
  const userNames = useMemo(
    () => new Map(activeUsers.map((user) => [user.id, user.displayName])),
    [activeUsers],
  );
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

  function setCardFields(next: string[]) {
    const previous = selectedFieldIds;
    const saveVersion = ++fieldSaveVersion.current;
    setSelectedFieldIds(next);
    const pendingSave = fieldSaveQueue.current
      .catch(() => undefined)
      .then(() => saveListViewPrefs(listId, { viewId, boardFieldIds: next }));
    fieldSaveQueue.current = pendingSave;
    startTransition(async () => {
      try {
        await pendingSave;
      } catch (error) {
        if (fieldSaveVersion.current === saveVersion) setSelectedFieldIds(previous);
        toast.error(error instanceof Error ? error.message : "Could not save card fields");
      }
    });
  }

  function toggleField(fieldId: string, checked: boolean) {
    const next = checked
      ? [...selectedFieldIds, fieldId]
      : selectedFieldIds.filter((id) => id !== fieldId);
    setCardFields([...new Set(next)]);
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {toolbar}
        {canEdit && fieldDefs.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="ml-auto gap-1.5">
                <SlidersHorizontal className="size-3.5" />
                Card fields
                {selectedFieldIds.length > 0 && (
                  <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
                    {selectedFieldIds.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
              <DropdownMenuLabel>Custom fields on cards</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {fieldDefs.map((field) => (
                <DropdownMenuCheckboxItem
                  key={field.id}
                  checked={selectedFieldIds.includes(field.id)}
                  onCheckedChange={(checked) => toggleField(field.id, checked === true)}
                  onSelect={(event) => event.preventDefault()}
                >
                  <span className="min-w-0 flex-1 truncate">{field.label}</span>
                  <span className="text-[10px] capitalize text-muted-foreground">
                    {field.type.replaceAll("_", " ")}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
              {selectedFieldIds.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <button
                    type="button"
                    className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => setCardFields([])}
                  >
                    Clear all fields
                  </button>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {statuses.map((status) => (
          <Column
            key={status.id}
            status={status}
            tasks={optimisticTasks.filter((t) => t.statusId === status.id)}
            canEdit={canEdit}
            writableLists={writableLists}
            taskTypes={taskTypes}
            customFieldDefs={selectedFields}
            userNames={userNames}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="rotate-1 opacity-95 shadow-lg">
            <TaskCardContent
              task={activeTask}
              customFieldDefs={selectedFields}
              userNames={userNames}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
