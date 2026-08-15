"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Circle, Clock, DollarSign, ListTodo, Play, StickyNote, Tag, X } from "lucide-react";
import { useId, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { announce } from "@/components/a11y";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  logTimeEntry,
  searchTimeTasks,
  startTimeTimer,
  stopTimeTimer,
} from "../actions/time-entries";
import {
  formatDuration,
  fromDatetimeLocalValue,
  parseDurationInput,
  toDatetimeLocalValue,
  toIso,
} from "../lib/time";
import { publishTimeTrackerSnapshot } from "../lib/time-tracker-client";
import type { TimeTaskSuggestion } from "../queries";

export interface TimePerson {
  id: string;
  displayName: string;
  photoKey: string | null;
}

export function TimeEntryForm({
  mode,
  taskId: initialTaskId = null,
  currentUser,
  users,
  totals,
  onDone,
}: {
  mode: "task" | "global";
  taskId?: string | null;
  currentUser: TimePerson;
  users: TimePerson[];
  totals?: { all: number; own: number };
  onDone?: () => void;
}) {
  const [userId, setUserId] = useState(currentUser.id);
  const [taskId, setTaskId] = useState<string | null>(initialTaskId);
  const [taskQuery, setTaskQuery] = useState("");
  const [taskHits, setTaskHits] = useState<TimeTaskSuggestion[]>([]);
  const [taskOpen, setTaskOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TimeTaskSuggestion | null>(null);
  const [durationText, setDurationText] = useState("");
  const [startedAt, setStartedAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [endedAt, setEndedAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [notes, setNotes] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [billable, setBillable] = useState(false);
  const [pending, startTransition] = useTransition();
  const formId = useId();
  const userFieldId = `${formId}-user`;
  const durationId = `${formId}-duration`;
  const startId = `${formId}-start`;
  const endId = `${formId}-end`;
  const notesId = `${formId}-notes`;
  const tagsId = `${formId}-tags`;
  const taskListId = `${formId}-tasks`;
  const durationHintId = `${formId}-duration-hint`;

  const selectedUser = users.find((u) => u.id === userId) ?? currentUser;
  const parsedSeconds = useMemo(() => parseDurationInput(durationText), [durationText]);
  const canSave = parsedSeconds !== null && parsedSeconds > 0 && !pending;

  function addTag(raw: string) {
    const next = raw.trim().replace(/^,/, "").slice(0, 40);
    if (!next) return;
    setTags((cur) => (cur.some((t) => t.toLowerCase() === next.toLowerCase()) ? cur : [...cur, next].slice(0, 12)));
    setTagDraft("");
  }

  function applyDuration(seconds: number) {
    const end = fromDatetimeLocalValue(endedAt) ?? new Date();
    const start = new Date(end.getTime() - seconds * 1000);
    setStartedAt(toDatetimeLocalValue(start));
    setEndedAt(toDatetimeLocalValue(end));
  }

  function applyRange(nextStart: string, nextEnd: string) {
    setStartedAt(nextStart);
    setEndedAt(nextEnd);
    const a = fromDatetimeLocalValue(nextStart);
    const b = fromDatetimeLocalValue(nextEnd);
    if (a && b && b > a) {
      setDurationText(formatDuration(Math.round((b.getTime() - a.getTime()) / 1000), { zero: "" }));
    }
  }

  function searchTasks(q: string) {
    setTaskQuery(q);
    startTransition(async () => {
      try {
        const hits = await searchTimeTasks(q);
        setTaskHits(hits);
        setTaskOpen(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not search tasks");
      }
    });
  }

  function save() {
    if (parsedSeconds === null || parsedSeconds <= 0) {
      toast.error("Enter time like 3h 20m");
      return;
    }
    let start = fromDatetimeLocalValue(startedAt);
    let end = fromDatetimeLocalValue(endedAt);
    if (!start || !end || end <= start) {
      end = new Date();
      start = new Date(end.getTime() - parsedSeconds * 1000);
    }
    startTransition(async () => {
      try {
        await logTimeEntry({
          taskId: mode === "task" ? initialTaskId : taskId,
          userId,
          startedAt: start.toISOString(),
          endedAt: end.toISOString(),
          notes: notes.trim() || null,
          billable,
          tags,
        });
        announce("Time saved");
        toast.success("Time saved");
        setDurationText("");
        setNotes("");
        onDone?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save time");
      }
    });
  }

  function startTimer() {
    startTransition(async () => {
      try {
        const row = await startTimeTimer({
          taskId: mode === "task" ? initialTaskId : taskId,
          notes: notes.trim() || null,
          billable,
          tags,
        });
        publishTimeTrackerSnapshot({
          userId: currentUser.id,
          runningId: row.id,
          runningTaskId: row.taskId,
          runningStartedAt: toIso(row.startedAt),
        });
        announce("Timer started");
        toast.success("Timer started");
        onDone?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not start timer");
      }
    });
  }

  function stopTimer() {
    startTransition(async () => {
      try {
        await stopTimeTimer();
        publishTimeTrackerSnapshot({
          userId: currentUser.id,
          runningId: null,
          runningTaskId: null,
          runningStartedAt: null,
        });
        announce("Timer stopped");
        toast.success("Timer stopped");
        onDone?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not stop timer");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      {totals && (
        <div className="grid gap-1.5 text-sm">
          <div className="flex items-center justify-between font-medium">
            <span>Time on all tasks</span>
            <span>{formatDuration(totals.all)}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Circle className="size-3.5" aria-hidden />
              Without subtasks
            </span>
            <span>{formatDuration(totals.own)}</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-2.5 py-2">
        <UserAvatar
          userId={selectedUser.id}
          name={selectedUser.displayName}
          hasPhoto={Boolean(selectedUser.photoKey)}
          photoVersion={selectedUser.photoKey}
          className="size-6"
        />
        <label htmlFor={userFieldId} className="sr-only">
          Log time for
        </label>
        <select
          id={userFieldId}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="h-8 min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
              {u.id === currentUser.id ? " (you)" : ""}
            </option>
          ))}
        </select>
      </div>

      {mode === "global" && (
        <div className="relative">
          <button
            type="button"
            aria-expanded={taskOpen}
            aria-controls={taskListId}
            aria-haspopup="listbox"
            onClick={() => {
              setTaskOpen((o) => !o);
              if (!taskHits.length) searchTasks("");
            }}
            className="flex min-h-10 w-full items-center gap-2 rounded-xl border bg-background px-3 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {selectedTask ? (
              <>
                <Circle className="size-3.5 shrink-0" aria-hidden style={{ color: selectedTask.statusColor ?? undefined }} />
                <span className="min-w-0 flex-1 truncate font-medium">{selectedTask.title}</span>
              </>
            ) : (
              <>
                <ListTodo className="size-3.5 text-muted-foreground" aria-hidden />
                <span>Select task</span>
              </>
            )}
          </button>
          {taskOpen && (
            <div
              id={taskListId}
              className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-lg"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setTaskOpen(false);
                }
              }}
            >
              <label htmlFor={`${formId}-task-search`} className="sr-only">
                Search tasks
              </label>
              <Input
                id={`${formId}-task-search`}
                autoFocus
                value={taskQuery}
                placeholder="Search tasks…"
                className="rounded-none border-0 border-b"
                onChange={(e) => searchTasks(e.target.value)}
                role="combobox"
                aria-expanded
                aria-controls={`${formId}-task-options`}
                aria-autocomplete="list"
              />
              <ul id={`${formId}-task-options`} role="listbox" className="max-h-56 overflow-auto py-1">
                <li role="option" aria-selected={taskId === null}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setTaskId(null);
                      setSelectedTask(null);
                      setTaskOpen(false);
                    }}
                  >
                    No task selected
                  </button>
                </li>
                {taskHits.map((hit) => (
                  <li key={hit.id} role="option" aria-selected={taskId === hit.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted"
                      onClick={() => {
                        setTaskId(hit.id);
                        setSelectedTask(hit);
                        setTaskOpen(false);
                      }}
                    >
                      <span className="truncate text-sm font-medium">{hit.title}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {hit.number} · {hit.spaceName} / {hit.listName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <label htmlFor={durationId} className="sr-only">
          Time duration
        </label>
        <Input
          id={durationId}
          value={durationText}
          aria-describedby={durationHintId}
          onChange={(e) => {
            const next = e.target.value;
            setDurationText(next);
            const seconds = parseDurationInput(next);
            if (seconds && seconds > 0) applyDuration(seconds);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          placeholder="Enter time (ex: 3h 20m) or start timer"
          className="h-11 rounded-xl pr-12"
        />
        <p id={durationHintId} className="sr-only">
          Examples: 3h 20m, 45m, or 1:30. Use the start timer button to track live.
        </p>
        <button
          type="button"
          onClick={startTimer}
          disabled={pending}
          aria-label="Start timer"
          className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-foreground hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Play className="size-3.5 fill-current" aria-hidden />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <label htmlFor={startId} className="sr-only">
          Start date and time
        </label>
        <input
          id={startId}
          type="datetime-local"
          value={startedAt}
          onChange={(e) => applyRange(e.target.value, endedAt)}
          className="h-8 rounded-md border bg-transparent px-2 text-xs text-foreground"
        />
        <span aria-hidden>–</span>
        <label htmlFor={endId} className="sr-only">
          End date and time
        </label>
        <input
          id={endId}
          type="datetime-local"
          value={endedAt}
          onChange={(e) => applyRange(startedAt, e.target.value)}
          className="h-8 rounded-md border bg-transparent px-2 text-xs text-foreground"
        />
      </div>

      <div className="flex items-center gap-2 text-sm">
        <StickyNote className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <label htmlFor={notesId} className="sr-only">
          Notes
        </label>
        <input
          id={notesId}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes"
          className="h-8 min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <Tag className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground"
          >
            {tag}
            <button
              type="button"
              onClick={() => setTags((cur) => cur.filter((t) => t !== tag))}
              aria-label={`Remove tag ${tag}`}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <label htmlFor={tagsId} className="sr-only">
          Add tags
        </label>
        <input
          id={tagsId}
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(tagDraft);
            }
          }}
          onBlur={() => addTag(tagDraft)}
          placeholder="Add tags"
          className="h-8 min-w-[8rem] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-3">
        <button
          type="button"
          role="switch"
          aria-checked={billable}
          aria-label="Billable"
          onClick={() => setBillable((v) => !v)}
          className={cn(
            "inline-flex min-h-8 items-center gap-2 rounded-full border px-1 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            billable
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : "border-transparent text-foreground hover:bg-muted",
          )}
        >
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-full transition-colors",
              billable ? "bg-emerald-600 text-white" : "bg-muted",
            )}
            aria-hidden
          >
            <DollarSign className="size-3.5" />
          </span>
          {billable ? "Billable" : "Not billable"}
        </button>
        <div className="flex items-center gap-2">
          {mode === "global" && (
            <Button type="button" variant="ghost" size="sm" onClick={stopTimer} disabled={pending}>
              Stop timer
            </Button>
          )}
          <Button type="button" size="sm" onClick={save} disabled={!canSave}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
