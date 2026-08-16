"use server";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import {
  allocateTaskNumber,
  db,
  lists,
  outreachAccounts,
  outreachActivities,
  outreachCatalogItems,
  outreachEvents,
  outreachFollowers,
  outreachLeads,
  outreachOpportunities,
  outreachOpportunityLines,
  outreachQuoteLines,
  outreachQuotes,
  outreachTaskLinks,
  spaces,
  statuses,
  tasks,
} from "@aitim/db";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertListRole, requireUser } from "@/lib/rbac";
import type { ContextLevel, LeadStatus, OppStage, OutreachEntity, QuoteStatus } from "./lib/stages";
import { entityPath, lineTotalCents } from "./lib/stages";

const uuid = z.string().uuid();
const money = z.coerce.number().int().min(0).max(100_000_000);
const qty = z.coerce.number().int().min(1).max(10_000);
const hours = z.coerce.number().int().min(0).max(10_000);

function refresh(path?: string) {
  revalidatePath("/outreach");
  if (path) revalidatePath(path);
}

async function note(
  entityType: "account" | "lead" | "opportunity" | "quote",
  entityId: string,
  actorId: string,
  kind: string,
  body?: string,
) {
  await db.insert(outreachActivities).values({ entityType, entityId, actorId, kind, body: body ?? null });
}

export async function ensureCatalogSeeded() {
  const existing = await db.select({ id: outreachCatalogItems.id }).from(outreachCatalogItems).limit(1);
  if (existing.length > 0) return;
  await db.insert(outreachCatalogItems).values([
    {
      name: "16 Hour Training — No contextualization",
      defaultHours: 16,
      defaultUnitPriceCents: 480000,
      defaultContext: "none",
    },
    {
      name: "4 Hour Training — No contextualization",
      defaultHours: 4,
      defaultUnitPriceCents: 120000,
      defaultContext: "none",
    },
    {
      name: "4 Hour Training — Light contextualization",
      defaultHours: 4,
      defaultUnitPriceCents: 150000,
      defaultContext: "light",
    },
    {
      name: "Workforce custom workshop",
      defaultHours: 8,
      defaultUnitPriceCents: 280000,
      defaultContext: "full",
    },
  ]);
}

export async function createAccount(input: { name: string; website?: string; phone?: string; notes?: string }) {
  const user = await requireUser();
  const name = z.string().min(1).max(160).parse(input.name.trim());
  const [row] = await db
    .insert(outreachAccounts)
    .values({
      name,
      website: input.website?.trim() || null,
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
      ownerId: user.id,
      createdBy: user.id,
    })
    .returning();
  await note("account", row.id, user.id, "created", name);
  refresh();
  return row;
}

export async function createLead(input: {
  firstName: string;
  lastName: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  source?: string;
  notes?: string;
  accountId?: string | null;
}) {
  const user = await requireUser();
  const [row] = await db
    .insert(outreachLeads)
    .values({
      firstName: z.string().min(1).max(80).parse(input.firstName.trim()),
      lastName: z.string().min(1).max(80).parse(input.lastName.trim()),
      title: input.title?.trim() || null,
      company: input.company?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      source: input.source?.trim() || null,
      notes: input.notes?.trim() || null,
      accountId: input.accountId ? uuid.parse(input.accountId) : null,
      ownerId: user.id,
      createdBy: user.id,
    })
    .returning();
  await note("lead", row.id, user.id, "created", `${row.firstName} ${row.lastName}`);
  refresh("/outreach/leads");
  return row;
}

export async function updateLead(
  id: string,
  input: {
    firstName?: string;
    lastName?: string;
    title?: string | null;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    source?: string | null;
    notes?: string | null;
  },
) {
  const user = await requireUser();
  const leadId = uuid.parse(id);
  const firstName =
    input.firstName === undefined ? undefined : z.string().min(1).max(80).parse(input.firstName.trim());
  const lastName =
    input.lastName === undefined ? undefined : z.string().min(1).max(80).parse(input.lastName.trim());
  await db
    .update(outreachLeads)
    .set({
      firstName,
      lastName,
      title: input.title === undefined ? undefined : input.title?.trim() || null,
      company: input.company === undefined ? undefined : input.company?.trim() || null,
      email: input.email === undefined ? undefined : input.email?.trim() || null,
      phone: input.phone === undefined ? undefined : input.phone?.trim() || null,
      source: input.source === undefined ? undefined : input.source?.trim() || null,
      notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
    })
    .where(eq(outreachLeads.id, leadId));
  await note("lead", leadId, user.id, "updated", "Updated lead details");
  refresh(`/outreach/leads/${leadId}`);
}

