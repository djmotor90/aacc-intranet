"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  attachments,
  customFieldDefinitions,
  db,
  formSubmissions,
  lists,
  listViews,
  publicForms,
  spaceMembers,
  spaces,
  spaceTaskCounters,
  statuses,
  taskAssignees,
  tasks,
} from "@aitim/db";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { notifyUsers, pingListUpdate } from "@/lib/notify";
import { assertListRole, assertSpaceRole, requireUser } from "@/lib/rbac";
import { BUCKETS, putObject } from "@/lib/storage";
import { MAX_ATTACHMENT_BYTES } from "@/lib/upload-limits";
import { logActivity } from "../lib/activity";
import {
  defaultFormFields,
  fieldsForSubmit,
  FORM_CONDITION_OPS,
  FORM_CORE_TARGETS,
  FORM_FIELD_TYPES,
  FORM_LOGO_POSITIONS,
  FORM_RADIUS,
  FORM_WIDTHS,
  parseDefaultAssigneeIds,
  parseFormFields,
  parseFormTheme,
  randomFormSlug,
  type FormTheme,
} from "../lib/form-types";
import { ensureTaskFollowers } from "../lib/task-watchers";
import { listPath, requireList, resolveListDefaultStatusId } from "./shared";

const formFieldSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(200),
  type: z.enum(FORM_FIELD_TYPES),
  required: z.boolean().optional(),
  help: z.string().max(500).optional(),
  hidden: z.boolean().optional(),
  prefillKey: z.string().max(60).optional().nullable(),
  options: z
    .array(z.object({ id: z.string().min(1).max(80), label: z.string().min(1).max(120) }))
    .max(50)
    .optional(),
  mapTo: z.union([
    z.object({
      kind: z.literal("core"),
      target: z.enum(FORM_CORE_TARGETS),
    }),
    z.object({
      kind: z.literal("custom_field"),
      definitionId: z.string().uuid(),
    }),
    z.object({
      kind: z.literal("display"),
    }),
  ]),
  showWhen: z
    .object({
      fieldId: z.string().min(1).max(80),
      op: z.enum(FORM_CONDITION_OPS),
      value: z.string().max(500).optional(),
    })
    .nullable()
    .optional(),
});

function nextViewPosition(existing: { position: string }[]): string {
  const n = existing.length;
  const letter = String.fromCharCode(97 + Math.floor(n / 10));
  return `${letter}${n % 10}`;
}

async function uniqueFormSlug(base: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const slug = randomFormSlug(base);
    const [row] = await db
      .select({ id: publicForms.id })
      .from(publicForms)
      .where(eq(publicForms.slug, slug))
      .limit(1);
    if (!row) return slug;
  }
  return randomFormSlug(`${base}-${Date.now()}`);
}

/**
 * Create a Form view on a list (ClickUp-style: + View → Form).
 * Also creates the linked `public_forms` row used for share + submit.
 */
export async function createFormView(params: {
  listId: string;
  name?: string;
}): Promise<{ viewId: string; formId: string; slug: string }> {
  "use server";
  const listId = z.string().uuid().parse(params.listId);
  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "create_views");
  await assertListRole(listId, "member");
  const { list, space } = await requireList(listId);

  const existing = await db
    .select()
    .from(listViews)
    .where(eq(listViews.listId, listId))
    .orderBy(asc(listViews.position));

  const baseName = (params.name?.trim() || "Form").slice(0, 60);
  let name = baseName;
  let i = 2;
  const names = new Set(existing.map((v) => v.name.toLowerCase()));
  while (names.has(name.toLowerCase())) {
    name = `${baseName} ${i++}`;
  }

  const fields = defaultFormFields();
  const slug = await uniqueFormSlug(name);

  const result = await db.transaction(async (tx) => {
    const [view] = await tx
      .insert(listViews)
      .values({
        listId,
        name,
        type: "form",
        filters: [],
        groupBy: null,
        showClosed: false,
        tableColumnOrder: null,
        position: nextViewPosition(existing),
        createdBy: user.id,
      })
      .returning({ id: listViews.id });

    const [form] = await tx
      .insert(publicForms)
      .values({
        listId,
        listViewId: view.id,
        slug,
        title: name,
        introMd: null,
        successMessage: "Thanks — we received your request.",
        isActive: true,
        notifySpaceRole: "owner",
        defaultStatusId: null,
        defaultAssigneeIds: [],
        allowAttachments: false,
        maxAttachments: 5,
        theme: {},
        fields,
      })
      .returning({ id: publicForms.id, slug: publicForms.slug });

    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "form.created",
      payload: { name, listId, formId: form.id, viewId: view.id },
    });

    return { viewId: view.id, formId: form.id, slug: form.slug };
  });

  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath("/tasks/forms");
  return result;
}

