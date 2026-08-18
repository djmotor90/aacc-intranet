"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Columns3, GripVertical, ListChecks, Paperclip, Pencil, Tag } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type CSSProperties,
  type DragEvent,
  Fragment,
  memo,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import type { TaskFilterCondition, TaskTypeMeta, TaskWithMeta } from "../queries";
import {
  fetchTaskChildren,
  fetchTasksPage,
  reorderTask,
  saveListViewPrefs,
  saveTableColumnOrder,
} from "../actions";
import { AssigneeAvatarStack, AssigneeSelect } from "./assignee-select";
import { EntityIcon } from "./entity-icon";
import {
  CustomFieldEditCell,
  isTextFieldType,
  PrioritySelectCell,
  StatusSelectCell,
  TaskDateCell,
  TextFieldQuickActions,
  TitleEditCell,
} from "./editable-cells";
import {
  colorFillStyle,
  PRIORITY_CARD_STYLES,
  PRIORITY_LABELS,
} from "./task-card";
import { TaskActionsMenu, TaskContextMenu } from "./task-context-menu";
import { TaskSelectionBar, type SelectedTask } from "./task-selection-bar";
import { TimeTrackedCell } from "./time-tracked-field";
import { TaskStatusPicker } from "./task-status-circle";
import {
  TaskTableColumnMenu,
  type TaskTableColumnMenuState,
} from "./task-table-column-menu";
import { TagChips, TagPicker, type TagOption } from "./tag-picker";
import type { WritableListOption } from "../queries";
import { DEFAULT_TASK_TYPE } from "../lib/task-types";

/** Compact solid chip for table display cells (matches board card fills). */
export function TableChip({
  children,
  className,
  style,
  title,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none",
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}

export interface StatusLike {
  id: string;
  name: string;
  color: string;
  category?: string;
}
export interface FieldDefLike { id: string; key: string; label: string; type: string; options: unknown }

const CALCULABLE_TYPES = new Set(["number", "date"]);

export function fieldOptionLabel(
  def: FieldDefLike,
  value: unknown,
  userNames: Map<string, string>,
): string {
  if (value === null || value === undefined || value === "") return "—";
  const options = (def.options ?? []) as { id: string; label: string; color?: string }[];
  switch (def.type) {
    case "checkbox":
      return value ? "Yes" : "No";
    case "dropdown":
      return options.find((o) => o.id === value)?.label ?? String(value);
    case "color": {
      const o = options.find((opt) => opt.id === value);
      if (!o) return String(value);
      // Prefer name; fall back to hex for unlabeled swatches (filters/group labels).
      return o.label || o.color || String(value);
    }
    case "multi_select":
      return (value as string[]).map((v) => options.find((o) => o.id === v)?.label ?? v).join(", ");
    case "user": {
      const ids = Array.isArray(value)
        ? (value as string[])
        : typeof value === "string" && value
          ? [value]
          : [];
      if (ids.length === 0) return "—";
      return ids.map((id) => userNames.get(id) ?? "Unknown").join(", ");
    }
    default:
      return String(value);
  }
}

export function renderFieldValue(
  def: FieldDefLike,
  value: unknown,
  userNames: Map<string, string>,
): ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  if (def.type === "color" || def.type === "dropdown") {
    const options = (def.options ?? []) as { id: string; label: string; color?: string }[];
    const o = options.find((opt) => opt.id === value);
    if (!o) return String(value);
    return (
      <span
        className="inline-flex items-center gap-1.5"
        title={o.label || o.color || undefined}
      >
        {o.color && (
          <span
            className="size-3.5 shrink-0 rounded-full border border-border shadow-sm"
            style={{ backgroundColor: o.color }}
          />
        )}
        {o.label ? <span className="truncate">{o.label}</span> : null}
      </span>
    );
  }
  if (def.type === "user") {
    const ids = Array.isArray(value)
      ? (value as string[])
      : typeof value === "string" && value
        ? [value]
        : [];
    if (ids.length === 0) return "—";
    const names = ids.map((id) => userNames.get(id) ?? "Unknown");
    return (
      <span className="inline-flex min-w-0 max-w-full items-center gap-1" title={names.join(", ")}>
        <span className="truncate text-sm">{names.slice(0, 3).join(", ")}</span>
        {names.length > 3 && (
          <span className="shrink-0 text-xs text-muted-foreground">+{names.length - 3}</span>
        )}
      </span>
    );
  }
  return fieldOptionLabel(def, value, userNames);
}

/**
 * Absolute floor for resize — about one glyph + cell padding.
 * Default `width` is the first-paint size; `minWidth` is how narrow drag can go.
 */
export const COL_MIN = 28;

const BASE_COLUMNS = [
  { id: "number",     label: "#",            width: 90,  minWidth: COL_MIN },
  { id: "title",      label: "Title",        width: 360, minWidth: COL_MIN },
  { id: "status",     label: "Status",       width: 150, minWidth: COL_MIN },
  { id: "priority",   label: "Priority",     width: 130, minWidth: COL_MIN },
  { id: "tags",       label: "Tags",         width: 180, minWidth: COL_MIN },
  { id: "due",        label: "Due date",     width: 140, minWidth: COL_MIN },
  { id: "start_date", label: "Start date",   width: 140, minWidth: COL_MIN },
  { id: "assignees",     label: "Assignees",    width: 150, minWidth: COL_MIN },
  { id: "time_tracked",  label: "Time tracked", width: 150, minWidth: COL_MIN },
  { id: "created_at",    label: "Created date", width: 160, minWidth: COL_MIN },
  { id: "closed_at",  label: "Closed date",  width: 160, minWidth: COL_MIN },
];
const BASE_COL_MAP = new Map(BASE_COLUMNS.map((c) => [c.id, c]));

/** These base columns cannot be hidden — they are always shown. */
const ALWAYS_VISIBLE = new Set(["number", "title"]);
/** Base columns shown in the field selector (hideable). */
const HIDEABLE_BASE_COLS = BASE_COLUMNS.filter((c) => !ALWAYS_VISIBLE.has(c.id));
/** Base columns hidden by default (auto-managed). */
const DEFAULT_HIDDEN_COLS = ["created_at", "closed_at"];

export interface ColumnDef { id: string; label: string; width: number; minWidth: number }

// ─── column context menu ──────────────────────────────────────────────────────

/** Native columns that support server-side sort. */
const SORTABLE_BASE = new Set([
  "number",
  "title",
  "status",
  "priority",
  "due",
  "start_date",
  "created_at",
  "closed_at",
  "time_tracked",
]);
/** Native columns that can group rows (matches filter bar). */
const GROUPABLE_BASE = new Set(["status", "priority"]);

// ─── virtualized row (memoized, display-first) ────────────────────────────────
// Airtable / native-list model:
//  • Rows always paint cheap, stable display cells (same look while scrolling).
//  • Interactive editors (Radix menus, pickers) mount ONLY for the one cell the
//    user clicks — never for every visible row on every fling.
//  • No scroll-mode swap → no blink, no mass remount freeze on settle.
// React.memo skips re-renders when props are stable (pure scroll of already-
// mounted rows).

const CELL_BTN =
  "block h-7 w-full truncate rounded-md px-1.5 text-left text-sm hover:bg-muted";

/** Fixed row heights — virtualizer never measures (no ResizeObserver thrash). */
const ROW_H = 37;
const HEADER_H = 42;

/** Fixed leading gutter for the reorder handle and subtask expand/collapse chevron. */
const EXPANDER_COL_WIDTH = 84;
/** Per-depth-level indent for nested subtask rows (px). */
const INDENT_PER_DEPTH = 20;

export function fmtShortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

interface TaskRowProps {
  vIndex: number;
  item: TaskWithMeta;
  orderedColumns: ColumnDef[];
  canEdit: boolean;
  statuses: StatusLike[];
  statusById: Map<string, StatusLike>;
  fieldDefsById: Map<string, FieldDefLike>;
  userNames: Map<string, string>;
  activeUsers: { id: string; displayName: string; photoKey: string | null }[];
  spaceTags: TagOption[];
  writableLists: WritableListOption[];
  taskTypes: TaskTypeMeta[];
  onPatchTask: (taskId: string, patch: Partial<TaskWithMeta["task"]>) => void;
  onPatchCustomField: (taskId: string, defId: string, value: unknown) => void;
  currentUserId: string;
  /** Nesting depth for subtask rows — 0 for top-level tasks. */
  depth?: number;
  /** Direct, non-archived child count — drives the expand chevron. */
  subtaskCount: number;
  expanded: boolean;
  onToggleExpand: () => void;
  reorderEnabled?: boolean;
  reorderGroupKey?: string | null;
  isDragging?: boolean;
  dropPlacement?: "before" | "after" | null;
  onRowDragStart?: (event: DragEvent<HTMLElement>, taskId: string, groupKey: string | null) => void;
  onRowDragOver?: (event: DragEvent<HTMLTableRowElement>, taskId: string, groupKey: string | null) => void;
  onRowDrop?: (event: DragEvent<HTMLTableRowElement>, taskId: string, groupKey: string | null) => void;
  onRowDragEnd?: () => void;
  selected?: boolean;
  selectionActive?: boolean;
  onToggleSelect?: (taskId: string, opts: { shift: boolean }) => void;
}

