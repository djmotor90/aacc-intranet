/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Building2 } from "lucide-react";
import { requireUser } from "@/lib/rbac";
import { CreateAccountForm } from "@/modules/outreach/components/create-dialogs";
import { ListWorkspace } from "@/modules/outreach/components/list-workspace";
import { OBJECT_ICON } from "@/modules/outreach/lib/stages";
import { listAccounts } from "@/modules/outreach/queries";

export default async function AccountsPage() {
  await requireUser();
  const accounts = await listAccounts();
  return (
    <ListWorkspace
      objectLabel="Accounts"
      viewName="All Accounts"
      icon={<Building2 className="size-5" />}
      iconClass={`flex size-10 items-center justify-center rounded-lg ${OBJECT_ICON.account}`}
      count={accounts.length}
      actions={<CreateAccountForm />}
      columns={[
        { key: "name", label: "Account Name" },
        { key: "phone", label: "Phone" },
        { key: "website", label: "Website" },
      ]}
      rows={accounts.map((account) => ({
        id: account.id,
        href: `/outreach/accounts/${account.id}`,
        searchText: `${account.name} ${account.phone ?? ""} ${account.website ?? ""}`,
        cells: {
          name: account.name,
          phone: account.phone ?? "—",
          website: account.website ?? "—",
        },
      }))}
    />
  );
}
