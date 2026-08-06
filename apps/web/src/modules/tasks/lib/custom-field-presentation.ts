/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */

export const CUSTOM_FIELD_LABEL_POSITION_VALUES = [
  "top",
  "left",
  "right",
  "bottom",
  "inside",
  "hidden",
] as const;

export type CustomFieldLabelPosition =
  (typeof CUSTOM_FIELD_LABEL_POSITION_VALUES)[number];

export const CUSTOM_FIELD_LABEL_POSITIONS: {
  value: CustomFieldLabelPosition;
  label: string;
  description: string;
}[] = [
  { value: "top", label: "Top", description: "Above the field" },
  { value: "left", label: "Left", description: "Beside the field, on the left" },
  { value: "right", label: "Right", description: "Beside the field, on the right" },
  { value: "bottom", label: "Bottom", description: "Below the field" },
  { value: "inside", label: "Inside", description: "Shown as the field prompt" },
  { value: "hidden", label: "Hidden", description: "Visually hidden, still accessible" },
];

export function normalizeCustomFieldLabelPosition(
  value: string | null | undefined,
): CustomFieldLabelPosition {
  return CUSTOM_FIELD_LABEL_POSITION_VALUES.includes(value as CustomFieldLabelPosition)
    ? (value as CustomFieldLabelPosition)
    : "top";
}
