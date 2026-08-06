/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { ExternalLink, ListTodo } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { resolveTaskForEmbed } from "@/modules/docs/actions/resolve-task";

export type TaskEmbedAttrs = {
  taskId: string | null;
  taskNumber: string | null;
  title: string | null;
  statusName: string | null;
  statusColor: string | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    taskEmbed: {
      setTaskEmbed: (attrs: Partial<TaskEmbedAttrs>) => ReturnType;
    };
  }
}

function TaskEmbedView({ node, selected, updateAttributes }: NodeViewProps) {
  const taskNumber = String(node.attrs.taskNumber ?? "");
  const [title, setTitle] = useState<string | null>(
    (node.attrs.title as string | null) ?? null,
  );
  const [statusName, setStatusName] = useState<string | null>(
    (node.attrs.statusName as string | null) ?? null,
  );
  const [statusColor, setStatusColor] = useState<string | null>(
    (node.attrs.statusColor as string | null) ?? null,
  );
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!taskNumber) return;
    let cancelled = false;
    void (async () => {
      try {
        const meta = await resolveTaskForEmbed(taskNumber);
        if (cancelled) return;
        if (!meta) {
          setMissing(true);
          return;
        }
        setMissing(false);
        setTitle(meta.title);
        setStatusName(meta.statusName);
        setStatusColor(meta.statusColor);
        updateAttributes({
          taskId: meta.id,
          taskNumber: meta.number,
          title: meta.title,
          statusName: meta.statusName,
          statusColor: meta.statusColor,
        });
      } catch {
        if (!cancelled) setMissing(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when number changes
  }, [taskNumber]);

  const href = taskNumber ? `/tasks/task/${encodeURIComponent(taskNumber)}` : "#";

  return (
    <NodeViewWrapper
      as="div"
      className={cn(
        "aitim-task-embed my-2 not-prose",
        selected && "ring-2 ring-ring rounded-lg",
      )}
      data-type="task-embed"
      data-task-number={taskNumber || undefined}
    >
      <Link
        href={href}
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm transition-colors",
          "hover:border-primary/40 hover:bg-muted/40",
          missing && "border-destructive/40 bg-destructive/5",
        )}
        contentEditable={false}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ListTodo className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-mono text-xs font-semibold text-primary">
            {taskNumber || "—"}
          </span>
          <span className="mt-0.5 block truncate text-foreground">
            {missing
              ? "Task not found or no access"
              : title || "Loading…"}
          </span>
        </span>
        {statusName && !missing && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
            style={{
              backgroundColor: statusColor || "var(--muted-foreground)",
            }}
          >
            {statusName}
          </span>
        )}
        <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
      </Link>
    </NodeViewWrapper>
  );
}

/**
 * Live task chip embed — stores task number + cached title/status.
 * Slash: / Task · or insert via command.
 */
export const TaskEmbed = Node.create({
  name: "taskEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      taskId: { default: null },
      taskNumber: { default: null },
      title: { default: null },
      statusName: { default: null },
      statusColor: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="task-embed"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "task-embed",
        "data-task-number": node.attrs.taskNumber ?? "",
        "data-task-id": node.attrs.taskId ?? "",
        "data-title": node.attrs.title ?? "",
        "data-status-name": node.attrs.statusName ?? "",
        "data-status-color": node.attrs.statusColor ?? "",
        class: "aitim-task-embed",
      }),
      `${node.attrs.taskNumber ?? ""} ${node.attrs.title ?? ""}`.trim() ||
        "Task",
    ];
  },

  addCommands() {
    return {
      setTaskEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              taskId: attrs.taskId ?? null,
              taskNumber: attrs.taskNumber ?? null,
              title: attrs.title ?? null,
              statusName: attrs.statusName ?? null,
              statusColor: attrs.statusColor ?? null,
            },
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskEmbedView);
  },
});
