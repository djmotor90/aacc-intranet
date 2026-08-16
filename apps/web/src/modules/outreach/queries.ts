/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  db,
  lists,
  outreachAccounts,
  outreachActivities,
  outreachCatalogItems,
  outreachEvents,
  outreachFollowers,
  outreachLeads,
  outreachOpportunities,
  outreachPriceBookEntries,
  outreachPriceBooks,
  outreachOpportunityLines,
  outreachQuoteLines,
  outreachQuotePdfs,
  outreachQuotes,
  outreachTaskLinks,
  spaces,
  statuses,
  tasks,
  users,
} from "@aitim/db";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { OutreachEntity } from "./lib/stages";
import { entityPath } from "./lib/stages";

export async function listAccounts() {
  return db.select().from(outreachAccounts).orderBy(outreachAccounts.name);
}

export async function getAccount(id: string) {
  const [row] = await db.select().from(outreachAccounts).where(eq(outreachAccounts.id, id));
  return row ?? null;
}

export async function listLeads() {
  const rows = await db
    .select({
      lead: outreachLeads,
      ownerName: users.displayName,
      accountName: outreachAccounts.name,
    })
    .from(outreachLeads)
    .leftJoin(users, eq(outreachLeads.ownerId, users.id))
    .leftJoin(outreachAccounts, eq(outreachLeads.accountId, outreachAccounts.id))
    .orderBy(desc(outreachLeads.updatedAt));
  return rows;
}

export async function getLead(id: string) {
  const [row] = await db
    .select({
      lead: outreachLeads,
      ownerName: users.displayName,
      accountName: outreachAccounts.name,
    })
    .from(outreachLeads)
    .leftJoin(users, eq(outreachLeads.ownerId, users.id))
    .leftJoin(outreachAccounts, eq(outreachLeads.accountId, outreachAccounts.id))
    .where(eq(outreachLeads.id, id));
  return row ?? null;
}

export async function listOpportunities() {
  return db
    .select({
      opportunity: outreachOpportunities,
      ownerName: users.displayName,
      accountName: outreachAccounts.name,
    })
    .from(outreachOpportunities)
    .leftJoin(users, eq(outreachOpportunities.ownerId, users.id))
    .leftJoin(outreachAccounts, eq(outreachOpportunities.accountId, outreachAccounts.id))
    .orderBy(desc(outreachOpportunities.updatedAt));
}

export async function getOpportunity(id: string) {
  const [row] = await db
    .select({
      opportunity: outreachOpportunities,
      ownerName: users.displayName,
      accountName: outreachAccounts.name,
    })
    .from(outreachOpportunities)
    .leftJoin(users, eq(outreachOpportunities.ownerId, users.id))
    .leftJoin(outreachAccounts, eq(outreachOpportunities.accountId, outreachAccounts.id))
    .where(eq(outreachOpportunities.id, id));
  if (!row) return null;
  const lines = await db
    .select()
    .from(outreachOpportunityLines)
    .where(eq(outreachOpportunityLines.opportunityId, id))
    .orderBy(outreachOpportunityLines.createdAt);
  const quotes = await db
    .select()
    .from(outreachQuotes)
    .where(eq(outreachQuotes.opportunityId, id))
    .orderBy(desc(outreachQuotes.createdAt));
  return { ...row, lines, quotes };
}

export async function listQuotes() {
  return db
    .select({
      quote: outreachQuotes,
      opportunityName: outreachOpportunities.name,
      accountName: outreachAccounts.name,
    })
    .from(outreachQuotes)
    .innerJoin(outreachOpportunities, eq(outreachQuotes.opportunityId, outreachOpportunities.id))
    .leftJoin(outreachAccounts, eq(outreachQuotes.accountId, outreachAccounts.id))
    .orderBy(desc(outreachQuotes.createdAt));
}

