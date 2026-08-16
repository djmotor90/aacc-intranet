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
import { DeleteQuoteButton, EditQuoteButton } from "@/modules/outreach/components/edit-record";
import { FollowButton, FollowersList } from "@/modules/outreach/components/follow-button";
import { CreateQuotePdfButton, QuotePdfList } from "@/modules/outreach/components/quote-pdf-dialog";
import { DetailField, DetailsPanel, RecordWorkspace } from "@/modules/outreach/components/record-workspace";
import { ActivityFeed, RelatedTasks } from "@/modules/outreach/components/related-work";
import { QuotePath } from "@/modules/outreach/components/stage-actions";
import { QUOTE_ORG, formatMoney, labelFor, normalizeQuoteStatus, OBJECT_ICON, quoteTotals, QUOTE_STATUSES } from "@/modules/outreach/lib/stages";
import type { QuotePdfModel } from "@/modules/outreach/lib/quote-pdf";
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
  const totals = quoteTotals({
    lines: row.lines,
    discountBps: row.quote.discountBps,
    taxCents: row.quote.taxCents,
    shippingCents: row.quote.shippingCents,
  });
  const status = normalizeQuoteStatus(row.quote.status);
  const pdfModel: QuotePdfModel = {
    number: row.quote.number,
    createdAt: row.quote.createdAt,
    preparedBy: row.preparedByName || user.name || "—",
    preparedEmail: row.preparedByEmail || user.email,
    preparedPhone: QUOTE_ORG.phone,
    billToName: row.quote.billToName || row.accountName,
    shipToName: row.quote.shipToName || row.quote.billToName || row.accountName,
    shipToAddress: row.quote.shipToAddress,
    lines: row.lines.map((line) => ({
      name: line.name,
      listPriceCents: line.listPriceCents || line.unitPriceCents,
      unitPriceCents: line.unitPriceCents,
      quantity: line.quantity,
    })),
    discountBps: row.quote.discountBps,
    taxCents: row.quote.taxCents,
    shippingCents: row.quote.shippingCents,
  };

  return (
    <RecordWorkspace
      objectLabel="Quote"
      title={row.quote.name || row.quote.number}
      icon={<FileText className="size-5" />}
      iconClass={OBJECT_ICON.quote}
      actions={
        <>
          <FollowButton entityType="quote" entityId={row.quote.id} following={following} />
          <EditQuoteButton quote={row.quote} />
          <CreateQuotePdfButton quoteId={row.quote.id} model={pdfModel} />
          <DeleteQuoteButton quoteId={row.quote.id} label={row.quote.number} />
        </>
      }
      highlights={[
        { label: "Quote Number", value: row.quote.number },
        { label: "Expiration Date", value: row.quote.validUntil },
        {
          label: "Opportunity Name",
          value: (
            <Link href={`/outreach/opportunities/${row.quote.opportunityId}`} className="hover:underline">
              {row.opportunityName}
            </Link>
          ),
        },
        {
          label: "Account Name",
          value: row.quote.accountId ? (
            <Link href={`/outreach/accounts/${row.quote.accountId}`} className="hover:underline">
              {row.accountName}
            </Link>
          ) : (
            row.accountName
          ),
        },
        { label: "Grand Total", value: formatMoney(totals.grand) },
      ]}
      path={<QuotePath quoteId={row.quote.id} status={status} />}
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
            <DetailField label="Quote Number" value={row.quote.number} />
            <DetailField label="Quote Name" value={row.quote.name} />
            <DetailField label="Status" value={labelFor(QUOTE_STATUSES, status)} />
            <DetailField label="Expiration Date" value={row.quote.validUntil} />
            <DetailField label="Bill To Name" value={row.quote.billToName || row.accountName} />
            <DetailField label="Ship To Name" value={row.quote.shipToName || row.quote.billToName || row.accountName} />
            <div className="sm:col-span-2">
              <dt className="text-[11px] text-muted-foreground">Ship To</dt>
              <dd className="whitespace-pre-wrap text-sm">{row.quote.shipToAddress || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] text-muted-foreground">Details</dt>
              <dd className="whitespace-pre-wrap text-sm">{row.quote.details || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] text-muted-foreground">Description</dt>
              <dd className="whitespace-pre-wrap text-sm">{row.quote.notes || "—"}</dd>
            </div>
            <DetailField label="Discount" value={`${(totals.discountBps / 100).toFixed(2)}%`} />
            <DetailField label="Tax" value={formatMoney(totals.tax)} />
            <DetailField label="Shipping and Handling" value={formatMoney(totals.shipping)} />
            <DetailField label="Grand Total" value={formatMoney(totals.grand)} />
          </dl>
        </DetailsPanel>
      }
      related={[
        {
          title: "Quote Line Items",
          count: row.lines.length,
          wide: true,
          children: (
            <QuoteLinesEditor
              quoteId={row.quote.id}
              lines={row.lines}
              catalog={catalog}
              totals={totals}
            />
          ),
        },
        {
          title: "Quote PDFs",
          count: row.pdfs.length,
          icon: <FileText className="size-4 text-brand-teal-deep" />,
          children: <QuotePdfList pdfs={row.pdfs} />,
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
