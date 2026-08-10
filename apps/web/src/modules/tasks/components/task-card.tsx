/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { CalendarClock, Paperclip } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
// ReactNode used for optional ⋯ menu slot
import { ProfileAvatar } from "@/components/shell/profile-avatar";
import { cn } from "@/lib/utils";
import { EntityIcon } from "./entity-icon";
import { TagChips } from "./tag-picker";

/**
 * Soft pastel priority badges (detail page, dense UI).
 * Table and board cards use PRIORITY_CARD_STYLES solid fills instead.
 */
export const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  normal: "bg-brand-aqua/70 text-brand-teal-deep dark:bg-primary/20 dark:text-primary",
  low: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
};

/** Solid fills for kanban/task cards. */
export const PRIORITY_CARD_STYLES: Record<string, string> = {
  urgent: "bg-red-500 text-white dark:bg-red-600",
  high: "bg-orange-500 text-white dark:bg-orange-600",
  normal: "bg-primary text-primary-foreground",
  low: "bg-slate-400 text-white dark:bg-slate-500",
};

export const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

/** Solid filled chip using a hex status color. */
export function colorFillStyle(hex: string): CSSProperties {
  return {
    backgroundColor: hex,
    color: "#fff",
  };
}

export interface TaskCardData {
  id: string;
  number: string;
  title: string;
  priority: string | null;
  dueDate: string | null;
  statusId?: string;
  statusName?: string | null;
  statusColor?: string | null;
  assignees: { id: string; displayName: string; photoKey: string | null }[];
  tags?: { id: string; name: string; color: string }[];
  hasAttachments?: boolean;
  taskType?: { id: string; name: string; icon: string | null; color: string } | null;
}

function Chip({
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
        "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none",
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}

/** Overdue / due-soon badges, computed against *now* (kept out of the component
 *  body so render stays pure for the React compiler). */
function dueUrgency(dueDate: string | null): { overdue: boolean; dueSoon: boolean } {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = Boolean(dueDate && dueDate < today);
  const dueSoon =
    Boolean(dueDate) &&
    !overdue &&
    dueDate! <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { overdue, dueSoon };
}

export function TaskCardContent({
  task,
  /** Optional ⋯ menu (ClickUp-style) rendered top-right. */
  menu,
}: {
  task: TaskCardData;
  menu?: ReactNode;
}) {
  const { overdue, dueSoon } = dueUrgency(task.dueDate);

  return (
    <div className="group/card relative box-border flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3 shadow-sm">
      {menu && (
        <div
          className={cn(
            "absolute right-1 top-1 z-10",
            // Always available on touch; reveal on hover for mouse.
            "opacity-100 sm:opacity-0 sm:group-hover/card:opacity-100 sm:focus-within:opacity-100",
          )}
        >
          {menu}
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/tasks/task/${task.number}`}
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-sm font-medium leading-snug hover:underline",
            menu && "pr-8",
          )}
        >
          {task.taskType && (
            <EntityIcon
              icon={task.taskType.icon}
              color={task.taskType.color}
              fallback="taskType"
              size="xs"
              className="shrink-0"
            />
          )}
          <span className="min-w-0 truncate">{task.title}</span>
        </Link>
        {task.hasAttachments && (
          <span
            title="Has attachments"
            aria-label="Has attachments"
            className={cn(
              "shrink-0 rounded-md bg-muted px-1.5 py-1 text-muted-foreground",
              menu && "mr-7",
            )}
          >
            <Paperclip className="size-3.5" />
          </span>
        )}
      </div>

      {task.tags && task.tags.length > 0 && <TagChips tags={task.tags} size="sm" />}

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip className="bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100">
          {task.number}
        </Chip>

        {task.statusName && task.statusColor && (
          <Chip style={colorFillStyle(task.statusColor)} title={task.statusName}>
            <span className="size-1.5 shrink-0 rounded-full bg-white/90" />
            <span className="truncate">{task.statusName}</span>
          </Chip>
        )}

        {task.priority && (
          <Chip className={PRIORITY_CARD_STYLES[task.priority] ?? PRIORITY_CARD_STYLES.normal}>
            {PRIORITY_LABELS[task.priority] ?? task.priority}
          </Chip>
        )}

        {task.dueDate && (
          <span
            title={overdue ? "Overdue" : dueSoon ? "Due soon" : "Due date"}
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-medium tabular-nums",
              overdue && "text-red-600 dark:text-red-400",
              dueSoon && !overdue && "text-amber-600 dark:text-amber-400",
              !overdue && !dueSoon && "text-muted-foreground",
            )}
          >
            <CalendarClock className="size-3 shrink-0 opacity-80" />
            {task.dueDate}
          </span>
        )}

        {task.assignees.length > 0 && (
          <span className="ml-auto flex items-center gap-1">
            <span className="flex -space-x-1.5">
              {task.assignees.slice(0, 3).map((a) => (
                <ProfileAvatar
                  key={a.id}
                  userId={a.id}
                  name={a.displayName}
                  hasPhoto={!!a.photoKey}
                  photoVersion={a.photoKey}
                  className="size-5 ring-2 ring-card"
                />
              ))}
            </span>
            {task.assignees.length > 3 && (
              <span className="text-[10px] font-medium text-muted-foreground">
                +{task.assignees.length - 3}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
