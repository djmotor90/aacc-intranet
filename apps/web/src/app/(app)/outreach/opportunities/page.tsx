/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Crown } from "lucide-react";
import { requireUser } from "@/lib/rbac";
import { CreateOpportunityForm } from "@/modules/outreach/components/create-dialogs";
import { ListWorkspace } from "@/modules/outreach/components/list-workspace";
import { formatMoney, labelFor, OBJECT_ICON, OPP_STAGES } from "@/modules/outreach/lib/stages";
import { listAccounts, listOpportunities } from "@/modules/outreach/queries";

export default async function OpportunitiesPage() {
  await requireUser();
  const [opps, accounts] = await Promise.all([listOpportunities(), listAccounts()]);
  return (
    <ListWorkspace
      objectLabel="Opportunities"
      viewName="Recently Viewed"
      icon={<Crown className="size-5" />}
      iconClass={`flex size-10 items-center justify-center rounded-lg ${OBJECT_ICON.opportunity}`}
      count={opps.length}
      actions={<CreateOpportunityForm accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />}
      columns={[
        { key: "name", label: "Opportunity Name" },
        { key: "account", label: "Account Name" },
        { key: "stage", label: "Stage" },
        { key: "close", label: "Close Date" },
        { key: "amount", label: "Amount" },
        { key: "owner", label: "Owner" },
      ]}
      rows={opps.map((row) => ({
        id: row.opportunity.id,
        href: `/outreach/opportunities/${row.opportunity.id}`,
        searchText: `${row.opportunity.name} ${row.accountName ?? ""}`,
        cells: {
          name: row.opportunity.name,
          account: row.accountName ?? "—",
          stage: labelFor(OPP_STAGES, row.opportunity.stage),
          close: row.opportunity.closeDate ?? "—",
          amount: formatMoney(row.opportunity.amountCents),
          owner: row.ownerName ?? "—",
        },
      }))}
    />
  );
}
