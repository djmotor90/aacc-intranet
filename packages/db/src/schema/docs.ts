/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Docs / knowledge pages — page-first tree with home Space ACL + graph links to work.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { users } from "./platform";
import { spaces } from "./tasks";

/** Dimensions for OpenAI text-embedding-3-small — change if the embedding model changes. */
export const DOC_CHUNK_EMBEDDING_DIMENSIONS = 1536;

/** Nullable bytea — Yjs document snapshots for live multiplayer. */
const bytea = customType<{ data: Buffer | null; driverData: Buffer | null }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer | null): Buffer | null {
    return value ?? null;
  },
  fromDriver(value: unknown): Buffer | null {
    if (value == null) return null;
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    return null;
  },
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Display kind only — same storage for wiki roots and normal pages. */
export const docPageKind = pgEnum("doc_page_kind", ["page", "wiki"]);

/** Graph edge from a page to work items (space / folder / list / task). */
export const docLinkTargetType = pgEnum("doc_link_target_type", [
  "space",
  "folder",
  "list",
  "task",
]);

/**
 * Drive-style folders for organizing docs in the All Docs hub.
 * Nesting via parentFolderId. ACL via homeSpaceId (same as pages).
 */
export const docFolders = pgTable(
  "doc_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    homeSpaceId: uuid("home_space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    /** Null = top-level folder under All Docs root. */
    parentFolderId: uuid("parent_folder_id"),
    name: text("name").notNull(),
    position: text("position").notNull().default("a0"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("doc_folders_space_parent_idx").on(t.homeSpaceId, t.parentFolderId, t.position),
    index("doc_folders_parent_idx").on(t.parentFolderId),
    index("doc_folders_deleted_idx").on(t.deletedAt),
  ],
);

/**
 * First-class knowledge page.
 * - `docId` groups peer pages into one AACC Hub Doc.
 * - `parentPageId` null = top-level page in that doc (all equally important).
 * - Nested subpages set parentPageId to another page in the same doc.
 * - `folderId` places the whole doc in a hub folder (Drive-style); shared across docId.
 * Access inherits from homeSpaceId (space membership / Super Admin).
 */