export async function updateOpportunity(
  id: string,
  input: { name?: string; closeDate?: string | null; description?: string | null },
) {
  const user = await requireUser();
  const oppId = uuid.parse(id);
  const name = input.name === undefined ? undefined : z.string().min(1).max(200).parse(input.name.trim());
  await db
    .update(outreachOpportunities)
    .set({
      name,
      closeDate: input.closeDate === undefined ? undefined : input.closeDate || null,
      description: input.description === undefined ? undefined : input.description?.trim() || null,
    })
    .where(eq(outreachOpportunities.id, oppId));
  await note("opportunity", oppId, user.id, "updated", "Updated opportunity details");
  refresh(`/outreach/opportunities/${oppId}`);
}

export async function updateAccount(
  id: string,
  input: { name?: string; website?: string | null; phone?: string | null; notes?: string | null },
) {
  const user = await requireUser();
  const accountId = uuid.parse(id);
  const name = input.name === undefined ? undefined : z.string().min(1).max(160).parse(input.name.trim());
  await db
    .update(outreachAccounts)
    .set({
      name,
      website: input.website === undefined ? undefined : input.website?.trim() || null,
      phone: input.phone === undefined ? undefined : input.phone?.trim() || null,
      notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
    })
    .where(eq(outreachAccounts.id, accountId));
  await note("account", accountId, user.id, "updated", "Updated account details");
  refresh(`/outreach/accounts/${accountId}`);
}

export async function updateQuote(
  id: string,
  input: { validUntil?: string | null; notes?: string | null },
) {
  const user = await requireUser();
  const quoteId = uuid.parse(id);
  await db
    .update(outreachQuotes)
    .set({
      validUntil: input.validUntil === undefined ? undefined : input.validUntil || null,
      notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
    })
    .where(eq(outreachQuotes.id, quoteId));
  await note("quote", quoteId, user.id, "updated", "Updated quote details");
  refresh(`/outreach/quotes/${quoteId}`);
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
  const user = await requireUser();
  const leadId = uuid.parse(id);
  await db.update(outreachLeads).set({ status }).where(eq(outreachLeads.id, leadId));
  await note("lead", leadId, user.id, "stage", status);
  refresh(`/outreach/leads/${leadId}`);
}

export async function convertLead(id: string) {
  const user = await requireUser();
  const leadId = uuid.parse(id);
  const [lead] = await db.select().from(outreachLeads).where(eq(outreachLeads.id, leadId));
  if (!lead) throw new Error("Lead not found");
  if (lead.status === "converted" && lead.convertedOpportunityId) {
    return { opportunityId: lead.convertedOpportunityId };
  }

  let accountId = lead.accountId;
  if (!accountId && lead.company) {
    const [account] = await db
      .insert(outreachAccounts)
      .values({ name: lead.company, ownerId: user.id, createdBy: user.id })
      .returning();
    accountId = account.id;
  }

  const [opp] = await db
    .insert(outreachOpportunities)
    .values({
      name: lead.company ? `${lead.company} — ${lead.firstName} ${lead.lastName}` : `${lead.firstName} ${lead.lastName}`,
      accountId,
      leadId: lead.id,
      ownerId: user.id,
      createdBy: user.id,
      closeDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    })
    .returning();

  await db
    .update(outreachLeads)
    .set({ status: "converted", accountId, convertedOpportunityId: opp.id })
    .where(eq(outreachLeads.id, leadId));
  await note("lead", leadId, user.id, "converted", `Created opportunity ${opp.name}`);
  await note("opportunity", opp.id, user.id, "created", "Converted from lead");
  refresh(`/outreach/leads/${leadId}`);
  refresh(`/outreach/opportunities/${opp.id}`);
  return { opportunityId: opp.id };
}

