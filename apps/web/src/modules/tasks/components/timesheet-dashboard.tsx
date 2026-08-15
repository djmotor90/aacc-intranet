"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Clock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { entryDurationSeconds, formatDuration } from "../lib/time";
import type { TimeEntryRow } from "../queries";

export function TimesheetDashboard({
  entries,
  weekLabel,
}: {
  entries: TimeEntryRow[];
  weekLabel: string;
}) {
  const total = entries.reduce((sum, e) => sum + entryDurationSeconds(e), 0);
  const billable = entries
    .filter((e) => e.billable)
    .reduce((sum, e) => sum + entryDurationSeconds(e), 0);
  const byDay = Array.from({ length: 7 }, (_, i) => {
    const label = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i];
    const seconds = entries
      .filter((e) => new Date(e.startedAt).getDay() === i)
      .reduce((sum, e) => sum + entryDurationSeconds(e), 0);
    return { label, seconds };
  });
  const maxDay = Math.max(1, ...byDay.map((d) => d.seconds));
  const byTask = new Map<string, { title: string; href: string | null; seconds: number }>();
  for (const entry of entries) {
    const key = entry.taskId ?? "none";
    const current = byTask.get(key) ?? {
      title: entry.taskTitle ?? "No task selected",
      href: entry.taskNumber ? `/tasks/task/${entry.taskNumber}` : null,
      seconds: 0,
    };
    current.seconds += entryDurationSeconds(entry);
    byTask.set(key, current);
  }
  const topTasks = [...byTask.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 8);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Time dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">{weekLabel}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/tasks/timesheet">
            <Clock className="size-3.5" />
            My Timesheet
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Tracked" value={formatDuration(total)} />
        <Stat label="Billable" value={formatDuration(billable)} />
        <Stat
          label="Billable share"
          value={total ? `${Math.round((billable / total) * 100)}%` : "0%"}
        />
      </div>

      <section className="rounded-2xl border bg-card p-4">
        <h2 className="mb-4 text-sm font-medium">Hours by day</h2>
        <div className="flex h-40 items-end gap-2">
          {byDay.map((day) => (
            <div key={day.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-28 w-full items-end justify-center">
                <div
                  className="w-8 rounded-t-lg bg-primary/80"
                  style={{ height: `${Math.max(day.seconds ? 8 : 2, Math.round((day.seconds / maxDay) * 100))}%` }}
                  role="img"
                  aria-label={`${day.label}: ${formatDuration(day.seconds)}`}
                />
              </div>
              <div className="text-[11px] text-muted-foreground">{day.label}</div>
              <div className="text-[11px] tabular-nums">{formatDuration(day.seconds)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium">Top tasks</h2>
        {topTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No time logged this week.</p>
        ) : (
          <ul className="grid gap-2">
            {topTasks.map((task) => (
              <li key={task.title + task.seconds} className="flex items-center justify-between gap-3 text-sm">
                {task.href ? (
                  <Link href={task.href} className="min-w-0 truncate hover:underline">
                    {task.title}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate">{task.title}</span>
                )}
                <span className="shrink-0 tabular-nums text-muted-foreground">{formatDuration(task.seconds)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
