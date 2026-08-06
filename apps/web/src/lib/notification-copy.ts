/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Human-readable notification titles and relative time for the inbox UI.
 */

export type NotificationTypeKey =
  | "assigned"
  | "mentioned"
  | "comment"
  | "status_changed"
  | "due_soon"
  | "form_submission"
  | string;

export function notificationHeadline(params: {
  type: NotificationTypeKey;
  actorName: string | null;
  payload?: Record<string, unknown> | null;
}): string {
  const actor = params.actorName?.trim() || null;
  const p = params.payload ?? {};

  switch (params.type) {
    case "assigned":
      return actor ? `${actor} assigned you to a task` : "You were assigned to a task";
    case "mentioned":
      return actor ? `${actor} mentioned you` : "You were mentioned";
    case "comment":
      return actor ? `${actor} commented` : "New comment";
    case "status_changed": {
      if (p.kind === "assignee_added") {
        return actor ? `${actor} updated assignees` : "Assignees updated";
      }
      if (p.kind === "assignee_removed") {
        return actor ? `${actor} updated assignees` : "Assignees updated";
      }
      const from = p.from != null ? String(p.from) : null;
      const to = p.to != null ? String(p.to) : null;
      const change =
        from || to ? `${from ?? "?"} → ${to ?? "?"}` : null;
      if (actor && change) return `${actor} changed status · ${change}`;
      if (actor) return `${actor} changed status`;
      return change ? `Status changed · ${change}` : "Status changed";
    }
    case "due_soon":
      return "Task due soon";
    case "form_submission": {
      const form = typeof p.formName === "string" ? p.formName : null;
      return form ? `New request on ${form}` : "New customer request";
    }
    default:
      return actor ? `${actor} · ${params.type}` : String(params.type);
  }
}

export function notificationSnippet(
  type: NotificationTypeKey,
  payload?: Record<string, unknown> | null,
): string | null {
  const p = payload ?? {};
  if (type === "comment" || type === "mentioned") {
    const preview = typeof p.preview === "string" ? p.preview.trim() : "";
    return preview ? preview : null;
  }
  if (type === "status_changed") {
    // Already in headline when possible
    return null;
  }
  return null;
}

/** Compact relative time for inbox rows. */
export function formatNotificationTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const ms = Date.now() - d.getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 45) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day}d`;
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export type TimeBucket = "today" | "yesterday" | "earlier";

export function notificationTimeBucket(date: Date | string): TimeBucket {
  const d = typeof date === "string" ? new Date(date) : date;
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  if (d >= startToday) return "today";
  if (d >= startYesterday) return "yesterday";
  return "earlier";
}

export const TIME_BUCKET_LABELS: Record<TimeBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

export const NOTIFICATION_TYPE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "assigned", label: "Assigned" },
  { value: "mentioned", label: "Mentions" },
  { value: "comment", label: "Comments" },
  { value: "status_changed", label: "Status" },
  { value: "due_soon", label: "Due soon" },
  { value: "form_submission", label: "Forms" },
];

/** Collapse bursty comment/mention activity for a cleaner inbox. */
export type GroupedInboxItem =
  | { kind: "single"; item: import("@/modules/shell/actions/notifications").InboxNotification }
  | {
      kind: "group";
      id: string;
      type: string;
      count: number;
      items: import("@/modules/shell/actions/notifications").InboxNotification[];
      latest: import("@/modules/shell/actions/notifications").InboxNotification;
    };

const GROUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export function groupInboxItems(
  items: import("@/modules/shell/actions/notifications").InboxNotification[],
): GroupedInboxItem[] {
  const out: GroupedInboxItem[] = [];
  let i = 0;
  while (i < items.length) {
    const cur = items[i]!;
    const groupable = cur.type === "comment" || cur.type === "mentioned";
    if (!groupable || !cur.taskId || !cur.actorId) {
      out.push({ kind: "single", item: cur });
      i += 1;
      continue;
    }
    const batch = [cur];
    let j = i + 1;
    const latestTs = new Date(cur.createdAt).getTime();
    while (j < items.length) {
      const next = items[j]!;
      if (
        next.type === cur.type &&
        next.taskId === cur.taskId &&
        next.actorId === cur.actorId &&
        Math.abs(latestTs - new Date(next.createdAt).getTime()) <= GROUP_WINDOW_MS
      ) {
        batch.push(next);
        j += 1;
      } else break;
    }
    if (batch.length >= 3) {
      out.push({
        kind: "group",
        id: `grp-${cur.id}`,
        type: cur.type,
        count: batch.length,
        items: batch,
        latest: cur,
      });
      i = j;
    } else {
      out.push({ kind: "single", item: cur });
      i += 1;
    }
  }
  return out;
}

export function groupHeadline(params: {
  type: string;
  actorName: string | null;
  count: number;
  taskNumber: string | null;
}): string {
  const actor = params.actorName?.trim() || "Someone";
  const task = params.taskNumber ? ` on ${params.taskNumber}` : "";
  if (params.type === "comment") {
    return `${actor} left ${params.count} comments${task}`;
  }
  if (params.type === "mentioned") {
    return `${actor} mentioned you ${params.count} times${task}`;
  }
  return `${actor} · ${params.count} updates${task}`;
}

