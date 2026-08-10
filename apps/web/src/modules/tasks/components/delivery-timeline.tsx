/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Milestone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TaskProgress } from "../queries";

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Not a component (no JSX) — computed once per server render from the current
 * time, kept out of DeliveryTimeline's body so the component itself stays pure.
 */
function computeProgress(
  progress: TaskProgress,
  startDate: string | null,
  dueDate: string | null,
): { percent: number; basis: "checklist" | "dates"; doneUnits: number; totalUnits: number } | null {
  const totalUnits = progress.subtasksTotal + progress.checklistTotal;
  const doneUnits = progress.subtasksDone + progress.checklistDone;

  if (totalUnits > 0) {
    return { percent: clampPercent((doneUnits / totalUnits) * 100), basis: "checklist", doneUnits, totalUnits };
  }
  if (startDate && dueDate) {
    const start = new Date(startDate).getTime();
    const due = new Date(dueDate).getTime();
    if (!isNaN(start) && !isNaN(due) && due > start) {
      const percent = clampPercent(((Date.now() - start) / (due - start)) * 100);
      return { percent, basis: "dates", doneUnits, totalUnits };
    }
  }
  return null;
}

/**
 * "How far are we" progress bar for Project-type tasks: driven by subtask +
 * checklist completion when either exist, else falls back to start/due dates.
 */
export function DeliveryTimeline({
  progress: taskProgress,
  startDate,
  dueDate,
}: {
  progress: TaskProgress;
  startDate: string | null;
  dueDate: string | null;
}) {
  const result = computeProgress(taskProgress, startDate, dueDate);
  const percent = result?.percent ?? null;
  const basis = result?.basis ?? null;
  const doneUnits = result?.doneUnits ?? 0;
  const totalUnits = result?.totalUnits ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Milestone className="size-3" />
          </span>
          Delivery Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {percent === null ? (
          <p className="text-sm text-muted-foreground">
            Add subtasks or a checklist (or set both a start and due date) to track progress here.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-semibold tabular-nums">{percent}%</span>
              <span className="text-xs text-muted-foreground">
                {basis === "checklist"
                  ? `${doneUnits} of ${totalUnits} done`
                  : "Based on start/due dates"}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width]",
                  percent >= 100 ? "bg-green-500" : "bg-primary",
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
            {totalUnits > 0 && (
              <div className="flex gap-4 text-xs text-muted-foreground">
                {taskProgress.subtasksTotal > 0 && (
                  <span>{taskProgress.subtasksDone}/{taskProgress.subtasksTotal} subtasks</span>
                )}
                {taskProgress.checklistTotal > 0 && (
                  <span>{taskProgress.checklistDone}/{taskProgress.checklistTotal} checklist items</span>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
