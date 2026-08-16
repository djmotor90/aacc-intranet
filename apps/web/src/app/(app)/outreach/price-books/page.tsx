/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { BookOpen } from "lucide-react";
import { requireUser } from "@/lib/rbac";
import { ensureCatalogSeeded } from "@/modules/outreach/actions";
import { CreatePriceBookForm } from "@/modules/outreach/components/create-dialogs";
import { ListWorkspace } from "@/modules/outreach/components/list-workspace";
import { OBJECT_ICON } from "@/modules/outreach/lib/stages";
import { listPriceBooks } from "@/modules/outreach/queries";

export default async function PriceBooksPage() {
  await requireUser();
  await ensureCatalogSeeded();
  const books = await listPriceBooks();
  return (
    <ListWorkspace
      objectLabel="Price Books"
      viewName="All Price Books"
      icon={<BookOpen className="size-5" />}
      iconClass={`flex size-10 items-center justify-center rounded-lg ${OBJECT_ICON.priceBook}`}
      count={books.length}
      actions={<CreatePriceBookForm />}
      columns={[
        { key: "name", label: "Price Book Name" },
        { key: "type", label: "Type" },
        { key: "active", label: "Active" },
      ]}
      rows={books.map((book) => ({
        id: book.id,
        href: `/outreach/price-books/${book.id}`,
        searchText: `${book.name} ${book.description ?? ""}`,
        cells: {
          name: book.name,
          type: book.isStandard ? "Standard" : "Custom",
          active: book.isActive ? "Active" : "Inactive",
        },
      }))}
    />
  );
}
