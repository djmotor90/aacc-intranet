/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Crown, FileText, Package, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { ensureCatalogSeeded } from "@/modules/outreach/actions";
import { OpportunityLines } from "@/modules/outreach/components/line-editor";
import { EditOpportunityButton } from "@/modules/outreach/components/edit-record";
import { FollowButton, FollowersList } from "@/modules/outreach/components/follow-button";
import { DetailField, DetailsPanel, RecordWorkspace } from "@/modules/outreach/components/record-workspace";
import { ActivityFeed, RelatedTasks } from "@/modules/outreach/components/related-work";
import { BuildQuoteButton, OpportunityPath } from "@/modules/outreach/components/stage-actions";
import { formatMoney, labelFor, OBJECT_ICON, OPP_STAGES, QUOTE_STATUSES } from "@/modules/outreach/lib/stages";
import {
  getOpportunity,
  isFollowing,
  listActivities,
  listCatalog,
  listFollowers,
  listLinkedTasks,
  listRecordEvents,
  listWritableListsForPicker,
} from "@/modules/outreach/queries";

export default async function OpportunityDetailPage(props: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await props.params;
  await ensureCatalogSeeded();
  const row = await getOpportunity(id);
  if (!row) notFound();
  const [activities, tasks, lists, catalog, following, followers, events] = await Promise.all([
    listActivities("opportunity", id),
    listLinkedTasks("opportunity", id),
    listWritableListsForPicker(user.id, user.platformRole),
    listCatalog(),
    isFollowing(user.id, "opportunity", id),
    listFollowers("opportunity", id),
    listRecordEvents("opportunity", id),
  ]);
  const opp = row.opportunity;

  return (
    <RecordWorkspace
      objectLabel="Opportunity"
      title={opp.name}
      icon={<Crown className="size-5" />}
      iconClass={OBJECT_ICON.opportunity}
      actions={
        <>
          <FollowButton entityType="opportunity" entityId={opp.id} following={following} />
          <EditOpportunityButton opportunity={opp} />
          <BuildQuoteButton opportunityId={opp.id} />
        </>
      }
      highlights={[
        {
          label: "Account Name",
          value: opp.accountId ? (
            <Link href={`/outreach/accounts/${opp.accountId}`} className="hover:underline">
              {row.accountName}
            </Link>
          ) : (
            "—"
          ),
        },
        { label: "Close Date", value: opp.closeDate },
        { label: "Amount", value: formatMoney(opp.amountCents) },
        { label: "Opportunity Owner", value: row.ownerName },
      ]}
      path={<OpportunityPath opportunityId={opp.id} stage={opp.stage} />}
      activity={
        <ActivityFeed
          entityType="opportunity"
          entityId={opp.id}
          upcoming={tasks}
          events={events.map((row) => ({ ...row.event, ownerName: row.ownerName }))}
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
        <DetailsPanel
          title="Opportunity Information"
          edit={<EditOpportunityButton opportunity={opp} placement="details" />}
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Opportunity Name" value={opp.name} />
            <DetailField label="Stage" value={labelFor(OPP_STAGES, opp.stage)} />
            <DetailField label="Close Date" value={opp.closeDate} />
            <DetailField label="Amount" value={formatMoney(opp.amountCents)} />
            <div className="sm:col-span-2">
              <dt className="text-[11px] text-muted-foreground">Description</dt>
              <dd className="whitespace-pre-wrap text-sm">{opp.description || "—"}</dd>
            </div>
          </dl>
        </DetailsPanel>
      }
      related={[
        {
          title: "Products",
          count: row.lines.length,
          wide: true,
          icon: <Package className="size-4 text-brand-orange" />,
          children: <OpportunityLines opportunityId={opp.id} lines={row.lines} catalog={catalog} />,
        },
        {
          title: "Quotes",
          count: row.quotes.length,
          icon: <FileText className="size-4 text-brand-teal-deep" />,
          children: (
            <ul className="grid gap-1 text-sm">
              {row.quotes.map((quote) => (
                <li key={quote.id}>
                  <Link href={`/outreach/quotes/${quote.id}`} className="text-primary hover:underline">
                    {quote.number} · {labelFor(QUOTE_STATUSES, quote.status)}
                  </Link>
                </li>
              ))}
              {row.quotes.length === 0 && <li className="text-muted-foreground">No quotes yet.</li>}
            </ul>
          ),
        },
        {
          title: "Open Activities",
          count: tasks.length,
          children: <RelatedTasks entityType="opportunity" entityId={opp.id} tasks={tasks} lists={lists} />,
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
