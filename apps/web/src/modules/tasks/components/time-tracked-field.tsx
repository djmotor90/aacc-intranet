"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Clock, Play, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getTaskTimeTracking, startTimeTimer, stopTimeTimer } from "../actions/time-entries";
import {
  elapsedSeconds,
  formatDuration,
  formatTimerClock,
  toIso,
} from "../lib/time";
import {
  getTimeTrackerSnapshot,
  publishTimeTrackerSnapshot,
  subscribeTimeTrackerSnapshot,
} from "../lib/time-tracker-client";
import { TimeEntryForm, type TimePerson } from "./time-entry-form";

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

function useTrackerSnapshot() {
  return useSyncExternalStore(subscribeTimeTrackerSnapshot, getTimeTrackerSnapshot, () => null);
}

export function TimeTrackedField({
  taskId,
  canEdit,
  currentUser,
  users,
  initialSeconds = 0,
}: {
  taskId: string;
  canEdit: boolean;
  currentUser: TimePerson;
  users: TimePerson[];
  initialSeconds?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [totals, setTotals] = useState<{ all: number; own: number }>({
    all: initialSeconds,
    own: initialSeconds,
  });
  const snapshot = useTrackerSnapshot();
  const mineRunning = snapshot?.runningTaskId === taskId;
  const now = useNow(mineRunning);
  const live = mineRunning && snapshot?.runningStartedAt
    ? totals.own + elapsedSeconds(snapshot.runningStartedAt, now)
    : totals.own;
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getTaskTimeTracking(taskId)
      .then((summary) => {
        if (cancelled) return;
        setTotals({ all: summary.withSubtasksSeconds, own: summary.taskSeconds });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, taskId]);

  function toggleTimer() {
    startTransition(async () => {
      try {
        if (mineRunning) {
          await stopTimeTimer();
          publishTimeTrackerSnapshot({
            userId: currentUser.id,
            runningId: null,
            runningTaskId: null,
            runningStartedAt: null,
          });
        } else {
          const row = await startTimeTimer({ taskId });
          publishTimeTrackerSnapshot({
            userId: currentUser.id,
            runningId: row.id,
            runningTaskId: row.taskId,
            runningStartedAt: toIso(row.startedAt),
          });
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update timer");
      }
    });
  }

  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3">
      <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" aria-hidden>
          <Clock className="size-3" />
        </span>
        Track time
      </span>
      <div className="flex min-w-0 items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={!canEdit}
              aria-label={
                live > 0
                  ? `Time tracked ${mineRunning ? formatTimerClock(elapsedSeconds(snapshot!.runningStartedAt!, now)) : formatDuration(live)}. Open time entry`
                  : "Track time. Open time entry"
              }
              className="inline-flex min-h-8 items-center rounded-md px-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {live > 0 ? (
                <span className="font-medium">{mineRunning ? formatTimerClock(elapsedSeconds(snapshot!.runningStartedAt!, now)) : formatDuration(live)}</span>
              ) : (
                <span className="text-muted-foreground">Start</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" role="dialog" aria-label="Log time" className="w-[26rem] p-3">
            <TimeEntryForm
              mode="task"
              taskId={taskId}
              currentUser={currentUser}
              users={users}
              totals={totals}
              onDone={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          </PopoverContent>
        </Popover>
        {canEdit && (
          <button
            type="button"
            onClick={toggleTimer}
            disabled={pending}
            aria-pressed={mineRunning}
            aria-label={mineRunning ? "Stop timer" : "Start timer"}
            className={cn(
              "flex size-7 items-center justify-center rounded-full shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mineRunning ? "bg-red-600 text-white hover:bg-red-700" : "bg-muted text-foreground hover:bg-primary hover:text-primary-foreground",
            )}
          >
            {mineRunning ? <Square className="size-2.5 fill-current" aria-hidden /> : <Play className="size-3 fill-current" aria-hidden />}
          </button>
        )}
      </div>
    </div>
  );
}

export function TimeTrackedCell({
  taskId,
  completedSeconds,
  runningStartedAt,
  runningUserId,
  canEdit,
  currentUser,
  users,
}: {
  taskId: string;
  completedSeconds: number;
  runningStartedAt: Date | string | null;
  runningUserId: string | null;
  canEdit: boolean;
  currentUser: TimePerson;
  users: TimePerson[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const snapshot = useTrackerSnapshot();
  const mineRunning = snapshot?.runningTaskId === taskId;
  const anyRunning = Boolean(runningStartedAt) || mineRunning;
  const now = useNow(anyRunning);
  const extra = mineRunning && snapshot?.runningStartedAt
    ? elapsedSeconds(snapshot.runningStartedAt, now)
    : runningStartedAt && runningUserId !== snapshot?.userId
      ? elapsedSeconds(runningStartedAt, now)
      : 0;
  const total = completedSeconds + extra;
  const [pending, startTransition] = useTransition();

  const label = useMemo(() => {
    if (mineRunning && snapshot?.runningStartedAt) return formatDuration(completedSeconds + elapsedSeconds(snapshot.runningStartedAt, now));
    if (total > 0) return formatDuration(total);
    return "Add time";
  }, [completedSeconds, mineRunning, now, snapshot?.runningStartedAt, total]);

  function toggleTimer() {
    startTransition(async () => {
      try {
        if (mineRunning) {
          await stopTimeTimer();
          publishTimeTrackerSnapshot({
            userId: currentUser.id,
            runningId: null,
            runningTaskId: null,
            runningStartedAt: null,
          });
        } else {
          const row = await startTimeTimer({ taskId });
          publishTimeTrackerSnapshot({
            userId: currentUser.id,
            runningId: row.id,
            runningTaskId: row.taskId,
            runningStartedAt: toIso(row.startedAt),
          });
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update timer");
      }
    });
  }

  if (!canEdit) {
    return (
      <span className={cn("block min-h-7 truncate px-1.5 text-sm", total === 0 && "text-muted-foreground")}>
        {total > 0 ? formatDuration(total) : "No time tracked"}
      </span>
    );
  }

  return (
    <div className="flex h-7 items-center gap-1 px-1" onClick={(e) => e.stopPropagation()}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${label}. Open time entry`}
            className={cn(
              "min-h-7 min-w-0 flex-1 truncate rounded-md px-1 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              total === 0 && "text-muted-foreground",
            )}
          >
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" role="dialog" aria-label="Log time" className="w-[26rem] p-3">
          <TimeEntryForm
            mode="task"
            taskId={taskId}
            currentUser={currentUser}
            users={users}
            totals={{ all: total, own: total }}
            onDone={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </PopoverContent>
      </Popover>
      <button
        type="button"
        onClick={toggleTimer}
        disabled={pending}
        aria-pressed={mineRunning}
        aria-label={mineRunning ? "Stop timer" : "Start timer"}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          mineRunning
            ? "bg-red-600 text-white"
            : "bg-muted text-foreground hover:bg-primary hover:text-primary-foreground",
        )}
      >
        {mineRunning ? <Square className="size-2 fill-current" aria-hidden /> : <Play className="size-2.5 fill-current" aria-hidden />}
      </button>
    </div>
  );
}