const TaskRow = memo(function TaskRow({
  vIndex,
  item,
  orderedColumns,
  canEdit,
  statuses,
  statusById,
  fieldDefsById,
  userNames,
  activeUsers,
  spaceTags,
  writableLists,
  taskTypes,
  onPatchTask,
  onPatchCustomField,
  currentUserId,
  depth = 0,
  subtaskCount,
  expanded,
  onToggleExpand,
  reorderEnabled = false,
  reorderGroupKey = null,
  isDragging = false,
  dropPlacement = null,
  onRowDragStart,
  onRowDragOver,
  onRowDrop,
  onRowDragEnd,
  selected = false,
  selectionActive = false,
  onToggleSelect,
}: TaskRowProps) {
  const task = item.task;
  const assignees = item.assignees;
  const taskTags = item.tags ?? [];
  const hasAttachments = item.hasAttachments;
  const cf = (task.customFields ?? {}) as Record<string, unknown>;
  // Only one interactive editor per row at a time — keeps scroll paint cheap.
  const [editingCol, setEditingCol] = useState<string | null>(null);

  function openEdit(colId: string) {
    if (!canEdit) return;
    setEditingCol(colId);
  }

  function closeEdit() {
    setEditingCol(null);
  }

  function renderCell(colId: string) {
    const editing = canEdit && editingCol === colId;

    switch (colId) {
      case "number":
        return (
          <TableCell key={colId} className="text-xs text-muted-foreground">
            <TaskContextMenu
              task={{
                id: task.id,
                number: task.number,
                title: task.title,
                listId: task.listId,
                taskTypeId: item.taskType?.id ?? null,
              }}
              canEdit={canEdit}
              lists={writableLists}
              taskTypes={taskTypes}
            >
              <button
                type="button"
                className="max-w-full truncate rounded px-0.5 text-left font-mono hover:bg-muted hover:text-foreground"
              >
                {task.number}
              </button>
            </TaskContextMenu>
          </TableCell>
        );

      case "title": {
        // Title = link. Tag + pencil appear together on row hover; pickers mount on click only.
        const editingTags = canEdit && editingCol === "title-tags";
        // Shared hover reveal: both icons fade in when the title cell is hovered.
        const iconBtn = cn(
          "relative flex size-6 shrink-0 items-center justify-center rounded-md",
          "text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground",
        );
        return (
          <TableCell key={colId} className="min-w-0 overflow-visible">
            {editing ? (
              <TitleEditCell
                taskId={task.id}
                number={task.number}
                title={task.title}
                canEdit
                startEditing
                onSaved={(next) => {
                  onPatchTask(task.id, { title: next });
                  closeEdit();
                }}
              />
            ) : (
              <div
                className="group/title relative flex min-w-0 items-center gap-0.5"
                style={depth > 0 ? { paddingLeft: depth * INDENT_PER_DEPTH } : undefined}
              >
                <TaskStatusPicker
                  taskId={task.id}
                  statusId={task.statusId}
                  statuses={statuses}
                  canEdit={canEdit}
                  onSaved={(next) => onPatchTask(task.id, { statusId: next })}
                />
                {item.taskType && (
                  <EntityIcon
                    icon={item.taskType.icon}
                    color={item.taskType.color}
                    fallback="taskType"
                    size="sm"
                    className="shrink-0"
                  />
                )}
                <TaskContextMenu
                  task={{
                    id: task.id,
                    number: task.number,
                    title: task.title,
                    listId: task.listId,
                    taskTypeId: item.taskType?.id ?? null,
                  }}
                  canEdit={canEdit}
                  lists={writableLists}
                  taskTypes={taskTypes}
                >
                  <Link
                    href={`/tasks/task/${task.number}`}
                    className="min-w-0 flex-1 truncate font-medium hover:underline"
                  >
                    {task.title}
                  </Link>
                </TaskContextMenu>
                {hasAttachments && (
                  <span
                    title="Has attachments"
                    aria-label="Has attachments"
                    className="inline-flex shrink-0 text-muted-foreground"
                  >
                    <Paperclip className="size-3.5" />
                  </span>
                )}
                {subtaskCount > 0 && (
                  <span
                    title={`${subtaskCount} subtask${subtaskCount === 1 ? "" : "s"}`}
                    className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"
                  >
                    <ListChecks className="size-3.5" />
                    {subtaskCount}
                  </span>
                )}
                <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-background/95 pl-1 opacity-0 shadow-[-6px_0_8px_var(--background)] transition-opacity group-hover/title:opacity-100 focus-within:opacity-100">
                  <TaskActionsMenu
                    task={{
                      id: task.id,
                      number: task.number,
                      title: task.title,
                      listId: task.listId,
                      taskTypeId: item.taskType?.id ?? null,
                    }}
                    canEdit={canEdit}
                    lists={writableLists}
                    taskTypes={taskTypes}
                    buttonClassName="size-6 shadow-none ring-0"
                  />
                  {canEdit && (
                    <>
                    {editingTags ? (
                      <TagPicker
                        taskId={task.id}
                        spaceTags={spaceTags}
                        selectedTags={taskTags}
                        iconOnly
                        defaultOpen
                        onOpenChange={(open) => {
                          if (!open) closeEdit();
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        title={
                          taskTags.length > 0
                            ? `Tags: ${taskTags.map((t) => t.name).join(", ")}`
                            : "Add tags"
                        }
                        aria-label={
                          taskTags.length > 0
                            ? `Edit tags (${taskTags.length})`
                            : "Add tags"
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openEdit("title-tags");
                        }}
                        className={cn(
                          iconBtn,
                          // Keep tag control visible when tags already exist.
                          taskTags.length > 0 && "opacity-100 text-foreground",
                        )}
                      >
                        <Tag className="size-3.5" />
                        {taskTags.length > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 flex -space-x-0.5">
                            {taskTags.slice(0, 3).map((t) => (
                              <span
                                key={t.id}
                                className="size-1.5 rounded-full ring-1 ring-background"
                                style={{ backgroundColor: t.color }}
                              />
                            ))}
                          </span>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      title="Edit title"
                      aria-label="Edit title"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openEdit("title");
                      }}
                      className={iconBtn}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </TableCell>
        );
      }

      case "status": {
        const st = statusById.get(task.statusId);
        if (editing) {
          return (
            <TableCell key={colId} className="p-0.5">
              <StatusSelectCell
                taskId={task.id}
                statusId={task.statusId}
                statuses={statuses}
                defaultOpen
                onOpenChange={(open) => {
                  if (!open) closeEdit();
                }}
                onSaved={(next) => {
                  onPatchTask(task.id, { statusId: next });
                  closeEdit();
                }}
              />
            </TableCell>
          );
        }
        const statusChip = st ? (
          <TableChip style={colorFillStyle(st.color)} title={st.name}>
            <span className="size-1.5 shrink-0 rounded-full bg-white/90" />
            <span className="truncate">{st.name}</span>
          </TableChip>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
        return (
          <TableCell key={colId} className="p-0.5">
            {canEdit ? (
              <button type="button" onClick={() => openEdit("status")} className={cn(CELL_BTN, "flex items-center")}>
                {statusChip}
              </button>
            ) : (
              <span className="flex h-7 items-center px-1.5">{statusChip}</span>
            )}
          </TableCell>
        );
      }

      case "priority": {
        if (editing) {
          return (
            <TableCell key={colId} className="p-0.5">
              <PrioritySelectCell
                taskId={task.id}
                priority={task.priority}
                defaultOpen
                onOpenChange={(open) => {
                  if (!open) closeEdit();
                }}
                onSaved={(next) => {
                  onPatchTask(task.id, { priority: next });
                  closeEdit();
                }}
              />
            </TableCell>
          );
        }
        const priorityChip = task.priority ? (
          <TableChip className={PRIORITY_CARD_STYLES[task.priority] ?? PRIORITY_CARD_STYLES.normal}>
            {PRIORITY_LABELS[task.priority] ?? task.priority}
          </TableChip>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
        return (
          <TableCell key={colId} className="p-0.5">
            {canEdit ? (
              <button type="button" onClick={() => openEdit("priority")} className={cn(CELL_BTN, "flex items-center")}>
                {priorityChip}
              </button>
            ) : (
              <span className="flex h-7 items-center px-1.5">{priorityChip}</span>
            )}
          </TableCell>
        );
      }

      case "due":
      case "start_date": {
        const field = colId === "due" ? "dueDate" : "startDate";
        const value = colId === "due" ? task.dueDate : task.startDate;
        if (editing) {
          return (
            <TableCell key={colId} className="p-0.5">
              <TaskDateCell
                taskId={task.id}
                field={field}
                value={value}
                startEditing
                onCancel={closeEdit}
                onSaved={(next) => {
                  onPatchTask(task.id, { [field]: next });
                  closeEdit();
                }}
              />
            </TableCell>
          );
        }

        return (
          <TableCell key={colId} className="p-0.5">
            {canEdit ? (
              <button type="button" onClick={() => openEdit(colId)} className={CELL_BTN}>
                {fmtShortDate(value)}
              </button>
            ) : (
              <span className="block h-7 truncate px-1.5 text-sm">{fmtShortDate(value)}</span>
            )}
          </TableCell>
        );
      }

      case "created_at":
        return (
          <TableCell key={colId} className="text-sm">
            {fmtShortDate(task.createdAt)}
          </TableCell>
        );

      case "closed_at":
        return (
          <TableCell key={colId} className="text-sm">
            {fmtShortDate(task.completedAt)}
          </TableCell>
        );

      case "tags":
        if (editing) {
          return (
            <TableCell key={colId} className="p-0.5" onClick={(e) => e.stopPropagation()}>
              <TagPicker
                taskId={task.id}
                spaceTags={spaceTags}
                selectedTags={taskTags}
                compact
              />
            </TableCell>
          );
        }
        return (
          <TableCell key={colId} className="p-0.5">
            {canEdit ? (
              <button
                type="button"
                onClick={() => openEdit("tags")}
                className={cn(CELL_BTN, "flex items-center gap-1")}
              >
                {taskTags.length > 0 ? <TagChips tags={taskTags} /> : (
                  <span className="text-muted-foreground">—</span>
                )}
              </button>
            ) : (
              <div className="flex h-7 items-center px-1.5">
                {taskTags.length > 0 ? <TagChips tags={taskTags} /> : "—"}
              </div>
            )}
          </TableCell>
        );

      case "time_tracked": {
        const me = activeUsers.find((u) => u.id === currentUserId) ?? {
          id: currentUserId,
          displayName: "Me",
          photoKey: null,
        };
        return (
          <TableCell key={colId} className="p-0.5" onClick={(e) => e.stopPropagation()}>
            <TimeTrackedCell
              taskId={task.id}
              completedSeconds={item.timeTrackedSeconds ?? 0}
              runningStartedAt={item.runningTimer?.startedAt ?? null}
              runningUserId={item.runningTimer?.userId ?? null}
              canEdit={canEdit}
              currentUser={me}
              users={activeUsers}
            />
          </TableCell>
        );
      }

      case "assignees":
        // Always show the avatar stack; the picker opens from the stack itself.
        return (
          <TableCell key={colId} className="p-0.5" onClick={(e) => e.stopPropagation()}>
            {canEdit ? (
              <div className="flex h-7 items-center px-1">
                <AssigneeSelect
                  taskId={task.id}
                  users={activeUsers}
                  selectedUsers={assignees}
                  selectedTeams={item.teamAssignees}
                  size="sm"
                />
              </div>
            ) : (
              <div className="flex h-7 items-center px-1">
                <AssigneeAvatarStack users={assignees} teams={item.teamAssignees} size="sm" />
              </div>
            )}
          </TableCell>
        );

      default:
        if (colId.startsWith("field-")) {
          const defId = colId.slice(6);
          const def = fieldDefsById.get(defId);
          if (!def) return null;
          if (editing) {
            return (
              <TableCell key={colId} className="p-0.5">
                <CustomFieldEditCell
                  taskId={task.id}
                  def={def}
                  value={cf[defId]}
                  users={activeUsers}
                  onSaved={(next) => {
                    onPatchCustomField(task.id, defId, next);
                    // Keep open for multi-step fields; click outside handled by row reuse.
                  }}
                />
              </TableCell>
            );
          }

          // Unlabeled color: fill the whole cell with the swatch color.
          if (def.type === "color") {
            const opts = (def.options ?? []) as { id: string; label: string; color?: string }[];
            const picked = opts.find((o) => o.id === cf[defId]);
            const fill =
              picked && !picked.label?.trim() && picked.color ? picked.color : null;
            if (fill) {
              return (
                <TableCell key={colId} className="p-0.5">
                  {canEdit ? (
                    <button
                      type="button"
                      title={fill}
                      aria-label={`Color ${fill}`}
                      onClick={() => openEdit(colId)}
                      className="block h-7 w-full rounded-sm border border-border/40 transition-[filter] hover:brightness-95"
                      style={{ backgroundColor: fill }}
                    />
                  ) : (
                    <span
                      title={fill}
                      className="block h-7 w-full rounded-sm border border-border/40"
                      style={{ backgroundColor: fill }}
                    />
                  )}
                </TableCell>
              );
            }
          }

          return (
            <TableCell key={colId} className="p-0.5">
              {isTextFieldType(def.type) ? (
                <TextFieldQuickActions
                  taskId={task.id}
                  defId={defId}
                  value={cf[defId]}
                  display={renderFieldValue(def, cf[defId], userNames)}
                  canEdit={canEdit}
                  onActivate={canEdit ? () => openEdit(colId) : undefined}
                  onSaved={(next) => onPatchCustomField(task.id, defId, next)}
                />
              ) : canEdit ? (
                <button type="button" onClick={() => openEdit(colId)} className={CELL_BTN}>
                  {renderFieldValue(def, cf[defId], userNames)}
                </button>
              ) : (
                <span className="block h-7 truncate px-1.5 text-sm">
                  {renderFieldValue(def, cf[defId], userNames)}
                </span>
              )}
            </TableCell>
          );
        }
        return null;
    }
  }

  return (
    // transition-none: row hover color transitions cause paint thrash mid-scroll.
    // content-visibility: browser can skip off-buffer paint work for overscanned rows.
    <TableRow
      data-index={vIndex}
      onDragOver={
        reorderEnabled
          ? (event) => onRowDragOver?.(event, task.id, reorderGroupKey)
          : undefined
      }
      onDrop={
        reorderEnabled ? (event) => onRowDrop?.(event, task.id, reorderGroupKey) : undefined
      }
      className={cn(
        "group/task-row h-[37px] transition-none hover:bg-muted/40",
        selected && "bg-primary/10",
        isDragging && "opacity-40",
        dropPlacement === "before" && "[&>td]:border-t-2 [&>td]:border-t-primary",
        dropPlacement === "after" && "[&>td]:border-b-2 [&>td]:border-b-primary",
      )}
      style={{ contentVisibility: "auto", containIntrinsicSize: `auto ${ROW_H}px` }}
    >
      <TableCell className="p-0">
        <div
          className="flex h-full items-center justify-start gap-0.5 pl-1.5"
          style={depth > 0 ? { paddingLeft: 6 + depth * INDENT_PER_DEPTH } : undefined}
        >
          <Checkbox
            checked={selected}
            aria-label={`Select ${task.title}`}
            className={cn(
              selected || selectionActive
                ? "opacity-100"
                : "opacity-0 group-hover/task-row:opacity-100 focus-visible:opacity-100",
            )}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={() => onToggleSelect?.(task.id, { shift: false })}
            onPointerDown={(event) => {
              if (event.shiftKey) {
                event.preventDefault();
                onToggleSelect?.(task.id, { shift: true });
              }
            }}
          />
          {reorderEnabled ? (
            <button
              type="button"
              draggable
              title="Drag to reorder task"
              aria-label={`Reorder ${task.title}`}
              onDragStart={(event) => onRowDragStart?.(event, task.id, reorderGroupKey)}
              onDragEnd={onRowDragEnd}
              className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/40 opacity-40 hover:bg-muted hover:text-foreground group-hover/task-row:opacity-100 active:cursor-grabbing focus-visible:opacity-100"
            >
              <GripVertical className="size-3.5" />
            </button>
          ) : (
            <span className="size-5 shrink-0" aria-hidden />
          )}
          <span className="flex size-5 shrink-0 items-center justify-center">
            {subtaskCount > 0 ? (
              <button
                type="button"
                onClick={onToggleExpand}
                aria-label={expanded ? "Collapse subtasks" : "Expand subtasks"}
                aria-expanded={expanded}
                className="flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
              </button>
            ) : null}
          </span>
        </div>
      </TableCell>
      {orderedColumns.map((col) => renderCell(col.id))}
    </TableRow>
  );
});

// ─── main component ───────────────────────────────────────────────────────────

const PAGE_SIZE = 200;

export function TaskTable({
  items,
  totalCount,
  groupCounts,
  conditions,
  statuses,
  fieldDefs,
  userNames,
  activeUsers,
  writableLists = [],
  taskTypes = [],
  groupBy,
  listId,
  initialColumnOrder,
  canEdit = true,
  showClosed = false,
  spaceTags = [],
  viewId,
  onGroupByChange,
  currentUserId,
  fillViewport = true,
}: {
  /** First page of tasks (server-filtered and ordered). */
  items: TaskWithMeta[];
  /** Total matching rows across all pages. */
  totalCount: number;
  /** Per-group totals when groupBy is active (keys match server group keys). */
  groupCounts?: { key: string; count: number }[] | null;
  /** Active filter conditions — passed through to follow-up page fetches. */
  conditions?: TaskFilterCondition[];
  statuses: StatusLike[];
  fieldDefs: FieldDefLike[];
  userNames: Map<string, string>;
  activeUsers: { id: string; displayName: string; photoKey: string | null }[];
  /** Lists the user can move/copy tasks into (context menu). */
  writableLists?: WritableListOption[];
  /** Space's task types — powers the context menu's "Task Type" submenu. */
  taskTypes?: TaskTypeMeta[];
  groupBy?: string;
  listId: string;
  initialColumnOrder?: string[];
  /** When false, cells are read-only (guests / view-only grants). */
  canEdit?: boolean;
  /** Include done/cancelled tasks on follow-up page fetches (matches server page). */
  showClosed?: boolean;
  /** All tags defined in the parent space (for the tags column picker). */
  spaceTags?: TagOption[];
  /** Active named list view id — column order / groupBy persist onto it. */
  viewId?: string;
  /** Soft group-by (no full navigation). */
  onGroupByChange?: (value: string) => void;
  currentUserId: string;
  /** When false, the table grows with rows and only scrolls sideways (space/folder stack). */
  fillViewport?: boolean;
}) {
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draggedTask, setDraggedTask] = useState<{
    taskId: string;
    groupKey: string | null;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    taskId: string;
    placement: "before" | "after";
  } | null>(null);
  const reorderSnapshot = useRef<Map<number, TaskWithMeta> | null>(null);

  // ── sparse row cache keyed by absolute offset ─────────────────────────────
  // The scrollbar reserves height for ALL rows up front; unloaded offsets render
  // as skeletons and fill in as pages arrive. Fetched rows stay cached, so
  // scrolling back up never refetches and the layout never shifts.
  const [rowsByOffset, setRowsByOffset] = useState<Map<number, TaskWithMeta>>(
    () => new Map(items.map((it, i) => [i, it])),
  );
  const requestedPages = useRef<Set<number>>(new Set([0]));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedId = useRef<string | null>(null);
  useEffect(() => {
    setRowsByOffset(new Map(items.map((it, i) => [i, it])));
    requestedPages.current = new Set([0]);
  }, [items]);

  const patchRows = useCallback((fn: (it: TaskWithMeta) => TaskWithMeta) => {
    setRowsByOffset((prev) => {
      const next = new Map<number, TaskWithMeta>();
      for (const [offset, it] of prev) next.set(offset, fn(it));
      return next;
    });
  }, []);
  const patchTask = useCallback(
    (taskId: string, patch: Partial<TaskWithMeta["task"]>) => {
      patchRows((it) => (it.task.id === taskId ? { ...it, task: { ...it.task, ...patch } } : it));
    },
    [patchRows],
  );
  const patchCustomField = useCallback(
    (taskId: string, defId: string, value: unknown) => {
      patchRows((it) => {
        if (it.task.id !== taskId) return it;
        const cf = { ...(it.task.customFields as Record<string, unknown> | null ?? {}) };
        if (value === undefined) delete cf[defId];
        else cf[defId] = value;
        return { ...it, task: { ...it.task, customFields: cf } };
      });
    },
    [patchRows],
  );

  const moveLoadedTask = useCallback(
    (sourceId: string, targetId: string, placement: "before" | "after") => {
      setRowsByOffset((prev) => {
        reorderSnapshot.current = new Map(prev);
        const entries = [...prev.entries()].sort((a, b) => a[0] - b[0]);
        const sourceIndex = entries.findIndex(([, item]) => item.task.id === sourceId);
        if (sourceIndex < 0) return prev;
        const [source] = entries.splice(sourceIndex, 1);
        const targetIndex = entries.findIndex(([, item]) => item.task.id === targetId);
        if (targetIndex < 0) return prev;
        entries.splice(targetIndex + (placement === "after" ? 1 : 0), 0, source);
        const offsets = [...prev.keys()].sort((a, b) => a - b);
        const next = new Map<number, TaskWithMeta>();
        entries.forEach(([, item], index) => next.set(offsets[index], item));
        return next;
      });
    },
    [],
  );

  const handleRowDragStart = useCallback(
    (event: DragEvent<HTMLElement>, taskId: string, groupKey: string | null) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", taskId);
      setDraggedTask({ taskId, groupKey });
      setDropTarget(null);
    },
    [],
  );

  const handleRowDragOver = useCallback(
    (event: DragEvent<HTMLTableRowElement>, taskId: string, groupKey: string | null) => {
      if (!draggedTask || draggedTask.taskId === taskId || draggedTask.groupKey !== groupKey) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const bounds = event.currentTarget.getBoundingClientRect();
      const placement = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
      setDropTarget((current) =>
        current?.taskId === taskId && current.placement === placement
          ? current
          : { taskId, placement },
      );
    },
    [draggedTask],
  );

  const clearRowDrag = useCallback(() => {
    setDraggedTask(null);
    setDropTarget(null);
  }, []);

  const handleRowDrop = useCallback(
    (event: DragEvent<HTMLTableRowElement>, targetId: string, groupKey: string | null) => {
      event.preventDefault();
      const sourceId = draggedTask?.taskId ?? event.dataTransfer.getData("text/plain");
      const placement = dropTarget?.taskId === targetId ? dropTarget.placement : "before";
      if (!sourceId || sourceId === targetId || draggedTask?.groupKey !== groupKey) {
        clearRowDrag();
        return;
      }
      moveLoadedTask(sourceId, targetId, placement);
      clearRowDrag();
      startTransition(async () => {
        try {
          await reorderTask(sourceId, targetId, placement);
          reorderSnapshot.current = null;
          router.refresh();
        } catch {
          if (reorderSnapshot.current) setRowsByOffset(reorderSnapshot.current);
          reorderSnapshot.current = null;
          toast.error("Could not reorder task");
        }
      });
    },
    [clearRowDrag, draggedTask, dropTarget, moveLoadedTask, router, startTransition],
  );

  // ── inline subtask expansion ──────────────────────────────────────────────
  // Keyed by task id (not row offset) so it works uniformly for top-level
  // tasks and nested subtasks alike. Children stay cached after collapsing —
  // re-expanding is instant. Reset alongside rowsByOffset whenever the
  // underlying data set changes (new items page / sort change).
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [childrenByTaskId, setChildrenByTaskId] = useState<
    Map<string, TaskWithMeta[] | "loading" | "error">
  >(new Map());
  const requestedChildren = useRef<Set<string>>(new Set());

  useEffect(() => {
    setExpandedTaskIds(new Set());
    setChildrenByTaskId(new Map());
    requestedChildren.current = new Set();
  }, [items]);

  const toggleExpand = useCallback((taskId: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  // Lazily fetch children the first time a task is expanded; dedup in-flight
  // requests via a ref (same idiom as requestedPages for page fetches).
  useEffect(() => {
    for (const taskId of expandedTaskIds) {
      if (childrenByTaskId.has(taskId) || requestedChildren.current.has(taskId)) continue;
      requestedChildren.current.add(taskId);
      setChildrenByTaskId((prev) => new Map(prev).set(taskId, "loading"));
      fetchTaskChildren(taskId)
        .then((children) => {
          setChildrenByTaskId((prev) => new Map(prev).set(taskId, children));
        })
        .catch(() => {
          requestedChildren.current.delete(taskId); // allow retry on next expand
          setChildrenByTaskId((prev) => new Map(prev).set(taskId, "error"));
          toast.error("Failed to load subtasks");
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedTaskIds]);

  const patchChildTask = useCallback(
    (parentId: string, taskId: string, patch: Partial<TaskWithMeta["task"]>) => {
      setChildrenByTaskId((prev) => {
        const children = prev.get(parentId);
        if (!children || children === "loading" || children === "error") return prev;
        const next = new Map(prev);
        next.set(
          parentId,
          children.map((c) =>
            c.task.id === taskId ? { ...c, task: { ...c.task, ...patch } } : c,
          ),
        );
        return next;
      });
    },
    [],
  );
  const patchChildCustomField = useCallback(
    (parentId: string, taskId: string, defId: string, value: unknown) => {
      setChildrenByTaskId((prev) => {
        const children = prev.get(parentId);
        if (!children || children === "loading" || children === "error") return prev;
        const next = new Map(prev);
        next.set(
          parentId,
          children.map((c) => {
            if (c.task.id !== taskId) return c;
            const cf = { ...(c.task.customFields as Record<string, unknown> | null ?? {}) };
            if (value === undefined) delete cf[defId];
            else cf[defId] = value;
            return { ...c, task: { ...c.task, customFields: cf } };
          }),
        );
        return next;
      });
    },
    [],
  );

  /** Discriminated flattened view of an expanded task's (possibly nested) children. */
  type DescendantEntry =
    | { kind: "row"; item: TaskWithMeta; depth: number; parentId: string }
    | { kind: "loading" | "error"; depth: number; key: string };

  const visibleDescendantEntries = useCallback(
    (taskId: string, depth = 1): DescendantEntry[] => {
      if (!expandedTaskIds.has(taskId)) return [];
      const children = childrenByTaskId.get(taskId);
      if (children === "loading") return [{ kind: "loading", depth, key: `loading-${taskId}` }];
      if (children === "error") return [{ kind: "error", depth, key: `error-${taskId}` }];
      if (!children) return [];
      const entries: DescendantEntry[] = [];
      for (const child of children) {
        entries.push({ kind: "row", item: child, depth, parentId: taskId });
        entries.push(...visibleDescendantEntries(child.task.id, depth + 1));
      }
      return entries;
    },
    [expandedTaskIds, childrenByTaskId],
  );

  // ── column order ──────────────────────────────────────────────────────────
  const defaultOrder = useMemo(
    () => [...BASE_COLUMNS.map((c) => c.id), ...fieldDefs.map((d) => `field-${d.id}`)],
    // fieldDefs is the only runtime dependency; BASE_COLUMNS is module-level constant
     
    [fieldDefs],
  );

  function mergeOrder(saved: string[], known: string[]): string[] {
    const knownSet = new Set(known);
    const filtered = saved.filter((id) => knownSet.has(id));
    const existing = new Set(filtered);
    return [...filtered, ...known.filter((id) => !existing.has(id))];
  }

  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    initialColumnOrder ? mergeOrder(initialColumnOrder, defaultOrder) : defaultOrder,
  );

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    startTransition(() => { saveTableColumnOrder(listId, columnOrder, viewId); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnOrder]);

  // ── column visibility ─────────────────────────────────────────────────────
  // Stores column IDs of hidden cols: base col IDs (e.g. "status") or "field-{defId}" for custom.
  const hiddenStorageKey = `aitim:task-table-hidden:${listId}`;
  const [hiddenColIds, setHiddenColIds] = useState<string[]>([]);
  const [visibilityLoaded, setVisibilityLoaded] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(hiddenStorageKey);
    try {
      const saved = raw ? (JSON.parse(raw) as string[]) : DEFAULT_HIDDEN_COLS;
      const timeout = window.setTimeout(() => {
        setHiddenColIds(saved);
        setVisibilityLoaded(true);
      }, 0);
      return () => window.clearTimeout(timeout);
    } catch {
      window.localStorage.removeItem(hiddenStorageKey);
      const timeout = window.setTimeout(() => {
        setHiddenColIds(DEFAULT_HIDDEN_COLS);
        setVisibilityLoaded(true);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!visibilityLoaded) return;
    window.localStorage.setItem(hiddenStorageKey, JSON.stringify(hiddenColIds));
  }, [hiddenColIds, hiddenStorageKey, visibilityLoaded]);

  function toggleCol(colId: string) {
    setHiddenColIds((cur) =>
      cur.includes(colId) ? cur.filter((id) => id !== colId) : [...cur, colId],
    );
  }

  // ── sort (server-driven: changing it clears the cache and refetches) ───────
  const [sort, setSort] = useState<{ fieldId: string; dir: "asc" | "desc" } | null>(null);

  const fetchPage = useCallback(
    async (pageIdx: number) => {
      if (requestedPages.current.has(pageIdx)) return;
      requestedPages.current.add(pageIdx);
      try {
        const page = await fetchTasksPage({
          listId,
          conditions,
          groupBy,
          sort,
          offset: pageIdx * PAGE_SIZE,
          limit: PAGE_SIZE,
          showClosed,
        });
        setRowsByOffset((prev) => {
          const next = new Map(prev);
          page.items.forEach((it, j) => next.set(pageIdx * PAGE_SIZE + j, it));
          return next;
        });
      } catch {
        requestedPages.current.delete(pageIdx); // retry on next scroll
        toast.error("Failed to load tasks");
      }
    },
    [listId, conditions, groupBy, sort, showClosed],
  );

  // Sort changes invalidate every cached offset.
  const isFirstSortRender = useRef(true);
  useEffect(() => {
    if (isFirstSortRender.current) { isFirstSortRender.current = false; return; }
    setRowsByOffset(new Map());
    requestedPages.current = new Set();
    setExpandedTaskIds(new Set());
    setChildrenByTaskId(new Map());
    requestedChildren.current = new Set();
    void fetchPage(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  /** Everything currently loaded, in offset order (used by calc footers). */
  const loadedItems = useMemo(
    () => [...rowsByOffset.entries()].sort((a, b) => a[0] - b[0]).map(([, it]) => it),
    [rowsByOffset],
  );

  // ── calculate ─────────────────────────────────────────────────────────────
  const [calcFieldIds, setCalcFieldIds] = useState<Set<string>>(new Set());

  function calcValue(fieldId: string, taskList: TaskWithMeta[]): string {
    const def = fieldDefs.find((d) => d.id === fieldId);
    if (!def) return "—";
    const vals = taskList.map(({ task }) => {
      const cf = (task.customFields ?? {}) as Record<string, unknown>;
      return cf[fieldId];
    });
    const nonEmpty = vals.filter((v) => v !== null && v !== undefined && v !== "");
    if (def.type === "number") {
      const nums = nonEmpty.map(Number).filter((n) => !isNaN(n));
      const sum = nums.reduce((a, b) => a + b, 0);
      const avg = nums.length ? (sum / nums.length).toFixed(1) : "—";
      return `Σ ${sum} · avg ${avg}`;
    }
    if (def.type === "date") {
      const dates = nonEmpty.map((v) => new Date(String(v))).filter((d) => !isNaN(d.getTime()));
      if (!dates.length) return "—";
      const min = new Date(Math.min(...dates.map((d) => d.getTime())));
      const max = new Date(Math.max(...dates.map((d) => d.getTime())));
      const fmt = (d: Date) => d.toLocaleDateString("en", { month: "short", day: "numeric" });
      return dates.length === 1 ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
    }
    return "—";
  }

  // ── column widths ─────────────────────────────────────────────────────────
  const widthStorageKey = useMemo(
    () => `aitim:task-table-widths:${fieldDefs.map((d) => d.id).join(":")}`,
    [fieldDefs],
  );
  const [widths, setWidths] = useState<Record<string, number>>({});

  useEffect(() => {
    const raw = window.localStorage.getItem(widthStorageKey);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Record<string, number>;
      const timeout = window.setTimeout(() => setWidths(saved), 0);
      return () => window.clearTimeout(timeout);
    } catch { window.localStorage.removeItem(widthStorageKey); }
  }, [widthStorageKey]);

  useEffect(() => {
    if (Object.keys(widths).length === 0) return;
    window.localStorage.setItem(widthStorageKey, JSON.stringify(widths));
  }, [widthStorageKey, widths]);

  // ── ordered visible columns ───────────────────────────────────────────────
  const orderedColumns = useMemo<ColumnDef[]>(() => {
    const hiddenSet = new Set(hiddenColIds);
    const result: ColumnDef[] = [];
    for (const id of columnOrder) {
      if (BASE_COL_MAP.has(id)) {
        if (!ALWAYS_VISIBLE.has(id) && hiddenSet.has(id)) continue;
        const base = BASE_COL_MAP.get(id)!;
        result.push({ ...base, width: widths[id] ?? base.width });
      } else if (id.startsWith("field-")) {
        if (hiddenSet.has(id)) continue;
        const def = fieldDefs.find((d) => d.id === id.slice(6));
        if (!def) continue;
        result.push({ id, label: def.label, width: widths[id] ?? 180, minWidth: COL_MIN });
      }
    }
    return result;
  }, [columnOrder, fieldDefs, hiddenColIds, widths]);

  function columnWidth(col: ColumnDef) { return widths[col.id] ?? col.width; }

  function resizeColumn(col: ColumnDef, event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = columnWidth(col);
    function onMove(e: globalThis.PointerEvent) {
      // Floor ~one character wide (28px) — no hard stop at the default column size.
      setWidths((cur) => ({
        ...cur,
        [col.id]: Math.max(COL_MIN, startWidth + e.clientX - startX),
      }));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  // ── column drag-to-reorder ────────────────────────────────────────────────
  const dragColId = useRef<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  function onColDragStart(e: DragEvent<HTMLTableCellElement>, colId: string) {
    dragColId.current = colId;
    e.dataTransfer.effectAllowed = "move";
  }
  function onColDragOver(e: DragEvent<HTMLTableCellElement>, colId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (colId !== dragColId.current) setDragOverColId(colId);
  }
  function onColDrop(e: DragEvent<HTMLTableCellElement>, targetId: string) {
    e.preventDefault();
    const srcId = dragColId.current;
    dragColId.current = null;
    setDragOverColId(null);
    if (!srcId || srcId === targetId) return;
    setColumnOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(srcId);
      const to = next.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      next.splice(from, 1);
      next.splice(to, 0, srcId);
      return next;
    });
  }
  function onColDragEnd() { dragColId.current = null; setDragOverColId(null); }

  // ── context menu (native + custom columns) ────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<TaskTableColumnMenuState | null>(null);

  function openCtxMenu(e: React.MouseEvent, colId: string) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, colId });
  }

  const ctxIsCustom = Boolean(ctxMenu?.colId.startsWith("field-"));
  const ctxFieldId = ctxIsCustom && ctxMenu ? ctxMenu.colId.slice(6) : null;
  const ctxDef = ctxFieldId ? fieldDefs.find((d) => d.id === ctxFieldId) : null;
  /** Sort key stored in state / sent to server (custom UUID or native col id). */
  const ctxSortKey = ctxIsCustom ? ctxFieldId : ctxMenu?.colId ?? null;

  function ctxSort(dir: "asc" | "desc") {
    if (!ctxSortKey) return;
    const active = sort?.fieldId === ctxSortKey && sort.dir === dir;
    setSort(active ? null : { fieldId: ctxSortKey, dir });
  }
  function ctxGroup() {
    if (!ctxMenu) return;
    let value: string;
    if (ctxIsCustom && ctxFieldId) {
      value = `cf_${ctxFieldId}`;
    } else if (GROUPABLE_BASE.has(ctxMenu.colId)) {
      value = ctxMenu.colId; // "status" | "priority"
    } else {
      setCtxMenu(null);
      return;
    }
    setCtxMenu(null);
    if (onGroupByChange) {
      onGroupByChange(value);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("groupBy", value);
    router.push(`${window.location.pathname}?${params.toString()}`);
    startTransition(() => {
      void saveListViewPrefs(listId, { groupBy: value, viewId });
    });
  }
  function ctxEditOptions() {
    router.push(`${window.location.pathname}/settings?tab=fields`);
    setCtxMenu(null);
  }
  function ctxMoveStart() {
    const colId = ctxMenu!.colId;
    setColumnOrder((prev) => [colId, ...prev.filter((id) => id !== colId)]);
    setCtxMenu(null);
  }
  function ctxMoveEnd() {
    const colId = ctxMenu!.colId;
    setColumnOrder((prev) => [...prev.filter((id) => id !== colId), colId]);
    setCtxMenu(null);
  }
  function ctxToggleCalc() {
    if (!ctxFieldId) return;
    setCalcFieldIds((prev) => {
      const next = new Set(prev);
      if (next.has(ctxFieldId)) next.delete(ctxFieldId);
      else next.add(ctxFieldId);
      return next;
    });
    setCtxMenu(null);
  }
  function ctxHide() {
    const colId = ctxMenu!.colId;
    if (ALWAYS_VISIBLE.has(colId)) {
      setCtxMenu(null);
      return;
    }
    toggleCol(colId);
    setCtxMenu(null);
  }

  const fieldDefsById = useMemo(
    () => new Map(fieldDefs.map((d) => [d.id, d])),
    [fieldDefs],
  );

  const loadedTasks = useMemo(() => {
    const out: SelectedTask[] = [];
    const seen = new Set<string>();
    for (const item of rowsByOffset.values()) {
      if (seen.has(item.task.id)) continue;
      seen.add(item.task.id);
      out.push({ id: item.task.id, number: item.task.number, title: item.task.title });
    }
    return out;
  }, [rowsByOffset]);

  const loadedIdOrder = useMemo(() => loadedTasks.map((task) => task.id), [loadedTasks]);

  const offsetByTaskId = useMemo(() => {
    const map = new Map<string, number>();
    for (const [offset, item] of rowsByOffset) map.set(item.task.id, offset);
    return map;
  }, [rowsByOffset]);

  const groupOffsetRanges = useMemo(() => {
    if (!groupBy || !groupCounts?.length) return null;
    let offset = 0;
    return groupCounts.map((group) => {
      const range = { key: group.key, start: offset, end: offset + group.count };
      offset += group.count;
      return range;
    });
  }, [groupBy, groupCounts]);

  const idsInOffsetRange = useCallback(
    (start: number, end: number) => {
      const ids: string[] = [];
      for (let offset = start; offset < end; offset++) {
        const item = rowsByOffset.get(offset);
        if (item) ids.push(item.task.id);
      }
      return ids;
    },
    [rowsByOffset],
  );

  const rangeForOffset = useCallback(
    (offset: number) => {
      if (!groupOffsetRanges) return { start: 0, end: totalCount };
      return groupOffsetRanges.find((range) => offset >= range.start && offset < range.end) ?? null;
    },
    [groupOffsetRanges, totalCount],
  );

  const toggleSelect = useCallback(
    (taskId: string, opts: { shift: boolean }) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (opts.shift && lastSelectedId.current) {
          const from = offsetByTaskId.get(lastSelectedId.current);
          const to = offsetByTaskId.get(taskId);
          if (from != null && to != null) {
            let lo = Math.min(from, to);
            let hi = Math.max(from, to);
            const range = rangeForOffset(to);
            if (range) {
              lo = Math.max(lo, range.start);
              hi = Math.min(hi, range.end - 1);
            }
            for (let offset = lo; offset <= hi; offset++) {
              const item = rowsByOffset.get(offset);
              if (item) next.add(item.task.id);
            }
            lastSelectedId.current = taskId;
            return next;
          }
        }
        if (next.has(taskId)) next.delete(taskId);
        else next.add(taskId);
        lastSelectedId.current = taskId;
        return next;
      });
    },
    [offsetByTaskId, rangeForOffset, rowsByOffset],
  );

  const allLoadedSelected = !groupOffsetRanges && loadedIdOrder.length > 0 && loadedIdOrder.every((id) => selectedIds.has(id));
  const someLoadedSelected = !groupOffsetRanges && loadedIdOrder.some((id) => selectedIds.has(id));

  const selectedTasks = useMemo(() => {
    const byId = new Map(loadedTasks.map((task) => [task.id, task]));
    return [...selectedIds].map((id) => byId.get(id) ?? { id, number: "", title: "Task" });
  }, [selectedIds, loadedTasks]);

  function renderTaskRow(
    vIndex: number,
    item: TaskWithMeta,
    opts: {
      depth?: number;
      reorderGroupKey?: string | null;
      onPatchTask?: (taskId: string, patch: Partial<TaskWithMeta["task"]>) => void;
      onPatchCustomField?: (taskId: string, defId: string, value: unknown) => void;
    } = {},
  ) {
    return (
      <TaskRow
        key={item.task.id}
        vIndex={vIndex}
        item={item}
        orderedColumns={orderedColumns}
        canEdit={canEdit}
        statuses={statuses}
        statusById={statusById}
        fieldDefsById={fieldDefsById}
        userNames={userNames}
        activeUsers={activeUsers}
        spaceTags={spaceTags}
        writableLists={writableLists}
        taskTypes={taskTypes}
        onPatchTask={opts.onPatchTask ?? patchTask}
        onPatchCustomField={opts.onPatchCustomField ?? patchCustomField}
        currentUserId={currentUserId}
        depth={opts.depth ?? 0}
        subtaskCount={item.subtaskCount}
        expanded={expandedTaskIds.has(item.task.id)}
        onToggleExpand={() => toggleExpand(item.task.id)}
        reorderEnabled={canEdit && !sort && (opts.depth ?? 0) === 0}
        reorderGroupKey={opts.reorderGroupKey ?? null}
        isDragging={draggedTask?.taskId === item.task.id}
        dropPlacement={dropTarget?.taskId === item.task.id ? dropTarget.placement : null}
        onRowDragStart={handleRowDragStart}
        onRowDragOver={handleRowDragOver}
        onRowDrop={handleRowDrop}
        onRowDragEnd={clearRowDrag}
        selected={selectedIds.has(item.task.id)}
        selectionActive={selectedIds.size > 0}
        onToggleSelect={toggleSelect}
      />
    );
  }

  // ── grouping: fixed-position segments computed from server group counts ────
  // Group sizes are known up front (groupCounts is server-ordered to match the
  // row ordering), so every group header's absolute position — and every task
  // row's absolute offset — is known before any rows load.
  const effectiveGroupBy = groupBy;

  const getGroupMeta = useCallback(
    (key: string): { label: string; color?: string } => {
      if (key === "__none__") {
        return {
          label: effectiveGroupBy === "type" ? DEFAULT_TASK_TYPE.name : "No value",
        };
      }
      if (effectiveGroupBy === "status") {
        const s = statuses.find((x) => x.id === key);
        return { label: s?.name ?? key, color: s?.color };
      }
      if (effectiveGroupBy === "priority") {
        return { label: { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" }[key] ?? key };
      }
      if (effectiveGroupBy === "type") {
        const t = taskTypes.find((x) => x.id === key);
        return { label: t?.name ?? key, color: t?.color };
      }
      if (effectiveGroupBy?.startsWith("cf_")) {
        const def = fieldDefs.find((d) => d.id === effectiveGroupBy.slice(3));
        if (!def) return { label: key };
        if (def.type === "checkbox") return { label: key === "true" ? "Yes" : "No" };
        const options = (def.options ?? []) as { id: string; label: string; color?: string }[];
        const opt = options.find((o) => o.id === key);
        if ((def.type === "color" || def.type === "dropdown") && opt) {
          return { label: opt.label, color: opt.color };
        }
        return { label: fieldOptionLabel(def, key, userNames) };
      }
      return { label: key };
    },
    [effectiveGroupBy, statuses, fieldDefs, userNames, taskTypes],
  );

  interface GroupSegment { key: string; label: string; color?: string; count: number; startOffset: number }
  const groupSegments = useMemo<GroupSegment[] | null>(() => {
    if (!effectiveGroupBy || !groupCounts) return null;
    let offset = 0;
    return groupCounts.map((g) => {
      const seg = { key: g.key, ...getGroupMeta(g.key), count: g.count, startOffset: offset };
      offset += g.count;
      return seg;
    });
  }, [effectiveGroupBy, groupCounts, getGroupMeta]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ── virtual row model over the FULL dataset (loaded or not) ────────────────
  type RowEntry =
    | { kind: "header"; seg: GroupSegment }
    | { kind: "task"; offset: number }
    | { kind: "calc"; seg: GroupSegment };

  const showCalcFooterRows = calcFieldIds.size > 0;

  // Per-segment entry index ranges (grouped mode only).
  const segmentRanges = useMemo(() => {
    if (!groupSegments) return null;
    let cursor = 0;
    const ranges = groupSegments.map((seg) => {
      const collapsed = collapsedGroups.has(seg.key);
      const bodyRows = collapsed ? 0 : seg.count + (showCalcFooterRows ? 1 : 0);
      const r = { seg, headerIndex: cursor, bodyRows, collapsed };
      cursor += 1 + bodyRows;
      return r;
    });
    return { ranges, totalEntries: cursor };
  }, [groupSegments, collapsedGroups, showCalcFooterRows]);

  const virtualCount = segmentRanges ? segmentRanges.totalEntries : totalCount;

  const resolveEntry = useCallback(
    (index: number): RowEntry => {
      if (!segmentRanges) return { kind: "task", offset: index };
      // Binary search the segment whose entry range contains this index.
      const { ranges } = segmentRanges;
      let lo = 0;
      let hi = ranges.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ranges[mid].headerIndex <= index) lo = mid;
        else hi = mid - 1;
      }
      const r = ranges[lo];
      if (index === r.headerIndex) return { kind: "header", seg: r.seg };
      const within = index - r.headerIndex - 1;
      if (showCalcFooterRows && within === r.seg.count) return { kind: "calc", seg: r.seg };
      return { kind: "task", offset: r.seg.startOffset + within };
    },
    [segmentRanges, showCalcFooterRows],
  );

  // State (not a ref) so the virtualizer re-initializes its scroll listener
  // once the element exists — a ref stays null through the first render and
  // the subscription would never attach.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && selectedIds.size > 0) {
        const openMenu = document.querySelector("[data-state='open'][data-slot='dropdown-menu-content'], [data-state='open'][data-slot='popover-content']");
        if (openMenu) return;
        setSelectedIds(new Set());
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return;
        }
        if (scrollEl && (scrollEl === document.activeElement || scrollEl.contains(document.activeElement))) {
          event.preventDefault();
          if (groupOffsetRanges && lastSelectedId.current != null) {
            const offset = offsetByTaskId.get(lastSelectedId.current);
            const range = offset != null ? rangeForOffset(offset) : null;
            setSelectedIds(range ? new Set(idsInOffsetRange(range.start, range.end)) : new Set());
          } else if (!groupOffsetRanges) {
            setSelectedIds(new Set(loadedIdOrder));
          }
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds.size, loadedIdOrder, scrollEl, groupOffsetRanges, lastSelectedId, offsetByTaskId, rangeForOffset, idsInOffsetRange]);

  // A task row's virtual slot grows to fit its (recursively) expanded, loaded
  // descendants — they render as extra sibling <tr>s riding along with the
  // same slot, so no change is needed to resolveEntry/segmentRanges above.
  const taskEntrySize = useCallback(
    (offset: number): number => {
      const item = rowsByOffset.get(offset);
      if (!item || !expandedTaskIds.has(item.task.id)) return ROW_H;
      return ROW_H * (1 + visibleDescendantEntries(item.task.id).length);
    },
    [rowsByOffset, expandedTaskIds, visibleDescendantEntries],
  );

  // TanStack Virtual intentionally exposes non-memoizable functions; the table owns them locally.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: virtualCount,
    getScrollElement: () => scrollEl,
    estimateSize: (i) => {
      if (!segmentRanges) return taskEntrySize(i);
      const entry = resolveEntry(i);
      if (entry.kind === "header") return HEADER_H;
      if (entry.kind === "calc") return ROW_H;
      return taskEntrySize(entry.offset);
    },
    // Larger overscan = fewer blank edges on a trackpad fling; rows are display-only
    // so this is mostly free. Avoid going huge (DOM still costs).
    overscan: 18,
    getItemKey: (index) => {
      const e = resolveEntry(index);
      if (e.kind === "header") return `h:${e.seg.key}`;
      if (e.kind === "calc") return `c:${e.seg.key}`;
      return rowsByOffset.get(e.offset)?.task.id ?? `t:${e.offset}`;
    },
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0 ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;

  // Convert a raw task offset to its (pre-expansion) virtual entry index —
  // inverse of resolveEntry's offset resolution, used below to tell the
  // virtualizer a specific row's size changed after an expand/collapse.
  const offsetToEntryIndex = useCallback(
    (offset: number): number | null => {
      if (!segmentRanges) return offset;
      for (const r of segmentRanges.ranges) {
        if (r.collapsed) continue;
        const start = r.seg.startOffset;
        const end = start + r.seg.count;
        if (offset >= start && offset < end) return r.headerIndex + 1 + (offset - start);
      }
      return null;
    },
    [segmentRanges],
  );

  // Tell the virtualizer to recompute sizes for expanded top-level rows
  // whenever expand state or fetched children change — resizeItem is the
  // documented @tanstack/virtual-core API for this (confirmed in the
  // installed 3.17.4 .d.ts), avoiding a full virtualizer.measure() rescan.
  useEffect(() => {
    for (const [offset, item] of rowsByOffset) {
      if (!expandedTaskIds.has(item.task.id)) continue;
      const entryIndex = offsetToEntryIndex(offset);
      if (entryIndex == null) continue;
      virtualizer.resizeItem(entryIndex, taskEntrySize(offset));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedTaskIds, childrenByTaskId, rowsByOffset, offsetToEntryIndex]);

  // ── DOM-only scroll polish (no React re-render) ────────────────────────────
  // While the finger/wheel is moving, disable pointer events on tbody so the
  // browser skips hover/style thrash across rows (classic list-view trick).
  // Does NOT swap cell content → no blink, no mass remount on settle.
  useEffect(() => {
    if (!scrollEl) return;
    const tbody = tbodyRef.current;
    let settle: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (tbody && tbody.style.pointerEvents !== "none") {
        tbody.style.pointerEvents = "none";
      }
      if (settle) clearTimeout(settle);
      settle = setTimeout(() => {
        if (tbody) tbody.style.pointerEvents = "";
      }, 90);
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      if (settle) clearTimeout(settle);
      if (tbody) tbody.style.pointerEvents = "";
    };
  }, [scrollEl]);

  // Fetch every page touching the visible window, plus one page ahead and one
  // behind (prefetch), so skeletons are rarely seen at normal scroll speeds.
  const firstVirtualIndex = virtualRows.length > 0 ? virtualRows[0].index : 0;
  const lastVirtualIndex = virtualRows.length > 0 ? virtualRows[virtualRows.length - 1].index : 0;
  useEffect(() => {
    if (totalCount === 0) return;
    let minOffset = Number.POSITIVE_INFINITY;
    let maxOffset = -1;
    for (const v of virtualRows) {
      const e = resolveEntry(v.index);
      if (e.kind !== "task") continue;
      if (e.offset < minOffset) minOffset = e.offset;
      if (e.offset > maxOffset) maxOffset = e.offset;
    }
    if (maxOffset < 0) return;
    const from = Math.max(0, minOffset - PAGE_SIZE);
    const to = Math.min(totalCount - 1, maxOffset + PAGE_SIZE);
    const lastPage = Math.floor(to / PAGE_SIZE);
    for (let p = Math.floor(from / PAGE_SIZE); p <= lastPage; p++) {
      if (!requestedPages.current.has(p)) void fetchPage(p);
    }
  // resolveEntry/virtualRows identities churn every render; the index bounds are the real inputs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstVirtualIndex, lastVirtualIndex, totalCount, fetchPage, rowsByOffset.size]);

  const totalWidth = EXPANDER_COL_WIDTH + orderedColumns.reduce((sum, col) => sum + columnWidth(col), 0);
  // +1 accounts for the fixed expander gutter column, always present.
  const colSpan = orderedColumns.length + 1;
  const totalHideable = HIDEABLE_BASE_COLS.length + fieldDefs.length;
  const visibleCount = totalHideable - hiddenColIds.filter((id) =>
    HIDEABLE_BASE_COLS.some((c) => c.id === id) || id.startsWith("field-"),
  ).length;
  const showCalcFooter = calcFieldIds.size > 0;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={cn("flex flex-col gap-3", fillViewport && "min-h-0 flex-1", selectedIds.size > 0 && "pb-16")}>
      {/* toolbar */}
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-2">
              <Columns3 className="size-4" />
              Fields
              <span className="text-muted-foreground">{visibleCount}/{totalHideable}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 overflow-y-auto w-52">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Standard fields</DropdownMenuLabel>
            {HIDEABLE_BASE_COLS.map((col) => (
              <DropdownMenuCheckboxItem
                key={col.id}
                checked={!hiddenColIds.includes(col.id)}
                onCheckedChange={() => toggleCol(col.id)}
                onSelect={(e) => e.preventDefault()}
              >
                {col.label}
              </DropdownMenuCheckboxItem>
            ))}
            {fieldDefs.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Custom fields</DropdownMenuLabel>
                {fieldDefs.map((field) => (
                  <DropdownMenuCheckboxItem
                    key={field.id}
                    checked={!hiddenColIds.includes(`field-${field.id}`)}
                    onCheckedChange={() => toggleCol(`field-${field.id}`)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {field.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/*
        Single scroll container (no nested overflow-x wrapper from <Table>).
        Nested scrollers force extra compositing and sticky-header jank.
      */}
      <div
        ref={setScrollEl}
        tabIndex={0}
        aria-label="Task table"
        className={cn(
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          fillViewport
            ? "min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-gutter:stable]"
            : "overflow-x-auto overflow-y-clip",
        )}
        style={{
          WebkitOverflowScrolling: "touch",
          // Hint the browser this surface is scroll-driven (compositor-friendly).
          willChange: "scroll-position",
        }}
      >
        <table
          className="w-full caption-bottom table-fixed border-collapse text-sm"
          style={{ width: totalWidth }}
        >
          <colgroup>
            <col style={{ width: EXPANDER_COL_WIDTH }} />
            {orderedColumns.map((col) => (
              <col key={col.id} style={{ width: columnWidth(col) }} />
            ))}
          </colgroup>
          <TableHeader className="sticky top-0 z-10 border-b border-border bg-background">
            <TableRow className="transition-none hover:bg-transparent">
              <TableHead className="p-0">
                {!groupOffsetRanges && (
                  <div className="flex h-full items-center justify-start pl-1.5">
                    <Checkbox
                      checked={allLoadedSelected ? true : someLoadedSelected ? "indeterminate" : false}
                      aria-label="Select all loaded tasks"
                      disabled={loadedIdOrder.length === 0}
                      onCheckedChange={(value) => {
                        setSelectedIds(value ? new Set(loadedIdOrder) : new Set());
                      }}
                    />
                  </div>
                )}
              </TableHead>
              {orderedColumns.map((col) => {
                const isCustom = col.id.startsWith("field-");
                const defId = isCustom ? col.id.slice(6) : null;
                const sortKey = isCustom ? defId : col.id;
                const isSorted = !!sortKey && sort?.fieldId === sortKey;
                return (
                  <TableHead
                    key={col.id}
                    draggable
                    onDragStart={(e) => onColDragStart(e, col.id)}
                    onDragOver={(e) => onColDragOver(e, col.id)}
                    onDrop={(e) => onColDrop(e, col.id)}
                    onDragEnd={onColDragEnd}
                    onContextMenu={(e) => openCtxMenu(e, col.id)}
                    className={cn(
                      "relative cursor-grab select-none pr-4 active:cursor-grabbing",
                      dragOverColId === col.id && "border-l-2 border-l-primary bg-muted/60",
                      isSorted && "bg-muted/30",
                    )}
                  >
                    <span className="block truncate">
                      {col.label}
                      {isSorted && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          {sort!.dir === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </span>
                    <div
                      role="separator"
                      aria-label={`Resize ${col.label}`}
                      aria-orientation="vertical"
                      className="absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none after:absolute after:top-2 after:right-1 after:h-[calc(100%-1rem)] after:w-px after:bg-transparent hover:after:bg-border"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        resizeColumn(col, e);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setWidths((cur) => {
                          const next = { ...cur };
                          delete next[col.id];
                          return next;
                        });
                      }}
                    />
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody ref={tbodyRef}>
            {virtualCount === 0 && (
              <TableRow className="transition-none hover:bg-transparent">
                <TableCell colSpan={colSpan} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <ListChecks className="size-6 text-muted-foreground/60" />
                    <span className="text-sm">No tasks match.</span>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {paddingTop > 0 && (
              <tr aria-hidden style={{ height: paddingTop }}>
                <td colSpan={colSpan} className="p-0" />
              </tr>
            )}
            {virtualRows.map((vRow) => {
              const entry = resolveEntry(vRow.index);
              if (entry.kind === "header") {
                const seg = entry.seg;
                const collapsed = collapsedGroups.has(seg.key);
                const groupIds = idsInOffsetRange(seg.startOffset, seg.startOffset + seg.count);
                const groupAll = groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id));
                const groupSome = groupIds.some((id) => selectedIds.has(id));
                return (
                  <TableRow
                    key={`h-${seg.key}`}
                    data-index={vRow.index}
                    className="cursor-pointer bg-muted/40 transition-none hover:bg-muted/60"
                    onClick={() => toggleGroup(seg.key)}
                  >
                    <TableCell className="p-0">
                      <div
                        className="flex h-full items-center justify-start pl-1.5"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          checked={groupAll ? true : groupSome ? "indeterminate" : false}
                          aria-label={`Select ${seg.label}`}
                          disabled={groupIds.length === 0}
                          onCheckedChange={(value) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (value) {
                                for (const id of groupIds) next.add(id);
                                lastSelectedId.current = groupIds[groupIds.length - 1] ?? lastSelectedId.current;
                              } else {
                                for (const id of groupIds) next.delete(id);
                              }
                              return next;
                            });
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell colSpan={orderedColumns.length} className="py-2">
                      <div className="flex items-center gap-2">
                        <ChevronRight
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground",
                            !collapsed && "rotate-90",
                          )}
                        />
                        {seg.color && (
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: seg.color }}
                          />
                        )}
                        <span className="text-sm font-semibold">{seg.label}</span>
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                          {seg.count}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }
              if (entry.kind === "calc") {
                const seg = entry.seg;
                const segItems: TaskWithMeta[] = [];
                for (let o = seg.startOffset; o < seg.startOffset + seg.count; o++) {
                  const it = rowsByOffset.get(o);
                  if (it) segItems.push(it);
                }
                return (
                  <TableRow
                    key={`c-${seg.key}`}
                    data-index={vRow.index}
                    className="bg-muted/20 text-xs text-muted-foreground transition-none hover:bg-muted/20"
                  >
                    <TableCell className="p-0" />
                    {orderedColumns.map((col) => {
                      if (!col.id.startsWith("field-")) return <TableCell key={col.id} />;
                      const defId = col.id.slice(6);
                      if (!calcFieldIds.has(defId)) return <TableCell key={col.id} />;
                      return (
                        <TableCell key={col.id} className="font-medium">
                          {calcValue(defId, segItems)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              }
              const item = rowsByOffset.get(entry.offset);
              if (!item) {
                // Static skeleton — no animate-pulse (CSS animation mid-scroll is costly).
                return (
                  <TableRow
                    key={`skeleton-${entry.offset}`}
                    data-index={vRow.index}
                    className="h-[37px] transition-none hover:bg-transparent"
                  >
                    <TableCell className="p-0" />
                    {orderedColumns.map((col, i) => (
                      <TableCell key={col.id} className="py-2.5">
                        <div
                          className="h-3 rounded bg-muted/70"
                          style={{ width: i === 1 ? "80%" : "55%" }}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                );
              }
              const descendants = expandedTaskIds.has(item.task.id)
                ? visibleDescendantEntries(item.task.id)
                : [];
              return (
                <Fragment key={item.task.id}>
                  {renderTaskRow(vRow.index, item, {
                    reorderGroupKey:
                      groupSegments?.find(
                        (segment) =>
                          entry.offset >= segment.startOffset &&
                          entry.offset < segment.startOffset + segment.count,
                      )?.key ?? null,
                  })}
                  {descendants.map((d) => {
                    if (d.kind !== "row") {
                      return (
                        <TableRow key={d.key} className="h-[37px] transition-none">
                          <TableCell
                            colSpan={colSpan}
                            className={cn(
                              "py-2 text-xs",
                              d.kind === "error" ? "text-destructive" : "text-muted-foreground",
                            )}
                            style={{ paddingLeft: 12 + d.depth * INDENT_PER_DEPTH }}
                          >
                            {d.kind === "loading" ? "Loading…" : "Failed to load subtasks"}
                          </TableCell>
                        </TableRow>
                      );
                    }
                    return renderTaskRow(-1, d.item, {
                      depth: d.depth,
                      onPatchTask: (taskId, patch) => patchChildTask(d.parentId, taskId, patch),
                      onPatchCustomField: (taskId, defId, value) =>
                        patchChildCustomField(d.parentId, taskId, defId, value),
                    });
                  })}
                </Fragment>
              );
            })}
            {paddingBottom > 0 && (
              <tr aria-hidden style={{ height: paddingBottom }}>
                <td colSpan={colSpan} className="p-0" />
              </tr>
            )}
          </TableBody>
          {!groupSegments && showCalcFooter && (
            <TableFooter>
              <TableRow className="bg-muted/20 text-xs text-muted-foreground transition-none hover:bg-muted/20">
                <TableCell className="p-0" />
                {orderedColumns.map((col) => {
                  if (!col.id.startsWith("field-")) return <TableCell key={col.id} />;
                  const defId = col.id.slice(6);
                  if (!calcFieldIds.has(defId)) return <TableCell key={col.id} />;
                  return (
                    <TableCell key={col.id} className="font-medium">
                      {calcValue(defId, loadedItems)}
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableFooter>
          )}
        </table>
      </div>

      {/* context menu — native columns + custom fields */}
      <TaskSelectionBar
        selected={selectedTasks}
        onClear={() => setSelectedIds(new Set())}
        canEdit={canEdit}
        statuses={statuses}
        fieldDefs={fieldDefs}
        activeUsers={activeUsers}
        spaceTags={spaceTags}
        writableLists={writableLists}
        taskTypes={taskTypes}
        currentListId={listId}
      />

      {ctxMenu && (
        <TaskTableColumnMenu
          menu={ctxMenu}
          canSort={
            ctxIsCustom
              ? Boolean(ctxDef)
              : SORTABLE_BASE.has(ctxMenu.colId)
          }
          canGroup={
            ctxIsCustom
              ? Boolean(
                  ctxDef &&
                    ["dropdown", "color", "checkbox", "user"].includes(ctxDef.type),
                )
              : GROUPABLE_BASE.has(ctxMenu.colId)
          }
          canEditOptions={Boolean(
            ctxDef && (ctxDef.type === "dropdown" || ctxDef.type === "multi_select"),
          )}
          canCalc={Boolean(ctxDef && CALCULABLE_TYPES.has(ctxDef.type))}
          canHide={!ALWAYS_VISIBLE.has(ctxMenu.colId)}
          isSorted={Boolean(ctxSortKey && sort?.fieldId === ctxSortKey)}
          sortDir={sort?.dir ?? "asc"}
          hasCalc={Boolean(ctxFieldId && calcFieldIds.has(ctxFieldId))}
          isHidden={hiddenColIds.includes(ctxMenu.colId)}
          onSort={ctxSort}
          onGroup={ctxGroup}
          onEditOptions={ctxEditOptions}
          onMoveStart={ctxMoveStart}
          onMoveEnd={ctxMoveEnd}
          onToggleCalc={ctxToggleCalc}
          onHide={ctxHide}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