export async function getQuote(id: string) {
  const [row] = await db
    .select({
      quote: outreachQuotes,
      opportunityName: outreachOpportunities.name,
      accountName: outreachAccounts.name,
      preparedByName: users.displayName,
      preparedByEmail: users.email,
    })
    .from(outreachQuotes)
    .innerJoin(outreachOpportunities, eq(outreachQuotes.opportunityId, outreachOpportunities.id))
    .leftJoin(outreachAccounts, eq(outreachQuotes.accountId, outreachAccounts.id))
    .leftJoin(users, eq(outreachQuotes.createdBy, users.id))
    .where(eq(outreachQuotes.id, id));
  if (!row) return null;
  const [lines, pdfs] = await Promise.all([
    db
      .select()
      .from(outreachQuoteLines)
      .where(eq(outreachQuoteLines.quoteId, id))
      .orderBy(outreachQuoteLines.createdAt),
    db
      .select({
        id: outreachQuotePdfs.id,
        fileName: outreachQuotePdfs.fileName,
        sizeBytes: outreachQuotePdfs.sizeBytes,
        createdAt: outreachQuotePdfs.createdAt,
        createdByName: users.displayName,
      })
      .from(outreachQuotePdfs)
      .leftJoin(users, eq(outreachQuotePdfs.createdBy, users.id))
      .where(eq(outreachQuotePdfs.quoteId, id))
      .orderBy(desc(outreachQuotePdfs.createdAt)),
  ]);
  return { ...row, lines, pdfs };
}

export async function listCatalog() {
  return db
    .select()
    .from(outreachCatalogItems)
    .where(eq(outreachCatalogItems.isActive, true))
    .orderBy(outreachCatalogItems.name);
}

export async function listProducts() {
  return db.select().from(outreachCatalogItems).orderBy(outreachCatalogItems.name);
}

export async function getProduct(id: string) {
  const [row] = await db.select().from(outreachCatalogItems).where(eq(outreachCatalogItems.id, id));
  return row ?? null;
}

export async function listPriceBooks() {
  return db.select().from(outreachPriceBooks).orderBy(desc(outreachPriceBooks.isStandard), outreachPriceBooks.name);
}

export async function getPriceBook(id: string) {
  const [book] = await db.select().from(outreachPriceBooks).where(eq(outreachPriceBooks.id, id));
  if (!book) return null;
  const entries = await db
    .select({
      entry: outreachPriceBookEntries,
      product: outreachCatalogItems,
    })
    .from(outreachPriceBookEntries)
    .innerJoin(outreachCatalogItems, eq(outreachPriceBookEntries.catalogItemId, outreachCatalogItems.id))
    .where(eq(outreachPriceBookEntries.priceBookId, id))
    .orderBy(outreachCatalogItems.name);
  return { book, entries };
}

export async function listPriceBookEntries(priceBookId: string) {
  return db
    .select({
      entry: outreachPriceBookEntries,
      product: outreachCatalogItems,
    })
    .from(outreachPriceBookEntries)
    .innerJoin(outreachCatalogItems, eq(outreachPriceBookEntries.catalogItemId, outreachCatalogItems.id))
    .where(eq(outreachPriceBookEntries.priceBookId, priceBookId))
    .orderBy(outreachCatalogItems.name);
}

export async function listProductPriceBooks(productId: string) {
  return db
    .select({
      entry: outreachPriceBookEntries,
      book: outreachPriceBooks,
    })
    .from(outreachPriceBookEntries)
    .innerJoin(outreachPriceBooks, eq(outreachPriceBookEntries.priceBookId, outreachPriceBooks.id))
    .where(eq(outreachPriceBookEntries.catalogItemId, productId))
    .orderBy(outreachPriceBooks.name);
}

