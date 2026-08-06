"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, lists, listSecretViewers, secretCategories, secrets, tasks, users } from "@aitim/db";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSecretsAccess, assertSpaceRole, requireUser } from "@/lib/rbac";
import { decryptSecretValues, encryptSecretValues } from "@/lib/secrets-crypto";
import { logActivity } from "../lib/activity";
import { DEFAULT_SECRET_CATEGORIES, secretFieldSchema, type SecretFieldInput } from "../lib/secrets";
import { listPath, requireList, requireTask } from "./shared";

/**
 * Enable/disable the Secrets vault tab for this list. Off by default
 * (opt-in — unlike subtasks). Disabling only blocks creating new secrets;
 * existing ones stay visible and editable for anyone with access. Seeds the
 * default category set the first time a list turns this on.
 */
export async function setListSecretsEnabled(params: { listId: string; enabled: boolean }) {
  const listId = z.string().uuid().parse(params.listId);
  const enabled = z.boolean().parse(params.enabled);

  const { list, space } = await requireList(listId);
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    await tx
      .update(lists)
      .set({ secretsEnabled: enabled, updatedAt: new Date() })
      .where(eq(lists.id, listId));

    if (enabled) {
      const existing = await tx
        .select({ id: secretCategories.id })
        .from(secretCategories)
        .where(eq(secretCategories.listId, listId));
      if (existing.length === 0) {
        await tx.insert(secretCategories).values(
          DEFAULT_SECRET_CATEGORIES.map((c, i) => ({
            listId,
            name: c.name,
            color: c.color,
            position: `a${i}`,
          })),
        );
      }
    }
  });

  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
  revalidatePath(listPath(space.slug, list.slug));
  revalidatePath("/tasks", "layout");
}

/** Count of secrets across every task in this list (settings toggle's disable-warning). */
export async function countSecrets(listId: string): Promise<number> {
  const id = z.string().uuid().parse(listId);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(secrets)
    .innerJoin(tasks, eq(secrets.taskId, tasks.id))
    .where(eq(tasks.listId, id));
  return row?.n ?? 0;
}

export async function createSecretCategory(params: {
  listId: string;
  name: string;
  color: string;
}): Promise<{ id: string; name: string; color: string }> {
  const listId = z.string().uuid().parse(params.listId);
  const name = z.string().min(1).max(50).parse(params.name.trim());
  const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(params.color);

  const { list, space } = await requireList(listId);
  const user = await requireUser();
  await assertSecretsAccess(listId);

  const created = await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(secretCategories)
      .where(eq(secretCategories.listId, listId));
    const [row] = await tx
      .insert(secretCategories)
      .values({ listId, name, color, position: `a${existing.length}`, createdBy: user.id })
      .returning();
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "secret_category.created",
      payload: { name, listName: list.name },
    });
    return row;
  });

  revalidatePath(listPath(space.slug, list.slug));
  return { id: created.id, name: created.name, color: created.color };
}

export async function renameSecretCategory(params: {
  categoryId: string;
  name: string;
  color: string;
}) {
  const categoryId = z.string().uuid().parse(params.categoryId);
  const name = z.string().min(1).max(50).parse(params.name.trim());
  const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(params.color);

  const [category] = await db.select().from(secretCategories).where(eq(secretCategories.id, categoryId));
  if (!category) throw new Error("Category not found");
  const { list, space } = await requireList(category.listId);
  const user = await requireUser();
  await assertSecretsAccess(category.listId);

  await db.transaction(async (tx) => {
    await tx.update(secretCategories).set({ name, color }).where(eq(secretCategories.id, categoryId));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "secret_category.renamed",
      payload: { from: category.name, to: name, listName: list.name },
    });
  });

  revalidatePath(listPath(space.slug, list.slug));
}

/** Deleting a category with secrets in it is rejected — reassign or delete those secrets first. */
export async function deleteSecretCategory(categoryId: string) {
  const id = z.string().uuid().parse(categoryId);
  const [category] = await db.select().from(secretCategories).where(eq(secretCategories.id, id));
  if (!category) return;
  const { list, space } = await requireList(category.listId);
  const user = await requireUser();
  await assertSecretsAccess(category.listId);

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(secrets)
    .where(eq(secrets.categoryId, id));
  if (n > 0) {
    throw new Error(
      `"${category.name}" has ${n} secret${n === 1 ? "" : "s"} in it. Move or delete ${n === 1 ? "it" : "them"} first.`,
    );
  }

  await db.transaction(async (tx) => {
    await tx.delete(secretCategories).where(eq(secretCategories.id, id));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: user.id,
      verb: "secret_category.deleted",
      payload: { name: category.name, listName: list.name },
    });
  });

  revalidatePath(listPath(space.slug, list.slug));
}

