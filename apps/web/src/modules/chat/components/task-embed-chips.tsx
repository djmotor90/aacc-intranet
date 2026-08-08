/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TaskListEmbed } from "../lib/types";

export function TaskEmbedChips({ embed }: { embed: TaskListEmbed }) {
  if (!embed.items.length) return null;
  return (
    <ol className="mt-2 space-y-1.5">
      {embed.items.map((item, i) => (
        <li key={item.taskId} className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
          <Link
            href={`/tasks/task/${encodeURIComponent(item.number)}`}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            {item.title}
          </Link>
          {item.status && (
            <Badge
              variant="secondary"
              className="h-5 px-1.5 text-[10px] uppercase"
              style={
                item.statusColor
                  ? { backgroundColor: `${item.statusColor}22`, color: item.statusColor }
                  : undefined
              }
            >
              {item.status}
            </Badge>
          )}
          {item.dueDate && (
            <span className="text-xs text-muted-foreground">due {item.dueDate}</span>
          )}
          {item.priority && item.priority !== "normal" && (
            <span
              className={cn(
                "text-xs capitalize",
                item.priority === "urgent" && "font-medium text-red-600",
                item.priority === "high" && "text-orange-600",
              )}
            >
              priority: {item.priority}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