export async function createFormOnList(params: {
  listId: string;
  name?: string;
}): Promise<{
  spaceSlug: string;
  listSlug: string;
  viewId: string;
}> {
  "use server";
  const listId = z.string().uuid().parse(params.listId);
  const name = params.name?.trim()
    ? z.string().min(1).max(60).parse(params.name.trim())
    : undefined;
  const { list, space } = await requireList(listId);
  const user = await requireUser();
  await assertSpaceRole(space.id, "owner");
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "create_views");

  const created = await createFormView({ listId, name });
  return {
    spaceSlug: space.slug,
    listSlug: list.slug,
    viewId: created.viewId,
  };
}

/**
 * Ensure the list has a Files custom field and return its id (ClickUp-style).
 * Used when adding a file question from the form builder.
 */
export async function ensureListFileCustomField(params: {
  listId: string;
  label?: string;
}): Promise<{ definitionId: string; created: boolean }> {
  "use server";
  const listId = z.string().uuid().parse(params.listId);
  const label = (params.label?.trim() || "Files").slice(0, 100);
  await assertListRole(listId, "member");
  const { list, space } = await requireList(listId);

  const existing = await db
    .select()
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.listId, listId),
        eq(customFieldDefinitions.type, "file"),
        eq(customFieldDefinitions.isArchived, false),
      ),
    )
    .orderBy(asc(customFieldDefinitions.position));

  if (existing[0]) {
    return { definitionId: existing[0].id, created: false };
  }

  const user = await requireUser();
  const { assertPermission } = await import("@/lib/permissions");
  await assertPermission(user, "create_custom_fields");

  const all = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.listId, listId));

  const [created] = await db
    .insert(customFieldDefinitions)
    .values({
      listId,
      key: `files_${Date.now().toString(36)}`,
      label,
      type: "file",
      options: null,
      isRequired: false,
      position: `a${all.length}`,
    })
    .returning({ id: customFieldDefinitions.id });

  await logActivity(db, {
    spaceId: space.id,
    actorId: user.id,
    verb: "field.created",
    payload: { label, type: "file", listName: list.name, fromForm: true },
  });

  const { invalidateListMetaCache } = await import("../queries");
  invalidateListMetaCache(listId);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);

  return { definitionId: created.id, created: true };
}

/** Lists available when creating a Form from space/folder menus. */
export async function getListsForFormCreate(params: {
  spaceId: string;
  folderId?: string | null;
}): Promise<{ id: string; name: string; slug: string }[]> {
  "use server";
  const spaceId = z.string().uuid().parse(params.spaceId);
  await assertSpaceRole(spaceId, "owner");
  const folderId = params.folderId
    ? z.string().uuid().parse(params.folderId)
    : null;

  const rows = await db
    .select({ id: lists.id, name: lists.name, slug: lists.slug, folderId: lists.folderId })
    .from(lists)
    .where(
      and(
        eq(lists.spaceId, spaceId),
        eq(lists.isArchived, false),
        isNull(lists.deletedAt),
      ),
    )
    .orderBy(asc(lists.position), asc(lists.createdAt));

  if (folderId) {
    return rows
      .filter((r) => r.folderId === folderId)
      .map(({ id, name, slug }) => ({ id, name, slug }));
  }
  return rows.map(({ id, name, slug }) => ({ id, name, slug }));
}

