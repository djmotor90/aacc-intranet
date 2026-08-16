/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { FileText } from "lucide-react";
import { requireUser } from "@/lib/rbac";
import { ListWorkspace } from "@/modules/outreach/components/list-workspace";
import { labelFor, normalizeQuoteStatus, OBJECT_ICON, QUOTE_STATUSES } from "@/modules/outreach/lib/stages";
import { listQuotes } from "@/modules/outreach/queries";

export default async function QuotesPage() {
  await requireUser();
  const quotes = await listQuotes();
  return (
    <ListWorkspace
      objectLabel="Quotes"
      viewName="All Quotes"
      icon={<FileText className="size-5" />}
      iconClass={`flex size-10 items-center justify-center rounded-lg ${OBJECT_ICON.quote}`}
      count={quotes.length}
      columns={[
        { key: "number", label: "Quote Number" },
        { key: "name", label: "Quote Name" },
        { key: "opportunity", label: "Opportunity" },
        { key: "account", label: "Account" },
        { key: "status", label: "Status" },
      ]}
      rows={quotes.map((row) => ({
        id: row.quote.id,
        href: `/outreach/quotes/${row.quote.id}`,
        searchText: `${row.quote.number} ${row.quote.name ?? ""} ${row.opportunityName} ${row.accountName ?? ""}`,
        cells: {
          number: row.quote.number,
          name: row.quote.name ?? row.quote.number,
          opportunity: row.opportunityName,
          account: row.accountName ?? "—",
          status: labelFor(QUOTE_STATUSES, normalizeQuoteStatus(row.quote.status)),
        },
      }))}
    />
  );
}
