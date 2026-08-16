/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { BookOpen, Package } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { EditProductButton } from "@/modules/outreach/components/edit-record";
import { DetailField, DetailsPanel, RecordWorkspace } from "@/modules/outreach/components/record-workspace";
import { CONTEXT_LEVELS, OBJECT_ICON, formatMoney, labelFor } from "@/modules/outreach/lib/stages";
import { getProduct, listProductPriceBooks } from "@/modules/outreach/queries";

export default async function ProductDetailPage(props: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await props.params;
  const product = await getProduct(id);
  if (!product) notFound();
  const books = await listProductPriceBooks(id);

  return (
    <RecordWorkspace
      objectLabel="Product"
      title={product.name}
      icon={<Package className="size-5" />}
      iconClass={OBJECT_ICON.product}
      actions={<EditProductButton product={product} />}
      highlights={[
        { label: "Product Code", value: product.productCode },
        { label: "Family", value: product.family },
        { label: "List Price", value: formatMoney(product.defaultUnitPriceCents) },
        { label: "Active", value: product.isActive ? "Active" : "Inactive" },
      ]}
      details={
        <DetailsPanel title="Product Information" edit={<EditProductButton product={product} placement="details" />}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Product Name" value={product.name} />
            <DetailField label="Product Code" value={product.productCode} />
            <DetailField label="Family" value={product.family} />
            <DetailField label="Hours" value={String(product.defaultHours)} />
            <DetailField label="List Price" value={formatMoney(product.defaultUnitPriceCents)} />
            <DetailField label="Contextualization" value={labelFor(CONTEXT_LEVELS, product.defaultContext)} />
            <div className="sm:col-span-2">
              <dt className="text-[11px] text-muted-foreground">Description</dt>
              <dd className="whitespace-pre-wrap text-sm">{product.description || "—"}</dd>
            </div>
          </dl>
        </DetailsPanel>
      }
      related={[
        {
          title: "Price Books",
          count: books.length,
          icon: <BookOpen className="size-4 text-primary" />,
          children: (
            <ul className="grid gap-1 text-sm">
              {books.map((row) => (
                <li key={row.book.id}>
                  <Link href={`/outreach/price-books/${row.book.id}`} className="text-primary hover:underline">
                    {row.book.name} · {formatMoney(row.entry.unitPriceCents)}
                  </Link>
                </li>
              ))}
              {books.length === 0 && <li className="text-muted-foreground">Not in any price book yet.</li>}
            </ul>
          ),
        },
      ]}
    />
  );
}