export async function createSecret(params: {
  taskId: string;
  categoryId: string;
  title: string;
  fields: SecretFieldInput[];
}): Promise<{ id: string }> {
  const taskId = z.string().uuid().parse(params.taskId);
  const categoryId = z.string().uuid().parse(params.categoryId);
  const title = z.string().min(1).max(150).parse(params.title.trim());
  const fields = z.array(secretFieldSchema).min(1).parse(params.fields);

  const { task, list, space } = await requireTask(taskId);
  const user = await requireUser();
  await assertSecretsAccess(list.id);
  if (!list.secretsEnabled) {
    throw new Error("Secrets are disabled for this list. Enable them in list settings to add more.");
  }

  const [category] = await db
    .select()
    .from(secretCategories)
    .where(and(eq(secretCategories.id, categoryId), eq(secretCategories.listId, list.id)));
  if (!category) throw new Error("Category not found on this list");

  const values: Record<string, string> = {};
  for (const f of fields) values[f.id] = f.value;
  const blob = encryptSecretValues(values);
  const fieldsSchema = fields.map(({ id, label, type, sensitive }) => ({ id, label, type, sensitive }));

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(secrets)
      .values({
        taskId,
        categoryId,
        title,
        fieldsSchema,
        encryptedValues: blob.ciphertext,
        encryptionIv: blob.iv,
        encryptionTag: blob.tag,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning({ id: secrets.id });
    await logActivity(tx, {
      spaceId: space.id,
      taskId,
      actorId: user.id,
      verb: "secret.created",
      payload: { title, category: category.name },
    });
    return row;
  });

  revalidatePath(`/tasks/task/${task.number}`);
  return { id: created.id };
}