export async function updateFormSettings(params: {
  formId: string;
  title?: string;
  introMd?: string | null;
  successMessage?: string | null;
  isActive?: boolean;
  notifySpaceRole?: "owner" | "member";
  defaultStatusId?: string | null;
  defaultAssigneeIds?: string[];
  allowAttachments?: boolean;
  maxAttachments?: number;
  theme?: Partial<FormTheme>;
}) {
  "use server";
  const formId = z.string().uuid().parse(params.formId);
  const [form] = await db.select().from(publicForms).where(eq(publicForms.id, formId));
  if (!form) throw new Error("Form not found");
  await assertListRole(form.listId, "member");
  const { list, space } = await requireList(form.listId);

  const updates: Partial<typeof publicForms.$inferInsert> = {};
  if (params.title !== undefined) {
    updates.title = z.string().min(1).max(120).parse(params.title.trim());
  }
  if ("introMd" in params) {
    updates.introMd = params.introMd?.trim() ? params.introMd.trim().slice(0, 5000) : null;
  }
  if ("successMessage" in params) {
    updates.successMessage = params.successMessage?.trim()
      ? params.successMessage.trim().slice(0, 500)
      : null;
  }
  if (params.isActive !== undefined) updates.isActive = params.isActive === true;
  if (params.notifySpaceRole) {
    updates.notifySpaceRole = params.notifySpaceRole === "member" ? "member" : "owner";
  }
  if ("defaultStatusId" in params) {
    if (params.defaultStatusId) {
      const statusId = z.string().uuid().parse(params.defaultStatusId);
      const [st] = await db
        .select({ id: statuses.id })
        .from(statuses)
        .where(and(eq(statuses.id, statusId), eq(statuses.listId, form.listId)));
      if (!st) throw new Error("Invalid default status");
      updates.defaultStatusId = statusId;
    } else {
      updates.defaultStatusId = null;
    }
  }
  if ("defaultAssigneeIds" in params) {
    const ids = z.array(z.string().uuid()).max(20).parse(params.defaultAssigneeIds ?? []);
    updates.defaultAssigneeIds = ids;
  }
  if (params.allowAttachments !== undefined) {
    updates.allowAttachments = params.allowAttachments === true;
  }
  if (params.maxAttachments !== undefined) {
    updates.maxAttachments = Math.min(20, Math.max(1, Math.floor(params.maxAttachments)));
  }
  if (params.theme) {
    const current = parseFormTheme(form.theme);
    const next = parseFormTheme({ ...current, ...params.theme });
    // Validate enums explicitly
    if (!FORM_WIDTHS.includes(next.width)) next.width = current.width;
    if (!FORM_RADIUS.includes(next.radius)) next.radius = current.radius;
    if (!FORM_LOGO_POSITIONS.includes(next.logoPosition)) next.logoPosition = current.logoPosition;
    updates.theme = next;
  }
  if (Object.keys(updates).length === 0) return;

  await db.update(publicForms).set(updates).where(eq(publicForms.id, formId));

  if (updates.title && form.listViewId) {
    await db
      .update(listViews)
      .set({ name: updates.title as string })
      .where(and(eq(listViews.id, form.listViewId), eq(listViews.listId, form.listId)));
  }

  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/forms/${form.slug}`);
  revalidatePath("/tasks/forms");
}

/** Upload a logo image for the public form (stored in S3 attachments bucket). */
export async function uploadFormLogo(
  formId: string,
  formData: FormData,
): Promise<{ ok: true; logoObjectKey: string }> {
  "use server";
  const id = z.string().uuid().parse(formId);
  const [form] = await db.select().from(publicForms).where(eq(publicForms.id, id));
  if (!form) throw new Error("Form not found");
  await assertListRole(form.listId, "member");
  const { list, space } = await requireList(form.listId);

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose an image file");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Logo must be under 2 MB");
  }
  const mime = file.type || "image/png";
  if (!mime.startsWith("image/")) {
    throw new Error("Logo must be an image");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext =
    mime.includes("png")
      ? "png"
      : mime.includes("webp")
        ? "webp"
        : mime.includes("gif")
          ? "gif"
          : "jpg";
  const objectKey = `form-logos/${form.id}/${randomUUID()}.${ext}`;
  await putObject(BUCKETS.attachments, objectKey, buffer, mime);

  const theme = parseFormTheme(form.theme);
  theme.logoObjectKey = objectKey;
  theme.logoUrl = null;

  await db.update(publicForms).set({ theme }).where(eq(publicForms.id, id));
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/forms/${form.slug}`);
  return { ok: true, logoObjectKey: objectKey };
}

