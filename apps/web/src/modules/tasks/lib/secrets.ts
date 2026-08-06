/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { db, secretCategories, secrets, users } from "@aitim/db";
import { asc, eq } from "drizzle-orm";
import { decryptSecretValues } from "@/lib/secrets-crypto";
import type { SecretFieldMeta, SecretRow } from "./secret-fields";

export * from "./secret-fields";

/**
 * Secrets for one task, with sensitive field values redacted. The panel
 * renders titles/previews/categories from this; `revealSecretField` (in
 * `actions.ts`) is the only path that returns an actual sensitive value,
 * and only for one field at a time, on explicit user request.
 *
 * Server-only (imports `db` and the encryption key) — client components
 * must import types/constants from `./secret-fields` instead.
 */
export async function getSecretsForTask(taskId: string): Promise<SecretRow[]> {
  const rows = await db
    .select({
      id: secrets.id,
      taskId: secrets.taskId,
      categoryId: secrets.categoryId,
      categoryName: secretCategories.name,
      categoryColor: secretCategories.color,
      title: secrets.title,
      fieldsSchema: secrets.fieldsSchema,
      encryptedValues: secrets.encryptedValues,
      encryptionIv: secrets.encryptionIv,
      encryptionTag: secrets.encryptionTag,
      updatedAt: secrets.updatedAt,
      updatedByName: users.displayName,
    })
    .from(secrets)
    .innerJoin(secretCategories, eq(secrets.categoryId, secretCategories.id))
    .leftJoin(users, eq(secrets.updatedBy, users.id))
    .where(eq(secrets.taskId, taskId))
    .orderBy(asc(secrets.title));

  return rows.map((row) => {
    const schema = row.fieldsSchema as SecretFieldMeta[];
    let values: Record<string, string> = {};
    try {
      values = decryptSecretValues({
        iv: row.encryptionIv,
        tag: row.encryptionTag,
        ciphertext: row.encryptedValues,
      });
    } catch {
      // Corrupt row or wrong key — surface fields with no values rather than 500ing the page.
      values = {};
    }
    return {
      id: row.id,
      taskId: row.taskId,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      categoryColor: row.categoryColor,
      title: row.title,
      updatedAt: row.updatedAt,
      updatedByName: row.updatedByName,
      fields: schema.map((f) => ({
        ...f,
        value: f.sensitive ? null : (values[f.id] ?? null),
      })),
    };
  });
}
