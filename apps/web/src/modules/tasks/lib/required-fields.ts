/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
/** Built-in task fields that can be marked required on create (per list). */
export const CORE_FIELD_KEYS = [
  "priority",
  "dueDate",
  "startDate",
  "assignees",
  "description",
  "tags",
] as const;

export type CoreFieldKey = (typeof CORE_FIELD_KEYS)[number];

export const CORE_FIELD_LABELS: Record<CoreFieldKey, string> = {
  priority: "Priority",
  dueDate: "Due date",
  startDate: "Start date",
  assignees: "Assignees",
  description: "Description",
  tags: "Tags",
};

export function parseRequiredCoreFields(raw: unknown): CoreFieldKey[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(CORE_FIELD_KEYS);
  return raw.filter((k): k is CoreFieldKey => typeof k === "string" && allowed.has(k));
}

export function isCoreFieldRequired(required: CoreFieldKey[], key: CoreFieldKey): boolean {
  return required.includes(key);
}