export async function clearFormLogo(formId: string): Promise<void> {
  "use server";
  const id = z.string().uuid().parse(formId);
  const [form] = await db.select().from(publicForms).where(eq(publicForms.id, id));
  if (!form) throw new Error("Form not found");
  await assertListRole(form.listId, "member");
  const { list, space } = await requireList(form.listId);
  const theme = parseFormTheme(form.theme);
  theme.logoObjectKey = null;
  theme.logoUrl = null;
  await db.update(publicForms).set({ theme }).where(eq(publicForms.id, id));
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/forms/${form.slug}`);
}

export async function updateFormFields(formId: string, fields: unknown) {
  "use server";
  const id = z.string().uuid().parse(formId);
  const parsed = z.array(formFieldSchema).max(40).parse(fields);
  for (const f of parsed) {
    if ((f.type === "heading" || f.type === "paragraph") && f.mapTo.kind !== "display") {
      throw new Error(`"${f.label}" must be a display block`);
    }
    if (f.mapTo.kind === "display" && f.type !== "heading" && f.type !== "paragraph") {
      throw new Error(`Display block "${f.label}" must be a heading or paragraph`);
    }
  }
  const hasTitle = parsed.some(
    (f) => f.mapTo.kind === "core" && f.mapTo.target === "title",
  );
  if (!hasTitle) {
    throw new Error("Form must include a question mapped to the task title");
  }

  // Validate showWhen targets exist on the form.
  const ids = new Set(parsed.map((f) => f.id));
  for (const f of parsed) {
    if (f.showWhen?.fieldId && !ids.has(f.showWhen.fieldId)) {
      throw new Error(`Condition on "${f.label}" references a missing question`);
    }
    if (f.showWhen?.fieldId === f.id) {
      throw new Error(`Question "${f.label}" cannot depend on itself`);
    }
  }

  const [form] = await db.select().from(publicForms).where(eq(publicForms.id, id));
  if (!form) throw new Error("Form not found");
  await assertListRole(form.listId, "member");
  const { list, space } = await requireList(form.listId);

  const customIds = parsed
    .filter((f) => f.mapTo.kind === "custom_field")
    .map((f) => (f.mapTo as { definitionId: string }).definitionId);
  if (customIds.length > 0) {
    const defs = await db
      .select({ id: customFieldDefinitions.id })
      .from(customFieldDefinitions)
      .where(
        and(
          eq(customFieldDefinitions.listId, form.listId),
          inArray(customFieldDefinitions.id, customIds),
        ),
      );
    if (defs.length !== new Set(customIds).size) {
      throw new Error("One or more custom fields are not on this list");
    }
  }

  await db.update(publicForms).set({ fields: parsed }).where(eq(publicForms.id, id));
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/forms/${form.slug}`);
  revalidatePath("/tasks/forms");
}

export async function regenerateFormSlug(formId: string): Promise<{ slug: string }> {
  "use server";
  const id = z.string().uuid().parse(formId);
  const [form] = await db.select().from(publicForms).where(eq(publicForms.id, id));
  if (!form) throw new Error("Form not found");
  await assertListRole(form.listId, "member");
  const { list, space } = await requireList(form.listId);
  const slug = await uniqueFormSlug(form.title);
  await db.update(publicForms).set({ slug }).where(eq(publicForms.id, id));
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath(`/forms/${form.slug}`);
  revalidatePath(`/forms/${slug}`);
  revalidatePath("/tasks/forms");
  return { slug };
}

/** Called from deleteListView when type is form — remove form + submissions. */
export async function deleteFormForView(viewId: string) {
  const [form] = await db
    .select()
    .from(publicForms)
    .where(eq(publicForms.listViewId, viewId));
  if (!form) return;
  await db.delete(formSubmissions).where(eq(formSubmissions.formId, form.id));
  await db.delete(publicForms).where(eq(publicForms.id, form.id));
  revalidatePath("/tasks/forms");
}

export type FormUploadFile = {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  /**
   * Form question id when uploaded against a file field (ClickUp-style).
   * Null/undefined = form-level “allow attachments” bucket (task root files).
   */
  fieldId?: string | null;
};

/**
 * Public submission (no auth). Creates a task on the form's list.
 */
