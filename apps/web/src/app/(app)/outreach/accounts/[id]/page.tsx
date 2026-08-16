/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Building2, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { EditAccountButton } from "@/modules/outreach/components/edit-record";
import { FollowButton, FollowersList } from "@/modules/outreach/components/follow-button";
import { OBJECT_ICON } from "@/modules/outreach/lib/stages";
import { DetailField, DetailsPanel, RecordWorkspace } from "@/modules/outreach/components/record-workspace";
import { ActivityFeed, RelatedTasks } from "@/modules/outreach/components/related-work";
import {
  getAccount,
  isFollowing,
  listActivities,
  listFollowers,
  listLeads,
  listLinkedTasks,
  listOpportunities,
  listRecordEvents,
  listWritableListsForPicker,
} from "@/modules/outreach/queries";

export default async function AccountDetailPage(props: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await props.params;
  const account = await getAccount(id);
  if (!account) notFound();
  const [activities, tasks, lists, leads, opps, following, followers, events] = await Promise.all([
    listActivities("account", id),
    listLinkedTasks("account", id),
    listWritableListsForPicker(user.id, user.platformRole),
    listLeads(),
    listOpportunities(),
    isFollowing(user.id, "account", id),
    listFollowers("account", id),
    listRecordEvents("account", id),
  ]);
  const relatedLeads = leads.filter((r) => r.lead.accountId === id);
  const relatedOpps = opps.filter((r) => r.opportunity.accountId === id);

  return (
    <RecordWorkspace
      objectLabel="Account"
      title={account.name}
      icon={<Building2 className="size-5" />}
      iconClass={OBJECT_ICON.account}
      actions={
        <>
          <FollowButton entityType="account" entityId={account.id} following={following} />
          <EditAccountButton account={account} />
        </>
      }
      highlights={[
        { label: "Phone", value: account.phone },
        { label: "Website", value: account.website },
        { label: "Leads", value: String(relatedLeads.length) },
        { label: "Opportunities", value: String(relatedOpps.length) },
      ]}
      activity={
        <ActivityFeed
          entityType="account"
          entityId={account.id}
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
        <DetailsPanel title="Account Information" edit={<EditAccountButton account={account} placement="details" />}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Account Name" value={account.name} />
            <DetailField label="Phone" value={account.phone} />
            <DetailField label="Website" value={account.website} />
            <div className="sm:col-span-2">
              <dt className="text-[11px] text-muted-foreground">Notes</dt>
              <dd className="whitespace-pre-wrap text-sm">{account.notes || "—"}</dd>
            </div>
          </dl>
        </DetailsPanel>
      }
      related={[
        {
          title: "Contacts / Leads",
          count: relatedLeads.length,
          children: (
            <ul className="grid gap-1 text-sm">
              {relatedLeads.map((row) => (
                <li key={row.lead.id}>
                  <Link className="text-primary hover:underline" href={`/outreach/leads/${row.lead.id}`}>
                    {row.lead.firstName} {row.lead.lastName}
                  </Link>
                </li>
              ))}
              {relatedLeads.length === 0 && <li className="text-muted-foreground">None</li>}
            </ul>
          ),
        },
        {
          title: "Opportunities",
          count: relatedOpps.length,
          children: (
            <ul className="grid gap-1 text-sm">
              {relatedOpps.map((row) => (
                <li key={row.opportunity.id}>
                  <Link className="text-primary hover:underline" href={`/outreach/opportunities/${row.opportunity.id}`}>
                    {row.opportunity.name}
                  </Link>
                </li>
              ))}
              {relatedOpps.length === 0 && <li className="text-muted-foreground">None</li>}
            </ul>
          ),
        },
        {
          title: "Open Activities",
          count: tasks.length,
          children: <RelatedTasks entityType="account" entityId={account.id} tasks={tasks} lists={lists} />,
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
