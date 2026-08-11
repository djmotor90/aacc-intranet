"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */

import { Check, X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateTaskStatus } from "../actions";

export function TaskStatusCircle({
  name,
  color,
  category,
}: {
  name?: string;
  color?: string;
  category?: string;
}) {
  const statusName = name ?? "Unknown status";
  const statusColor = color ?? "#94a3b8";
  const resolvedCategory = category ?? "open";

  return (
    <span
      title={statusName}
      aria-label={`Status: ${statusName}`}
      role="img"
      className="relative inline-flex size-3.5 shrink-0 items-center justify-center rounded-full align-middle shadow-[0_0_0_0.5px_rgba(255,255,255,0.35)]"
      style={
        resolvedCategory === "done" || resolvedCategory === "cancelled"
          ? { backgroundColor: statusColor }
          : { borderColor: statusColor, borderWidth: 1.5, borderStyle: resolvedCategory === "open" ? "dashed" : "solid" }
      }
    >
      {resolvedCategory === "active" && (
        <span
          className="absolute inset-[1.5px] rounded-full"
          style={{ background: `linear-gradient(90deg, ${statusColor} 50%, transparent 50%)` }}
          aria-hidden
        />
      )}
      {resolvedCategory === "done" && <Check className="size-2 stroke-[3] text-white" aria-hidden />}
      {resolvedCategory === "cancelled" && <X className="size-2 stroke-[3] text-white" aria-hidden />}
    </span>
  );
}

interface StatusOption {
  id: string;
  name: string;
  color: string;
  category?: string;
}

export function TaskStatusPicker({
  taskId,
  statusId,
  statuses,
  canEdit,
  onSaved,
}: {
  taskId: string;
  statusId: string;
  statuses: StatusOption[];
  canEdit: boolean;
  onSaved: (statusId: string) => void;
}) {
  const [, startTransition] = useTransition();
  const current = statuses.find((status) => status.id === statusId);

  if (!canEdit) {
    return <TaskStatusCircle name={current?.name} color={current?.color} category={current?.category} />;
  }

  function selectStatus(nextStatusId: string) {
    if (nextStatusId === statusId) return;
    onSaved(nextStatusId);
    startTransition(async () => {
      try {
        await updateTaskStatus(taskId, nextStatusId);
      } catch (error) {
        onSaved(statusId);
        toast.error(error instanceof Error ? error.message : "Could not update status");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={`Change status${current ? `: ${current.name}` : ""}`}
          aria-label={`Change status${current ? ` from ${current.name}` : ""}`}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className="flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <TaskStatusCircle name={current?.name} color={current?.color} category={current?.category} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {statuses.map((status) => (
          <DropdownMenuCheckboxItem
            key={status.id}
            checked={status.id === statusId}
            onCheckedChange={() => selectStatus(status.id)}
            className="gap-2"
          >
            <TaskStatusCircle name={status.name} color={status.color} category={status.category} />
            <span className="truncate">{status.name}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