export async function submitPublicForm(params: {
  slug: string;
  answers: Record<string, unknown>;
  ipHash?: string | null;
  files?: FormUploadFile[];
}): Promise<{ ok: true; taskNumber: string; taskId: string } | { ok: false; error: string }> {
  "use server";
  const slug = z.string().min(1).max(120).parse(params.slug);
  const answers = z.record(z.string(), z.unknown()).parse(params.answers ?? {});

  const [form] = await db.select().from(publicForms).where(eq(publicForms.slug, slug));
  if (!form || !form.isActive) {
    return { ok: false, error: "This form is not accepting submissions." };
  }

  const fields = parseFormFields(form.fields);
  if (fields.length === 0) {
    return { ok: false, error: "This form has no questions." };
  }

  const [list] = await db.select().from(lists).where(eq(lists.id, form.listId));
  if (!list || list.deletedAt || list.isArchived) {
    return { ok: false, error: "This form is unavailable." };
  }
  const [space] = await db.select().from(spaces).where(eq(spaces.id, list.spaceId));
  if (!space || space.deletedAt || space.isArchived) {
    return { ok: false, error: "This form is unavailable." };
  }

  const activeFields = fieldsForSubmit(fields, answers);
  const defs = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.listId, list.id));
  const defById = new Map(defs.map((d) => [d.id, d]));

  let title = "Form submission";
  let descriptionText: string | null = null;
  let priority: "urgent" | "high" | "normal" | "low" | null = null;
  let dueDate: string | null = null;
  let submitterEmail: string | null = null;
  let submitterName: string | null = null;
  const customFields: Record<string, unknown> = {};

  const allFiles = params.files ?? [];
  const filesByField = new Map<string, FormUploadFile[]>();
  const generalFiles: FormUploadFile[] = [];
  for (const f of allFiles) {
    if (f.fieldId) {
      const list = filesByField.get(f.fieldId) ?? [];
      list.push(f);
      filesByField.set(f.fieldId, list);
    } else {
      generalFiles.push(f);
    }
  }

  // File custom-field questions — validate required before task create.
  for (const field of activeFields) {
    if (field.type !== "file") continue;
    const count = (filesByField.get(field.id) ?? []).length;
    if (field.required && !field.hidden && count === 0) {
      return { ok: false, error: `"${field.label}" requires at least one file.` };
    }
    if (field.mapTo.kind !== "custom_field") {
      return { ok: false, error: `"${field.label}" must map to a Files custom field.` };
    }
    const def = defById.get(field.mapTo.definitionId);
    if (!def || def.isArchived || def.type !== "file") {
      return {
        ok: false,
        error: `"${field.label}" is not linked to a valid Files custom field on this list.`,
      };
    }
    if (count > 20) {
      return { ok: false, error: `"${field.label}" allows at most 20 files.` };
    }
  }

  // Form-level attachment bucket (optional global toggle).
  if (generalFiles.length > 0) {
    if (!form.allowAttachments) {
      return {
        ok: false,
        error: "This form does not accept unmapped attachments. Use a Files question.",
      };
    }
    const max = form.maxAttachments ?? 5;
    if (generalFiles.length > max) {
      return { ok: false, error: `Too many files (max ${max}).` };
    }
  }
  for (const f of allFiles) {
    if (!f.buffer.length || f.buffer.length > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: `File "${f.fileName}" is empty or too large.` };
    }
  }

  for (const field of activeFields) {
    if (field.type === "file") continue; // handled via filesByField after task create

    const raw = answers[field.id];
    const empty =
      raw === undefined ||
      raw === null ||
      raw === "" ||
      (Array.isArray(raw) && raw.length === 0);

    // Required only for visible (non-hidden) fields that pass showWhen.
    if (field.required && !field.hidden && empty) {
      return { ok: false, error: `"${field.label}" is required.` };
    }
    if (empty) continue;

    let value: unknown = raw;
    if (field.type === "checkbox") {
      value = raw === true || raw === "true" || raw === "on" || raw === "1";
    } else if (field.type === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        return { ok: false, error: `"${field.label}" must be a number.` };
      }
      value = n;
    } else if (field.type === "email") {
      const s = String(raw).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
        return { ok: false, error: `"${field.label}" must be a valid email.` };
      }
      value = s;
    } else if (field.type === "date") {
      const s = String(raw).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return { ok: false, error: `"${field.label}" must be a date (YYYY-MM-DD).` };
      }
      value = s;
    } else if (field.type === "dropdown") {
      const s = String(raw);
      const opts = field.options ?? [];
      if (opts.length > 0 && !opts.some((o) => o.id === s || o.label === s)) {
        if (field.mapTo.kind === "custom_field") {
          const def = defById.get(field.mapTo.definitionId);
          const defOpts = (def?.options as { id: string; label: string }[] | null) ?? [];
          if (!defOpts.some((o) => o.id === s)) {
            return { ok: false, error: `Invalid choice for "${field.label}".` };
          }
        } else {
          return { ok: false, error: `Invalid choice for "${field.label}".` };
        }
      }
      value = s;
    } else {
      value = String(raw).trim().slice(0, field.type === "textarea" ? 10_000 : 500);
    }

    if (field.mapTo.kind === "core") {
      switch (field.mapTo.target) {
        case "title":
          title = String(value).slice(0, 300) || title;
          break;
        case "description":
          descriptionText = String(value);
          break;
        case "priority": {
          const p = String(value).toLowerCase();
          if (p === "urgent" || p === "high" || p === "normal" || p === "low") {
            priority = p;
          }
          break;
        }
        case "due_date":
          dueDate = String(value);
          break;
      }
    } else if (field.mapTo.kind === "custom_field") {
      const def = defById.get(field.mapTo.definitionId);
      if (!def || def.isArchived) continue;
      if ((def.type === "dropdown" || def.type === "color") && typeof value === "string") {
        const opts = (def.options as { id: string; label: string }[] | null) ?? [];
        const byLabel = opts.find((o) => o.label === value);
        if (byLabel) value = byLabel.id;
      }
      customFields[def.id] = value;
    }
    // display blocks are excluded by fieldsForSubmit
  }

  const metaLines: string[] = [];
  if (submitterName) metaLines.push(`Submitted by: ${submitterName}`);
  if (submitterEmail) metaLines.push(`Email: ${submitterEmail}`);
  if (metaLines.length > 0) {
    descriptionText = [descriptionText, metaLines.join("\n")].filter(Boolean).join("\n\n");
  }

  // Default status: form override → list default.
  let statusId: string;
  if (form.defaultStatusId) {
    const [st] = await db
      .select({ id: statuses.id })
      .from(statuses)
      .where(and(eq(statuses.id, form.defaultStatusId), eq(statuses.listId, list.id)));
    statusId = st
      ? st.id
      : await resolveListDefaultStatusId(list.id, list.defaultStatusId);
  } else {
    statusId = await resolveListDefaultStatusId(list.id, list.defaultStatusId);
  }

  const assigneeIds = parseDefaultAssigneeIds(form.defaultAssigneeIds);

  let taskNumber = "";
  let taskId = "";

  await db.transaction(async (tx) => {
    const [counter] = await tx
      .update(spaceTaskCounters)
      .set({ nextNumber: sql`${spaceTaskCounters.nextNumber} + 1` })
      .where(eq(spaceTaskCounters.spaceId, space.id))
      .returning({ next: spaceTaskCounters.nextNumber });
    const number = `${space.taskPrefix}-${counter.next - 1}`;

    const [task] = await tx
      .insert(tasks)
      .values({
        listId: list.id,
        number,
        title,
        description: descriptionText ? { text: descriptionText } : null,
        statusId,
        priority,
        dueDate,
        customFields,
        createdBy: null,
        source: "public_form",
      })
      .returning({ id: tasks.id, number: tasks.number });

    if (assigneeIds.length > 0) {
      await tx.insert(taskAssignees).values(
        assigneeIds.map((userId) => ({
          taskId: task.id,
          userId,
          assignedBy: null,
        })),
      );
    }

    await tx.insert(formSubmissions).values({
      formId: form.id,
      taskId: task.id,
      rawPayload: {
        answers,
        fileCount: allFiles.length,
        fileFields: [...filesByField.keys()],
      },
      submitterEmail,
      submitterName,
      ipHash: params.ipHash ?? null,
      turnstileOk: null,
    });

    await logActivity(tx, {
      spaceId: space.id,
      taskId: task.id,
      actorId: null,
      actorLabel: submitterName || submitterEmail || "Public form",
      verb: "task.created",
      payload: {
        title,
        number: task.number,
        source: "public_form",
        formId: form.id,
      },
    });

    taskId = task.id;
    taskNumber = task.number;
  });

  // Upload files after task exists (S3 outside the create transaction).
  if (taskId && allFiles.length > 0) {
    const actorLabel = submitterName || submitterEmail || "Public form";
    /** definitionId → file field values */
    const fileCfValues = new Map<
      string,
      { attachmentId: string; fileName: string; mimeType?: string; sizeBytes?: number }[]
    >();

    async function storeOne(f: FormUploadFile) {
      const checksum = createHash("sha256").update(f.buffer).digest("hex");
      const safeName = (f.fileName || "upload").replace(/[^\w.\- ]+/g, "_").slice(0, 200);
      const objectKey = `${taskId}/${randomUUID()}-${safeName}`;
      const mimeType = f.mimeType || "application/octet-stream";
      try {
        await putObject(BUCKETS.attachments, objectKey, f.buffer, mimeType);
      } catch (err) {
        console.error("[forms] S3 putObject failed", err);
        throw new Error(
          `Could not store file "${safeName}". Check storage configuration (S3).`,
        );
      }
      const [att] = await db
        .insert(attachments)
        .values({
          taskId,
          fileName: safeName,
          objectKey,
          mimeType,
          sizeBytes: f.buffer.length,
          checksumSha256: checksum,
          uploaderId: null,
        })
        .returning({ id: attachments.id });
      if (!att) throw new Error(`Failed to save attachment "${safeName}"`);
      await logActivity(db, {
        spaceId: space.id,
        taskId,
        actorId: null,
        actorLabel,
        verb: "attachment.added",
        payload: {
          fileName: safeName,
          sizeBytes: f.buffer.length,
          mimeType,
          attachmentId: att.id,
        },
      });
      return {
        attachmentId: att.id,
        fileName: safeName,
        mimeType,
        sizeBytes: f.buffer.length,
      };
    }

    try {
      // Field-mapped file custom fields (ClickUp-style).
      for (const field of activeFields) {
        if (field.type !== "file" || field.mapTo.kind !== "custom_field") continue;
        const uploads = filesByField.get(field.id) ?? [];
        if (uploads.length === 0) continue;
        const values = [];
        for (const f of uploads) {
          values.push(await storeOne(f));
        }
        fileCfValues.set(field.mapTo.definitionId, values);
      }

      // Unmapped form-level attachments.
      for (const f of generalFiles) {
        await storeOne(f);
      }

      if (fileCfValues.size > 0) {
        const [taskRow] = await db
          .select({ customFields: tasks.customFields })
          .from(tasks)
          .where(eq(tasks.id, taskId));
        const nextCf = {
          ...((taskRow?.customFields as Record<string, unknown>) ?? {}),
        };
        for (const [defId, vals] of fileCfValues) {
          nextCf[defId] = vals;
        }
        await db
          .update(tasks)
          .set({ customFields: nextCf })
          .where(eq(tasks.id, taskId));
      }
    } catch (err) {
      console.error("[forms] file upload pipeline failed", err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : "File upload failed",
      };
    }
  }

  if (assigneeIds.length > 0 && taskId) {
    await ensureTaskFollowers(taskId, assigneeIds, "assigned");
    await notifyUsers({
      recipientIds: assigneeIds,
      type: "assigned",
      taskId,
      actorId: null,
      payload: { number: taskNumber, title },
    });
  }

  const roleFilter =
    form.notifySpaceRole === "member"
      ? inArray(spaceMembers.role, ["owner", "member"])
      : eq(spaceMembers.role, "owner");

  const memberRows = await db
    .select({ userId: spaceMembers.userId })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, space.id), roleFilter));

  const recipientIds = memberRows
    .map((r) => r.userId)
    .filter((id): id is string => Boolean(id))
    // Don't double-notify assignees already emailed via "assigned"
    .filter((id) => !assigneeIds.includes(id));

  if (recipientIds.length > 0 && taskId) {
    await notifyUsers({
      recipientIds,
      type: "form_submission",
      taskId,
      actorId: null,
      payload: {
        number: taskNumber,
        title,
        formTitle: form.title,
        submitterName,
        submitterEmail,
      },
    });
  }

  await pingListUpdate(list.id);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath("/tasks/forms");

  return { ok: true, taskNumber, taskId };
}
