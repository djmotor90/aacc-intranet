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
import { Input } from "@/components/ui/input";
import { addOpportunityLine, addQuoteLine, removeOpportunityLine, removeQuoteLine } from "../actions";
import { CONTEXT_LEVELS, formatMoney, lineTotalCents, type ContextLevel } from "../lib/stages";

type Line = {
  id: string;
  name: string;
  quantity: number;
  hours: number;
  unitPriceCents: number;
  contextLevel: ContextLevel;
};

export function OpportunityLines({
  opportunityId,
  lines,
  catalog,
}: {
  opportunityId: string;
  lines: Line[];
  catalog: { id: string; name: string; defaultHours: number; defaultUnitPriceCents: number; defaultContext: ContextLevel }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const total = lines.reduce((sum, line) => sum + lineTotalCents(line.quantity, line.unitPriceCents), 0);

  return (
    <section className="rounded-2xl border bg-card p-4" aria-labelledby="products-heading">
      <div className="flex items-center justify-between">
        <h2 id="products-heading" className="text-sm font-semibold">
          Products ({lines.length})
        </h2>
        <span className="text-sm font-medium">{formatMoney(total)}</span>
      </div>
      <LineTable
        lines={lines}
        pending={pending}
        onRemove={(id) => {
          startTransition(async () => {
            await removeOpportunityLine(id);
            router.refresh();
          });
        }}
      />
      <AddLine
        catalog={catalog}
        pending={pending}
        onAdd={(input) => {
          startTransition(async () => {
            try {
              await addOpportunityLine({ opportunityId, ...input });
              router.refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not add product");
            }
          });
        }}
      />
    </section>
  );
}

export function QuoteLinesEditor({
  quoteId,
  lines,
  catalog,
}: {
  quoteId: string;
  lines: Line[];
  catalog: { id: string; name: string; defaultHours: number; defaultUnitPriceCents: number; defaultContext: ContextLevel }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const total = lines.reduce((sum, line) => sum + lineTotalCents(line.quantity, line.unitPriceCents), 0);
  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Quote lines</h2>
        <span className="text-sm font-medium">{formatMoney(total)}</span>
      </div>
      <LineTable
        lines={lines}
        pending={pending}
        onRemove={(id) => {
          startTransition(async () => {
            await removeQuoteLine(id);
            router.refresh();
          });
        }}
      />
      <AddLine
        catalog={catalog}
        pending={pending}
        onAdd={(input) => {
          startTransition(async () => {
            await addQuoteLine({ quoteId, ...input });
            router.refresh();
          });
        }}
      />
    </section>
  );
}

function LineTable({
  lines,
  pending,
  onRemove,
}: {
  lines: Line[];
  pending: boolean;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="mt-3 overflow-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1 font-medium">Name</th>
            <th className="py-1 font-medium">Qty</th>
            <th className="py-1 font-medium">Hours</th>
            <th className="py-1 font-medium">Context</th>
            <th className="py-1 font-medium">Price</th>
            <th className="py-1 font-medium"> </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-t">
              <td className="py-2 pr-2">{line.name}</td>
              <td className="py-2">{line.quantity}</td>
              <td className="py-2">{line.hours}</td>
              <td className="py-2 capitalize">{line.contextLevel}</td>
              <td className="py-2">{formatMoney(lineTotalCents(line.quantity, line.unitPriceCents))}</td>
              <td className="py-2 text-right">
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Remove ${line.name}`}
                  className="rounded-full p-1 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(line.id)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-muted-foreground">
                No products yet. Add a catalog item below.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AddLine({
  catalog,
  pending,
  onAdd,
}: {
  catalog: { id: string; name: string; defaultHours: number; defaultUnitPriceCents: number; defaultContext: ContextLevel }[];
  pending: boolean;
  onAdd: (input: {
    catalogItemId?: string | null;
    name: string;
    quantity: number;
    hours: number;
    unitPriceCents: number;
    contextLevel: ContextLevel;
  }) => void;
}) {
  return (
    <form
      className="mt-4 grid gap-2 sm:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const catalogId = String(data.get("catalogItemId") ?? "");
        const item = catalog.find((c) => c.id === catalogId);
        const name = String(data.get("name") ?? "") || item?.name || "";
        onAdd({
          catalogItemId: catalogId || null,
          name,
          quantity: Number(data.get("quantity") || 1),
          hours: Number(data.get("hours") || item?.defaultHours || 0),
          unitPriceCents: String(data.get("price") ?? "").trim()
            ? Math.round(Number(data.get("price")) * 100)
            : (item?.defaultUnitPriceCents ?? 0),
          contextLevel: (String(data.get("contextLevel") || item?.defaultContext || "none") as ContextLevel),
        });
        e.currentTarget.reset();
      }}
    >
      <select name="catalogItemId" className="h-8 rounded-md border bg-transparent px-2 text-sm sm:col-span-2" aria-label="Catalog item" defaultValue="">
        <option value="">Custom line</option>
        {catalog.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <Input name="name" placeholder="Name" aria-label="Line name" className="sm:col-span-2" />
      <Input name="quantity" type="number" min={1} defaultValue={1} aria-label="Quantity" />
      <Input name="hours" type="number" min={0} placeholder="Hours" aria-label="Hours" />
      <Input name="price" type="number" min={0} step="0.01" placeholder="Unit $" aria-label="Unit price" />
      <select name="contextLevel" className="h-8 rounded-md border bg-transparent px-2 text-sm" aria-label="Contextualization" defaultValue="none">
        {CONTEXT_LEVELS.map((level) => (
          <option key={level.id} value={level.id}>
            {level.label}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={pending} className="sm:col-span-6 w-fit">
        Add line
      </Button>
    </form>
  );
}