export async function createOpportunity(input: {
  name: string;
  accountId?: string | null;
  closeDate?: string | null;
  description?: string;
}) {
  const user = await requireUser();
  const [row] = await db
    .insert(outreachOpportunities)
    .values({
      name: z.string().min(1).max(200).parse(input.name.trim()),
      accountId: input.accountId ? uuid.parse(input.accountId) : null,
      closeDate: input.closeDate || null,
      description: input.description?.trim() || null,
      ownerId: user.id,
      createdBy: user.id,
    })
    .returning();
  await note("opportunity", row.id, user.id, "created", row.name);
  refresh("/outreach/opportunities");
  return row;
}

export async function updateOpportunityStage(id: string, stage: OppStage) {
  const user = await requireUser();
  const oppId = uuid.parse(id);
  await db.update(outreachOpportunities).set({ stage }).where(eq(outreachOpportunities.id, oppId));
  await note("opportunity", oppId, user.id, "stage", stage);
  refresh(`/outreach/opportunities/${oppId}`);
}

export async function addOpportunityLine(input: {
  opportunityId: string;
  catalogItemId?: string | null;
  name: string;
  quantity: number;
  hours: number;
  unitPriceCents: number;
  contextLevel: ContextLevel;
}) {
  const user = await requireUser();
  const opportunityId = uuid.parse(input.opportunityId);
  await db.insert(outreachOpportunityLines).values({
    opportunityId,
    catalogItemId: input.catalogItemId ? uuid.parse(input.catalogItemId) : null,
    name: z.string().min(1).max(200).parse(input.name.trim()),
    quantity: qty.parse(input.quantity),
    hours: hours.parse(input.hours),
    unitPriceCents: money.parse(input.unitPriceCents),
    contextLevel: input.contextLevel,
  });
  const lines = await db
    .select()
    .from(outreachOpportunityLines)
    .where(eq(outreachOpportunityLines.opportunityId, opportunityId));
  const amount = lines.reduce((sum, line) => sum + lineTotalCents(line.quantity, line.unitPriceCents), 0);
  await db.update(outreachOpportunities).set({ amountCents: amount }).where(eq(outreachOpportunities.id, opportunityId));
  await note("opportunity", opportunityId, user.id, "product", input.name);
  refresh(`/outreach/opportunities/${opportunityId}`);
}

export async function removeOpportunityLine(lineId: string) {
  const user = await requireUser();
  const id = uuid.parse(lineId);
  const [line] = await db.select().from(outreachOpportunityLines).where(eq(outreachOpportunityLines.id, id));
  if (!line) return;
  await db.delete(outreachOpportunityLines).where(eq(outreachOpportunityLines.id, id));
  const lines = await db
    .select()
    .from(outreachOpportunityLines)
    .where(eq(outreachOpportunityLines.opportunityId, line.opportunityId));
  const amount = lines.reduce((sum, row) => sum + lineTotalCents(row.quantity, row.unitPriceCents), 0);
  await db
    .update(outreachOpportunities)
    .set({ amountCents: amount })
    .where(eq(outreachOpportunities.id, line.opportunityId));
  await note("opportunity", line.opportunityId, user.id, "product", `Removed ${line.name}`);
  refresh(`/outreach/opportunities/${line.opportunityId}`);
}

export async function createQuoteFromOpportunity(opportunityId: string) {
  const user = await requireUser();
  const oppId = uuid.parse(opportunityId);
  const [opp] = await db.select().from(outreachOpportunities).where(eq(outreachOpportunities.id, oppId));
  if (!opp) throw new Error("Opportunity not found");
  const lines = await db
    .select()
    .from(outreachOpportunityLines)
    .where(eq(outreachOpportunityLines.opportunityId, oppId));
  // Atomic nextval() — safe under concurrent quote creation, unlike reading
  // the last row and incrementing it in application code.
  const [{ next: seqNext }] = (
    await db.execute<{ next: string }>(sql`select nextval('outreach_quote_number_seq') as next`)
  ).rows;
  const next = `Q-${String(seqNext).padStart(4, "0")}`;
  const valid = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const [quote] = await db
    .insert(outreachQuotes)
    .values({
      number: next,
      opportunityId: oppId,
      accountId: opp.accountId,
      createdBy: user.id,
      validUntil: valid,
    })
    .returning();
  if (lines.length > 0) {
    await db.insert(outreachQuoteLines).values(
      lines.map((line) => ({
        quoteId: quote.id,
        name: line.name,
        quantity: line.quantity,
        hours: line.hours,
        unitPriceCents: line.unitPriceCents,
        contextLevel: line.contextLevel,
      })),
    );
  }
  await note("opportunity", oppId, user.id, "quote", quote.number);
  await note("quote", quote.id, user.id, "created", quote.number);
  refresh(`/outreach/quotes/${quote.id}`);
  return quote;
}