export async function updateSecret(params: {
  secretId: string;
  categoryId: string;
  title: string;
  fields: SecretFieldInput[];
}) {
  const secretId = z.string().uuid().parse(params.secretId);
  const categoryId = z.string().uuid().parse(params.categoryId);
  const title = z.string().min(1).max(150).parse(params.title.trim());
  const fields = z.array(secretFieldSchema).min(1).parse(params.fields);

  const [existing] = await db.select().from(secrets).where(eq(secrets.id, secretId));
  if (!existing) throw new Error("Secret not found");
  const { task, list, space } = await requireTask(existing.taskId);
  const user = await requireUser();
  await assertSecretsAccess(list.id);

  const [category] = await db
    .select()
    .from(secretCategories)
    .where(and(eq(secretCategories.id, categoryId), eq(secretCategories.listId, list.id)));
  if (!category) throw new Error("Category not found on this list");

  const values: Record<string, string> = {};
  for (const f of fields) values[f.id] = f.value;
  const blob = encryptSecretValues(values);
  const fieldsSchema = fields.map(({ id, label, type, sensitive }) => ({ id, label, type, sensitive }));

  await db.transaction(async (tx) => {
    await tx
      .update(secrets)
      .set({
        categoryId,
        title,
        fieldsSchema,
        encryptedValues: blob.ciphertext,
        encryptionIv: blob.iv,
        encryptionTag: blob.tag,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(secrets.id, secretId));
    await logActivity(tx, {
      spaceId: space.id,
      taskId: existing.taskId,
      actorId: user.id,
      verb: "secret.updated",
      payload: { title, category: category.name },
    });
  });

  revalidatePath(`/tasks/task/${task.number}`);
}

export async function deleteSecret(secretId: string) {
  const id = z.string().uuid().parse(secretId);
  const [existing] = await db.select().from(secrets).where(eq(secrets.id, id));
  if (!existing) return;
  const { task, list, space } = await requireTask(existing.taskId);
  const user = await requireUser();
  await assertSecretsAccess(list.id);

  await db.transaction(async (tx) => {
    await tx.delete(secrets).where(eq(secrets.id, id));
    await logActivity(tx, {
      spaceId: space.id,
      taskId: existing.taskId,
      actorId: user.id,
      verb: "secret.deleted",
      payload: { title: existing.title },
    });
  });

  revalidatePath(`/tasks/task/${task.number}`);
}

/**
 * The only path that returns an actual sensitive value — decrypts one field
 * on explicit user request and logs a `secret.viewed` audit entry (title +
 * field label only, never the value itself).
 */
export async function revealSecretField(params: {
  secretId: string;
  fieldId: string;
}): Promise<{ value: string }> {
  const secretId = z.string().uuid().parse(params.secretId);
  const fieldId = z.string().min(1).parse(params.fieldId);

  const [row] = await db.select().from(secrets).where(eq(secrets.id, secretId));
  if (!row) throw new Error("Secret not found");
  const { list, space } = await requireTask(row.taskId);
  const user = await requireUser();
  await assertSecretsAccess(list.id);

  const fieldsSchema = row.fieldsSchema as { id: string; label: string }[];
  const field = fieldsSchema.find((f) => f.id === fieldId);
  if (!field) throw new Error("Field not found");

  const values = decryptSecretValues({
    iv: row.encryptionIv,
    tag: row.encryptionTag,
    ciphertext: row.encryptedValues,
  });

  await logActivity(db, {
    spaceId: space.id,
    taskId: row.taskId,
    actorId: user.id,
    verb: "secret.viewed",
    payload: { title: row.title, field: field.label },
  });

  return { value: values[fieldId] ?? "" };
}

/**
 * Full decrypted field set for the Edit Secret dialog — editing needs real
 * values, not the redacted preview the panel renders from. Logs one
 * `secret.viewed` entry per open, same audit trail as a single-field reveal.
 */
export async function getSecretForEdit(
  secretId: string,
): Promise<{ categoryId: string; title: string; fields: SecretFieldInput[] }> {
  const id = z.string().uuid().parse(secretId);
  const [row] = await db.select().from(secrets).where(eq(secrets.id, id));
  if (!row) throw new Error("Secret not found");
  const { list, space } = await requireTask(row.taskId);
  const user = await requireUser();
  await assertSecretsAccess(list.id);

  const fieldsSchema = row.fieldsSchema as { id: string; label: string; type: SecretFieldInput["type"]; sensitive: boolean }[];
  const values = decryptSecretValues({
    iv: row.encryptionIv,
    tag: row.encryptionTag,
    ciphertext: row.encryptedValues,
  });

  await logActivity(db, {
    spaceId: space.id,
    taskId: row.taskId,
    actorId: user.id,
    verb: "secret.viewed",
    payload: { title: row.title, field: "(opened for editing)" },
  });

  return {
    categoryId: row.categoryId,
    title: row.title,
    fields: fieldsSchema.map((f) => ({ ...f, value: values[f.id] ?? "" })),
  };
}

export async function addSecretViewer(params: { listId: string; userId: string }) {
  const listId = z.string().uuid().parse(params.listId);
  const userId = z.string().uuid().parse(params.userId);
  const { list, space } = await requireList(listId);
  const actor = await requireUser();
  await assertSpaceRole(space.id, "owner");

  const [targetUser] = await db.select().from(users).where(eq(users.id, userId));
  if (!targetUser) throw new Error("User not found");

  const [existing] = await db
    .select()
    .from(listSecretViewers)
    .where(and(eq(listSecretViewers.listId, listId), eq(listSecretViewers.userId, userId)));
  if (existing) return;

  await db.transaction(async (tx) => {
    await tx
      .insert(listSecretViewers)
      .values({ listId, principalType: "user", userId, grantedBy: actor.id });
    await logActivity(tx, {
      spaceId: space.id,
      actorId: actor.id,
      verb: "list.secret_viewer_added",
      payload: { userId, displayName: targetUser.displayName, listName: list.name },
    });
  });

  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}

export async function removeSecretViewer(viewerId: string) {
  const id = z.string().uuid().parse(viewerId);
  const [viewer] = await db.select().from(listSecretViewers).where(eq(listSecretViewers.id, id));
  if (!viewer) return;
  const { list, space } = await requireList(viewer.listId);
  const actor = await requireUser();
  await assertSpaceRole(space.id, "owner");

  await db.transaction(async (tx) => {
    await tx.delete(listSecretViewers).where(eq(listSecretViewers.id, id));
    await logActivity(tx, {
      spaceId: space.id,
      actorId: actor.id,
      verb: "list.secret_viewer_removed",
      payload: { userId: viewer.userId, listName: list.name },
    });
  });

  revalidatePath(`${listPath(space.slug, list.slug)}/settings`);
}
