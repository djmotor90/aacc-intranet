"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { customFieldDefinitions, db, lists, publicForms, tasks } from "@aitim/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSpaceRole, requireUser } from "@/lib/rbac";
import { logActivity } from "../lib/activity";
import {
  CUSTOM_FIELD_LABEL_POSITION_VALUES,
  CUSTOM_FIELD_OPTION_COLOR_DISPLAY_VALUES,
} from "../lib/custom-field-presentation";
import { invalidateListMetaCache } from "../queries";
import { listPath, requireList, revalidateTrashAndTasks, slugify } from "./shared";

const fieldTypeSchema = z.enum([
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
  "file",
]);

const fieldLabelPositionSchema = z.enum(CUSTOM_FIELD_LABEL_POSITION_VALUES);
const optionColorDisplaySchema = z.enum(CUSTOM_FIELD_OPTION_COLOR_DISPLAY_VALUES);

const HEX_COLOR = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

function normalizeHex(raw: string): string {
  let h = raw.trim();
  if (!h.startsWith("#")) h = `#${h}`;
  if (h.length === 4) {
    // #RGB → #RRGGBB
    h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  return h.toLowerCase();
}

/**
 * Parse color options: one per line as `#hex` or `#hex Optional label`.
 * Labels are optional — swatch-only colors use an empty label.
 */
function parseColorOptions(optionsRaw: string): { id: string; label: string; color: string }[] {
  const lines = optionsRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error("Color fields need at least one color option");

  const seen = new Set<string>();
  const options: { id: string; label: string; color: string }[] = [];
  for (const line of lines) {
    const m = line.match(/^(#[0-9A-Fa-f]{3,8})\s*(.*)$/);
    if (!m || !HEX_COLOR.test(m[1]!)) {
      throw new Error(`Invalid color option "${line}". Use e.g. #007582 or #007582 AACC Teal`);
    }
    const color = normalizeHex(m[1]!);
    // Empty string = no label (swatch only). Do not fall back to the hex.
    const label = (m[2] ?? "").trim();
    let id = (label ? slugify(label) : "") || color.slice(1);
    if (!id) id = color.slice(1);
    let unique = id;
    let n = 2;
    while (seen.has(unique)) {
      unique = `${id}-${n++}`;
    }
    seen.add(unique);
    options.push({ id: unique, label, color });
  }
  return options;
}

export async function createFieldDefinition(formData: FormData) {
  const listId = z.string().uuid().parse(formData.get("listId"));
  const label = z.string().min(1).max(100).parse(formData.get("label"));
  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const description = descriptionRaw
    ? z.string().max(500).parse(descriptionRaw)
    : null;
  const labelPosition = fieldLabelPositionSchema.parse(
    formData.get("labelPosition") ?? "top",
  );
  const optionColorDisplay = optionColorDisplaySchema.parse(
    formData.get("optionColorDisplay") ?? "dot",
  );
  const type = fieldTypeSchema.parse(formData.get("type"));
  const isRequired = formData.get("isRequired") === "on";
  const optionsRaw = String(formData.get("options") ?? "").trim();

  const { list, space } = await requireList(listId);
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "create_custom_fields");
  await assertSpaceRole(space.id, "owner");

  let options: { id: string; label: string; color?: string }[] | null = null;
  if (type === "dropdown" || type === "multi_select") {
    const labels = optionsRaw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (labels.length === 0) throw new Error("Dropdown fields need at least one option");
    options = labels.map((l) => ({ id: slugify(l), label: l }));
  } else if (type === "color") {
    options = parseColorOptions(optionsRaw);
  }

  await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.listId, listId));
    await tx.insert(customFieldDefinitions).values({
      listId,
      key: slugify(label),
      label,
      description,
      labelPosition,
      optionColorDisplay:
        type === "dropdown" || type === "multi_select" || type === "color"
          ? optionColorDisplay
          : "dot",
      type,
      options,
      isRequired,
      position: `a${existing.length}`,
    });
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "field.created",
      payload: { label, type, listName: list.name },
    });
  });
  invalidateListMetaCache(listId);
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}

export async function archiveFieldDefinition(formData: FormData) {
  const fieldId = z.string().uuid().parse(formData.get("fieldId"));
  const [field] = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.id, fieldId));
  if (!field) return;
  if (field.deletedAt) throw new Error("Custom field is already in Trash");
  const { list, space } = await requireList(field.listId);
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    await tx
      .update(customFieldDefinitions)
      .set({ isArchived: true })
      .where(eq(customFieldDefinitions.id, fieldId));
    invalidateListMetaCache(list.id);
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "field.archived",
      payload: { label: field.label, listName: list.name },
    });
  });
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}

