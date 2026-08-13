"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setTaskType } from "../actions";
import { DEFAULT_TASK_TYPE } from "../lib/task-types";
import type { TaskTypeMeta } from "../queries";
import { EntityIcon } from "./entity-icon";

/**
 * Type badge in the task detail toolbar — this dropdown is both "set the type"
 * and "convert to [Type]" (there's no separate convert action; picking a
 * different type here does it).
 */
export function TaskTypeSelect({
  taskId,
  current,
  options,
  canEdit,
}: {
  taskId: string;
  current: TaskTypeMeta | null;
  options: TaskTypeMeta[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function select(next: TaskTypeMeta | null) {
    if (next?.id === current?.id) return;
    startTransition(async () => {
      try {
        await setTaskType(taskId, next?.id ?? null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to change task type");
      }
    });
  }

  if (!canEdit) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
        <EntityIcon icon={current?.icon ?? null} color={current?.color} fallback="taskType" size="xs" />
        {current?.name ?? DEFAULT_TASK_TYPE.name}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium hover:bg-muted/70"
          title="Change task type"
        >
          <EntityIcon icon={current?.icon ?? null} color={current?.color} fallback="taskType" size="xs" />
          {current?.name ?? DEFAULT_TASK_TYPE.name}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => select(null)} className="gap-2">
          <EntityIcon fallback="taskType" size="xs" />
          {DEFAULT_TASK_TYPE.name}
        </DropdownMenuItem>
        {options.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => select(t)} className="gap-2">
            <EntityIcon icon={t.icon} color={t.color} fallback="taskType" size="xs" />
            {t.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
