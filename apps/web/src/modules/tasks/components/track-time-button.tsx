"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { BarChart3, Clock, Play, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { announce } from "@/components/a11y";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  deleteTimeEntry,
  getMyTimeTrackerState,
  startTimeTimer,
  stopTimeTimer,
  type TimeTrackerState,
} from "../actions/time-entries";
import {
  DEFAULT_DAILY_CAPACITY_SECONDS,
  elapsedSeconds,
  entryDurationSeconds,
  formatDateHeading,
  formatDuration,
  formatTimeOfDay,
  formatTimerClock,
  formatTimeZoneLabel,
  toIso,
} from "../lib/time";
import { publishTimeTrackerSnapshot } from "../lib/time-tracker-client";
import { TimeEntryForm } from "./time-entry-form";
import type { TimeEntryRow } from "../queries";

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

function groupEntries(entries: TimeEntryRow[]) {
  const groups: { key: string; label: string; seconds: number; items: TimeEntryRow[] }[] = [];
  const index = new Map<string, number>();
  for (const entry of entries) {
    const key = new Date(entry.startedAt).toDateString();
    let i = index.get(key);
    if (i === undefined) {
      i = groups.length;
      index.set(key, i);
      groups.push({
        key,
        label: formatDateHeading(new Date(entry.startedAt)),
        seconds: 0,
        items: [],
      });
    }
    groups[i].items.push(entry);
    groups[i].seconds += entryDurationSeconds(entry);
  }
  return groups;
}