/** Move a custom field to Trash while preserving its definition and task values. */
export async function trashFieldDefinition(formData: FormData) {
  const fieldId = z.string().uuid().parse(formData.get("fieldId"));
  const [field] = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.id, fieldId));
  if (!field) return;
  if (field.deletedAt) throw new Error("Custom field is already in Trash");

  const { list, space } = await requireList(field.listId);
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "manage_custom_fields");
  await assertSpaceRole(space.id, "owner");

  const forms = await db
    .select({ title: publicForms.title, fields: publicForms.fields })
    .from(publicForms)
    .where(eq(publicForms.listId, list.id));
  const formsUsingField = forms.filter((form) =>
    Array.isArray(form.fields) &&
    form.fields.some((item) => {
      if (!item || typeof item !== "object") return false;
      const mapTo = (item as { mapTo?: unknown }).mapTo;
      return Boolean(
        mapTo &&
        typeof mapTo === "object" &&
        (mapTo as { kind?: unknown }).kind === "custom_field" &&
        (mapTo as { definitionId?: unknown }).definitionId === fieldId,
      );
    }),
  );
  if (formsUsingField.length > 0) {
    const names = formsUsingField.slice(0, 3).map((form) => `“${form.title}”`).join(", ");
    throw new Error(
      `Remove this field from ${names}${formsUsingField.length > 3 ? " and other forms" : ""} before moving it to Trash.`,
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(customFieldDefinitions)
      .set({ deletedAt: new Date() })
      .where(eq(customFieldDefinitions.id, fieldId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "field.deleted",
      payload: { label: field.label, type: field.type, listName: list.name },
    });
  });

  invalidateListMetaCache(list.id);
  revalidateTrashAndTasks(space.slug);
}

/** Restore a custom field from Trash and make it active again. */
export async function restoreFieldDefinition(fieldId: string) {
  const id = z.string().uuid().parse(fieldId);
  const [field] = await db.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.id, id));
  if (!field?.deletedAt) throw new Error("Custom field is not in Trash");
  const { list, space } = await requireList(field.listId);
  const user = await requireUser();
  const { assertCanManageTrash } = await import("@/lib/permissions");
  await assertCanManageTrash(user, space.id);

  await db.transaction(async (tx) => {
    await tx
      .update(customFieldDefinitions)
      .set({ deletedAt: null, isArchived: false, updatedAt: new Date() })
      .where(eq(customFieldDefinitions.id, id));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "field.restored",
      payload: { label: field.label, type: field.type, listName: list.name },
    });
  });
  invalidateListMetaCache(list.id);
  revalidateTrashAndTasks(space.slug);
}

/** Permanently remove a custom field from Trash and purge its task values. */
export async function purgeFieldDefinition(fieldId: string) {
  const id = z.string().uuid().parse(fieldId);
  const [field] = await db.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.id, id));
  if (!field?.deletedAt) throw new Error("Move the custom field to Trash before permanently deleting it");
  const { list, space } = await requireList(field.listId);
  const user = await requireUser();
  const { assertCanManageTrash } = await import("@/lib/permissions");
  await assertCanManageTrash(user, space.id);

  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ customFields: sql`${tasks.customFields} - ${id}` })
      .where(eq(tasks.listId, list.id));
    await tx.delete(customFieldDefinitions).where(eq(customFieldDefinitions.id, id));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "field.purged",
      payload: { label: field.label, type: field.type, listName: list.name },
    });
  });
  invalidateListMetaCache(list.id);
  revalidateTrashAndTasks(space.slug);
}

const fieldOptionSchema = z.object({
  /** Existing option id — preserve so task values stay linked. Omit for new options. */
  id: z.string().min(1).max(80).optional(),
  /** Empty allowed for color swatches (no text label). */
  label: z.string().max(100),
  color: z
    .string()
    .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/)
    .optional(),
});

/**
 * Update a custom field: rename label, set required, and/or replace option list.
 * Option ids that are kept retain their values on existing tasks; removed options
 * leave orphaned task values (shown as raw ids until cleared). Type cannot change.
 */
