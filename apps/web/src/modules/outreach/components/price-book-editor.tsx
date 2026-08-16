"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addPriceBookEntry, removePriceBookEntry } from "../actions";
import { CONTEXT_LEVELS, formatMoney, labelFor, type ContextLevel } from "../lib/stages";

export function PriceBookEntries({
  priceBookId,
  entries,
  availableProducts,
}: {
  priceBookId: string;
  entries: {
    entry: { id: string; hours: number; unitPriceCents: number; contextLevel: ContextLevel };
    product: { id: string; name: string; productCode: string | null };
  }[];
  availableProducts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const unused = availableProducts.filter((product) => !entries.some((row) => row.product.id === product.id));

  return (
    <div className="grid gap-3">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Product</th>
            <th className="w-20 whitespace-nowrap py-1.5 pr-3 font-medium">Hours</th>
            <th className="w-28 whitespace-nowrap py-1.5 pr-3 font-medium">List price</th>
            <th className="whitespace-nowrap py-1.5 pr-3 font-medium">Context</th>
            <th className="w-10 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {entries.map((row) => (
            <tr key={row.entry.id} className="border-t border-border">
              <td className="py-2.5 pr-3">
                <div className="font-medium">{row.product.name}</div>
                {row.product.productCode ? (
                  <div className="text-xs text-muted-foreground">{row.product.productCode}</div>
                ) : null}
              </td>
              <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums">{row.entry.hours}</td>
              <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums">{formatMoney(row.entry.unitPriceCents)}</td>
              <td className="py-2.5 pr-3 text-muted-foreground">{labelFor(CONTEXT_LEVELS, row.entry.contextLevel)}</td>
              <td className="py-2.5 text-right">
                <button
                  type="button"
                  className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Remove ${row.product.name}`}
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      await removePriceBookEntry(row.entry.id);
                      router.refresh();
                    });
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-muted-foreground">
                No products in this price book yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {unused.length > 0 && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(async () => {
              try {
                await addPriceBookEntry({
                  priceBookId,
                  catalogItemId: String(data.get("catalogItemId") ?? ""),
                });
                toast.success("Product added");
                router.refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not add product");
              }
            });
          }}
        >
          <label className="grid gap-1 text-xs">
            Add product
            <select name="catalogItemId" required className="h-8 max-w-full min-w-48 rounded-md border bg-transparent px-2 text-sm">
              {unused.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" size="sm" disabled={pending}>
            Add
          </Button>
        </form>
      )}
    </div>
  );
}
