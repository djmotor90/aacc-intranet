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
  Bell,
  BellOff,
  Copy,
  ExternalLink,
  FolderInput,
  FolderOutput,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  archiveTaskById,
  copyTaskToList,
  duplicateTask,
  getTaskFollowState,
  moveTaskToList,
  toggleTaskFollow,
  trashTaskById,
} from "../actions";
import type { WritableListOption } from "../queries";

export type TaskMenuTask = {
  id: string;
  number: string;
  title: string;
  listId: string;
};

function taskUrl(number: string): string {
  if (typeof window === "undefined") return `/tasks/task/${number}`;
  return `${window.location.origin}/tasks/task/${encodeURIComponent(number)}`;
}

async function copyText(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Could not copy ${label.toLowerCase()}`);
  }
}

type MenuApi = {
  Item: typeof ContextMenuItem | typeof DropdownMenuItem;
  Label: typeof ContextMenuLabel | typeof DropdownMenuLabel;
  Separator: typeof ContextMenuSeparator | typeof DropdownMenuSeparator;
  Sub: typeof ContextMenuSub | typeof DropdownMenuSub;
  SubTrigger: typeof ContextMenuSubTrigger | typeof DropdownMenuSubTrigger;
  SubContent: typeof ContextMenuSubContent | typeof DropdownMenuSubContent;
};

function useTaskMenuLogic({
  task,
  lists,
  redirectOnRemove,
}: {
  task: TaskMenuTask;
  lists: WritableListOption[];
  /** When set, navigate here after archive/delete succeeds instead of refreshing in place
   *  (the current page — e.g. the task detail view — no longer has anything to show). */
  redirectOnRemove?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState<boolean | null>(null);

  const otherLists = useMemo(
    () => lists.filter((l) => l.id !== task.listId),
    [lists, task.listId],
  );

  const listsBySpace = useMemo(() => {
    const map = new Map<string, { spaceName: string; lists: WritableListOption[] }>();
    for (const l of otherLists) {
      const g = map.get(l.spaceId) ?? { spaceName: l.spaceName, lists: [] };
      g.lists.push(l);
      map.set(l.spaceId, g);
    }
    return [...map.values()].sort((a, b) => a.spaceName.localeCompare(b.spaceName));
  }, [otherLists]);

  function loadFollow() {
    void getTaskFollowState(task.id)
      .then((r) => setFollowing(r.following))
      .catch(() => setFollowing(null));
  }

  function run(action: () => Promise<void>, opts?: { success?: string; leavesPage?: boolean }) {
    if (busy || pending) return;
    setBusy(true);
    startTransition(async () => {
      try {
        await action();
        if (opts?.success) toast.success(opts.success);
        if (opts?.leavesPage && redirectOnRemove) {
          router.push(redirectOnRemove);
        } else {
          router.refresh();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    });
  }

  function toggleFollow() {
    if (busy || pending) return;
    setBusy(true);
    startTransition(async () => {
      try {
        const r = await toggleTaskFollow(task.id);
        setFollowing(r.following);
        toast.success(r.following ? "Following task" : "Unfollowed task");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update follow");
      } finally {
        setBusy(false);
      }
    });
  }

  return {
    busy: busy || pending,
    following,
    loadFollow,
    toggleFollow,
    run,
    otherLists,
    listsBySpace,
  };
}

function TaskMenuBody({
  task,
  canEdit,
  api,
  logic,
}: {
  task: TaskMenuTask;
  canEdit: boolean;
  api: MenuApi;
  logic: ReturnType<typeof useTaskMenuLogic>;
}) {
  const { Item, Label, Separator, Sub, SubTrigger, SubContent } = api;
  const { busy, following, toggleFollow, run, listsBySpace, otherLists } = logic;

  return (
    <>
      <Label className="truncate font-normal text-muted-foreground">
        {task.number}
        {task.title ? ` · ${task.title}` : ""}
      </Label>
      <Separator />

      <div className="mx-1 mb-1 flex divide-x divide-border overflow-hidden rounded-md border border-border">
        <Item
          className="flex-1 justify-center whitespace-nowrap rounded-none"
          onSelect={() => void copyText("Link", taskUrl(task.number))}
        >
          Copy link
        </Item>
        <Item
          className="flex-1 justify-center whitespace-nowrap rounded-none"
          onSelect={() => void copyText("ID", task.number)}
        >
          Copy ID
        </Item>
        <Item
          className="flex-1 justify-center whitespace-nowrap rounded-none"
          onSelect={() => {
            window.open(taskUrl(task.number), "_blank", "noopener,noreferrer");
          }}
        >
          New tab
        </Item>
      </div>

      <Separator />

      <Item disabled={busy || following === null} onSelect={() => toggleFollow()}>
        {following ? (
          <>
            <BellOff className="size-4" />
            Unfollow task
          </>
        ) : (
          <>
            <Bell className="size-4" />
            Follow task
          </>
        )}
      </Item>

      <Item asChild>
        <Link href={`/tasks/task/${task.number}`}>
          <ExternalLink className="size-4" />
          Open
        </Link>
      </Item>
      <Item onSelect={() => void copyText("Title", task.title)}>
        <Pencil className="size-4" />
        Copy title
      </Item>

      {canEdit && (
        <>
          <Separator />

          <Item
            disabled={busy}
            onSelect={() =>
              run(() => duplicateTask(task.id).then(() => undefined), {
                success: "Task duplicated",
              })
            }
          >
            <Copy className="size-4" />
            Duplicate
          </Item>

          {otherLists.length > 0 && (
            <>
              <Sub>
                <SubTrigger disabled={busy}>
                  <FolderInput className="size-4" />
                  Move to
                </SubTrigger>
                <SubContent className="max-h-72 w-56 overflow-y-auto">
                  {listsBySpace.map((group) => (
                    <div key={group.spaceName}>
                      <Label>{group.spaceName}</Label>
                      {group.lists.map((l) => (
                        <Item
                          key={l.id}
                          disabled={busy}
                          onSelect={() =>
                            run(() => moveTaskToList(task.id, l.id), {
                              success: `Moved to ${l.name}`,
                            })
                          }
                        >
                          {l.name}
                        </Item>
                      ))}
                    </div>
                  ))}
                </SubContent>
              </Sub>

              <Sub>
                <SubTrigger disabled={busy}>
                  <FolderOutput className="size-4" />
                  Copy to
                </SubTrigger>
                <SubContent className="max-h-72 w-56 overflow-y-auto">
                  {listsBySpace.map((group) => (
                    <div key={group.spaceName}>
                      <Label>{group.spaceName}</Label>
                      {group.lists.map((l) => (
                        <Item
                          key={l.id}
                          disabled={busy}
                          onSelect={() =>
                            run(() => copyTaskToList(task.id, l.id).then(() => undefined), {
                              success: `Copied to ${l.name}`,
                            })
                          }
                        >
                          {l.name}
                        </Item>
                      ))}
                    </div>
                  ))}
                </SubContent>
              </Sub>
            </>
          )}

          <Separator />

          <Item
            disabled={busy}
            onSelect={() => {
              if (
                !window.confirm(
                  `Archive “${task.title}”? You can restore later from activity if needed.`,
                )
              ) {
                return;
              }
              run(() => archiveTaskById(task.id), { success: "Task archived", leavesPage: true });
            }}
          >
            <Archive className="size-4" />
            Archive
          </Item>
          <Item
            variant="destructive"
            disabled={busy}
            onSelect={() => {
              if (
                !window.confirm(
                  `Move “${task.title}” (${task.number}) to Trash?\n\nSubtasks move with it. You can restore it later from Settings → Trash.`,
                )
              ) {
                return;
              }
              run(() => trashTaskById(task.id), { success: "Task moved to Trash", leavesPage: true });
            }}
          >
            <Trash2 className="size-4" />
            Delete
          </Item>
        </>
      )}

      {!canEdit && (
        <>
          <Separator />
          <Item disabled className="text-muted-foreground">
            <MoreHorizontal className="size-4" />
            View only
          </Item>
        </>
      )}
    </>
  );
}

/**
 * Right-click menu on a task title / card (existing pattern).
 */
export function TaskContextMenu({
  task,
  canEdit,
  lists,
  children,
  className,
  asChild = true,
  onOpenChange,
  redirectOnRemove,
}: {
  task: TaskMenuTask;
  canEdit: boolean;
  lists: WritableListOption[];
  children: ReactNode;
  className?: string;
  asChild?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Path to navigate to after archive/delete — pass the list URL when this menu
   *  lives on the task's own detail page, so removing the task doesn't 404 it. */
  redirectOnRemove?: string;
}) {
  const logic = useTaskMenuLogic({ task, lists, redirectOnRemove });

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) logic.loadFollow();
        onOpenChange?.(open);
      }}
    >
      <ContextMenuTrigger asChild={asChild} className={className}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <TaskMenuBody
          task={task}
          canEdit={canEdit}
          logic={logic}
          api={{
            Item: ContextMenuItem,
            Label: ContextMenuLabel,
            Separator: ContextMenuSeparator,
            Sub: ContextMenuSub,
            SubTrigger: ContextMenuSubTrigger,
            SubContent: ContextMenuSubContent,
          }}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * ClickUp-style ⋯ control — opens the same actions as a dropdown (top-right of cards).
 */
export function TaskActionsMenu({
  task,
  canEdit,
  lists,
  className,
  buttonClassName,
  align = "end",
  redirectOnRemove,
}: {
  task: TaskMenuTask;
  canEdit: boolean;
  lists: WritableListOption[];
  className?: string;
  buttonClassName?: string;
  align?: "start" | "center" | "end";
  /** Path to navigate to after archive/delete — pass the list URL when this menu
   *  lives on the task's own detail page, so removing the task doesn't 404 it. */
  redirectOnRemove?: string;
}) {
  const logic = useTaskMenuLogic({ task, lists, redirectOnRemove });
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) logic.loadFollow();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            // Plain ⋯ — no border / chip chrome (ClickUp-style)
            "inline-flex size-7 items-center justify-center rounded-md",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-muted/60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            buttonClassName,
          )}
          aria-label="Task actions"
          title="Task actions"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDown={(e) => {
            // Don't start board drag when opening the menu.
            e.stopPropagation();
          }}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={cn("w-56", className)}>
        <TaskMenuBody
          task={task}
          canEdit={canEdit}
          logic={logic}
          api={{
            Item: DropdownMenuItem,
            Label: DropdownMenuLabel,
            Separator: DropdownMenuSeparator,
            Sub: DropdownMenuSub,
            SubTrigger: DropdownMenuSubTrigger,
            SubContent: DropdownMenuSubContent,
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** @deprecated Prefer TaskActionsMenu — kept for older call sites. */
export function TaskContextMenuButton({
  className,
  ...props
}: {
  className?: string;
} & Omit<ComponentProps<typeof TaskContextMenu>, "children" | "asChild" | "className">) {
  return (
    <TaskActionsMenu
      task={props.task}
      canEdit={props.canEdit}
      lists={props.lists}
      buttonClassName={className}
    />
  );
}
