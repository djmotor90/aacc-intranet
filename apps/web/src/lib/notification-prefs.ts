/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Defaults and helpers for in-app / email notification preferences.
 */

import type { NotificationType } from "@/lib/notify";

export type ChannelPrefs = { inApp: boolean; email: boolean };

export type NotificationPrefsMap = Partial<Record<NotificationType, ChannelPrefs>>;

export type EmailDigest = "instant" | "hourly" | "off";

export const NOTIFICATION_EVENT_META: {
  type: NotificationType;
  label: string;
  description: string;
}[] = [
  {
    type: "assigned",
    label: "Assigned to me",
    description: "When someone assigns you to a task",
  },
  {
    type: "mentioned",
    label: "Mentions",
    description: "When someone @mentions you in a comment or description",
  },
  {
    type: "comment",
    label: "Comments",
    description: "When someone comments on a task you’re involved in",
  },
  {
    type: "status_changed",
    label: "Status changes",
    description: "When status changes on a task you’re involved in",
  },
  {
    type: "due_soon",
    label: "Due soon",
    description: "Reminders for tasks due today or tomorrow",
  },
  {
    type: "form_submission",
    label: "Form submissions",
    description: "New workflow submissions from public forms",
  },
];

/** Sensible defaults: in-app on for all; email only for high-signal types. */
export const DEFAULT_TYPE_PREFS: Record<NotificationType, ChannelPrefs> = {
  assigned: { inApp: true, email: true },
  mentioned: { inApp: true, email: true },
  comment: { inApp: true, email: false },
  status_changed: { inApp: true, email: false },
  due_soon: { inApp: true, email: true },
  form_submission: { inApp: true, email: true },
};

export function resolveTypePrefs(
  stored: unknown,
  type: NotificationType,
): ChannelPrefs {
  const map = (stored && typeof stored === "object" ? stored : {}) as NotificationPrefsMap;
  const row = map[type];
  const base = DEFAULT_TYPE_PREFS[type];
  return {
    inApp: typeof row?.inApp === "boolean" ? row.inApp : base.inApp,
    email: typeof row?.email === "boolean" ? row.email : base.email,
  };
}

export function normalizePrefsMap(stored: unknown): Record<NotificationType, ChannelPrefs> {
  const out = { ...DEFAULT_TYPE_PREFS };
  for (const meta of NOTIFICATION_EVENT_META) {
    out[meta.type] = resolveTypePrefs(stored, meta.type);
  }
  return out;
}

/** Types that warrant a soft toast when the inbox is closed. */
export const TOAST_TYPES = new Set<string>(["assigned", "mentioned", "due_soon"]);
