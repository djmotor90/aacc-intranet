/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */

/**
 * Built-in task fields a form question can write into.
 * Only fields that exist on tasks in this product — not fake “submitter email” etc.
 * Extra questions should map to list custom fields.
 */
export const FORM_CORE_TARGETS = [
  "title",
  "description",
  "priority",
  "due_date",
] as const;

export type FormCoreTarget = (typeof FORM_CORE_TARGETS)[number];

/** Older forms may still store these; we drop them when parsing. */
const LEGACY_CORE_TARGETS = ["submitter_email", "submitter_name"] as const;

export const FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "number",
  "date",
  "dropdown",
  "checkbox",
  "url",
  "phone",
  /** Maps to a list custom field of type `file` (ClickUp-style). */
  "file",
  /** Static section title — not submitted, display only. */
  "heading",
  /** Static instruction / helper text between questions — not submitted. */
  "paragraph",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

/** Field types that never collect answers (content blocks). */
export const FORM_DISPLAY_TYPES = ["heading", "paragraph"] as const;
export type FormDisplayType = (typeof FORM_DISPLAY_TYPES)[number];

export type FormFieldMapTo =
  | { kind: "core"; target: FormCoreTarget }
  | { kind: "custom_field"; definitionId: string }
  /** Static content only — never maps to a task field. */
  | { kind: "display" };

export interface FormFieldOption {
  id: string;
  label: string;
}

/** ClickUp-style show/hide rule for a question. */
export const FORM_CONDITION_OPS = [
  "eq",
  "neq",
  "contains",
  "empty",
  "not_empty",
] as const;

export type FormConditionOp = (typeof FORM_CONDITION_OPS)[number];

export interface FormFieldShowWhen {
  /** Other question id that controls visibility. */
  fieldId: string;
  op: FormConditionOp;
  /** Compared as string (dropdown option id, text, "true"/"false" for checkbox). */
  value?: string;
}

export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  help?: string;
  /**
   * Hidden on the public form UI (still accepted in answers / query prefill).
   * Use for campaign tags, source, etc.
   */
  hidden?: boolean;
  /**
   * Query-param key for prefill, e.g. `?dept=IT` when prefillKey is "dept".
   * Defaults to field id when omitted.
   */
  prefillKey?: string;
  options?: FormFieldOption[];
  mapTo: FormFieldMapTo;
  /** When set, question only shows if the rule passes (and is not hidden). */
  showWhen?: FormFieldShowWhen | null;
}

export function isDisplayField(field: Pick<FormField, "type" | "mapTo">): boolean {
  return (
    field.mapTo.kind === "display" ||
    field.type === "heading" ||
    field.type === "paragraph"
  );
}

export function isFormField(value: unknown): value is FormField {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || typeof v.label !== "string") return false;
  if (typeof v.type !== "string") return false;
  if (!FORM_FIELD_TYPES.includes(v.type as FormFieldType)) return false;
  const mapTo = v.mapTo as Record<string, unknown> | undefined;
  if (!mapTo || typeof mapTo !== "object") return false;
  if (mapTo.kind === "core") {
    return (
      typeof mapTo.target === "string" &&
      (FORM_CORE_TARGETS.includes(mapTo.target as FormCoreTarget) ||
        (LEGACY_CORE_TARGETS as readonly string[]).includes(mapTo.target))
    );
  }
  if (mapTo.kind === "custom_field") {
    return typeof mapTo.definitionId === "string";
  }
  if (mapTo.kind === "display") {
    return v.type === "heading" || v.type === "paragraph";
  }
  return false;
}

