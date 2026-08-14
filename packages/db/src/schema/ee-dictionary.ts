/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * EE (Extended Education / Lifelong Learning) SQL Server data dictionary —
 * a searchable, database-backed replacement for the source Word doc, which
 * chokes past ~900 tables. Read-only reference data, reimported wholesale
 * from a parsed data-dictionary export when a new schema version ships.
 */
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const eeDbTables = pgTable(
  "ee_db_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** e.g. "dbo.ac_action_detail" */
    fullName: text("full_name").notNull(),
    schemaName: text("schema_name").notNull(),
    tableName: text("table_name").notNull(),
    /** Order of appearance in the source document — stable default sort. */
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("ee_db_tables_full_name_idx").on(t.fullName)],
);

export const eeDbColumns = pgTable(
  "ee_db_columns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => eeDbTables.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dataType: text("data_type").notNull(),
    nullable: boolean("nullable").notNull().default(true),
    comment: text("comment"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("ee_db_columns_table_idx").on(t.tableId),
    index("ee_db_columns_name_idx").on(t.name),
  ],
);

export const eeDbIndexes = pgTable(
  "ee_db_indexes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => eeDbTables.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isUnique: boolean("is_unique").notNull().default(false),
    isClustered: boolean("is_clustered").notNull().default(false),
    /** Comma-separated field list, as printed in the source doc. */
    fields: text("fields").notNull().default(""),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("ee_db_indexes_table_idx").on(t.tableId)],
);
