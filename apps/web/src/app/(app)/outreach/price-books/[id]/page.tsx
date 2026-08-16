/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { BookOpen, Package } from "lucide-react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { ensureCatalogSeeded } from "@/modules/outreach/actions";
import { EditPriceBookButton } from "@/modules/outreach/components/edit-record";
import { PriceBookEntries } from "@/modules/outreach/components/price-book-editor";
import { DetailField, DetailsPanel, RecordWorkspace } from "@/modules/outreach/components/record-workspace";
import { OBJECT_ICON } from "@/modules/outreach/lib/stages";
import { getPriceBook, listProducts } from "@/modules/outreach/queries";

export default async function PriceBookDetailPage(props: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureCatalogSeeded();
  const { id } = await props.params;
  const row = await getPriceBook(id);
  if (!row) notFound();
  const products = await listProducts();

  return (
    <RecordWorkspace
      objectLabel="Price Book"
      title={row.book.name}
      icon={<BookOpen className="size-5" />}
      iconClass={OBJECT_ICON.priceBook}
      actions={<EditPriceBookButton book={row.book} />}
      highlights={[
        { label: "Type", value: row.book.isStandard ? "Standard" : "Custom" },
        { label: "Active", value: row.book.isActive ? "Active" : "Inactive" },
        { label: "Products", value: String(row.entries.length) },
        { label: "Description", value: row.book.description },
      ]}
      details={
        <DetailsPanel title="Price Book Information" edit={<EditPriceBookButton book={row.book} placement="details" />}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Price Book Name" value={row.book.name} />
            <DetailField label="Type" value={row.book.isStandard ? "Standard" : "Custom" } />
            <div className="sm:col-span-2">
              <dt className="text-[11px] text-muted-foreground">Description</dt>
              <dd className="whitespace-pre-wrap text-sm">{row.book.description || "—"}</dd>
            </div>
          </dl>
        </DetailsPanel>
      }
      related={[
        {
          title: "Products",
          count: row.entries.length,
          wide: true,
          icon: <Package className="size-4 text-primary" />,
          children: (
            <PriceBookEntries
              priceBookId={row.book.id}
              entries={row.entries}
              availableProducts={products.filter((product) => product.isActive)}
            />
          ),
        },
      ]}
    />
  );
}
