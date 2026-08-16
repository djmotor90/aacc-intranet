/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Corporate Outreach — leads, opportunities, quotes, and training catalog.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./platform";
import { tasks } from "./tasks";

/**
 * Backs quote numbering ("Q-1001", "Q-1002", …) with an atomic nextval()
 * instead of read-the-last-row-then-increment in application code, which
 * races under concurrent quote creation.
 */
export const outreachQuoteNumberSeq = pgSequence("outreach_quote_number_seq", {
  startWith: 1002,
  increment: 1,
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const outreachLeadStatus = pgEnum("outreach_lead_status", [
  "new",
  "contacted",
  "nurturing",
  "unqualified",
  "converted",
]);

export const outreachOppStage = pgEnum("outreach_opp_stage", [
  "prospect",
  "analysis",
  "pre_proposal",
  "presentation",
  "negotiation",
  "contract",
  "closed_won",
  "closed_lost",
]);

export const outreachQuoteStatus = pgEnum("outreach_quote_status", [
  "draft",
  "sent",
  "accepted",
  "declined",
  "needs_review",
  "in_review",
  "approved",
  "rejected",
  "presented",
  "denied",
]);

export const outreachContextLevel = pgEnum("outreach_context_level", [
  "none",
  "light",
  "full",
]);

export const outreachEntityType = pgEnum("outreach_entity_type", [
  "account",
  "lead",
  "opportunity",
  "quote",
]);

export const outreachAccounts = pgTable(
  "outreach_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    website: text("website"),
    phone: text("phone"),
    notes: text("notes"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("outreach_accounts_name_idx").on(t.name)],
);

export const outreachLeads = pgTable(
  "outreach_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    title: text("title"),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    status: outreachLeadStatus("status").notNull().default("new"),
    source: text("source"),
    notes: text("notes"),
    accountId: uuid("account_id").references(() => outreachAccounts.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    convertedOpportunityId: uuid("converted_opportunity_id"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("outreach_leads_status_idx").on(t.status),
    index("outreach_leads_owner_idx").on(t.ownerId),
  ],
);

export const outreachOpportunities = pgTable(
  "outreach_opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    accountId: uuid("account_id").references(() => outreachAccounts.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => outreachLeads.id, { onDelete: "set null" }),
    stage: outreachOppStage("stage").notNull().default("prospect"),
    amountCents: integer("amount_cents").notNull().default(0),
    closeDate: date("close_date"),
    description: text("description"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("outreach_opps_stage_idx").on(t.stage),
    index("outreach_opps_account_idx").on(t.accountId),
  ],
);

export const outreachCatalogItems = pgTable(
  "outreach_catalog_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    productCode: text("product_code"),
    family: text("family"),
    description: text("description"),
    defaultHours: integer("default_hours").notNull().default(0),
    defaultUnitPriceCents: integer("default_unit_price_cents").notNull().default(0),
    defaultContext: outreachContextLevel("default_context").notNull().default("none"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("outreach_catalog_active_idx").on(t.isActive)],
);

export const outreachPriceBooks = pgTable(
  "outreach_price_books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    isStandard: boolean("is_standard").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("outreach_price_books_active_idx").on(t.isActive)],
);

export const outreachPriceBookEntries = pgTable(
  "outreach_price_book_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    priceBookId: uuid("price_book_id")
      .notNull()
      .references(() => outreachPriceBooks.id, { onDelete: "cascade" }),
    catalogItemId: uuid("catalog_item_id")
      .notNull()
      .references(() => outreachCatalogItems.id, { onDelete: "cascade" }),
    hours: integer("hours").notNull().default(0),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    contextLevel: outreachContextLevel("context_level").notNull().default("none"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("outreach_price_book_entry_unique_idx").on(t.priceBookId, t.catalogItemId),
    index("outreach_price_book_entries_book_idx").on(t.priceBookId),
  ],
);

export const outreachOpportunityLines = pgTable(
  "outreach_opportunity_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => outreachOpportunities.id, { onDelete: "cascade" }),
    catalogItemId: uuid("catalog_item_id").references(() => outreachCatalogItems.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    hours: integer("hours").notNull().default(0),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    contextLevel: outreachContextLevel("context_level").notNull().default("none"),
    ...timestamps,
  },
  (t) => [index("outreach_opp_lines_opp_idx").on(t.opportunityId)],
);

export const outreachQuotes = pgTable(
  "outreach_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => outreachOpportunities.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => outreachAccounts.id, { onDelete: "set null" }),
    name: text("name"),
    status: outreachQuoteStatus("status").notNull().default("draft"),
    validUntil: date("valid_until"),
    details: text("details"),
    notes: text("notes"),
    discountBps: integer("discount_bps").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    billToName: text("bill_to_name"),
    shipToName: text("ship_to_name"),
    shipToAddress: text("ship_to_address"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("outreach_quotes_number_idx").on(t.number),
    index("outreach_quotes_opp_idx").on(t.opportunityId),
  ],
);

export const outreachQuoteLines = pgTable(
  "outreach_quote_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => outreachQuotes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    hours: integer("hours").notNull().default(0),
    listPriceCents: integer("list_price_cents").notNull().default(0),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    contextLevel: outreachContextLevel("context_level").notNull().default("none"),
    ...timestamps,
  },
  (t) => [index("outreach_quote_lines_quote_idx").on(t.quoteId)],
);

export const outreachQuotePdfs = pgTable(
  "outreach_quote_pdfs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => outreachQuotes.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    content: text("content").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outreach_quote_pdfs_quote_idx").on(t.quoteId)],
);

export const outreachTaskLinks = pgTable(
  "outreach_task_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    entityType: outreachEntityType("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("outreach_task_links_unique_idx").on(t.taskId, t.entityType, t.entityId),
    index("outreach_task_links_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const outreachFollowers = pgTable(
  "outreach_followers",
  {
    entityType: outreachEntityType("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.entityType, t.entityId, t.userId] }),
    index("outreach_followers_user_idx").on(t.userId),
    index("outreach_followers_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const outreachEvents = pgTable(
  "outreach_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: outreachEntityType("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    subject: text("subject").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    location: text("location"),
    description: text("description"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("outreach_events_entity_idx").on(t.entityType, t.entityId),
    index("outreach_events_starts_idx").on(t.startsAt),
    index("outreach_events_owner_idx").on(t.ownerId),
  ],
);

export const outreachActivities = pgTable(
  "outreach_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: outreachEntityType("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    kind: text("kind").notNull(),
    body: text("body"),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outreach_activities_entity_idx").on(t.entityType, t.entityId)],
);

export const outreachAccountsRelations = relations(outreachAccounts, ({ many }) => ({
  leads: many(outreachLeads),
  opportunities: many(outreachOpportunities),
}));

export const outreachLeadsRelations = relations(outreachLeads, ({ one }) => ({
  account: one(outreachAccounts, { fields: [outreachLeads.accountId], references: [outreachAccounts.id] }),
  owner: one(users, { fields: [outreachLeads.ownerId], references: [users.id] }),
}));

export const outreachOpportunitiesRelations = relations(outreachOpportunities, ({ one, many }) => ({
  account: one(outreachAccounts, {
    fields: [outreachOpportunities.accountId],
    references: [outreachAccounts.id],
  }),
  lead: one(outreachLeads, { fields: [outreachOpportunities.leadId], references: [outreachLeads.id] }),
  lines: many(outreachOpportunityLines),
  quotes: many(outreachQuotes),
}));
