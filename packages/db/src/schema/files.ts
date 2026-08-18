/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * First-class Files hub (Google Drive-style folders + uploads).
 * Access inherits from homeSpaceId (space membership / Super Admin).
 */
import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./platform";
import { spaces } from "./tasks";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const driveFolders = pgTable(
  "drive_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    homeSpaceId: uuid("home_space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    parentFolderId: uuid("parent_folder_id"),
    name: text("name").notNull(),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("drive_folders_space_parent_idx").on(t.homeSpaceId, t.parentFolderId),
    index("drive_folders_parent_idx").on(t.parentFolderId),
    index("drive_folders_deleted_idx").on(t.deletedAt),
  ],
);

export const driveFiles = pgTable(
  "drive_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    homeSpaceId: uuid("home_space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => driveFolders.id, { onDelete: "set null" }),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    objectKey: text("object_key").notNull(),
    uploaderId: uuid("uploader_id").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("drive_files_space_folder_idx").on(t.homeSpaceId, t.folderId),
    index("drive_files_folder_idx").on(t.folderId),
    index("drive_files_deleted_idx").on(t.deletedAt),
    index("drive_files_updated_idx").on(t.updatedAt),
  ],
);

export const driveStars = pgTable(
  "drive_stars",
  {
    fileId: uuid("file_id")
      .notNull()
      .references(() => driveFiles.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.fileId, t.userId] }), index("drive_stars_user_idx").on(t.userId)],
);

export const driveFoldersRelations = relations(driveFolders, ({ one, many }) => ({
  homeSpace: one(spaces, { fields: [driveFolders.homeSpaceId], references: [spaces.id] }),
  parent: one(driveFolders, {
    fields: [driveFolders.parentFolderId],
    references: [driveFolders.id],
    relationName: "drive_folder_tree",
  }),
  children: many(driveFolders, { relationName: "drive_folder_tree" }),
  files: many(driveFiles),
}));

export const driveFilesRelations = relations(driveFiles, ({ one, many }) => ({
  homeSpace: one(spaces, { fields: [driveFiles.homeSpaceId], references: [spaces.id] }),
  folder: one(driveFolders, { fields: [driveFiles.folderId], references: [driveFolders.id] }),
  uploader: one(users, { fields: [driveFiles.uploaderId], references: [users.id] }),
  stars: many(driveStars),
}));