export async function updateQuoteStatus(id: string, status: QuoteStatus) {
  const user = await requireUser();
  const quoteId = uuid.parse(id);
  await db.update(outreachQuotes).set({ status }).where(eq(outreachQuotes.id, quoteId));
  await note("quote", quoteId, user.id, "status", status);
  refresh(`/outreach/quotes/${quoteId}`);
}

export async function addQuoteLine(input: {
  quoteId: string;
  name: string;
  quantity: number;
  hours: number;
  unitPriceCents: number;
  contextLevel: ContextLevel;
}) {
  await requireUser();
  const quoteId = uuid.parse(input.quoteId);
  await db.insert(outreachQuoteLines).values({
    quoteId,
    name: z.string().min(1).max(200).parse(input.name.trim()),
    quantity: qty.parse(input.quantity),
    hours: hours.parse(input.hours),
    unitPriceCents: money.parse(input.unitPriceCents),
    contextLevel: input.contextLevel,
  });
  refresh(`/outreach/quotes/${quoteId}`);
}

export async function removeQuoteLine(lineId: string) {
  await requireUser();
  const id = uuid.parse(lineId);
  const [line] = await db.select().from(outreachQuoteLines).where(eq(outreachQuoteLines.id, id));
  if (!line) return;
  await db.delete(outreachQuoteLines).where(eq(outreachQuoteLines.id, id));
  refresh(`/outreach/quotes/${line.quoteId}`);
}

export async function toggleOutreachFollow(entityType: OutreachEntity, entityId: string) {
  const user = await requireUser();
  const id = uuid.parse(entityId);
  const [existing] = await db
    .select({ userId: outreachFollowers.userId })
    .from(outreachFollowers)
    .where(
      and(
        eq(outreachFollowers.entityType, entityType),
        eq(outreachFollowers.entityId, id),
        eq(outreachFollowers.userId, user.id),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .delete(outreachFollowers)
      .where(
        and(
          eq(outreachFollowers.entityType, entityType),
          eq(outreachFollowers.entityId, id),
          eq(outreachFollowers.userId, user.id),
        ),
      );
    await note(entityType, id, user.id, "follow", "Stopped following");
    refresh(entityPath(entityType, id));
    return { following: false };
  }

  await db.insert(outreachFollowers).values({ entityType, entityId: id, userId: user.id }).onConflictDoNothing();
  await note(entityType, id, user.id, "follow", "Started following");
  refresh(entityPath(entityType, id));
  return { following: true };
}

export async function createOutreachEvent(input: {
  entityType: OutreachEntity;
  entityId: string;
  subject: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  description?: string;
}) {
  const user = await requireUser();
  const entityId = uuid.parse(input.entityId);
  const subject = z.string().min(1).max(200).parse(input.subject.trim());
  const startsAt = z.coerce.date().parse(input.startsAt);
  const endsAt = z.coerce.date().parse(input.endsAt);
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error("End time must be after the start time");
  }
  const [row] = await db
    .insert(outreachEvents)
    .values({
      entityType: input.entityType,
      entityId,
      subject,
      startsAt,
      endsAt,
      location: input.location?.trim() || null,
      description: input.description?.trim() || null,
      ownerId: user.id,
      createdBy: user.id,
    })
    .returning();
  const when = startsAt.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
  await note(input.entityType, entityId, user.id, "event", `${subject} · ${when}`);
  refresh(entityPath(input.entityType, entityId));
  return row;
}

