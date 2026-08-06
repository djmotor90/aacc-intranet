/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { z } from "zod";

export const CUSTOM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "dropdown",
  "multi_select",
  "user",
  "checkbox",
  "url",
  "email",
  "phone",
  "color",
  /** One or more files; value is FileFieldValue[] (attachment refs). */
  "file",
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export interface CustomFieldOption {
  id: string;
  label: string;
  color?: string;
}

export interface CustomFieldDefinitionLike {
  id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  options?: CustomFieldOption[] | null;
  isRequired: boolean;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/** Zod schema for a single custom field value, derived from its definition. */
export function valueSchemaFor(def: CustomFieldDefinitionLike): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  switch (def.type) {
    case "text":
    case "textarea":
      schema = z.string().max(def.type === "text" ? 500 : 10_000);
      break;
    case "number":
      schema = z.number().finite();
      break;
    case "date":
      schema = isoDate;
      break;
    case "dropdown":
    case "color": {
      const ids = (def.options ?? []).map((o) => o.id);
      schema = ids.length > 0 ? z.enum(ids as [string, ...string[]]) : z.never();
      break;
    }
    case "multi_select": {
      const ids = (def.options ?? []).map((o) => o.id);
      schema =
        ids.length > 0 ? z.array(z.enum(ids as [string, ...string[]])).max(ids.length) : z.never();
      break;
    }
    case "user": {
      // People field: one or more user UUIDs. Accept legacy single uuid or array.
      const peopleArr = z
        .union([z.string().uuid(), z.array(z.string().uuid())])
        .transform((v) => (Array.isArray(v) ? v : v ? [v] : []))
        .pipe(z.array(z.string().uuid()).max(50));
      schema = def.isRequired
        ? peopleArr.refine((ids) => ids.length > 0, { message: "Select at least one person" })
        : peopleArr;
      break;
    }
    case "checkbox":
      schema = z.boolean();
      break;
    case "url":
      schema = z.string().url().max(2000);
      break;
    case "email":
      schema = z.string().email().max(320);
      break;
    case "phone":
      schema = z.string().min(3).max(30);
      break;
    case "file": {
      // Stored as attachment refs after upload (form / task UI).
      const fileEntry = z.object({
        attachmentId: z.string().uuid(),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().max(200).optional(),
        sizeBytes: z.number().int().nonnegative().optional(),
      });
      schema = z.array(fileEntry).max(20);
      break;
    }
    default:
      schema = z.unknown();
  }
  return def.isRequired ? schema : schema.nullish();
}

/** Shape stored in task.custom_fields for type "file". */
export type FileFieldValue = {
  attachmentId: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
};

export function normalizeFileFieldValue(value: unknown): FileFieldValue[] {
  if (!Array.isArray(value)) return [];
  const out: FileFieldValue[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.attachmentId !== "string" || typeof row.fileName !== "string") continue;
    out.push({
      attachmentId: row.attachmentId,
      fileName: row.fileName,
      mimeType: typeof row.mimeType === "string" ? row.mimeType : undefined,
      sizeBytes: typeof row.sizeBytes === "number" ? row.sizeBytes : undefined,
    });
  }
  return out;
}

/**
 * Zod schema validating a full `custom_fields` JSONB object
 * (`{ [definitionId]: value }`) against a list's definitions.
 * Unknown keys are rejected.
 */
export function customFieldsSchemaFor(defs: CustomFieldDefinitionLike[]): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const def of defs) {
    shape[def.id] = def.isRequired ? valueSchemaFor(def) : valueSchemaFor(def).optional();
  }
  return z.object(shape).strict();
}

/** Normalize People / user custom-field values to a list of user ids. */
export function normalizePeopleValue(value: unknown): string[] {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v.length > 0);
  }
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}
