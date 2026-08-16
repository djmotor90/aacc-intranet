"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  Archive,
  Calendar,
  Copy,
  Files,
  FolderInput,
  ListChecks,
  MoreHorizontal,
  Shapes,
  Tag,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  bulkAddAssignee,
  bulkAddTag,
  bulkArchive,
  bulkCopyToList,
  bulkDuplicate,
  bulkFollow,
  bulkMoveToList,
  bulkSetCustomField,
  bulkSetDate,
  bulkSetPriority,
  bulkSetTaskType,
  bulkTrash,
  bulkUpdateStatus,
  convertTasksToSubtasks,
} from "../actions";
import { DEFAULT_TASK_TYPE } from "../lib/task-types";
import type { TaskTypeMeta, WritableListOption } from "../queries";
import { PRIORITY_LABELS } from "./task-card";
import type { TagOption } from "./tag-picker";

type StatusLike = { id: string; name: string; color: string };
type FieldDefLike = { id: string; key: string; label: string; type: string; options: unknown };

export type SelectedTask = { id: string; number: string; title: string };

const BAR_BTN =
  "h-8 gap-1.5 rounded-full px-2.5 text-xs font-medium text-white/90 hover:bg-white/10 hover:text-white";

export function TaskSelectionBar({
  selected,
  onClear,
  canEdit,
  statuses,
  fieldDefs,
  activeUsers,
  spaceTags,
  writableLists,
  taskTypes,
  currentListId,
}: {
  selected: SelectedTask[];
  onClear: () => void;
  canEdit: boolean;
  statuses: StatusLike[];
  fieldDefs: FieldDefLike[];
  activeUsers: { id: string; displayName: string; photoKey: string | null }[];
  spaceTags: TagOption[];
  writableLists: WritableListOption[];
  taskTypes: TaskTypeMeta[];
  currentListId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ids = useMemo(() => selected.map((t) => t.id), [selected]);
  const count = selected.length;
  const otherLists = writableLists.filter((list) => list.id !== currentListId);

  function run(label: string, action: () => Promise<unknown>, opts?: { clear?: boolean }) {
    if (pending || ids.length === 0) return;
    startTransition(async () => {
      try {
        await action();
        toast.success(`${label} · ${count} task${count === 1 ? "" : "s"}`);
        if (opts?.clear) onClear();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Could not ${label.toLowerCase()}`);
      }
    });
  }

  if (count === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label={`${count} selected`}
      className="pointer-events-none fixed inset-x-3 bottom-5 z-40 flex justify-center md:left-64"
    >
      <div className="pointer-events-auto flex max-w-[min(72rem,calc(100vw-1.5rem))] flex-wrap items-center gap-0.5 rounded-full bg-brand-teal-deep px-2 py-1.5 text-white shadow-xl shadow-brand-teal-deep/25">
        <span className="flex items-center gap-1.5 pl-2 pr-1 text-xs font-semibold">
          {count} {count === 1 ? "task" : "tasks"} selected
          <button
            type="button"
            onClick={onClear}
            className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Clear selection"
          >
            <X className="size-3.5" />
          </button>
        </span>
        <span className="mx-1 h-4 w-px bg-white/20" aria-hidden />

        {canEdit && (
          <>
            <Menu label="Status" icon={<ListChecks className="size-3.5" />}>
              {statuses.map((status) => (
                <BarItem
                  key={status.id}
                  onSelect={() => run("Status updated", () => bulkUpdateStatus(ids, status.id))}
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
                  {status.name}
                </BarItem>
              ))}
            </Menu>

            <Menu label="Assignees" icon={<UserPlus className="size-3.5" />}>
              {activeUsers.map((person) => (
                <BarItem
                  key={person.id}
                  onSelect={() => run("Assignee added", () => bulkAddAssignee(ids, person.id))}
                >
                  {person.displayName}
                </BarItem>
              ))}
            </Menu>

            <DatesMenu
              disabled={pending}
              onDue={(value) => run("Dates updated", () => bulkSetDate(ids, "dueDate", value))}
              onStart={(value) => run("Start date updated", () => bulkSetDate(ids, "startDate", value))}
            />

            {fieldDefs.length > 0 && (
              <CustomFieldsMenu
                fieldDefs={fieldDefs}
                users={activeUsers}
                onApply={(defId, value) =>
                  run("Custom field updated", () => bulkSetCustomField(ids, defId, value))
                }
              />
            )}

            {spaceTags.length > 0 && (
              <Menu label="Tags" icon={<Tag className="size-3.5" />}>
                {spaceTags.map((tag) => (
                  <BarItem key={tag.id} onSelect={() => run("Tag added", () => bulkAddTag(ids, tag.id))}>
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </BarItem>
                ))}
              </Menu>
            )}

            {otherLists.length > 0 && (
              <Menu label="Move/Add" icon={<FolderInput className="size-3.5" />}>
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Move to
                </p>
                {otherLists.map((list) => (
                  <BarItem
                    key={`m-${list.id}`}
                    onSelect={() =>
                      run("Moved", () => bulkMoveToList(ids, list.id), { clear: true })
                    }
                  >
                    {list.spaceName} / {list.name}
                  </BarItem>
                ))}
                <DropdownMenuSeparator />
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Add a copy to
                </p>
                {otherLists.map((list) => (
                  <BarItem
                    key={`c-${list.id}`}
                    onSelect={() => run("Copied", () => bulkCopyToList(ids, list.id))}
                  >
                    {list.spaceName} / {list.name}
                  </BarItem>
                ))}
              </Menu>
            )}

            <ConvertMenu
              selected={selected}
              onConvert={(parentId, childIds) =>
                run("Converted to subtasks", () => convertTasksToSubtasks(parentId, childIds), {
                  clear: true,
                })
              }
            />
          </>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={BAR_BTN}
          disabled={pending}
          onClick={() => {
            const text = selected.map((t) => `${window.location.origin}/tasks/task/${t.number}`).join("\n");
            void navigator.clipboard.writeText(text).then(
              () => toast.success("Links copied"),
              () => toast.error("Could not copy"),
            );
          }}
        >
          <Copy className="size-3.5" />
          Copy
        </Button>

        {canEdit && (
          <>
            <IconAction
              label="Duplicate"
              disabled={pending}
              onClick={() => run("Duplicated", () => bulkDuplicate(ids))}
            >
              <Files className="size-3.5" />
            </IconAction>
            <IconAction
              label="Archive"
              disabled={pending}
              onClick={() => run("Archived", () => bulkArchive(ids), { clear: true })}
            >
              <Archive className="size-3.5" />
            </IconAction>
            <IconAction
              label="Delete"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Move ${count} task${count === 1 ? "" : "s"} to Trash?`)) return;
                run("Moved to Trash", () => bulkTrash(ids), { clear: true });
              }}
            >
              <Trash2 className="size-3.5 text-red-300" />
            </IconAction>
          </>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className={cn(BAR_BTN, "pr-3")}>
              <MoreHorizontal className="size-3.5" />
              More
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {canEdit && (
              <>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Priority</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {(["urgent", "high", "normal", "low"] as const).map((p) => (
                      <DropdownMenuItem
                        key={p}
                        onSelect={() => run("Priority updated", () => bulkSetPriority(ids, p))}
                      >
                        {PRIORITY_LABELS[p]}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem onSelect={() => run("Priority cleared", () => bulkSetPriority(ids, null))}>
                      Clear
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Shapes className="size-4" />
                    Task Type
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      onSelect={() => run("Task type updated", () => bulkSetTaskType(ids, null))}
                    >
                      {DEFAULT_TASK_TYPE.name}
                    </DropdownMenuItem>
                    {taskTypes.map((type) => (
                      <DropdownMenuItem
                        key={type.id}
                        onSelect={() => run("Task type updated", () => bulkSetTaskType(ids, type.id))}
                      >
                        {type.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onSelect={() => run("Following", () => bulkFollow(ids, true))}>
                  Follow
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => run("Unfollowed", () => bulkFollow(ids, false))}>
                  Unfollow
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => run("Duplicated", () => bulkDuplicate(ids))}>
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => run("Archived", () => bulkArchive(ids), { clear: true })}>
                  Archive
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    if (!confirm(`Move ${count} task${count === 1 ? "" : "s"} to Trash?`)) return;
                    run("Moved to Trash", () => bulkTrash(ids), { clear: true });
                  }}
                >
                  Remove from list (Trash)
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem
              onSelect={() => {
                void navigator.clipboard.writeText(selected.map((t) => t.number).join(", ")).then(
                  () => toast.success("IDs copied"),
                  () => toast.error("Could not copy"),
                );
              }}
            >
              Copy IDs to clipboard
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function Menu({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className={BAR_BTN}>
          {icon}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="max-h-80 w-56 overflow-auto">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BarItem({ children, onSelect }: { children: ReactNode; onSelect: () => void }) {
  return (
    <DropdownMenuItem className="gap-2" onSelect={onSelect}>
      {children}
    </DropdownMenuItem>
  );
}

function IconAction({
  label,
  children,
  disabled,
  onClick,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="size-8 rounded-full text-white/90 hover:bg-white/10 hover:text-white"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function DatesMenu({
  disabled,
  onDue,
  onStart,
}: {
  disabled: boolean;
  onDue: (value: string | null) => void;
  onStart: (value: string | null) => void;
}) {
  const [due, setDue] = useState("");
  const [start, setStart] = useState("");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className={BAR_BTN} disabled={disabled}>
          <Calendar className="size-3.5" />
          Dates
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="center">
        <div className="grid gap-1.5">
          <label htmlFor="bulk-due" className="text-xs font-medium">
            Due date
          </label>
          <Input id="bulk-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <Button type="button" size="sm" onClick={() => onDue(due || null)}>
            Apply due date
          </Button>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="bulk-start" className="text-xs font-medium">
            Start date
          </label>
          <Input id="bulk-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <Button type="button" size="sm" variant="outline" onClick={() => onStart(start || null)}>
            Apply start date
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CustomFieldsMenu({
  fieldDefs,
  users,
  onApply,
}: {
  fieldDefs: FieldDefLike[];
  users: { id: string; displayName: string }[];
  onApply: (defId: string, value: unknown) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className={BAR_BTN}>
          Custom Fields
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="max-h-80 w-64 overflow-auto">
        {fieldDefs.map((def) => {
          const options = (def.options ?? []) as { id: string; label: string }[];
          if (def.type === "dropdown" || def.type === "color") {
            return (
              <DropdownMenuSub key={def.id}>
                <DropdownMenuSubTrigger>{def.label}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {options.map((opt) => (
                    <DropdownMenuItem key={opt.id} onSelect={() => onApply(def.id, opt.id)}>
                      {opt.label || opt.id}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          }
          if (def.type === "checkbox") {
            return (
              <DropdownMenuSub key={def.id}>
                <DropdownMenuSubTrigger>{def.label}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onSelect={() => onApply(def.id, true)}>Yes</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onApply(def.id, false)}>No</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          }
          if (def.type === "user") {
            return (
              <DropdownMenuSub key={def.id}>
                <DropdownMenuSubTrigger>{def.label}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {users.map((person) => (
                    <DropdownMenuItem key={person.id} onSelect={() => onApply(def.id, person.id)}>
                      {person.displayName}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          }
          return (
            <DropdownMenuItem
              key={def.id}
              onSelect={() => {
                const next = window.prompt(`Set ${def.label}`);
                if (next == null) return;
                onApply(def.id, def.type === "number" ? Number(next) : next);
              }}
            >
              {def.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConvertMenu({
  selected,
  onConvert,
}: {
  selected: SelectedTask[];
  onConvert: (parentId: string, childIds: string[]) => void;
}) {
  if (selected.length < 2) {
    return (
      <Button type="button" variant="ghost" size="sm" className={BAR_BTN} disabled title="Select two or more tasks">
        Convert to Subtasks
      </Button>
    );
  }
  return (
    <Menu label="Convert to Subtasks" icon={<ListChecks className="size-3.5" />}>
      <p className="px-2 py-1 text-[11px] text-muted-foreground">Keep this task as the parent</p>
      {selected.map((task) => (
        <BarItem
          key={task.id}
          onSelect={() => onConvert(task.id, selected.filter((row) => row.id !== task.id).map((row) => row.id))}
        >
          <span className="truncate">
            {task.number} · {task.title}
          </span>
        </BarItem>
      ))}
    </Menu>
  );
}