export function parseFormFields(raw: unknown): FormField[] {
  let list: unknown = raw;
  // Drizzle/RSC may hand us a JSON string for jsonb in some paths.
  if (typeof list === "string") {
    try {
      list = JSON.parse(list) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const out: FormField[] = [];
  for (const item of list) {
    if (!isFormField(item)) continue;
    // Drop legacy “submitter email/name” — not real task fields here.
    if (
      item.mapTo.kind === "core" &&
      (LEGACY_CORE_TARGETS as readonly string[]).includes(item.mapTo.target)
    ) {
      continue;
    }
    if (
      item.mapTo.kind === "core" &&
      !FORM_CORE_TARGETS.includes(item.mapTo.target)
    ) {
      continue;
    }
    const showWhen = item.showWhen;
    if (
      showWhen &&
      typeof showWhen === "object" &&
      typeof showWhen.fieldId === "string" &&
      FORM_CONDITION_OPS.includes(showWhen.op as FormConditionOp)
    ) {
      out.push({
        ...item,
        showWhen: {
          fieldId: showWhen.fieldId,
          op: showWhen.op as FormConditionOp,
          value: showWhen.value != null ? String(showWhen.value) : undefined,
        },
      });
    } else {
      out.push({ ...item, showWhen: null });
    }
  }
  return out;
}

/** New forms start with task title only; everything else is opt-in from real fields. */
export function defaultFormFields(): FormField[] {
  return [
    {
      id: crypto.randomUUID(),
      label: "Task name",
      type: "text",
      required: true,
      help: "Name of the task that will be created",
      mapTo: { kind: "core", target: "title" },
    },
  ];
}

export function randomFormSlug(base: string): string {
  const slugBase = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slugBase || "form"}-${suffix}`;
}

function answerAsString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.map(String).join(",");
  return String(value);
}

/** Whether a field's showWhen rule currently passes given answer values. */
export function isShowWhenMet(
  showWhen: FormFieldShowWhen | null | undefined,
  answers: Record<string, unknown>,
): boolean {
  if (!showWhen) return true;
  const raw = answers[showWhen.fieldId];
  const str = answerAsString(raw);
  const empty = str === "" || raw === undefined || raw === null;

  switch (showWhen.op) {
    case "empty":
      return empty;
    case "not_empty":
      return !empty;
    case "eq":
      return str === String(showWhen.value ?? "");
    case "neq":
      return str !== String(showWhen.value ?? "");
    case "contains":
      return str.toLowerCase().includes(String(showWhen.value ?? "").toLowerCase());
    default:
      return true;
  }
}

/**
 * Visible questions for the public UI (not hidden, condition met).
 * `answers` drives conditional display while the user fills the form.
 */
export function visibleFormFields(
  fields: FormField[],
  answers: Record<string, unknown> = {},
): FormField[] {
  return fields.filter((f) => !f.hidden && isShowWhenMet(f.showWhen, answers));
}

/**
 * Fields that should be validated / mapped on submit:
 * - always: hidden fields (prefill/campaign)
 * - visible fields whose showWhen passes
 * - never: display-only blocks (heading / paragraph)
 */
export function fieldsForSubmit(
  fields: FormField[],
  answers: Record<string, unknown>,
): FormField[] {
  return fields.filter((f) => {
    if (isDisplayField(f)) return false;
    return f.hidden || isShowWhenMet(f.showWhen, answers);
  });
}

/** Resolve prefill key for a field (query param name). */
export function fieldPrefillKey(field: FormField): string {
  if (field.prefillKey?.trim()) return field.prefillKey.trim();
  return field.id;
}

/**
 * Merge query-string prefill into answers.
 * Accepts `?{prefillKey}=value` or `?f_{fieldId}=value` or `?{fieldId}=value`.
 */
export function answersFromSearchParams(
  fields: FormField[],
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): Record<string, string> {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) {
      const v = params.get(key);
      return v ?? undefined;
    }
    const raw = params[key];
    if (Array.isArray(raw)) return raw[0];
    return raw;
  };

  const out: Record<string, string> = {};
  for (const field of fields) {
    if (isDisplayField(field)) continue;
    const keys = [
      fieldPrefillKey(field),
      `f_${field.id}`,
      field.id,
    ];
    for (const key of keys) {
      const v = get(key);
      if (v != null && v !== "") {
        out[field.id] = v;
        break;
      }
    }
  }
  return out;
}

export function parseDefaultAssigneeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
}

export const FORM_WIDTHS = ["sm", "md", "lg"] as const;
export type FormWidth = (typeof FORM_WIDTHS)[number];

export const FORM_LOGO_POSITIONS = ["left", "center", "right"] as const;
export type FormLogoPosition = (typeof FORM_LOGO_POSITIONS)[number];

export const FORM_RADIUS = ["md", "xl", "2xl"] as const;
export type FormRadius = (typeof FORM_RADIUS)[number];

/** Visual theme for public / preview forms. */
export interface FormTheme {
  /** Accent / submit button */
  primaryColor: string;
  /** Page background */
  backgroundColor: string;
  /** Card surface */
  cardColor: string;
  /** Main text */
  textColor: string;
  /** Muted / help text */
  mutedColor: string;
  width: FormWidth;
  radius: FormRadius;
  logoPosition: FormLogoPosition;
  /** S3 object key under attachments bucket, if logo uploaded */
  logoObjectKey?: string | null;
  /** Optional external logo URL (used when no object key) */
  logoUrl?: string | null;
  submitLabel: string;
  showBranding: boolean;
}

export const DEFAULT_FORM_THEME: FormTheme = {
  primaryColor: "#007582",
  backgroundColor: "#f7fafa",
  cardColor: "#ffffff",
  textColor: "#173438",
  mutedColor: "#53686b",
  width: "md",
  radius: "2xl",
  logoPosition: "center",
  logoObjectKey: null,
  logoUrl: null,
  submitLabel: "Submit",
  showBranding: true,
};

const HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

function normalizeHex(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  let h = raw.trim();
  if (!h.startsWith("#")) h = `#${h}`;
  if (h.length === 4) {
    h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  return HEX.test(h) ? h.toLowerCase() : fallback;
}

export function parseFormTheme(raw: unknown): FormTheme {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const width = FORM_WIDTHS.includes(o.width as FormWidth)
    ? (o.width as FormWidth)
    : DEFAULT_FORM_THEME.width;
  const radius = FORM_RADIUS.includes(o.radius as FormRadius)
    ? (o.radius as FormRadius)
    : DEFAULT_FORM_THEME.radius;
  const logoPosition = FORM_LOGO_POSITIONS.includes(o.logoPosition as FormLogoPosition)
    ? (o.logoPosition as FormLogoPosition)
    : DEFAULT_FORM_THEME.logoPosition;

  return {
    primaryColor: normalizeHex(o.primaryColor, DEFAULT_FORM_THEME.primaryColor),
    backgroundColor: normalizeHex(o.backgroundColor, DEFAULT_FORM_THEME.backgroundColor),
    cardColor: normalizeHex(o.cardColor, DEFAULT_FORM_THEME.cardColor),
    textColor: normalizeHex(o.textColor, DEFAULT_FORM_THEME.textColor),
    mutedColor: normalizeHex(o.mutedColor, DEFAULT_FORM_THEME.mutedColor),
    width,
    radius,
    logoPosition,
    logoObjectKey:
      typeof o.logoObjectKey === "string" && o.logoObjectKey.trim()
        ? o.logoObjectKey.trim()
        : null,
    logoUrl:
      typeof o.logoUrl === "string" && o.logoUrl.trim() ? o.logoUrl.trim().slice(0, 2000) : null,
    submitLabel:
      typeof o.submitLabel === "string" && o.submitLabel.trim()
        ? o.submitLabel.trim().slice(0, 60)
        : DEFAULT_FORM_THEME.submitLabel,
    showBranding: o.showBranding !== false,
  };
}

export function formWidthClass(width: FormWidth): string {
  switch (width) {
    case "sm":
      return "max-w-md";
    case "lg":
      return "max-w-2xl";
    default:
      return "max-w-lg";
  }
}

export function formRadiusClass(radius: FormRadius): string {
  switch (radius) {
    case "md":
      return "rounded-xl";
    case "xl":
      return "rounded-2xl";
    default:
      return "rounded-3xl";
  }
}

export function formThemeCssVars(theme: FormTheme): Record<string, string> {
  return {
    "--form-primary": theme.primaryColor,
    "--form-bg": theme.backgroundColor,
    "--form-card": theme.cardColor,
    "--form-text": theme.textColor,
    "--form-muted": theme.mutedColor,
  };
}

export function embedIframeSnippet(publicUrl: string, height = 720): string {
  const src = publicUrl.includes("?")
    ? `${publicUrl}&embed=1`
    : `${publicUrl}?embed=1`;
  return `<iframe src="${src}" title="Form" width="100%" height="${height}" frameborder="0" style="border:0;border-radius:12px;min-height:${height}px;" allow="clipboard-write"></iframe>`;
}