export function TrackTimeButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<TimeTrackerState | null>(null);
  const [pending, startTransition] = useTransition();
  const running = state?.running ?? null;
  const now = useNow(Boolean(running));

  const load = useCallback(async () => {
    const next = await getMyTimeTrackerState();
    setState(next);
    publishTimeTrackerSnapshot({
      userId: next.currentUser.id,
      runningId: next.running?.id ?? null,
      runningTaskId: next.running?.taskId ?? null,
      runningStartedAt: next.running ? toIso(next.running.startedAt) : null,
    });
  }, []);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  useEffect(() => {
    if (open) void load().catch(() => {});
  }, [open, load]);

  const liveToday = useMemo(() => {
    if (!state) return 0;
    if (!running) return state.todaySeconds;
    return state.todaySeconds + elapsedSeconds(running.startedAt, now);
  }, [now, running, state]);

  const headerLabel = running
    ? formatTimerClock(elapsedSeconds(running.startedAt, now))
    : formatDuration(liveToday, { zero: "0:00:00" });

  function toggleHeaderTimer() {
    startTransition(async () => {
      try {
        if (running) {
          await stopTimeTimer();
          announce("Timer stopped");
        } else {
          await startTimeTimer({});
          announce("Timer started");
        }
        await load();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update timer");
      }
    });
  }

  const groups = state ? groupEntries(state.recent.filter((e) => e.endedAt)) : [];
  const capacity = state?.capacitySeconds ?? DEFAULT_DAILY_CAPACITY_SECONDS;
  const usedPct = Math.min(100, Math.round((liveToday / capacity) * 100));

  return (
    <div className="inline-flex items-center gap-0.5">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2 text-xs font-medium tabular-nums",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            running
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-transparent text-foreground hover:bg-muted",
          )}
          aria-label={
            running
              ? `Track time, timer running ${headerLabel}`
              : `Track time, ${headerLabel} today`
          }
        >
          <Clock className="size-3.5" aria-hidden />
          <span className="hidden sm:inline" aria-live="polite" aria-atomic="true">
            {headerLabel}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        role="dialog"
        aria-labelledby="track-time-title"
        className="w-[26rem] max-h-[min(36rem,80vh)] overflow-y-auto p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div id="track-time-title" className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="size-4 text-muted-foreground" aria-hidden />
            Track Time
          </div>
          <div className="text-sm font-medium tabular-nums" aria-label={`${formatDuration(liveToday)} of ${formatDuration(capacity)} today`}>
            {formatDuration(liveToday)}/{formatDuration(capacity)}
          </div>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={usedPct}
          aria-label="Daily capacity used"
          className="h-1 bg-muted"
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${usedPct}%` }} />
        </div>
        <div className="p-3">
          {state ? (
            <TimeEntryForm
              mode="global"
              currentUser={state.currentUser}
              users={state.users}
              onDone={() => {
                void load();
                router.refresh();
              }}
            />
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          )}
        </div>
        {groups.length > 0 && (
          <div className="border-t px-3 pb-2 pt-1">
            {groups.map((group) => (
              <section key={group.key} className="py-2" aria-label={group.label}>
                <div className="mb-1.5 flex items-center justify-between px-1 text-xs text-muted-foreground">
                  <h3 className="font-medium text-muted-foreground">{group.label}</h3>
                  <span>{formatDuration(group.seconds)}</span>
                </div>
                <ul className="grid gap-1.5">
                  {group.items.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-start gap-2 rounded-xl border bg-card px-3 py-2"
                    >
                      <span
                        className="mt-1 size-3 shrink-0 rounded-full border"
                        style={{ borderColor: entry.taskStatusColor ?? "#94a3b8" }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {entry.taskId && entry.taskNumber ? (
                              <Link
                                href={`/tasks/task/${entry.taskNumber}`}
                                className="block truncate text-sm font-medium hover:underline"
                              >
                                {entry.taskTitle}
                              </Link>
                            ) : (
                              <div className="truncate text-sm font-medium">No task selected</div>
                            )}
                            <div className="truncate text-[11px] text-muted-foreground">
                              {formatDateHeading(new Date(entry.startedAt))}, {formatTimeOfDay(new Date(entry.startedAt))} –{" "}
                              {entry.endedAt ? formatTimeOfDay(new Date(entry.endedAt)) : "running"}{" "}
                              {formatTimeZoneLabel(new Date(entry.startedAt))}
                            </div>
                            {entry.notes && (
                              <div className="truncate text-[11px] text-muted-foreground">{entry.notes}</div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {formatDuration(entry.durationSeconds)}
                            </span>
                            <button
                              type="button"
                              aria-label={`Start timer on ${entry.taskTitle ?? "no task"}`}
                              disabled={pending}
                              className="flex size-6 items-center justify-center rounded-full bg-muted text-foreground hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => {
                                startTransition(async () => {
                                  try {
                                    await startTimeTimer({
                                      taskId: entry.taskId,
                                      notes: entry.notes,
                                      billable: entry.billable,
                                      tags: entry.tags,
                                    });
                                    await load();
                                  } catch (e) {
                                    toast.error(e instanceof Error ? e.message : "Could not start timer");
                                  }
                                });
                              }}
                            >
                              <Play className="size-2.5 fill-current" aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete time entry${entry.taskTitle ? ` for ${entry.taskTitle}` : ""}`}
                              disabled={pending}
                              className="flex size-6 items-center justify-center rounded-full text-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => {
                                startTransition(async () => {
                                  try {
                                    await deleteTimeEntry(entry.id);
                                    await load();
                                  } catch (e) {
                                    toast.error(e instanceof Error ? e.message : "Could not delete entry");
                                  }
                                });
                              }}
                            >
                              <Trash2 className="size-3" aria-hidden />
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 border-t p-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/tasks/timesheet" onClick={() => setOpen(false)}>
              <Clock className="size-3.5" />
              My Timesheet
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/tasks/timesheet/dashboard" onClick={() => setOpen(false)}>
              <BarChart3 className="size-3.5" />
              Dashboard
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
      <button
        type="button"
        onClick={toggleHeaderTimer}
        disabled={pending}
        aria-pressed={Boolean(running)}
        aria-label={running ? "Stop timer" : "Start timer"}
        className={cn(
          "flex size-7 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          running ? "bg-red-600 text-white" : "bg-muted text-foreground hover:bg-primary hover:text-primary-foreground",
        )}
      >
        {running ? <Square className="size-2.5 fill-current" aria-hidden /> : <Play className="size-2.5 fill-current" aria-hidden />}
      </button>
    </div>
  );
}
