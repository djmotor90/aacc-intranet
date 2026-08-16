/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { FileText, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { ensureCatalogSeeded } from "@/modules/outreach/actions";
import { QuoteLinesEditor } from "@/modules/outreach/components/line-editor";
import { QuoteStatusSelect } from "@/modules/outreach/components/quote-status";
import { EditQuoteButton } from "@/modules/outreach/components/edit-record";
import { FollowButton, FollowersList } from "@/modules/outreach/components/follow-button";
import { DetailField, DetailsPanel, RecordWorkspace } from "@/modules/outreach/components/record-workspace";
import { ActivityFeed, RelatedTasks } from "@/modules/outreach/components/related-work";
import { formatMoney, lineTotalCents, labelFor, OBJECT_ICON, QUOTE_STATUSES } from "@/modules/outreach/lib/stages";
import {
  getQuote,
  isFollowing,
  listActivities,
  listCatalog,
  listFollowers,
  listLinkedTasks,
  listRecordEvents,
  listWritableListsForPicker,
} from "@/modules/outreach/queries";

export default async function QuoteDetailPage(props: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await props.params;
  await ensureCatalogSeeded();
  const row = await getQuote(id);
  if (!row) notFound();
  const [activities, tasks, lists, catalog, following, followers, events] = await Promise.all([
    listActivities("quote", id),
    listLinkedTasks("quote", id),
    listWritableListsForPicker(user.id, user.platformRole),
    listCatalog(),
    isFollowing(user.id, "quote", id),
    listFollowers("quote", id),
    listRecordEvents("quote", id),
  ]);
  const total = row.lines.reduce((sum, line) => sum + lineTotalCents(line.quantity, line.unitPriceCents), 0);

  return (
    <RecordWorkspace
      objectLabel="Quote"
      title={row.quote.number}
      icon={<FileText className="size-5" />}
      iconClass={OBJECT_ICON.quote}
      actions={
        <>
          <FollowButton entityType="quote" entityId={row.quote.id} following={following} />
          <EditQuoteButton quote={row.quote} />
          <QuoteStatusSelect quoteId={row.quote.id} status={row.quote.status} />
        </>
      }
      highlights={[
        {
          label: "Opportunity",
          value: (
            <Link href={`/outreach/opportunities/${row.quote.opportunityId}`} className="hover:underline">
              {row.opportunityName}
            </Link>
          ),
        },
        { label: "Account", value: row.accountName },
        { label: "Valid until", value: row.quote.validUntil },
        { label: "Total", value: formatMoney(total) },
      ]}
      activity={
        <ActivityFeed
          entityType="quote"
          entityId={row.quote.id}
          upcoming={tasks}
          events={events.map((ev) => ({ ...ev.event, ownerName: ev.ownerName }))}
          items={activities.map((a) => ({
            id: a.activity.id,
            kind: a.activity.kind,
            body: a.activity.body,
            actorName: a.actorName,
            createdAt: a.activity.createdAt,
          }))}
        />
      }
      details={
        <DetailsPanel title="Quote Information" edit={<EditQuoteButton quote={row.quote} placement="details" />}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Quote number" value={row.quote.number} />
            <DetailField label="Status" value={labelFor(QUOTE_STATUSES, row.quote.status)} />
            <DetailField label="Valid until" value={row.quote.validUntil} />
            <div className="sm:col-span-2">
              <dt className="text-[11px] text-muted-foreground">Notes</dt>
              <dd className="whitespace-pre-wrap text-sm">{row.quote.notes || "—"}</dd>
            </div>
          </dl>
        </DetailsPanel>
      }
      related={[
        {
          title: "Quote Lines",
          count: row.lines.length,
          wide: true,
          children: <QuoteLinesEditor quoteId={row.quote.id} lines={row.lines} catalog={catalog} />,
        },
        {
          title: "Open Activities",
          count: tasks.length,
          children: <RelatedTasks entityType="quote" entityId={row.quote.id} tasks={tasks} lists={lists} />,
        },
        {
          title: "Followers",
          count: followers.length,
          icon: <Users className="size-4 text-primary" />,
          children: <FollowersList followers={followers} />,
        },
      ]}
    />
  );
}
