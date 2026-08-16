/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Star } from "lucide-react";
import { requireUser } from "@/lib/rbac";
import { CreateLeadForm } from "@/modules/outreach/components/create-dialogs";
import { ListWorkspace } from "@/modules/outreach/components/list-workspace";
import { labelFor, LEAD_STATUSES, OBJECT_ICON } from "@/modules/outreach/lib/stages";
import { listAccounts, listLeads } from "@/modules/outreach/queries";

export default async function LeadsPage() {
  await requireUser();
  const [leads, accounts] = await Promise.all([listLeads(), listAccounts()]);
  return (
    <ListWorkspace
      objectLabel="Leads"
      viewName="All Open Leads"
      icon={<Star className="size-5 fill-current" />}
      iconClass={`flex size-10 items-center justify-center rounded-lg ${OBJECT_ICON.lead}`}
      count={leads.length}
      actions={<CreateLeadForm accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />}
      columns={[
        { key: "name", label: "Name" },
        { key: "company", label: "Company" },
        { key: "status", label: "Lead Status" },
        { key: "owner", label: "Owner" },
        { key: "email", label: "Email" },
      ]}
      rows={leads.map((row) => ({
        id: row.lead.id,
        href: `/outreach/leads/${row.lead.id}`,
        searchText: `${row.lead.firstName} ${row.lead.lastName} ${row.lead.company ?? ""} ${row.lead.email ?? ""}`,
        cells: {
          name: `${row.lead.firstName} ${row.lead.lastName}`,
          company: row.lead.company ?? row.accountName ?? "—",
          status: labelFor(LEAD_STATUSES, row.lead.status),
          owner: row.ownerName ?? "—",
          email: row.lead.email ?? "—",
        },
      }))}
    />
  );
}