export async function updateFieldDefinition(params: {
  fieldId: string;
  label: string;
  description?: string | null;
  labelPosition?: z.infer<typeof fieldLabelPositionSchema>;
  optionColorDisplay?: z.infer<typeof optionColorDisplaySchema>;
  isRequired?: boolean;
  options?: { id?: string; label: string; color?: string }[] | null;
}) {
  const fieldId = z.string().uuid().parse(params.fieldId);
  const label = z.string().min(1).max(100).parse(params.label.trim());
  const description =
    params.description === undefined
      ? undefined
      : params.description?.trim()
        ? z.string().max(500).parse(params.description.trim())
        : null;
  const labelPosition =
    params.labelPosition === undefined
      ? undefined
      : fieldLabelPositionSchema.parse(params.labelPosition);
  const isRequired =
    params.isRequired === undefined ? undefined : z.boolean().parse(params.isRequired);
  const optionColorDisplay =
    params.optionColorDisplay === undefined
      ? undefined
      : optionColorDisplaySchema.parse(params.optionColorDisplay);

  const [field] = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.id, fieldId));
  if (!field || field.isArchived || field.deletedAt) throw new Error("Field not found");

  const { list, space } = await requireList(field.listId);
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");

  const optionTypes = new Set(["dropdown", "multi_select", "color"]);
  let nextOptions: { id: string; label: string; color?: string }[] | undefined;

  if (params.options !== undefined && optionTypes.has(field.type)) {
    const raw = z.array(fieldOptionSchema).min(1, "At least one option is required").parse(params.options);
    const seen = new Set<string>();
    nextOptions = raw.map((o) => {
      const optLabel = o.label.trim();
      const color = o.color ? normalizeHex(o.color) : undefined;
      if (field.type === "color") {
        if (!color) throw new Error("Each color option needs a hex color");
      } else if (!optLabel) {
        throw new Error("Option labels cannot be empty");
      }
      const id = (
        o.id?.trim() ||
        (optLabel ? slugify(optLabel) : "") ||
        (color ? color.slice(1) : "") ||
        "option"
      ).slice(0, 80);
      let unique = id;
      let n = 2;
      while (seen.has(unique)) {
        unique = `${id.slice(0, 70)}-${n++}`;
      }
      seen.add(unique);
      const row: { id: string; label: string; color?: string } = {
        id: unique,
        label: optLabel,
      };
      if (color) row.color = color;
      return row;
    });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(customFieldDefinitions)
      .set({
        label,
        ...(description !== undefined ? { description } : {}),
        ...(labelPosition !== undefined ? { labelPosition } : {}),
        ...(optionColorDisplay !== undefined ? { optionColorDisplay } : {}),
        ...(isRequired !== undefined ? { isRequired } : {}),
        ...(nextOptions !== undefined ? { options: nextOptions } : {}),
        updatedAt: new Date(),
      })
      .where(eq(customFieldDefinitions.id, fieldId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "field.updated",
      payload: {
        label,
        type: field.type,
        listName: list.name,
        labelPosition: labelPosition ?? field.labelPosition,
      },
    });
  });

  invalidateListMetaCache(list.id);
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath("/tasks", "layout");
}

/** Toggle whether a custom field is required when creating tasks. */
export async function setFieldRequired(params: { fieldId: string; isRequired: boolean }) {
  const fieldId = z.string().uuid().parse(params.fieldId);
  const isRequired = z.boolean().parse(params.isRequired);
  const [field] = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.id, fieldId));
  if (!field || field.isArchived || field.deletedAt) throw new Error("Field not found");
  const { list, space } = await requireList(field.listId);
  await assertSpaceRole(space.id, "owner");

  await db
    .update(customFieldDefinitions)
    .set({ isRequired, updatedAt: new Date() })
    .where(eq(customFieldDefinitions.id, fieldId));
  invalidateListMetaCache(list.id);
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
  revalidatePath(listPath(space.slug, list.slug));
}

/**
 * Set which built-in fields are required on task creation for this list.
 * Title is always required (not configurable).
 */
export async function setRequiredCoreFields(params: {
  listId: string;
  fields: string[];
}) {
  const listId = z.string().uuid().parse(params.listId);
  const { CORE_FIELD_KEYS, parseRequiredCoreFields } = await import("../lib/required-fields");
  const allowed = new Set<string>(CORE_FIELD_KEYS);
  const fields = parseRequiredCoreFields(
    params.fields.filter((f) => allowed.has(f)),
  );

  const { list, space } = await requireList(listId);
  await assertSpaceRole(space.id, "owner");

  await db
    .update(lists)
    .set({ requiredCoreFields: fields, updatedAt: new Date() })
    .where(eq(lists.id, listId));
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
  revalidatePath(listPath(space.slug, list.slug));
}

/**
 * Enable/disable creating new subtasks on this list.
 * Default is enabled. Disabling never deletes or detaches existing subtasks —
 * they stay visible and editable; only "Add subtask" is blocked.
 */
export async function setListSubtasksEnabled(params: {
  listId: string;
  enabled: boolean;
}) {
  const listId = z.string().uuid().parse(params.listId);
  const enabled = z.boolean().parse(params.enabled);

  const { list, space } = await requireList(listId);
  await assertSpaceRole(space.id, "owner");

  await db
    .update(lists)
    .set({ subtasksEnabled: enabled, updatedAt: new Date() })
    .where(eq(lists.id, listId));

  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
  revalidatePath(listPath(space.slug, list.slug));
  // Task detail pages read this flag; refresh the tasks tree under /tasks.
  revalidatePath("/tasks", "layout");
}

/** Count of non-archived subtasks on this list (any depth). */
export async function countListSubtasks(listId: string): Promise<number> {
  const id = z.string().uuid().parse(listId);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(eq(tasks.listId, id), isNotNull(tasks.parentTaskId), eq(tasks.isArchived, false)),
    );
  return row?.n ?? 0;
}