export async function completeOutreachEvent(eventId: string) {
  const user = await requireUser();
  const id = uuid.parse(eventId);
  const [event] = await db.select().from(outreachEvents).where(eq(outreachEvents.id, id));
  if (!event) throw new Error("Event not found");
  await db
    .update(outreachEvents)
    .set({ completedAt: event.completedAt ? null : new Date() })
    .where(eq(outreachEvents.id, id));
  await note(
    event.entityType,
    event.entityId,
    user.id,
    "event",
    event.completedAt ? `Reopened ${event.subject}` : `Completed ${event.subject}`,
  );
  refresh(entityPath(event.entityType, event.entityId));
}

export async function deleteOutreachEvent(eventId: string) {
  const user = await requireUser();
  const id = uuid.parse(eventId);
  const [event] = await db.select().from(outreachEvents).where(eq(outreachEvents.id, id));
  if (!event) return;
  await db.delete(outreachEvents).where(eq(outreachEvents.id, id));
  await note(event.entityType, event.entityId, user.id, "event", `Deleted ${event.subject}`);
  refresh(entityPath(event.entityType, event.entityId));
}

export async function logOutreachNote(
  entityType: OutreachEntity,
  entityId: string,
  body: string,
) {
  const user = await requireUser();
  const text = z.string().min(1).max(4000).parse(body.trim());
  await note(entityType, uuid.parse(entityId), user.id, "note", text);
  refresh();
}

export async function linkExistingTask(input: {
  taskId: string;
  entityType: "lead" | "opportunity" | "quote" | "account";
  entityId: string;
}) {
  const user = await requireUser();
  const taskId = uuid.parse(input.taskId);
  const [task] = await db.select({ listId: tasks.listId }).from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new Error("Task not found");
  // Read access is enough to link — matches what searchOutreachTasks already exposes.
  await assertListRole(task.listId, "guest");

  await db
    .insert(outreachTaskLinks)
    .values({
      taskId,
      entityType: input.entityType,
      entityId: uuid.parse(input.entityId),
      createdBy: user.id,
    })
    .onConflictDoNothing();
  await note(input.entityType, input.entityId, user.id, "task", "Linked a Hub task");
  refresh();
}

export async function createAndLinkTask(input: {
  listId: string;
  title: string;
  dueDate?: string | null;
  entityType: "lead" | "opportunity" | "quote" | "account";
  entityId: string;
}) {
  const user = await requireUser();
  const listId = uuid.parse(input.listId);
  const title = z.string().min(1).max(300).parse(input.title.trim());
  const [row] = await db
    .select({ list: lists, space: spaces })
    .from(lists)
    .innerJoin(spaces, eq(lists.spaceId, spaces.id))
    .where(eq(lists.id, listId));
  if (!row) throw new Error("List not found");
  await assertListRole(listId, "member");

  const [defaultStatus] = await db
    .select({ id: statuses.id })
    .from(statuses)
    .where(eq(statuses.listId, listId))
    .orderBy(statuses.position)
    .limit(1);
  const statusId = row.list.defaultStatusId ?? defaultStatus?.id;
  if (!statusId) throw new Error("This list has no status to put the task in");

  const created = await db.transaction(async (tx) => {
    const number = await allocateTaskNumber(tx, row.space.id, row.space.taskPrefix);
    const [task] = await tx
      .insert(tasks)
      .values({
        listId,
        number,
        title,
        statusId,
        dueDate: input.dueDate || null,
        createdBy: user.id,
        source: "manual",
      })
      .returning();
    await tx.insert(outreachTaskLinks).values({
      taskId: task.id,
      entityType: input.entityType,
      entityId: uuid.parse(input.entityId),
      createdBy: user.id,
    });
    return task;
  });

  await note(input.entityType, input.entityId, user.id, "task", `Created ${created.number}`);
  refresh();
  return created;
}

export async function searchOutreachTasks(query: string) {
  const user = await requireUser();
  const { searchHubTasks } = await import("./queries");
  return searchHubTasks(query, user.id, user.platformRole);
}

export async function unlinkTask(linkId: string) {
  await requireUser();
  await db.delete(outreachTaskLinks).where(eq(outreachTaskLinks.id, uuid.parse(linkId)));
  refresh();
}
