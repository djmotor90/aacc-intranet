/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { lists, tasks } from "./tasks";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const publicForms = pgTable(
  "public_forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Unguessable slug, e.g. "employer-training-request-x7k2m9" */
    slug: text("slug").notNull().unique(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id),
    /**
     * Optional link to a Form list-view tab.
     * When the view is deleted, the form row is removed in app code.
     */
    listViewId: uuid("list_view_id"),
    title: text("title").notNull(),
    introMd: text("intro_md"),
    successMessage: text("success_message"),
    isActive: boolean("is_active").notNull().default(true),
    /** Space role to notify on submission: "owner" | "member" */
    notifySpaceRole: text("notify_space_role").notNull().default("owner"),
    /** Status applied to every new submission task (null = list default). */
    defaultStatusId: uuid("default_status_id"),
    /** User ids auto-assigned on submit (json array of uuids). */
    defaultAssigneeIds: jsonb("default_assignee_ids").notNull().default("[]"),
    /** When true, public form accepts file uploads attached to the task. */
    allowAttachments: boolean("allow_attachments").notNull().default(false),
    maxAttachments: integer("max_attachments").notNull().default(5),
    /**
     * Visual theme for public form / preview.
     * See apps/web form-types.ts → FormTheme
     */
    theme: jsonb("theme").notNull().default("{}"),
    /**
     * Ordered field array — see apps/web form-types.ts
     * Supports showWhen conditional logic, prefillKey, hidden, mapTo, …
     */
    fields: jsonb("fields").notNull().default("[]"),
    ...timestamps,
  },
  (t) => [
    index("public_forms_list_view_idx").on(t.listViewId),
    index("public_forms_list_idx").on(t.listId),
  ],
);

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => publicForms.id),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    rawPayload: jsonb("raw_payload").notNull(),
    submitterEmail: text("submitter_email"),
    submitterName: text("submitter_name"),
    ipHash: text("ip_hash"),
    turnstileOk: boolean("turnstile_ok"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("form_submissions_form_idx").on(t.formId, t.createdAt)],
);