export async function isFollowing(userId: string, entityType: OutreachEntity, entityId: string) {
  const [row] = await db
    .select({ userId: outreachFollowers.userId })
    .from(outreachFollowers)
    .where(
      and(
        eq(outreachFollowers.entityType, entityType),
        eq(outreachFollowers.entityId, entityId),
        eq(outreachFollowers.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function listFollowers(entityType: OutreachEntity, entityId: string) {
  return db
    .select({
      userId: users.id,
      displayName: users.displayName,
      followedAt: outreachFollowers.createdAt,
    })
    .from(outreachFollowers)
    .innerJoin(users, eq(outreachFollowers.userId, users.id))
    .where(and(eq(outreachFollowers.entityType, entityType), eq(outreachFollowers.entityId, entityId)))
    .orderBy(desc(outreachFollowers.createdAt));
}

export async function listRecordEvents(entityType: OutreachEntity, entityId: string) {
  return db
    .select({
      event: outreachEvents,
      ownerName: users.displayName,
    })
    .from(outreachEvents)
    .leftJoin(users, eq(outreachEvents.ownerId, users.id))
    .where(and(eq(outreachEvents.entityType, entityType), eq(outreachEvents.entityId, entityId)))
    .orderBy(outreachEvents.startsAt);
}

export async function listFollowedRecords(userId: string) {
  const follows = await db
    .select()
    .from(outreachFollowers)
    .where(eq(outreachFollowers.userId, userId))
    .orderBy(desc(outreachFollowers.createdAt));
  if (follows.length === 0) return [];

  const ids = (type: OutreachEntity) => follows.filter((f) => f.entityType === type).map((f) => f.entityId);
  const leadIds = ids("lead");
  const oppIds = ids("opportunity");
  const accountIds = ids("account");
  const quoteIds = ids("quote");
  const [leads, opps, accounts, quotes] = await Promise.all([
    leadIds.length
      ? db
          .select({ id: outreachLeads.id, firstName: outreachLeads.firstName, lastName: outreachLeads.lastName })
          .from(outreachLeads)
          .where(inArray(outreachLeads.id, leadIds))
      : Promise.resolve([]),
    oppIds.length
      ? db
          .select({ id: outreachOpportunities.id, name: outreachOpportunities.name })
          .from(outreachOpportunities)
          .where(inArray(outreachOpportunities.id, oppIds))
      : Promise.resolve([]),
    accountIds.length
      ? db
          .select({ id: outreachAccounts.id, name: outreachAccounts.name })
          .from(outreachAccounts)
          .where(inArray(outreachAccounts.id, accountIds))
      : Promise.resolve([]),
    quoteIds.length
      ? db
          .select({ id: outreachQuotes.id, number: outreachQuotes.number })
          .from(outreachQuotes)
          .where(inArray(outreachQuotes.id, quoteIds))
      : Promise.resolve([]),
  ]);
  const leadMap = new Map(leads.map((r) => [r.id, `${r.firstName} ${r.lastName}`]));
  const oppMap = new Map(opps.map((r) => [r.id, r.name]));
  const accountMap = new Map(accounts.map((r) => [r.id, r.name]));
  const quoteMap = new Map(quotes.map((r) => [r.id, r.number]));

  return follows.map((follow) => {
    const title =
      follow.entityType === "lead"
        ? (leadMap.get(follow.entityId) ?? "Lead")
        : follow.entityType === "opportunity"
          ? (oppMap.get(follow.entityId) ?? "Opportunity")
          : follow.entityType === "account"
            ? (accountMap.get(follow.entityId) ?? "Account")
            : (quoteMap.get(follow.entityId) ?? "Quote");
    return {
      entityType: follow.entityType,
      entityId: follow.entityId,
      title,
      href: entityPath(follow.entityType, follow.entityId),
      followedAt: follow.createdAt,
    };
  });
}

export async function listUpcomingEventsForUser(userId: string, limit = 12) {
  const follows = await db
    .select({ entityType: outreachFollowers.entityType, entityId: outreachFollowers.entityId })
    .from(outreachFollowers)
    .where(eq(outreachFollowers.userId, userId));

  const rows = await db
    .select({
      event: outreachEvents,
      ownerName: users.displayName,
    })
    .from(outreachEvents)
    .leftJoin(users, eq(outreachEvents.ownerId, users.id))
    .where(isNull(outreachEvents.completedAt))
    .orderBy(outreachEvents.startsAt)
    .limit(80);

  const followed = new Set(follows.map((f) => `${f.entityType}:${f.entityId}`));
  return rows
    .filter((row) => row.event.ownerId === userId || followed.has(`${row.event.entityType}:${row.event.entityId}`))
    .slice(0, limit)
    .map((row) => ({
      ...row.event,
      ownerName: row.ownerName,
      href: entityPath(row.event.entityType, row.event.entityId),
    }));
}

export async function listActivities(entityType: OutreachEntity, entityId: string) {
  return db
    .select({
      activity: outreachActivities,
      actorName: users.displayName,
    })
    .from(outreachActivities)
    .leftJoin(users, eq(outreachActivities.actorId, users.id))
    .where(and(eq(outreachActivities.entityType, entityType), eq(outreachActivities.entityId, entityId)))
    .orderBy(desc(outreachActivities.createdAt));
}

export async function listLinkedTasks(entityType: OutreachEntity, entityId: string) {
  return db
    .select({
      linkId: outreachTaskLinks.id,
      taskId: tasks.id,
      number: tasks.number,
      title: tasks.title,
      dueDate: tasks.dueDate,
      statusName: statuses.name,
      statusColor: statuses.color,
    })
    .from(outreachTaskLinks)
    .innerJoin(tasks, eq(outreachTaskLinks.taskId, tasks.id))
    .innerJoin(statuses, eq(tasks.statusId, statuses.id))
    .where(
      and(
        eq(outreachTaskLinks.entityType, entityType),
        eq(outreachTaskLinks.entityId, entityId),
        eq(tasks.isArchived, false),
      ),
    )
    .orderBy(desc(tasks.updatedAt));
}

/**
 * Search across the whole Task Hub, but only return tasks the caller can
 * actually see — Outreach has no space/list scoping of its own, so this is
 * the only gate keeping private-list tasks out of Outreach's search results.
 * Over-fetches candidates since some get dropped by the access check.
 */
export async function searchHubTasks(
  query: string,
  userId: string,
  platformRole: string | undefined,
  limit = 12,
) {
  const { getListRole } = await import("@/lib/rbac");
  const q = query.trim();
  const like = q ? `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%` : null;
  const candidates = await db
    .select({
      id: tasks.id,
      number: tasks.number,
      title: tasks.title,
      listId: tasks.listId,
      listName: lists.name,
      spaceName: spaces.name,
    })
    .from(tasks)
    .innerJoin(lists, eq(tasks.listId, lists.id))
    .innerJoin(spaces, eq(lists.spaceId, spaces.id))
    .where(
      and(
        eq(tasks.isArchived, false),
        sql`${tasks.deletedAt} is null`,
        like ? or(ilike(tasks.title, like), ilike(tasks.number, like)) : sql`true`,
      ),
    )
    .orderBy(desc(tasks.updatedAt))
    .limit(limit * 5);

  const roles = await Promise.all(candidates.map((c) => getListRole(userId, c.listId, platformRole)));
  const out: { id: string; number: string; title: string; listName: string; spaceName: string }[] = [];
  for (let i = 0; i < candidates.length && out.length < limit; i++) {
    if (!roles[i]) continue;
    const { id, number, title, listName, spaceName } = candidates[i];
    out.push({ id, number, title, listName, spaceName });
  }
  return out;
}

export async function listWritableListsForPicker(userId: string, platformRole: string | undefined) {
  const { getListRole } = await import("@/lib/rbac");
  const rows = await db
    .select({
      id: lists.id,
      name: lists.name,
      slug: lists.slug,
      spaceName: spaces.name,
      spaceSlug: spaces.slug,
    })
    .from(lists)
    .innerJoin(spaces, eq(lists.spaceId, spaces.id))
    .where(and(eq(lists.isArchived, false), sql`${lists.deletedAt} is null`))
    .orderBy(spaces.name, lists.name);
  const roles = await Promise.all(rows.map((row) => getListRole(userId, row.id, platformRole)));
  return rows.filter((_, i) => roles[i] === "owner" || roles[i] === "member");
}

export async function getActivePeople() {
  return db
    .select({ id: users.id, displayName: users.displayName, photoKey: users.photoKey })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(users.displayName);
}