export const docPages = pgTable(
  "doc_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    homeSpaceId: uuid("home_space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    /**
     * Shared container id for all pages in one Doc. Usually the id of the
     * first page created; never a privileged "home" page in the UI.
     */
    docId: uuid("doc_id").notNull(),
    /** Hub folder for this doc (null = All Docs root). Kept in sync for every page in the doc. */
    folderId: uuid("folder_id").references(() => docFolders.id, { onDelete: "set null" }),
    parentPageId: uuid("parent_page_id"),
    title: text("title").notNull().default("Untitled"),
    /** URL-friendly segment; unique among siblings under the same parent within a doc. */
    slug: text("slug").notNull(),
    icon: text("icon"),
    coverObjectKey: text("cover_object_key"),
    /** TipTap hybrid: { text, doc } — always kept in sync for non-collab readers. */
    body: jsonb("body").notNull().default(sql`'{"text":"","doc":null}'::jsonb`),
    /** Optimistic-concurrency token for body edits only; metadata does not increment it. */
    bodyVersion: integer("body_version").notNull().default(0),
    /**
     * Yjs binary state for live multiplayer (Hocuspocus). When present, collab
     * clients load from this instead of replaying body.doc.
     */
    ydocState: bytea("ydoc_state"),
    kind: docPageKind("kind").notNull().default("page"),
    /** Fractional index among siblings. */
    position: text("position").notNull().default("a0"),
    /** When true, only manage_docs / space owner / Super Admin may edit. */
    isProtected: boolean("is_protected").notNull().default(false),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedById: uuid("verified_by_id").references(() => users.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("doc_pages_space_parent_idx").on(t.homeSpaceId, t.parentPageId, t.position),
    index("doc_pages_doc_parent_idx").on(t.docId, t.parentPageId, t.position),
    index("doc_pages_folder_idx").on(t.folderId),
    index("doc_pages_space_updated_idx").on(t.homeSpaceId, t.updatedAt),
    index("doc_pages_owner_idx").on(t.ownerId),
    index("doc_pages_deleted_idx").on(t.deletedAt),
    uniqueIndex("doc_pages_sibling_slug_idx").on(
      t.docId,
      sql`coalesce(${t.parentPageId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      t.slug,
    ),
  ],
);

/** Immutable content snapshots used by Docs history, compare, and restore. */
export const docPageRevisions = pgTable(
  "doc_page_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => docPages.id, { onDelete: "cascade" }),
    /** The page body revision this snapshot represents. */
    bodyVersion: integer("body_version").notNull(),
    body: jsonb("body").notNull(),
    /** saved | restored — restores themselves remain part of the timeline. */
    changeType: text("change_type").notNull().default("saved"),
    restoredFromRevisionId: uuid("restored_from_revision_id"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("doc_page_revisions_page_created_idx").on(t.pageId, t.createdAt),
    uniqueIndex("doc_page_revisions_page_version_idx").on(t.pageId, t.bodyVersion),
  ],
);

export const docLinks = pgTable(
  "doc_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => docPages.id, { onDelete: "cascade" }),
    targetType: docLinkTargetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("doc_links_unique_idx").on(t.pageId, t.targetType, t.targetId),
    index("doc_links_target_idx").on(t.targetType, t.targetId),
    index("doc_links_page_idx").on(t.pageId),
  ],
);

/** Embeds and files attached to a page (parallel to task attachments). */
export const docAttachments = pgTable(
  "doc_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => docPages.id, { onDelete: "cascade" }),
    uploaderId: uuid("uploader_id").references(() => users.id, { onDelete: "set null" }),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksumSha256: text("checksum_sha256"),
    ...timestamps,
  },
  (t) => [index("doc_attachments_page_idx").on(t.pageId)],
);

/**
 * Retrieval chunks for pgvector-backed Super Agent knowledge search.
 *
 * One page's body is split into heading-scoped chunks (see
 * modules/docs/lib/chunking.ts) and re-embedded whenever the page is saved
 * (see worker/jobs/embed-doc.ts) — rows for a page are fully replaced on each
 * re-embed rather than diffed, since chunk boundaries can shift on any edit.
 */
export const docChunks = pgTable(
  "doc_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => docPages.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    /** Nearest enclosing heading, for citations / debugging retrieval hits. */
    heading: text("heading"),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: DOC_CHUNK_EMBEDDING_DIMENSIONS }).notNull(),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("doc_chunks_page_chunk_idx").on(t.pageId, t.chunkIndex),
    index("doc_chunks_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const docFoldersRelations = relations(docFolders, ({ one, many }) => ({
  homeSpace: one(spaces, { fields: [docFolders.homeSpaceId], references: [spaces.id] }),
  parent: one(docFolders, {
    fields: [docFolders.parentFolderId],
    references: [docFolders.id],
    relationName: "doc_folder_tree",
  }),
  children: many(docFolders, { relationName: "doc_folder_tree" }),
  pages: many(docPages),
  createdBy: one(users, {
    fields: [docFolders.createdById],
    references: [users.id],
  }),
}));

export const docPagesRelations = relations(docPages, ({ one, many }) => ({
  homeSpace: one(spaces, { fields: [docPages.homeSpaceId], references: [spaces.id] }),
  folder: one(docFolders, {
    fields: [docPages.folderId],
    references: [docFolders.id],
  }),
  parent: one(docPages, {
    fields: [docPages.parentPageId],
    references: [docPages.id],
    relationName: "page_tree",
  }),
  children: many(docPages, { relationName: "page_tree" }),
  links: many(docLinks),
  attachments: many(docAttachments),
  chunks: many(docChunks),
  owner: one(users, { fields: [docPages.ownerId], references: [users.id] }),
  createdBy: one(users, {
    fields: [docPages.createdById],
    references: [users.id],
    relationName: "doc_created_by",
  }),
}));

export const docLinksRelations = relations(docLinks, ({ one }) => ({
  page: one(docPages, { fields: [docLinks.pageId], references: [docPages.id] }),
}));

export const docAttachmentsRelations = relations(docAttachments, ({ one }) => ({
  page: one(docPages, { fields: [docAttachments.pageId], references: [docPages.id] }),
  uploader: one(users, { fields: [docAttachments.uploaderId], references: [users.id] }),
}));
