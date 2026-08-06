/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { relations, sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { lists, principalType, tasks } from "./tasks";
import { users } from "./platform";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/**
 * Per-list categories for the Secrets vault (e.g. Logins, Banking). Shown as
 * colored pills; managed directly from the Secrets panel, not list settings.
 */
export const secretCategories = pgTable(
  "secret_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#64748b"),
    position: text("position").notNull().default("a0"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("secret_categories_list_name_idx").on(t.listId, sql`lower(${t.name})`),
    index("secret_categories_list_idx").on(t.listId),
  ],
);

/**
 * A single vault entry (e.g. "TMS Password") attached to one task/record.
 * `fieldsSchema` never holds values — only labels/types/sensitivity — so the
 * UI can render an item's shape without decrypting. All values (sensitive
 * and not) live together in one AES-256-GCM blob per item; see
 * `apps/web/src/lib/secrets-crypto.ts` and `modules/tasks/lib/secrets.ts`.
 */
export const secrets = pgTable(
  "secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** Deleting a category with secrets in it is rejected server-side — no silent data loss. */
    categoryId: uuid("category_id")
      .notNull()
      .references(() => secretCategories.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    /** [{ id, label, type, sensitive }] — safe metadata, never encrypted. */
    fieldsSchema: jsonb("fields_schema").notNull().default(sql`'[]'::jsonb`),
    /** AES-256-GCM ciphertext (base64) of `{ [fieldId]: value }` for every field. */
    encryptedValues: text("encrypted_values").notNull(),
    encryptionIv: text("encryption_iv").notNull(),
    encryptionTag: text("encryption_tag").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("secrets_task_idx").on(t.taskId),
    index("secrets_category_idx").on(t.categoryId),
  ],
);

/**
 * Explicit per-list grant of Secrets-vault access to a member/guest who
 * isn't a space owner. Space owners always have access (see
 * `canViewSecrets` in `apps/web/src/lib/rbac.ts`) and never need a row here.
 * Same shape as `listMembers`/`folderMembers`, but no role — this is a
 * single yes/no permission, not a list-access role.
 */
export const listSecretViewers = pgTable(
  "list_secret_viewers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    principalType: principalType("principal_type").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id"),
    grantedBy: uuid("granted_by").references(() => users.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("list_secret_viewers_user_idx")
      .on(t.listId, t.userId)
      .where(sql`${t.userId} is not null`),
    uniqueIndex("list_secret_viewers_group_idx")
      .on(t.listId, t.groupId)
      .where(sql`${t.groupId} is not null`),
  ],
);

export const secretCategoriesRelations = relations(secretCategories, ({ one, many }) => ({
  list: one(lists, { fields: [secretCategories.listId], references: [lists.id] }),
  secrets: many(secrets),
}));

export const secretsRelations = relations(secrets, ({ one }) => ({
  task: one(tasks, { fields: [secrets.taskId], references: [tasks.id] }),
  category: one(secretCategories, { fields: [secrets.categoryId], references: [secretCategories.id] }),
  creator: one(users, { fields: [secrets.createdBy], references: [users.id] }),
  updater: one(users, { fields: [secrets.updatedBy], references: [users.id] }),
}));

export const listSecretViewersRelations = relations(listSecretViewers, ({ one }) => ({
  list: one(lists, { fields: [listSecretViewers.listId], references: [lists.id] }),
  user: one(users, { fields: [listSecretViewers.userId], references: [users.id] }),
}));
