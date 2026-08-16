"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { BarChart3, ChevronLeft, ChevronRight, Clock, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteTimeEntry, getMyTimesheet, startTimeTimer } from "../actions/time-entries";
import {
  entryDurationSeconds,
  formatDateHeading,
  formatDuration,
  formatTimeOfDay,
  formatTimeZoneLabel,
  startOfLocalWeek,
} from "../lib/time";
import type { TimeEntryRow } from "../queries";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function weekLabel(from: Date, to: Date) {
  const a = from.toLocaleDateString("en", { month: "short", day: "numeric" });
  const b = addDays(to, -1).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
  return `${a} – ${b}`;
}

export function TimesheetPage({ initialEntries, initialFrom }: { initialEntries: TimeEntryRow[]; initialFrom: string }) {
  const [from, setFrom] = useState(() => new Date(initialFrom));
  const [entries, setEntries] = useState(initialEntries);
  const [pending, startTransition] = useTransition();
  const to = addDays(from, 7);

  function buildGroups(weekStart: Date, weekEntries: TimeEntryRow[]) {
    const byDay = new Map<string, TimeEntryRow[]>();
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      byDay.set(day.toDateString(), []);
    }
    for (const entry of weekEntries) {
      const key = new Date(entry.startedAt).toDateString();
      const list = byDay.get(key);
      if (list) list.push(entry);
      else byDay.set(key, [entry]);
    }
    return [...byDay.entries()].map(([key, items]) => ({
      key,
      label: formatDateHeading(new Date(key)),
      seconds: items.reduce((sum, e) => sum + entryDurationSeconds(e), 0),
      items,
    }));
  }

  const groups = buildGroups(from, entries);

  const weekTotal = groups.reduce((sum, g) => sum + g.seconds, 0);

  function load(nextFrom: Date) {
    setFrom(nextFrom);
    startTransition(async () => {
      try {
        const next = await getMyTimesheet(nextFrom.toISOString(), addDays(nextFrom, 7).toISOString());
        setEntries(next);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load timesheet");
      }
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Clock className="size-6 text-muted-foreground" />
            My Timesheet
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review and edit the time you tracked this week.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/tasks/timesheet/dashboard">
            <BarChart3 className="size-3.5" />
            Dashboard
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
        <nav className="flex items-center gap-1" aria-label="Timesheet week">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => load(addDays(from, -7))} aria-label="Previous week">
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-[12rem] text-center text-sm font-medium" aria-live="polite">
            {weekLabel(from, to)}
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => load(addDays(from, 7))} aria-label="Next week">
            <ChevronRight className="size-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => load(startOfLocalWeek())}>
            This week
          </Button>
        </nav>
        <div className="text-sm">
          <span className="text-muted-foreground">Week total</span>{" "}
          <span className="font-semibold tabular-nums">{formatDuration(weekTotal)}</span>
        </div>
      </div>

      <div className={pending ? "pointer-events-none opacity-60" : ""} aria-busy={pending}>
        {groups.map((group) => (
          <section key={group.key} className="mb-5">
            <div className="mb-2 flex items-center justify-between px-1 text-sm">
              <h2 className="font-medium">{group.label}</h2>
              <span className="tabular-nums text-muted-foreground">{formatDuration(group.seconds)}</span>
            </div>
            {group.items.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                No time logged
              </div>
            ) : (
              <ul className="grid gap-2">
                {group.items.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3">
                    <span
                      className="mt-1 size-3 shrink-0 rounded-full border-2"
                      style={{ borderColor: entry.taskStatusColor ?? "#94a3b8" }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      {entry.taskNumber ? (
                        <Link href={`/tasks/task/${entry.taskNumber}`} className="font-medium hover:underline">
                          {entry.taskTitle}
                        </Link>
                      ) : (
                        <div className="font-medium">No task selected</div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {formatTimeOfDay(new Date(entry.startedAt))} –{" "}
                        {entry.endedAt ? formatTimeOfDay(new Date(entry.endedAt)) : "running"}{" "}
                        {formatTimeZoneLabel(new Date(entry.startedAt))}
                        {entry.billable ? " · Billable" : ""}
                      </div>
                      {entry.notes && <div className="mt-1 text-sm text-muted-foreground">{entry.notes}</div>}
                      {entry.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {entry.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium tabular-nums">{formatDuration(entryDurationSeconds(entry))}</span>
                      <button
                        type="button"
                        className="flex size-7 items-center justify-center rounded-full bg-muted text-foreground hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Start timer${entry.taskTitle ? ` on ${entry.taskTitle}` : ""}`}
                        onClick={() => {
                          startTransition(async () => {
                            try {
                              await startTimeTimer({
                                taskId: entry.taskId,
                                notes: entry.notes,
                                billable: entry.billable,
                                tags: entry.tags,
                              });
                              toast.success("Timer started");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Could not start timer");
                            }
                          });
                        }}
                      >
                        <Play className="size-3 fill-current" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="flex size-7 items-center justify-center rounded-full text-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Delete time entry${entry.taskTitle ? ` for ${entry.taskTitle}` : ""}`}
                        onClick={() => {
                          startTransition(async () => {
                            try {
                              await deleteTimeEntry(entry.id);
                              setEntries((cur) => cur.filter((e) => e.id !== entry.id));
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Could not delete entry");
                            }
                          });
                        }}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
