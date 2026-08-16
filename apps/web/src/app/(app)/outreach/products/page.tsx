/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Package } from "lucide-react";
import { requireUser } from "@/lib/rbac";
import { ensureCatalogSeeded } from "@/modules/outreach/actions";
import { CreateProductForm } from "@/modules/outreach/components/create-dialogs";
import { ListWorkspace } from "@/modules/outreach/components/list-workspace";
import { formatMoney, labelFor, CONTEXT_LEVELS, OBJECT_ICON } from "@/modules/outreach/lib/stages";
import { listProducts } from "@/modules/outreach/queries";

export default async function ProductsPage() {
  await requireUser();
  await ensureCatalogSeeded();
  const products = await listProducts();
  return (
    <ListWorkspace
      objectLabel="Products"
      viewName="All Products"
      icon={<Package className="size-5" />}
      iconClass={`flex size-10 items-center justify-center rounded-lg ${OBJECT_ICON.product}`}
      count={products.length}
      actions={<CreateProductForm />}
      columns={[
        { key: "name", label: "Product Name" },
        { key: "code", label: "Code" },
        { key: "family", label: "Family" },
        { key: "price", label: "List Price" },
        { key: "hours", label: "Hours" },
        { key: "context", label: "Context" },
        { key: "active", label: "Active" },
      ]}
      rows={products.map((product) => ({
        id: product.id,
        href: `/outreach/products/${product.id}`,
        searchText: `${product.name} ${product.productCode ?? ""} ${product.family ?? ""}`,
        cells: {
          name: product.name,
          code: product.productCode ?? "—",
          family: product.family ?? "—",
          price: formatMoney(product.defaultUnitPriceCents),
          hours: String(product.defaultHours),
          context: labelFor(CONTEXT_LEVELS, product.defaultContext),
          active: product.isActive ? "Active" : "Inactive",
        },
      }))}
    />
  );
}
