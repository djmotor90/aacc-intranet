/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Star, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { EditLeadButton } from "@/modules/outreach/components/edit-record";
import { FollowButton, FollowersList } from "@/modules/outreach/components/follow-button";
import { DetailField, DetailsPanel, RecordWorkspace } from "@/modules/outreach/components/record-workspace";
import { ActivityFeed, RelatedTasks } from "@/modules/outreach/components/related-work";
import { ConvertLeadButton, LeadPath } from "@/modules/outreach/components/stage-actions";
import { labelFor, LEAD_STATUSES, OBJECT_ICON } from "@/modules/outreach/lib/stages";
import {
  getLead,
  isFollowing,
  listActivities,
  listFollowers,
  listLinkedTasks,
  listRecordEvents,
  listWritableListsForPicker,
} from "@/modules/outreach/queries";

export default async function LeadDetailPage(props: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await props.params;
  const row = await getLead(id);
  if (!row) notFound();
  const [activities, tasks, lists, following, followers, events] = await Promise.all([
    listActivities("lead", id),
    listLinkedTasks("lead", id),
    listWritableListsForPicker(user.id, user.platformRole),
    isFollowing(user.id, "lead", id),
    listFollowers("lead", id),
    listRecordEvents("lead", id),
  ]);
  const lead = row.lead;

  return (
    <RecordWorkspace
      objectLabel="Lead"
      title={`${lead.firstName} ${lead.lastName}`}
      icon={<Star className="size-5 fill-current" />}
      iconClass={OBJECT_ICON.lead}
      actions={
        <>
          <FollowButton entityType="lead" entityId={lead.id} following={following} />
          <EditLeadButton lead={lead} />
          {lead.status !== "converted" ? <ConvertLeadButton leadId={lead.id} /> : null}
        </>
      }
      highlights={[
        { label: "Company", value: lead.company ?? row.accountName },
        { label: "Title", value: lead.title },
        { label: "Phone", value: lead.phone },
        { label: "Email", value: lead.email },
      ]}
      path={<LeadPath leadId={lead.id} status={lead.status} />}
      activity={
        <ActivityFeed
          entityType="lead"
          entityId={lead.id}
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
        <DetailsPanel title="Lead Information" edit={<EditLeadButton lead={lead} placement="details" />}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Name" value={`${lead.firstName} ${lead.lastName}`} />
            <DetailField label="Company" value={lead.company} />
            <DetailField label="Title" value={lead.title} />
            <DetailField label="Email" value={lead.email} />
            <DetailField label="Phone" value={lead.phone} />
            <DetailField label="Lead source" value={lead.source} />
            <DetailField label="Status" value={labelFor(LEAD_STATUSES, lead.status)} />
            <DetailField label="Owner" value={row.ownerName} />
            <div className="sm:col-span-2">
              <dt className="text-[11px] text-muted-foreground">Notes</dt>
              <dd className="whitespace-pre-wrap text-sm">{lead.notes || "—"}</dd>
            </div>
            {lead.convertedOpportunityId && (
              <div className="sm:col-span-2">
                <dt className="text-[11px] text-muted-foreground">Converted opportunity</dt>
                <dd>
                  <Link className="text-primary hover:underline" href={`/outreach/opportunities/${lead.convertedOpportunityId}`}>
                    Open opportunity
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </DetailsPanel>
      }
      related={[
        {
          title: "Open Activities",
          count: tasks.length,
          children: <RelatedTasks entityType="lead" entityId={lead.id} tasks={tasks} lists={lists} />,
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
